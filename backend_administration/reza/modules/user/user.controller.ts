import type { FastifyInstance, FastifyPluginAsync, FastifyRequest } from 'fastify';
import { Prisma } from '@prisma/client';
import { AppError } from '../../../src/shared/errors/app-error.js';
import { successEnvelope } from '../../../src/shared/errors/envelope.js';
import {
  UserCreateBodySchema,
  UserDeleteBodySchema,
  UserDetailBodySchema,
  UserListBodySchema,
  UserDisableMfaBodySchema,
  UserResetBlockBodySchema,
  UserResetPasswordBodySchema,
  UserRoleMappingListBodySchema,
  UserSetRoleMappingsBodySchema,
  UserUpdateBodySchema,
  UserUpdateStatusBodySchema,
} from './user.schema.js';
import {
  createUser,
  deleteUser,
  disableMfaService,
  getUser,
  listProductsWithRoles,
  listUserRoleMappings,
  listUsers,
  resetBlockService,
  resetPasswordService,
  setUserRoleMappings,
  updateStatusService,
  updateUser,
} from './user.service.js';

const ADMIN_TYPES = new Set(['superadmin', 'admin']);

function requireAdmin(req: FastifyRequest): void {
  const raw = req.headers['x-forwarded-user-type'];
  const userType = Array.isArray(raw) ? raw[0] : raw;
  if (!userType || !ADMIN_TYPES.has(userType)) {
    throw new AppError('header_unauthorized', {
      message: 'Hanya admin/superadmin yang boleh mengakses user admin.',
      code: 'FORBIDDEN',
    });
  }
}

function toUserAppError(err: unknown, fallbackMessage: string): AppError {
  if (err instanceof Error) {
    if (err.message.includes('Email sudah digunakan') || err.message.includes('Username sudah digunakan')) {
      return new AppError('body_invalid', {
        message: err.message,
        code: 'USER_DUPLICATE',
      });
    }
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      if (err.code === 'P2002') {
        return new AppError('body_invalid', {
          message: 'Email atau username sudah digunakan.',
          code: 'USER_DUPLICATE',
        });
      }
      if (err.code === 'P2025') {
        return new AppError('not_found', {
          message: 'User tidak ditemukan.',
          code: 'USER_NOT_FOUND',
        });
      }
    }
  }
  return new AppError('db_error', {
    message: fallbackMessage,
    code: 'USER_DB_ERROR',
    cause: err,
  });
}

