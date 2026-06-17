import { forwardRef, type InputHTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/shared/lib/cn';

interface InputFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  leftIcon?: ReactNode;
  rightSlot?: ReactNode;
  error?: string;
  hint?: string;
}

export const InputField = forwardRef<HTMLInputElement, InputFieldProps>(function InputField(
  { label, leftIcon, rightSlot, error, hint, className, id, ...rest },
  ref,
) {
  const inputId = id ?? `field-${label.replace(/\s+/g, '-').toLowerCase()}`;
  return (
    <div className="space-y-1.5">
      <label htmlFor={inputId} className="block text-sm font-medium text-ink/80 dark:text-slate-300 transition-colors duration-300">
        {label}
      </label>

      <div className="relative">
        {leftIcon && (
          <span className="absolute inset-y-0 left-3.5 flex items-center text-slate-400 dark:text-slate-500 pointer-events-none transition-colors duration-300">
            {leftIcon}
          </span>
        )}

        <input
          ref={ref}
          id={inputId}
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={error ? `${inputId}-err` : hint ? `${inputId}-hint` : undefined}
          className={cn(
            'field',
            leftIcon && 'field-with-icon',
            rightSlot && 'pr-12',
            error && 'border-red-300 dark:border-red-800 focus:border-red-400 dark:focus:border-red-600 focus:shadow-[0_0_0_4px_rgba(248,113,113,0.15)] dark:focus:shadow-[0_0_0_4px_rgba(248,113,113,0.1)]',
            className,
          )}
          {...rest}
        />

        {rightSlot && (
          <span className="absolute inset-y-0 right-2 flex items-center">
            {rightSlot}
          </span>
        )}
      </div>

      {error ? (
        <p id={`${inputId}-err`} className="text-xs font-medium text-red-600 dark:text-red-400 transition-colors duration-300">
          {error}
        </p>
      ) : hint ? (
        <p id={`${inputId}-hint`} className="text-xs text-muted dark:text-slate-500 transition-colors duration-300">
          {hint}
        </p>
      ) : null}
    </div>
  );
});
