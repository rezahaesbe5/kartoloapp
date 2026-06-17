// Gateway guard: dipasang sebagai global preHandler untuk semua /api/v1/*.
// Validate header chain: client → IP → timestamp → signature → endpoint access.
// Lihat plan: shimmying-snacking-goose.md untuk detail tiap step.

import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import type { CfgClient, MstEndpoint } from '@prisma/client';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { AppError } from '../errors/app-error.js';
import { prisma } from '../lib/prisma.js';

declare module 'fastify' {
  interface FastifyRequest {
    gwClient?: CfgClient;
    gwEndpoint?: MstEndpoint | null;
  }
}

const TIMESTAMP_TOLERANCE_MS = 5 * 60 * 1000;

// Path yang skip gateway guard sama sekali (health/readiness, dipakai orchestrator).
// /api/v1/logs/ws di-whitelist karena browser WebSocket tidak bisa kirim header
// signature — auth-nya pakai short-lived ticket Redis (lihat ws-ticket.service.ts).
const WHITELIST_PATHS = new Set<string>(['/health', '/ready', '/api/v1/logs/ws']);

export async function gatewayGuard(req: FastifyRequest, _reply: FastifyReply): Promise<void> {
  const url = req.url.split('?')[0] ?? '';
  if (WHITELIST_PATHS.has(url)) return;
  if (!url.startsWith('/api/')) return; // hanya /api/* yang diatur gateway

  // ---- 1. Extract headers (case-insensitive via Fastify normalize lowercase) ----
  const clientId = headerStr(req, 'x-client-id');
  const xTimestamp = headerStr(req, 'x-timestamp');
  const xSignature = headerStr(req, 'x-signature');

  if (!clientId) {
    throw new AppError('header_unauthorized', {
      message: 'Header X-Client-Id wajib dikirim.',
      code: 'CLIENT_ID_MISSING',
    });
  }

  // ---- 2. Resolve client --------------------------------------------------
  const client = await prisma.cfgClient.findUnique({ where: { clientId } });
  if (!client) {
    throw new AppError('header_unauthorized', {
      message: 'Client tidak terdaftar.',
      code: 'CLIENT_NOT_FOUND',
    });
  }
  if (!client.activeFlag) {
    throw new AppError('header_unauthorized', {
      message: 'Client sedang dinonaktifkan.',
      code: 'CLIENT_INACTIVE',
    });
  }

  // ---- 3. IP check --------------------------------------------------------
  const allowed = client.ipList.split(';').map((s) => s.trim()).filter(Boolean);
  const ipOk = allowed.includes('*') || allowed.includes(req.ip);
  if (!ipOk) {
    throw new AppError('header_unauthorized', {
      message: 'IP asal tidak diizinkan untuk client ini.',
      code: 'IP_NOT_ALLOWED',
      details: { ip: req.ip },
    });
  }

  // ---- 4. Resolve endpoint (selalu lookup karena auth_flag dipakai di sign) --
  const pathForLookup = url.replace(/^\/api\//, '');
  const endpoint = await resolveEndpoint(pathForLookup, req.method);
  req.gwEndpoint = endpoint;

  // ---- 5. Timestamp -------------------------------------------------------
  if (client.timestampFlag) {
    if (!xTimestamp) {
      throw new AppError('header_unauthorized', {
        message: 'Header X-Timestamp wajib dikirim.',
        code: 'TIMESTAMP_MISSING',
      });
    }
    const parsed = Date.parse(xTimestamp);
    if (Number.isNaN(parsed)) {
      throw new AppError('header_unauthorized', {
        message: 'Format X-Timestamp tidak valid (gunakan ISO 8601, e.g. 2026-05-13T17:31:23+07:00).',
        code: 'TIMESTAMP_INVALID',
      });
    }
    const drift = Math.abs(Date.now() - parsed);
    if (drift > TIMESTAMP_TOLERANCE_MS) {
      throw new AppError('header_unauthorized', {
        message: `X-Timestamp di luar window ±${TIMESTAMP_TOLERANCE_MS / 60000} menit.`,
        code: 'TIMESTAMP_OUT_OF_WINDOW',
        details: { drift_ms: drift },
      });
    }
  }

  // ---- 6. Signature -------------------------------------------------------
  if (client.signatureFlag) {
    if (!xSignature) {
      throw new AppError('signature_invalid', {
        message: 'Header X-Signature wajib dikirim.',
        code: 'SIGNATURE_MISSING',
      });
    }
    if (!xTimestamp) {
      // Edge case: signatureFlag on tapi timestampFlag off — signature tetap butuh ts.
      throw new AppError('signature_invalid', {
        message: 'X-Timestamp wajib dikirim untuk sign request.',
        code: 'TIMESTAMP_REQUIRED_FOR_SIGNATURE',
      });
    }

    // Determine tokenStr berdasarkan auth_flag endpoint.
    let tokenStr = 'noAuth';
    if (endpoint?.authFlag) {
      const authHeader = headerStr(req, 'authorization');
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        throw new AppError('token_invalid', {
          message: 'Header Authorization (Bearer) wajib untuk endpoint ini.',
          code: 'TOKEN_MISSING',
        });
      }
      tokenStr = authHeader;
    }

    // Compute hashedBody.
    let hashedBody: string;
    if (req.method === 'GET') {
      hashedBody = 'nobody';
    } else {
      const raw = req.rawBody ?? '';
      try {
        const minified = raw.length === 0 ? '{}' : JSON.stringify(JSON.parse(raw));
        hashedBody = createHash('sha256').update(minified).digest('hex').toLowerCase();
      } catch {
        throw new AppError('body_invalid', {
          message: 'Body bukan JSON valid (tidak bisa di-hash untuk signature).',
          code: 'BODY_NOT_JSON',
        });
      }
    }

    const stringToSign = `${req.method}:${pathForLookup}:${xTimestamp}:${tokenStr}:${hashedBody}`;
    const expected = createHmac('sha512', client.clientKey).update(stringToSign).digest('base64');

    if (!constantTimeEqualStr(expected, xSignature)) {
      // Detail debug (expected/received/stringToSign) HANYA ke server log.
      // Tidak boleh leak ke client — bocoran stringToSign membantu attacker
      // reverse-engineer format signature.
      req.log.warn(
        {
          gateway: 'signature_mismatch',
          client_id: client.clientId,
          method: req.method,
          path: pathForLookup,
          string_to_sign: stringToSign,
          expected,
          received: xSignature,
        },
        'X-Signature mismatch',
      );
      throw new AppError('signature_invalid', {
        message: 'X-Signature tidak match dengan recomputed value.',
        code: 'SIGNATURE_MISMATCH',
        details: { reason: 'signature_mismatch' },
      });
    }
  }

  // ---- 7. Endpoint access -------------------------------------------------
  if (client.endpointFlag) {
    if (!endpoint) {
      throw new AppError('not_found', {
        message: 'Endpoint tidak terdaftar di katalog gateway.',
        code: 'ENDPOINT_NOT_REGISTERED',
        details: { method: req.method, path: pathForLookup },
      });
    }
    if (!endpoint.activeFlag) {
      throw new AppError('header_unauthorized', {
        message: 'Endpoint sedang dinonaktifkan.',
        code: 'ENDPOINT_INACTIVE',
      });
    }
    const mapping = await prisma.mapClientEndpoint.findUnique({
      where: {
        clientId_endpointId: { clientId: client.clientId, endpointId: endpoint.id },
      },
      select: { clientId: true },
    });
    if (!mapping) {
      throw new AppError('header_unauthorized', {
        message: 'Client ini tidak memiliki akses ke endpoint tersebut.',
        code: 'ENDPOINT_NOT_PERMITTED',
      });
    }
  }

  req.gwClient = client;
}

