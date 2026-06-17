import { createPortal } from 'react-dom';
import { useEffect, useState } from 'react';
import { AlertCircle, Check, Loader2, ShieldCheck, X } from 'lucide-react';
import { getRoleList, type RoleRow } from '../api/role-api';
import { setProdukRoleMappings, type ProdukRow } from '../api/produk-api';
import { apiErrorMessage } from '../lib/api-error';

interface MappingProdukModalProps {
  open: boolean;
  produk: ProdukRow | null;
  onClose: () => void;
  onSuccess: (message: string) => void;
}

/**
 * Modal "Mapping Role Produk".
 * - Tampilkan semua role (mst_role) sebagai toggle multi-select.
 * - Prefill dari produk.role_ids (role yang sudah ter-mapping).
 * - Simpan = replace-all role_list produk lewat set-role-mappings.
 */
export function MappingProdukModal({ open, produk, onClose, onSuccess }: MappingProdukModalProps) {
  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const [loading, setLoading] = useState(false); // initial load (daftar role)
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !produk) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setSelected(new Set(produk.role_ids));

    getRoleList({ page: 1, page_size: 100, sort_by: 'nama_role', sort_dir: 'asc' })
      .then((res) => {
        if (cancelled) return;
        setRoles(res.items);
      })
      .catch((err) => {
        if (!cancelled) setError(apiErrorMessage(err, 'Gagal memuat daftar role.'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, produk]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !saving) onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, saving, onClose]);

  function toggleRole(role: RoleRow) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(role.id)) next.delete(role.id);
      else next.add(role.id);
      return next;
    });
    setError(null);
  }

  function removeChip(roleId: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.delete(roleId);
      return next;
    });
  }

  async function handleSave() {
    if (!produk) return;
    setSaving(true);
    setError(null);
    try {
      const { message } = await setProdukRoleMappings(produk.id, [...selected]);
      onSuccess(message);
      onClose();
    } catch (err) {
      setError(apiErrorMessage(err, 'Gagal menyimpan mapping role produk. Coba lagi.'));
    } finally {
      setSaving(false);
    }
  }

  if (!open || !produk) return null;

  const roleNameById = new Map(roles.map((r) => [r.id, r.nama_role]));
  const selectedList = [...selected]
    .map((id) => ({ id, nama_role: roleNameById.get(id) ?? `#${id}` }))
    .sort((a, b) => a.nama_role.localeCompare(b.nama_role));

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/30 dark:bg-slate-950/60 backdrop-blur-sm animate-fade-in"
      onClick={(e) => {
        if (e.target === e.currentTarget && !saving) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Mapping Role Produk"
    >
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-700/70 bg-white dark:bg-slate-900 shadow-2xl animate-pop-in">
        {/* Header */}
        <div className="flex items-center gap-3 px-6 pt-5 pb-4 border-b border-slate-100 dark:border-slate-800">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-100 dark:bg-violet-500/15 text-violet-600 dark:text-violet-300 shrink-0">
            <ShieldCheck className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-bold text-slate-800 dark:text-slate-50 leading-tight">Mapping Role Produk</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">{produk.nama_produk}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            aria-label="Tutup"
            className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-10 text-slate-500 dark:text-slate-400">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span className="text-sm">Memuat daftar role…</span>
            </div>
          ) : (
            <>
              {/* Daftar role (toggle multi-select) */}
              <div>
                <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5 inline-block">
                  Pilih role
                </label>
                {roles.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-slate-200 dark:border-slate-700 px-3 py-4 text-center text-xs text-slate-400 dark:text-slate-500">
                    Belum ada role di sistem. Tambahkan role lewat menu Role User.
                  </p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {roles.map((r) => {
                      const checked = selected.has(r.id);
                      return (
                        <button
                          key={r.id}
                          type="button"
                          onClick={() => toggleRole(r)}
                          disabled={saving}
                          aria-pressed={checked}
                          className={`group flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left text-sm transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 disabled:opacity-50 disabled:cursor-not-allowed ${
                            checked
                              ? 'border-violet-300 bg-violet-50 text-violet-800 dark:border-violet-500/40 dark:bg-violet-500/15 dark:text-violet-200'
                              : 'border-slate-200 bg-white text-slate-600 hover:border-violet-200 hover:bg-violet-50/50 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-300 dark:hover:border-violet-500/30 dark:hover:bg-violet-500/10'
                          }`}
                        >
                          <span
                            className={`flex h-5 w-5 items-center justify-center rounded-md border shrink-0 transition-colors ${
                              checked
                                ? 'border-violet-500 bg-violet-500 text-white'
                                : 'border-slate-300 dark:border-slate-600 text-transparent'
                            }`}
                          >
                            <Check className="h-3.5 w-3.5" />
                          </span>
                          <span className="min-w-0 flex-1 truncate font-medium">{r.nama_role}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Ringkasan role terpilih */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Role ter-mapping
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-[11px] font-bold text-slate-600 dark:text-slate-300 tabular-nums">
                    <ShieldCheck className="h-3 w-3" /> {selectedList.length}
                  </span>
                </div>
                {selectedList.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-slate-200 dark:border-slate-700 px-3 py-3 text-center text-xs text-slate-400 dark:text-slate-500">
                    Belum ada role dipilih. Produk tanpa role hanya bisa diakses superadmin.
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {selectedList.map((r) => (
                      <span
                        key={r.id}
                        className="inline-flex items-center gap-1 rounded-full bg-violet-100 dark:bg-violet-500/15 pl-2.5 pr-1 py-1 text-xs font-semibold text-violet-700 dark:text-violet-300"
                      >
                        {r.nama_role}
                        <button
                          type="button"
                          onClick={() => removeChip(r.id)}
                          disabled={saving}
                          aria-label={`Hapus role ${r.nama_role}`}
                          className="flex h-4 w-4 items-center justify-center rounded-full text-violet-500 transition-colors hover:bg-violet-200 hover:text-violet-800 dark:hover:bg-violet-500/30 disabled:opacity-40"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {error && (
                <p role="alert" className="flex items-center gap-1.5 text-xs font-medium text-red-600 dark:text-red-400 animate-fade-in">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                  <span>{error}</span>
                </p>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-slate-100 dark:border-slate-800 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-xl border border-slate-200 dark:border-slate-700 px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Batal
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || loading}
            className="inline-flex items-center gap-1.5 rounded-xl bg-violet-600 hover:bg-violet-700 px-5 py-2 text-sm font-semibold text-white shadow-soft transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 focus-visible:ring-offset-1 dark:focus-visible:ring-offset-slate-900 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {saving ? 'Menyimpan…' : 'Simpan'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
