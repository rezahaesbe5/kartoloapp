import { useEffect, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import {
  AlertCircle,
  Calendar,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  ChevronsUpDown,
  ChevronUp,
  Eye,
  Filter as FilterIcon,
  Fingerprint,
  Loader2,
  RefreshCw,
  RotateCcw,
  Search,
  ScrollText,
  Terminal,
} from 'lucide-react';
import {
  getAuditLogList,
  type AuditSortBy,
  type AuditSortDir,
} from '../api/audit-api';
import { AuditDetailModal } from '../components/AuditDetailModal';
import { LogAccessModal } from '../components/LogAccessModal';

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;

function formatTimestamp(iso: string): string {
  try {
    return new Date(iso).toLocaleString('id-ID', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return iso;
  }
}

interface SortHeaderProps {
  label: string;
  col: AuditSortBy;
  activeCol: AuditSortBy;
  dir: AuditSortDir;
  onSort: (col: AuditSortBy) => void;
}

/** Pesan error inline di bawah input — animasi fade + ikon, dark/light aware. */
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

/** Indeterminate progress bar — bar primary geser kiri↔kanan saat fetching. */
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

/**
 * Hitung nomor halaman yang ditampilkan dengan ellipsis. Pola hasil:
 *   - totalPages <= 7         → [1,2,...,N] (semuanya)
 *   - current dekat awal      → [1,2,3,4,5,'…',N]
 *   - current dekat akhir     → [1,'…',N-4,N-3,N-2,N-1,N]
 *   - current di tengah       → [1,'…',c-1,c,c+1,'…',N]
 * Selalu sertakan halaman 1 dan N supaya user bisa lompat.
 */
function buildPageNumbers(current: number, total: number): (number | 'ellipsis')[] {
  if (total <= 1) return [1];
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }
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

/** Smart pager: «  ‹  1 2 3 … 10 11 12  ›  »  */
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
      <button
        type="button"
        onClick={() => onChange(1)}
        disabled={isFirst || disabled}
        aria-label="Halaman pertama"
        className={navBtn}
      >
        <ChevronsLeft className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        onClick={() => onChange(Math.max(1, page - 1))}
        disabled={isFirst || disabled}
        aria-label="Halaman sebelumnya"
        className={navBtn}
      >
        <ChevronLeft className="h-3.5 w-3.5" />
      </button>

      {items.map((it, idx) =>
        it === 'ellipsis' ? (
          <span
            key={`el-${idx}`}
            aria-hidden="true"
            className="inline-flex h-8 min-w-[2rem] items-center justify-center px-1 text-xs text-slate-400 dark:text-slate-500 select-none"
          >
            …
          </span>
        ) : (
          <button
            key={it}
            type="button"
            onClick={() => onChange(it)}
            disabled={disabled || it === page}
            aria-current={it === page ? 'page' : undefined}
            aria-label={`Halaman ${it}`}
            className={it === page ? pageBtnActive : pageBtnInactive}
          >
            {it}
          </button>
        ),
      )}

      <button
        type="button"
        onClick={() => onChange(Math.min(totalPages, page + 1))}
        disabled={isLast || disabled}
        aria-label="Halaman berikutnya"
        className={navBtn}
      >
        <ChevronRight className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        onClick={() => onChange(totalPages)}
        disabled={isLast || disabled}
        aria-label="Halaman terakhir"
        className={navBtn}
      >
        <ChevronsRight className="h-3.5 w-3.5" />
      </button>
    </nav>
  );
}

