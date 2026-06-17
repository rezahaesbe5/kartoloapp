import { api } from '@/shared/lib/api-client';
import type { ApiEnvelope } from '@/shared/types/envelope';

export interface SessionItem {
  id: string;
  ip: string | null;
  user_agent: string | null;
  created_at: string;
  last_active_at: string;
  expires_at: string;
  revoked_at: string | null;
  is_active: boolean;
  is_current: boolean;
}

export interface MySessions {
  active: SessionItem[];
  history: SessionItem[];
}

export interface MfaStatus {
  enabled: boolean;
  enrolled_at: string | null;
  recovery_codes_remaining: number;
  recovery_codes_total: number;
  recovery_codes_generated_at: string | null;
}

export interface MfaEnrollBegin {
  otpauth_url: string;
  secret_base32: string;
}

export interface MfaConfirmResult {
  enabled: boolean;
  enrolled_at: string | null;
  recovery_codes: string[];
}

export interface RecoveryCodesSummary {
  remaining: number;
  total: number;
  generated_at: string | null;
}

export interface RegenerateRecoveryCodesResult {
  recovery_codes: string[];
  generated_at: string;
}

export async function getMySessions(): Promise<MySessions> {
  const res = await api.get<ApiEnvelope<MySessions>>('/auth/sessions');
  return res.data.data;
}

export async function getMfaStatus(): Promise<MfaStatus> {
  const res = await api.get<ApiEnvelope<MfaStatus>>('/auth/mfa/status');
  return res.data.data;
}

export async function beginMfaEnroll(): Promise<MfaEnrollBegin> {
  const res = await api.post<ApiEnvelope<MfaEnrollBegin>>('/auth/mfa/enroll/begin', {});
  return res.data.data;
}

export async function confirmMfaEnroll(code: string): Promise<MfaConfirmResult> {
  const res = await api.post<ApiEnvelope<MfaConfirmResult>>('/auth/mfa/enroll/confirm', { code });
  return res.data.data;
}

export async function disableMfa(code: string): Promise<MfaStatus> {
  const res = await api.post<ApiEnvelope<MfaStatus>>('/auth/mfa/disable', { code });
  return res.data.data;
}

export async function getRecoveryCodesSummary(): Promise<RecoveryCodesSummary> {
  const res = await api.get<ApiEnvelope<RecoveryCodesSummary>>(
    '/auth/mfa/recovery-codes/summary',
  );
  return res.data.data;
}

export async function regenerateRecoveryCodes(code: string): Promise<RegenerateRecoveryCodesResult> {
  const res = await api.post<ApiEnvelope<RegenerateRecoveryCodesResult>>(
    '/auth/mfa/recovery-codes/regenerate',
    { code },
  );
  return res.data.data;
}
