import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AtSign,
  BadgeCheck,
  CalendarDays,
  CheckCircle2,
  Clock,
  Loader2,
  Mail,
  AlertCircle,
  Pencil,
  ShieldCheck,
  UserCircle2,
} from 'lucide-react';
import { useAuthStore } from '@/shared/stores/auth-store';
import { getProfile, type ProfileDetail } from '../api/profile-api';
import { EditProfileModal } from '../components/EditProfileModal';

function formatDateTime(iso: string | null): string {
  if (!iso) return '-';
  try {
    return new Date(iso).toLocaleString('id-ID', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

const STATUS_LABEL: Record<ProfileDetail['status'], string> = {
  active: 'Aktif',
  inactive: 'Nonaktif',
  pending: 'Menunggu',
};

const STATUS_BADGE: Record<ProfileDetail['status'], string> = {
  active:
    'bg-primary-100 dark:bg-primary-500/20 text-primary-700 dark:text-primary-300',
  inactive: 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300',
  pending: 'bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300',
};

interface DetailRowProps {
  icon: typeof Mail;
  label: string;
  value: string;
}

function DetailRow({ icon: Icon, label, value }: DetailRowProps) {
  return (
    <div className="flex items-start gap-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 px-4 py-3 transition-colors duration-300">
      <span className="h-9 w-9 rounded-xl bg-primary-100 dark:bg-primary-500/20 text-primary-700 dark:text-primary-400 flex items-center justify-center shrink-0">
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
        <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 mt-0.5 break-words">
          {value}
        </p>
      </div>
    </div>
  );
}

export function ProfileSection() {
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const accessToken = useAuthStore((s) => s.accessToken);
  const setSession = useAuthStore((s) => s.setSession);

  const [editOpen, setEditOpen] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const profileQuery = useQuery({
    queryKey: ['auth.profile'],
    queryFn: getProfile,
    staleTime: 30_000,
  });
  const profile = profileQuery.data;

  const handleProfileUpdated = (updated: ProfileDetail) => {
    queryClient.setQueryData(['auth.profile'], updated);
    queryClient.invalidateQueries({ queryKey: ['auth.me'] });
    if (user && accessToken) {
      setSession({ ...user, email: updated.email, full_name: updated.full_name }, accessToken);
    }
    setSuccessMsg('Profil berhasil diperbarui.');
  };

  return (
    <section aria-label="Bagian Profile" className="space-y-6">
      <header>
        <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-slate-50 tracking-tight">
          Profile
        </h2>
        <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">
          Kelola identitas akun Anda — email, nama lengkap, dan info dasar lainnya.
        </p>
      </header>

      {successMsg && (
        <div
          role="status"
          className="flex items-center gap-3 rounded-2xl border border-primary-200 dark:border-primary-900/50 bg-primary-50 dark:bg-primary-950/30 px-4 py-3 animate-fade-in"
        >
          <CheckCircle2 className="h-5 w-5 shrink-0 text-primary-600 dark:text-primary-400" />
          <p className="text-sm text-primary-800 dark:text-primary-300">{successMsg}</p>
        </div>
      )}

      {profileQuery.isLoading && (
        <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-sm">Memuat profil...</span>
        </div>
      )}

      {profileQuery.isError && (
        <div className="flex items-center gap-3 rounded-2xl border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/30 px-4 py-3">
          <AlertCircle className="h-5 w-5 shrink-0 text-red-500 dark:text-red-400" />
          <p className="text-sm text-red-700 dark:text-red-300">
            Gagal memuat profil. Coba muat ulang halaman.
          </p>
        </div>
      )}

      {profile && (
        <div className="glass-card rounded-3xl p-6 sm:p-8">
          {/* Identitas */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-5">
            <div className="h-20 w-20 rounded-3xl bg-gradient-primary text-white text-2xl font-extrabold flex items-center justify-center shrink-0 shadow-lg">
              {initials(profile.full_name)}
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="text-xl font-bold text-slate-900 dark:text-slate-50">
                {profile.full_name}
              </h3>
              <p className="text-sm text-slate-600 dark:text-slate-300 mt-0.5 break-words">
                {profile.email}
              </p>
              <div className="flex flex-wrap items-center gap-2 mt-3">
                <span className="inline-flex items-center gap-1 rounded-full bg-primary-100 dark:bg-primary-500/20 text-primary-700 dark:text-primary-300 px-3 py-1 text-xs font-semibold capitalize">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  {profile.user_type}
                </span>
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold ${STATUS_BADGE[profile.status]}`}
                >
                  <BadgeCheck className="h-3.5 w-3.5" />
                  {STATUS_LABEL[profile.status]}
                </span>
              </div>
            </div>
            <button
              onClick={() => {
                setSuccessMsg(null);
                setEditOpen(true);
              }}
              className="btn-primary justify-center text-sm w-full sm:w-auto sm:shrink-0"
            >
              <Pencil className="h-4 w-4" />
              Edit Profile
            </button>
          </div>

          <div className="my-6 h-px bg-slate-200 dark:bg-slate-700" />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <DetailRow icon={UserCircle2} label="Nama Lengkap" value={profile.full_name} />
            <DetailRow icon={AtSign} label="Username" value={profile.username ?? '-'} />
            <DetailRow icon={Mail} label="Email" value={profile.email} />
            <DetailRow icon={CalendarDays} label="Terdaftar sejak" value={formatDateTime(profile.created_at)} />
            <DetailRow icon={Clock} label="Login terakhir" value={formatDateTime(profile.last_login_at)} />
          </div>
        </div>
      )}

      {profile && (
        <EditProfileModal
          open={editOpen}
          onClose={() => setEditOpen(false)}
          profile={profile}
          onSuccess={handleProfileUpdated}
        />
      )}
    </section>
  );
}
