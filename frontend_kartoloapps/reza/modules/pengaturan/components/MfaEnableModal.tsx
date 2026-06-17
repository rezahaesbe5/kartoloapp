import { useEffect, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { QRCodeSVG } from 'qrcode.react';
import {
  AlertCircle,
  CheckCircle2,
  Copy,
  Loader2,
  ScanLine,
  ShieldCheck,
} from 'lucide-react';
import { Modal } from '@/shared/components/Modal';
import { ApiError } from '@/shared/lib/api-client';
import {
  beginMfaEnroll,
  confirmMfaEnroll,
  type MfaConfirmResult,
  type MfaEnrollBegin,
} from '../api/pengaturan-api';
import { OtpInput } from './OtpInput';
import { RecoveryCodesPanel } from './RecoveryCodesPanel';

interface MfaEnableModalProps {
  open: boolean;
  onClose: () => void;
  onEnabled: (enrolledAt: string) => void;
}

type Step = 'scan' | 'save-codes';

export function MfaEnableModal({ open, onClose, onEnabled }: MfaEnableModalProps) {
  const [step, setStep] = useState<Step>('scan');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [copiedSecret, setCopiedSecret] = useState(false);
  const [confirmedSaved, setConfirmedSaved] = useState(false);
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [enrolledAt, setEnrolledAt] = useState<string | null>(null);

  const begin = useQuery<MfaEnrollBegin, ApiError>({
    queryKey: ['pengaturan.mfa.enroll.begin'],
    queryFn: beginMfaEnroll,
    enabled: open && step === 'scan',
    staleTime: 0,
    gcTime: 0,
    retry: false,
  });

  useEffect(() => {
    if (open) {
      setStep('scan');
      setCode('');
      setError(null);
      setCopiedSecret(false);
      setConfirmedSaved(false);
      setRecoveryCodes([]);
      setEnrolledAt(null);
    }
  }, [open]);

  const confirm = useMutation({
    mutationFn: confirmMfaEnroll,
    onSuccess: (data: MfaConfirmResult) => {
      setRecoveryCodes(data.recovery_codes);
      setEnrolledAt(data.enrolled_at);
      setStep('save-codes');
    },
    onError: (err: unknown) => {
      const msg = err instanceof ApiError ? err.message : 'Gagal memverifikasi kode.';
      setError(msg);
    },
  });

  const submit = () => {
    if (!/^\d{6}$/.test(code)) {
      setError('Masukkan 6 digit kode dari authenticator.');
      return;
    }
    setError(null);
    confirm.mutate(code);
  };

  const finish = () => {
    if (!confirmedSaved) return;
    if (enrolledAt) onEnabled(enrolledAt);
    onClose();
  };

  const copySecret = async () => {
    if (!begin.data?.secret_base32) return;
    try {
      await navigator.clipboard.writeText(begin.data.secret_base32);
      setCopiedSecret(true);
      setTimeout(() => setCopiedSecret(false), 2000);
    } catch {
      // ignore
    }
  };

  // Saat user di step save-codes, intercept tombol close (X & backdrop) supaya
  // tidak kelewat — onClose tetap fire, tapi user dapat ingat warning. Kalau
  // mereka tetap close tanpa centang, MFA sudah aktif & codes hilang (mereka
  // bisa regenerate dari Pengaturan).
  const handleClose = () => {
    if (step === 'save-codes' && enrolledAt) {
      // MFA sudah aktif — apa pun keputusan user, propagasi status.
      onEnabled(enrolledAt);
    }
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={step === 'scan' ? 'Aktifkan MFA' : 'Simpan Recovery Codes'}
      description={
        step === 'scan'
          ? 'Pindai QR di authenticator app lalu masukkan kode 6-digit.'
          : 'Kode pemulihan untuk akses kalau Anda kehilangan authenticator.'
      }
      icon={<ShieldCheck className="h-5 w-5" />}
    >
      {step === 'scan' && (
        <div className="space-y-5">
          {begin.isLoading && (
            <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
              <Loader2 className="h-4 w-4 animate-spin" /> Menyiapkan QR code...
            </div>
          )}

          {begin.isError && (
            <div className="flex items-start gap-3 rounded-2xl border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/30 px-4 py-3">
              <AlertCircle className="h-5 w-5 shrink-0 text-red-500 dark:text-red-400 mt-0.5" />
              <p className="text-sm text-red-700 dark:text-red-300">{begin.error.message}</p>
            </div>
          )}

          {begin.data && (
            <>
              <div className="rounded-2xl bg-white p-4 border border-slate-200 dark:border-slate-700 flex justify-center">
                <QRCodeSVG
                  value={begin.data.otpauth_url}
                  size={192}
                  level="M"
                  marginSize={2}
                />
              </div>

              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5 flex items-center gap-1.5">
                  <ScanLine className="h-3.5 w-3.5" /> Atau masukkan manual
                </p>
                <div className="flex items-center gap-2 rounded-2xl bg-slate-100 dark:bg-slate-800 px-3 py-2.5">
                  <code className="flex-1 text-sm font-mono tracking-wider text-slate-800 dark:text-slate-100 break-all select-all">
                    {begin.data.secret_base32}
                  </code>
                  <button
                    type="button"
                    onClick={copySecret}
                    className="inline-flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-xs font-semibold bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-100 hover:bg-primary-50 dark:hover:bg-slate-600 transition-colors duration-200 shrink-0"
                  >
                    {copiedSecret ? (
                      <>
                        <CheckCircle2 className="h-3.5 w-3.5 text-primary-600 dark:text-primary-400" />
                        Tersalin
                      </>
                    ) : (
                      <>
                        <Copy className="h-3.5 w-3.5" />
                        Salin
                      </>
                    )}
                  </button>
                </div>
              </div>

              <OtpInput
                value={code}
                onChange={setCode}
                onSubmit={submit}
                error={error ?? undefined}
                disabled={confirm.isPending}
                autoFocus
                hint="Kode berubah tiap 30 detik. Masukkan kode yang masih aktif."
              />

              <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 pt-1">
                <button
                  type="button"
                  onClick={handleClose}
                  disabled={confirm.isPending}
                  className="btn-ghost justify-center text-sm"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={submit}
                  disabled={confirm.isPending || code.length !== 6}
                  className="btn-primary justify-center text-sm"
                >
                  {confirm.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Memverifikasi...
                    </>
                  ) : (
                    <>
                      <ShieldCheck className="h-4 w-4" />
                      Verifikasi &amp; Lanjut
                    </>
                  )}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {step === 'save-codes' && (
        <div className="space-y-5">
          <RecoveryCodesPanel codes={recoveryCodes} generatedAt={enrolledAt ?? undefined} />

          <label className="flex items-start gap-2.5 cursor-pointer select-none rounded-2xl bg-slate-50 dark:bg-slate-800/60 p-3">
            <input
              type="checkbox"
              checked={confirmedSaved}
              onChange={(e) => setConfirmedSaved(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-slate-300 dark:border-slate-600 text-primary-600 focus:ring-primary-500 focus:ring-offset-0 dark:bg-slate-700"
            />
            <span className="text-sm text-slate-700 dark:text-slate-200">
              Saya sudah menyimpan kode di tempat aman dan paham bahwa kode
              tidak akan ditampilkan lagi.
            </span>
          </label>

          <div className="flex justify-end gap-3 pt-1">
            <button
              type="button"
              onClick={finish}
              disabled={!confirmedSaved}
              className="btn-primary justify-center text-sm"
            >
              <CheckCircle2 className="h-4 w-4" />
              Selesai
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
