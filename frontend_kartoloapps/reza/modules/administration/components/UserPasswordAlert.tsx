import { createPortal } from 'react-dom';
import { useEffect, useState } from 'react';
import { Copy, Users, X } from 'lucide-react';

interface UserPasswordAlertProps {
  open: boolean;
  password: string;
  username: string;
  title?: string;
  caption?: string;
  onClose: () => void;
}

/** Modal menampilkan password baru setelah create user / reset password berhasil. */
export function UserPasswordAlert({ open, password, username, title, caption, onClose }: UserPasswordAlertProps) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(password);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
    }
  }

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/30 dark:bg-slate-950/60 backdrop-blur-sm animate-fade-in"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      role="dialog"
      aria-modal="true"
      aria-label="Password berhasil dibuat"
    >
      <div className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-700/70 bg-white dark:bg-slate-900 shadow-2xl animate-pop-in">
        {/* Header */}
        <div className="flex items-center gap-3 px-6 pt-5 pb-4">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 dark:bg-emerald-500/15 text-emerald-600 dark:text-emerald-300 shrink-0">
            <Users className="h-5 w-5" />
          </span>
          <h3 className="text-lg font-bold flex-1 text-slate-800 dark:text-slate-50">
            {title ?? 'User Berhasil Dibuat'}
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup"
            className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Content */}
        <div className="px-6 pb-6">
          <p className="text-sm text-slate-600 dark:text-slate-300 mb-4">
            {caption ?? (
              <>
                User &quot;<span className="font-semibold text-slate-800 dark:text-slate-100">{username}</span>&quot; berhasil ditambahkan. Berikut password awal user:
              </>
            )}
          </p>

          {/* Password box */}
          <div className="relative flex items-center gap-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-4 py-3">
            <code className="flex-1 text-sm font-mono font-bold text-slate-800 dark:text-slate-100 break-all select-all">
              {password}
            </code>
            <button
              type="button"
              onClick={handleCopy}
              aria-label="Copy password"
              className="shrink-0 inline-flex h-8 w-8 items-center justify-center rounded-lg bg-primary-100 text-primary-700 ring-1 ring-primary-200/70 transition-all duration-150 hover:bg-primary-600 hover:text-white hover:ring-primary-600 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 focus-visible:ring-offset-1 dark:bg-primary-500/15 dark:text-primary-300 dark:ring-primary-500/30 dark:hover:bg-primary-500 dark:hover:text-white dark:hover:ring-primary-400 dark:focus-visible:ring-offset-slate-900"
            >
              <Copy className="h-3.5 w-3.5" />
            </button>
          </div>

          {copied && (
            <p className="mt-2 text-xs font-medium text-emerald-600 dark:text-emerald-400 animate-fade-in">
              ✓ Password berhasil dicopy ke clipboard.
            </p>
          )}

          <p className="mt-4 text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10 rounded-lg px-3 py-2 border border-amber-200 dark:border-amber-500/20">
            ⚠️ Simpan password ini dengan aman. User akan diminta mengganti password saat login pertama kali.
          </p>

          {/* Action */}
          <div className="mt-4 flex justify-end">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl bg-gradient-primary px-5 py-2 text-sm font-semibold text-white shadow-soft transition-all duration-200 hover:shadow-[0_8px_28px_-6px_rgba(34,197,94,0.45)] hover:-translate-y-0.5 active:translate-y-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400"
            >
              Tutup
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
