// MFA TOTP service.
//
// Lock semantics:
//   - User dianggap "MFA enrolled" kalau `twoFactorSecretEncrypted != null`.
//   - Selama itu, `beginEnrollment` ditolak (harus disable dulu). Ini yang
//     bikin authenticator B tidak bisa dipakai sebelum authenticator A
//     diputus via flow disable di app.
//   - Pending enrollment hidup di Redis 5 menit, BUKAN di DB. Kalau user
//     scan QR lalu tutup tab, lock release otomatis. Lock baru "kunci"
//     setelah confirmEnrollment sukses (DB write).
//
// Recovery codes:
//   - 10 single-use codes di-generate saat confirmEnrollment & saat regenerate.
//   - Plaintext HANYA muncul 1x di response → user wajib save sekarang.
//   - Disimpan di tabel mfa_recovery_codes dengan argon2 hash (sama dengan
//     password, beda hash per code, no salt sharing).
//   - Login MFA verify menerima 6-digit TOTP ATAU 12-char recovery code (3 grup x 4).
//   - disableMfa cascade hapus semua codes (FK onDelete: Cascade).
//
// Login challenge:
//   - Setelah password valid + user.twoFactorEnabled=true, login tidak langsung
//     issue session. Kita keluarkan mfa_token (random opaque) yang disimpan di
//     Redis `mfa-challenge:<token>` TTL 5 menit dengan payload context login
//     (user_id, ip, ua). Frontend POST ke /auth/mfa/verify untuk redeem.

import argon2 from 'argon2';
import { generateSecret, generateURI, verifySync } from 'otplib';
import { randomBytes, randomInt } from 'node:crypto';
import { prisma } from '../../../src/shared/lib/prisma.js';
import { redis } from '../../../src/shared/lib/redis.js';
import { env } from '../../../src/shared/config/env.js';
import { AppError } from '../../../src/shared/errors/app-error.js';
import { encryptMfaSecret, decryptMfaSecret } from '../../../src/shared/lib/mfa-crypto.js';

// Tolerance ±1 step (30 detik) untuk akomodasi clock skew kecil di HP.
const VERIFY_TOLERANCE: [number, number] = [30, 30];

// Charset recovery code: tanpa 0/O/1/I/L untuk hindari rancu visual.
const RECOVERY_CHARSET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const RECOVERY_GROUPS = 3;
const RECOVERY_GROUP_LEN = 4;
const RECOVERY_CODE_COUNT = 10;

const ENROLL_KEY = (userId: string) => `mfa-enroll:${userId}`;
const CHALLENGE_KEY = (token: string) => `mfa-challenge:${token}`;

export interface MfaStatus {
  enabled: boolean;
  enrolled_at: string | null;
}

export interface MfaStatusWithRecovery extends MfaStatus {
  recovery_codes_remaining: number;
  recovery_codes_total: number;
  recovery_codes_generated_at: string | null;
}

export interface BeginEnrollmentResult {
  otpauth_url: string;
  secret_base32: string;
}

export interface ConfirmEnrollmentResult extends MfaStatus {
  recovery_codes: string[]; // plaintext, sekali tampil
}

export interface RegenerateRecoveryCodesResult {
  recovery_codes: string[];
  generated_at: string;
}

export interface RecoveryCodesSummary {
  remaining: number;
  total: number;
  generated_at: string | null;
}

export interface MfaChallengePayload {
  user_id: string;
  ip: string | null;
  user_agent: string | null;
}

function ensureCode(code: unknown): string {
  if (typeof code !== 'string' || !/^\d{6}$/.test(code)) {
    throw new AppError('body_invalid', {
      message: 'Kode MFA harus 6 digit angka.',
      code: 'MFA_CODE_INVALID',
      details: { field: 'code' },
    });
  }
  return code;
}

function verifyTotp(secret: string, token: string): boolean {
  const result = verifySync({ secret, token, epochTolerance: VERIFY_TOLERANCE });
  return result.valid;
}

// Normalisasi format recovery code: uppercase, strip selain charset, sisipkan dash.
// Input fleksibel ("abcd-efgh-jkmn", "abcdefghjkmn", "abcd efgh jkmn") → "ABCD-EFGH-JKMN".
function normalizeRecoveryCode(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const cleaned = raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const expectedLen = RECOVERY_GROUPS * RECOVERY_GROUP_LEN;
  if (cleaned.length !== expectedLen) return null;
  for (const ch of cleaned) {
    if (!RECOVERY_CHARSET.includes(ch)) return null;
  }
  const parts: string[] = [];
  for (let i = 0; i < RECOVERY_GROUPS; i++) {
    parts.push(cleaned.slice(i * RECOVERY_GROUP_LEN, (i + 1) * RECOVERY_GROUP_LEN));
  }
  return parts.join('-');
}

