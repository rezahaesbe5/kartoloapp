import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation } from '@tanstack/react-query';
import { Mail, UserCircle, Loader2, AlertCircle, Save, Pencil } from 'lucide-react';
import { Modal } from '@/shared/components/Modal';
import { ApiError } from '@/shared/lib/api-client';
import { InputField } from '@modules/auth/components/InputField';
import { updateProfile, type ProfileDetail } from '../api/profile-api';

const schema = z.object({
  email: z.string().min(1, 'Email wajib diisi').email('Format email tidak valid'),
  full_name: z.string().min(1, 'Nama lengkap wajib diisi'),
});
type FormValues = z.infer<typeof schema>;

interface EditProfileModalProps {
  open: boolean;
  onClose: () => void;
  profile: ProfileDetail;
  onSuccess: (updated: ProfileDetail) => void;
}

function fieldFromError(err: unknown): string | undefined {
  if (err instanceof ApiError && typeof err.error?.details?.field === 'string') {
    return err.error.details.field;
  }
  return undefined;
}

export function EditProfileModal({ open, onClose, profile, onSuccess }: EditProfileModalProps) {
  const {
    register,
    handleSubmit,
    reset,
    setError,
    clearErrors,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: profile.email, full_name: profile.full_name },
  });

  // Sinkronkan form dengan data profil setiap kali modal dibuka.
  useEffect(() => {
    if (open) reset({ email: profile.email, full_name: profile.full_name });
  }, [open, profile, reset]);

  const mutation = useMutation({
    mutationFn: updateProfile,
    onSuccess: (updated) => {
      onSuccess(updated);
      onClose();
    },
    onError: (err) => {
      const field = fieldFromError(err);
      const message = err instanceof ApiError ? err.message : 'Terjadi kesalahan. Coba lagi.';
      if (field === 'email' || field === 'full_name') {
        setError(field, { message });
      } else {
        setError('root', { message });
      }
    },
  });

  const onSubmit = (values: FormValues) => {
    clearErrors('root');
    mutation.mutate({ email: values.email.trim(), full_name: values.full_name.trim() });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Edit Profile"
      description="Perbarui email dan nama lengkap Anda."
      icon={<Pencil className="h-5 w-5" />}
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

        <InputField
          label="Email"
          type="email"
          autoComplete="email"
          placeholder="nama@perusahaan.com"
          leftIcon={<Mail className="h-4 w-4" />}
          error={errors.email?.message}
          {...register('email')}
        />

        <InputField
          label="Nama Lengkap"
          type="text"
          autoComplete="name"
          placeholder="Nama lengkap Anda"
          leftIcon={<UserCircle className="h-4 w-4" />}
          error={errors.full_name?.message}
          {...register('full_name')}
        />

        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 pt-1">
          <button type="button" onClick={onClose} className="btn-ghost justify-center text-sm">
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
                <Save className="h-4 w-4" />
                <span>Simpan</span>
              </>
            )}
          </button>
        </div>
      </form>
    </Modal>
  );
}
