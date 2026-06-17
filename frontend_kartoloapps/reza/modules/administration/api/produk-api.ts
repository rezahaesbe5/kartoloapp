import { api } from '@/shared/lib/api-client';
import type { ApiEnvelope } from '@/shared/types/envelope';

export interface ProdukRow {
  id: number;
  nama_produk: string;
  url_produk: string | null;
  active_flag: boolean;
  /** role_id yang ter-mapping ke produk ini (dari mst_produk.role_list). */
  role_ids: number[];
}

export interface ProdukPagination {
  page: number;
  page_size: number;
  total: number;
  total_pages: number;
}

export interface ProdukListResult {
  items: ProdukRow[];
  pagination: ProdukPagination;
}

export type ProdukSortBy = 'nama_produk' | 'url_produk' | 'active_flag';

export interface ProdukListParams {
  page: number;
  page_size: number;
  search?: string;
  sort_by?: ProdukSortBy;
  sort_dir?: 'asc' | 'desc';
}

export interface ProdukFormPayload {
  nama_produk: string;
  url_produk: string;
  active_flag: boolean;
}

export async function getProdukList(params: ProdukListParams): Promise<ProdukListResult> {
  const res = await api.post<ApiEnvelope<ProdukListResult>>('/administration/produk/list', params);
  return {
    items: res.data.data.items,
    pagination: res.data.data.pagination,
  };
}

export async function createProduk(payload: ProdukFormPayload): Promise<{ produk: ProdukRow; message: string }> {
  const res = await api.post<ApiEnvelope<ProdukRow>>('/administration/produk/create', payload);
  return { produk: res.data.data, message: res.data.message };
}

export async function updateProduk(
  id: number,
  payload: ProdukFormPayload,
): Promise<{ produk: ProdukRow; message: string }> {
  const res = await api.post<ApiEnvelope<ProdukRow>>('/administration/produk/update', { id, ...payload });
  return { produk: res.data.data, message: res.data.message };
}

export async function deleteProduk(id: number): Promise<{ message: string }> {
  const res = await api.post<ApiEnvelope<null>>('/administration/produk/delete', { id });
  return { message: res.data.message };
}

export async function setProdukRoleMappings(
  id: number,
  roleIds: number[],
): Promise<{ message: string; role_ids: number[] }> {
  const res = await api.post<ApiEnvelope<{ produk_id: number; role_ids: number[] }>>(
    '/administration/produk/set-role-mappings',
    { id, role_ids: roleIds },
  );
  return { message: res.data.message, role_ids: res.data.data.role_ids };
}
