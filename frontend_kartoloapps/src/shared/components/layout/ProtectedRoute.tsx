import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useSession } from '@/shared/hooks/useSession';
import { useAuthStore } from '@/shared/stores/auth-store';
import { RouteSpinner } from './RouteSpinner';

interface ProtectedRouteProps {
  children: ReactNode;
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const location = useLocation();
  const { hasToken, isChecking, isAuthenticated } = useSession();
  const user = useAuthStore((s) => s.user);

  if (!hasToken) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }
  if (isChecking) return <RouteSpinner label="Memverifikasi sesi..." />;
  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }
  // Jika status user = force_change_password, paksa redirect ke halaman ganti password
  if (user?.status === 'force_change_password' && location.pathname !== '/auth/force-change-password') {
    return <Navigate to="/auth/force-change-password" replace />;
  }
  return <>{children}</>;
}