/** Tampilan kolom Message dengan badge label (berhasil/gagal/error) + detail. */
function MessageCell({ value }: { value: string }) {
  // Format backend: "{berhasil|gagal|error}: <detail>"
  const sep = value.indexOf(':');
  const label = sep >= 0 ? value.slice(0, sep).trim().toLowerCase() : '';
  const detail = sep >= 0 ? value.slice(sep + 1).trim() : value;
  const known = label === 'berhasil' || label === 'gagal' || label === 'error';
  const labelClass =
    label === 'berhasil'
      ? 'bg-emerald-50 text-emerald-700 ring-emerald-200/70 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-500/30'
      : label === 'gagal'
        ? 'bg-amber-50 text-amber-700 ring-amber-200/70 dark:bg-amber-500/15 dark:text-amber-300 dark:ring-amber-500/30'
        : label === 'error'
          ? 'bg-red-50 text-red-700 ring-red-200/70 dark:bg-red-500/15 dark:text-red-300 dark:ring-red-500/30'
          : 'bg-slate-100 text-slate-600 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700';
  return (
    <div className="flex items-center gap-2 min-w-0" title={value}>
      {known && (
        <span
          className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ring-1 ${labelClass}`}
        >
          {label}
        </span>
      )}
      <span className="truncate text-xs text-slate-600 dark:text-slate-300">
        {detail}
      </span>
    </div>
  );
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
          active
            ? 'text-primary-700 dark:text-primary-300'
            : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
        }`}
      >
        {label}
        <Icon className="h-3.5 w-3.5 shrink-0" />
      </button>
    </th>
  );
}

/** Halaman Audit Log produk Administration — tabel jejak aktivitas sensitif. */
export function AuditLogPage() {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(10);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<AuditSortBy>('created_at');
  const [sortDir, setSortDir] = useState<AuditSortDir>('desc');
  const [detailId, setDetailId] = useState<string | null>(null);
  const [logAccessOpen, setLogAccessOpen] = useState(false);

  // Filter card: state draft (yang user ketik) terpisah dari state applied
  // (yang ikut query). Baru disinkron saat tombol "Terapkan Filter" ditekan.
  const [dateFromDraft, setDateFromDraft] = useState('');
  const [dateToDraft, setDateToDraft] = useState('');
  const [traceIdDraft, setTraceIdDraft] = useState('');
  const [filter, setFilter] = useState<{
    date_from?: string;
    date_to?: string;
    trace_id?: string;
  }>({});
  // Per-field error baru dimunculkan setelah user pertama kali mencoba Terapkan
  // — supaya tidak nge-nag saat user baru ngetik tanggal pertama.
  const [attemptedApply, setAttemptedApply] = useState(false);

  // Debounce input search supaya tidak hit API tiap ketikan.
  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  const query = useQuery({
    queryKey: [
      'admin.audit.list',
      { page, pageSize, search, sortBy, sortDir, filter },
    ],
    queryFn: () =>
      getAuditLogList({
        page,
        page_size: pageSize,
        search: search || undefined,
        sort_by: sortBy,
        sort_dir: sortDir,
        date_from: filter.date_from,
        date_to: filter.date_to,
        trace_id: filter.trace_id,
      }),
    placeholderData: keepPreviousData,
  });

  const hasActiveFilter = Boolean(
    filter.date_from || filter.date_to || filter.trace_id,
  );

  // Validasi tanggal (live setelah pernah submit):
  //   - rangeInvalid : Mulai > Selesai
  //   - fromMissing  : Selesai diisi tapi Mulai kosong
  //   - toMissing    : Mulai diisi tapi Selesai kosong
  const rangeInvalid = Boolean(
    dateFromDraft && dateToDraft && dateFromDraft > dateToDraft,
  );
  const fromMissing = attemptedApply && !dateFromDraft && !!dateToDraft;
  const toMissing = attemptedApply && !!dateFromDraft && !dateToDraft;
  const dateFromError = fromMissing
    ? 'Tidak boleh kosong.'
    : null;
  const dateToError = toMissing
    ? 'Tidak boleh kosong.'
    : rangeInvalid
      ? 'Harus lebih besar atau sama dengan Tanggal Log Mulai.'
      : null;
  const hasAnyDateError = Boolean(dateFromError || dateToError || rangeInvalid);

  function handleApplyFilter(e: React.FormEvent) {
    e.preventDefault();
    setAttemptedApply(true);
    // Cek live setelah set attemptedApply: kalau salah satu kosong sementara
    // satunya terisi, jangan submit.
    const pairMissing =
      (!!dateFromDraft && !dateToDraft) || (!dateFromDraft && !!dateToDraft);
    if (rangeInvalid || pairMissing) return;
    setFilter({
      date_from: dateFromDraft || undefined,
      date_to: dateToDraft || undefined,
      trace_id: traceIdDraft.trim() || undefined,
    });
    setPage(1);
  }

  function handleResetFilter() {
    setDateFromDraft('');
    setDateToDraft('');
    setTraceIdDraft('');
    setAttemptedApply(false);
    setFilter({});
    setPage(1);
  }

  function toggleSort(col: AuditSortBy) {
    if (sortBy === col) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(col);
      setSortDir('desc');
    }
    setPage(1);
  }

  function changePageSize(size: number) {
    setPageSize(size);
    setPage(1);
  }

  const items = query.data?.items ?? [];
  const pagination = query.data?.pagination;
  const total = pagination?.total ?? 0;
  const totalPages = pagination?.total_pages ?? 1;
  const rangeFrom = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeTo = total === 0 ? 0 : rangeFrom + items.length - 1;

  return (
    <section className="space-y-6 animate-fade-in-up">
      {/* Header card */}
      <div className="glass-card rounded-3xl p-5 sm:p-6 overflow-hidden">
        <div className="flex items-center gap-4">
          <span className="flex h-12 w-12 sm:h-14 sm:w-14 items-center justify-center rounded-2xl bg-gradient-primary text-white shadow-soft shrink-0">
            <ScrollText className="h-6 w-6 sm:h-7 sm:w-7" />
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="text-xl sm:text-2xl lg:text-3xl font-extrabold tracking-tight text-ink dark:text-slate-50 transition-colors duration-300">
              Audit Log
            </h1>
            <p className="text-sm text-muted dark:text-slate-400 mt-0.5 transition-colors duration-300">
              Jejak aktivitas sensitif pada sistem.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setLogAccessOpen(true)}
            className="hidden sm:inline-flex shrink-0 items-center gap-2 rounded-xl bg-gradient-primary px-4 py-2.5 text-sm font-semibold text-white shadow-soft transition-all duration-200 hover:shadow-[0_8px_28px_-6px_rgba(34,197,94,0.45)] hover:-translate-y-0.5 active:translate-y-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900"
            aria-label="Buka modal akses log file"
          >
            <Terminal className="h-4 w-4" />
            Akses Log File
          </button>
        </div>
        {/* Tombol full-width di mobile (di bawah header text) */}
        <button
          type="button"
          onClick={() => setLogAccessOpen(true)}
          className="sm:hidden mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-primary px-4 py-2.5 text-sm font-semibold text-white shadow-soft transition-all duration-200 active:translate-y-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 focus-visible:ring-offset-2"
        >
          <Terminal className="h-4 w-4" />
          Akses Log File
        </button>
      </div>

      {/* Filter card */}
      <form
        onSubmit={handleApplyFilter}
        className="glass-card rounded-3xl p-4 sm:p-6"
        aria-label="Filter audit log"
      >
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 sm:h-10 sm:w-10 items-center justify-center rounded-xl bg-primary-50 dark:bg-primary-500/15 text-primary-600 dark:text-primary-300 shrink-0">
            <FilterIcon className="h-4 w-4 sm:h-5 sm:w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm sm:text-base font-bold text-slate-800 dark:text-slate-100 leading-tight">
              Filter
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Persempit data berdasarkan tanggal log dan trace ID.
            </p>
          </div>
          {hasActiveFilter && (
            <span className="inline-flex items-center gap-1 rounded-full bg-primary-50 dark:bg-primary-500/15 px-2.5 py-0.5 text-[11px] font-semibold text-primary-700 dark:text-primary-300 shrink-0">
              Aktif
            </span>
          )}
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {/* Tanggal Log Mulai */}
          <div>
            <label
              htmlFor="audit-date-from"
              className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5 inline-block"
            >
              Tanggal Log Mulai
            </label>
            <div className="relative">
              <Calendar className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                id="audit-date-from"
                type="date"
                value={dateFromDraft}
                onChange={(e) => setDateFromDraft(e.target.value)}
                max={dateToDraft || undefined}
                aria-invalid={Boolean(dateFromError) || undefined}
                aria-describedby={dateFromError ? 'audit-date-from-error' : undefined}
                className={`field field-with-icon !py-2.5 text-sm pr-3 [color-scheme:light] dark:[color-scheme:dark] ${
                  dateFromError
                    ? '!border-red-400 dark:!border-red-500/70 focus:!border-red-500 focus:!shadow-[0_0_0_4px_rgba(239,68,68,0.12)]'
                    : ''
                }`}
              />
            </div>
            <FieldError id="audit-date-from-error" message={dateFromError} />
          </div>

          {/* Tanggal Log Selesai */}
          <div>
            <label
              htmlFor="audit-date-to"
              className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5 inline-block"
            >
              Tanggal Log Selesai
            </label>
            <div className="relative">
              <Calendar className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                id="audit-date-to"
                type="date"
                value={dateToDraft}
                onChange={(e) => setDateToDraft(e.target.value)}
                min={dateFromDraft || undefined}
                aria-invalid={Boolean(dateToError) || undefined}
                aria-describedby={dateToError ? 'audit-date-to-error' : undefined}
                className={`field field-with-icon !py-2.5 text-sm pr-3 [color-scheme:light] dark:[color-scheme:dark] ${
                  dateToError
                    ? '!border-red-400 dark:!border-red-500/70 focus:!border-red-500 focus:!shadow-[0_0_0_4px_rgba(239,68,68,0.12)]'
                    : ''
                }`}
              />
            </div>
            <FieldError id="audit-date-to-error" message={dateToError} />
          </div>

          {/* Trace ID */}
          <div className="sm:col-span-2 lg:col-span-1">
            <label
              htmlFor="audit-trace-id"
              className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5 inline-block"
            >
              Trace ID
            </label>
            <div className="relative">
              <Fingerprint className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                id="audit-trace-id"
                type="text"
                value={traceIdDraft}
                onChange={(e) => setTraceIdDraft(e.target.value)}
                placeholder="mis. req_abc123..."
                maxLength={200}
                className="field field-with-icon !py-2.5 text-sm font-mono pr-3"
              />
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="mt-4 flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2">
          <button
            type="button"
            onClick={handleResetFilter}
            disabled={
              !hasActiveFilter &&
              !dateFromDraft &&
              !dateToDraft &&
              !traceIdDraft &&
              !attemptedApply
            }
            className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-700 px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Reset
          </button>
          <button
            type="submit"
            disabled={hasAnyDateError}
            className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-gradient-primary text-white font-semibold px-5 py-2 text-sm shadow-soft transition-all duration-200 hover:shadow-[0_8px_28px_-6px_rgba(34,197,94,0.45)] hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-soft"
          >
            <FilterIcon className="h-3.5 w-3.5" />
            Terapkan Filter
          </button>
        </div>
      </form>

      {/* Data card */}
      <div className="glass-card rounded-3xl p-4 sm:p-6">
        {/* Toolbar di atas tabel: page-size + refresh (kiri) + search (kanan) */}
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
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-1.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              </div>
              <span>per halaman</span>
            </label>
            {/* Refresh data list */}
            <div className="group relative inline-block">
              <button
                type="button"
                onClick={() => query.refetch()}
                disabled={query.isFetching}
                aria-label="Refresh data audit log"
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-primary-100 text-primary-700 ring-1 ring-primary-200/70 transition-all duration-150 hover:bg-primary-600 hover:text-white hover:ring-primary-600 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 focus-visible:ring-offset-1 disabled:opacity-60 disabled:cursor-not-allowed dark:bg-primary-500/15 dark:text-primary-300 dark:ring-primary-500/30 dark:hover:bg-primary-500 dark:hover:text-white dark:hover:ring-primary-400 dark:focus-visible:ring-offset-slate-900"
              >
                <RefreshCw
                  className={`h-4 w-4 ${query.isFetching ? 'animate-spin' : ''}`}
                />
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
              placeholder="Cari trace ID, action, endpoint, message, IP, atau user..."
              aria-label="Cari audit log"
              className="field field-with-icon !py-2.5 text-sm"
            />
          </div>
        </div>

        {/* Loading bar — penanda saat sedang fetch data (initial / refetch / filter / paging / sort) */}
        <div className="mt-4">
          <LoadingBar active={query.isFetching} />
        </div>

        {/* Table */}
        <div
          className={`relative mt-2 overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-700/70 transition-opacity duration-200 ${
            query.isFetching && !query.isLoading ? 'opacity-70' : 'opacity-100'
          }`}
          aria-busy={query.isFetching}
        >
          {/* Badge floating "Memuat..." saat refetch — supaya user yakin proses jalan */}
          {query.isFetching && !query.isLoading && (
            <div className="pointer-events-none absolute right-3 top-3 z-10 inline-flex items-center gap-1.5 rounded-full bg-white/95 dark:bg-slate-900/90 px-2.5 py-1 text-[11px] font-semibold text-primary-700 dark:text-primary-300 shadow-card backdrop-blur ring-1 ring-primary-200/60 dark:ring-primary-500/30 animate-fade-in">
              <Loader2 className="h-3 w-3 animate-spin" />
              Memuat...
            </div>
          )}
          <table className="w-full min-w-[960px] border-collapse">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-700/70">
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 w-14">
                  No
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 w-20">
                  Aksi
                </th>
                <SortHeader label="Timestamp" col="created_at" activeCol={sortBy} dir={sortDir} onSort={toggleSort} />
                <SortHeader label="Trace ID" col="trace_id" activeCol={sortBy} dir={sortDir} onSort={toggleSort} />
                <SortHeader label="Action" col="action" activeCol={sortBy} dir={sortDir} onSort={toggleSort} />
                <SortHeader label="Endpoint" col="endpoint" activeCol={sortBy} dir={sortDir} onSort={toggleSort} />
                <SortHeader label="Message" col="message" activeCol={sortBy} dir={sortDir} onSort={toggleSort} />
                <SortHeader label="IP Address" col="ip" activeCol={sortBy} dir={sortDir} onSort={toggleSort} />
              </tr>
            </thead>
            <tbody>
              {query.isLoading && (
                <tr>
                  <td colSpan={8} className="px-4 py-12">
                    <div className="flex items-center justify-center gap-2 text-slate-500 dark:text-slate-400">
                      <Loader2 className="h-5 w-5 animate-spin" />
                      <span className="text-sm">Memuat audit log...</span>
                    </div>
                  </td>
                </tr>
              )}

              {!query.isLoading && query.isError && (
                <tr>
                  <td colSpan={8} className="px-4 py-12">
                    <div className="flex items-center justify-center gap-2 text-red-600 dark:text-red-400">
                      <AlertCircle className="h-5 w-5" />
                      <span className="text-sm">
                        Gagal memuat audit log. Coba muat ulang halaman.
                      </span>
                    </div>
                  </td>
                </tr>
              )}

              {!query.isLoading && !query.isError && items.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-12">
                    <p className="text-center text-sm text-slate-500 dark:text-slate-400">
                      {search
                        ? `Tidak ada audit log yang cocok dengan "${search}".`
                        : hasActiveFilter
                          ? 'Tidak ada audit log yang cocok dengan filter saat ini.'
                          : 'Belum ada data audit log.'}
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
                      <div className="group relative inline-block">
                        <button
                          type="button"
                          onClick={() => setDetailId(row.id)}
                          aria-label={`Lihat detail audit ${row.trace_id ?? row.id}`}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-primary-100 text-primary-700 ring-1 ring-primary-200/70 transition-all duration-150 hover:bg-primary-600 hover:text-white hover:ring-primary-600 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 focus-visible:ring-offset-1 dark:bg-primary-500/15 dark:text-primary-300 dark:ring-primary-500/30 dark:hover:bg-primary-500 dark:hover:text-white dark:hover:ring-primary-400 dark:focus-visible:ring-offset-slate-900"
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                        {/* Tooltip — muncul saat hover/focus tombol */}
                        <span
                          role="tooltip"
                          className="pointer-events-none absolute left-1/2 bottom-full z-20 mb-2 -translate-x-1/2 whitespace-nowrap rounded-md bg-slate-900 px-2 py-1 text-[11px] font-medium text-white opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100 dark:bg-slate-700"
                        >
                          Detail
                          <span className="absolute left-1/2 top-full -translate-x-1/2 border-4 border-transparent border-t-slate-900 dark:border-t-slate-700" />
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-700 dark:text-slate-200 whitespace-nowrap">
                      {formatTimestamp(row.created_at)}
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-mono text-xs text-slate-600 dark:text-slate-300">
                        {row.trace_id ?? '-'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-block rounded-full bg-primary-50 dark:bg-primary-500/15 px-2.5 py-0.5 text-xs font-medium text-primary-700 dark:text-primary-300">
                        {row.action}
                      </span>
                    </td>
                    <td className="px-4 py-3 max-w-[260px]">
                      <span
                        className="block font-mono text-xs text-slate-600 dark:text-slate-300 truncate"
                        title={row.endpoint ?? undefined}
                      >
                        {row.endpoint ?? '-'}
                      </span>
                    </td>
                    <td className="px-4 py-3 max-w-[280px]">
                      {row.message ? (
                        <MessageCell value={row.message} />
                      ) : (
                        <span className="text-xs text-slate-400 dark:text-slate-500">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-mono text-xs text-slate-600 dark:text-slate-300">
                        {row.ip ?? '-'}
                      </span>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>

        {/* Footer: range + pagination (page-size selector dipindah ke toolbar atas) */}
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {total > 0 ? (
              <>
                Menampilkan{' '}
                <span className="font-semibold text-slate-700 dark:text-slate-200">
                  {rangeFrom}&ndash;{rangeTo}
                </span>{' '}
                dari{' '}
                <span className="font-semibold text-slate-700 dark:text-slate-200">{total}</span>{' '}
                entri
              </>
            ) : (
              'Tidak ada entri'
            )}
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <Pagination
              page={page}
              totalPages={totalPages}
              disabled={query.isFetching}
              onChange={setPage}
            />
            <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums shrink-0">
              Hal. {page} / {totalPages}
            </span>
          </div>
        </div>
      </div>

      {/* Modal detail */}
      <AuditDetailModal
        open={detailId !== null}
        auditId={detailId}
        onClose={() => setDetailId(null)}
      />

      {/* Modal akses log file */}
      <LogAccessModal open={logAccessOpen} onClose={() => setLogAccessOpen(false)} />
    </section>
  );
}
