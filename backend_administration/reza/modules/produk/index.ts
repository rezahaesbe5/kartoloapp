import type { FastifyInstance } from 'fastify';
import { produkRoutes } from './produk.controller.js';

export const produkModule = {
  name: 'produk',
  owner: 'reza',
  async register(app: FastifyInstance): Promise<void> {
    await app.register(produkRoutes, { prefix: '/api/v1/administration' });
  },
};
