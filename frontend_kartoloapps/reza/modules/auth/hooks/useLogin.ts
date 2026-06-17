import { useMutation } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { setAccessToken, type ApiError } from '@/shared/lib/api-client';
import { useAuthStore } from '@/shared/stores/auth-store';
import { login, type LoginPayload, type LoginResponseData } from '../api/auth-api';

export function useLogin() {
  const navigate = useNavigate();
  const setSession = useAuthStore((s) => s.setSession);

  return useMutation<LoginResponseData, ApiError, LoginPayload>({
    mutationFn: login,
    onSuccess: (data) => {
      if (data.mfa_required) {
        // Bawa mfa_token ke MFA challenge page via router state.
        navigate('/login/mfa', { replace: true, state: { mfaToken: data.mfa_token } });
        return;
      }
      setAccessToken(data.access_token);
      setSession(data.user, data.access_token);
      navigate('/portal', { replace: true });
    },
  });
}
