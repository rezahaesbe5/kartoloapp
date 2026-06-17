import { z } from 'zod';

export const RoleListBodySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(100).default(10),
  search: z.string().trim().max(200).optional(),
  sort_by: z.enum(['nama_role']).default('nama_role'),
  sort_dir: z.enum(['asc', 'desc']).default('desc'),
});

export type RoleListBody = z.infer<typeof RoleListBodySchema>;

export const RoleCreateBodySchema = z.object({
  nama_role: z.string().trim().min(2).max(50),
});

export type RoleCreateBody = z.infer<typeof RoleCreateBodySchema>;

export const RoleUpdateBodySchema = z.object({
  id: z.number().int().min(1),
  nama_role: z.string().trim().min(2).max(50),
});

export type RoleUpdateBody = z.infer<typeof RoleUpdateBodySchema>;

export const RoleDeleteBodySchema = z.object({
  id: z.number().int().min(1),
});

export type RoleDeleteBody = z.infer<typeof RoleDeleteBodySchema>;

export const RoleDetailBodySchema = z.object({
  id: z.number().int().min(1),
});

export type RoleDetailBody = z.infer<typeof RoleDetailBodySchema>;