function randomRecoveryCode(): string {
  const groups: string[] = [];
  for (let g = 0; g < RECOVERY_GROUPS; g++) {
    let s = '';
    for (let i = 0; i < RECOVERY_GROUP_LEN; i++) {
      s += RECOVERY_CHARSET[randomInt(0, RECOVERY_CHARSET.length)];
    }
    groups.push(s);
  }
  return groups.join('-');
}

// Generate batch baru + replace semua di DB (transactional). Pakai argon2 dengan
// param lebih ringan dari password (codes high-entropy, brute force lambat).
async function replaceRecoveryCodes(userId: string): Promise<string[]> {
  const plain: string[] = [];
  const used = new Set<string>();
  while (plain.length < RECOVERY_CODE_COUNT) {
    const c = randomRecoveryCode();
    if (used.has(c)) continue;
    used.add(c);
    plain.push(c);
  }

  const hashes = await Promise.all(
    plain.map((c) =>
      argon2.hash(c, { type: argon2.argon2id, memoryCost: 12288, timeCost: 2, parallelism: 1 }),
    ),
  );

  await prisma.$transaction([
    prisma.mfaRecoveryCode.deleteMany({ where: { userId } }),
    prisma.mfaRecoveryCode.createMany({
      data: hashes.map((h) => ({ userId, codeHash: h })),
    }),
  ]);

  return plain;
}

export async function getMfaStatus(userId: string): Promise<MfaStatusWithRecovery> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      twoFactorEnabled: true,
      twoFactorEnrolledAt: true,
    },
  });
  if (!user) {
    throw new AppError('not_found', { message: 'User tidak ditemukan', code: 'USER_NOT_FOUND' });
  }

  const summary = await getRecoveryCodesSummary(userId);

  return {
    enabled: user.twoFactorEnabled,
    enrolled_at: user.twoFactorEnrolledAt ? user.twoFactorEnrolledAt.toISOString() : null,
    recovery_codes_remaining: summary.remaining,
    recovery_codes_total: summary.total,
    recovery_codes_generated_at: summary.generated_at,
  };
}

export async function getRecoveryCodesSummary(userId: string): Promise<RecoveryCodesSummary> {
  const codes = await prisma.mfaRecoveryCode.findMany({
    where: { userId },
    select: { usedAt: true, createdAt: true },
  });
  if (codes.length === 0) {
    return { remaining: 0, total: 0, generated_at: null };
  }
  const remaining = codes.filter((c) => c.usedAt == null).length;
  // Semua codes dalam 1 batch dibuat dalam 1 transaksi → createdAt sama;
  // ambil yang terbaru biar safe kalau ada drift mikrodetik.
  const generated = codes.reduce(
    (acc, c) => (c.createdAt > acc ? c.createdAt : acc),
    codes[0]!.createdAt,
  );
  return { remaining, total: codes.length, generated_at: generated.toISOString() };
}

export async function beginEnrollment(
  userId: string,
  accountLabel: string,
): Promise<BeginEnrollmentResult> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { twoFactorEnabled: true, twoFactorSecretEncrypted: true },
  });
  if (!user) {
    throw new AppError('not_found', { message: 'User tidak ditemukan', code: 'USER_NOT_FOUND' });
  }
  if (user.twoFactorEnabled || user.twoFactorSecretEncrypted) {
    throw new AppError('body_invalid', {
      message:
        'MFA sudah aktif. Nonaktifkan terlebih dahulu untuk menghubungkan ke authenticator lain.',
      code: 'MFA_ALREADY_ENROLLED',
    });
  }

  const secret = generateSecret();
  const otpauthUrl = generateURI({
    issuer: env.MFA_ISSUER,
    label: accountLabel,
    secret,
  });

  await redis.set(ENROLL_KEY(userId), secret, 'EX', env.MFA_CHALLENGE_TTL_SECONDS);

  return { otpauth_url: otpauthUrl, secret_base32: secret };
}

