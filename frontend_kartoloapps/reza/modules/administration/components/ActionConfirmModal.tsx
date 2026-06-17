import { createPortal } from 'react-dom';
import { useEffect, type ReactNode } from 'react';
import { AlertCircle, Loader2 } from 'lucide-react';

export type ConfirmTone = 'red' | 'amber' | 'indigo' | 'sky' | 'rose' | 'violet';

const TONE_ICON: Record<ConfirmTone, string> = {
  red: 'bg-red-100 dark:bg-red-500/15 text-red-600 dark:text-red-300',
  amber: 'bg-amber-100 dark:bg-amber-500/15 text-amber-600 dark:text-amber-300',
  indigo: 'bg-indigo-100 dark:bg-indigo-500/15 text-indigo-600 dark:text-indigo-300',
  sky: 'bg-sky-100 dark:bg-sky-500/15 text-sky-600 dark:text-sky-300',
  rose: 'bg-rose-100 dark:bg-rose-500/15 text-rose-600 dark:text-rose-300',
  violet: 'bg-violet-100 dark:bg-violet-500/15 text-violet-600 dark:text-violet-300',
};

const TONE_BTN: Record<ConfirmTone, string> = {
  red: 'bg-red-600 hover:bg-red-700 focus-visible:ring-red-400',
  amber: 'bg-amber-600 hover:bg-amber-700 focus-visible:ring-amber-400',
  indigo: 'bg-indigo-600 hover:bg-indigo-700 focus-visible:ring-indigo-400',
  sky: 'bg-sky-600 hover:bg-sky-700 focus-visible:ring-sky-400',
  rose: 'bg-rose-600 hover:bg-rose-700 focus-visible:ring-rose-400',
  violet: 'bg-violet-600 hover:bg-violet-700 focus-visible:ring-violet-400',
};

interface ActionConfirmModalProps {
  open: boolean;
  icon: ReactNode;
  tone: ConfirmTone;
  title: string;
  message: ReactNode;
  confirmLabel: string;
  loadingLabel: string;
  loading: boolean;
  error: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Modal konfirmasi aksi generik (yakin/tidak) — dipakai aksi tabel user admin. */
export function ActionConfirmModal({
  open,
  icon,
  tone,
  title,
  message,
  confirmLabel,
  loadingLabel,
  loading,
  error,
  onConfirm,
  onCancel,
}: ActionConfirmModalProps) {
  useEffect(() => {
    if (!open || loading) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, loading, onCancel]);

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/30 dark:bg-slate-950/60 backdrop-blur-sm animate-fade-in"
      onClick={(e) => { if (e.target === e.currentTarget && !loading) onCancel(); }}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 dark:border-slate-700/70 bg-white dark:bg-slate-900 shadow-2xl animate-pop-in p-6">
        <div className="flex items-center gap-3 mb-4">
          <span className={`flex h-10 w-10 items-center justify-center rounded-xl shrink-0 ${TONE_ICON[tone]}`}>
            {icon}
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-bold text-slate-800 dark:text-slate-50">{title}</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">{message}</p>
          </div>
        </div>
        {error && (
          <p role="alert" className="mb-3 flex items-center gap-1.5 text-xs font-medium text-red-600 dark:text-red-400 animate-fade-in">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            <span>{error}</span>
          </p>
        )}
        <div className="mt-2 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="rounded-xl border border-slate-200 dark:border-slate-700 px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Batal
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className={`inline-flex items-center gap-1.5 rounded-xl px-5 py-2 text-sm font-semibold text-white shadow-soft transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 dark:focus-visible:ring-offset-slate-900 disabled:opacity-50 disabled:cursor-not-allowed ${TONE_BTN[tone]}`}
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            {loading ? loadingLabel : confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
