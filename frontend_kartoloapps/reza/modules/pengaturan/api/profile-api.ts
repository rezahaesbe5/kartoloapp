import { api } from '@/shared/lib/api-client';
import { encryptPassword } from '@/shared/lib/crypto';
import type { ApiEnvelope } from '@/shared/types/envelope';
import type { UserType } from '@/shared/stores/auth-store';

export interface ProfileDetail {
  id: string;
  username: string | null;
  email: string;
  full_name: string;
  user_type: UserType;
  status: 'active' | 'inactive' | 'pending';
  created_at: string;
  last_login_at: string | null;
}

export interface UpdateProfilePayload {
  email: string;
  full_name: string;
}

export interface ChangePasswordPayload {
  old_password: string; // plaintext — dienkripsi di dalam changePassword()
  new_password: string; // plaintext — dienkripsi di dalam changePassword()
}

export async function getProfile(): Promise<ProfileDetail> {
  const res = await api.get<ApiEnvelope<{ profile: ProfileDetail }>>('/auth/profile');
  return res.data.data.profile;
}

export async function updateProfile(payload: UpdateProfilePayload): Promise<ProfileDetail> {
  const res = await api.patch<ApiEnvelope<{ profile: ProfileDetail }>>('/auth/profile', payload);
  return res.data.data.profile;
}

export async function changePassword(payload: ChangePasswordPayload): Promise<void> {
  await api.post('/auth/change-password', {
    old_password: encryptPassword(payload.old_password),
    new_password: encryptPassword(payload.new_password),
  });
}
