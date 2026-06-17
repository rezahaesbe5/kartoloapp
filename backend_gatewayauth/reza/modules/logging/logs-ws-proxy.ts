// WebSocket proxy: gateway terima koneksi WS dari browser, validate ticket
// (one-shot Redis), lalu buka upstream WS ke backend_administration sambil
// mengirim X-Internal-Token + X-Forwarded-* header. Frame dipipe dua arah.
//
// Endpoint: GET /api/v1/logs/ws?ticket=<token>
// Signature gateway-guard di-skip (WHITELIST_PATHS) — auth via ticket.

import websocketPlugin from '@fastify/websocket';
import type { FastifyInstance } from 'fastify';
import WebSocket from 'ws';
import { env } from '../../../src/shared/config/env.js';
import { consumeWsTicket } from './ws-ticket.service.js';

function adminWsBase(): string {
  // ADMIN_BASE_URL = http://host:port → ws://host:port (atau wss bila https).
  const u = new URL(env.ADMIN_BASE_URL);
  u.protocol = u.protocol === 'https:' ? 'wss:' : 'ws:';
  return u.toString().replace(/\/+$/, '');
}

export async function registerLogsWsProxy(app: FastifyInstance): Promise<void> {
  // Register WS plugin sekali per app scope. Idempoten dr sisi fastify.
  const ws = (app as unknown as { websocketServer?: unknown });
  if (!ws.websocketServer) {
    await app.register(websocketPlugin);
  }

  app.get('/api/v1/logs/ws', { websocket: true }, async (socket, req) => {
    // Ambil ticket dari query.
    const q = (req.query ?? {}) as Record<string, string | undefined>;
    const ticketStr = q.ticket ?? '';
    const ticket = await consumeWsTicket(ticketStr);
    if (!ticket) {
      try {
        socket.send(JSON.stringify({ type: 'error', message: 'ticket invalid atau kadaluarsa' }));
      } catch {
        // ignore
      }
      socket.close(4401, 'ticket_invalid');
      return;
    }

    // Bangun URL upstream dengan param yang sudah di-canonicalize dari ticket.
    const upstreamUrl = new URL('/internal/logs/ws', adminWsBase());
    upstreamUrl.searchParams.set('source_app', ticket.source_app);
    upstreamUrl.searchParams.set('date', ticket.date);
    upstreamUrl.searchParams.set('filters', JSON.stringify(ticket.filters));

    const upstream = new WebSocket(upstreamUrl.toString(), {
      headers: {
        'X-Internal-Token': env.INTERNAL_WS_SECRET,
        'X-Forwarded-User-Id': ticket.user_id,
        'X-Forwarded-User-Type': ticket.user_type,
        'X-Forwarded-Email': ticket.email,
        'X-Forwarded-Full-Name': ticket.full_name,
        'X-Forwarded-Session-Id': ticket.session_id,
        ...(ticket.client_id ? { 'X-Forwarded-Client-Id': ticket.client_id } : {}),
      },
    });

    let closing = false;
    function shutdown(code = 1000, reason = 'normal'): void {
      if (closing) return;
      closing = true;
      try {
        if (socket.readyState === socket.OPEN) socket.close(code, reason);
      } catch {
        // ignore
      }
      try {
        if (upstream.readyState === WebSocket.OPEN) upstream.close(code, reason);
      } catch {
        // ignore
      }
    }

    upstream.on('open', () => {
      // Sinyal ke client bahwa upstream siap (frame extra info).
      try {
        socket.send(JSON.stringify({ type: 'upstream_open' }));
      } catch {
        // ignore
      }
    });
    upstream.on('message', (data, isBinary) => {
      if (socket.readyState !== socket.OPEN) return;
      try {
        socket.send(data, { binary: isBinary });
      } catch {
        // ignore
      }
    });
    upstream.on('close', (code, reason) => {
      shutdown(code, reason?.toString() ?? 'upstream_close');
    });
    upstream.on('error', () => {
      try {
        socket.send(JSON.stringify({ type: 'error', message: 'upstream unreachable' }));
      } catch {
        // ignore
      }
      shutdown(1011, 'upstream_error');
    });

    socket.on('message', (data, isBinary) => {
      if (upstream.readyState !== WebSocket.OPEN) return;
      try {
        upstream.send(data, { binary: isBinary });
      } catch {
        // ignore
      }
    });
    socket.on('close', () => shutdown());
    socket.on('error', () => shutdown(1011, 'client_error'));
  });
}
