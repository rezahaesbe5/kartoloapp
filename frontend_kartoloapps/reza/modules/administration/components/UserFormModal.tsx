import { type FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertCircle, Loader2, Users, X } from 'lucide-react';
import { createUser, updateUser, type UserRow, type UserTypeFilter } from '../api/user-api';
import { apiErrorMessage } from '../lib/api-error';

interface UserFormModalProps {
  open: boolean;
  mode: 'create' | 'edit';
  initialData?: UserRow | null;
  onClose: () => void;
  onSuccess: (result: { plainPassword?: string; message: string; username: string }) => void;
  /** Label entitas di judul ("Admin" / "Member"). Default "Admin". */
  entityLabel?: string;
  /** Tipe user yang dibuat (untuk mode create). Default "admin". */
  userType?: UserTypeFilter;
}

/** Modal form tambah/edit user (admin/member). */
export function UserFormModal({
  open,
  mode,
  initialData,
  onClose,
  onSuccess,
  entityLabel = 'Admin',
  userType = 'admin',
}: UserFormModalProps) {
  const [username, setUsername] = useState(initialData?.username ?? '');
  const [email, setEmail] = useState(initialData?.email ?? '');
  const [fullName, setFullName] = useState(initialData?.full_name ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [backendError, setBackendError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setUsername(initialData?.username ?? '');
      setEmail(initialData?.email ?? '');
      setFullName(initialData?.full_name ?? '');
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

  const title = mode === 'create' ? `Tambah User ${entityLabel}` : `Edit User ${entityLabel}`;

  const usernameInvalid = username.trim().length < 2;
  const emailInvalid = !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const fullNameInvalid = fullName.trim().length < 2;
  const isInvalid = usernameInvalid || emailInvalid || fullNameInvalid;

  const handleSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      setBackendError(null);

      const u = username.trim();
      const em = email.trim();
      const fn = fullName.trim();

      if (u.length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em) || fn.length < 2) return;

      setSubmitting(true);
      try {
        if (mode === 'create') {
          const result = await createUser({ username: u, email: em, full_name: fn, user_type: userType });
          onSuccess({ plainPassword: result.plainPassword, message: result.message, username: u });
        } else if (initialData) {
          const result = await updateUser({ id: initialData.id, username: u, email: em, full_name: fn });
          onSuccess({ message: result.message, username: u });
        }
        onClose();
      } catch (err: unknown) {
        setBackendError(apiErrorMessage(err, 'Gagal menyimpan user. Coba lagi.'));
      } finally {
        setSubmitting(false);
      }
    },
    [username, email, fullName, mode, initialData, userType, onSuccess, onClose],
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
      <div className="w-full max-w-lg rounded-2xl border border-slate-200 dark:border-slate-700/70 bg-white dark:bg-slate-900 shadow-2xl animate-pop-in">
        {/* Header */}
        <div className="flex items-center gap-3 px-6 pt-5 pb-4">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-50 dark:bg-primary-500/20 text-primary-600 dark:text-primary-300 shrink-0">
            <Users className="h-5 w-5" />
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
        <form onSubmit={handleSubmit} className="px-6 pb-6 space-y-4">
          {/* Username */}
          <div>
            <label htmlFor="ua-username" className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5 inline-block">
              Username
            </label>
            <input
              id="ua-username"
              ref={inputRef}
              type="text"
              value={username}
              onChange={(e) => { setUsername(e.target.value); setBackendError(null); }}
              placeholder="mis. johndoe"
              maxLength={50}
              autoComplete="off"
              disabled={submitting}
              className={`field !py-2.5 text-sm ${
                backendError && usernameInvalid ? '!border-red-400 dark:!border-red-500/70' : ''
              }`}
            />
            {usernameInvalid && username.length > 0 && (
              <p role="alert" className="mt-1.5 flex items-center gap-1.5 text-xs font-medium text-red-600 dark:text-red-400 animate-fade-in">
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                <span>Minimal 2 karakter.</span>
              </p>
            )}
          </div>

          {/* Email */}
          <div>
            <label htmlFor="ua-email" className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5 inline-block">
              Email
            </label>
            <input
              id="ua-email"
              type="email"
              value={email}
              onChange={(e) => { setEmail(e.target.value); setBackendError(null); }}
              placeholder="mis. john@company.com"
              maxLength={100}
              autoComplete="off"
              disabled={submitting}
              className={`field !py-2.5 text-sm ${
                backendError && emailInvalid ? '!border-red-400 dark:!border-red-500/70' : ''
              }`}
            />
            {emailInvalid && email.length > 0 && (
              <p role="alert" className="mt-1.5 flex items-center gap-1.5 text-xs font-medium text-red-600 dark:text-red-400 animate-fade-in">
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                <span>Format email tidak valid.</span>
              </p>
            )}
          </div>

          {/* Full Name */}
          <div>
            <label htmlFor="ua-fullname" className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5 inline-block">
              Full Name
            </label>
            <input
              id="ua-fullname"
              type="text"
              value={fullName}
              onChange={(e) => { setFullName(e.target.value); setBackendError(null); }}
              placeholder="mis. John Doe"
              maxLength={100}
              autoComplete="off"
              disabled={submitting}
              className={`field !py-2.5 text-sm ${
                backendError && fullNameInvalid ? '!border-red-400 dark:!border-red-500/70' : ''
              }`}
            />
            {fullNameInvalid && fullName.length > 0 && (
              <p role="alert" className="mt-1.5 flex items-center gap-1.5 text-xs font-medium text-red-600 dark:text-red-400 animate-fade-in">
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                <span>Minimal 2 karakter.</span>
              </p>
            )}
          </div>

          {/* Catatan: role tidak lagi diisi di sini — kelola lewat tombol
              "Mapping Role User" di tabel setelah user dibuat. */}
          <p className="flex items-start gap-1.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 px-3 py-2.5 text-xs text-slate-500 dark:text-slate-400">
            <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5 text-slate-400 dark:text-slate-500" />
            <span>Role di-atur terpisah lewat tombol <span className="font-semibold text-slate-600 dark:text-slate-300">Mapping Role User</span> pada kolom Aksi setelah user tersimpan.</span>
          </p>

          {/* Backend error */}
          {backendError && (
            <p role="alert" className="flex items-center gap-1.5 text-xs font-medium text-red-600 dark:text-red-400 animate-fade-in">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              <span>{backendError}</span>
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
