import { api } from '@/shared/lib/api-client';
import type { ApiEnvelope } from '@/shared/types/envelope';

export interface UserRoleItem {
  id: number;
  nama_role: string;
}

export interface UserRow {
  id: string;
  username: string | null;
  email: string;
  full_name: string;
  status: string;
  user_type: string;
  roles: UserRoleItem[];
  email_verified_at: string | null;
  last_login_at: string | null;
  failed_login_attempts: number;
  locked_until: string | null;
  two_factor_enabled: boolean;
  two_factor_enrolled_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface UserPagination {
  page: number;
  page_size: number;
  total: number;
  total_pages: number;
}

export interface UserListResult {
  items: UserRow[];
  pagination: UserPagination;
}

export type UserTypeFilter = 'admin' | 'member';

export interface UserListParams {
  page: number;
  page_size: number;
  search?: string;
  sort_by?: 'username' | 'email' | 'full_name' | 'status';
  sort_dir?: 'asc' | 'desc';
  /** Tipe user yang difilter. Default backend 'admin'; menu member kirim 'member'. */
  user_type?: UserTypeFilter;
}

export interface UserCreateParams {
  username: string;
  email: string;
  full_name: string;
  /** Tipe user yang dibuat. Default backend 'admin'; menu member kirim 'member'. */
  user_type?: UserTypeFilter;
}

export interface UserCreateResult {
  user: UserRow;
  plainPassword: string;
}

export interface UserUpdateParams {
  id: string;
  username: string;
  email: string;
  full_name: string;
}

export async function getUsers(params: UserListParams): Promise<UserListResult> {
  const res = await api.post<ApiEnvelope<UserListResult>>('/administration/user/list', params);
  return {
    items: res.data.data.items,
    pagination: res.data.data.pagination,
  };
}

export async function createUser(params: UserCreateParams): Promise<UserCreateResult & { message: string }> {
  const res = await api.post<ApiEnvelope<UserCreateResult>>('/administration/user/create', params);
  return {
    user: res.data.data.user,
    plainPassword: res.data.data.plainPassword,
    message: res.data.message,
  };
}

export async function updateUser(params: UserUpdateParams): Promise<{ user: UserRow; message: string }> {
  const res = await api.post<ApiEnvelope<UserRow>>('/administration/user/update', params);
  return { user: res.data.data, message: res.data.message };
}

export async function deleteUser(id: string): Promise<{ message: string }> {
  const res = await api.post<ApiEnvelope<null>>('/administration/user/delete', { id });
  return { message: res.data.message };
}

export type UserStatus = 'active' | 'inactive' | 'blocked';

export interface ResetPasswordResult {
  password: string;
}

/** Reset password user (status harus active) → password sementara baru. */
export async function resetUserPassword(id: string): Promise<ResetPasswordResult & { message: string }> {
  const res = await api.post<ApiEnvelope<ResetPasswordResult>>(
    '/administration/user/reset-password',
    { id },
  );
  return { password: res.data.data.password, message: res.data.message };
}

/** Ubah status user (active/inactive/blocked) + reset kunci login. */
export async function updateUserStatus(id: string, status: UserStatus): Promise<{ message: string }> {
  const res = await api.post<ApiEnvelope<{ id: string; status: UserStatus }>>(
    '/administration/user/update-status',
    { id, status },
  );
  return { message: res.data.message };
}

/** Lepas blokir sementara (reset failed attempts & locked_until). */
export async function resetUserBlock(id: string): Promise<{ message: string }> {
  const res = await api.post<ApiEnvelope<{ id: string }>>('/administration/user/reset-block', { id });
  return { message: res.data.message };
}

/** Revoke semua sesi aktif user (Postgres + Redis) lewat endpoint gateway. */
export async function logoutAllDevices(userId: string): Promise<{ message: string }> {
  const res = await api.post<ApiEnvelope<unknown>>(`/auth/admin/sessions/${userId}/revoke`, {});
  return { message: res.data.message };
}

/** Nonaktifkan MFA user (admin override): clear secret/enrolled_at/flag + hapus recovery codes. */
export async function disableUserMfa(id: string): Promise<{ message: string }> {
  const res = await api.post<ApiEnvelope<{ id: string }>>('/administration/user/disable-mfa', { id });
  return { message: res.data.message };
}

// ---- Mapping Role User -------------------------------------------------------

export interface ProductWithRoles {
  id: number;
  nama_produk: string;
  url_produk: string | null;
  roles: UserRoleItem[];
}

/** Daftar produk aktif + role di role_list-nya (untuk dropdown modal mapping role). */
export async function getProductsWithRoles(): Promise<ProductWithRoles[]> {
  const res = await api.post<ApiEnvelope<{ products: ProductWithRoles[] }>>(
    '/administration/user/products-with-roles',
    {},
  );
  return res.data.data.products;
}

/** Daftar role_id yang saat ini dimapping ke user (prefill modal). */
export async function getUserRoleMappings(id: string): Promise<number[]> {
  const res = await api.post<ApiEnvelope<{ user_id: string; role_ids: number[] }>>(
    '/administration/user/role-mappings',
    { id },
  );
  return res.data.data.role_ids;
}

/** Replace-all mapping role user. */
export async function setUserRoleMappings(
  id: string,
  roleIds: number[],
): Promise<{ message: string; role_ids: number[] }> {
  const res = await api.post<ApiEnvelope<{ user_id: string; role_ids: number[] }>>(
    '/administration/user/set-role-mappings',
    { id, role_ids: roleIds },
  );
  return { message: res.data.message, role_ids: res.data.data.role_ids };
}
