// Hook global onRequest/onSend untuk mencatat setiap request ke file harian
// + tabel audit_logs. Service ini hanya menerima trafik via gateway, jadi
// identitas user/client diambil dari header X-Forwarded-* yang di-inject gateway.

import type { Prisma } from '@prisma/client';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { env } from '../../../src/shared/config/env.js';
import { prisma } from '../../../src/shared/lib/prisma.js';
import { backendWriter } from './log-writer.js';
import { capValue, redactBody, redactHeaders } from './redact.js';

declare module 'fastify' {
  interface FastifyRequest {
    logStartHr?: bigint;
    logTsRequest?: string;
  }
}

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
        // bukan JSON valid
      }
    }
    return { body: { _raw: trimmed.slice(0, 500) }, errorData: null, rc: null };
  }
  if (payload == null) return { body: null, errorData: null, rc: null };
  return { body: { _type: 'non-json' }, errorData: null, rc: null };
}

function headerStr(req: FastifyRequest, name: string): string | null {
  const v = req.headers[name];
  if (typeof v === 'string' && v.length > 0) return v;
  return null;
}

function extractForwardedUser(req: FastifyRequest): Record<string, unknown> | null {
  const userId = headerStr(req, 'x-forwarded-user-id');
  const userType = headerStr(req, 'x-forwarded-user-type');
  const email = headerStr(req, 'x-forwarded-email');
  const fullName = headerStr(req, 'x-forwarded-full-name');
  const sessionId = headerStr(req, 'x-forwarded-session-id');
  if (!userId && !userType && !email && !fullName) return null;
  return {
    user_id: userId,
    user_type: userType,
    email,
    full_name: fullName,
    session_id: sessionId,
  };
}

const asJson = (v: unknown): Prisma.InputJsonValue | undefined =>
  (v ?? undefined) as Prisma.InputJsonValue | undefined;

// Derive action dari path URL (default bila tidak ada writeAudit semantic).
// Mirror dari backend_gatewayauth/reza/modules/logging/audit.service.ts.
function deriveActionFromPath(urlPath: string): string {
  const pathOnly = (urlPath.split('?')[0] ?? '').trim();
  const stripped = pathOnly
    .replace(/^\/api\/v\d+\//, '')
    .replace(/^\/api\//, '')
    .replace(/^\/+/, '')
    .replace(/\/+$/, '');
  if (!stripped) return 'root';
  return stripped.replace(/\//g, '.');
}

function deriveMessage(status: number, parsed: unknown): string {
  const label = status >= 200 && status < 400 ? 'berhasil' : status >= 500 ? 'error' : 'gagal';
  let detail: string | null = null;
  if (parsed && typeof parsed === 'object') {
    const obj = parsed as Record<string, unknown>;
    if (typeof obj.message === 'string' && obj.message.length > 0) {
      detail = obj.message;
    } else if (obj.error && typeof obj.error === 'object') {
      const err = obj.error as Record<string, unknown>;
      if (typeof err.code === 'string') detail = err.code;
    }
  }
  return `${label}: ${detail ?? `HTTP ${status}`}`;
}

function recordTransaction(
  req: FastifyRequest,
  reply: FastifyReply,
  payload: unknown,
): void {
  const status = reply.statusCode;

  // Sampling untuk FILE: GET 2xx di-sample. Mutasi & error 100%.
  // DB di-skip untuk OPTIONS (preflight CORS, noise); file tetap.
  const sampleFile =
    !(req.method === 'GET' && status >= 200 && status < 400) ||
    Math.random() <= env.LOG_SAMPLE_SUCCESS_RATE;

  const tsResponse = new Date().toISOString();
  const durationMs =
    req.logStartHr != null
      ? Math.round(Number(process.hrtime.bigint() - req.logStartHr) / 1e3) / 1e3
      : null;

  const { body: responseBody, errorData, rc } = parseResponsePayload(payload);
  const level = status >= 500 ? 'error' : status >= 400 ? 'warn' : 'info';

  const endpoint = (req.url.split('?')[0] ?? '').trim() || '/';
  const action = deriveActionFromPath(endpoint);
  const message = deriveMessage(status, responseBody);
  const redactedHeaders = redactHeaders(req.headers as Record<string, unknown>);
  const redactedReqBody = capValue(redactBody(req.body ?? null));
  const redactedResBody = capValue(redactBody(responseBody));
  const userData = extractForwardedUser(req);
  const clientId = headerStr(req, 'x-forwarded-client-id');
  const userId = headerStr(req, 'x-forwarded-user-id');

  if (sampleFile) {
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
      endpoint,
      message,
      status,
      rc,
      ip: req.ip,
      user_agent: req.headers['user-agent'] ?? null,
      user_data: userData,
      client_id: clientId,
      request_header: redactedHeaders,
      request_body: redactedReqBody,
      response_body: redactedResBody,
      error_data: errorData ?? null,
    });
  }

  // DB write — fire-and-forget. Skip OPTIONS supaya tabel tidak bengkak.
  if (req.method === 'OPTIONS') return;
  // Endpoint /api/v1/logs/* adalah noise operasional. File tetap (di atas),
  // DB di-skip total.
  if (action.startsWith('logs.')) return;

  prisma.auditLog
    .create({
      data: {
        traceId: (req.id as string) ?? null,
        sourceApp: env.APP_ID,
        userId,
        clientId,
        action,
        endpoint,
        method: req.method,
        message,
        requestHeader: asJson(redactedHeaders),
        requestBody: asJson(redactedReqBody),
        responseBody: asJson(redactedResBody),
        userData: asJson(userData),
        ip: req.ip ?? null,
        userAgent: req.headers['user-agent'] ?? null,
      },
    })
    .catch((err: unknown) => {
      console.error('[audit-admin] gagal menulis audit log:', (err as Error).message);
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
    return payload;
  });
}
