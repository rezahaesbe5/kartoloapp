import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { User, ArrowRight, Loader2, AlertCircle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { ApiError } from '@/shared/lib/api-client';
import { env } from '@/shared/config/env';
import { ThemeToggle } from '@/shared/components/ThemeToggle';
import { BrandPanel } from '../components/BrandPanel';
import { InputField } from '../components/InputField';
import { PasswordField } from '../components/PasswordField';
import { CaptchaField } from '../components/CaptchaField';
import { LogoMark } from '../components/LogoMark';
import { useLogin } from '../hooks/useLogin';
import { useCaptcha } from '../hooks/useCaptcha';

const LoginFormSchema = z.object({
  identifier: z.string().min(1, 'Email atau username wajib diisi'),
  password: z.string().min(1, 'Password wajib diisi'),
  remember_me: z.boolean().optional().default(false),
  captcha_answer: z.string().min(1, 'Captcha wajib diisi'),
});

type LoginFormValues = z.infer<typeof LoginFormSchema>;

export function LoginPage() {
  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(LoginFormSchema),
    defaultValues: { identifier: '', password: '', remember_me: false, captcha_answer: '' },
  });

  const captcha = useCaptcha();
  const loginMutation = useLogin();

  // Refresh captcha tiap login gagal supaya user tidak coba terus dengan captcha yang sama
  // (backend pun consume one-time, jadi captcha lama tidak valid lagi).
  useEffect(() => {
    if (loginMutation.isError) {
      setValue('captcha_answer', '');
      captcha.refetch();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loginMutation.isError]);

  const onSubmit = (values: LoginFormValues) => {
    if (!captcha.data?.captcha_id) {
      captcha.refetch();
      return;
    }
    loginMutation.mutate({
      identifier: values.identifier.trim(),
      password: values.password,
      remember_me: values.remember_me,
      captcha_id: captcha.data.captcha_id,
      captcha_answer: values.captcha_answer.trim(),
    });
  };

  const serverErrorCode =
    loginMutation.error instanceof ApiError ? loginMutation.error.error?.code : undefined;

  return (
    <div className="relative min-h-screen w-full bg-surface dark:bg-slate-900 overflow-hidden transition-colors duration-300">
      <div className="blob bg-primary-200/50 dark:bg-primary-900/30 h-72 w-72 -top-24 -right-16 animate-pulse-soft lg:hidden transition-colors duration-300" />
      <div className="blob bg-primary-100/60 dark:bg-primary-800/40 h-64 w-64 -bottom-20 -left-16 animate-float-slow lg:hidden transition-colors duration-300" />

      {/* Tombol dark/light mode — selalu di pojok kanan atas, semua breakpoint. */}
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
              <p className="text-xs text-white/70 leading-tight">Portal Terpusat</p>
            </div>
          </div>
          <h1 className="relative mt-6 text-2xl font-extrabold leading-tight">
            Selamat datang kembali 👋
          </h1>
          <p className="relative mt-1 text-sm text-white/85">
            Masuk untuk melanjutkan ke ekosistem Anda.
          </p>
        </header>

        <main className="relative flex items-center justify-center px-5 sm:px-8 py-10 lg:py-12">
          <div className="hidden lg:block blob bg-primary-200/35 dark:bg-primary-900/25 h-72 w-72 top-10 -right-20 animate-pulse-soft transition-colors duration-300" />
          <div className="hidden lg:block blob bg-primary-100/50 dark:bg-primary-800/30 h-60 w-60 bottom-10 -left-10 animate-float-slow transition-colors duration-300" />

          <section className="relative w-full max-w-md animate-fade-in-up">
            <div className="glass-card rounded-3xl p-7 sm:p-9">
              <div className="hidden lg:block mb-7">
                <h2 className="text-2xl font-extrabold text-ink dark:text-slate-100 tracking-tight transition-colors duration-300">
                  Masuk ke Akun Anda
                </h2>
                <p className="mt-1.5 text-sm text-muted dark:text-slate-400 transition-colors duration-300">
                  Gunakan email/username, password, dan kode captcha untuk melanjutkan.
                </p>
              </div>

              <div className="lg:hidden mb-5">
                <h2 className="text-xl font-bold text-ink dark:text-slate-100 transition-colors duration-300">Masuk</h2>
                <p className="mt-0.5 text-sm text-muted dark:text-slate-400 transition-colors duration-300">
                  Email/username, password & captcha Anda.
                </p>
              </div>

              {loginMutation.isError && (
                <div
                  role="alert"
                  className="mb-5 flex items-start gap-3 rounded-2xl border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/30 px-4 py-3 animate-fade-in transition-colors duration-300"
                >
                  <AlertCircle className="h-5 w-5 shrink-0 text-red-500 dark:text-red-400 mt-0.5 transition-colors duration-300" />
                  <div className="text-sm text-red-700 dark:text-red-300 transition-colors duration-300">
                    <p className="font-semibold leading-tight">Login gagal</p>
                    <p className="mt-0.5 leading-snug">{loginMutation.error.message}</p>
                    {serverErrorCode && (
                      <p className="mt-1 text-[10px] uppercase tracking-wider text-red-500/70 dark:text-red-400/70 transition-colors duration-300">
                        {serverErrorCode}
                      </p>
                    )}
                  </div>
                </div>
              )}

              <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
                <InputField
                  label="Email atau Username"
                  type="text"
                  autoComplete="username"
                  placeholder="nama@perusahaan.com atau username"
                  leftIcon={<User className="h-4 w-4" />}
                  error={errors.identifier?.message}
                  {...register('identifier')}
                />

                <PasswordField
                  label="Password"
                  autoComplete="current-password"
                  placeholder="Masukkan password Anda"
                  error={errors.password?.message}
                  {...register('password')}
                />

                <CaptchaField
                  svg={captcha.data?.svg}
                  isLoading={captcha.isLoading}
                  isFetching={captcha.isFetching}
                  isError={captcha.isError}
                  onRefresh={() => {
                    setValue('captcha_answer', '');
                    captcha.refetch();
                  }}
                  error={errors.captcha_answer?.message}
                  {...register('captcha_answer')}
                />

                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <label className="inline-flex items-center gap-2 cursor-pointer select-none text-sm text-ink/80 dark:text-slate-300 transition-colors duration-300">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-slate-300 dark:border-slate-600 text-primary-600 focus:ring-primary-500 focus:ring-offset-0 dark:bg-slate-700 transition-colors duration-300"
                      {...register('remember_me')}
                    />
                    <span>Ingat saya</span>
                  </label>

                  <Link
                    to="/forgot-password"
                    className="text-sm font-medium text-primary-700 dark:text-primary-400 hover:text-primary-800 dark:hover:text-primary-300 hover:underline underline-offset-4 transition-colors duration-300"
                  >
                    Lupa password?
                  </Link>
                </div>

                <button
                  type="submit"
                  disabled={loginMutation.isPending || captcha.isLoading}
                  className="btn-primary w-full text-base"
                >
                  {loginMutation.isPending ? (
                    <>
                      <Loader2 className="h-5 w-5 animate-spin" />
                      <span>Memproses...</span>
                    </>
                  ) : (
                    <>
                      <span>Masuk</span>
                      <ArrowRight className="h-5 w-5" />
                    </>
                  )}
                </button>
              </form>

              <div className="my-6 flex items-center gap-4">
                <div className="h-px flex-1 bg-slate-200 dark:bg-slate-700 transition-colors duration-300" />
                <span className="text-xs uppercase tracking-wider text-muted dark:text-slate-500 transition-colors duration-300">atau</span>
                <div className="h-px flex-1 bg-slate-200 dark:bg-slate-700 transition-colors duration-300" />
              </div>

              <p className="text-center text-sm text-muted dark:text-slate-400 transition-colors duration-300">
                Belum punya akun?{' '}
                <span className="font-medium text-ink dark:text-slate-100 transition-colors duration-300">Hubungi administrator Anda</span>{' '}
                untuk mendapatkan akses.
              </p>
            </div>

            <p className="mt-6 text-center text-xs text-muted dark:text-slate-500 transition-colors duration-300">
              © {new Date().getFullYear()} Kartolo SuperApps · v0.1.0
            </p>
          </section>
        </main>
      </div>
    </div>
  );
}
