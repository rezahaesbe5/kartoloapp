import { Prisma } from '@prisma/client';
import type { FastifyInstance, FastifyPluginAsync, FastifyRequest } from 'fastify';
import { AppError } from '../../../src/shared/errors/app-error.js';
import { successEnvelope } from '../../../src/shared/errors/envelope.js';
import {
  RoleCreateBodySchema,
  RoleDeleteBodySchema,
  RoleDetailBodySchema,
  RoleListBodySchema,
  RoleUpdateBodySchema,
} from './role.schema.js';
import { createRole, deleteRole, getRole, listRoles, updateRole } from './role.service.js';

const ADMIN_TYPES = new Set(['superadmin', 'admin']);

function requireAdmin(req: FastifyRequest): void {
  const raw = req.headers['x-forwarded-user-type'];
  const userType = Array.isArray(raw) ? raw[0] : raw;
  if (!userType || !ADMIN_TYPES.has(userType)) {
    throw new AppError('header_unauthorized', {
      message: 'Hanya admin/superadmin yang boleh mengakses role user.',
      code: 'FORBIDDEN',
    });
  }
}

function toRoleAppError(err: unknown, fallbackMessage: string): AppError {
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      return new AppError('body_invalid', {
        message: 'Nama role sudah digunakan.',
        code: 'ROLE_DUPLICATE',
      });
    }
    if (err.code === 'P2025') {
      return new AppError('not_found', {
        message: 'Role tidak ditemukan.',
        code: 'ROLE_NOT_FOUND',
      });
    }
    if (err.code === 'P2003') {
      return new AppError('db_error', {
        message: 'Role tidak bisa dihapus karena masih digunakan oleh user.',
        code: 'ROLE_IN_USE',
      });
    }
  }

  // Handle custom ROLE_IN_USE error from service pre-check
  if (err instanceof Error && err.message.startsWith('ROLE_IN_USE:')) {
    const reasons = err.message.replace('ROLE_IN_USE: ', '');
    return new AppError('db_error', {
      message: `Role tidak bisa dihapus. Alasan: ${reasons}`,
      code: 'ROLE_IN_USE',
    });
  }

  return new AppError('db_error', {
    message: fallbackMessage,
    code: 'ROLE_DB_ERROR',
    cause: err,
  });
}

export const roleRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  app.post('/role/list', async (req, reply) => {
    requireAdmin(req);
    const body = RoleListBodySchema.parse(req.body ?? {});
    const result = await listRoles(body);
    return reply.status(200).send(successEnvelope(req.id as string, result, 'OK'));
  });

  app.post('/role/detail', async (req, reply) => {
    requireAdmin(req);
    const body = RoleDetailBodySchema.parse(req.body ?? {});
    const row = await getRole(body.id);
    if (!row) {
      throw new AppError('not_found', { message: 'Role tidak ditemukan.', code: 'ROLE_NOT_FOUND' });
    }
    return reply.status(200).send(successEnvelope(req.id as string, row, 'OK'));
  });

  app.post('/role/create', async (req, reply) => {
    requireAdmin(req);
    const body = RoleCreateBodySchema.parse(req.body ?? {});
    try {
      const row = await createRole(body.nama_role);
      return reply.status(200).send(successEnvelope(req.id as string, row, 'Role berhasil ditambahkan.'));
    } catch (err) {
      throw toRoleAppError(err, 'Gagal menambahkan role.');
    }
  });

  app.post('/role/update', async (req, reply) => {
    requireAdmin(req);
    const body = RoleUpdateBodySchema.parse(req.body ?? {});
    try {
      const row = await updateRole(body.id, body.nama_role);
      return reply.status(200).send(successEnvelope(req.id as string, row, 'Role berhasil diperbarui.'));
    } catch (err) {
      throw toRoleAppError(err, 'Gagal memperbarui role.');
    }
  });

  app.post('/role/delete', async (req, reply) => {
    requireAdmin(req);
    const body = RoleDeleteBodySchema.parse(req.body ?? {});
    try {
      await deleteRole(body.id);
      return reply.status(200).send(successEnvelope(req.id as string, { id: body.id }, 'Role berhasil dihapus.'));
    } catch (err) {
      throw toRoleAppError(err, 'Gagal menghapus role.');
    }
  });
};
