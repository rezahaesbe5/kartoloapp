import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@/shared/stores/auth-store';
import { getMe } from '@modules/auth/api/auth-api';
import { ApiError } from '@/shared/lib/api-client';

/**
 * Cross-check session ke backend Redis. Dipakai oleh route guard
 * (Protected & PublicOnly) supaya tidak hanya percaya localStorage.
 *
 * - `isLoading` = belum tahu (jangan render konten dulu).
 * - `data`       = session valid, user info dari backend.
 * - `error`      = session invalid / network gagal.
 */
export function useSession() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const setSession = useAuthStore((s) => s.setSession);
  const clearSession = useAuthStore((s) => s.clearSession);

  const query = useQuery({
    queryKey: ['auth.me', accessToken],
    queryFn: async () => {
      const me = await getMe();
      // sinkronkan dengan store kalau backend punya data lebih fresh
      setSession(me.user, accessToken as string);
      return me;
    },
    enabled: Boolean(accessToken),
    retry: false,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });

  // Kalau backend tegas bilang session invalid → bersihkan store.
  if (query.error instanceof ApiError) {
    const code = query.error.error?.code;
    if (code === 'TOKEN_INVALID' || code === 'SESSION_REVOKED' || code === 'SESSION_ID_MISSING') {
      // dispatched dalam render — aman karena Zustand setState idempotent
      if (useAuthStore.getState().accessToken) clearSession();
    }
  }

  return {
    isChecking: query.isLoading && Boolean(accessToken),
    isAuthenticated: Boolean(accessToken) && query.isSuccess,
    me: query.data,
    error: query.error,
    hasToken: Boolean(accessToken),
  };
}
