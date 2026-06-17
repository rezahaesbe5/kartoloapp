import type { FastifyInstance } from 'fastify';
import { portalRoutes } from './portal.controller.js';

export const portalModule = {
  name: 'portal',
  owner: 'reza',
  async register(app: FastifyInstance): Promise<void> {
    await app.register(portalRoutes, { prefix: '/api/v1/portal' });
  },
};
