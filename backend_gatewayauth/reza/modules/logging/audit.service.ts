// Audit trail / transaction log → tabel gateway_auth.audit_logs (Postgres).
//
// Pola "deferred audit": writeAudit() menandai request dgn action SEMANTIC
// (mis. auth.login.success). flushAudit() — dipanggil dari hook onSend
// (request-logger) — menulis 1 row ke audit_logs untuk setiap request kecuali:
//   - METHOD = OPTIONS (preflight CORS, noise) → skip DB; file tetap.
//   - path = /health|/ready → skip total (sudah disaring di request-logger).
// Action default = endpoint dot-notation (mis. "auth.captcha",
// "administration.audit.list"); writeAudit() override action jadi semantic
// (mis. "auth.login.success"). Penulisan fire-and-forget.

import type { Prisma } from '@prisma/client';
import type { FastifyRequest } from 'fastify';
import { env } from '../../../src/shared/config/env.js';
import { prisma } from '../../../src/shared/lib/prisma.js';
import { capValue, redactBody, redactHeaders } from './redact.js';

export interface AuditInput {
  action: string;
  userId?: string | null;
  /** Identitas user dari konteks login/akses token. Bila kosong, di-fallback ke req.session. */
  userData?: Record<string, unknown> | null;
}

declare module 'fastify' {
  interface FastifyRequest {
    auditEntry?: AuditInput;
  }
}

/** Tandai request ini perlu masuk audit trail. Record dirakit nanti di flushAudit(). */
export function writeAudit(req: FastifyRequest, input: AuditInput): void {
  req.auditEntry = input;
}

// Identitas user dari session (untuk request yang sudah terautentikasi).
function extractUserData(req: FastifyRequest): Record<string, unknown> | null {
  const s = req.session;
  if (!s) return null;
  return {
    user_id: s.user_id,
    email: s.email,
    full_name: s.full_name,
    user_type: s.user_type,
  };
}

// Ambil isi body dari payload response (string JSON envelope) tanpa men-throw.
function parseResponseBody(payload: unknown): unknown {
  if (typeof payload === 'string') {
    const trimmed = payload.trim();
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        return JSON.parse(trimmed);
      } catch {
        return { _raw: trimmed.slice(0, 500) };
      }
    }
    return { _raw: trimmed.slice(0, 500) };
  }
  if (payload == null) return null;
  return { _type: 'non-json' };
}

const asJson = (v: unknown): Prisma.InputJsonValue | undefined =>
  (v ?? undefined) as Prisma.InputJsonValue | undefined;

/**
 * Derive action dari path URL (default bila writeAudit() tidak dipakai).
 * - Buang prefix "/api/v1/" atau "/api/" atau "/" → ganti "/" jadi "."
 * - Contoh: GET /api/v1/auth/captcha → "auth.captcha"
 *           POST /api/v1/administration/audit/list → "administration.audit.list"
 *           GET / → "root"
 */
export function deriveActionFromPath(urlPath: string): string {
  const pathOnly = (urlPath.split('?')[0] ?? '').trim();
  const stripped = pathOnly
    .replace(/^\/api\/v\d+\//, '')
    .replace(/^\/api\//, '')
    .replace(/^\/+/, '')
    .replace(/\/+$/, '');
  if (!stripped) return 'root';
  return stripped.replace(/\//g, '.');
}

/**
 * Rakit "message" log dari status + envelope response. Tujuannya supaya kolom
 * langsung terbaca: berhasil/gagal/error + detail singkat.
 *   2xx-3xx → "berhasil: <envelope.message>"
 *   4xx     → "gagal: <envelope.message|error.code>"
 *   5xx     → "error: <envelope.message|error.code>"
 */
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

/**
 * Rakit & tulis 1 record audit untuk request. Dipanggil dari hook onSend.
 * Skip OPTIONS (preflight noise) — file tetap menyimpan. Tidak pernah men-throw.
 */
export function flushAudit(req: FastifyRequest, payload: unknown, status: number): void {
  // OPTIONS = preflight CORS, tidak punya nilai audit. File tetap (di
  // request-logger), DB di-skip supaya tabel tidak bengkak.
  if (req.method === 'OPTIONS') return;

  const entry = req.auditEntry;
  const endpoint = (req.url.split('?')[0] ?? '').trim() || '/';
  const action = entry?.action ?? deriveActionFromPath(endpoint);
  // Endpoint /api/v1/logs/* adalah noise operasional (saat live-stream &
  // refresh, polling per beberapa detik membanjiri tabel). Tetap masuk file
  // (sudah ditangani request-logger), DB di-skip total.
  if (action.startsWith('logs.')) return;
  const sessionUserId = req.session?.user_id ?? null;
  const parsedResponse = parseResponseBody(payload);
  const message = deriveMessage(status, parsedResponse);

  prisma.auditLog
    .create({
      data: {
        traceId: (req.id as string) ?? null,
        sourceApp: env.APP_ID,
        userId: entry?.userId ?? sessionUserId,
        clientId: req.gwClient?.clientId ?? null,
        action,
        endpoint,
        method: req.method,
        message,
        requestHeader: asJson(redactHeaders(req.headers as Record<string, unknown>)),
        requestBody: asJson(capValue(redactBody(req.body ?? null))),
        responseBody: asJson(capValue(redactBody(parsedResponse))),
        userData: asJson(entry?.userData ?? extractUserData(req)),
        ip: req.ip ?? null,
        userAgent: req.headers['user-agent'] ?? null,
      },
    })
    .catch((err: unknown) => {
      console.error('[audit] gagal menulis audit log:', (err as Error).message);
    });
}

export interface AuditSearchQuery {
  action?: string;
  userId?: string;
  dateFrom?: string; // ISO
  dateTo?: string; // ISO
  limit: number;
}

export async function searchAuditLogs(q: AuditSearchQuery) {
  const where: Prisma.AuditLogWhereInput = {};
  if (q.action) where.action = q.action;
  if (q.userId) where.userId = q.userId;
  if (q.dateFrom || q.dateTo) {
    where.createdAt = {};
    if (q.dateFrom) where.createdAt.gte = new Date(q.dateFrom);
    if (q.dateTo) where.createdAt.lte = new Date(q.dateTo);
  }
  return prisma.auditLog.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: q.limit,
  });
}
