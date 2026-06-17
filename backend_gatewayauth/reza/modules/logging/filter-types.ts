// Tipe filter Navicat-like — duplicated dari admin (admin = source of truth)
// supaya zod schema di gateway tidak butuh import cross-package. Daftar
// harus tetap sinkron dgn backend_administration/reza/modules/logs/filter.ts.

export const FILTER_KEYS = [
  'level',
  'message',
  'action',
  'endpoint',
  'method',
  'status',
  'trace_id',
  'source_app',
  'ip',
  'user_email',
  'raw',
] as const;
export type FilterKey = (typeof FILTER_KEYS)[number];

export const FILTER_OPS = [
  '=',
  '!=',
  'contains',
  'not_contains',
  'starts_with',
  'ends_with',
  'is_empty',
  'is_not_empty',
] as const;
export type FilterOp = (typeof FILTER_OPS)[number];
