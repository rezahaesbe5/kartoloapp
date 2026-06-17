import type { FastifyInstance } from 'fastify';
import { logsRoutes } from './logs.controller.js';
import { registerLogsWs } from './logs.ws.js';

export const logsModule = {
  name: 'logs',
  owner: 'reza',
  async register(app: FastifyInstance): Promise<void> {
    await app.register(logsRoutes, { prefix: '/api/v1/logs' });
    await registerLogsWs(app);
  },
};
