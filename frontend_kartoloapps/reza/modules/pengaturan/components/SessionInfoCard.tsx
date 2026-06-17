import { useQuery } from '@tanstack/react-query';
import {
  AlertCircle,
  Clock,
  Globe2,
  Loader2,
  MapPin,
  MonitorSmartphone,
  ShieldCheck,
} from 'lucide-react';
import { getMySessions, type SessionItem } from '../api/pengaturan-api';
import { parseUserAgent } from '../lib/parseUserAgent';

function formatDateTime(iso: string): string {
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

function SessionLine({ item, dense }: { item: SessionItem; dense?: boolean }) {
  const ua = parseUserAgent(item.user_agent);
  const pad = dense ? 'p-3 sm:p-4' : 'p-4 sm:p-5';
  return (
    <div
      className={`grid grid-cols-1 sm:grid-cols-[1.3fr_1fr_1fr] gap-3 sm:gap-5 items-start rounded-2xl bg-slate-50 dark:bg-slate-800/60 ${pad} transition-colors duration-300`}
    >
      <div className="min-w-0 flex items-start gap-3">
        <span className="h-9 w-9 rounded-xl bg-primary-100 dark:bg-primary-500/20 text-primary-700 dark:text-primary-400 flex items-center justify-center shrink-0">
          <MonitorSmartphone className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <p className="text-xs text-slate-500 dark:text-slate-400">Perangkat / Browser</p>
          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 mt-0.5 break-words">
            {ua.label}
          </p>
          {item.user_agent && (
            <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1 break-all line-clamp-2">
              {item.user_agent}
            </p>
          )}
        </div>
      </div>

      <div className="flex items-start gap-3 min-w-0">
        <span className="h-9 w-9 rounded-xl bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 flex items-center justify-center shrink-0">
          <Globe2 className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <p className="text-xs text-slate-500 dark:text-slate-400">IP</p>
          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 mt-0.5 break-all">
            {item.ip ?? '-'}
          </p>
        </div>
      </div>

      <div className="flex items-start gap-3 min-w-0">
        <span className="h-9 w-9 rounded-xl bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 flex items-center justify-center shrink-0">
          <Clock className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {item.is_active ? 'Login pada' : 'Aktif terakhir'}
          </p>
          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 mt-0.5">
            {formatDateTime(item.is_active ? item.created_at : item.last_active_at)}
          </p>
        </div>
      </div>
    </div>
  );
}

export function SessionInfoCard() {
  const query = useQuery({
    queryKey: ['pengaturan.sessions'],
    queryFn: getMySessions,
    staleTime: 15_000,
  });

  const data = query.data;
  const currentSession = data?.active.find((s) => s.is_current) ?? data?.active[0] ?? null;
  const otherActive = data?.active.filter((s) => !s.is_current) ?? [];

  return (
    <div className="glass-card rounded-3xl p-6 sm:p-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-bold text-slate-900 dark:text-slate-50 flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary-600 dark:text-primary-400" />
            Session &amp; Login
          </h3>
          <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">
            Aktivitas akun Anda saat ini dan riwayat login terbaru.
          </p>
        </div>
        {query.isFetching && !query.isLoading && (
          <span className="inline-flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Memperbarui...
          </span>
        )}
      </div>

      {query.isLoading && (
        <div className="mt-5 flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin" /> Memuat data sesi...
        </div>
      )}

      {query.isError && (
        <div className="mt-5 flex items-center gap-3 rounded-2xl border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/30 px-4 py-3">
          <AlertCircle className="h-5 w-5 shrink-0 text-red-500 dark:text-red-400" />
          <p className="text-sm text-red-700 dark:text-red-300">
            Gagal memuat data sesi. Coba muat ulang halaman.
          </p>
        </div>
      )}

      {data && (
        <div className="mt-5 space-y-6">
          {/* Sesi aktif */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <p className="text-xs uppercase tracking-wider font-semibold text-slate-500 dark:text-slate-400">
                Sesi aktif saat ini
              </p>
              {currentSession && (
                <span className="inline-flex items-center gap-1 rounded-full bg-primary-100 dark:bg-primary-500/20 text-primary-700 dark:text-primary-300 px-2.5 py-0.5 text-[11px] font-semibold">
                  <span className="h-1.5 w-1.5 rounded-full bg-primary-500 animate-pulse" />
                  Sesi ini
                </span>
              )}
            </div>
            {currentSession ? (
              <SessionLine item={currentSession} />
            ) : (
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Tidak ada sesi aktif terdeteksi.
              </p>
            )}
          </div>

          {otherActive.length > 0 && (
            <div>
              <p className="text-xs uppercase tracking-wider font-semibold text-slate-500 dark:text-slate-400 mb-3">
                Sesi aktif lain
              </p>
              <div className="space-y-3">
                {otherActive.map((s) => (
                  <SessionLine key={s.id} item={s} dense />
                ))}
              </div>
            </div>
          )}

          <div>
            <div className="flex items-center gap-2 mb-3">
              <MapPin className="h-3.5 w-3.5 text-slate-500 dark:text-slate-400" />
              <p className="text-xs uppercase tracking-wider font-semibold text-slate-500 dark:text-slate-400">
                Login terakhir
              </p>
            </div>
            {data.history.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Belum ada riwayat login lain selain sesi aktif.
              </p>
            ) : (
              <SessionLine item={data.history[0]!} dense />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
