// Session: dual-store di Postgres (sumber kebenaran + audit history) dan Redis
// (fast lookup per-request di middleware).
//
// Postgres: model `Session` (lihat prisma/schema.prisma). Row tetap ada sebagai
// history; field `revokedAt` ditandai saat logout/admin-revoke. Cek aktif:
// `revokedAt IS NULL AND expiresAt > now()`.
//
// Redis: key `session:<sid>` berisi JSON snapshot (untuk avoid hit DB tiap
// request protected) + key `user-sessions:<uid>` SET berisi sid aktif user
// (untuk admin revoke-all). Both expire bersama session TTL.

import { env } from '../config/env.js';
import { prisma } from './prisma.js';
import { redis } from './redis.js';

const SESSION_KEY = (sid: string) => `session:${sid}`;
const USER_SESSIONS_KEY = (uid: string) => `user-sessions:${uid}`;

const REFRESH_TOKEN_PLACEHOLDER = 'no-refresh-token-yet';

export type SessionUserType = 'superadmin' | 'admin' | 'member';
export type SessionUserStatus = 'active' | 'inactive' | 'force_change_password' | 'blocked';

export interface SessionRecord {
  session_id: string;
  user_id: string;
  user_type: SessionUserType;
  status: SessionUserStatus;
  email: string;
  full_name: string;
  ip: string | null;
  user_agent: string | null;
  created_at: string;
  expires_at: string;
}

export interface CreateSessionInput {
  user_id: string;
  user_type: SessionUserType;
  status: SessionUserStatus;
  email: string;
  full_name: string;
  ip?: string | null;
  user_agent?: string | null;
}

export async function createSession(input: CreateSessionInput): Promise<SessionRecord> {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + env.SESSION_TTL_SECONDS * 1000);

  const row = await prisma.session.create({
    data: {
      userId: input.user_id,
      refreshTokenHash: REFRESH_TOKEN_PLACEHOLDER,
      ip: input.ip ?? null,
      userAgent: input.user_agent ?? null,
      expiresAt,
    },
    select: { id: true, createdAt: true, expiresAt: true },
  });

  const record: SessionRecord = {
    session_id: row.id,
    user_id: input.user_id,
    user_type: input.user_type,
    status: input.status,
    email: input.email,
    full_name: input.full_name,
    ip: input.ip ?? null,
    user_agent: input.user_agent ?? null,
    created_at: row.createdAt.toISOString(),
    expires_at: row.expiresAt.toISOString(),
  };

  await redis
    .multi()
    .set(SESSION_KEY(row.id), JSON.stringify(record), 'EX', env.SESSION_TTL_SECONDS)
    .sadd(USER_SESSIONS_KEY(input.user_id), row.id)
    .expire(USER_SESSIONS_KEY(input.user_id), env.SESSION_TTL_SECONDS)
    .exec();

  return record;
}

export async function getSession(sid: string): Promise<SessionRecord | null> {
  const raw = await redis.get(SESSION_KEY(sid));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SessionRecord;
  } catch {
    return null;
  }
}

// Patch field non-kritikal pada record session (mis. setelah Edit Profile)
// supaya /me & req.session tidak basi. TTL session dipertahankan (KEEPTTL).
export async function patchSessionRecord(
  sid: string,
  patch: Partial<Pick<SessionRecord, 'email' | 'full_name'>>,
): Promise<void> {
  const raw = await redis.get(SESSION_KEY(sid));
  if (!raw) return;
  try {
    const record = JSON.parse(raw) as SessionRecord;
    await redis.set(SESSION_KEY(sid), JSON.stringify({ ...record, ...patch }), 'KEEPTTL');
  } catch {
    // record korup — biarkan expire sendiri.
  }
}

export async function destroySession(sid: string): Promise<boolean> {
  const raw = await redis.get(SESSION_KEY(sid));
  const userId = raw ? (safeParseUserId(raw)) : null;

  // Best-effort: tandai revoked di Postgres walau Redis sudah hilang (TTL).
  await prisma.session
    .updateMany({
      where: { id: sid, revokedAt: null },
      data: { revokedAt: new Date() },
    })
    .catch(() => undefined);

  if (!raw) return false;
  const pipeline = redis.multi().del(SESSION_KEY(sid));
  if (userId) pipeline.srem(USER_SESSIONS_KEY(userId), sid);
  await pipeline.exec();
  return true;
}

export async function destroyAllSessionsForUser(userId: string): Promise<number> {
  // Postgres: revoke semua row aktif user.
  const updated = await prisma.session.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });

  // Redis: bersihkan keys (SET index + per-session). Pakai SET sebagai
  // sumber sid; kalau kosong tapi DB punya row, fallback ke DB list.
  const sidsFromRedis = await redis.smembers(USER_SESSIONS_KEY(userId));
  const sidsToDelete = sidsFromRedis.length > 0
    ? sidsFromRedis
    : (await prisma.session.findMany({
        where: { userId, revokedAt: { not: null } },
        select: { id: true },
        take: 100,
      })).map((r) => r.id);

  if (sidsToDelete.length > 0) {
    const pipeline = redis.multi();
    for (const sid of sidsToDelete) pipeline.del(SESSION_KEY(sid));
    pipeline.del(USER_SESSIONS_KEY(userId));
    await pipeline.exec();
  }

  return updated.count;
}

export async function getActiveSessionsCount(userId: string): Promise<number> {
  return prisma.session.count({
    where: {
      userId,
      revokedAt: null,
      expiresAt: { gt: new Date() },
    },
  });
}

export interface ActiveSessionDevice {
  id: string;
  ip: string | null;
  user_agent: string | null;
}

// Daftar sesi aktif user beserta info device (ip + user_agent). Dipakai login
// untuk menentukan apakah sesi aktif yang ada berasal dari device yang sama
// (boleh di-replace) atau device lain (tetap ditolak ALREADY_LOGGED_IN).
export async function getActiveSessionsForUser(userId: string): Promise<ActiveSessionDevice[]> {
  const rows = await prisma.session.findMany({
    where: {
      userId,
      revokedAt: null,
      expiresAt: { gt: new Date() },
    },
    select: { id: true, ip: true, userAgent: true },
  });
  return rows.map((r) => ({ id: r.id, ip: r.ip, user_agent: r.userAgent }));
}

export async function listSessionsForUser(userId: string, limit = 20) {
  return prisma.session.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: limit,
    select: {
      id: true,
      ip: true,
      userAgent: true,
      createdAt: true,
      expiresAt: true,
      revokedAt: true,
      lastActiveAt: true,
    },
  });
}

function safeParseUserId(raw: string): string | null {
  try {
    const obj = JSON.parse(raw) as Partial<SessionRecord>;
    return obj.user_id ?? null;
  } catch {
    return null;
  }
}
