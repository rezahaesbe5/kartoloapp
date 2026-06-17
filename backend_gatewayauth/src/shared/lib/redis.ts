import Redis from 'ioredis';
import { env } from '../config/env.js';

declare global {
  // eslint-disable-next-line no-var
  var __redis: Redis | undefined;
}

function createClient(): Redis {
  const client = new Redis(env.REDIS_URL, {
    keyPrefix: env.REDIS_KEY_PREFIX,
    lazyConnect: false,
    maxRetriesPerRequest: 2,
    enableReadyCheck: true,
    reconnectOnError(err) {
      return err.message.includes('READONLY');
    },
  });
  client.on('error', (err) => {
    // Hindari log spam — cuma log error pertama, dst akan diam.
    if (!(client as Redis & { __errorLogged?: boolean }).__errorLogged) {
      console.error('[redis] connection error:', err.message);
      (client as Redis & { __errorLogged?: boolean }).__errorLogged = true;
    }
  });
  client.on('ready', () => {
    console.log(`[redis] ready (prefix=${env.REDIS_KEY_PREFIX})`);
    (client as Redis & { __errorLogged?: boolean }).__errorLogged = false;
  });
  return client;
}

export const redis: Redis = globalThis.__redis ?? createClient();
if (env.NODE_ENV !== 'production') {
  globalThis.__redis = redis;
}

export async function pingRedis(): Promise<boolean> {
  try {
    const pong = await redis.ping();
    return pong === 'PONG';
  } catch {
    return false;
  }
}
