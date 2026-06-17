import { createPortal } from 'react-dom';
import { useEffect, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import {
  AlertCircle,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  ChevronsUpDown,
  ChevronUp,
  Loader2,
  Pencil,
  RefreshCw,
  Search,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import {
  getRoleList,
  deleteRole,
  type RoleRow,
} from '../api/role-api';
import { RoleFormModal } from '../components/RoleFormModal';
import { ResultAlert, type ResultVariant } from '../components/ResultAlert';
import { apiErrorMessage } from '../lib/api-error';

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;

function FieldError({ id, message }: { id: string; message: string | null }) {
  if (!message) return null;
  return (
    <p
      id={id}
      role="alert"
      className="mt-1.5 flex items-center gap-1.5 text-xs font-medium text-red-600 dark:text-red-400 animate-fade-in"
    >
      <AlertCircle className="h-3.5 w-3.5 shrink-0" />
      <span>{message}</span>
    </p>
  );
}

function LoadingBar({ active }: { active: boolean }) {
  return (
    <div
      aria-hidden={!active}
      className={`relative h-0.5 overflow-hidden rounded-full bg-primary-100/60 dark:bg-primary-500/15 transition-opacity duration-200 ${
        active ? 'opacity-100' : 'opacity-0'
      }`}
    >
      <div className="absolute inset-y-0 left-0 w-1/3 rounded-full bg-gradient-to-r from-transparent via-primary-500 to-transparent animate-progress-slide" />
    </div>
  );
}

function buildPageNumbers(current: number, total: number): (number | 'ellipsis')[] {
  if (total <= 1) return [1];
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const items: (number | 'ellipsis')[] = [];
  const left = Math.max(2, current - 1);
  const right = Math.min(total - 1, current + 1);
  items.push(1);
  if (left > 2) items.push('ellipsis');
  for (let p = left; p <= right; p++) items.push(p);
  if (right < total - 1) items.push('ellipsis');
  items.push(total);
  return items;
}

interface PaginationProps {
  page: number;
  totalPages: number;
  disabled?: boolean;
  onChange: (page: number) => void;
}

function Pagination({ page, totalPages, disabled, onChange }: PaginationProps) {
  const items = buildPageNumbers(page, totalPages);
  const isFirst = page <= 1;
  const isLast = page >= totalPages;
  const baseBtn =
    'inline-flex h-8 min-w-[2rem] items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 px-2 text-xs font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 disabled:opacity-40 disabled:cursor-not-allowed';
  const navBtn = `${baseBtn} text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800`;
  const pageBtnInactive = `${baseBtn} text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800`;
  const pageBtnActive =
    'inline-flex h-8 min-w-[2rem] items-center justify-center rounded-lg border border-primary-500 bg-gradient-primary px-2 text-xs font-bold text-white shadow-soft cursor-default';

  return (
    <nav aria-label="Pagination" className="flex flex-wrap items-center gap-1">
      <button type="button" onClick={() => onChange(1)} disabled={isFirst || disabled} aria-label="Halaman pertama" className={navBtn}>
        <ChevronsLeft className="h-3.5 w-3.5" />
      </button>
      <button type="button" onClick={() => onChange(Math.max(1, page - 1))} disabled={isFirst || disabled} aria-label="Halaman sebelumnya" className={navBtn}>
        <ChevronLeft className="h-3.5 w-3.5" />
      </button>
      {items.map((it, idx) =>
        it === 'ellipsis' ? (
          <span key={`el-${idx}`} aria-hidden className="inline-flex h-8 min-w-[2rem] items-center justify-center px-1 text-xs text-slate-400 dark:text-slate-500 select-none">
            …
          </span>
        ) : (
          <button key={it} type="button" onClick={() => onChange(it)} disabled={disabled || it === page} aria-current={it === page ? 'page' : undefined} aria-label={`Halaman ${it}`} className={it === page ? pageBtnActive : pageBtnInactive}>
            {it}
          </button>
        ),
      )}
      <button type="button" onClick={() => onChange(Math.min(totalPages, page + 1))} disabled={isLast || disabled} aria-label="Halaman berikutnya" className={navBtn}>
        <ChevronRight className="h-3.5 w-3.5" />
      </button>
      <button type="button" onClick={() => onChange(totalPages)} disabled={isLast || disabled} aria-label="Halaman terakhir" className={navBtn}>
        <ChevronsRight className="h-3.5 w-3.5" />
      </button>
    </nav>
  );
}

interface SortHeaderProps {
  label: string;
  col: 'nama_role';
  activeCol: 'nama_role';
  dir: 'asc' | 'desc';
  onSort: (col: 'nama_role') => void;
}

function SortHeader({ label, col, activeCol, dir, onSort }: SortHeaderProps) {
  const active = activeCol === col;
  const Icon = !active ? ChevronsUpDown : dir === 'asc' ? ChevronUp : ChevronDown;
  return (
    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide">
      <button
        type="button"
        onClick={() => onSort(col)}
        aria-label={`Urutkan berdasarkan ${label}`}
        className={`group inline-flex items-center gap-1.5 transition-colors ${
          active ? 'text-primary-700 dark:text-primary-300' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
        }`}
      >
        {label}
        <Icon className="h-3.5 w-3.5 shrink-0" />
      </button>
    </th>
  );
}

/** Halaman User Role produk Administration. */
export function RoleUserPage() {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(10);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<'nama_role'>('nama_role');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  // Modal state
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<'create' | 'edit'>('create');
  const [editData, setEditData] = useState<RoleRow | null>(null);

  // Delete confirmation state
  const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; role: RoleRow | null }>({ open: false, role: null });
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Alert hasil aksi (sukses/gagal) — menampilkan message dari backend.
  const [resultAlert, setResultAlert] = useState<{ open: boolean; variant: ResultVariant; message: string }>({ open: false, variant: 'success', message: '' });
  function showResult(variant: ResultVariant, message: string) {
    setResultAlert({ open: true, variant, message });
  }

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  const query = useQuery({
    queryKey: ['admin.role.list', { page, pageSize, search, sortBy, sortDir }],
    queryFn: () => getRoleList({ page, page_size: pageSize, search: search || undefined, sort_by: sortBy, sort_dir: sortDir }),
    placeholderData: keepPreviousData,
  });

  const items = query.data?.items ?? [];
  const pagination = query.data?.pagination;
  const total = pagination?.total ?? 0;
  const totalPages = pagination?.total_pages ?? 1;
  const rangeFrom = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeTo = total === 0 ? 0 : rangeFrom + items.length - 1;

  function changePageSize(size: number) {
    setPageSize(size);
    setPage(1);
  }

  function toggleSort(col: 'nama_role') {
    if (sortBy === col) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(col);
      setSortDir('asc');
    }
    setPage(1);
  }

  function openCreate() {
    setFormMode('create');
    setEditData(null);
    setFormOpen(true);
  }

  function openEdit(row: RoleRow) {
    setFormMode('edit');
    setEditData(row);
    setFormOpen(true);
  }

  function handleFormSuccess(message: string) {
    query.refetch();
    showResult('success', message);
  }

  function openDeleteConfirm(row: RoleRow) {
    setDeleteConfirm({ open: true, role: row });
    setDeleteError(null);
  }

  async function handleDelete() {
    if (!deleteConfirm.role) return;
    setDeleteLoading(true);
    setDeleteError(null);
    try {
      const { message } = await deleteRole(deleteConfirm.role.id);
      setDeleteConfirm({ open: false, role: null });
      showResult('success', message);
      query.refetch();
    } catch (err: unknown) {
      setDeleteConfirm({ open: false, role: null });
      showResult('error', apiErrorMessage(err, 'Gagal menghapus role. Coba lagi.'));
    } finally {
      setDeleteLoading(false);
    }
  }

  return (
    <section className="space-y-6 animate-fade-in-up">
      {/* Header card */}
      <div className="glass-card rounded-3xl p-5 sm:p-6 overflow-hidden">
        <div className="flex items-center gap-4">
          <span className="flex h-12 w-12 sm:h-14 sm:w-14 items-center justify-center rounded-2xl bg-gradient-primary text-white shadow-soft shrink-0">
            <ShieldCheck className="h-6 w-6 sm:h-7 sm:w-7" />
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="text-xl sm:text-2xl lg:text-3xl font-extrabold tracking-tight text-ink dark:text-slate-50 transition-colors duration-300">
              User Role
            </h1>
            <p className="text-sm text-muted dark:text-slate-400 mt-0.5 transition-colors duration-300">
              Kelola daftar role pengguna sistem.
            </p>
          </div>
          <button
            type="button"
            onClick={openCreate}
            className="hidden sm:inline-flex shrink-0 items-center gap-2 rounded-xl bg-gradient-primary px-4 py-2.5 text-sm font-semibold text-white shadow-soft transition-all duration-200 hover:shadow-[0_8px_28px_-6px_rgba(34,197,94,0.45)] hover:-translate-y-0.5 active:translate-y-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900"
            aria-label="Buka modal tambah role user"
          >
            <ShieldCheck className="h-4 w-4" />
            Tambah
          </button>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="sm:hidden mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-primary px-4 py-2.5 text-sm font-semibold text-white shadow-soft transition-all duration-200 active:translate-y-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 focus-visible:ring-offset-2"
        >
          <ShieldCheck className="h-4 w-4" />
          Tambah
        </button>
      </div>

      {/* Data card */}
      <div className="glass-card rounded-3xl p-4 sm:p-6">
        {/* Toolbar: page-size + refresh (kiri) + search (kanan) */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <label className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 shrink-0">
              <span>Tampilkan</span>
              <div className="relative">
                <select
                  value={pageSize}
                  onChange={(e) => changePageSize(Number(e.target.value))}
                  aria-label="Jumlah data per halaman"
                  className="appearance-none rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 pl-3 pr-7 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 transition-colors focus:outline-none focus:ring-2 focus:ring-primary-400 cursor-pointer"
                >
                  {PAGE_SIZE_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-1.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              </div>
              <span>per halaman</span>
            </label>
            {/* Refresh */}
            <div className="group relative inline-block">
              <button
                type="button"
                onClick={() => query.refetch()}
                disabled={query.isFetching}
                aria-label="Refresh data role user"
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-primary-100 text-primary-700 ring-1 ring-primary-200/70 transition-all duration-150 hover:bg-primary-600 hover:text-white hover:ring-primary-600 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 focus-visible:ring-offset-1 disabled:opacity-60 disabled:cursor-not-allowed dark:bg-primary-500/15 dark:text-primary-300 dark:ring-primary-500/30 dark:hover:bg-primary-500 dark:hover:text-white dark:hover:ring-primary-400 dark:focus-visible:ring-offset-slate-900"
              >
                <RefreshCw className={`h-4 w-4 ${query.isFetching ? 'animate-spin' : ''}`} />
              </button>
              <span
                role="tooltip"
                className="pointer-events-none absolute left-1/2 bottom-full z-20 mb-2 -translate-x-1/2 whitespace-nowrap rounded-md bg-slate-900 px-2 py-1 text-[11px] font-medium text-white opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100 dark:bg-slate-700"
              >
                Refresh
                <span className="absolute left-1/2 top-full -translate-x-1/2 border-4 border-transparent border-t-slate-900 dark:border-t-slate-700" />
              </span>
            </div>
          </div>
          <div className="relative w-full sm:max-w-xs">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Cari nama role..."
              aria-label="Cari role user"
              className="field field-with-icon !py-2.5 text-sm"
            />
          </div>
        </div>

        {/* Loading bar */}
        <div className="mt-4">
          <LoadingBar active={query.isFetching} />
        </div>

        {/* Table */}
        <div className={`relative mt-2 overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-700/70 transition-opacity duration-200 ${query.isFetching && !query.isLoading ? 'opacity-70' : 'opacity-100'}`} aria-busy={query.isFetching}>
          {query.isFetching && !query.isLoading && (
            <div className="pointer-events-none absolute right-3 top-3 z-10 inline-flex items-center gap-1.5 rounded-full bg-white/95 dark:bg-slate-900/90 px-2.5 py-1 text-[11px] font-semibold text-primary-700 dark:text-primary-300 shadow-card backdrop-blur ring-1 ring-primary-200/60 dark:ring-primary-500/30 animate-fade-in">
              <Loader2 className="h-3 w-3 animate-spin" />
              Memuat...
            </div>
          )}
          <table className="w-full min-w-[400px] border-collapse">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-700/70">
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 w-14">
                  No
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 w-28">
                  Aksi
                </th>
                <SortHeader label="Nama Role" col="nama_role" activeCol={sortBy} dir={sortDir} onSort={toggleSort} />
              </tr>
            </thead>
            <tbody>
              {query.isLoading && (
                <tr>
                  <td colSpan={3} className="px-4 py-12">
                    <div className="flex items-center justify-center gap-2 text-slate-500 dark:text-slate-400">
                      <Loader2 className="h-5 w-5 animate-spin" />
                      <span className="text-sm">Memuat data role...</span>
                    </div>
                  </td>
                </tr>
              )}
              {!query.isLoading && query.isError && (
                <tr>
                  <td colSpan={3} className="px-4 py-12">
                    <div className="flex items-center justify-center gap-2 text-red-600 dark:text-red-400">
                      <AlertCircle className="h-5 w-5" />
                      <span className="text-sm">Gagal memuat data role. Coba muat ulang halaman.</span>
                    </div>
                  </td>
                </tr>
              )}
              {!query.isLoading && !query.isError && items.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-4 py-12">
                    <p className="text-center text-sm text-slate-500 dark:text-slate-400">
                      {search ? `Tidak ada role yang cocok dengan "${search}".` : 'Belum ada data role.'}
                    </p>
                  </td>
                </tr>
              )}
              {!query.isError &&
                items.map((row, idx) => (
                  <tr
                    key={row.id}
                    className="border-b border-slate-100 dark:border-slate-700/50 last:border-0 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/40"
                  >
                    <td className="px-4 py-3 text-sm text-slate-500 dark:text-slate-400 tabular-nums">
                      {(page - 1) * pageSize + idx + 1}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        {/* Edit */}
                        <div className="group relative inline-block">
                          <button
                            type="button"
                            onClick={() => openEdit(row)}
                            aria-label={`Edit role ${row.nama_role}`}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-amber-100 text-amber-700 ring-1 ring-amber-200/70 transition-all duration-150 hover:bg-amber-600 hover:text-white hover:ring-amber-600 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-1 dark:bg-amber-500/15 dark:text-amber-300 dark:ring-amber-500/30 dark:hover:bg-amber-500 dark:hover:text-white dark:hover:ring-amber-400 dark:focus-visible:ring-offset-slate-900"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <span
                            role="tooltip"
                            className="pointer-events-none absolute left-1/2 bottom-full z-20 mb-2 -translate-x-1/2 whitespace-nowrap rounded-md bg-slate-900 px-2 py-1 text-[11px] font-medium text-white opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100 dark:bg-slate-700"
                          >
                            Edit Role User
                            <span className="absolute left-1/2 top-full -translate-x-1/2 border-4 border-transparent border-t-slate-900 dark:border-t-slate-700" />
                          </span>
                        </div>
                        {/* Delete */}
                        <div className="group relative inline-block">
                          <button
                            type="button"
                            onClick={() => openDeleteConfirm(row)}
                            aria-label={`Hapus role ${row.nama_role}`}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-red-100 text-red-700 ring-1 ring-red-200/70 transition-all duration-150 hover:bg-red-600 hover:text-white hover:ring-red-600 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400 focus-visible:ring-offset-1 dark:bg-red-500/15 dark:text-red-300 dark:ring-red-500/30 dark:hover:bg-red-500 dark:hover:text-white dark:hover:ring-red-400 dark:focus-visible:ring-offset-slate-900"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                          <span
                            role="tooltip"
                            className="pointer-events-none absolute left-1/2 bottom-full z-20 mb-2 -translate-x-1/2 whitespace-nowrap rounded-md bg-slate-900 px-2 py-1 text-[11px] font-medium text-white opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100 dark:bg-slate-700"
                          >
                            Hapus Role User
                            <span className="absolute left-1/2 top-full -translate-x-1/2 border-4 border-transparent border-t-slate-900 dark:border-t-slate-700" />
                          </span>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-slate-700 dark:text-slate-200 font-medium">
                        {row.nama_role}
                      </span>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>

        {/* Footer: range + pagination */}
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {total > 0 ? (
              <>Menampilkan <span className="font-semibold text-slate-700 dark:text-slate-200">{rangeFrom}&ndash;{rangeTo}</span> dari <span className="font-semibold text-slate-700 dark:text-slate-200">{total}</span> entri</>
            ) : 'Tidak ada entri'}
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <Pagination page={page} totalPages={totalPages} disabled={query.isFetching} onChange={setPage} />
            <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums shrink-0">
              Hal. {page} / {totalPages}
            </span>
          </div>
        </div>
      </div>

      {/* Form modal */}
      <RoleFormModal
        open={formOpen}
        mode={formMode}
        initialData={editData}
        onClose={() => setFormOpen(false)}
        onSuccess={handleFormSuccess}
      />

      {/* Delete confirmation modal */}
      {deleteConfirm.open && (
        <DeleteConfirmModal
          role={deleteConfirm.role!}
          loading={deleteLoading}
          error={deleteError}
          onConfirm={handleDelete}
          onCancel={() => setDeleteConfirm({ open: false, role: null })}
        />
      )}

      {/* Alert hasil aksi (sukses/gagal) */}
      <ResultAlert open={resultAlert.open} variant={resultAlert.variant} message={resultAlert.message} onClose={() => setResultAlert((s) => ({ ...s, open: false }))} />
    </section>
  );
}

/** Modal konfirmasi hapus role. */
function DeleteConfirmModal({
  role,
  loading,
  error,
  onConfirm,
  onCancel,
}: {
  role: RoleRow;
  loading: boolean;
  error: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  useEffect(() => {
    if (!loading) {
      const handler = (e: KeyboardEvent) => {
        if (e.key === 'Escape') onCancel();
      };
      window.addEventListener('keydown', handler);
      return () => window.removeEventListener('keydown', handler);
    }
  }, [loading, onCancel]);

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/30 dark:bg-slate-950/60 backdrop-blur-sm animate-fade-in"
      onClick={(e) => { if (e.target === e.currentTarget && !loading) onCancel(); }}
      role="dialog"
      aria-modal="true"
      aria-label="Konfirmasi hapus role"
    >
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 dark:border-slate-700/70 bg-white dark:bg-slate-900 shadow-2xl animate-pop-in p-6">
        <div className="flex items-center gap-3 mb-4">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-100 dark:bg-red-500/15 text-red-600 dark:text-red-300 shrink-0">
            <Trash2 className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-bold text-slate-800 dark:text-slate-50">
              Hapus Role?
            </h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
              Yakin ingin menghapus role &quot;{role.nama_role}&quot;? Tindakan ini tidak dapat dibatalkan.
            </p>
          </div>
        </div>
        {error && <FieldError id="delete-error" message={error} />}
        <div className="mt-4 flex items-center justify-end gap-2">
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
            className="inline-flex items-center gap-1.5 rounded-xl bg-red-600 hover:bg-red-700 px-5 py-2 text-sm font-semibold text-white shadow-soft transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            {loading ? 'Menghapus…' : 'Hapus'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
