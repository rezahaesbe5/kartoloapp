// Forwarding gateway → backend tujuan.
//
// Client tetap hanya hit backend_gatewayauth. Untuk endpoint yang punya
// mst_endpoint.backend_url, request diteruskan ke base URL itu. Validasi
// timestamp/signature/active sudah dilakukan gatewayGuard (preHandler global);
// validasi auth dilakukan di sini bila mst_endpoint.auth_flag = true.

import type { FastifyReply, FastifyRequest } from 'fastify';
import { AppError } from '../../../src/shared/errors/app-error.js';
import { authRequired } from '../../../src/shared/middleware/auth-required.js';

const FORWARD_TIMEOUT_MS = 15_000;

/**
 * preHandler catch-all: jalan setelah gatewayGuard (yang sudah set req.gwEndpoint).
 * Pastikan endpoint ini memang endpoint forward, lalu jalankan validasi auth
 * sesuai flag — "validasi auth tetap dilakukan gateway".
 */
export async function forwardPreHandler(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const endpoint = req.gwEndpoint;
  if (!endpoint?.backendUrl) {
    // Bukan endpoint forward, dan tidak ada route lokal yang match.
    throw new AppError('not_found', {
      message: 'Endpoint tidak ditemukan',
      code: 'ROUTE_NOT_FOUND',
      details: { method: req.method, url: req.url },
    });
  }
  if (endpoint.authFlag) {
    // Verify JWT + cek session Redis, lampirkan req.session.
    await authRequired(req, reply);
  }
}

/** Handler catch-all: teruskan request ke backend tujuan, relay response apa adanya. */
export async function forwardHandler(req: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
  const base = (req.gwEndpoint?.backendUrl ?? '').replace(/\/+$/, '');
  const target = `${base}${req.url}`;

  // Header dibangun fresh — header signature client & Authorization TIDAK
  // diteruskan. Konteks request di-inject lewat X-Forwarded-*.
  const headers: Record<string, string> = { accept: 'application/json' };
  const ua = req.headers['user-agent'];
  if (typeof ua === 'string') headers['user-agent'] = ua;

  headers['x-forwarded-trace-id'] = req.id as string;
  headers['x-forwarded-for'] = req.ip;
  if (req.gwClient?.clientId) headers['x-forwarded-client-id'] = req.gwClient.clientId;

  const session = req.session;
  if (session) {
    headers['x-forwarded-user-id'] = session.user_id;
    headers['x-forwarded-user-type'] = session.user_type;
    headers['x-forwarded-email'] = session.email;
    headers['x-forwarded-full-name'] = session.full_name;
    headers['x-forwarded-session-id'] = session.session_id;
  }

  let body: string | undefined;
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    body = req.rawBody ?? '';
    if (body.length > 0) headers['content-type'] = 'application/json';
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FORWARD_TIMEOUT_MS);
  let upstream: Response;
  try {
    upstream = await fetch(target, {
      method: req.method,
      headers,
      body,
      signal: controller.signal,
    });
  } catch (err) {
    req.log.error({ err, target }, 'Forwarding ke backend tujuan gagal');
    throw new AppError('app_close', {
      message: 'Backend tujuan sedang tidak tersedia. Coba lagi nanti.',
      code: 'UPSTREAM_UNAVAILABLE',
      cause: err,
    });
  } finally {
    clearTimeout(timer);
  }

  const text = await upstream.text();
  const contentType = upstream.headers.get('content-type') ?? 'application/json';
  return reply.status(upstream.status).header('content-type', contentType).send(text);
}
