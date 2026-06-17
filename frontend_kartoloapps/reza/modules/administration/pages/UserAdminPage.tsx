import { createPortal } from 'react-dom';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
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
  Eye,
  KeyRound,
  Loader2,
  LockOpen,
  LogOut,
  MoreVertical,
  Pencil,
  RefreshCw,
  Search,
  ShieldCheck,
  ShieldOff,
  Trash2,
  UserCog,
  UserPlus,
  Users,
  type LucideIcon,
} from 'lucide-react';
import {
  getUsers,
  deleteUser,
  resetUserPassword,
  updateUserStatus,
  resetUserBlock,
  logoutAllDevices,
  disableUserMfa,
  type UserRow,
  type UserListParams,
  type UserStatus,
} from '../api/user-api';
import { UserFormModal } from '../components/UserFormModal';
import { UserDetailModal } from '../components/UserDetailModal';
import { MappingRoleModal } from '../components/MappingRoleModal';
import { UserPasswordAlert } from '../components/UserPasswordAlert';
import { ActionConfirmModal, type ConfirmTone } from '../components/ActionConfirmModal';
import { UpdateStatusModal } from '../components/UpdateStatusModal';
import { ResultAlert, type ResultVariant } from '../components/ResultAlert';
import { apiErrorMessage } from '../lib/api-error';

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;

/* ---- helpers ---- */

function statusLabel(status: string): string {
  switch (status) {
    case 'active': return 'Active';
    case 'inactive': return 'Inactive';
    case 'force_change_password': return 'Force Change Password';
    case 'blocked': return 'Blocked';
    default: return status;
  }
}

function statusClass(status: string): string {
  switch (status) {
    case 'active': return 'bg-emerald-50 text-emerald-700 ring-emerald-200/70 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-500/30';
    case 'inactive': return 'bg-slate-100 text-slate-600 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700';
    case 'force_change_password': return 'bg-amber-50 text-amber-700 ring-amber-200/70 dark:bg-amber-500/15 dark:text-amber-300 dark:ring-amber-500/30';
    case 'blocked': return 'bg-red-50 text-red-700 ring-red-200/70 dark:bg-red-500/15 dark:text-red-300 dark:ring-red-500/30';
    default: return 'bg-slate-100 text-slate-600 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700';
  }
}

function FieldError({ id, message }: { id: string; message: string | null }) {
  if (!message) return null;
  return (
    <p id={id} role="alert" className="mt-1.5 flex items-center gap-1.5 text-xs font-medium text-red-600 dark:text-red-400 animate-fade-in">
      <AlertCircle className="h-3.5 w-3.5 shrink-0" />
      <span>{message}</span>
    </p>
  );
}

