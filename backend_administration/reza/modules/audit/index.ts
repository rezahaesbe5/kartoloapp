import type { FastifyInstance } from 'fastify';
import { auditRoutes } from './audit.controller.js';

export const auditModule = {
  name: 'audit',
  owner: 'reza',
  async register(app: FastifyInstance): Promise<void> {
    await app.register(auditRoutes, { prefix: '/api/v1/administration' });
  },
};
