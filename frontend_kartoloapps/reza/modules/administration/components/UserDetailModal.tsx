import { createPortal } from 'react-dom';
import { useEffect, useState } from 'react';
import {
  Clock,
  Fingerprint,
  Loader2,
  Shield,
  UserCog,
  X,
} from 'lucide-react';
import { getUsers, type UserRow, type UserTypeFilter } from '../api/user-api';

interface UserDetailModalProps {
  open: boolean;
  userId: string | null;
  onClose: () => void;
  /** Tipe user yang di-fetch (untuk membatasi list). Default "admin". */
  userType?: UserTypeFilter;
  /** Label entitas di aria-label ("Admin" / "Member"). Default "Admin". */
  entityLabel?: string;
}

function formatTimestamp(iso: string | null): string {
  if (!iso) return '-';
  try {
    return new Date(iso).toLocaleString('id-ID', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
  } catch { return iso; }
}

function formatRelativeTime(iso: string | null): string {
  if (!iso) return 'Belum pernah';
  try {
    const date = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    const diffHr = Math.floor(diffMs / 3600000);
    const diffDay = Math.floor(diffMs / 86400000);
    if (diffMin < 1) return 'Baru saja';
    if (diffMin < 60) return `${diffMin} menit yang lalu`;
    if (diffHr < 24) return `${diffHr} jam yang lalu`;
    if (diffDay < 30) return `${diffDay} hari yang lalu`;
    return formatTimestamp(iso);
  } catch { return formatTimestamp(iso); }
}

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

function userTypeLabel(t: string): string {
  switch (t) {
    case 'superadmin': return 'Superadmin';
    case 'admin': return 'Admin';
    case 'member': return 'Member';
    default: return t;
  }
}

function getInitials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const first = parts[0] ?? '';
  const last = parts[parts.length - 1] ?? '';
  if (parts.length === 1) return (first.charAt(0) || '?').toUpperCase();
  return (first.charAt(0) + last.charAt(0)).toUpperCase();
}

/* ---- Row ---- */

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-4 py-2.5 border-b border-slate-100 dark:border-slate-800 last:border-0">
      <dt className="w-36 shrink-0 text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wide">{label}</dt>
      <dd className="text-sm text-slate-800 dark:text-slate-100 break-words min-w-0">{children}</dd>
    </div>
  );
}

/* ---- Section ---- */

function Section({ icon: Icon, title, children }: { icon: React.ComponentType<{ className?: string }>; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-200 dark:border-slate-700/50 bg-white dark:bg-slate-800/30 overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-slate-100 dark:border-slate-700/50 bg-slate-50/50 dark:bg-slate-800/50">
        <span className="flex h-6 w-6 items-center justify-center rounded-md bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400 shrink-0">
          <Icon className="h-3.5 w-3.5" />
        </span>
        <h3 className="text-xs font-bold text-slate-500 dark:text-slate-400">{title}</h3>
      </div>
      <div className="px-4 pb-1">
        <dl>{children}</dl>
      </div>
    </div>
  );
}

/* ---- Main Modal ---- */

