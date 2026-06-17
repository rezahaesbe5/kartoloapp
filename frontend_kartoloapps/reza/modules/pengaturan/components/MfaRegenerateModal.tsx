import { useEffect, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { CheckCircle2, Loader2, RefreshCw } from 'lucide-react';
import { Modal } from '@/shared/components/Modal';
import { ApiError } from '@/shared/lib/api-client';
import { regenerateRecoveryCodes, type RegenerateRecoveryCodesResult } from '../api/pengaturan-api';
import { OtpInput } from './OtpInput';
import { RecoveryCodesPanel } from './RecoveryCodesPanel';

interface MfaRegenerateModalProps {
  open: boolean;
  onClose: () => void;
  onRegenerated: (generatedAt: string) => void;
}

type Step = 'verify' | 'codes';

export function MfaRegenerateModal({ open, onClose, onRegenerated }: MfaRegenerateModalProps) {
  const [step, setStep] = useState<Step>('verify');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [confirmedSaved, setConfirmedSaved] = useState(false);
  const [result, setResult] = useState<RegenerateRecoveryCodesResult | null>(null);

  useEffect(() => {
    if (open) {
      setStep('verify');
      setCode('');
      setError(null);
      setConfirmedSaved(false);
      setResult(null);
    }
  }, [open]);

  const mutation = useMutation({
    mutationFn: regenerateRecoveryCodes,
    onSuccess: (data) => {
      setResult(data);
      setStep('codes');
    },
    onError: (err: unknown) => {
      const msg = err instanceof ApiError ? err.message : 'Gagal generate recovery codes.';
      setError(msg);
    },
  });

  const submit = () => {
    if (!/^\d{6}$/.test(code)) {
      setError('Masukkan 6 digit kode dari authenticator.');
      return;
    }
    setError(null);
    mutation.mutate(code);
  };

  const finish = () => {
    if (!confirmedSaved || !result) return;
    onRegenerated(result.generated_at);
    onClose();
  };

  const handleClose = () => {
    if (step === 'codes' && result) onRegenerated(result.generated_at);
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={step === 'verify' ? 'Regenerate Recovery Codes' : 'Simpan Recovery Codes Baru'}
      description={
        step === 'verify'
          ? 'Konfirmasi dengan kode authenticator untuk membuat batch baru.'
          : 'Kode lama langsung dibatalkan. Simpan kode baru di tempat aman.'
      }
      icon={<RefreshCw className="h-5 w-5" />}
    >
      {step === 'verify' && (
        <div className="space-y-5">
          <div className="rounded-2xl border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/30 px-4 py-3 text-sm text-amber-800 dark:text-amber-200">
            Setelah konfirmasi, <strong>semua recovery codes lama</strong> akan
            invalid. Anda akan dapat 10 kode baru — simpan segera.
          </div>

          <OtpInput
            value={code}
            onChange={setCode}
            onSubmit={submit}
            error={error ?? undefined}
            disabled={mutation.isPending}
            autoFocus
            hint="Kode 6-digit dari authenticator app Anda."
          />

          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 pt-1">
            <button
              type="button"
              onClick={handleClose}
              disabled={mutation.isPending}
              className="btn-ghost justify-center text-sm"
            >
              Batal
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={mutation.isPending || code.length !== 6}
              className="btn-primary justify-center text-sm"
            >
              {mutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Memproses...
                </>
              ) : (
                <>
                  <RefreshCw className="h-4 w-4" />
                  Generate Baru
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {step === 'codes' && result && (
        <div className="space-y-5">
          <RecoveryCodesPanel codes={result.recovery_codes} generatedAt={result.generated_at} />

          <label className="flex items-start gap-2.5 cursor-pointer select-none rounded-2xl bg-slate-50 dark:bg-slate-800/60 p-3">
            <input
              type="checkbox"
              checked={confirmedSaved}
              onChange={(e) => setConfirmedSaved(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-slate-300 dark:border-slate-600 text-primary-600 focus:ring-primary-500 focus:ring-offset-0 dark:bg-slate-700"
            />
            <span className="text-sm text-slate-700 dark:text-slate-200">
              Saya sudah menyimpan kode baru di tempat aman.
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
