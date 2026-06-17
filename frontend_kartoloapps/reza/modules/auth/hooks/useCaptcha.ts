import { useQuery } from '@tanstack/react-query';
import { getCaptcha, type CaptchaIssue } from '../api/auth-api';

export function useCaptcha() {
  return useQuery<CaptchaIssue, Error>({
    queryKey: ['auth.captcha'],
    queryFn: getCaptcha,
    staleTime: 0,         // selalu fresh saat di-trigger
    gcTime: 0,            // jangan cache (captcha one-time use)
    refetchOnWindowFocus: false,
    retry: 1,
  });
}