export async function confirmEnrollment(
  userId: string,
  rawCode: unknown,
): Promise<ConfirmEnrollmentResult> {
  const code = ensureCode(rawCode);
  const secret = await redis.get(ENROLL_KEY(userId));
  if (!secret) {
    throw new AppError('expired', {
      message: 'Proses pendaftaran MFA sudah kadaluarsa. Mulai ulang.',
      code: 'MFA_ENROLLMENT_EXPIRED',
    });
  }

  if (!verifyTotp(secret, code)) {
    throw new AppError('body_invalid', {
      message: 'Kode verifikasi salah. Pastikan kode dari authenticator masih aktif.',
      code: 'MFA_CODE_MISMATCH',
      details: { field: 'code' },
    });
  }

  // Race guard: pastikan DB belum di-set oleh request lain.
  const existing = await prisma.user.findUnique({
    where: { id: userId },
    select: { twoFactorSecretEncrypted: true },
  });
  if (existing?.twoFactorSecretEncrypted) {
    await redis.del(ENROLL_KEY(userId));
    throw new AppError('body_invalid', {
      message: 'MFA sudah aktif. Refresh halaman untuk melihat status.',
      code: 'MFA_ALREADY_ENROLLED',
    });
  }

  const now = new Date();
  await prisma.user.update({
    where: { id: userId },
    data: {
      twoFactorEnabled: true,
      twoFactorSecretEncrypted: encryptMfaSecret(secret),
      twoFactorEnrolledAt: now,
    },
  });
  await redis.del(ENROLL_KEY(userId));

  // Generate recovery codes — replace mengganti batch lama (kalau ada residu).
  const recoveryCodes = await replaceRecoveryCodes(userId);

  return {
    enabled: true,
    enrolled_at: now.toISOString(),
    recovery_codes: recoveryCodes,
  };
}

export async function regenerateRecoveryCodes(
  userId: string,
  rawCode: unknown,
): Promise<RegenerateRecoveryCodesResult> {
  const code = ensureCode(rawCode);
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { twoFactorEnabled: true, twoFactorSecretEncrypted: true },
  });
  if (!user || !user.twoFactorEnabled || !user.twoFactorSecretEncrypted) {
    throw new AppError('body_invalid', {
      message: 'MFA belum aktif. Aktifkan MFA terlebih dahulu.',
      code: 'MFA_NOT_ENABLED',
    });
  }
  const secret = decryptMfaSecret(user.twoFactorSecretEncrypted);
  if (!verifyTotp(secret, code)) {
    throw new AppError('body_invalid', {
      message: 'Kode verifikasi salah.',
      code: 'MFA_CODE_MISMATCH',
      details: { field: 'code' },
    });
  }
  const codes = await replaceRecoveryCodes(userId);
  return { recovery_codes: codes, generated_at: new Date().toISOString() };
}

export async function disableMfa(userId: string, rawCode: unknown): Promise<MfaStatus> {
  const code = ensureCode(rawCode);
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { twoFactorEnabled: true, twoFactorSecretEncrypted: true },
  });
  if (!user) {
    throw new AppError('not_found', { message: 'User tidak ditemukan', code: 'USER_NOT_FOUND' });
  }
  if (!user.twoFactorEnabled || !user.twoFactorSecretEncrypted) {
    throw new AppError('body_invalid', {
      message: 'MFA belum aktif.',
      code: 'MFA_NOT_ENABLED',
    });
  }

  const secret = decryptMfaSecret(user.twoFactorSecretEncrypted);
  if (!verifyTotp(secret, code)) {
    throw new AppError('body_invalid', {
      message: 'Kode verifikasi salah.',
      code: 'MFA_CODE_MISMATCH',
      details: { field: 'code' },
    });
  }

  await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: {
        twoFactorEnabled: false,
        twoFactorSecretEncrypted: null,
        twoFactorEnrolledAt: null,
      },
    }),
    prisma.mfaRecoveryCode.deleteMany({ where: { userId } }),
  ]);

  // Sapu juga sisa pending enrollment kalau ada.
  await redis.del(ENROLL_KEY(userId));

  return { enabled: false, enrolled_at: null };
}

// ---- Login challenge -----------------------------------------------------------

export async function issueLoginChallenge(payload: MfaChallengePayload): Promise<string> {
  const token = randomBytes(24).toString('base64url');
  await redis.set(
    CHALLENGE_KEY(token),
    JSON.stringify(payload),
    'EX',
    env.MFA_CHALLENGE_TTL_SECONDS,
  );
  return token;
}

export interface ConsumeChallengeInput {
  token: string;
  code?: unknown;          // 6-digit TOTP
  recoveryCode?: unknown;  // 12-char recovery code (XXXX-XXXX-XXXX)
}

export interface ConsumeChallengeResult {
  payload: MfaChallengePayload;
  usedRecoveryCode: boolean;
}

