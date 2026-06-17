import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation } from '@tanstack/react-query';
import { AlertCircle, Loader2, LogOut, ShieldAlert, ShieldCheck } from 'lucide-react';
import { Navigate } from 'react-router-dom';
import { useAuthStore } from '@/shared/stores/auth-store';
import { setAccessToken, ApiError } from '@/shared/lib/api-client';
import { ThemeToggle } from '@/shared/components/ThemeToggle';
import { env } from '@/shared/config/env';
import { BrandPanel } from '../components/BrandPanel';
import { LogoMark } from '../components/LogoMark';
import { PasswordField } from '../components/PasswordField';
import { changePassword } from '@modules/pengaturan/api/profile-api';

const schema = z
  .object({
    old_password: z.string().min(1, 'Password lama wajib diisi'),
    new_password: z.string().min(1, 'Password baru wajib diisi'),
    confirm_password: z.string().min(1, 'Ulangi password baru wajib diisi'),
  })
  .refine((d) => d.new_password === d.confirm_password, {
    message: 'Tidak sama dengan password baru',
    path: ['confirm_password'],
  });

type FormValues = z.infer<typeof schema>;

// Ambil nama field dari error envelope server supaya pesan muncul tepat di input.
function fieldFromError(err: unknown): string | undefined {
  if (err instanceof ApiError && typeof err.error?.details?.field === 'string') {
    return err.error.details.field;
  }
  return undefined;
}

