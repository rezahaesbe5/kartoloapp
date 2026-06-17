import { type FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertCircle, ChevronDown, Loader2, Package, X } from 'lucide-react';
import { createProduk, updateProduk, type ProdukRow } from '../api/produk-api';
import { apiErrorMessage } from '../lib/api-error';

interface ProdukFormModalProps {
  open: boolean;
  mode: 'create' | 'edit';
  initialData?: ProdukRow | null;
  onClose: () => void;
  onSuccess: (message: string) => void;
}

const URL_PATTERN = /^[a-z0-9][a-z0-9_-]*$/;

/** Modal form tambah/edit produk — portal, dark/light aware, auto-focus. */
export function ProdukFormModal({
  open,
  mode,
  initialData,
  onClose,
  onSuccess,
}: ProdukFormModalProps) {
  const [namaProduk, setNamaProduk] = useState(initialData?.nama_produk ?? '');
  const [urlProduk, setUrlProduk] = useState(initialData?.url_produk ?? '');
  const [activeFlag, setActiveFlag] = useState<boolean>(initialData?.active_flag ?? true);
  const [submitting, setSubmitting] = useState(false);
  const [backendError, setBackendError] = useState<string | null>(null);
  const namaRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setNamaProduk(initialData?.nama_produk ?? '');
      setUrlProduk(initialData?.url_produk ?? '');
      setActiveFlag(initialData?.active_flag ?? true);
      setBackendError(null);
      setSubmitting(false);
      setTimeout(() => namaRef.current?.focus(), 50);
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

  const title = mode === 'create' ? 'Tambah Produk' : 'Edit Produk';

  const namaInvalid = namaProduk.trim().length < 2;
  const urlTrimmed = urlProduk.trim().toLowerCase();
  const urlInvalid = !URL_PATTERN.test(urlTrimmed) || urlTrimmed.length < 2;
  const isInvalid = namaInvalid || urlInvalid;

  const handleSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      setBackendError(null);
      if (isInvalid) return;

      setSubmitting(true);
      try {
        const payload = {
          nama_produk: namaProduk.trim(),
          url_produk: urlTrimmed,
          active_flag: activeFlag,
        };
        let message: string;
        if (mode === 'create') {
          ({ message } = await createProduk(payload));
        } else if (initialData) {
          ({ message } = await updateProduk(initialData.id, payload));
        } else {
          message = 'Berhasil.';
        }
        onSuccess(message);
        onClose();
      } catch (err: unknown) {
        setBackendError(apiErrorMessage(err, 'Gagal menyimpan produk. Coba lagi.'));
      } finally {
        setSubmitting(false);
      }
    },
    [namaProduk, urlTrimmed, activeFlag, mode, initialData, isInvalid, onSuccess, onClose],
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
            <Package className="h-5 w-5" />
          </span>
          <h2 className="text-lg font-bold flex-1 text-slate-800 dark:text-slate-50">{title}</h2>
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
          {/* Nama Produk */}
          <div>
            <label
              htmlFor="produk-nama"
              className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5 inline-block"
            >
              Nama Produk
            </label>
            <input
              id="produk-nama"
              ref={namaRef}
              type="text"
              value={namaProduk}
              onChange={(e) => {
                setNamaProduk(e.target.value);
                setBackendError(null);
              }}
              placeholder="mis. Manajemen Aset"
              maxLength={100}
              autoComplete="off"
              disabled={submitting}
              aria-invalid={namaInvalid}
              className="field !py-2.5 text-sm"
            />
            {namaInvalid && namaProduk.length > 0 && (
              <p role="alert" className="mt-1.5 flex items-center gap-1.5 text-xs font-medium text-red-600 dark:text-red-400">
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                <span>Minimal 2 karakter.</span>
              </p>
            )}
          </div>

          {/* URL Produk */}
          <div>
            <label
              htmlFor="produk-url"
              className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5 inline-block"
            >
              URL Produk
            </label>
            <input
              id="produk-url"
              type="text"
              value={urlProduk}
              onChange={(e) => {
                setUrlProduk(e.target.value);
                setBackendError(null);
              }}
              placeholder="mis. manajemen-aset"
              maxLength={50}
              autoComplete="off"
              disabled={submitting}
              aria-invalid={urlInvalid && urlProduk.length > 0}
              className="field !py-2.5 text-sm"
            />
            <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">
              Huruf kecil, angka, dash (-), underscore (_). Dipakai sebagai segmen URL.
            </p>
            {urlInvalid && urlProduk.length > 0 && (
              <p role="alert" className="mt-1 flex items-center gap-1.5 text-xs font-medium text-red-600 dark:text-red-400">
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                <span>Format URL tidak valid (min 2 karakter, hanya a-z 0-9 - _).</span>
              </p>
            )}
          </div>

          {/* Status Aktif */}
          <div>
            <label
              htmlFor="produk-status"
              className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5 inline-block"
            >
              Status Aktif
            </label>
            <div className="relative">
              <select
                id="produk-status"
                value={activeFlag ? 'true' : 'false'}
                onChange={(e) => setActiveFlag(e.target.value === 'true')}
                disabled={submitting}
                className="field !py-2.5 text-sm appearance-none pr-9 cursor-pointer"
              >
                <option value="true">Ya</option>
                <option value="false">Tidak</option>
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            </div>
          </div>

          {backendError && (
            <p role="alert" className="flex items-center gap-1.5 text-xs font-medium text-red-600 dark:text-red-400 animate-fade-in">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              <span>{backendError}</span>
            </p>
          )}

          {/* Action buttons */}
          <div className="flex items-center justify-end gap-2 pt-1">
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
