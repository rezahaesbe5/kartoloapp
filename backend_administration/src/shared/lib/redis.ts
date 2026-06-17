import Redis from 'ioredis';
import { env } from '../config/env.js';

declare global {
  // eslint-disable-next-line no-var
  var __redisAdmin: Redis | undefined;
}

function createClient(): Redis {
  const client = new Redis(env.REDIS_URL, {
    keyPrefix: env.REDIS_KEY_PREFIX,
    lazyConnect: false,
    // Cache adalah bonus — bila Redis lambat/down, fail-fast supaya request cepat
    // fallback ke DB alih-alih menunggu retry berlapis.
    maxRetriesPerRequest: 1,
    commandTimeout: 500,
    enableOfflineQueue: false,
    enableReadyCheck: true,
    reconnectOnError(err) {
      return err.message.includes('READONLY');
    },
  });
  client.on('error', (err) => {
    if (!(client as Redis & { __errorLogged?: boolean }).__errorLogged) {
      console.error('[redis-admin] connection error:', err.message);
      (client as Redis & { __errorLogged?: boolean }).__errorLogged = true;
    }
  });
  client.on('ready', () => {
    console.log(`[redis-admin] ready (prefix=${env.REDIS_KEY_PREFIX})`);
    (client as Redis & { __errorLogged?: boolean }).__errorLogged = false;
  });
  return client;
}

export const redis: Redis = globalThis.__redisAdmin ?? createClient();
if (env.NODE_ENV !== 'production') {
  globalThis.__redisAdmin = redis;
}

export async function pingRedis(): Promise<boolean> {
  try {
    const pong = await redis.ping();
    return pong === 'PONG';
  } catch {
    return false;
  }
}