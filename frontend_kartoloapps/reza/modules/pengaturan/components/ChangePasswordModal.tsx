import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation } from '@tanstack/react-query';
import { Loader2, AlertCircle, KeyRound, ShieldCheck } from 'lucide-react';
import { Modal } from '@/shared/components/Modal';
import { ApiError } from '@/shared/lib/api-client';
import { PasswordField } from '@modules/auth/components/PasswordField';
import { changePassword } from '../api/profile-api';

const schema = z
  .object({
    old_password: z.string().min(1, 'Password lama wajib diisi'),
    new_password: z.string().min(1, 'Password baru wajib diisi'),
    confirm_password: z.string().min(1, 'Ulangi password baru wajib diisi'),
  })
  .refine((d) => d.new_password === d.confirm_password, {
    message: 'Tidak sama dengan password baru',
    path: ['confirm_password'],
  });
type FormValues = z.infer<typeof schema>;

interface ChangePasswordModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

function fieldFromError(err: unknown): string | undefined {
  if (err instanceof ApiError && typeof err.error?.details?.field === 'string') {
    return err.error.details.field;
  }
  return undefined;
}

export function ChangePasswordModal({ open, onClose, onSuccess }: ChangePasswordModalProps) {
  const {
    register,
    handleSubmit,
    reset,
    setError,
    clearErrors,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { old_password: '', new_password: '', confirm_password: '' },
  });

  const close = () => {
    reset();
    onClose();
  };

  const mutation = useMutation({
    mutationFn: changePassword,
    onSuccess: () => {
      reset();
      onSuccess();
      onClose();
    },
    onError: (err) => {
      const field = fieldFromError(err);
      const message = err instanceof ApiError ? err.message : 'Terjadi kesalahan. Coba lagi.';
      if (field === 'old_password' || field === 'new_password') {
        setError(field, { message });
      } else {
        setError('root', { message });
      }
    },
  });

  const onSubmit = (values: FormValues) => {
    clearErrors('root');
    mutation.mutate({ old_password: values.old_password, new_password: values.new_password });
  };

  return (
    <Modal
      open={open}
      onClose={close}
      title="Ganti Password"
      description="Pastikan password baru kuat dan mudah Anda ingat."
      icon={<KeyRound className="h-5 w-5" />}
    >
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
        {errors.root && (
          <div
            role="alert"
            className="flex items-start gap-3 rounded-2xl border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/30 px-4 py-3"
          >
            <AlertCircle className="h-5 w-5 shrink-0 text-red-500 dark:text-red-400 mt-0.5" />
            <p className="text-sm text-red-700 dark:text-red-300">{errors.root.message}</p>
          </div>
        )}

        <PasswordField
          label="Password Lama"
          autoComplete="current-password"
          placeholder="Masukkan password lama"
          error={errors.old_password?.message}
          {...register('old_password')}
        />

        <PasswordField
          label="Password Baru"
          autoComplete="new-password"
          placeholder="Masukkan password baru"
          hint="Min. 8 karakter, kombinasi huruf besar, huruf kecil, angka & karakter spesial."
          error={errors.new_password?.message}
          {...register('new_password')}
        />

        <PasswordField
          label="Ulangi Password Baru"
          autoComplete="new-password"
          placeholder="Ketik ulang password baru"
          error={errors.confirm_password?.message}
          {...register('confirm_password')}
        />

        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 pt-1">
          <button type="button" onClick={close} className="btn-ghost justify-center text-sm">
            Batal
          </button>
          <button
            type="submit"
            disabled={mutation.isPending}
            className="btn-primary justify-center text-sm"
          >
            {mutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Menyimpan...</span>
              </>
            ) : (
              <>
                <ShieldCheck className="h-4 w-4" />
                <span>Ganti Password</span>
              </>
            )}
          </button>
        </div>
      </form>
    </Modal>
  );
}
