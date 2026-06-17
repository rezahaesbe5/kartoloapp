import { forwardRef, type InputHTMLAttributes } from 'react';
import { RefreshCw, Loader2, ShieldQuestion } from 'lucide-react';
import { cn } from '@/shared/lib/cn';

interface CaptchaFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: string;
  svg: string | undefined;
  isLoading: boolean;
  isFetching: boolean;
  isError: boolean;
  onRefresh: () => void;
  error?: string;
}

export const CaptchaField = forwardRef<HTMLInputElement, CaptchaFieldProps>(function CaptchaField(
  {
    label = 'Verifikasi captcha',
    svg,
    isLoading,
    isFetching,
    isError,
    onRefresh,
    error,
    className,
    id = 'field-captcha',
    ...rest
  },
  ref,
) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium text-ink/80 dark:text-slate-300 transition-colors duration-300">
        {label}
      </label>

      <div className="grid grid-cols-[1fr_auto] gap-3 items-stretch">
        {/* Captcha image */}
        <div
          aria-label="Gambar captcha"
          className={cn(
            'relative flex items-center justify-center rounded-2xl border bg-primary-50/50 dark:bg-primary-950/30 overflow-hidden transition-colors duration-300',
            'min-h-[64px] px-3',
            isError ? 'border-red-300 dark:border-red-800' : 'border-slate-200 dark:border-slate-700',
          )}
        >
          {isLoading ? (
            <div className="flex items-center gap-2 text-muted dark:text-slate-400 text-xs transition-colors duration-300">
              <Loader2 className="h-4 w-4 animate-spin" />
              Memuat captcha...
            </div>
          ) : isError ? (
            <div className="flex items-center gap-2 text-red-600 dark:text-red-400 text-xs transition-colors duration-300">
              <ShieldQuestion className="h-4 w-4" />
              Gagal memuat. Tekan refresh.
            </div>
          ) : svg ? (
            <div
              className={cn('w-full flex justify-center', isFetching && 'opacity-50')}
              // SVG berasal dari backend kita sendiri (svg-captcha lib),
              // tidak ada user-injected content → aman pakai dangerouslySetInnerHTML.
              dangerouslySetInnerHTML={{ __html: svg }}
            />
          ) : null}
          {isFetching && !isLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-white/40 dark:bg-slate-900/40 transition-colors duration-300">
              <Loader2 className="h-4 w-4 animate-spin text-primary-600 dark:text-primary-400" />
            </div>
          )}
        </div>

        {/* Refresh button */}
        <button
          type="button"
          onClick={onRefresh}
          disabled={isLoading || isFetching}
          aria-label="Refresh captcha"
          className={cn(
            'rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 transition-colors duration-300',
            'flex items-center justify-center text-slate-500 dark:text-slate-400',
            'hover:bg-primary-50 dark:hover:bg-primary-950 hover:text-primary-700 dark:hover:text-primary-400 hover:border-primary-200 dark:hover:border-primary-800',
            'disabled:opacity-50 disabled:cursor-not-allowed',
          )}
        >
          <RefreshCw className={cn('h-4 w-4', isFetching && 'animate-spin')} />
        </button>
      </div>

      <input
        ref={ref}
        id={id}
        type="text"
        inputMode="text"
        autoComplete="off"
        autoCapitalize="characters"
        spellCheck={false}
        maxLength={16}
        placeholder="Ketik teks pada gambar"
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={error ? `${id}-err` : undefined}
        className={cn(
          'field tracking-widest uppercase font-medium',
          error && 'border-red-300 dark:border-red-800 focus:border-red-400 dark:focus:border-red-600 focus:shadow-[0_0_0_4px_rgba(248,113,113,0.15)] dark:focus:shadow-[0_0_0_4px_rgba(248,113,113,0.1)]',
          className,
        )}
        {...rest}
      />

      {error && (
        <p id={`${id}-err`} className="text-xs font-medium text-red-600 dark:text-red-400 transition-colors duration-300">
          {error}
        </p>
      )}
    </div>
  );
});
