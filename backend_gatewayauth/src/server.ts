import Fastify from 'fastify';
import { nanoid } from 'nanoid';
import { env } from './shared/config/env.js';
import { successEnvelope } from './shared/errors/envelope.js';
import { registerErrorHandler } from './shared/errors/handler.js';
import { prisma } from './shared/lib/prisma.js';
import { pingRedis, redis } from './shared/lib/redis.js';
import { startCacheSubscriber, stopCacheSubscriber } from './shared/lib/redis-subscriber.js';
import { gatewayGuard } from './shared/middleware/gateway-guard.js';
import { registerCors } from './shared/plugins/cors.js';
import { registerJwt } from './shared/plugins/jwt.js';
import { registerRawBody } from './shared/plugins/raw-body.js';
import { registerAllModules } from './registry.js';

async function buildServer() {
  const app = Fastify({
    logger: {
      level: env.LOG_LEVEL,
      transport:
        env.NODE_ENV === 'development'
          ? { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss.l', ignore: 'pid,hostname' } }
          : undefined,
      redact: {
        paths: [
          'req.headers.authorization',
          'req.headers["x-timestamp"]',
          'req.headers["x-client-id"]',
          'req.headers["x-client-secret"]',
          'req.headers["x-signature"]',
          '*.password',
          '*.password_hash',
          '*.token',
          '*.access_token',
          '*.refresh_token',
          '*.secret',
        ],
        censor: '[REDACTED]',
      },
    },
    genReqId: () => `req_${nanoid(16)}`,
    disableRequestLogging: false,
    trustProxy: true,
  });

  await registerCors(app);
  await registerJwt(app);
  await registerRawBody(app);
  registerErrorHandler(app);

  // Gateway guard: jalan untuk semua /api/v1/* (health/ready di-whitelist di dalam guard).
  app.addHook('preHandler', gatewayGuard);

  // Health & readiness (no auth, no signature — per PRD Section 10.4)
  app.get('/health', async (req) =>
    successEnvelope(req.id as string, { status: 'ok' }, 'OK'),
  );

  app.get('/ready', async (req, reply) => {
    const dbOk = await prisma.$queryRaw`SELECT 1`.then(() => true).catch(() => false);
    const redisOk = await pingRedis();
    const allOk = dbOk && redisOk;
    if (!allOk) {
      req.log.warn({ dbOk, redisOk }, 'Readiness check failed');
      return reply.status(503).send({
        rc: '95',
        status: 503,
        message: 'Layanan belum siap',
        error: {
          code: 'NOT_READY',
          details: { db: dbOk ? 'ok' : 'fail', redis: redisOk ? 'ok' : 'fail' },
        },
        data: { trace_id: req.id as string },
      });
    }
    return successEnvelope(req.id as string, { db: 'ok', redis: 'ok' }, 'Ready');
  });

  await registerAllModules(app);

  // Subscribe Redis Pub/Sub channel untuk invalidasi cache lintas-backend.
  // Koneksi subscriber terpisah dari client utama (redis.duplicate()).
  startCacheSubscriber(app.log);

  return app;
}

async function start() {
  const app = await buildServer();
  try {
    await app.listen({ port: env.PORT, host: env.HOST });
    app.log.info(`✅ Backend Gateway Auth siap di http://${env.HOST}:${env.PORT}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }

  const shutdown = async (signal: string) => {
    app.log.info({ signal }, 'Shutting down gracefully...');
    try {
      await app.close();
      await prisma.$disconnect();
      await stopCacheSubscriber();
      await redis.quit().catch(() => undefined);
      process.exit(0);
    } catch (err) {
      app.log.error({ err }, 'Error during shutdown');
      process.exit(1);
    }
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

void start();
