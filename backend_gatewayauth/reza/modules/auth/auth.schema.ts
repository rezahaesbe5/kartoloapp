import { z } from 'zod';

export const LoginInputSchema = z.object({
  // identifier: bisa email ATAU username.
  identifier: z.string().min(1, 'Email atau username wajib diisi').max(255),
  // password: ciphertext AES-256-CBC (base64), bukan plaintext lagi.
  password: z.string().min(1, 'Password wajib diisi').max(4096),
  remember_me: z.boolean().optional().default(false),
  captcha_id: z.string().uuid('Captcha ID tidak valid'),
  captcha_answer: z.string().min(1, 'Captcha wajib diisi').max(16),
});

export type LoginInput = z.infer<typeof LoginInputSchema>;

// ---- Profile ------------------------------------------------------------------

export const UpdateProfileSchema = z.object({
  email: z.string().min(1, 'Email wajib diisi').email('Format email tidak valid').max(255),
  full_name: z.string().min(1, 'Nama lengkap wajib diisi').max(255),
});

export type UpdateProfileInput = z.infer<typeof UpdateProfileSchema>;

// old_password & new_password = ciphertext AES; di-decrypt dulu di service.
export const ChangePasswordSchema = z.object({
  old_password: z.string().min(1, 'Password lama wajib diisi').max(4096),
  new_password: z.string().min(1, 'Password baru wajib diisi').max(4096),
});

export type ChangePasswordInput = z.infer<typeof ChangePasswordSchema>;

// ---- MFA --------------------------------------------------------------------

export const MfaCodeSchema = z.object({
  code: z.string().regex(/^\d{6}$/, 'Kode harus 6 digit angka'),
});
export type MfaCodeInput = z.infer<typeof MfaCodeSchema>;

// Verify login boleh kirim salah satu: code (TOTP) ATAU recovery_code.
// Service layer validate exact-one + format detail.
export const MfaVerifyLoginSchema = z
  .object({
    mfa_token: z.string().min(1, 'MFA token wajib diisi'),
    code: z.string().regex(/^\d{6}$/, 'Kode harus 6 digit angka').optional(),
    recovery_code: z.string().min(1).max(64).optional(),
  })
  .refine((d) => (d.code ? !d.recovery_code : !!d.recovery_code), {
    message: 'Kirim salah satu: code (TOTP) atau recovery_code.',
    path: ['code'],
  });
export type MfaVerifyLoginInput = z.infer<typeof MfaVerifyLoginSchema>;

// Aturan kekuatan password baru — divalidasi terhadap plaintext hasil decrypt.
export const NewPasswordSchema = z
  .string()
  .min(8, 'Password baru minimal 8 karakter')
  .regex(/[A-Z]/, 'Password baru harus mengandung minimal 1 huruf besar')
  .regex(/[a-z]/, 'Password baru harus mengandung minimal 1 huruf kecil')
  .regex(/[0-9]/, 'Password baru harus mengandung minimal 1 angka')
  .regex(/[^A-Za-z0-9]/, 'Password baru harus mengandung minimal 1 karakter spesial');
