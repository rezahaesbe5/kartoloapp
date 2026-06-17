import type { FastifyInstance } from 'fastify';
import { authRoutes } from './auth.controller.js';

export const authModule = {
  name: 'auth',
  owner: 'reza',
  async register(app: FastifyInstance): Promise<void> {
    await app.register(authRoutes, { prefix: '/api/v1/auth' });
  },
};
