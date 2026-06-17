// Cache layer (Cache-Aside) untuk data portal di gateway.
//
// Portal cache bersifat PER-USER karena hasilnya tergantung role yang dimiliki
// user (mst_produk.role_list ∩ map_user_role). Maka key menyertakan userId.
//
// Key (relatif terhadap keyPrefix `kartolo:` di redis client):
//   portal:products:{userId}
//   portal:roles:{userId}:{produkId}
//   portal:menus:{userId}:{produkId}:{roleId}
//   key fisik = `kartolo:portal:...`
//
// Invalidasi: karena data master (produk/role/menu) dipakai SEMUA user, perubahan
// di administration meng-invalidate SELURUH namespace `portal:*` (broad wipe).
// Perubahan jarang terjadi (data master), jadi broad-invalidation aman.
//
// Prinsip: cache = bonus. Bila Redis error/down, fallback ke DB (fetcher langsung).

import { env } from '../config/env.js';
import { redis } from './redis.js';

// Lua: hapus semua key match pattern via SCAN (non-blocking).
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
 * Cache-aside generic. Cek Redis → miss/err → fetcher() → SET (best-effort).
 * Hasil DB selalu dikembalikan walau Redis gagal.
 */
export async function getCache<T>(
  key: string,
  ttlSeconds: number,
  fetcher: () => Promise<T>,
): Promise<T> {
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
    // Gagal cache → diamkan, data sudah dari DB.
  }
  return fresh;
}

/** Hapus SELURUH cache portal (dipanggil saat data master produk/role/menu/user berubah). */
export async function invalidatePortalCache(): Promise<void> {
  const pattern = `${env.REDIS_KEY_PREFIX}portal:*`;
  try {
    await redis.eval(DELETE_BY_PATTERN_LUA, 0, pattern);
  } catch {
    // best-effort — cache basi expire sendiri lewat TTL.
  }
}

// Builder key portal.
export const portalKey = {
  products: (userId: string) => `portal:products:${userId}`,
  roles: (userId: string, produkId: number) => `portal:roles:${userId}:${produkId}`,
  menus: (userId: string, produkId: number, roleId: number | null) =>
    `portal:menus:${userId}:${produkId}:${roleId ?? 'null'}`,
};

// TTL portal (detik). Pendek karena per-user & data master bisa berubah dari admin.
export const PORTAL_CACHE_TTL = env.PORTAL_CACHE_TTL_SECONDS;
