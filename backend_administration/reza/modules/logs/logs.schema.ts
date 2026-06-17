// Zod schema untuk modul logs di admin. Dipakai juga sebagai shared type
// frontend lewat exported TypeScript (dibungkus DTO).

import { z } from 'zod';
import { FILTER_KEYS, FILTER_OPS } from './filter.js';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const SourceAppEnum = z.enum([
  'backend_gatewayauth',
  'backend_administration',
  'frontend_kartoloapps',
]);

export const FilterRowSchema = z.object({
  key: z.enum(FILTER_KEYS as readonly [string, ...string[]]),
  op: z.enum(FILTER_OPS as readonly [string, ...string[]]),
  value: z.string().max(500).default(''),
  connector: z.enum(['AND', 'OR']).optional(),
});

export const AccessBodySchema = z.object({
  source_app: SourceAppEnum,
  date: z.string().regex(DATE_RE),
});
export type AccessBody = z.infer<typeof AccessBodySchema>;

export const SearchBodySchema = z.object({
  source_app: SourceAppEnum,
  date: z.string().regex(DATE_RE),
  filters: z.array(FilterRowSchema).max(20).default([]),
  limit: z.number().int().min(1).max(1000).default(200),
});
export type SearchBody = z.infer<typeof SearchBodySchema>;
