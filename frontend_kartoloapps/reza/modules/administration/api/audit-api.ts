import { api } from '@/shared/lib/api-client';
import type { ApiEnvelope } from '@/shared/types/envelope';

export interface AuditLogRow {
  id: string;
  trace_id: string | null;
  source_app: string | null;
  user_id: string | null;
  client_id: string | null;
  action: string;
  endpoint: string | null;
  method: string | null;
  message: string | null;
  ip: string | null;
  user_agent: string | null;
  user_data: Record<string, unknown> | null;
  created_at: string;
}

export interface AuditPagination {
  page: number;
  page_size: number;
  total: number;
  total_pages: number;
}

export interface AuditListResult {
  items: AuditLogRow[];
  pagination: AuditPagination;
}

export type AuditSortBy = 'created_at' | 'trace_id' | 'action' | 'endpoint' | 'message' | 'ip';
export type AuditSortDir = 'asc' | 'desc';

export interface AuditListParams {
  page: number;
  page_size: number;
  search?: string;
  sort_by: AuditSortBy;
  sort_dir: AuditSortDir;
  // Filter (kapabilitas backend): action eksak, trace_id ILIKE, rentang tanggal created_at.
  action?: string;
  trace_id?: string;
  date_from?: string; // YYYY-MM-DD
  date_to?: string;   // YYYY-MM-DD
}

// POST /administration/audit/list — parameter dikirim sebagai request body JSON;
// diteruskan gateway ke backend_administration.
export async function getAuditLogList(params: AuditListParams): Promise<AuditListResult> {
  const res = await api.post<ApiEnvelope<AuditListResult>>(
    '/administration/audit/list',
    params,
  );
  return {
    items: res.data.data.items,
    pagination: res.data.data.pagination,
  };
}

// Detail 1 row audit log (14 kolom — termasuk request/response body) untuk modal detail.
export interface AuditLogDetail extends AuditLogRow {
  request_header: Record<string, unknown> | null;
  request_body: unknown;
  response_body: unknown;
}

// POST /administration/audit/detail — body { id }; diteruskan gateway ke backend_administration.
export async function getAuditLogDetail(id: string): Promise<AuditLogDetail> {
  const res = await api.post<ApiEnvelope<AuditLogDetail>>(
    '/administration/audit/detail',
    { id },
  );
  return res.data.data;
}
