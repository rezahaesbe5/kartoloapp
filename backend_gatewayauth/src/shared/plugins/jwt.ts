import type { FastifyInstance } from 'fastify';
import fastifyJwt from '@fastify/jwt';
import { env } from '../config/env.js';

export async function registerJwt(app: FastifyInstance): Promise<void> {
  await app.register(fastifyJwt, {
    secret: env.JWT_SECRET,
    sign: {
      expiresIn: env.JWT_ACCESS_TTL,
      iss: 'kartolo-superapps',
    },
    verify: {
      allowedIss: 'kartolo-superapps',
    },
  });
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: {
      sub: string;
      user_type: 'superadmin' | 'admin' | 'member';
      session_id: string;
    };
    user: {
      sub: string;
      user_type: 'superadmin' | 'admin' | 'member';
      session_id: string;
      iat: number;
      exp: number;
      iss: string;
    };
  }
}
