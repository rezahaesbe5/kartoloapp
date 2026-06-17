import { Prisma } from '@prisma/client';
import type { FastifyInstance, FastifyPluginAsync, FastifyRequest } from 'fastify';
import { AppError } from '../../../src/shared/errors/app-error.js';
import { successEnvelope } from '../../../src/shared/errors/envelope.js';
import {
  ProdukCreateBodySchema,
  ProdukDeleteBodySchema,
  ProdukDetailBodySchema,
  ProdukListBodySchema,
  ProdukSetRoleMappingsBodySchema,
  ProdukUpdateBodySchema,
} from './produk.schema.js';
import {
  createProduk,
  deleteProduk,
  getProduk,
  listProduk,
  setProdukRoleMappings,
  updateProduk,
} from './produk.service.js';

const ADMIN_TYPES = new Set(['superadmin', 'admin']);

function requireAdmin(req: FastifyRequest): void {
  const raw = req.headers['x-forwarded-user-type'];
  const userType = Array.isArray(raw) ? raw[0] : raw;
  if (!userType || !ADMIN_TYPES.has(userType)) {
    throw new AppError('header_unauthorized', {
      message: 'Hanya admin/superadmin yang boleh mengakses produk.',
      code: 'FORBIDDEN',
    });
  }
}

function toProdukAppError(err: unknown, fallbackMessage: string): AppError {
  if (err instanceof AppError) return err;
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2025') {
      return new AppError('not_found', {
        message: 'Produk tidak ditemukan.',
        code: 'PRODUK_NOT_FOUND',
      });
    }
  }
  return new AppError('db_error', {
    message: fallbackMessage,
    code: 'PRODUK_DB_ERROR',
    cause: err,
  });
}

export const produkRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  app.post('/produk/list', async (req, reply) => {
    requireAdmin(req);
    const body = ProdukListBodySchema.parse(req.body ?? {});
    const result = await listProduk(body);
    return reply.status(200).send(successEnvelope(req.id as string, result, 'OK'));
  });

  app.post('/produk/detail', async (req, reply) => {
    requireAdmin(req);
    const body = ProdukDetailBodySchema.parse(req.body ?? {});
    const row = await getProduk(body.id);
    if (!row) {
      throw new AppError('not_found', { message: 'Produk tidak ditemukan.', code: 'PRODUK_NOT_FOUND' });
    }
    return reply.status(200).send(successEnvelope(req.id as string, row, 'OK'));
  });

  app.post('/produk/create', async (req, reply) => {
    requireAdmin(req);
    const body = ProdukCreateBodySchema.parse(req.body ?? {});
    try {
      const row = await createProduk(body.nama_produk, body.url_produk, body.active_flag);
      return reply.status(200).send(successEnvelope(req.id as string, row, 'Produk berhasil ditambahkan.'));
    } catch (err) {
      throw toProdukAppError(err, 'Gagal menambahkan produk.');
    }
  });

  app.post('/produk/update', async (req, reply) => {
    requireAdmin(req);
    const body = ProdukUpdateBodySchema.parse(req.body ?? {});
    try {
      const row = await updateProduk(body.id, body.nama_produk, body.url_produk, body.active_flag);
      return reply.status(200).send(successEnvelope(req.id as string, row, 'Produk berhasil diperbarui.'));
    } catch (err) {
      throw toProdukAppError(err, 'Gagal memperbarui produk.');
    }
  });

  app.post('/produk/delete', async (req, reply) => {
    requireAdmin(req);
    const body = ProdukDeleteBodySchema.parse(req.body ?? {});
    try {
      await deleteProduk(body.id);
      return reply.status(200).send(successEnvelope(req.id as string, { id: body.id }, 'Produk berhasil dihapus.'));
    } catch (err) {
      throw toProdukAppError(err, 'Gagal menghapus produk.');
    }
  });

  app.post('/produk/set-role-mappings', async (req, reply) => {
    requireAdmin(req);
    const body = ProdukSetRoleMappingsBodySchema.parse(req.body ?? {});
    try {
      const result = await setProdukRoleMappings(body.id, body.role_ids);
      return reply
        .status(200)
        .send(successEnvelope(req.id as string, result, 'Mapping role produk berhasil disimpan.'));
    } catch (err) {
      throw toProdukAppError(err, 'Gagal menyimpan mapping role produk.');
    }
  });
};