export const userRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  app.post('/user/list', async (req, reply) => {
    requireAdmin(req);
    const body = UserListBodySchema.parse(req.body ?? {});
    const result = await listUsers(body);
    return reply.status(200).send(successEnvelope(req.id as string, result, 'OK'));
  });

  app.post('/user/detail', async (req, reply) => {
    requireAdmin(req);
    const body = UserDetailBodySchema.parse(req.body ?? {});
    const row = await getUser(body.id);
    if (!row) {
      throw new AppError('not_found', { message: 'User tidak ditemukan.', code: 'USER_NOT_FOUND' });
    }
    return reply.status(200).send(successEnvelope(req.id as string, row, 'OK'));
  });

  app.post('/user/create', async (req, reply) => {
    requireAdmin(req);
    const body = UserCreateBodySchema.parse(req.body ?? {});
    try {
      const result = await createUser(body);
      return reply.status(200).send(successEnvelope(req.id as string, result, 'User berhasil ditambahkan.'));
    } catch (err) {
      throw toUserAppError(err, 'Gagal menambahkan user.');
    }
  });

  app.post('/user/update', async (req, reply) => {
    requireAdmin(req);
    const body = UserUpdateBodySchema.parse(req.body ?? {});
    try {
      const result = await updateUser(body);
      return reply.status(200).send(successEnvelope(req.id as string, result, 'User berhasil diperbarui.'));
    } catch (err) {
      throw toUserAppError(err, 'Gagal memperbarui user.');
    }
  });

  app.post('/user/delete', async (req, reply) => {
    requireAdmin(req);
    const body = UserDeleteBodySchema.parse(req.body ?? {});
    try {
      await deleteUser(body.id);
      return reply.status(200).send(successEnvelope(req.id as string, { id: body.id }, 'User berhasil dihapus.'));
    } catch (err) {
      throw toUserAppError(err, 'Gagal menghapus user.');
    }
  });

  app.post('/user/reset-password', async (req, reply) => {
    requireAdmin(req);
    const body = UserResetPasswordBodySchema.parse(req.body ?? {});
    try {
      const result = await resetPasswordService(body.id);
      return reply
        .status(200)
        .send(successEnvelope(req.id as string, result, 'Password berhasil direset.'));
    } catch (err) {
      if (err instanceof AppError) throw err;
      throw toUserAppError(err, 'Gagal mereset password.');
    }
  });

  app.post('/user/update-status', async (req, reply) => {
    requireAdmin(req);
    const body = UserUpdateStatusBodySchema.parse(req.body ?? {});
    try {
      await updateStatusService(body.id, body.status);
      return reply
        .status(200)
        .send(successEnvelope(req.id as string, { id: body.id, status: body.status }, 'Status user berhasil diperbarui.'));
    } catch (err) {
      throw toUserAppError(err, 'Gagal memperbarui status user.');
    }
  });

  app.post('/user/reset-block', async (req, reply) => {
    requireAdmin(req);
    const body = UserResetBlockBodySchema.parse(req.body ?? {});
    try {
      await resetBlockService(body.id);
      return reply
        .status(200)
        .send(successEnvelope(req.id as string, { id: body.id }, 'Blokir sementara berhasil direset.'));
    } catch (err) {
      throw toUserAppError(err, 'Gagal mereset blokir sementara.');
    }
  });

  app.post('/user/disable-mfa', async (req, reply) => {
    requireAdmin(req);
    const body = UserDisableMfaBodySchema.parse(req.body ?? {});
    try {
      await disableMfaService(body.id);
      return reply
        .status(200)
        .send(successEnvelope(req.id as string, { id: body.id }, 'MFA user berhasil dinonaktifkan.'));
    } catch (err) {
      if (err instanceof AppError) throw err;
      throw toUserAppError(err, 'Gagal menonaktifkan MFA user.');
    }
  });

  // Daftar produk + role (untuk dropdown modal Mapping Role User).
  app.post('/user/products-with-roles', async (req, reply) => {
    requireAdmin(req);
    try {
      const products = await listProductsWithRoles();
      return reply.status(200).send(successEnvelope(req.id as string, { products }, 'OK'));
    } catch (err) {
      throw toUserAppError(err, 'Gagal memuat daftar produk & role.');
    }
  });

  // Daftar mapping role milik user (prefill modal).
  app.post('/user/role-mappings', async (req, reply) => {
    requireAdmin(req);
    const body = UserRoleMappingListBodySchema.parse(req.body ?? {});
    try {
      const result = await listUserRoleMappings(body.id);
      return reply.status(200).send(successEnvelope(req.id as string, result, 'OK'));
    } catch (err) {
      if (err instanceof AppError) throw err;
      throw toUserAppError(err, 'Gagal memuat mapping role user.');
    }
  });

  // Replace-all mapping role user.
  app.post('/user/set-role-mappings', async (req, reply) => {
    requireAdmin(req);
    const body = UserSetRoleMappingsBodySchema.parse(req.body ?? {});
    try {
      const result = await setUserRoleMappings(body.id, body.role_ids);
      return reply
        .status(200)
        .send(successEnvelope(req.id as string, result, 'Mapping role user berhasil disimpan.'));
    } catch (err) {
      if (err instanceof AppError) throw err;
      throw toUserAppError(err, 'Gagal menyimpan mapping role user.');
    }
  });
};
