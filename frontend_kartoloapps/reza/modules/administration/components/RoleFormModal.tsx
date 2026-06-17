import { type FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertCircle, Loader2, ShieldCheck, X } from 'lucide-react';
import { createRole, updateRole, type RoleRow } from '../api/role-api';
import { apiErrorMessage } from '../lib/api-error';

interface RoleFormModalProps {
  open: boolean;
  mode: 'create' | 'edit';
  initialData?: RoleRow | null;
  onClose: () => void;
  onSuccess: (message: string) => void;
}

/** Modal form tambah/edit role — portal, dark/light aware, auto-focus. */
export function RoleFormModal({
  open,
  mode,
  initialData,
  onClose,
  onSuccess,
}: RoleFormModalProps) {
  const [input, setInput] = useState(initialData?.nama_role ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [backendError, setBackendError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setInput(initialData?.nama_role ?? '');
      setBackendError(null);
      setSubmitting(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open, initialData]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !submitting) onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, submitting, onClose]);

  const title = mode === 'create' ? 'Tambah Role User' : 'Edit Role User';
  const isInvalid = input.trim().length < 2;

  const handleSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      setBackendError(null);

      const namaRole = input.trim();
      if (namaRole.length < 2) return;

      setSubmitting(true);
      try {
        let message: string;
        if (mode === 'create') {
          ({ message } = await createRole(namaRole));
        } else if (initialData) {
          ({ message } = await updateRole(initialData.id, namaRole));
        } else {
          message = 'Berhasil.';
        }
        onSuccess(message);
        onClose();
      } catch (err: unknown) {
        setBackendError(apiErrorMessage(err, 'Gagal menyimpan role. Coba lagi.'));
      } finally {
        setSubmitting(false);
      }
    },
    [input, mode, initialData, onSuccess, onClose],
  );

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/30 dark:bg-slate-950/60 backdrop-blur-sm animate-fade-in"
      onClick={(e) => {
        if (e.target === e.currentTarget && !submitting) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-700/70 bg-white dark:bg-slate-900 shadow-2xl animate-pop-in">
        {/* Header */}
        <div className="flex items-center gap-3 px-6 pt-5 pb-4">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-50 dark:bg-primary-500/20 text-primary-600 dark:text-primary-300 shrink-0">
            <ShieldCheck className="h-5 w-5" />
          </span>
          <h2 className="text-lg font-bold flex-1 text-slate-800 dark:text-slate-50">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            aria-label="Tutup"
            className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-6 pb-6">
          <label
            htmlFor="role-nama"
            className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5 inline-block"
          >
            Nama Role
          </label>
          <input
            id="role-nama"
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              setBackendError(null);
            }}
            placeholder="mis. Admin Keuangan"
            maxLength={50}
            autoComplete="off"
            disabled={submitting}
            aria-invalid={isInvalid || Boolean(backendError)}
            className={`field !py-2.5 text-sm ${
              backendError
                ? '!border-red-400 dark:!border-red-500/70 focus:!border-red-500 focus:!shadow-[0_0_0_4px_rgba(239,68,68,0.12)]'
                : ''
            }`}
          />

          {backendError && (
            <p role="alert" className="mt-2 flex items-center gap-1.5 text-xs font-medium text-red-600 dark:text-red-400 animate-fade-in">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              <span>{backendError}</span>
            </p>
          )}
          {isInvalid && input.length > 0 && (
            <p role="alert" className="mt-2 flex items-center gap-1.5 text-xs font-medium text-red-600 dark:text-red-400">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              <span>Minimal 2 karakter.</span>
            </p>
          )}

          {/* Action buttons */}
          <div className="mt-4 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="rounded-xl border border-slate-200 dark:border-slate-700 px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={submitting || isInvalid}
              className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-primary px-5 py-2 text-sm font-semibold text-white shadow-soft transition-all duration-200 hover:shadow-[0_8px_28px_-6px_rgba(34,197,94,0.45)] hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-soft"
            >
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {submitting ? 'Menyimpan…' : 'Simpan'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}