export function ForceChangePasswordPage() {
  const user = useAuthStore((s) => s.user);
  const clearSession = useAuthStore((s) => s.clearSession);

  // Hooks dideklarasikan SEBELUM early-return agar tidak melanggar rules-of-hooks.
  const {
    register,
    handleSubmit,
    setError,
    clearErrors,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { old_password: '', new_password: '', confirm_password: '' },
  });

  const mutation = useMutation({
    mutationFn: changePassword,
    onSuccess: () => {
      // Password sudah diganti & status di-aktifkan oleh backend. Paksa login ulang
      // dengan kredensial baru. Hard redirect membersihkan cache React Query.
      clearSession();
      setAccessToken(null);
      window.location.href = '/login';
    },
    onError: (err: unknown) => {
      const field = fieldFromError(err);
      const message = err instanceof ApiError ? err.message : 'Terjadi kesalahan. Coba lagi.';
      if (field === 'old_password' || field === 'new_password') {
        setError(field, { message });
      } else {
        setError('root', { message });
      }
    },
  });

  // Tidak ada session → kembali ke login.
  if (!user) return <Navigate to="/login" replace />;
  // Status bukan force_change_password → tidak perlu di halaman ini.
  if (user.status !== 'force_change_password') return <Navigate to="/portal" replace />;

  const onSubmit = (values: FormValues) => {
    clearErrors('root');
    mutation.mutate({ old_password: values.old_password, new_password: values.new_password });
  };

  const handleLogout = () => {
    clearSession();
    setAccessToken(null);
    window.location.href = '/login';
  };

  return (
    <div className="relative min-h-screen w-full bg-surface dark:bg-slate-900 overflow-hidden transition-colors duration-300">
      <div className="blob bg-amber-200/50 dark:bg-amber-900/30 h-72 w-72 -top-24 -right-16 animate-pulse-soft lg:hidden transition-colors duration-300" />
      <div className="blob bg-primary-100/60 dark:bg-primary-800/40 h-64 w-64 -bottom-20 -left-16 animate-float-slow lg:hidden transition-colors duration-300" />

      <div className="absolute right-4 top-4 z-20 sm:right-6 sm:top-6">
        <ThemeToggle />
      </div>

      <div className="relative grid min-h-screen lg:grid-cols-2">
        <aside className="hidden lg:block">
          <BrandPanel />
        </aside>

        <header className="lg:hidden relative bg-gradient-hero text-white px-6 pt-10 pb-12 overflow-hidden rounded-b-[2rem]">
          <div className="blob bg-white/15 h-40 w-40 -top-10 -right-10 animate-float-slow" />
          <div className="relative flex items-center gap-3">
            <LogoMark size="md" variant="white" />
            <div>
              <p className="font-bold text-lg leading-tight">{env.appName}</p>
              <p className="text-xs text-white/70 leading-tight">Keamanan Akun</p>
            </div>
          </div>
          <h1 className="relative mt-6 text-2xl font-extrabold leading-tight">Ganti Password Wajib</h1>
          <p className="relative mt-1 text-sm text-white/85">
            Perbarui password Anda untuk melanjutkan.
          </p>
        </header>

        <main className="relative flex items-center justify-center px-5 sm:px-8 py-10 lg:py-12">
          <div className="hidden lg:block blob bg-primary-200/35 dark:bg-primary-900/25 h-72 w-72 top-10 -right-20 animate-pulse-soft transition-colors duration-300" />
          <div className="hidden lg:block blob bg-primary-100/50 dark:bg-primary-800/30 h-60 w-60 bottom-10 -left-10 animate-float-slow transition-colors duration-300" />

          <section className="relative w-full max-w-md animate-fade-in-up">
            <div className="glass-card rounded-3xl p-7 sm:p-9">
              <div className="mb-6 flex items-center gap-3">
                <span className="h-11 w-11 rounded-2xl bg-gradient-primary text-white flex items-center justify-center shadow-soft">
                  <ShieldAlert className="h-5 w-5" />
                </span>
                <div>
                  <h2 className="text-xl font-extrabold text-ink dark:text-slate-100 tracking-tight">
                    Ganti Password
                  </h2>
                  <p className="text-sm text-muted dark:text-slate-400">
                    Demi keamanan, ganti password sebelum melanjutkan.
                  </p>
                </div>
              </div>

              <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
                {errors.root && (
                  <div
                    role="alert"
                    className="flex items-start gap-3 rounded-2xl border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/30 px-4 py-3 animate-fade-in"
                  >
                    <AlertCircle className="h-5 w-5 shrink-0 text-red-500 dark:text-red-400 mt-0.5" />
                    <p className="text-sm text-red-700 dark:text-red-300">{errors.root.message}</p>
                  </div>
                )}

                <PasswordField
                  label="Password Lama"
                  autoComplete="current-password"
                  placeholder="Masukkan password lama"
                  error={errors.old_password?.message}
                  {...register('old_password')}
                />

                <PasswordField
                  label="Password Baru"
                  autoComplete="new-password"
                  placeholder="Masukkan password baru"
                  hint="Min. 8 karakter, kombinasi huruf besar, huruf kecil, angka & karakter spesial."
                  error={errors.new_password?.message}
                  {...register('new_password')}
                />

                <PasswordField
                  label="Ulangi Password Baru"
                  autoComplete="new-password"
                  placeholder="Ketik ulang password baru"
                  error={errors.confirm_password?.message}
                  {...register('confirm_password')}
                />

                <button
                  type="submit"
                  disabled={mutation.isPending}
                  className="btn-primary w-full text-base"
                >
                  {mutation.isPending ? (
                    <>
                      <Loader2 className="h-5 w-5 animate-spin" />
                      <span>Menyimpan...</span>
                    </>
                  ) : (
                    <>
                      <ShieldCheck className="h-5 w-5" />
                      <span>Simpan</span>
                    </>
                  )}
                </button>
              </form>

              <button
                type="button"
                onClick={handleLogout}
                disabled={mutation.isPending}
                className="mt-4 w-full inline-flex items-center justify-center gap-2 text-sm text-muted dark:text-slate-400 hover:text-primary-700 dark:hover:text-primary-300 transition-colors"
              >
                <LogOut className="h-4 w-4" /> Bukan Anda? Keluar
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
