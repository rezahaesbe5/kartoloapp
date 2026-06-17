import type { FastifyError, FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';
import { AppError } from './app-error.js';
import { buildEnvelope } from './envelope.js';
import { RESPONSE_CODES } from './response-codes.js';

function getTraceId(req: FastifyRequest): string {
  return (req.id as string) ?? 'unknown';
}

export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((err: FastifyError | AppError | ZodError, req: FastifyRequest, reply: FastifyReply) => {
    const traceId = getTraceId(req);

    if (err instanceof AppError) {
      const meta = RESPONSE_CODES[err.type];
      const envelope = buildEnvelope({
        type: err.type,
        traceId,
        message: err.message || meta.defaultMessage,
        error: {
          code: err.code ?? err.type.toUpperCase(),
          ...(err.details ? { details: err.details } : {}),
        },
      });
      return reply.status(meta.status).send(envelope);
    }

    if (err instanceof ZodError) {
      const envelope = buildEnvelope({
        type: 'body_invalid',
        traceId,
        error: {
          code: 'BODY_INVALID',
          details: { issues: err.issues },
        },
      });
      return reply.status(RESPONSE_CODES.body_invalid.status).send(envelope);
    }

    // Fastify validation error (schema-based)
    const fastifyErr = err as FastifyError;
    if (fastifyErr.validation) {
      const envelope = buildEnvelope({
        type: 'body_invalid',
        traceId,
        error: {
          code: 'BODY_INVALID',
          details: { validation: fastifyErr.validation },
        },
      });
      return reply.status(RESPONSE_CODES.body_invalid.status).send(envelope);
    }

    req.log.error({ err }, 'Unhandled error');
    const envelope = buildEnvelope({
      type: 'other',
      traceId,
      error: { code: 'INTERNAL_ERROR' },
    });
    return reply.status(500).send({ ...envelope, status: 500 });
  });

  app.setNotFoundHandler((req: FastifyRequest, reply: FastifyReply) => {
    const traceId = getTraceId(req);
    const envelope = buildEnvelope({
      type: 'not_found',
      traceId,
      message: 'Endpoint tidak ditemukan',
      error: { code: 'ROUTE_NOT_FOUND', details: { method: req.method, url: req.url } },
    });
    return reply.status(RESPONSE_CODES.not_found.status).send(envelope);
  });
}
