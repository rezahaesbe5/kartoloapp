// Redis Pub/Sub subscriber untuk invalidasi cache lintas-backend.
//
// Administration (publisher) PUBLISH ke channel `kartolo:cache:invalidate`
// setiap kali data master (produk/role/user/menu) berubah. Gateway subscribe
// channel itu dan meng-invalidate cache portal-nya secara realtime.
//
// PENTING: ioredis connection yang masuk mode SUBSCRIBE tidak bisa menjalankan
// command biasa (get/set/eval). Maka subscriber WAJIB koneksi terpisah dari
// `redis` client utama — di sini kita pakai redis.duplicate().

import { env } from '../config/env.js';
import { redis } from './redis.js';
import { invalidatePortalCache } from './cache-store.js';

// Modul yang, bila berubah di administration, memengaruhi cache portal di gateway.
// produk → daftar produk & role_list; role → nama role & visibility; user →
// mapping role user (akses produk berubah). audit tidak memengaruhi portal.
const PORTAL_AFFECTING_MODULES = new Set(['produk', 'role', 'user']);

interface InvalidationMessage {
  module?: string;
  id?: string | number | null;
}

interface SubLogger {
  info: (obj: unknown, msg?: string) => void;
  warn: (obj: unknown, msg?: string) => void;
  error: (obj: unknown, msg?: string) => void;
}

let _subscriber: ReturnType<typeof redis.duplicate> | null = null;

export function startCacheSubscriber(log: SubLogger): void {
  // Koneksi terpisah khusus subscribe (tidak boleh dipakai command lain).
  const subscriber = redis.duplicate();
  _subscriber = subscriber;

  subscriber.on('error', (err) => {
    log.warn({ err: err.message }, '[cache-sub] subscriber connection error');
  });

  subscriber.subscribe(env.CACHE_INVALIDATION_CHANNEL, (err, count) => {
    if (err) {
      log.error({ err: err.message, channel: env.CACHE_INVALIDATION_CHANNEL }, '[cache-sub] subscribe gagal');
      return;
    }
    log.info(
      { channel: env.CACHE_INVALIDATION_CHANNEL, subscriptions: count },
      '[cache-sub] subscribed — siap terima invalidasi cache dari administration',
    );
  });

  subscriber.on('message', (channel, message) => {
    if (channel !== env.CACHE_INVALIDATION_CHANNEL) return;

    let parsed: InvalidationMessage;
    try {
      parsed = JSON.parse(message) as InvalidationMessage;
    } catch {
      log.warn({ message }, '[cache-sub] payload invalid (bukan JSON) — diabaikan');
      return;
    }

    // Hanya invalidate portal cache bila modul yang berubah memang memengaruhinya.
    if (parsed.module && PORTAL_AFFECTING_MODULES.has(parsed.module)) {
      void invalidatePortalCache()
        .then(() => {
          log.info({ module: parsed.module, id: parsed.id ?? null }, '[cache-sub] portal cache di-invalidate');
        })
        .catch((err: unknown) => {
          log.warn({ err: err instanceof Error ? err.message : String(err) }, '[cache-sub] gagal invalidate portal cache');
        });
    }
  });
}

/** Cleanup: unsubscribe + disconnect subscriber connection on shutdown. */
export async function stopCacheSubscriber(): Promise<void> {
  if (!_subscriber) return;
  try {
    await _subscriber.quit();
  } catch {
    // ignore
  }
  _subscriber = null;
}
