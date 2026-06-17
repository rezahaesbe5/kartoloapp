import { Prisma } from '@prisma/client';
import * as argon2 from 'argon2';
import { randomBytes } from 'crypto';
import { AppError } from '../../../src/shared/errors/app-error.js';
import { prisma } from '../../../src/shared/lib/prisma.js';
import {
  CACHE_TTL,
  getItemCache,
  getListCache,
  invalidateCache,
} from '../../../src/shared/lib/cache-store.js';
import type { UserCreateBody, UserListBody, UserUpdateBody } from './user.schema.js';

const PASSWORD_LENGTH = 16;
const PASSWORD_CHARS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';

function generateRandomPassword(length: number): string {
  const bytes = randomBytes(length * 2);
  let result = '';
  let i = 0;
  while (result.length < length && i < bytes.length) {
    const byte = bytes[i]!;
    if (byte < 256 - (256 % PASSWORD_CHARS.length)) {
      result += PASSWORD_CHARS[byte % PASSWORD_CHARS.length];
    }
    i++;
  }
  return result;
}

export interface UserRoleItem {
  id: number;
  nama_role: string;
}

export interface UserRow {
  id: string;
  username: string | null;
  email: string;
  full_name: string;
  status: string;
  user_type: string;
  roles: UserRoleItem[];
  email_verified_at: Date | null;
  last_login_at: Date | null;
  failed_login_attempts: number;
  locked_until: Date | null;
  two_factor_enabled: boolean;
  two_factor_enrolled_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface UserListResult {
  items: UserRow[];
  pagination: {
    page: number;
    page_size: number;
    total: number;
    total_pages: number;
  };
}

export interface UserCreateResult {
  user: UserRow;
  plainPassword: string;
}

const sortColumnMap: Record<string, string> = {
  username: 'username',
  email: 'email',
  full_name: 'fullName',
  status: 'status',
};

// Query DB murni (tanpa cache) — fetcher untuk cache-aside.
async function queryUserList(q: UserListBody): Promise<UserListResult> {
  const where: Prisma.UserWhereInput = { userType: q.user_type };

  if (q.search) {
    where.OR = [
      { username: { contains: q.search, mode: 'insensitive' } },
      { email: { contains: q.search, mode: 'insensitive' } },
      { fullName: { contains: q.search, mode: 'insensitive' } },
    ];
  }

  const offset = (q.page - 1) * q.page_size;
  const orderByCol = sortColumnMap[q.sort_by] ?? 'username';

  const [items, total] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: { [orderByCol]: q.sort_dir },
      skip: offset,
      take: q.page_size,
    }),
    prisma.user.count({ where }),
  ]);

  // Ambil semua mapping role utk user di halaman ini, lalu group per user.
  const userIds = items.map((u) => u.id);
  const mappings =
    userIds.length > 0
      ? await prisma.mapUserRole.findMany({
          where: { userId: { in: userIds } },
          select: { userId: true, roleId: true },
        })
      : [];
  const roleIds = [...new Set(mappings.map((m) => m.roleId))];
  const roles =
    roleIds.length > 0
      ? await prisma.mstRole.findMany({
          where: { id: { in: roleIds } },
          select: { id: true, namaRole: true },
        })
      : [];
  const roleNameMap = new Map(roles.map((r) => [r.id, r.namaRole]));
  const rolesByUser = new Map<string, UserRoleItem[]>();
  for (const m of mappings) {
    const list = rolesByUser.get(m.userId) ?? [];
    list.push({ id: m.roleId, nama_role: roleNameMap.get(m.roleId) ?? `#${m.roleId}` });
    rolesByUser.set(m.userId, list);
  }
  for (const list of rolesByUser.values()) {
    list.sort((a, b) => a.nama_role.localeCompare(b.nama_role));
  }

  return {
    items: items.map((u) => ({
      id: u.id,
      username: u.username,
      email: u.email,
      full_name: u.fullName,
      status: u.status,
      user_type: u.userType,
      roles: rolesByUser.get(u.id) ?? [],
      email_verified_at: u.emailVerifiedAt,
      last_login_at: u.lastLoginAt,
      failed_login_attempts: u.failedLoginAttempts,
      locked_until: u.lockedUntil,
      two_factor_enabled: u.twoFactorEnabled,
      two_factor_enrolled_at: u.twoFactorEnrolledAt,
      created_at: u.createdAt,
      updated_at: u.updatedAt,
    })),
    pagination: {
      page: q.page,
      page_size: q.page_size,
      total,
      total_pages: Math.max(1, Math.ceil(total / q.page_size)),
    },
  };
}