// Konsumsi challenge dengan TOTP ATAU recovery code. Hanya salah satu yang
// dipakai per panggilan. Recovery code valid → mark used_at (single-use).
export async function consumeLoginChallenge(
  input: ConsumeChallengeInput,
): Promise<ConsumeChallengeResult> {
  if (!input.token || typeof input.token !== 'string') {
    throw new AppError('body_invalid', {
      message: 'MFA token tidak valid.',
      code: 'MFA_TOKEN_INVALID',
      details: { field: 'mfa_token' },
    });
  }
  const hasTotp = input.code !== undefined && input.code !== null && input.code !== '';
  const hasRecovery = input.recoveryCode !== undefined && input.recoveryCode !== null && input.recoveryCode !== '';
  if (hasTotp === hasRecovery) {
    throw new AppError('body_invalid', {
      message: 'Kirim salah satu: code (TOTP 6-digit) ATAU recovery_code.',
      code: 'MFA_VERIFY_INPUT_INVALID',
    });
  }

  const raw = await redis.get(CHALLENGE_KEY(input.token));
  if (!raw) {
    throw new AppError('expired', {
      message: 'Sesi verifikasi MFA sudah kadaluarsa. Login ulang.',
      code: 'MFA_CHALLENGE_EXPIRED',
    });
  }
  let payload: MfaChallengePayload;
  try {
    payload = JSON.parse(raw) as MfaChallengePayload;
  } catch {
    await redis.del(CHALLENGE_KEY(input.token));
    throw new AppError('expired', {
      message: 'Sesi verifikasi MFA rusak. Login ulang.',
      code: 'MFA_CHALLENGE_INVALID',
    });
  }

  const user = await prisma.user.findUnique({
    where: { id: payload.user_id },
    select: { twoFactorEnabled: true, twoFactorSecretEncrypted: true },
  });
  if (!user || !user.twoFactorEnabled || !user.twoFactorSecretEncrypted) {
    await redis.del(CHALLENGE_KEY(input.token));
    throw new AppError('body_invalid', {
      message: 'MFA tidak lagi aktif. Login ulang.',
      code: 'MFA_NOT_ENABLED',
    });
  }

  if (hasTotp) {
    const code = ensureCode(input.code);
    const secret = decryptMfaSecret(user.twoFactorSecretEncrypted);
    if (!verifyTotp(secret, code)) {
      throw new AppError('body_invalid', {
        message: 'Kode verifikasi salah.',
        code: 'MFA_CODE_MISMATCH',
        details: { field: 'code' },
      });
    }
    await redis.del(CHALLENGE_KEY(input.token));
    return { payload, usedRecoveryCode: false };
  }

  // ---- recovery code path -----------------------------------------------
  const normalized = normalizeRecoveryCode(input.recoveryCode);
  if (!normalized) {
    throw new AppError('body_invalid', {
      message: 'Format recovery code tidak valid (harus 12 karakter, format XXXX-XXXX-XXXX).',
      code: 'RECOVERY_CODE_INVALID',
      details: { field: 'recovery_code' },
    });
  }

  // Argon2 hash random per record → harus loop & verify satu per satu.
  const codes = await prisma.mfaRecoveryCode.findMany({
    where: { userId: payload.user_id, usedAt: null },
    select: { id: true, codeHash: true },
  });
  if (codes.length === 0) {
    throw new AppError('body_invalid', {
      message:
        'Tidak ada recovery code aktif. Hubungi administrator untuk reset MFA.',
      code: 'RECOVERY_CODE_NONE',
    });
  }

  let matched: { id: string } | null = null;
  for (const row of codes) {
    try {
      if (await argon2.verify(row.codeHash, normalized)) {
        matched = { id: row.id };
        break;
      }
    } catch {
      // skip row rusak
    }
  }
  if (!matched) {
    throw new AppError('body_invalid', {
      message: 'Recovery code salah atau sudah dipakai.',
      code: 'RECOVERY_CODE_MISMATCH',
      details: { field: 'recovery_code' },
    });
  }

  // Atomik: mark used (race guard via usedAt: null), kalau gagal berarti race
  // dengan request lain — return mismatch supaya tidak double-spend.
  const upd = await prisma.mfaRecoveryCode.updateMany({
    where: { id: matched.id, usedAt: null },
    data: { usedAt: new Date() },
  });
  if (upd.count === 0) {
    throw new AppError('body_invalid', {
      message: 'Recovery code sudah dipakai.',
      code: 'RECOVERY_CODE_USED',
      details: { field: 'recovery_code' },
    });
  }

  await redis.del(CHALLENGE_KEY(input.token));
  return { payload, usedRecoveryCode: true };
}
