import { api } from '@/shared/lib/api-client';
import { encryptPassword } from '@/shared/lib/crypto';
import type { ApiEnvelope } from '@/shared/types/envelope';
import type { AuthUser } from '@/shared/stores/auth-store';

export interface CaptchaIssue {
  captcha_id: string;
  svg: string;
  expires_in_seconds: number;
}

export interface LoginPayload {
  identifier: string;
  password: string; // plaintext — dienkripsi di dalam login()
  remember_me?: boolean;
  captcha_id: string;
  captcha_answer: string;
}

export interface SessionPayload {
  access_token: string;
  expires_in_seconds: number;
  session_id: string;
  user: AuthUser;
}

// Login bisa kembalikan dua bentuk (discriminated union via `mfa_required`):
//   - mfa_required: false → langsung set session.
//   - mfa_required: true  → user harus verifikasi kode TOTP via /auth/mfa/verify.
export type LoginResponseData =
  | ({ mfa_required: false } & SessionPayload)
  | { mfa_required: true; mfa_token: string; expires_in_seconds: number };

// Verify pakai salah satu: 6-digit TOTP atau 12-char recovery code (XXXX-XXXX-XXXX).
export type MfaVerifyPayload =
  | { mfa_token: string; code: string }
  | { mfa_token: string; recovery_code: string };

export interface MeResponseData {
  user: AuthUser;
  session: {
    id: string;
    created_at: string;
    expires_at: string;
    ip: string | null;
    user_agent: string | null;
  };
}

export async function getCaptcha(): Promise<CaptchaIssue> {
  const res = await api.get<ApiEnvelope<CaptchaIssue>>('/auth/captcha', { noAuth: true });
  return res.data.data;
}

export async function login(payload: LoginPayload): Promise<LoginResponseData> {
  const body = { ...payload, password: encryptPassword(payload.password) };
  const res = await api.post<ApiEnvelope<LoginResponseData>>('/auth/login', body, { noAuth: true });
  return res.data.data;
}

export async function verifyMfaLogin(payload: MfaVerifyPayload): Promise<SessionPayload> {
  // Backend wraps SessionPayload dengan { mfa_required: false, ...session }
  // di endpoint /auth/mfa/verify supaya konsisten dengan LoginResponseData.
  // Field mfa_required di-discard di sini.
  const res = await api.post<ApiEnvelope<{ mfa_required: false } & SessionPayload>>(
    '/auth/mfa/verify',
    payload,
    { noAuth: true },
  );
  const { mfa_required: _omit, ...session } = res.data.data;
  void _omit;
  return session;
}

export async function getMe(): Promise<MeResponseData> {
  const res = await api.get<ApiEnvelope<MeResponseData>>('/auth/me');
  return res.data.data;
}

export async function logout(): Promise<void> {
  await api.post('/auth/logout');
}