export async function listUsers(q: UserListBody): Promise<UserListResult> {
  return getListCache('user', q, CACHE_TTL.user.list, () => queryUserList(q));
}

// Helper: fetch user + role mappings dari DB (fetcher untuk cache-aside).
async function fetchUserRow(id: string): Promise<UserRow | null> {
  const u = await prisma.user.findUnique({ where: { id } });
  if (!u) return null;
  const mappings = await prisma.mapUserRole.findMany({
    where: { userId: id },
    select: { roleId: true },
  });
  const roleIds = mappings.map((m) => m.roleId);
  const roleRows = roleIds.length > 0
    ? await prisma.mstRole.findMany({ where: { id: { in: roleIds } }, select: { id: true, namaRole: true } })
    : [];
  const roles: UserRoleItem[] = roleRows
    .map((r) => ({ id: r.id, nama_role: r.namaRole }))
    .sort((a, b) => a.nama_role.localeCompare(b.nama_role));
  return {
    id: u.id, username: u.username, email: u.email, full_name: u.fullName,
    status: u.status, user_type: u.userType, roles,
    email_verified_at: u.emailVerifiedAt, last_login_at: u.lastLoginAt,
    failed_login_attempts: u.failedLoginAttempts, locked_until: u.lockedUntil,
    two_factor_enabled: u.twoFactorEnabled, two_factor_enrolled_at: u.twoFactorEnrolledAt,
    created_at: u.createdAt, updated_at: u.updatedAt,
  };
}

// Detail satu user (cache-aside). Return null bila tidak ditemukan.
export async function getUser(id: string): Promise<UserRow | null> {
  return getItemCache('user', id, CACHE_TTL.user.item, () => fetchUserRow(id));
}

export async function createUser(body: UserCreateBody): Promise<UserCreateResult> {
  // Cek email unik
  const existing = await prisma.user.findUnique({
    where: { email: body.email.toLowerCase() },
    select: { id: true },
  });
  if (existing) {
    throw new Error('Email sudah digunakan oleh user lain.');
  }

  // Cek username unik (jika username diisi)
  if (body.username) {
    const existingUsername = await prisma.user.findUnique({
      where: { username: body.username },
      select: { id: true },
    });
    if (existingUsername) {
      throw new Error('Username sudah digunakan.');
    }
  }

  const plainPassword = generateRandomPassword(PASSWORD_LENGTH);
  const passwordHash = await argon2.hash(plainPassword);

  // Role tidak lagi diisi saat create — mapping dilakukan terpisah lewat
  // endpoint set-role-mappings (tombol "Mapping Role User" di tabel).
  const row = await prisma.user.create({
    data: {
      email: body.email.toLowerCase(),
      username: body.username,
      passwordHash,
      fullName: body.full_name,
      userType: body.user_type,
      status: 'force_change_password',
    },
  });

  await invalidateCache('user', row.id);

  return {
    user: {
      id: row.id,
      username: row.username,
      email: row.email,
      full_name: row.fullName,
      status: row.status,
      user_type: row.userType,
      roles: [],
      email_verified_at: row.emailVerifiedAt,
      last_login_at: row.lastLoginAt,
      failed_login_attempts: row.failedLoginAttempts,
      locked_until: row.lockedUntil,
      two_factor_enabled: row.twoFactorEnabled,
      two_factor_enrolled_at: row.twoFactorEnrolledAt,
      created_at: row.createdAt,
      updated_at: row.updatedAt,
    },
    plainPassword,
  };
}