// Resolve endpoint via exact match (URL+method). Untuk endpoint dengan path
// param seperti `v1/auth/admin/sessions/:userId/revoke`, kita ganti segmen
// param di request URL dengan `:paramName` berdasar route Fastify yang match.
//
// Strategi simpel untuk MVP: cari MstEndpoint dengan endpointUrl literal sama
// dengan pathForLookup; kalau tidak ketemu, cari yang mengandung `:` dan match
// pattern-nya. Pakai regex match.
async function resolveEndpoint(pathForLookup: string, method: string): Promise<MstEndpoint | null> {
  // 1. Exact match (paling cepat, paling sering kena).
  const exact = await prisma.mstEndpoint.findUnique({
    where: { endpointUrl_endpointMethod: { endpointUrl: pathForLookup, endpointMethod: method } },
  });
  if (exact) return exact;

  // 2. Pattern match — ambil semua endpoint dengan method sama yang mengandung ':',
  //    lalu coba match satu per satu.
  const candidates = await prisma.mstEndpoint.findMany({
    where: { endpointMethod: method, endpointUrl: { contains: ':' } },
  });
  for (const c of candidates) {
    if (matchEndpointPattern(c.endpointUrl, pathForLookup)) return c;
  }
  return null;
}

function matchEndpointPattern(pattern: string, actual: string): boolean {
  const patSeg = pattern.split('/');
  const actSeg = actual.split('/');
  if (patSeg.length !== actSeg.length) return false;
  // Segmen cocok kalau wildcard (`:param`) atau identik dengan segmen aktual.
  return patSeg.every((seg, i) => seg.startsWith(':') || seg === actSeg[i]);
}

function headerStr(req: FastifyRequest, name: string): string | undefined {
  const v = req.headers[name];
  if (Array.isArray(v)) return v[0];
  return v;
}

function constantTimeEqualStr(a: string, b: string): boolean {
  const ab = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}
