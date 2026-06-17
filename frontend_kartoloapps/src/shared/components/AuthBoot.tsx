import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/shared/stores/auth-store';
import { onSessionInvalid, setAccessToken } from '@/shared/lib/api-client';

/**
 * Mount-once subscriber: kalau api-client mendeteksi session invalid
 * dari response backend (kode TOKEN_INVALID/SESSION_REVOKED), otomatis
 * clear store + redirect ke /login.
 */
export function AuthBoot() {
  const navigate = useNavigate();
  const clearSession = useAuthStore((s) => s.clearSession);

  useEffect(() => {
    return onSessionInvalid(() => {
      setAccessToken(null);
      clearSession();
      navigate('/login', { replace: true });
    });
  }, [clearSession, navigate]);

  return null;
}
