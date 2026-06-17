import { z } from 'zod';

// Request body (application/json) untuk POST /api/v1/administration/audit/list
// — paging, search, sort, filter.
export const AuditListBodySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(100).default(10),
  // Free-text: dicari di trace_id, action, endpoint, message, ip, user_data.email, user_data.full_name.
  search: z.string().trim().max(200).optional(),
  sort_by: z.enum(['created_at', 'trace_id', 'action', 'endpoint', 'message', 'ip']).default('created_at'),
  sort_dir: z.enum(['asc', 'desc']).default('desc'),
  // Filter (kapabilitas API): action eksak + trace_id (ILIKE) + rentang tanggal created_at.
  action: z.string().trim().max(120).optional(),
  trace_id: z.string().trim().max(200).optional(),
  date_from: z.string().trim().max(40).optional(),
  date_to: z.string().trim().max(40).optional(),
});

export type AuditListBody = z.infer<typeof AuditListBodySchema>;

// Request body untuk POST /api/v1/administration/audit/detail
// — ambil 1 row penuh berdasarkan id (uuid).
export const AuditDetailBodySchema = z.object({
  id: z.string().uuid(),
});

export type AuditDetailBody = z.infer<typeof AuditDetailBodySchema>;
