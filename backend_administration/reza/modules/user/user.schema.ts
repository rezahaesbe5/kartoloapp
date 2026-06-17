import { z } from 'zod';

export const UserListBodySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(100).default(10),
  search: z.string().trim().max(200).optional(),
  sort_by: z.enum(['username', 'email', 'full_name', 'status']).default('username'),
  sort_dir: z.enum(['asc', 'desc']).default('asc'),
  // Filter tipe user yang ditampilkan. Default 'admin' (perilaku menu User Admin);
  // menu User Member mengirim 'member'.
  user_type: z.enum(['admin', 'member']).default('admin'),
});

export type UserListBody = z.infer<typeof UserListBodySchema>;

export const UserCreateBodySchema = z.object({
  username: z.string().trim().min(2).max(50),
  email: z.string().email(),
  full_name: z.string().trim().min(2).max(100),
  // Tipe user yang dibuat. Default 'admin'; menu User Member mengirim 'member'.
  user_type: z.enum(['admin', 'member']).default('admin'),
});

export type UserCreateBody = z.infer<typeof UserCreateBodySchema>;

export const UserUpdateBodySchema = z.object({
  id: z.string().uuid(),
  username: z.string().trim().min(2).max(50),
  email: z.string().email(),
  full_name: z.string().trim().min(2).max(100),
});

export type UserUpdateBody = z.infer<typeof UserUpdateBodySchema>;

export const UserDeleteBodySchema = z.object({
  id: z.string().uuid(),
});

export type UserDeleteBody = z.infer<typeof UserDeleteBodySchema>;

export const UserResetPasswordBodySchema = z.object({
  id: z.string().uuid(),
});

export type UserResetPasswordBody = z.infer<typeof UserResetPasswordBodySchema>;

export const UserUpdateStatusBodySchema = z.object({
  id: z.string().uuid(),
  status: z.enum(['active', 'inactive', 'blocked']),
});

export type UserUpdateStatusBody = z.infer<typeof UserUpdateStatusBodySchema>;

export const UserResetBlockBodySchema = z.object({
  id: z.string().uuid(),
});

export type UserResetBlockBody = z.infer<typeof UserResetBlockBodySchema>;

export const UserDisableMfaBodySchema = z.object({
  id: z.string().uuid(),
});

export type UserDisableMfaBody = z.infer<typeof UserDisableMfaBodySchema>;

// Ambil daftar mapping role milik user (untuk prefill modal Mapping Role User).
export const UserRoleMappingListBodySchema = z.object({
  id: z.string().uuid(),
});

export type UserRoleMappingListBody = z.infer<typeof UserRoleMappingListBodySchema>;

// Set ulang (replace-all) mapping role user. role_ids boleh kosong (hapus semua).
export const UserSetRoleMappingsBodySchema = z.object({
  id: z.string().uuid(),
  role_ids: z.array(z.number().int().min(1)).max(200),
});

export type UserSetRoleMappingsBody = z.infer<typeof UserSetRoleMappingsBodySchema>;

export const UserDetailBodySchema = z.object({
  id: z.string().uuid(),
});

export type UserDetailBody = z.infer<typeof UserDetailBodySchema>;
