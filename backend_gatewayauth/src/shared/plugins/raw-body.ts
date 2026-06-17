// Capture raw request body sebelum JSON parse, supaya gateway-guard bisa
// recompute SHA256(JSON.stringify(JSON.parse(rawBody))) untuk signature.
//
// Fastify default JSON parser hanya expose `req.body` (sudah ter-parse) — kita
// override parser-nya supaya raw string juga disimpan di `req.rawBody`.

import type { FastifyInstance, FastifyRequest } from 'fastify';

declare module 'fastify' {
  interface FastifyRequest {
    rawBody?: string;
  }
}

export async function registerRawBody(app: FastifyInstance): Promise<void> {
  app.addContentTypeParser(
    'application/json',
    { parseAs: 'string' },
    (req: FastifyRequest, body: string, done) => {
      req.rawBody = body;
      if (body.length === 0) return done(null, {});
      try {
        const json = JSON.parse(body);
        done(null, json);
      } catch (err) {
        const e = err as Error & { statusCode?: number };
        e.statusCode = 400;
        done(e, undefined);
      }
    },
  );
}
