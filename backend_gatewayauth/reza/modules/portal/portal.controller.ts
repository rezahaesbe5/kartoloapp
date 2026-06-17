import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { successEnvelope } from '../../../src/shared/errors/envelope.js';
import { authRequired } from '../../../src/shared/middleware/auth-required.js';
import {
  listMenusForUser,
  listProductRolesForUser,
  listProductsForUser,
} from './portal.service.js';

const ProductQuerySchema = z.object({
  produk_id: z.coerce.number().int().positive(),
});

const MenuQuerySchema = z.object({
  produk_id: z.coerce.number().int().positive(),
  role_id: z.coerce.number().int().positive().optional(),
});

export const portalRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  // List produk yang boleh diakses user saat ini (filter by role mapping).
  app.get('/products', { preHandler: [authRequired] }, async (req, reply) => {
    const session = req.session!;
    const products = await listProductsForUser(session.user_id, session.user_type);
    return reply.status(200).send(
      successEnvelope(req.id as string, { products }, 'OK'),
    );
  });

  // List role yang bisa dipilih user untuk sebuah produk (role picker saat masuk produk).
  app.get('/roles', { preHandler: [authRequired] }, async (req, reply) => {
    const { produk_id } = ProductQuerySchema.parse(req.query);
    const session = req.session!;
    const roles = await listProductRolesForUser(session.user_id, session.user_type, produk_id);
    return reply.status(200).send(
      successEnvelope(req.id as string, { roles }, 'OK'),
    );
  });

  // List menu navigasi sebuah produk sesuai role yang sedang dipilih user.
  app.get('/menus', { preHandler: [authRequired] }, async (req, reply) => {
    const { produk_id, role_id } = MenuQuerySchema.parse(req.query);
    const session = req.session!;
    const menus = await listMenusForUser(
      session.user_id,
      session.user_type,
      produk_id,
      role_id ?? null,
    );
    return reply.status(200).send(
      successEnvelope(req.id as string, { menus }, 'OK'),
    );
  });
};
