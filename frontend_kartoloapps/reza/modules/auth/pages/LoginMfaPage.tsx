import { useEffect, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  KeyRound,
  Loader2,
  ShieldCheck,
} from 'lucide-react';
import { setAccessToken, ApiError } from '@/shared/lib/api-client';
import { useAuthStore } from '@/shared/stores/auth-store';
import { ThemeToggle } from '@/shared/components/ThemeToggle';
import { env } from '@/shared/config/env';
import { BrandPanel } from '../components/BrandPanel';
import { LogoMark } from '../components/LogoMark';
import { verifyMfaLogin } from '../api/auth-api';
import { OtpInput } from '@modules/pengaturan/components/OtpInput';

interface LocationState {
  mfaToken?: string;
}

export function LoginMfaPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const state = (location.state ?? null) as LocationState | null;
  const setSession = useAuthStore((s) => s.setSession);

  const [mode, setMode] = useState<'totp' | 'recovery'>('totp');
  const [code, setCode] = useState('');
  const [recoveryCode, setRecoveryCode] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Kalau halaman dibuka tanpa mfa_token (misal direct URL atau refresh), redirect balik ke login.
  useEffect(() => {
    if (!state?.mfaToken) {
      navigate('/login', { replace: true });
    }
  }, [state?.mfaToken, navigate]);

  // Reset input + error saat ganti mode.
  useEffect(() => {
    setError(null);
    if (mode === 'totp') setRecoveryCode('');
    else setCode('');
  }, [mode]);

  const verify = useMutation({
    mutationFn: () => {
      const token = state!.mfaToken!;
      if (mode === 'totp') {
        return verifyMfaLogin({ mfa_token: token, code });
      }
      return verifyMfaLogin({ mfa_token: token, recovery_code: recoveryCode });
    },
    onSuccess: (session) => {
      setAccessToken(session.access_token);
      setSession(session.user, session.access_token);
      navigate('/portal', { replace: true });
    },
    onError: (err: unknown) => {
      const msg = err instanceof ApiError ? err.message : 'Gagal memverifikasi kode.';
      setError(msg);
      if (err instanceof ApiError && err.error?.code === 'MFA_CHALLENGE_EXPIRED') {
        setTimeout(() => navigate('/login', { replace: true }), 1500);
      }
    },
  });

  // Normalisasi recovery code: uppercase + strip non-alnum + insert dash tiap 4.
  const formatRecoveryInput = (raw: string): string => {
    const cleaned = raw.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
    const parts: string[] = [];
    for (let i = 0; i < cleaned.length; i += 4) parts.push(cleaned.slice(i, i + 4));
    return parts.join('-');
  };

  const submit = () => {
    if (!state?.mfaToken) return;
    if (mode === 'totp') {
      if (!/^\d{6}$/.test(code)) {
        setError('Masukkan 6 digit kode dari authenticator.');
        return;
      }
    } else {
      const cleaned = recoveryCode.replace(/[^A-Za-z0-9]/g, '');
      if (cleaned.length !== 12) {
        setError('Recovery code harus 12 karakter (format XXXX-XXXX-XXXX).');
        return;
      }
    }
    setError(null);
    verify.mutate();
  };

  const canSubmit =
    mode === 'totp'
      ? code.length === 6
      : recoveryCode.replace(/[^A-Za-z0-9]/g, '').length === 12;

  return (
    <div className="relative min-h-screen w-full bg-surface dark:bg-slate-900 overflow-hidden transition-colors duration-300">
      <div className="blob bg-primary-200/50 dark:bg-primary-900/30 h-72 w-72 -top-24 -right-16 animate-pulse-soft lg:hidden transition-colors duration-300" />
      <div className="blob bg-primary-100/60 dark:bg-primary-800/40 h-64 w-64 -bottom-20 -left-16 animate-float-slow lg:hidden transition-colors duration-300" />

      <div className="absolute right-4 top-4 z-20 sm:right-6 sm:top-6">
        <ThemeToggle />
      </div>

      <div className="relative grid min-h-screen lg:grid-cols-2">
        <aside className="hidden lg:block">
          <BrandPanel />
        </aside>

        <header className="lg:hidden relative bg-gradient-hero text-white px-6 pt-10 pb-12 overflow-hidden rounded-b-[2rem]">
          <div className="relative flex items-center gap-3">
            <LogoMark size="md" variant="white" />
            <div>
              <p className="font-bold text-lg leading-tight">{env.appName}</p>
              <p className="text-xs text-white/70 leading-tight">Verifikasi Dua Faktor</p>
            </div>
          </div>
          <h1 className="relative mt-6 text-2xl font-extrabold leading-tight">Verifikasi MFA</h1>
          <p className="relative mt-1 text-sm text-white/85">
            Masukkan kode 6-digit dari authenticator.
          </p>
        </header>

        <main className="relative flex items-center justify-center px-5 sm:px-8 py-10 lg:py-12">
          <section className="relative w-full max-w-md animate-fade-in-up">
            <div className="glass-card rounded-3xl p-7 sm:p-9">
              <div className="mb-6 flex items-center gap-3">
                <span className="h-11 w-11 rounded-2xl bg-gradient-primary text-white flex items-center justify-center shadow-soft">
                  <ShieldCheck className="h-5 w-5" />
                </span>
                <div>
                  <h2 className="text-xl font-extrabold text-ink dark:text-slate-100 tracking-tight">
                    Verifikasi Dua Faktor
                  </h2>
                  <p className="text-sm text-muted dark:text-slate-400">
                    {mode === 'totp'
                      ? 'Selesaikan login dengan kode authenticator.'
                      : 'Masukkan recovery code (sekali pakai).'}
                  </p>
                </div>
              </div>

              {error && (
                <div
                  role="alert"
                  className="mb-5 flex items-start gap-3 rounded-2xl border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/30 px-4 py-3 animate-fade-in"
                >
                  <AlertCircle className="h-5 w-5 shrink-0 text-red-500 dark:text-red-400 mt-0.5" />
                  <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
                </div>
              )}

              {mode === 'totp' ? (
                <OtpInput
                  value={code}
                  onChange={setCode}
                  onSubmit={submit}
                  error={undefined}
                  disabled={verify.isPending}
                  autoFocus
                  hint="Kode berubah tiap 30 detik. Token verifikasi berlaku 5 menit."
                />
              ) : (
                <div>
                  <label className="text-sm font-medium text-slate-700 dark:text-slate-200 block mb-1.5">
                    Recovery Code
                  </label>
                  <div className="relative">
                    <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500">
                      <KeyRound className="h-4 w-4" />
                    </span>
                    <input
                      type="text"
                      inputMode="text"
                      autoComplete="off"
                      autoCapitalize="characters"
                      spellCheck={false}
                      autoFocus
                      disabled={verify.isPending}
                      value={recoveryCode}
                      onChange={(e) => setRecoveryCode(formatRecoveryInput(e.target.value))}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          submit();
                        }
                      }}
                      placeholder="XXXX-XXXX-XXXX"
                      maxLength={14}
                      className="field field-with-icon font-mono tracking-[0.25em] text-center text-base uppercase"
                    />
                  </div>
                  <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
                    Sekali pakai. Setelah berhasil login, nonaktifkan MFA &amp;
                    enroll ulang dengan authenticator baru.
                  </p>
                </div>
              )}

              <button
                type="button"
                onClick={() => setMode(mode === 'totp' ? 'recovery' : 'totp')}
                disabled={verify.isPending}
                className="mt-3 w-full inline-flex items-center justify-center gap-2 text-xs font-semibold text-primary-700 dark:text-primary-400 hover:text-primary-800 dark:hover:text-primary-300 hover:underline underline-offset-4 transition-colors"
              >
                {mode === 'totp'
                  ? 'Tidak punya akses authenticator? Pakai recovery code'
                  : 'Kembali pakai kode authenticator'}
              </button>

              <button
                type="button"
                onClick={submit}
                disabled={verify.isPending || !canSubmit}
                className="btn-primary w-full text-base mt-4"
              >
                {verify.isPending ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" />
                    <span>Memverifikasi...</span>
                  </>
                ) : (
                  <>
                    <span>Lanjutkan</span>
                    <ArrowRight className="h-5 w-5" />
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => navigate('/login', { replace: true })}
                className="mt-3 w-full inline-flex items-center justify-center gap-2 text-sm text-muted dark:text-slate-400 hover:text-primary-700 dark:hover:text-primary-300 transition-colors"
              >
                <ArrowLeft className="h-4 w-4" /> Kembali ke login
              </button>
            </div>

            <p className="mt-6 text-center text-xs text-muted dark:text-slate-500">
              © {new Date().getFullYear()} Kartolo SuperApps · v0.1.0
            </p>
          </section>
        </main>
      </div>
    </div>
  );
}
