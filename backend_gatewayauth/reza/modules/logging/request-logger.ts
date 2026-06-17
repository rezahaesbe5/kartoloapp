// Hook global untuk mencatat setiap transaksi request/response ke file harian.
//  - onRequest : tandai waktu mulai.
//  - onSend    : rakit record lengkap (header, body, response, error), redaksi,
//                cap + sampling, lalu tulis async (fire-and-forget).

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { env } from '../../../src/shared/config/env.js';
import { deriveActionFromPath, flushAudit } from './audit.service.js';
import { backendWriter } from './log-writer.js';
import { capValue, redactBody, redactHeaders } from './redact.js';

declare module 'fastify' {
  interface FastifyRequest {
    logStartHr?: bigint;
    logTsRequest?: string;
  }
}

// Path yang tidak dicatat: hanya health/ready (noise probe). Endpoint lain
// — termasuk /api/v1/logs/* — dicatat penuh (file + DB).
const SKIP_PATHS = new Set<string>(['/health', '/ready']);

interface ParsedResponse {
  body: unknown;
  errorData: unknown;
  rc: string | null;
}

function parseResponsePayload(payload: unknown): ParsedResponse {
  if (typeof payload === 'string') {
    const trimmed = payload.trim();
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed) as Record<string, unknown>;
        return {
          body: parsed,
          errorData: parsed?.error ?? null,
          rc: typeof parsed?.rc === 'string' ? parsed.rc : null,
        };
      } catch {
        // bukan JSON valid — jatuh ke bawah
      }
    }
    return { body: { _raw: trimmed.slice(0, 500) }, errorData: null, rc: null };
  }
  if (payload == null) return { body: null, errorData: null, rc: null };
  // Buffer / stream — jangan log isinya.
  return { body: { _type: 'non-json' }, errorData: null, rc: null };
}

function extractUserData(req: FastifyRequest): unknown {
  const s = req.session;
  if (!s) return null;
  return {
    user_id: s.user_id,
    email: s.email,
    full_name: s.full_name,
    user_type: s.user_type,
  };
}

function recordTransaction(
  req: FastifyRequest,
  reply: FastifyReply,
  payload: unknown,
): void {
  const pathOnly = req.url.split('?')[0] ?? '';
  if (SKIP_PATHS.has(pathOnly)) return;

  const status = reply.statusCode;

  // Sampling: hanya GET sukses (2xx) yang di-sample — itu sumber volume utama.
  // Mutasi (POST/PATCH/PUT/DELETE) & semua error/non-2xx selalu dicatat 100%
  // agar aksi penting (login, ubah data) tidak pernah hilang dari log.
  if (
    req.method === 'GET' &&
    status >= 200 &&
    status < 400 &&
    Math.random() > env.LOG_SAMPLE_SUCCESS_RATE
  ) {
    return;
  }

  const tsResponse = new Date().toISOString();
  const durationMs =
    req.logStartHr != null
      ? Math.round(Number(process.hrtime.bigint() - req.logStartHr) / 1e3) / 1e3
      : null;

  const { body: responseBody, errorData, rc } = parseResponsePayload(payload);
  const level = status >= 500 ? 'error' : status >= 400 ? 'warn' : 'info';
  const action = req.auditEntry?.action ?? deriveActionFromPath(pathOnly);
  const messageLabel =
    status >= 200 && status < 400 ? 'berhasil' : status >= 500 ? 'error' : 'gagal';
  let messageDetail: string | null = null;
  if (responseBody && typeof responseBody === 'object') {
    const obj = responseBody as Record<string, unknown>;
    if (typeof obj.message === 'string' && obj.message.length > 0) messageDetail = obj.message;
    else if (obj.error && typeof obj.error === 'object') {
      const err = obj.error as Record<string, unknown>;
      if (typeof err.code === 'string') messageDetail = err.code;
    }
  }
  const message = `${messageLabel}: ${messageDetail ?? `HTTP ${status}`}`;

  backendWriter.write({
    source: 'backend',
    app: env.APP_ID,
    trace_id: (req.id as string) ?? null,
    level,
    ts_request: req.logTsRequest ?? tsResponse,
    ts_response: tsResponse,
    duration_ms: durationMs,
    method: req.method,
    action,
    endpoint: pathOnly,
    message,
    status,
    rc,
    ip: req.ip,
    user_agent: req.headers['user-agent'] ?? null,
    user_data: extractUserData(req),
    client_id: req.gwClient?.clientId ?? null,
    request_header: redactHeaders(req.headers as Record<string, unknown>),
    request_body: capValue(redactBody(req.body ?? null)),
    response_body: capValue(redactBody(responseBody)),
    error_data: errorData ?? null,
  });
}

export function registerRequestLogger(app: FastifyInstance): void {
  app.addHook('onRequest', async (req) => {
    req.logStartHr = process.hrtime.bigint();
    req.logTsRequest = new Date().toISOString();
  });

  app.addHook('onSend', async (req, reply, payload) => {
    const pathOnly = req.url.split('?')[0] ?? '';
    if (SKIP_PATHS.has(pathOnly)) return payload;
    try {
      recordTransaction(req, reply, payload);
    } catch {
      // logging tidak boleh pernah mengganggu response
    }
    try {
      flushAudit(req, payload, reply.statusCode);
    } catch {
      // audit tidak boleh pernah mengganggu response
    }
    return payload;
  });
}
