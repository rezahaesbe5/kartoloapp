import { forwardRef } from 'react';
import { KeyRound } from 'lucide-react';
import { cn } from '@/shared/lib/cn';

interface OtpInputProps {
  value: string;
  onChange: (v: string) => void;
  onSubmit?: () => void;
  error?: string;
  disabled?: boolean;
  autoFocus?: boolean;
  label?: string;
  hint?: string;
}

/**
 * Input 6-digit kode TOTP. Otomatis hanya menerima angka, max 6 char,
 * tracking-widest untuk display ala one-time-code, hint mengarah ke
 * autocomplete browser/iOS supaya bisa autofill dari clipboard.
 */
export const OtpInput = forwardRef<HTMLInputElement, OtpInputProps>(function OtpInput(
  { value, onChange, onSubmit, error, disabled, autoFocus, label = 'Kode Verifikasi', hint },
  ref,
) {
  return (
    <div>
      {label && (
        <label className="text-sm font-medium text-slate-700 dark:text-slate-200 block mb-1.5">
          {label}
        </label>
      )}
      <div className="relative">
        <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500">
          <KeyRound className="h-4 w-4" />
        </span>
        <input
          ref={ref}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={6}
          autoComplete="one-time-code"
          autoFocus={autoFocus}
          disabled={disabled}
          value={value}
          onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 6))}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && onSubmit) {
              e.preventDefault();
              onSubmit();
            }
          }}
          placeholder="000000"
          className={cn(
            'field field-with-icon font-mono tracking-[0.5em] text-center text-lg',
            error && 'border-red-400 focus:border-red-500 focus:shadow-none',
          )}
        />
      </div>
      {hint && !error && (
        <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">{hint}</p>
      )}
      {error && (
        <p className="mt-1.5 text-xs font-medium text-red-600 dark:text-red-400">{error}</p>
      )}
    </div>
  );
});
