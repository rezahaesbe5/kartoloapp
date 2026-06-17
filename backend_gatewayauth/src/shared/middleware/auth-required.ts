import type { FastifyReply, FastifyRequest } from 'fastify';
import { AppError } from '../errors/app-error.js';
import { getSession, type SessionRecord } from '../lib/session-store.js';

declare module 'fastify' {
  interface FastifyRequest {
    session?: SessionRecord;
  }
}

/**
 * Middleware untuk endpoint protected:
 *  1. Verify JWT signature & expiry.
 *  2. Cek session_id di Redis. Kalau tidak ada → token revoked → rc=91.
 *  3. Lampirkan session record ke req.session.
 *
 * Pakai sebagai `preHandler: [authRequired]` di route definition.
 */
export async function authRequired(req: FastifyRequest, _reply: FastifyReply): Promise<void> {
  try {
    await req.jwtVerify();
  } catch (err) {
    throw new AppError('token_invalid', {
      message: 'Token tidak valid atau sudah expired',
      code: 'TOKEN_INVALID',
      cause: err,
    });
  }

  const payload = req.user;
  const sid = payload.session_id;
  if (!sid) {
    throw new AppError('token_invalid', {
      message: 'Token tidak membawa session_id',
      code: 'SESSION_ID_MISSING',
    });
  }

  const session = await getSession(sid);
  if (!session) {
    throw new AppError('token_invalid', {
      message: 'Sesi sudah berakhir atau dicabut. Silakan login kembali.',
      code: 'SESSION_REVOKED',
    });
  }

  req.session = session;
}
