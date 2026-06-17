import Fastify from 'fastify';
import { nanoid } from 'nanoid';
import { env } from './shared/config/env.js';
import { successEnvelope } from './shared/errors/envelope.js';
import { registerErrorHandler } from './shared/errors/handler.js';
import { prisma } from './shared/lib/prisma.js';
import { registerAllModules } from './registry.js';

async function buildServer() {
  const app = Fastify({
    logger: {
      level: env.LOG_LEVEL,
      transport:
        env.NODE_ENV === 'development'
          ? { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss.l', ignore: 'pid,hostname' } }
          : undefined,
    },
    // Service ini diakses hanya via gateway. Pakai trace_id yang diteruskan gateway
    // supaya satu request punya satu trace_id end-to-end (gateway ↔ administration).
    genReqId: (req) => {
      const fwd = req.headers['x-forwarded-trace-id'];
      if (typeof fwd === 'string' && fwd.length > 0) return fwd;
      return `req_${nanoid(16)}`;
    },
    disableRequestLogging: false,
    trustProxy: true,
  });

  registerErrorHandler(app);

  // Health check — dipakai untuk readiness probe / cek manual.
  app.get('/health', async (req) =>
    successEnvelope(req.id as string, { status: 'ok' }, 'OK'),
  );

  await registerAllModules(app);

  return app;
}

async function start() {
  const app = await buildServer();
  try {
    await app.listen({ port: env.PORT, host: env.HOST });
    app.log.info(`✅ Backend Administration siap di http://${env.HOST}:${env.PORT}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }

  const shutdown = async (signal: string) => {
    app.log.info({ signal }, 'Shutting down gracefully...');
    try {
      await app.close();
      await prisma.$disconnect();
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
