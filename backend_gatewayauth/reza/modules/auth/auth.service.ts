import argon2 from 'argon2';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { User } from '@prisma/client';
import { AppError } from '../../../src/shared/errors/app-error.js';
import { decryptPassword } from '../../../src/shared/lib/crypto-aes.js';
import { consumeCaptcha } from '../../../src/shared/lib/captcha-store.js';
import {
  createSession,
  destroySession,
  destroySessionsByIds,
  getActiveSessionsForUser,
} from '../../../src/shared/lib/session-store.js';
import { env } from '../../../src/shared/config/env.js';
import { writeAudit } from '../logging/audit.service.js';
import { authRepository } from './auth.repository.js';
import { consumeLoginChallenge, issueLoginChallenge } from './mfa.service.js';
import type { LoginInput } from './auth.schema.js';

const MAX_FAILED_ATTEMPTS = 5;
const LOCK_DURATION_MS = 60 * 60 * 1000; // 1 jam

export interface SessionPayload {
  access_token: string;
  expires_in_seconds: number;
  session_id: string;
  user: {
    id: string;
    email: string;
    full_name: string;
    user_type: 'superadmin' | 'admin' | 'member';
    status: 'active' | 'inactive' | 'force_change_password' | 'blocked';
  };
}

// Hasil login: kalau MFA aktif, return challenge; kalau tidak, langsung session.
export type LoginResult =
  | { mfa_required: true; mfa_token: string; expires_in_seconds: number }
  | ({ mfa_required: false } & SessionPayload);

export async function loginService(
  app: FastifyInstance,
  req: FastifyRequest,
  input: LoginInput,
): Promise<LoginResult> {
  // 1. Verify captcha SEBELUM cek password supaya brute-force gagal di gate awal.
  const capState = await consumeCaptcha(input.captcha_id, input.captcha_answer);
  if (capState === 'expired') {
    throw new AppError('expired', {
      message: 'Captcha sudah expired. Silakan refresh captcha.',
      code: 'CAPTCHA_EXPIRED',
    });
  }
  if (capState === 'mismatch') {
    throw new AppError('body_invalid', {
      message: 'Captcha salah. Silakan coba lagi.',
      code: 'CAPTCHA_MISMATCH',
    });
  }

  // 2. Decrypt password (AES-256-CBC, key = client_key dari gateway).
  const clientKey = req.gwClient?.clientKey;
  if (!clientKey) {
    throw new AppError('header_unauthorized', {
      message: 'Konteks client gateway tidak terdeteksi.',
      code: 'CLIENT_CONTEXT_MISSING',
    });
  }
  const plainPassword = decryptPassword(input.password, clientKey);

  // reason di-encode ke action (taksonomi dotted) supaya tetap query-able tanpa
  // kolom khusus; identifier yang dicoba tetap terlihat di request_body audit.
  const auditLoginFailed = (
    failedUser: { id: string; email: string; fullName: string; userType: string } | null,
    reason: string,
  ): void => {
    writeAudit(req, {
      action: `auth.login.failed.${reason}`,
      userId: failedUser?.id ?? null,
      userData: failedUser
        ? {
            user_id: failedUser.id,
            email: failedUser.email,
            full_name: failedUser.fullName,
            user_type: failedUser.userType,
          }
        : null,
    });
  };

  const user = await authRepository.findByEmailOrUsername(input.identifier);

  const invalidCredentialError = new AppError('header_unauthorized', {
    message: 'Email/username atau password salah',
    code: 'INVALID_CREDENTIALS',
  });

  if (!user) {
    auditLoginFailed(null, 'user_not_found');
    throw invalidCredentialError;
  }

  const canLogin = user.status === 'active' || user.status === 'force_change_password';
  if (!canLogin) {
    auditLoginFailed(user, 'user_inactive');
    throw new AppError('header_unauthorized', {
      message: 'Akun Anda tidak aktif. Hubungi administrator.',
      code: 'USER_INACTIVE',
    });
  }

  if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
    const minutesLeft = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000);
    auditLoginFailed(user, 'account_locked');
    throw new AppError('too_many_request', {
      message: `Akun terkunci. Coba lagi dalam ${minutesLeft} menit.`,
      code: 'ACCOUNT_LOCKED',
      details: { locked_until: user.lockedUntil.toISOString() },
    });
  }

  const passwordOk = await argon2.verify(user.passwordHash, plainPassword);
  if (!passwordOk) {
    const nextAttempts = user.failedLoginAttempts + 1;
    const shouldLock = nextAttempts >= MAX_FAILED_ATTEMPTS;
    await authRepository.recordFailedLogin(
      user.id,
      shouldLock ? 0 : nextAttempts,
      shouldLock ? new Date(Date.now() + LOCK_DURATION_MS) : null,
    );
    auditLoginFailed(user, shouldLock ? 'invalid_password_locked' : 'invalid_password');
    throw invalidCredentialError;
  }

  // Branch MFA: kalau user sudah enroll, jangan langsung issue session.
  // Tunda single-session check ke completion (setelah verify TOTP), supaya
  // user yang sudah authenticate password tidak ke-block oleh sesi sebelumnya
  // sebelum sempat verifikasi.
  if (user.twoFactorEnabled && user.twoFactorSecretEncrypted) {
    const mfaToken = await issueLoginChallenge({
      user_id: user.id,
      ip: req.ip ?? null,
      user_agent: req.headers['user-agent'] ?? null,
    });
    writeAudit(req, {
      action: 'auth.mfa.challenge_issued',
      userId: user.id,
      userData: {
        user_id: user.id,
        email: user.email,
        full_name: user.fullName,
        user_type: user.userType,
      },
    });
    return {
      mfa_required: true,
      mfa_token: mfaToken,
      expires_in_seconds: env.MFA_CHALLENGE_TTL_SECONDS,
    };
  }

  const session = await completeLogin(app, req, user, 'auth.login.success');
  return { mfa_required: false, ...session };
}

