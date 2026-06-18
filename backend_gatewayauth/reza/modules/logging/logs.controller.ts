// Gateway-side logs controller. Route yg memerlukan business logic (access,
// access/close, sources, search) sudah DIPINDAH ke backend_administration —
// gateway hanya jadi ingress + forwarder utk mereka (lihat seed.ts).
//
// Route yg TETAP di gateway:
//   POST /logs/client    — ingest batch log dari frontend (signed, no auth)
//   POST /logs/ws-ticket — issue short-lived ticket untuk membuka WebSocket
//   GET  /logs/audit     — search audit_logs (DB lokal gateway)
//   GET  /logs/health    — cek Loki reachability dari gateway
//   POST /logs/loki-link — legacy: hardlink semua source utk 1 tanggal

import type { FastifyInstance, FastifyPluginAsync, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { AppError } from '../../../src/shared/errors/app-error.js';
import { successEnvelope } from '../../../src/shared/errors/envelope.js';
import { authRequired } from '../../../src/shared/middleware/auth-required.js';
import { searchAuditLogs } from './audit.service.js';
// import { frontendWriter } from './log-writer.js'; // dinonaktifkan
import { lokiReady } from './loki-client.js';
import { issueWsTicket } from './ws-ticket.service.js';

// ---- RBAC helper ------------------------------------------------------------
function requireAdmin(req: FastifyRequest): void {
  const type = req.session?.user_type;
  if (type !== 'superadmin' && type !== 'admin') {
    throw new AppError('header_unauthorized', {
      message: 'Hanya admin/superadmin yang boleh mengakses log.',
      code: 'FORBIDDEN',
    });
  }
}

// ---- Schemas ----------------------------------------------------------------
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const FilterKeysEnum = z.enum([
  'level',
  'message',
  'action',
  'endpoint',
  'method',
  'status',
  'trace_id',
  'source_app',
  'ip',
  'user_email',
  'raw',
]);
const FilterOpsEnum = z.enum([
  '=',
  '!=',
  'contains',
  'not_contains',
  'starts_with',
  'ends_with',
  'is_empty',
  'is_not_empty',
]);
const WsTicketBodySchema = z.object({
  source_app: z.enum([
    'backend_gatewayauth',
    'backend_administration',
    'frontend_kartoloapps',
  ]),
  date: z.string().regex(DATE_RE),
  filters: z
    .array(
      z.object({
        key: FilterKeysEnum,
        op: FilterOpsEnum,
        value: z.string().max(500).default(''),
        connector: z.enum(['AND', 'OR']).optional(),
      }),
    )
    .max(20)
    .default([]),
});

const ClientLogEntrySchema = z
  .object({
    app: z.string().max(80).optional(),
    level: z.enum(['info', 'warn', 'error']).optional(),
    ts_request: z.string().max(40).optional(),
    message: z.string().max(4000).optional(),
    error_stack: z.string().max(8000).optional(),
    page_url: z.string().max(2000).optional(),
    endpoint: z.string().max(500).optional(),
    status: z.number().int().optional(),
    trace_id: z.string().max(120).optional(),
    user_data: z.record(z.unknown()).optional(),
    meta: z.record(z.unknown()).optional(),
  })
  .strip();

const ClientLogBatchSchema = z.object({
  logs: z.array(ClientLogEntrySchema).min(1).max(100),
});

const AuditQuerySchema = z.object({
  action: z.string().max(120).optional(),
  user_id: z.string().uuid().optional(),
  date_from: z.string().optional(),
  date_to: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
});

// ---- Routes -----------------------------------------------------------------
export const logsRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  // POST /client — ingest batch log dari frontend (signed, tanpa Bearer).
  app.post('/client', async (req, reply) => {
    const input = ClientLogBatchSchema.parse(req.body);
    /*
    Pencatatan log frontend ke file DINONAKTIFKAN per 2026-06-18 (user request).
    Log frontend tetap mengalir ke Alloy/Loki via stdout container jika diperlukan,
    tapi tidak lagi ditulis ke folder logs/ oleh gateway.
    const tsIngest = new Date().toISOString();
    for (const entry of input.logs) {
      frontendWriter.write({ ... });
    }
    */
    return reply
      .status(200)
      .send(successEnvelope(req.id as string, { accepted: input.logs.length }, 'Log diterima (ingest disabled)'));
  });

  // POST /ws-ticket — terbitkan ticket short-lived untuk handshake WS.
  // Browser WebSocket tidak bisa kirim header signature → ticket Redis
  // dipakai sekali (GETDEL) saat gateway upgrade WS.
  app.post('/ws-ticket', { preHandler: [authRequired] }, async (req, reply) => {
    requireAdmin(req);
    const body = WsTicketBodySchema.parse(req.body);
    const session = req.session;
    if (!session) {
      throw new AppError('token_invalid', {
        message: 'Session tidak ditemukan.',
        code: 'SESSION_MISSING',
      });
    }
    const issued = await issueWsTicket({
      user_id: session.user_id,
      user_type: session.user_type,
      email: session.email,
      full_name: session.full_name,
      session_id: session.session_id,
      client_id: req.gwClient?.clientId ?? null,
      source_app: body.source_app,
      date: body.date,
      filters: body.filters,
    });
    return reply.status(200).send(successEnvelope(req.id as string, issued, 'Ticket diterbitkan'));
  });

  // GET /audit — cari audit log dari database (DB lokal gateway).
  app.get('/audit', { preHandler: [authRequired] }, async (req, reply) => {
    requireAdmin(req);
    const q = AuditQuerySchema.parse(req.query);
    const items = await searchAuditLogs({
      action: q.action,
      userId: q.user_id,
      dateFrom: q.date_from,
      dateTo: q.date_to,
      limit: q.limit,
    });
    return reply
      .status(200)
      .send(successEnvelope(req.id as string, { count: items.length, items }, 'OK'));
  });

  // GET /health — status pipeline log (apakah Loki reachable dari gateway).
  app.get('/health', { preHandler: [authRequired] }, async (req, reply) => {
    requireAdmin(req);
    const lokiOk = await lokiReady();
    return reply
      .status(200)
      .send(successEnvelope(req.id as string, { loki: lokiOk ? 'ok' : 'unreachable' }, 'OK'));
  });
};
