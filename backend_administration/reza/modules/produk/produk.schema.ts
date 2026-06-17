import { z } from 'zod';

export const ProdukListBodySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(100).default(10),
  search: z.string().trim().max(200).optional(),
  sort_by: z.enum(['nama_produk', 'url_produk', 'active_flag']).default('nama_produk'),
  sort_dir: z.enum(['asc', 'desc']).default('asc'),
});

export type ProdukListBody = z.infer<typeof ProdukListBodySchema>;

// url_produk: huruf/angka/dash/underscore, lowercase. Dipakai sebagai segmen URL
// produk (routing side menu), jadi tidak boleh ada spasi/karakter aneh.
const urlProdukSchema = z
  .string()
  .trim()
  .min(2, 'URL Produk minimal 2 karakter.')
  .max(50)
  .regex(/^[a-z0-9][a-z0-9_-]*$/, 'URL Produk hanya boleh huruf kecil, angka, dash, dan underscore.');

export const ProdukCreateBodySchema = z.object({
  nama_produk: z.string().trim().min(2).max(100),
  url_produk: urlProdukSchema,
  active_flag: z.boolean().default(true),
});

export type ProdukCreateBody = z.infer<typeof ProdukCreateBodySchema>;

export const ProdukUpdateBodySchema = z.object({
  id: z.number().int().min(1),
  nama_produk: z.string().trim().min(2).max(100),
  url_produk: urlProdukSchema,
  active_flag: z.boolean(),
});

export type ProdukUpdateBody = z.infer<typeof ProdukUpdateBodySchema>;

export const ProdukDeleteBodySchema = z.object({
  id: z.number().int().min(1),
});

export type ProdukDeleteBody = z.infer<typeof ProdukDeleteBodySchema>;

export const ProdukSetRoleMappingsBodySchema = z.object({
  id: z.number().int().min(1),
  role_ids: z.array(z.number().int().min(1)).default([]),
});

export type ProdukSetRoleMappingsBody = z.infer<typeof ProdukSetRoleMappingsBodySchema>;

export const ProdukDetailBodySchema = z.object({
  id: z.number().int().min(1),
});

export type ProdukDetailBody = z.infer<typeof ProdukDetailBodySchema>;