// Selesaikan login (single-session check + issue session + JWT + audit).
// Dipanggil dari loginService (no-MFA) dan mfaVerifyLoginService (after TOTP).
async function completeLogin(
  app: FastifyInstance,
  req: FastifyRequest,
  user: User,
  auditAction: string,
): Promise<SessionPayload> {
  // Single-session enforcement PER source_app (client_id), dengan pengecualian
  // device yang sama:
  // - Sesi aktif dari source_app BERBEDA → diabaikan (boleh hidup berdampingan,
  //   mis. user login di portal web sekaligus aplikasi produk lain).
  // - Tidak ada sesi aktif dari source yang sama → login normal.
  // - Ada sesi aktif source-sama & SEMUA dari device yang sama (IP + User-Agent
  //   sama persis) → kemungkinan user logout di frontend tapi sesi backend
  //   masih basi. Revoke HANYA sesi source-sama itu, buat sesi baru (expiry
  //   fresh). Sesi source lain tidak tersentuh.
  // - Ada sesi aktif source-sama dari device/IP berbeda → tolak ALREADY_LOGGED_IN.
  const currentSource = req.gwClient?.clientId ?? null;
  const activeSessions = await getActiveSessionsForUser(user.id);
  const sameSourceSessions = activeSessions.filter((s) => s.source_app === currentSource);
  if (sameSourceSessions.length > 0) {
    const currentIp = req.ip ?? null;
    const currentUa = req.headers['user-agent'] ?? null;
    const allSameDevice = sameSourceSessions.every(
      (s) => s.ip === currentIp && s.user_agent === currentUa,
    );

    if (allSameDevice) {
      // Device + source sama → ganti sesi basi dengan yang baru (selektif).
      await destroySessionsByIds(sameSourceSessions.map((s) => s.id));
      writeAudit(req, {
        action: 'auth.login.session_replaced',
        userId: user.id,
        userData: {
          user_id: user.id,
          email: user.email,
          full_name: user.fullName,
          user_type: user.userType,
        },
      });
    } else {
      writeAudit(req, {
        action: 'auth.login.failed.already_logged_in',
        userId: user.id,
        userData: {
          user_id: user.id,
          email: user.email,
          full_name: user.fullName,
          user_type: user.userType,
        },
      });
      throw new AppError('header_unauthorized', {
        message:
          'Akun Anda sudah login di perangkat/browser lain. ' +
          'Logout dari sana terlebih dahulu, atau hubungi administrator untuk reset sesi.',
        code: 'ALREADY_LOGGED_IN',
        details: { active_sessions: sameSourceSessions.length },
      });
    }
  }

  await authRepository.recordSuccessfulLogin(user.id);

  const session = await createSession({
    user_id: user.id,
    user_type: user.userType,
    status: user.status,
    email: user.email,
    full_name: user.fullName,
    ip: req.ip ?? null,
    user_agent: req.headers['user-agent'] ?? null,
    source_app: currentSource,
  });

  const accessToken = app.jwt.sign(
    {
      sub: user.id,
      user_type: user.userType,
      session_id: session.session_id,
    },
    { expiresIn: env.SESSION_TTL_SECONDS },
  );

  writeAudit(req, {
    action: auditAction,
    userId: user.id,
    userData: {
      user_id: user.id,
      email: user.email,
      full_name: user.fullName,
      user_type: user.userType,
    },
  });

  return {
    access_token: accessToken,
    expires_in_seconds: env.SESSION_TTL_SECONDS,
    session_id: session.session_id,
    user: {
      id: user.id,
      email: user.email,
      full_name: user.fullName,
      user_type: user.userType,
      status: user.status,
    },
  };
}

export interface MfaVerifyInput {
  mfaToken: string;
  code?: unknown;
  recoveryCode?: unknown;
}

export async function mfaVerifyLoginService(
  app: FastifyInstance,
  req: FastifyRequest,
  input: MfaVerifyInput,
): Promise<SessionPayload> {
  let result;
  try {
    result = await consumeLoginChallenge({
      token: input.mfaToken,
      code: input.code,
      recoveryCode: input.recoveryCode,
    });
  } catch (err) {
    if (err instanceof AppError) {
      const mismatchCodes = new Set([
        'MFA_CODE_MISMATCH',
        'RECOVERY_CODE_MISMATCH',
        'RECOVERY_CODE_USED',
        'RECOVERY_CODE_INVALID',
      ]);
      if (mismatchCodes.has(err.code ?? '')) {
        writeAudit(req, { action: 'auth.mfa.verify_failed' });
      }
    }
    throw err;
  }

  const user = await authRepository.findById(result.payload.user_id);
  if (!user) {
    throw new AppError('not_found', { message: 'User tidak ditemukan', code: 'USER_NOT_FOUND' });
  }
  const canLogin = user.status === 'active' || user.status === 'force_change_password';
  if (!canLogin) {
    throw new AppError('header_unauthorized', {
      message: 'Akun Anda tidak aktif. Hubungi administrator.',
      code: 'USER_INACTIVE',
    });
  }

  const auditAction = result.usedRecoveryCode
    ? 'auth.mfa.verify_success.recovery'
    : 'auth.mfa.verify_success';
  return completeLogin(app, req, user, auditAction);
}

export async function logoutService(sessionId: string): Promise<{ revoked: boolean }> {
  const revoked = await destroySession(sessionId);
  return { revoked };
}