function LoadingBar({ active }: { active: boolean }) {
  return (
    <div aria-hidden={!active} className={`relative h-0.5 overflow-hidden rounded-full bg-primary-100/60 dark:bg-primary-500/15 transition-opacity duration-200 ${active ? 'opacity-100' : 'opacity-0'}`}>
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
  const baseBtn = 'inline-flex h-8 min-w-[2rem] items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 px-2 text-xs font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 disabled:opacity-40 disabled:cursor-not-allowed';
  const navBtn = `${baseBtn} text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800`;
  const pageBtnInactive = `${baseBtn} text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800`;
  const pageBtnActive = 'inline-flex h-8 min-w-[2rem] items-center justify-center rounded-lg border border-primary-500 bg-gradient-primary px-2 text-xs font-bold text-white shadow-soft cursor-default';

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
          <span key={`el-${idx}`} aria-hidden className="inline-flex h-8 min-w-[2rem] items-center justify-center px-1 text-xs text-slate-400 dark:text-slate-500 select-none">…</span>
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

/* ---- SortHeader ---- */

interface SortHeaderProps {
  label: string;
  col: UserListParams['sort_by'];
  activeCol: UserListParams['sort_by'];
  dir: 'asc' | 'desc';
  onSort: (col: UserListParams['sort_by']) => void;
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
        className={`group inline-flex items-center gap-1.5 transition-colors ${active ? 'text-primary-700 dark:text-primary-300' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}
      >
        {label}
        <Icon className="h-3.5 w-3.5 shrink-0" />
      </button>
    </th>
  );
}

/* ---- DeleteConfirmModal ---- */

function DeleteConfirmModal({
  user,
  loading,
  error,
  onConfirm,
  onCancel,
}: {
  user: UserRow;
  loading: boolean;
  error: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  useEffect(() => {
    if (!loading) {
      const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
      window.addEventListener('keydown', handler);
      return () => window.removeEventListener('keydown', handler);
    }
  }, [loading, onCancel]);

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/30 dark:bg-slate-950/60 backdrop-blur-sm animate-fade-in" onClick={(e) => { if (e.target === e.currentTarget && !loading) onCancel(); }} role="dialog" aria-modal="true" aria-label="Konfirmasi hapus user">
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 dark:border-slate-700/70 bg-white dark:bg-slate-900 shadow-2xl animate-pop-in p-6">
        <div className="flex items-center gap-3 mb-4">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-100 dark:bg-red-500/15 text-red-600 dark:text-red-300 shrink-0">
            <Trash2 className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-bold text-slate-800 dark:text-slate-50">Hapus User?</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">Yakin ingin menghapus user &quot;{user.username ?? user.email}&quot;? Tindakan ini tidak dapat dibatalkan.</p>
          </div>
        </div>
        {error && <FieldError id="delete-user-error" message={error} />}
        <div className="mt-4 flex items-center justify-end gap-2">
          <button type="button" onClick={onCancel} disabled={loading} className="rounded-xl border border-slate-200 dark:border-slate-700 px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed">Batal</button>
          <button type="button" onClick={onConfirm} disabled={loading} className="inline-flex items-center gap-1.5 rounded-xl bg-red-600 hover:bg-red-700 px-5 py-2 text-sm font-semibold text-white shadow-soft transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed">
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            {loading ? 'Menghapus…' : 'Hapus'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/* ---- Row actions (responsif: 7 ikon di desktop, kebab di tablet/ponsel) ---- */

type ActionColor = 'primary' | 'amber' | 'indigo' | 'sky' | 'teal' | 'violet' | 'fuchsia' | 'rose' | 'red';

// Tailwind butuh class string literal (tidak bisa di-construct dinamis), jadi
// pola tombol ikon ditulis penuh per warna.
const ICON_BTN_CLASS: Record<ActionColor, string> = {
  primary:
    'inline-flex h-8 w-8 items-center justify-center rounded-lg bg-primary-100 text-primary-700 ring-1 ring-primary-200/70 transition-all duration-150 hover:bg-primary-600 hover:text-white hover:ring-primary-600 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 focus-visible:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-primary-500/15 dark:text-primary-300 dark:ring-primary-500/30 dark:hover:bg-primary-500 dark:hover:text-white dark:hover:ring-primary-400 dark:focus-visible:ring-offset-slate-900',
  amber:
    'inline-flex h-8 w-8 items-center justify-center rounded-lg bg-amber-100 text-amber-700 ring-1 ring-amber-200/70 transition-all duration-150 hover:bg-amber-600 hover:text-white hover:ring-amber-600 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-amber-500/15 dark:text-amber-300 dark:ring-amber-500/30 dark:hover:bg-amber-500 dark:hover:text-white dark:hover:ring-amber-400 dark:focus-visible:ring-offset-slate-900',
  indigo:
    'inline-flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-100 text-indigo-700 ring-1 ring-indigo-200/70 transition-all duration-150 hover:bg-indigo-600 hover:text-white hover:ring-indigo-600 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-indigo-500/15 dark:text-indigo-300 dark:ring-indigo-500/30 dark:hover:bg-indigo-500 dark:hover:text-white dark:hover:ring-indigo-400 dark:focus-visible:ring-offset-slate-900',
  sky:
    'inline-flex h-8 w-8 items-center justify-center rounded-lg bg-sky-100 text-sky-700 ring-1 ring-sky-200/70 transition-all duration-150 hover:bg-sky-600 hover:text-white hover:ring-sky-600 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 focus-visible:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-sky-500/15 dark:text-sky-300 dark:ring-sky-500/30 dark:hover:bg-sky-500 dark:hover:text-white dark:hover:ring-sky-400 dark:focus-visible:ring-offset-slate-900',
  teal:
    'inline-flex h-8 w-8 items-center justify-center rounded-lg bg-teal-100 text-teal-700 ring-1 ring-teal-200/70 transition-all duration-150 hover:bg-teal-600 hover:text-white hover:ring-teal-600 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400 focus-visible:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-teal-500/15 dark:text-teal-300 dark:ring-teal-500/30 dark:hover:bg-teal-500 dark:hover:text-white dark:hover:ring-teal-400 dark:focus-visible:ring-offset-slate-900',
  violet:
    'inline-flex h-8 w-8 items-center justify-center rounded-lg bg-violet-100 text-violet-700 ring-1 ring-violet-200/70 transition-all duration-150 hover:bg-violet-600 hover:text-white hover:ring-violet-600 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 focus-visible:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-violet-500/15 dark:text-violet-300 dark:ring-violet-500/30 dark:hover:bg-violet-500 dark:hover:text-white dark:hover:ring-violet-400 dark:focus-visible:ring-offset-slate-900',
  fuchsia:
    'inline-flex h-8 w-8 items-center justify-center rounded-lg bg-fuchsia-100 text-fuchsia-700 ring-1 ring-fuchsia-200/70 transition-all duration-150 hover:bg-fuchsia-600 hover:text-white hover:ring-fuchsia-600 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-fuchsia-400 focus-visible:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-fuchsia-500/15 dark:text-fuchsia-300 dark:ring-fuchsia-500/30 dark:hover:bg-fuchsia-500 dark:hover:text-white dark:hover:ring-fuchsia-400 dark:focus-visible:ring-offset-slate-900',
  rose:
    'inline-flex h-8 w-8 items-center justify-center rounded-lg bg-rose-100 text-rose-700 ring-1 ring-rose-200/70 transition-all duration-150 hover:bg-rose-600 hover:text-white hover:ring-rose-600 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400 focus-visible:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-rose-500/15 dark:text-rose-300 dark:ring-rose-500/30 dark:hover:bg-rose-500 dark:hover:text-white dark:hover:ring-rose-400 dark:focus-visible:ring-offset-slate-900',
  red:
    'inline-flex h-8 w-8 items-center justify-center rounded-lg bg-red-100 text-red-700 ring-1 ring-red-200/70 transition-all duration-150 hover:bg-red-600 hover:text-white hover:ring-red-600 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400 focus-visible:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-red-500/15 dark:text-red-300 dark:ring-red-500/30 dark:hover:bg-red-500 dark:hover:text-white dark:hover:ring-red-400 dark:focus-visible:ring-offset-slate-900',
};

// Warna teks item dropdown (mobile/tablet).
const ITEM_TEXT_CLASS: Record<ActionColor, string> = {
  primary: 'text-primary-700 dark:text-primary-300',
  amber: 'text-amber-700 dark:text-amber-300',
  indigo: 'text-indigo-700 dark:text-indigo-300',
  sky: 'text-sky-700 dark:text-sky-300',
  teal: 'text-teal-700 dark:text-teal-300',
  violet: 'text-violet-700 dark:text-violet-300',
  fuchsia: 'text-fuchsia-700 dark:text-fuchsia-300',
  rose: 'text-rose-700 dark:text-rose-300',
  red: 'text-red-700 dark:text-red-300',
};

interface RowAction {
  key: string;
  label: string;
  icon: LucideIcon;
  color: ActionColor;
  onClick: () => void;
  disabled?: boolean;
  busy?: boolean;
}

function IconTooltipButton({ action }: { action: RowAction }) {
  const Icon = action.busy ? Loader2 : action.icon;
  return (
    <div className="group relative inline-block">
      <button
        type="button"
        onClick={action.onClick}
        disabled={action.disabled || action.busy}
        aria-label={action.label}
        className={ICON_BTN_CLASS[action.color]}
      >
        <Icon className={`h-3.5 w-3.5 ${action.busy ? 'animate-spin' : ''}`} />
      </button>
      <span role="tooltip" className="pointer-events-none absolute left-1/2 bottom-full z-20 mb-2 -translate-x-1/2 whitespace-nowrap rounded-md bg-slate-900 px-2 py-1 text-[11px] font-medium text-white opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100 dark:bg-slate-700">
        {action.label}
        <span className="absolute left-1/2 top-full -translate-x-1/2 border-4 border-transparent border-t-slate-900 dark:border-t-slate-700" />
      </span>
    </div>
  );
}

/** Dropdown kebab untuk tablet/ponsel — diportal supaya tidak terpotong overflow tabel. */
function KebabMenu({ actions }: { actions: RowAction[] }) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });

  useLayoutEffect(() => {
    if (!open || !btnRef.current) return;
    const r = btnRef.current.getBoundingClientRect();
    const MENU_W = 224; // w-56
    // Posisikan di bawah tombol, rata kanan; jaga agar tidak keluar viewport kiri.
    const left = Math.max(8, r.right - MENU_W);
    setPos({ top: r.bottom + 6, left });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    // Scroll/resize → tutup (posisi fixed jadi basi).
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Menu aksi"
        className={`inline-flex h-8 w-8 items-center justify-center rounded-lg ring-1 transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 ${
          open
            ? 'bg-primary-600 text-white ring-primary-600'
            : 'bg-slate-100 text-slate-600 ring-slate-200 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700 dark:hover:bg-slate-700'
        }`}
      >
        <MoreVertical className="h-4 w-4" />
      </button>
      {open &&
        createPortal(
          <>
            {/* Overlay penangkap klik-luar */}
            <div className="fixed inset-0 z-[55]" onClick={() => setOpen(false)} aria-hidden />
            <div
              role="menu"
              style={{ position: 'fixed', top: pos.top, left: pos.left, width: 224 }}
              className="z-[56] origin-top-right rounded-2xl border border-slate-200 dark:border-slate-700/70 bg-white dark:bg-slate-900 p-1.5 shadow-2xl animate-pop-in"
            >
              {actions.map((action) => {
                const Icon = action.busy ? Loader2 : action.icon;
                return (
                  <button
                    key={action.key}
                    type="button"
                    role="menuitem"
                    disabled={action.disabled || action.busy}
                    onClick={() => { setOpen(false); action.onClick(); }}
                    className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    <Icon className={`h-4 w-4 shrink-0 ${ITEM_TEXT_CLASS[action.color]} ${action.busy ? 'animate-spin' : ''}`} />
                    <span>{action.label}</span>
                  </button>
                );
              })}
            </div>
          </>,
          document.body,
        )}
    </>
  );
}

function RowActions({ actions }: { actions: RowAction[] }) {
  return (
    <>
      {/* Desktop (>tablet): 7 ikon sejajar */}
      <div className="hidden lg:flex items-center gap-1">
        {actions.map((a) => (
          <IconTooltipButton key={a.key} action={a} />
        ))}
      </div>
      {/* Tablet/ponsel (≤tablet): menu 3 titik */}
      <div className="lg:hidden">
        <KebabMenu actions={actions} />
      </div>
    </>
  );
}

/* ---- Halaman utama ---- */

/** Halaman User Admin produk Administration. */
export function UserAdminPage() {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(10);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<UserListParams['sort_by']>('username');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  // Modal state
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<'create' | 'edit'>('create');
  const [editData, setEditData] = useState<UserRow | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);

  // Mapping Role User modal
  const [mappingUser, setMappingUser] = useState<UserRow | null>(null);

  // Delete state
  const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; user: UserRow | null }>({ open: false, user: null });
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Password alert after create / reset
  const [passwordAlert, setPasswordAlert] = useState<{ open: boolean; password: string; username: string }>({ open: false, password: '', username: '' });

  // ---- Aksi tambahan: reset password / update status / reset block / logout all ----
  type ConfirmKind = 'reset-password' | 'reset-block' | 'logout-all' | 'disable-mfa';
  const [confirm, setConfirm] = useState<{ open: boolean; kind: ConfirmKind | null; user: UserRow | null }>({ open: false, kind: null, user: null });
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);

  // Update Status modal (pilih status) + konfirmasi terpisah
  const [statusModal, setStatusModal] = useState<{ open: boolean; user: UserRow | null }>({ open: false, user: null });
  const [statusConfirm, setStatusConfirm] = useState<{ open: boolean; user: UserRow | null; status: UserStatus | null }>({ open: false, user: null, status: null });
  const [statusLoading, setStatusLoading] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);

  // Tandai baris yang sedang diproses (untuk spinner kontekstual pada aksi async).
  const [busyAction, setBusyAction] = useState<{ id: string; kind: ConfirmKind | 'update-status' } | null>(null);

  // Alert hasil aksi (sukses/gagal) — menampilkan message dari backend.
  const [resultAlert, setResultAlert] = useState<{ open: boolean; variant: ResultVariant; message: string }>({ open: false, variant: 'success', message: '' });
  function showResult(variant: ResultVariant, message: string) {
    setResultAlert({ open: true, variant, message });
  }

  function openConfirm(kind: ConfirmKind, user: UserRow) {
    setConfirm({ open: true, kind, user });
    setConfirmError(null);
  }
  function closeConfirm() {
    if (confirmLoading) return;
    setConfirm({ open: false, kind: null, user: null });
    setConfirmError(null);
  }

  async function handleConfirmAction() {
    if (!confirm.user || !confirm.kind) return;
    const { kind, user } = confirm;
    setConfirmLoading(true);
    setConfirmError(null);
    setBusyAction({ id: user.id, kind });
    try {
      if (kind === 'reset-password') {
        const { password } = await resetUserPassword(user.id);
        setConfirm({ open: false, kind: null, user: null });
        // Reset password: tampilkan password baru (copyable) — perannya = pesan sukses.
        setTimeout(() => {
          setPasswordAlert({ open: true, password, username: user.username ?? user.email });
        }, 200);
        query.refetch();
      } else if (kind === 'reset-block') {
        const { message } = await resetUserBlock(user.id);
        setConfirm({ open: false, kind: null, user: null });
        showResult('success', message);
        query.refetch();
      } else if (kind === 'disable-mfa') {
        const { message } = await disableUserMfa(user.id);
        setConfirm({ open: false, kind: null, user: null });
        showResult('success', message);
        query.refetch();
      } else {
        const { message } = await logoutAllDevices(user.id);
        setConfirm({ open: false, kind: null, user: null });
        showResult('success', message);
        query.refetch();
      }
    } catch (err) {
      setConfirm({ open: false, kind: null, user: null });
      showResult('error', apiErrorMessage(err, 'Aksi gagal. Coba lagi.'));
    } finally {
      setConfirmLoading(false);
      setBusyAction(null);
    }
  }

  function handleStatusSubmit(status: UserStatus) {
    if (!statusModal.user) return;
    setStatusConfirm({ open: true, user: statusModal.user, status });
    setStatusModal({ open: false, user: null });
    setStatusError(null);
  }

  async function handleStatusConfirm() {
    if (!statusConfirm.user || !statusConfirm.status) return;
    const { user, status } = statusConfirm;
    setStatusLoading(true);
    setStatusError(null);
    setBusyAction({ id: user.id, kind: 'update-status' });
    try {
      const { message } = await updateUserStatus(user.id, status);
      setStatusConfirm({ open: false, user: null, status: null });
      showResult('success', message);
      query.refetch();
    } catch (err) {
      setStatusConfirm({ open: false, user: null, status: null });
      showResult('error', apiErrorMessage(err, 'Gagal memperbarui status. Coba lagi.'));
    } finally {
      setStatusLoading(false);
      setBusyAction(null);
    }
  }

  function buildRowActions(row: UserRow): RowAction[] {
    const actions: RowAction[] = [
      { key: 'detail', label: 'Detail', icon: Eye, color: 'primary', onClick: () => setDetailId(row.id) },
      { key: 'edit', label: 'Edit', icon: Pencil, color: 'amber', onClick: () => openEdit(row) },
      { key: 'reset-password', label: 'Reset Password', icon: KeyRound, color: 'indigo', onClick: () => openConfirm('reset-password', row), busy: busyAction?.id === row.id && busyAction.kind === 'reset-password' },
      { key: 'update-status', label: 'Update Status', icon: ShieldCheck, color: 'sky', onClick: () => { setStatusModal({ open: true, user: row }); }, busy: busyAction?.id === row.id && busyAction.kind === 'update-status' },
      { key: 'mapping-role', label: 'Mapping Role User', icon: UserCog, color: 'fuchsia', onClick: () => setMappingUser(row) },
      { key: 'reset-block', label: 'Reset Block Sementara', icon: LockOpen, color: 'teal', onClick: () => openConfirm('reset-block', row), busy: busyAction?.id === row.id && busyAction.kind === 'reset-block' },
      // Disable MFA hanya muncul kalau user memang punya MFA aktif.
      ...(row.two_factor_enabled
        ? [{ key: 'disable-mfa', label: 'Disable MFA', icon: ShieldOff, color: 'violet' as const, onClick: () => openConfirm('disable-mfa', row), busy: busyAction?.id === row.id && busyAction.kind === 'disable-mfa' }]
        : []),
      { key: 'logout-all', label: 'Logout Semua Device', icon: LogOut, color: 'rose', onClick: () => openConfirm('logout-all', row), busy: busyAction?.id === row.id && busyAction.kind === 'logout-all' },
      { key: 'delete', label: 'Hapus', icon: Trash2, color: 'red', onClick: () => openDeleteConfirm(row) },
    ];
    return actions;
  }

  const CONFIRM_META: Record<ConfirmKind, { tone: ConfirmTone; icon: LucideIcon; title: string; confirmLabel: string; loadingLabel: string; message: (u: UserRow) => string }> = {
    'reset-password': {
      tone: 'indigo', icon: KeyRound, title: 'Reset Password?', confirmLabel: 'Reset Password', loadingLabel: 'Mereset…',
      message: (u) => `Reset password user "${u.username ?? u.email}"? Password sementara baru akan dibuat dan user wajib menggantinya saat login.`,
    },
    'reset-block': {
      tone: 'amber', icon: LockOpen, title: 'Reset Block Sementara?', confirmLabel: 'Reset Block', loadingLabel: 'Mereset…',
      message: (u) => `Lepas blokir sementara untuk user "${u.username ?? u.email}"? Hitungan gagal login & kunci waktu akan direset.`,
    },
    'logout-all': {
      tone: 'rose', icon: LogOut, title: 'Logout Semua Device?', confirmLabel: 'Logout Semua', loadingLabel: 'Memproses…',
      message: (u) => `Cabut semua sesi aktif user "${u.username ?? u.email}"? User akan ter-logout dari semua perangkat.`,
    },
    'disable-mfa': {
      tone: 'violet', icon: ShieldOff, title: 'Disable MFA?', confirmLabel: 'Disable MFA', loadingLabel: 'Menonaktifkan…',
      message: (u) => `Nonaktifkan MFA untuk user "${u.username ?? u.email}"? Secret autentikator & semua recovery code akan dihapus. User bisa login tanpa kode hingga mengaktifkan MFA lagi.`,
    },
  };

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => { setSearch(searchInput.trim()); setPage(1); }, 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  const query = useQuery({
    queryKey: ['admin.user.list', { page, pageSize, search, sortBy, sortDir }],
    queryFn: () => getUsers({ page, page_size: pageSize, search: search || undefined, sort_by: sortBy, sort_dir: sortDir }),
    placeholderData: keepPreviousData,
  });

  const items = query.data?.items ?? [];
  const pagination = query.data?.pagination;
  const total = pagination?.total ?? 0;
  const totalPages = pagination?.total_pages ?? 1;
  const rangeFrom = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeTo = total === 0 ? 0 : rangeFrom + items.length - 1;

  function changePageSize(size: number) { setPageSize(size); setPage(1); }

  function toggleSort(col: UserListParams['sort_by']) {
    if (sortBy === col) { setSortDir((d) => (d === 'asc' ? 'desc' : 'asc')); }
    else { setSortBy(col); setSortDir('asc'); }
    setPage(1);
  }

  function openCreate() { setFormMode('create'); setEditData(null); setFormOpen(true); }
  function openEdit(row: UserRow) { setFormMode('edit'); setEditData(row); setFormOpen(true); }
  function handleFormSuccess(result: { plainPassword?: string; message: string; username: string }) {
    query.refetch();
    if (result.plainPassword) {
      // Create: tampilkan password awal (copyable) — perannya = pesan sukses.
      setTimeout(() => {
        setPasswordAlert({ open: true, password: result.plainPassword!, username: result.username });
      }, 300);
    } else {
      // Edit: tampilkan alert sukses dengan message backend.
      showResult('success', result.message);
    }
  }

  function openDeleteConfirm(row: UserRow) { setDeleteConfirm({ open: true, user: row }); setDeleteError(null); }

  async function handleDelete() {
    if (!deleteConfirm.user) return;
    setDeleteLoading(true); setDeleteError(null);
    try {
      const { message } = await deleteUser(deleteConfirm.user.id);
      setDeleteConfirm({ open: false, user: null });
      showResult('success', message);
      query.refetch();
    } catch (err: unknown) {
      setDeleteConfirm({ open: false, user: null });
      showResult('error', apiErrorMessage(err, 'Gagal menghapus user. Coba lagi.'));
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
            <Users className="h-6 w-6 sm:h-7 sm:w-7" />
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="text-xl sm:text-2xl lg:text-3xl font-extrabold tracking-tight text-ink dark:text-slate-50 transition-colors duration-300">User Admin</h1>
            <p className="text-sm text-muted dark:text-slate-400 mt-0.5 transition-colors duration-300">Kelola daftar user administrator sistem.</p>
          </div>
          <button type="button" onClick={openCreate} className="hidden sm:inline-flex shrink-0 items-center gap-2 rounded-xl bg-gradient-primary px-4 py-2.5 text-sm font-semibold text-white shadow-soft transition-all duration-200 hover:shadow-[0_8px_28px_-6px_rgba(34,197,94,0.45)] hover:-translate-y-0.5 active:translate-y-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900" aria-label="Buka modal tambah user admin">
            <UserPlus className="h-4 w-4" /> Tambah
          </button>
        </div>
        <button type="button" onClick={openCreate} className="sm:hidden mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-primary px-4 py-2.5 text-sm font-semibold text-white shadow-soft transition-all duration-200 active:translate-y-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 focus-visible:ring-offset-2">
          <UserPlus className="h-4 w-4" /> Tambah
        </button>
      </div>

      {/* Data card */}
      <div className="glass-card rounded-3xl p-4 sm:p-6">
        {/* Toolbar */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <label className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 shrink-0">
              <span>Tampilkan</span>
              <div className="relative">
                <select value={pageSize} onChange={(e) => changePageSize(Number(e.target.value))} aria-label="Jumlah data per halaman" className="appearance-none rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 pl-3 pr-7 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 transition-colors focus:outline-none focus:ring-2 focus:ring-primary-400 cursor-pointer">
                  {PAGE_SIZE_OPTIONS.map((opt) => (<option key={opt} value={opt}>{opt}</option>))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-1.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              </div>
              <span>per halaman</span>
            </label>
            <div className="group relative inline-block">
              <button type="button" onClick={() => query.refetch()} disabled={query.isFetching} aria-label="Refresh data user admin" className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-primary-100 text-primary-700 ring-1 ring-primary-200/70 transition-all duration-150 hover:bg-primary-600 hover:text-white hover:ring-primary-600 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 focus-visible:ring-offset-1 disabled:opacity-60 disabled:cursor-not-allowed dark:bg-primary-500/15 dark:text-primary-300 dark:ring-primary-500/30 dark:hover:bg-primary-500 dark:hover:text-white dark:hover:ring-primary-400 dark:focus-visible:ring-offset-slate-900">
                <RefreshCw className={`h-4 w-4 ${query.isFetching ? 'animate-spin' : ''}`} />
              </button>
              <span role="tooltip" className="pointer-events-none absolute left-1/2 bottom-full z-20 mb-2 -translate-x-1/2 whitespace-nowrap rounded-md bg-slate-900 px-2 py-1 text-[11px] font-medium text-white opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100 dark:bg-slate-700">
                Refresh
                <span className="absolute left-1/2 top-full -translate-x-1/2 border-4 border-transparent border-t-slate-900 dark:border-t-slate-700" />
              </span>
            </div>
          </div>
          <div className="relative w-full sm:max-w-xs">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input type="search" value={searchInput} onChange={(e) => setSearchInput(e.target.value)} placeholder="Cari username, email, atau nama..." aria-label="Cari user admin" className="field field-with-icon !py-2.5 text-sm" />
          </div>
        </div>

        {/* Loading bar */}
        <div className="mt-4"><LoadingBar active={query.isFetching} /></div>

        {/* Table */}
        <div className={`relative mt-2 overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-700/70 transition-opacity duration-200 ${query.isFetching && !query.isLoading ? 'opacity-70' : 'opacity-100'}`} aria-busy={query.isFetching}>
          {query.isFetching && !query.isLoading && (
            <div className="pointer-events-none absolute right-3 top-3 z-10 inline-flex items-center gap-1.5 rounded-full bg-white/95 dark:bg-slate-900/90 px-2.5 py-1 text-[11px] font-semibold text-primary-700 dark:text-primary-300 shadow-card backdrop-blur ring-1 ring-primary-200/60 dark:ring-primary-500/30 animate-fade-in">
              <Loader2 className="h-3 w-3 animate-spin" /> Memuat...
            </div>
          )}
          <table className="w-full min-w-[760px] border-collapse">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-700/70">
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 w-14">No</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 w-16 lg:w-64">Aksi</th>
                <SortHeader label="Username" col="username" activeCol={sortBy} dir={sortDir} onSort={toggleSort} />
                <SortHeader label="Email" col="email" activeCol={sortBy} dir={sortDir} onSort={toggleSort} />
                <SortHeader label="Full Name" col="full_name" activeCol={sortBy} dir={sortDir} onSort={toggleSort} />
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Role</th>
                <SortHeader label="Status" col="status" activeCol={sortBy} dir={sortDir} onSort={toggleSort} />
              </tr>
            </thead>
            <tbody>
              {query.isLoading && (
                <tr><td colSpan={7} className="px-4 py-12"><div className="flex items-center justify-center gap-2 text-slate-500 dark:text-slate-400"><Loader2 className="h-5 w-5 animate-spin" /><span className="text-sm">Memuat data user...</span></div></td></tr>
              )}
              {!query.isLoading && query.isError && (
                <tr><td colSpan={7} className="px-4 py-12"><div className="flex items-center justify-center gap-2 text-red-600 dark:text-red-400"><AlertCircle className="h-5 w-5" /><span className="text-sm">Gagal memuat data user. Coba muat ulang halaman.</span></div></td></tr>
              )}
              {!query.isLoading && !query.isError && items.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-12"><p className="text-center text-sm text-slate-500 dark:text-slate-400">{search ? `Tidak ada user yang cocok dengan "${search}".` : 'Belum ada data user.'}</p></td></tr>
              )}
              {!query.isError && items.map((row, idx) => (
                <tr key={row.id} className="border-b border-slate-100 dark:border-slate-700/50 last:border-0 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/40">
                  <td className="px-4 py-3 text-sm text-slate-500 dark:text-slate-400 tabular-nums">{(page - 1) * pageSize + idx + 1}</td>
                  <td className="px-4 py-3">
                    <RowActions actions={buildRowActions(row)} />
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-sm text-slate-700 dark:text-slate-200 font-medium">{row.username ?? '-'}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-sm text-slate-600 dark:text-slate-300">{row.email}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-sm text-slate-700 dark:text-slate-200">{row.full_name}</span>
                  </td>
                  <td className="px-4 py-3">
                    {row.roles.length === 0 ? (
                      <span className="text-xs italic text-slate-400 dark:text-slate-500">—</span>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {row.roles.slice(0, 2).map((r) => (
                          <span key={r.id} className="inline-flex items-center rounded-full bg-fuchsia-50 dark:bg-fuchsia-500/15 px-2 py-0.5 text-[11px] font-semibold text-fuchsia-700 dark:text-fuchsia-300 ring-1 ring-fuchsia-200/70 dark:ring-fuchsia-500/30">
                            {r.nama_role}
                          </span>
                        ))}
                        {row.roles.length > 2 && (
                          <span className="inline-flex items-center rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-[11px] font-semibold text-slate-500 dark:text-slate-400" title={row.roles.map((r) => r.nama_role).join(', ')}>
                            +{row.roles.length - 2}
                          </span>
                        )}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide ring-1 ${statusClass(row.status)}`}>
                      {statusLabel(row.status)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {total > 0 ? (<>Menampilkan <span className="font-semibold text-slate-700 dark:text-slate-200">{rangeFrom}&ndash;{rangeTo}</span> dari <span className="font-semibold text-slate-700 dark:text-slate-200">{total}</span> entri</>) : 'Tidak ada entri'}
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <Pagination page={page} totalPages={totalPages} disabled={query.isFetching} onChange={setPage} />
            <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums shrink-0">Hal. {page} / {totalPages}</span>
          </div>
        </div>
      </div>

      {/* Modals */}
      <UserFormModal open={formOpen} mode={formMode} initialData={editData} onClose={() => setFormOpen(false)} onSuccess={handleFormSuccess} />
      <UserDetailModal open={detailId !== null} userId={detailId} onClose={() => setDetailId(null)} />
      <MappingRoleModal
        open={mappingUser !== null}
        user={mappingUser}
        onClose={() => setMappingUser(null)}
        onSuccess={(message) => { showResult('success', message); query.refetch(); }}
      />
      {deleteConfirm.open && <DeleteConfirmModal user={deleteConfirm.user!} loading={deleteLoading} error={deleteError} onConfirm={handleDelete} onCancel={() => setDeleteConfirm({ open: false, user: null })} />}
      <UserPasswordAlert open={passwordAlert.open} password={passwordAlert.password} username={passwordAlert.username} onClose={() => setPasswordAlert({ open: false, password: '', username: '' })} />

      {/* Alert hasil aksi (sukses/gagal) */}
      <ResultAlert open={resultAlert.open} variant={resultAlert.variant} message={resultAlert.message} onClose={() => setResultAlert((s) => ({ ...s, open: false }))} />

      {/* Konfirmasi aksi: reset password / reset block / logout all */}
      {confirm.open && confirm.kind && confirm.user && (() => {
        const meta = CONFIRM_META[confirm.kind];
        return (
          <ActionConfirmModal
            open
            tone={meta.tone}
            icon={<meta.icon className="h-5 w-5" />}
            title={meta.title}
            message={meta.message(confirm.user)}
            confirmLabel={meta.confirmLabel}
            loadingLabel={meta.loadingLabel}
            loading={confirmLoading}
            error={confirmError}
            onConfirm={handleConfirmAction}
            onCancel={closeConfirm}
          />
        );
      })()}

      {/* Update Status: pilih status lalu konfirmasi */}
      <UpdateStatusModal
        open={statusModal.open}
        user={statusModal.user}
        onSubmit={handleStatusSubmit}
        onClose={() => setStatusModal({ open: false, user: null })}
      />
      {statusConfirm.open && statusConfirm.user && statusConfirm.status && (
        <ActionConfirmModal
          open
          tone="sky"
          icon={<ShieldCheck className="h-5 w-5" />}
          title="Ubah Status User?"
          message={`Ubah status user "${statusConfirm.user.username ?? statusConfirm.user.email}" menjadi "${statusLabel(statusConfirm.status)}"? Kunci login (gagal login & locked) akan direset.`}
          confirmLabel="Simpan"
          loadingLabel="Menyimpan…"
          loading={statusLoading}
          error={statusError}
          onConfirm={handleStatusConfirm}
          onCancel={() => { if (!statusLoading) setStatusConfirm({ open: false, user: null, status: null }); }}
        />
      )}
    </section>
  );
}