export async function updateUser(body: UserUpdateBody): Promise<UserRow> {
  // Cek email unik (exclude diri sendiri)
  const existing = await prisma.user.findUnique({
    where: { email: body.email.toLowerCase() },
    select: { id: true },
  });
  if (existing && existing.id !== body.id) {
    throw new Error('Email sudah digunakan oleh user lain.');
  }

  // Cek username unik (exclude diri sendiri)
  if (body.username) {
    const existingUsername = await prisma.user.findUnique({
      where: { username: body.username },
      select: { id: true },
    });
    if (existingUsername && existingUsername.id !== body.id) {
      throw new Error('Username sudah digunakan.');
    }
  }

  // Role tidak diubah di sini — dikelola lewat endpoint set-role-mappings.
  const row = await prisma.user.update({
    where: { id: body.id },
    data: {
      email: body.email.toLowerCase(),
      username: body.username,
      fullName: body.full_name,
    },
  });

  // Ambil mapping role terkini supaya respons konsisten dgn bentuk list.
  const mappings = await prisma.mapUserRole.findMany({
    where: { userId: row.id },
    select: { roleId: true },
  });
  const roleIds = mappings.map((m) => m.roleId);
  const roleRows =
    roleIds.length > 0
      ? await prisma.mstRole.findMany({
          where: { id: { in: roleIds } },
          select: { id: true, namaRole: true },
        })
      : [];
  const roles: UserRoleItem[] = roleRows
    .map((r) => ({ id: r.id, nama_role: r.namaRole }))
    .sort((a, b) => a.nama_role.localeCompare(b.nama_role));

  await invalidateCache('user', row.id);

  return {
    id: row.id,
    username: row.username,
    email: row.email,
    full_name: row.fullName,
    status: row.status,
    user_type: row.userType,
    roles,
    email_verified_at: row.emailVerifiedAt,
    last_login_at: row.lastLoginAt,
    failed_login_attempts: row.failedLoginAttempts,
    locked_until: row.lockedUntil,
    two_factor_enabled: row.twoFactorEnabled,
    two_factor_enrolled_at: row.twoFactorEnrolledAt,
    created_at: row.createdAt,
    updated_at: row.updatedAt,
  };
}

export async function deleteUser(id: string): Promise<void> {
  await prisma.user.delete({ where: { id } });
  await invalidateCache('user', id);
}

// ---- Mapping Role User -------------------------------------------------------

export interface UserRoleMappingsResult {
  user_id: string;
  role_ids: number[];
}

// Daftar role_id yang saat ini dimapping ke user (untuk prefill modal).
export async function listUserRoleMappings(userId: string): Promise<UserRoleMappingsResult> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!user) {
    throw new AppError('not_found', { message: 'User tidak ditemukan.', code: 'USER_NOT_FOUND' });
  }
  const rows = await prisma.mapUserRole.findMany({
    where: { userId },
    select: { roleId: true },
    orderBy: { roleId: 'asc' },
  });
  return { user_id: userId, role_ids: rows.map((r) => r.roleId) };
}

// Replace-all mapping role user: hapus semua mapping lama, set ke role_ids baru.
// role_ids di-dedup; divalidasi semua role_id benar-benar ada di mst_role.
export async function setUserRoleMappings(
  userId: string,
  roleIds: number[],
): Promise<UserRoleMappingsResult> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!user) {
    throw new AppError('not_found', { message: 'User tidak ditemukan.', code: 'USER_NOT_FOUND' });
  }

  const uniqueIds = [...new Set(roleIds)];

  // Validasi semua role ada (hindari FK error & beri pesan jelas).
  if (uniqueIds.length > 0) {
    const existing = await prisma.mstRole.findMany({
      where: { id: { in: uniqueIds } },
      select: { id: true },
    });
    if (existing.length !== uniqueIds.length) {
      throw new AppError('body_invalid', {
        message: 'Sebagian role tidak ditemukan.',
        code: 'ROLE_NOT_FOUND',
      });
    }
  }

  await prisma.$transaction([
    prisma.mapUserRole.deleteMany({ where: { userId } }),
    ...(uniqueIds.length > 0
      ? [
          prisma.mapUserRole.createMany({
            data: uniqueIds.map((roleId) => ({ userId, roleId })),
            skipDuplicates: true,
          }),
        ]
      : []),
  ]);

  await invalidateCache('user', userId);
  return { user_id: userId, role_ids: uniqueIds.sort((a, b) => a - b) };
}

// ---- Produk + role (untuk modal mapping: pilih produk → role di role_list) ----

export interface ProductWithRoles {
  id: number;
  nama_produk: string;
  url_produk: string | null;
  roles: UserRoleItem[];
}

