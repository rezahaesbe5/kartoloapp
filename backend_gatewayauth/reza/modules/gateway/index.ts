import type { FastifyInstance } from 'fastify';
import { forwardHandler, forwardPreHandler } from './forward.js';

// Modul gateway proxy — catch-all route untuk meneruskan endpoint yang
// dipetakan ke backend lain via mst_endpoint.backend_url.
//
// Catch-all `/api/v1/*` hanya kena path yang TIDAK punya route lokal: di radix
// tree Fastify, route statik/parametrik (auth, portal, logs) selalu menang.
// OPTIONS sengaja tidak didaftarkan — preflight CORS ditangani @fastify/cors.
export const gatewayProxyModule = {
  name: 'gateway-proxy',
  owner: 'reza',
  async register(app: FastifyInstance): Promise<void> {
    app.route({
      method: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
      url: '/api/v1/*',
      preHandler: [forwardPreHandler],
      handler: forwardHandler,
    });
  },
};
