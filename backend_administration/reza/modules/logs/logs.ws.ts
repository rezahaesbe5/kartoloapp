// WebSocket handler untuk live tail log. Diakses HANYA via gateway sebagai
// upstream — gateway memvalidasi user (ticket Redis) lalu buka WS ke endpoint
// ini sambil mengirim X-Internal-Token (shared secret).
//
// Endpoint internal: GET /internal/logs/ws
// Query: source_app, date, filters (JSON encoded)
// Header wajib: X-Internal-Token = env.INTERNAL_WS_SECRET
//
// Setiap entry baru dikirim sebagai JSON frame:
//   { type: "entry", ts, labels, record }
//   { type: "hb" }   — heartbeat tiap 15 dtk
//   { type: "error", message }

import websocketPlugin from '@fastify/websocket';
import type { FastifyInstance } from 'fastify';
import { env } from '../../../src/shared/config/env.js';
import { streamTick } from './logs.service.js';
import { FILTER_KEYS, FILTER_OPS, type FilterRow } from './filter.js';
import { SourceAppEnum } from './logs.schema.js';

const MS_TO_NS = 1_000_000n;

function safeParseFilters(raw: string | null): FilterRow[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw) as unknown;
    if (!Array.isArray(v)) return [];
    const out: FilterRow[] = [];
    for (const r of v) {
      if (!r || typeof r !== 'object') continue;
      const obj = r as Record<string, unknown>;
      const key = String(obj.key ?? '');
      const op = String(obj.op ?? '');
      const value = String(obj.value ?? '');
      const connRaw = obj.connector;
      const connector = connRaw === 'OR' || connRaw === 'AND' ? connRaw : undefined;
      if (!(FILTER_KEYS as readonly string[]).includes(key)) continue;
      if (!(FILTER_OPS as readonly string[]).includes(op)) continue;
      out.push({
        key: key as FilterRow['key'],
        op: op as FilterRow['op'],
        value,
        connector,
      });
    }
    return out.slice(0, 20);
  } catch {
    return [];
  }
}

export async function registerLogsWs(app: FastifyInstance): Promise<void> {
  // Plugin @fastify/websocket di-register sekali di scope app utama.
  const ws = (app as unknown as { websocketServer?: unknown });
  if (!ws.websocketServer) {
    await app.register(websocketPlugin);
  }

  app.get('/internal/logs/ws', { websocket: true }, (socket, req) => {
    // ---- Validate shared secret header ---------------------------------
    const token = req.headers['x-internal-token'];
    const expected = env.INTERNAL_WS_SECRET;
    const ok = typeof token === 'string' && token === expected;
    if (!ok) {
      try {
        socket.send(JSON.stringify({ type: 'error', message: 'invalid internal token' }));
      } catch {
        // ignore
      }
      socket.close(4401, 'internal_token_invalid');
      return;
    }

    // ---- Parse query ---------------------------------------------------
    const q = (req.query ?? {}) as Record<string, string | undefined>;
    const sourceAppParsed = SourceAppEnum.safeParse(q.source_app);
    if (!sourceAppParsed.success) {
      socket.send(JSON.stringify({ type: 'error', message: 'source_app invalid' }));
      socket.close(4400, 'source_app_invalid');
      return;
    }
    const date = q.date ?? '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      socket.send(JSON.stringify({ type: 'error', message: 'date invalid' }));
      socket.close(4400, 'date_invalid');
      return;
    }
    const filters = safeParseFilters(q.filters ?? null);

    // ---- Loop polling Loki --------------------------------------------
    let closed = false;
    let cursorNs = (BigInt(Date.now()) * MS_TO_NS).toString();
    socket.send(JSON.stringify({ type: 'open', cursor: cursorNs }));

    const hbInterval = setInterval(() => {
      if (closed) return;
      try {
        socket.send(JSON.stringify({ type: 'hb' }));
      } catch {
        // ignore
      }
    }, 15_000);

    socket.on('close', () => {
      closed = true;
      clearInterval(hbInterval);
    });

    socket.on('error', () => {
      closed = true;
      clearInterval(hbInterval);
    });

    void (async () => {
      while (!closed) {
        await new Promise((r) => setTimeout(r, 2_000));
        if (closed) break;
        const nowNs = (BigInt(Date.now()) * MS_TO_NS).toString();
        try {
          const entries = await streamTick({
            sourceApp: sourceAppParsed.data,
            filters,
            startNs: cursorNs,
            endNs: nowNs,
          });
          for (const e of entries) {
            if (closed) break;
            try {
              socket.send(
                JSON.stringify({ type: 'entry', ts: e.ts, labels: e.labels, record: e.record }),
              );
            } catch {
              // ignore single send error
            }
            if (BigInt(e.ts) >= BigInt(cursorNs)) {
              cursorNs = (BigInt(e.ts) + 1n).toString();
            }
          }
        } catch (err) {
          if (closed) break;
          try {
            socket.send(
              JSON.stringify({ type: 'error', message: (err as Error).message ?? 'loki error' }),
            );
          } catch {
            // ignore
          }
          cursorNs = nowNs;
        }
      }
    })();
  });
}
