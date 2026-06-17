import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useSession } from '@/shared/hooks/useSession';
import { RouteSpinner } from './RouteSpinner';

interface PublicOnlyRouteProps {
  children: ReactNode;
  redirectTo?: string;
}

/**
 * Untuk halaman yang HANYA boleh diakses kalau user BELUM login (login, register).
 * Kalau session sudah valid → redirect ke /portal (atau redirectTo).
 * Kalau token ada tapi belum di-verify → tampilkan spinner sampai backend confirm.
 */
export function PublicOnlyRoute({ children, redirectTo = '/portal' }: PublicOnlyRouteProps) {
  const location = useLocation();
  const { hasToken, isChecking, isAuthenticated } = useSession();

  // Tidak punya token sama sekali → langsung render halaman public.
  if (!hasToken) return <>{children}</>;

  // Punya token, sedang verifikasi → spinner (jangan flash login form).
  if (isChecking) return <RouteSpinner label="Memuat sesi..." />;

  // Sudah authenticated → redirect, hormati `state.from` kalau ada.
  if (isAuthenticated) {
    const from = (location.state as { from?: string } | null)?.from;
    return <Navigate to={from && from !== location.pathname ? from : redirectTo} replace />;
  }

  // Token ada tapi backend bilang invalid → biarkan render login (store sudah di-clear oleh useSession).
  return <>{children}</>;
}
