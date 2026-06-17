import { api } from '@/shared/lib/api-client';
import type { ApiEnvelope } from '@/shared/types/envelope';

export interface RoleRow {
  id: number;
  nama_role: string;
}

export interface RolePagination {
  page: number;
  page_size: number;
  total: number;
  total_pages: number;
}

export interface RoleListResult {
  items: RoleRow[];
  pagination: RolePagination;
}

export interface RoleListParams {
  page: number;
  page_size: number;
  search?: string;
  sort_by?: 'nama_role';
  sort_dir?: 'asc' | 'desc';
}

export async function getRoleList(params: RoleListParams): Promise<RoleListResult> {
  const res = await api.post<ApiEnvelope<RoleListResult>>('/administration/role/list', params);
  return {
    items: res.data.data.items,
    pagination: res.data.data.pagination,
  };
}

export async function createRole(namaRole: string): Promise<{ role: RoleRow; message: string }> {
  const res = await api.post<ApiEnvelope<RoleRow>>('/administration/role/create', { nama_role: namaRole });
  return { role: res.data.data, message: res.data.message };
}

export async function updateRole(id: number, namaRole: string): Promise<{ role: RoleRow; message: string }> {
  const res = await api.post<ApiEnvelope<RoleRow>>('/administration/role/update', { id, nama_role: namaRole });
  return { role: res.data.data, message: res.data.message };
}

export async function deleteRole(id: number): Promise<{ message: string }> {
  const res = await api.post<ApiEnvelope<null>>('/administration/role/delete', { id });
  return { message: res.data.message };
}
