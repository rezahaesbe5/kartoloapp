import { ApiError } from '@/shared/lib/api-client';

/**
 * Ekstrak pesan error dari hasil reject api-client.
 *
 * Interceptor api-client me-reject dengan `ApiError` (extends Error) yang
 * `.message`-nya = `envelope.message` dari backend. Jadi pesan backend asli ada
 * di `err.message`, BUKAN `err.response.data.message` (ApiError tidak punya
 * `.response`). Fungsi ini menangani keduanya + fallback aman.
 */
export function apiErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError) return err.message || fallback;
  const e = err as { message?: string; response?: { data?: { message?: string } } };
  return e?.response?.data?.message ?? e?.message ?? fallback;
}
