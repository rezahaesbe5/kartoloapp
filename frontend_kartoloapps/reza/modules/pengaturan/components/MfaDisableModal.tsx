import { useEffect, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Loader2, ShieldOff } from 'lucide-react';
import { Modal } from '@/shared/components/Modal';
import { ApiError } from '@/shared/lib/api-client';
import { disableMfa } from '../api/pengaturan-api';
import { OtpInput } from './OtpInput';

interface MfaDisableModalProps {
  open: boolean;
  onClose: () => void;
  onDisabled: () => void;
}

export function MfaDisableModal({ open, onClose, onDisabled }: MfaDisableModalProps) {
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setCode('');
      setError(null);
    }
  }, [open]);

  const mutation = useMutation({
    mutationFn: disableMfa,
    onSuccess: () => {
      onDisabled();
      onClose();
    },
    onError: (err: unknown) => {
      const msg = err instanceof ApiError ? err.message : 'Gagal menonaktifkan MFA.';
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

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Nonaktifkan MFA"
      description="Konfirmasi dengan kode dari authenticator yang sedang terhubung."
      icon={<ShieldOff className="h-5 w-5" />}
    >
      <div className="space-y-5">
        <div className="rounded-2xl border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/30 px-4 py-3 text-sm text-amber-800 dark:text-amber-200">
          Setelah MFA dinonaktifkan, login Anda tidak lagi memerlukan kode 6-digit.
          Anda bisa menghubungkan ulang ke authenticator yang sama atau berbeda kapan saja.
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
            onClick={onClose}
            disabled={mutation.isPending}
            className="btn-ghost justify-center text-sm"
          >
            Batal
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={mutation.isPending || code.length !== 6}
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-red-600 text-white font-semibold px-5 py-3 shadow-soft transition-all duration-200 hover:bg-red-700 hover:shadow-[0_8px_28px_-6px_rgba(220,38,38,0.45)] hover:-translate-y-0.5 disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:translate-y-0 text-sm"
          >
            {mutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Memproses...
              </>
            ) : (
              <>
                <ShieldOff className="h-4 w-4" />
                Nonaktifkan
              </>
            )}
          </button>
        </div>
      </div>
    </Modal>
  );
}
