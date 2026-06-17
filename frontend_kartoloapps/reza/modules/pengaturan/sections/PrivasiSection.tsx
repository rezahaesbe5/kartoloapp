import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  KeyRound,
  RefreshCw,
  ShieldCheck,
  ShieldOff,
  Sparkles,
} from 'lucide-react';
import { getMfaStatus, type MfaStatus } from '../api/pengaturan-api';
import { ChangePasswordModal } from '../components/ChangePasswordModal';
import { MfaEnableModal } from '../components/MfaEnableModal';
import { MfaDisableModal } from '../components/MfaDisableModal';
import { MfaRegenerateModal } from '../components/MfaRegenerateModal';
import { SessionInfoCard } from '../components/SessionInfoCard';

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

export function PrivasiSection() {
  const queryClient = useQueryClient();
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [mfaEnableOpen, setMfaEnableOpen] = useState(false);
  const [mfaDisableOpen, setMfaDisableOpen] = useState(false);
  const [mfaRegenerateOpen, setMfaRegenerateOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const PLACEHOLDER: MfaStatus = {
    enabled: false,
    enrolled_at: null,
    recovery_codes_remaining: 0,
    recovery_codes_total: 0,
    recovery_codes_generated_at: null,
  };

  // placeholderData supaya UI langsung punya state default (asumsi belum aktif)
  // tanpa flash loading. Begitu fetch selesai (~5-50ms), state akan diperbarui
  // dengan nilai asli — kalau ternyata enabled, tombol switch ke "Nonaktifkan".
  const mfaQuery = useQuery<MfaStatus>({
    queryKey: ['pengaturan.mfa.status'],
    queryFn: getMfaStatus,
    staleTime: 30_000,
    placeholderData: PLACEHOLDER,
  });

  const mfa: MfaStatus = mfaQuery.data ?? PLACEHOLDER;

  const handleMfaEnabled = (enrolledAt: string) => {
    // Setelah enroll, recovery codes baru saja di-generate (10 fresh).
    queryClient.setQueryData<MfaStatus>(['pengaturan.mfa.status'], {
      enabled: true,
      enrolled_at: enrolledAt,
      recovery_codes_remaining: 10,
      recovery_codes_total: 10,
      recovery_codes_generated_at: enrolledAt,
    });
    setToast('MFA berhasil diaktifkan. Login berikutnya akan meminta kode 6-digit.');
  };

  const handleMfaDisabled = () => {
    queryClient.setQueryData(['pengaturan.mfa.status'], PLACEHOLDER);
    setToast('MFA telah dinonaktifkan.');
  };

  const handleRecoveryRegenerated = (generatedAt: string) => {
    queryClient.setQueryData<MfaStatus>(['pengaturan.mfa.status'], {
      ...mfa,
      recovery_codes_remaining: 10,
      recovery_codes_total: 10,
      recovery_codes_generated_at: generatedAt,
    });
    setToast('Recovery codes baru sudah dibuat. Kode lama tidak berlaku lagi.');
  };

  const recoveryLow =
    mfa.enabled && mfa.recovery_codes_total > 0 && mfa.recovery_codes_remaining < 3;
  const recoveryEmpty = mfa.enabled && mfa.recovery_codes_remaining === 0;

  return (
    <section aria-label="Bagian Privasi" className="space-y-6">
      <header>
        <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-slate-50 tracking-tight">
          Privasi &amp; Keamanan
        </h2>
        <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">
          Pantau aktivitas login dan kelola pengamanan akun Anda.
        </p>
      </header>

      {toast && (
        <div
          role="status"
          className="flex items-center gap-3 rounded-2xl border border-primary-200 dark:border-primary-900/50 bg-primary-50 dark:bg-primary-950/30 px-4 py-3 animate-fade-in"
        >
          <CheckCircle2 className="h-5 w-5 shrink-0 text-primary-600 dark:text-primary-400" />
          <p className="text-sm text-primary-800 dark:text-primary-300 flex-1">{toast}</p>
          <button
            type="button"
            onClick={() => setToast(null)}
            className="text-xs font-semibold text-primary-700 dark:text-primary-300 hover:underline"
          >
            Tutup
          </button>
        </div>
      )}

      <SessionInfoCard />

      {/* Card Ganti Password */}
      <div className="glass-card rounded-3xl p-6 sm:p-8">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <span className="h-11 w-11 rounded-2xl bg-primary-100 dark:bg-primary-500/20 text-primary-700 dark:text-primary-300 flex items-center justify-center shrink-0">
            <KeyRound className="h-5 w-5" />
          </span>
          <div className="flex-1 min-w-0">
            <h3 className="text-lg font-bold text-slate-900 dark:text-slate-50">Ganti Password</h3>
            <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">
              Perbarui password secara berkala. Gunakan kombinasi huruf besar/kecil, angka, dan simbol.
            </p>
          </div>
          <button
            onClick={() => setPasswordOpen(true)}
            className="btn-primary justify-center text-sm w-full sm:w-auto"
          >
            <KeyRound className="h-4 w-4" />
            Ganti Password
          </button>
        </div>
      </div>

      {/* Card MFA */}
      <div className="glass-card rounded-3xl p-6 sm:p-8">
        <div className="flex flex-col sm:flex-row sm:items-start gap-4">
          <span
            className={`h-11 w-11 rounded-2xl flex items-center justify-center shrink-0 transition-colors duration-200 ${
              mfa.enabled
                ? 'bg-gradient-primary text-white shadow-soft'
                : 'bg-primary-100 dark:bg-primary-500/20 text-primary-700 dark:text-primary-300'
            }`}
          >
            <ShieldCheck className="h-5 w-5" />
          </span>
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-lg font-bold text-slate-900 dark:text-slate-50">
                Autentikasi Dua Faktor (MFA)
              </h3>
              {mfa.enabled ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-primary-100 dark:bg-primary-500/20 text-primary-700 dark:text-primary-300 px-2.5 py-0.5 text-[11px] font-semibold">
                  <span className="h-1.5 w-1.5 rounded-full bg-primary-500 animate-pulse" />
                  Aktif
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 px-2.5 py-0.5 text-[11px] font-semibold">
                  Belum aktif
                </span>
              )}
            </div>
            <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">
              Lapisan keamanan ekstra: setelah password benar, login akan meminta kode 6-digit dari
              authenticator app (Google Authenticator, Microsoft Authenticator, Authy, dll).
            </p>
            {mfa.enabled && mfa.enrolled_at && (
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5 text-primary-500" />
                Aktif sejak {formatDateTime(mfa.enrolled_at)}
              </p>
            )}
            {!mfa.enabled && (
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
                Setelah dihubungkan ke satu authenticator, Anda perlu menonaktifkan terlebih dahulu
                sebelum bisa terhubung ke authenticator lain.
              </p>
            )}
          </div>
          <div className="w-full sm:w-auto sm:shrink-0">
            {mfaQuery.isError ? (
              <div className="flex items-center gap-2 rounded-2xl border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/30 px-3 py-2 text-xs text-red-700 dark:text-red-300">
                <AlertCircle className="h-4 w-4 shrink-0" />
                Gagal memuat status
              </div>
            ) : mfa.enabled ? (
              <button
                onClick={() => setMfaDisableOpen(true)}
                className="inline-flex w-full sm:w-auto items-center justify-center gap-2 rounded-2xl bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 font-semibold px-4 py-2.5 text-sm border border-red-200 dark:border-red-900/50 hover:bg-red-100 dark:hover:bg-red-950/60 transition-colors duration-200"
              >
                <ShieldOff className="h-4 w-4" />
                Nonaktifkan MFA
              </button>
            ) : (
              <button
                onClick={() => setMfaEnableOpen(true)}
                className="btn-primary justify-center text-sm w-full sm:w-auto"
              >
                <ShieldCheck className="h-4 w-4" />
                Aktifkan MFA
              </button>
            )}
          </div>
        </div>

        {mfa.enabled && (
          <>
            <div className="my-6 h-px bg-slate-200 dark:bg-slate-700" />

            <div className="flex flex-col sm:flex-row sm:items-start gap-4">
              <span className="h-11 w-11 rounded-2xl bg-primary-100 dark:bg-primary-500/20 text-primary-700 dark:text-primary-300 flex items-center justify-center shrink-0">
                <KeyRound className="h-5 w-5" />
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h4 className="text-base font-bold text-slate-900 dark:text-slate-50">
                    Recovery Codes
                  </h4>
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                      recoveryEmpty
                        ? 'bg-red-100 dark:bg-red-500/20 text-red-700 dark:text-red-300'
                        : recoveryLow
                          ? 'bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    Sisa {mfa.recovery_codes_remaining}/{mfa.recovery_codes_total || 10}
                  </span>
                </div>
                <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">
                  Kode pemulihan sekali pakai untuk login jika Anda kehilangan
                  authenticator. Simpan di tempat aman (password manager, brankas,
                  kertas).
                </p>
                {mfa.recovery_codes_generated_at && (
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
                    Terakhir di-generate: {formatDateTime(mfa.recovery_codes_generated_at)}
                  </p>
                )}
                {(recoveryLow || recoveryEmpty) && (
                  <div className="mt-3 flex items-start gap-2 rounded-2xl border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/30 px-3 py-2.5 text-xs text-amber-800 dark:text-amber-200">
                    <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                    <span>
                      {recoveryEmpty
                        ? 'Recovery codes habis. Generate baru segera supaya Anda tidak terkunci kalau authenticator hilang.'
                        : 'Recovery codes hampir habis. Pertimbangkan untuk generate baru.'}
                    </span>
                  </div>
                )}
              </div>
              <div className="w-full sm:w-auto sm:shrink-0">
                <button
                  onClick={() => setMfaRegenerateOpen(true)}
                  className="inline-flex w-full sm:w-auto items-center justify-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-semibold bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-100 border border-slate-200 dark:border-slate-600 hover:bg-primary-50 dark:hover:bg-slate-600 transition-colors duration-200"
                >
                  <RefreshCw className="h-4 w-4" />
                  Regenerate
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      <ChangePasswordModal
        open={passwordOpen}
        onClose={() => setPasswordOpen(false)}
        onSuccess={() => setToast('Password berhasil diganti.')}
      />
      <MfaEnableModal
        open={mfaEnableOpen}
        onClose={() => setMfaEnableOpen(false)}
        onEnabled={handleMfaEnabled}
      />
      <MfaDisableModal
        open={mfaDisableOpen}
        onClose={() => setMfaDisableOpen(false)}
        onDisabled={handleMfaDisabled}
      />
      <MfaRegenerateModal
        open={mfaRegenerateOpen}
        onClose={() => setMfaRegenerateOpen(false)}
        onRegenerated={handleRecoveryRegenerated}
      />
    </section>
  );
}
