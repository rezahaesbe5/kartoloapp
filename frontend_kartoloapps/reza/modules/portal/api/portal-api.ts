import { api } from '@/shared/lib/api-client';
import type { ApiEnvelope } from '@/shared/types/envelope';

export interface PortalProduct {
  id: number;
  nama_produk: string;
  role_list: string | null;
  url_produk: string | null;
}

export interface PortalRole {
  id: number;
  nama_role: string;
}

export interface ProductMenu {
  id: number;
  menu_name: string;
  url_name: string | null;
  main_menu_id: number;
  single_menu_flag: boolean;
  icon: string | null;
}

export async function getProducts(): Promise<PortalProduct[]> {
  const res = await api.get<ApiEnvelope<{ products: PortalProduct[] }>>('/portal/products');
  return res.data.data.products;
}

/** Daftar role yang bisa dipilih user saat masuk sebuah produk (role picker). */
export async function getProductRoles(produkId: number): Promise<PortalRole[]> {
  const res = await api.get<ApiEnvelope<{ roles: PortalRole[] }>>('/portal/roles', {
    params: { produk_id: produkId },
  });
  return res.data.data.roles;
}

/**
 * Daftar menu produk untuk role yang sedang dipilih. roleId opsional —
 * superadmin tidak perlu role (backend bypass).
 */
export async function getProductMenus(produkId: number, roleId?: number | null): Promise<ProductMenu[]> {
  const res = await api.get<ApiEnvelope<{ menus: ProductMenu[] }>>('/portal/menus', {
    params: { produk_id: produkId, ...(roleId != null ? { role_id: roleId } : {}) },
  });
  return res.data.data.menus;
}
