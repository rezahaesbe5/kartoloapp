import type { FastifyInstance } from 'fastify';
import { userRoutes } from './user.controller.js';

export const userModule = {
  name: 'user',
  owner: 'reza',
  async register(app: FastifyInstance): Promise<void> {
    await app.register(userRoutes, { prefix: '/api/v1/administration' });
  },
};
