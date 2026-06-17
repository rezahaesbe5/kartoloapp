import type { FastifyInstance } from 'fastify';
import { roleRoutes } from './role.controller.js';

export const roleModule = {
  name: 'role',
  owner: 'reza',
  async register(app: FastifyInstance): Promise<void> {
    await app.register(roleRoutes, { prefix: '/api/v1/administration' });
  },
};