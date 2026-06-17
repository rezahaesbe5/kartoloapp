// Shared cache layer (Cache-Aside / Lazy Loading) untuk modul administration.
//
// Pola:
//   - READ  : getListCache / getItemCache → cek Redis dulu, miss → fetcher() (DB) → SET dgn TTL.
//   - WRITE  : create/update/delete panggil invalidateListCache / invalidateItemCache.
//
// Key (relatif terhadap keyPrefix `kartolo:ad:` di redis client):
//   list : {module}:list:{hash(query)}
//   item : {module}:item:{id}
//   key fisik di Redis = `kartolo:ad:{module}:list:...`
//
// Prinsip: cache adalah BONUS, bukan requirement. Bila Redis error/down, semua
// fungsi fallback ke DB (fetcher dipanggil langsung) — aplikasi tetap jalan.

import { createHash } from 'node:crypto';
import { env } from '../config/env.js';
import { redis } from './redis.js';

export type CacheModule = 'produk' | 'role' | 'user' | 'audit';

const listKey = (module: CacheModule, query: unknown): string => {
  const hash = createHash('sha1').update(JSON.stringify(query ?? {})).digest('hex').slice(0, 16);
  return `${module}:list:${hash}`;
};

const itemKey = (module: CacheModule, id: string | number): string => `${module}:item:${id}`;

// Lua: hapus semua key yang match pattern via SCAN (non-blocking, tidak pakai KEYS).
// ARGV[1] = full pattern (sudah termasuk keyPrefix karena SCAN server-side tak kena prefix client).
const DELETE_BY_PATTERN_LUA = `
local cursor = "0"
local deleted = 0
repeat
  local res = redis.call("SCAN", cursor, "MATCH", ARGV[1], "COUNT", 200)
  cursor = res[1]
  local keys = res[2]
  for i = 1, #keys do
    redis.call("DEL", keys[i])
    deleted = deleted + 1
  end
until cursor == "0"
return deleted
`;

/**
 * Cache-aside untuk list. Cek Redis → miss/err → fetcher() → SET (best-effort).
 * Hasil DB selalu dikembalikan walau Redis gagal.
 */
export async function getListCache<T>(
  module: CacheModule,
  query: unknown,
  ttlSeconds: number,
  fetcher: () => Promise<T>,
): Promise<T> {
  const key = listKey(module, query);
  try {
    const cached = await redis.get(key);
    if (cached !== null) return JSON.parse(cached) as T;
  } catch {
    // Redis down/err → langsung ke DB.
  }

  const fresh = await fetcher();

  try {
    await redis.set(key, JSON.stringify(fresh), 'EX', ttlSeconds);
  } catch {
    // Gagal cache → diamkan, data sudah didapat dari DB.
  }
  return fresh;
}

/**
 * Cache-aside untuk item/detail. fetcher boleh return null (not found) — null
 * TIDAK di-cache (hindari cache penalti untuk id tak valid / negative caching).
 */
export async function getItemCache<T>(
  module: CacheModule,
  id: string | number,
  ttlSeconds: number,
  fetcher: () => Promise<T | null>,
): Promise<T | null> {
  const key = itemKey(module, id);
  try {
    const cached = await redis.get(key);
    if (cached !== null) return JSON.parse(cached) as T;
  } catch {
    // fallthrough → DB
  }

  const fresh = await fetcher();
  if (fresh === null) return null;

  try {
    await redis.set(key, JSON.stringify(fresh), 'EX', ttlSeconds);
  } catch {
    // diamkan
  }
  return fresh;
}

/** Hapus SEMUA cache list milik module (dipanggil saat create/update/delete). */
export async function invalidateListCache(module: CacheModule): Promise<void> {
  const pattern = `${env.REDIS_KEY_PREFIX}${module}:list:*`;
  try {
    await redis.eval(DELETE_BY_PATTERN_LUA, 0, pattern);
  } catch {
    // best-effort — cache basi akan expire sendiri lewat TTL.
  }
}

/** Hapus cache item/detail tunggal (dipanggil saat update/delete). */
export async function invalidateItemCache(module: CacheModule, id: string | number): Promise<void> {
  try {
    await redis.del(itemKey(module, id));
  } catch {
    // best-effort
  }
}

/** Helper gabungan: invalidate list + (opsional) item dalam satu panggilan.
 *  Setelah invalidate local cache, PUBLISH event ke channel Pub/Sub supaya
 *  subscriber (gateway) tahu apa yang perlu di-invalidate di sisi mereka. */
export async function invalidateCache(module: CacheModule, id?: string | number): Promise<void> {
  //1. Invalidate local cache (admin side).
  await Promise.all([
    invalidateListCache(module),
    id !== undefined ? invalidateItemCache(module, id) : Promise.resolve(),
  ]);

  // 2. Broadcast ke channel Pub/Sub (gateway side akan subscribe).
  // Payload minimal: module + id (optional). Gateway interpretasi sendiri.
  const payload = JSON.stringify({ module, id: id ?? null });
  try {
    await redis.publish(env.CACHE_INVALIDATION_CHANNEL, payload);
  } catch {
    // best-effort — local invalidation sudah jalan; Pub/Sub gagal ≠ invalidate gagal.
  }
}

// TTL default per module (detik). List pendek, item lebih panjang.
export const CACHE_TTL: Record<CacheModule, { list: number; item: number }> = {
  produk: { list: env.CACHE_LIST_TTL_SECONDS, item: env.CACHE_ITEM_TTL_SECONDS },
  role: { list: env.CACHE_LIST_TTL_SECONDS, item: env.CACHE_ITEM_TTL_SECONDS },
  user: { list: 30, item: 60 },
  audit: { list: 10, item: 30 },
};
