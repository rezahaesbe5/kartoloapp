import type { FastifyInstance, FastifyPluginAsync, FastifyRequest } from 'fastify';
import { AppError } from '../../../src/shared/errors/app-error.js';
import { successEnvelope } from '../../../src/shared/errors/envelope.js';
import { AuditDetailBodySchema, AuditListBodySchema } from './audit.schema.js';
import { getAuditLogDetail, listAuditLogs } from './audit.service.js';

const ADMIN_TYPES = new Set(['superadmin', 'admin']);

// RBAC defense-in-depth. Gateway sudah memvalidasi auth (JWT + session) untuk
// endpoint auth_flag dan meneruskan identitas via header X-Forwarded-*. Di sini
// kita pastikan user_type-nya admin/superadmin — setara requireAdmin di /logs/audit.
function requireAdmin(req: FastifyRequest): void {
  const raw = req.headers['x-forwarded-user-type'];
  const userType = Array.isArray(raw) ? raw[0] : raw;
  if (!userType || !ADMIN_TYPES.has(userType)) {
    throw new AppError('header_unauthorized', {
      message: 'Hanya admin/superadmin yang boleh mengakses audit log.',
      code: 'FORBIDDEN',
    });
  }
}

export const auditRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  // POST /api/v1/administration/audit/list — paging + search + filter + sort.
  // Parameter dikirim sebagai request body application/json.
  app.post('/audit/list', async (req, reply) => {
    requireAdmin(req);
    const body = AuditListBodySchema.parse(req.body ?? {});
    const result = await listAuditLogs(body);
    return reply.status(200).send(successEnvelope(req.id as string, result, 'OK'));
  });

  // POST /api/v1/administration/audit/detail — ambil 1 baris audit (14 kolom)
  // berdasarkan id. Dipisah dari list supaya payload list tetap ringan.
  app.post('/audit/detail', async (req, reply) => {
    requireAdmin(req);
    const body = AuditDetailBodySchema.parse(req.body ?? {});
    const row = await getAuditLogDetail(body.id);
    if (!row) {
      throw new AppError('not_found', {
        message: 'Audit log tidak ditemukan.',
        code: 'AUDIT_NOT_FOUND',
      });
    }
    return reply.status(200).send(successEnvelope(req.id as string, row, 'OK'));
  });
};