export function UserDetailModal({ open, userId, onClose, userType = 'admin', entityLabel = 'Admin' }: UserDetailModalProps) {
  const [user, setUser] = useState<UserRow | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !userId) { setUser(null); setLoading(false); setError(null); return; }
    setLoading(true); setError(null);
    getUsers({ page: 1, page_size: 100, user_type: userType })
      .then((res) => {
        const found = res.items.find((u) => u.id === userId) ?? null;
        setUser(found);
        setError(found ? null : 'User tidak ditemukan.');
      })
      .catch(() => setError('Gagal memuat data user.'))
      .finally(() => setLoading(false));
  }, [open, userId, userType]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/30 dark:bg-slate-950/60 backdrop-blur-sm animate-fade-in"
      onClick={(e) => { if (e.target === e.currentTarget && !loading) onClose(); }}
      role="dialog"
      aria-modal="true"
      aria-label={`Detail User ${entityLabel}`}
    >
      <div className="w-full max-w-3xl max-h-[90vh] rounded-2xl border border-slate-200 dark:border-slate-700/70 bg-white dark:bg-slate-900 shadow-2xl animate-pop-in flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-center gap-3 px-5 sm:px-6 pt-5 pb-4 border-b border-slate-200 dark:border-slate-700/70 shrink-0">
          {loading ? (
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-200 dark:bg-slate-700 animate-pulse shrink-0" />
          ) : user ? (
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-primary text-white text-sm font-bold shadow-lg shrink-0">
              {getInitials(user.full_name)}
            </div>
          ) : null}
          <div className="min-w-0 flex-1">
            {loading ? (
              <div className="space-y-1.5">
                <div className="h-5 w-36 rounded-md bg-slate-200 dark:bg-slate-700 animate-pulse" />
                <div className="h-3.5 w-24 rounded-md bg-slate-200 dark:bg-slate-700 animate-pulse" />
              </div>
            ) : user ? (
              <>
                <h2 className="text-lg font-bold text-slate-800 dark:text-slate-50 truncate">{user.full_name}</h2>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    {user.username ? `@${user.username}` : user.email}
                  </span>
                  {user.roles.length > 0 && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-primary-100 dark:bg-primary-500/15 px-2 py-0.5 text-[11px] font-semibold text-primary-700 dark:text-primary-300">
                      {user.roles.length === 1 ? user.roles[0]!.nama_role : `${user.roles.length} role`}
                    </span>
                  )}
                  <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide ring-1 ${statusClass(user.status)}`}>
                    {statusLabel(user.status)}
                  </span>
                </div>
              </>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup"
            className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200 shrink-0"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 sm:px-6 py-4">
          {loading && (
            <div className="flex flex-col items-center justify-center gap-2 py-16 text-slate-500 dark:text-slate-400">
              <Loader2 className="h-6 w-6 animate-spin text-primary-500" />
              <span className="text-sm">Memuat data user...</span>
            </div>
          )}

          {error && !loading && (
            <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-100 dark:bg-red-500/15 text-red-500 dark:text-red-400">
                <Shield className="h-5 w-5" />
              </span>
              <p className="text-sm font-medium text-red-600 dark:text-red-400">{error}</p>
            </div>
          )}

          {user && !loading && (
            <div className="space-y-4">

              {/* Identitas */}
              <Section icon={UserCog} title="Identitas">
                <Row label="Username">
                  {user.username || <span className="text-slate-400 dark:text-slate-500 italic">Tidak ada</span>}
                </Row>
                <Row label="Email">
                  <span className="break-all">{user.email}</span>
                </Row>
                <Row label="Nama Lengkap">{user.full_name}</Row>
                <Row label="Tipe User">{userTypeLabel(user.user_type)}</Row>
                <Row label="Role">
                  {user.roles.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {user.roles.map((r) => (
                        <span key={r.id} className="inline-flex items-center rounded-full bg-primary-100 dark:bg-primary-500/15 px-2 py-0.5 text-[11px] font-semibold text-primary-700 dark:text-primary-300">
                          {r.nama_role}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <span className="text-slate-400 dark:text-slate-500 italic">Tidak ada</span>
                  )}
                </Row>
              </Section>

              {/* Keamanan */}
              <Section icon={Fingerprint} title="Keamanan">
                <Row label="Status">
                  <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide ring-1 ${statusClass(user.status)}`}>
                    {statusLabel(user.status)}
                  </span>
                </Row>
                <Row label="2FA">
                  <div className="flex items-center gap-2">
                    <span className={`inline-flex h-2 w-2 rounded-full ${user.two_factor_enabled ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600'}`} />
                    <span className={user.two_factor_enabled ? 'text-emerald-700 dark:text-emerald-300 font-medium' : ''}>
                      {user.two_factor_enabled ? 'Aktif' : 'Nonaktif'}
                    </span>
                  </div>
                </Row>
                {user.two_factor_enrolled_at && (
                  <Row label="2FA Enrolled">{formatTimestamp(user.two_factor_enrolled_at)}</Row>
                )}
                <Row label="Gagal Login">
                  <span className={user.failed_login_attempts > 0 ? 'text-amber-600 dark:text-amber-400 font-semibold' : ''}>
                    {user.failed_login_attempts}x
                  </span>
                </Row>
                {user.locked_until && (
                  <Row label="Terkunci Sampai">
                    <span className="text-red-600 dark:text-red-400 font-semibold">{formatTimestamp(user.locked_until)}</span>
                  </Row>
                )}
                <Row label="Email Terverifikasi">
                  {user.email_verified_at ? (
                    <span className="text-emerald-600 dark:text-emerald-400 font-medium">{formatTimestamp(user.email_verified_at)}</span>
                  ) : (
                    <span className="text-slate-400 dark:text-slate-500 italic">Belum terverifikasi</span>
                  )}
                </Row>
              </Section>

              {/* Aktivitas */}
              <Section icon={Clock} title="Aktivitas">
                <Row label="Login Terakhir">{formatRelativeTime(user.last_login_at)}</Row>
                <Row label="Dibuat">{formatTimestamp(user.created_at)}</Row>
                <Row label="Diperbarui">{formatTimestamp(user.updated_at)}</Row>
                <Row label="User ID">
                  <span className="font-mono text-xs bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded break-all">{user.id}</span>
                </Row>
              </Section>

            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end px-5 sm:px-6 py-3 border-t border-slate-200 dark:border-slate-700/70 bg-slate-50/50 dark:bg-slate-800/30 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-200 dark:border-slate-700 px-5 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 transition-colors hover:bg-slate-100 dark:hover:bg-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
