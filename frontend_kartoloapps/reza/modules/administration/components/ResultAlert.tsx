import { createPortal } from 'react-dom';
import { useEffect } from 'react';
import { CheckCircle2, XCircle } from 'lucide-react';

export type ResultVariant = 'success' | 'error';

interface ResultAlertProps {
  open: boolean;
  variant: ResultVariant;
  title?: string;
  message: string;
  onClose: () => void;
}

const VARIANT = {
  success: {
    icon: CheckCircle2,
    defaultTitle: 'Berhasil',
    iconClass: 'bg-emerald-50 dark:bg-emerald-500/15 text-emerald-600 dark:text-emerald-300',
    btnClass:
      'bg-gradient-primary hover:shadow-[0_8px_28px_-6px_rgba(34,197,94,0.45)] hover:-translate-y-0.5 focus-visible:ring-primary-400',
  },
  error: {
    icon: XCircle,
    defaultTitle: 'Gagal',
    iconClass: 'bg-red-50 dark:bg-red-500/15 text-red-600 dark:text-red-300',
    btnClass: 'bg-red-600 hover:bg-red-700 focus-visible:ring-red-400',
  },
} as const;

/** Alert modal hasil aksi (sukses/gagal) — menampilkan pesan dari backend. */
export function ResultAlert({ open, variant, title, message, onClose }: ResultAlertProps) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  const v = VARIANT[variant];
  const Icon = v.icon;

  return createPortal(
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-900/30 dark:bg-slate-950/60 backdrop-blur-sm animate-fade-in"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      role="alertdialog"
      aria-modal="true"
      aria-label={title ?? v.defaultTitle}
    >
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 dark:border-slate-700/70 bg-white dark:bg-slate-900 shadow-2xl animate-pop-in p-6">
        <div className="flex items-start gap-3">
          <span className={`flex h-10 w-10 items-center justify-center rounded-xl shrink-0 ${v.iconClass}`}>
            <Icon className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1 pt-0.5">
            <h3 className="text-base font-bold text-slate-800 dark:text-slate-50">{title ?? v.defaultTitle}</h3>
            <p className="text-sm text-slate-600 dark:text-slate-300 mt-1 break-words">{message}</p>
          </div>
        </div>
        <div className="mt-5 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            autoFocus
            className={`rounded-xl px-5 py-2 text-sm font-semibold text-white shadow-soft transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900 ${v.btnClass}`}
          >
            Tutup
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
