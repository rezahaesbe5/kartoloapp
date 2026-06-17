import argon2 from 'argon2';
import type { User } from '@prisma/client';
import { z } from 'zod';
import { AppError } from '../../../src/shared/errors/app-error.js';
import { decryptPassword } from '../../../src/shared/lib/crypto-aes.js';
import {
  destroyAllSessionsForUser,
  patchSessionRecord,
} from '../../../src/shared/lib/session-store.js';
import { authRepository } from './auth.repository.js';
import {
  ChangePasswordSchema,
  NewPasswordSchema,
  UpdateProfileSchema,
} from './auth.schema.js';

export interface ProfileDetail {
  id: string;
  username: string | null;
  email: string;
  full_name: string;
  user_type: 'superadmin' | 'admin' | 'member';
  status: 'active' | 'inactive' | 'force_change_password' | 'blocked';
  created_at: string;
  last_login_at: string | null;
}

function toProfileDetail(user: User): ProfileDetail {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    full_name: user.fullName,
    user_type: user.userType,
    status: user.status,
    created_at: user.createdAt.toISOString(),
    last_login_at: user.lastLoginAt ? user.lastLoginAt.toISOString() : null,
  };
}

// Parse body dengan Zod; kalau gagal lempar AppError yang membawa nama field
// supaya frontend bisa menampilkan error tepat di input terkait.
function parseOrThrow<T>(schema: z.ZodSchema<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (result.success) return result.data;
  const issue = result.error.issues[0];
  const field = issue && issue.path.length > 0 ? String(issue.path[0]) : undefined;
  throw new AppError('body_invalid', {
    message: issue?.message ?? 'Data permintaan tidak valid',
    code: 'VALIDATION_ERROR',
    details: field ? { field } : undefined,
  });
}

export async function getProfileService(userId: string): Promise<ProfileDetail> {
  const user = await authRepository.findById(userId);
  if (!user) {
    throw new AppError('not_found', { message: 'User tidak ditemukan', code: 'USER_NOT_FOUND' });
  }
  return toProfileDetail(user);
}

export async function updateProfileService(
  userId: string,
  sessionId: string,
  body: unknown,
): Promise<ProfileDetail> {
  const input = parseOrThrow(UpdateProfileSchema, body);
  const email = input.email.trim().toLowerCase();
  const fullName = input.full_name.trim();

  const duplicate = await authRepository.findByEmailExcludingId(email, userId);
  if (duplicate) {
    throw new AppError('body_invalid', {
      message: 'Email sudah digunakan oleh akun lain.',
      code: 'EMAIL_DUPLICATE',
      details: { field: 'email' },
    });
  }

  const updated = await authRepository.updateProfile(userId, { email, fullName });
  // Sinkronkan record session di Redis supaya /me & req.session tidak basi.
  await patchSessionRecord(sessionId, { email: updated.email, full_name: updated.fullName });
  return toProfileDetail(updated);
}

export async function changePasswordService(
  userId: string,
  clientKey: string,
  body: unknown,
): Promise<{ changed: boolean }> {
  const input = parseOrThrow(ChangePasswordSchema, body);
  const oldPassword = decryptPassword(input.old_password, clientKey);
  const newPassword = decryptPassword(input.new_password, clientKey);

  // Validasi kekuatan password baru terhadap plaintext hasil decrypt.
  const strength = NewPasswordSchema.safeParse(newPassword);
  if (!strength.success) {
    throw new AppError('body_invalid', {
      message: strength.error.issues[0]?.message ?? 'Password baru tidak valid',
      code: 'WEAK_PASSWORD',
      details: { field: 'new_password' },
    });
  }

  const user = await authRepository.findById(userId);
  if (!user) {
    throw new AppError('not_found', { message: 'User tidak ditemukan', code: 'USER_NOT_FOUND' });
  }

  const oldOk = await argon2.verify(user.passwordHash, oldPassword);
  if (!oldOk) {
    throw new AppError('body_invalid', {
      message: 'Password lama salah.',
      code: 'OLD_PASSWORD_MISMATCH',
      details: { field: 'old_password' },
    });
  }

  if (oldPassword === newPassword) {
    throw new AppError('body_invalid', {
      message: 'Password baru tidak boleh sama dengan password lama.',
      code: 'NEW_PASSWORD_SAME',
      details: { field: 'new_password' },
    });
  }

  const passwordHash = await argon2.hash(newPassword, {
    type: argon2.argon2id,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  });
  // User yang dipaksa ganti password saat login → aktifkan kembali setelah sukses.
  const activate = user.status === 'force_change_password';
  await authRepository.updatePassword(userId, passwordHash, activate);

  // Flow force-change-password: revoke SEMUA sesi user supaya dia harus login
  // ulang dengan password baru. Tanpa ini, sesi lama tetap hidup dan single-session
  // enforcement menolak login berikutnya dengan ALREADY_LOGGED_IN (rc=92).
  // Untuk ganti password biasa dari menu pengaturan (status sudah active), sesi
  // sekarang dipertahankan supaya user tidak ter-logout tak terduga.
  if (activate) {
    await destroyAllSessionsForUser(userId);
  }

  return { changed: true };
}