// Daftar produk aktif beserta role yang ada di role_list-nya (untuk dropdown
// modal Mapping Role User: pilih produk → role yang tampil hanya milik produk).
export async function listProductsWithRoles(): Promise<ProductWithRoles[]> {
  const products = await prisma.mstProduk.findMany({
    where: { activeFlag: true },
    orderBy: { id: 'asc' },
    select: { id: true, namaProduk: true, urlProduk: true, roleList: true },
  });

  const allRoleIds = [
    ...new Set(
      products.flatMap((p) =>
        (p.roleList ?? '')
          .split(';')
          .map((s) => s.trim())
          .filter((s) => s.length > 0)
          .map((s) => Number(s))
          .filter((n) => Number.isInteger(n)),
      ),
    ),
  ];
  const roleRows =
    allRoleIds.length > 0
      ? await prisma.mstRole.findMany({
          where: { id: { in: allRoleIds } },
          select: { id: true, namaRole: true },
        })
      : [];
  const roleNameMap = new Map(roleRows.map((r) => [r.id, r.namaRole]));

  return products.map((p) => {
    const ids = (p.roleList ?? '')
      .split(';')
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
      .map((s) => Number(s))
      .filter((n) => Number.isInteger(n));
    const roles: UserRoleItem[] = ids
      .filter((id) => roleNameMap.has(id))
      .map((id) => ({ id, nama_role: roleNameMap.get(id)! }))
      .sort((a, b) => a.nama_role.localeCompare(b.nama_role));
    return { id: p.id, nama_produk: p.namaProduk, url_produk: p.urlProduk, roles };
  });
}

export interface ResetPasswordResult {
  password: string;
}

// Reset password user: hanya boleh untuk user status 'active'. Generate password
// sementara baru (format sama dgn create), reset kunci login, dan paksa user ganti
// password saat login berikutnya (status -> force_change_password).
export async function resetPasswordService(id: string): Promise<ResetPasswordResult> {
  const user = await prisma.user.findUnique({
    where: { id },
    select: { id: true, status: true },
  });
  if (!user) {
    throw new AppError('not_found', {
      message: 'User tidak ditemukan.',
      code: 'USER_NOT_FOUND',
    });
  }
  if (user.status !== 'active') {
    throw new AppError('body_invalid', {
      message: 'Reset password hanya bisa untuk user dengan status aktif.',
      code: 'USER_NOT_ACTIVE',
    });
  }

  const plainPassword = generateRandomPassword(PASSWORD_LENGTH);
  const passwordHash = await argon2.hash(plainPassword);

  await prisma.user.update({
    where: { id },
    data: {
      passwordHash,
      failedLoginAttempts: 0,
      lockedUntil: null,
      status: 'force_change_password',
    },
  });

  await invalidateCache('user', id);
  return { password: plainPassword };
}

// Ubah status user + bersihkan kunci login (failed attempts & locked_until).
export async function updateStatusService(
  id: string,
  status: 'active' | 'inactive' | 'blocked',
): Promise<void> {
  await prisma.user.update({
    where: { id },
    data: {
      status,
      failedLoginAttempts: 0,
      lockedUntil: null,
    },
  });
  await invalidateCache('user', id);
}

// Lepas kunci login sementara (reset failed attempts & locked_until) tanpa ubah status.
export async function resetBlockService(id: string): Promise<void> {
  await prisma.user.update({
    where: { id },
    data: {
      failedLoginAttempts: 0,
      lockedUntil: null,
    },
  });
  await invalidateCache('user', id);
}

// Admin override: nonaktifkan MFA milik user tanpa verifikasi TOTP (berbeda dari
// self-service disable yang wajib kode). Bersihkan secret + enrolled_at + flag, dan
// hapus semua recovery code milik user. Transaksi atomik. Idempotent-ish: tetap
// menolak kalau MFA memang belum aktif agar admin dapat feedback yang jelas.
export async function disableMfaService(id: string): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id },
    select: { twoFactorEnabled: true, twoFactorSecretEncrypted: true },
  });
  if (!user) {
    throw new AppError('not_found', {
      message: 'User tidak ditemukan.',
      code: 'USER_NOT_FOUND',
    });
  }
  if (!user.twoFactorEnabled && !user.twoFactorSecretEncrypted) {
    throw new AppError('body_invalid', {
      message: 'MFA belum aktif untuk user ini.',
      code: 'MFA_NOT_ENABLED',
    });
  }

  await prisma.$transaction([
    prisma.user.update({
      where: { id },
      data: {
        twoFactorEnabled: false,
        twoFactorSecretEncrypted: null,
        twoFactorEnrolledAt: null,
      },
    }),
    prisma.mfaRecoveryCode.deleteMany({ where: { userId: id } }),
  ]);
  await invalidateCache('user', id);
}
