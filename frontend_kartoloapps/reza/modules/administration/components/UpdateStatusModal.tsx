import { createPortal } from 'react-dom';
import { useEffect, useState } from 'react';
import { Check, ShieldCheck, X } from 'lucide-react';
import type { UserRow, UserStatus } from '../api/user-api';

interface UpdateStatusModalProps {
  open: boolean;
  user: UserRow | null;
  onSubmit: (status: UserStatus) => void;
  onClose: () => void;
}

const STATUS_OPTIONS: Array<{ value: UserStatus; label: string; desc: string; dot: string }> = [
  { value: 'active', label: 'Aktif', desc: 'User dapat login dan mengakses sistem.', dot: 'bg-emerald-500' },
  { value: 'inactive', label: 'Tidak Aktif', desc: 'User tidak dapat login (nonaktif sementara).', dot: 'bg-slate-400' },
  { value: 'blocked', label: 'Block', desc: 'User diblokir dan tidak dapat login.', dot: 'bg-red-500' },
];

/** Modal pilih status user (Aktif / Tidak Aktif / Block) lalu Simpan. */
export function UpdateStatusModal({ open, user, onSubmit, onClose }: UpdateStatusModalProps) {
  const [selected, setSelected] = useState<UserStatus>('active');

  // Default pilihan = status user saat ini (bila valid), reset tiap modal dibuka.
  useEffect(() => {
    if (!open || !user) return;
    const cur = user.status;
    setSelected(cur === 'active' || cur === 'inactive' || cur === 'blocked' ? cur : 'active');
  }, [open, user]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open || !user) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/30 dark:bg-slate-950/60 backdrop-blur-sm animate-fade-in"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      role="dialog"
      aria-modal="true"
      aria-label="Update status user"
    >
      <div className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-700/70 bg-white dark:bg-slate-900 shadow-2xl animate-pop-in">
        {/* Header */}
        <div className="flex items-center gap-3 px-6 pt-5 pb-4">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-100 dark:bg-sky-500/15 text-sky-600 dark:text-sky-300 shrink-0">
            <ShieldCheck className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="text-lg font-bold text-slate-800 dark:text-slate-50">Update Status User</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">
              {user.username ?? user.email}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup"
            className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Options */}
        <div className="px-6 pb-2 space-y-2">
          {STATUS_OPTIONS.map((opt) => {
            const active = selected === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => setSelected(opt.value)}
                aria-pressed={active}
                className={`flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 ${
                  active
                    ? 'border-sky-400 bg-sky-50 dark:border-sky-500/50 dark:bg-sky-500/10'
                    : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/60'
                }`}
              >
                <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${opt.dot}`} />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-slate-800 dark:text-slate-100">{opt.label}</span>
                  <span className="block text-xs text-slate-500 dark:text-slate-400">{opt.desc}</span>
                </span>
                <span className={`flex h-5 w-5 items-center justify-center rounded-full shrink-0 transition-colors ${active ? 'bg-sky-500 text-white' : 'border border-slate-300 dark:border-slate-600'}`}>
                  {active && <Check className="h-3 w-3" />}
                </span>
              </button>
            );
          })}
        </div>

        {/* Actions */}
        <div className="px-6 py-5 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-200 dark:border-slate-700 px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            Batal
          </button>
          <button
            type="button"
            onClick={() => onSubmit(selected)}
            className="inline-flex items-center gap-1.5 rounded-xl bg-sky-600 hover:bg-sky-700 px-5 py-2 text-sm font-semibold text-white shadow-soft transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 focus-visible:ring-offset-1 dark:focus-visible:ring-offset-slate-900"
          >
            Simpan
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
