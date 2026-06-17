import { Prisma } from '@prisma/client';
import { prisma } from '../../../src/shared/lib/prisma.js';
import {
  CACHE_TTL,
  getItemCache,
  getListCache,
  invalidateCache,
} from '../../../src/shared/lib/cache-store.js';
import type { RoleListBody } from './role.schema.js';

export interface RoleRow {
  id: number;
  nama_role: string;
}

export interface RoleDeleteResult {
  canDelete: boolean;
  reasons?: string[];
}

export interface RoleListResult {
  items: RoleRow[];
  pagination: {
    page: number;
    page_size: number;
    total: number;
    total_pages: number;
  };
}

// Query DB murni (tanpa cache) — fetcher untuk cache-aside.
async function queryRoleList(q: RoleListBody): Promise<RoleListResult> {
  const where: Prisma.MstRoleWhereInput = {};

  if (q.search) {
    where.namaRole = { contains: q.search, mode: 'insensitive' };
  }

  const offset = (q.page - 1) * q.page_size;

  const [items, total] = await Promise.all([
    prisma.mstRole.findMany({
      where,
      orderBy: { namaRole: q.sort_dir },
      skip: offset,
      take: q.page_size,
    }),
    prisma.mstRole.count({ where }),
  ]);

  return {
    items: items.map((r) => ({ id: r.id, nama_role: r.namaRole })),
    pagination: {
      page: q.page,
      page_size: q.page_size,
      total,
      total_pages: Math.max(1, Math.ceil(total / q.page_size)),
    },
  };
}

export async function listRoles(q: RoleListBody): Promise<RoleListResult> {
  return getListCache('role', q, CACHE_TTL.role.list, () => queryRoleList(q));
}

// Detail satu role (cache-aside). Return null bila tidak ditemukan.
export async function getRole(id: number): Promise<RoleRow | null> {
  return getItemCache('role', id, CACHE_TTL.role.item, async () => {
    const row = await prisma.mstRole.findUnique({ where: { id } });
    return row ? { id: row.id, nama_role: row.namaRole } : null;
  });
}

export async function createRole(namaRole: string): Promise<RoleRow> {
  const row = await prisma.mstRole.create({
    data: { namaRole },
  });
  await invalidateCache('role');
  return { id: row.id, nama_role: row.namaRole };
}

export async function updateRole(id: number, namaRole: string): Promise<RoleRow> {
  const row = await prisma.mstRole.update({
    where: { id },
    data: { namaRole },
  });
  // Nama role muncul di list user (roles[].nama_role) & products-with-roles →
  // invalidate cache user juga.
  await Promise.all([invalidateCache('role', id), invalidateCache('user')]);
  return { id: row.id, nama_role: row.namaRole };
}

/**
 * Cek apakah role bisa dihapus.
 * Role tidak boleh dihapus bila:
 * 1. Ada user yang memiliki role ini (map_user_role)
 * 2. Ada produk yang restrict role ini (mst_produk.role_list contains roleId)
 * 3. Ada menu produk yang restrict role ini (map_menu_produk.role_id_list contains roleId)
 */
export async function checkRoleCanDelete(roleId: number): Promise<RoleDeleteResult> {
  const reasons: string[] = [];

  // 1. Cek map_user_role
  const userMappingCount = await prisma.mapUserRole.count({
    where: { roleId },
  });
  if (userMappingCount > 0) {
    reasons.push(`Sudah dimapping ke ${userMappingCount} user(s)`);
  }

  // 2. Cek mst_produk.role_list (stored as semicolon-separated string)
  //    Format: "1;2;3" → role_id dipisah dengan titik koma
  const produkList = await prisma.mstProduk.findMany({
    where: { activeFlag: true },
  });
  const mappedProdukNames: string[] = [];
  for (const produk of produkList) {
    if (!produk.roleList) continue;
    const roleIds = produk.roleList.split(';').map((s) => parseInt(s.trim(), 10)).filter((n) => !isNaN(n));
    if (roleIds.includes(roleId)) {
      mappedProdukNames.push(produk.namaProduk);
    }
  }
  if (mappedProdukNames.length > 0) {
    reasons.push(`Ada di produk: ${mappedProdukNames.join(', ')}`);
  }

  // 3. Cek map_menu_produk.role_id_list (stored as semicolon-separated string)
  //    Format: "1;2;3" → role_id dipisah dengan titik koma
  const menuList = await prisma.mapMenuProduk.findMany({
    where: { activeFlag: true },
  });
  const mappedMenuNames: string[] = [];
  for (const menu of menuList) {
    if (menu.roleIdList) {
      const roleIds = menu.roleIdList.split(';').map((s) => parseInt(s.trim(), 10)).filter((n) => !isNaN(n));
      if (roleIds.includes(roleId)) {
        mappedMenuNames.push(menu.menuName);
      }
    }
  }
  if (mappedMenuNames.length > 0) {
    reasons.push(`Ada di menu: ${mappedMenuNames.join(', ')}`);
  }

  return {
    canDelete: reasons.length === 0,
    reasons: reasons.length > 0 ? reasons : undefined,
  };
}

export async function deleteRole(id: number): Promise<void> {
  // Pre-check: cek apakah role masih digunakan
  const check = await checkRoleCanDelete(id);
  if (!check.canDelete) {
    throw new Error(`ROLE_IN_USE: ${check.reasons?.join('; ')}`);
  }

  await prisma.mstRole.delete({ where: { id } });
  await Promise.all([invalidateCache('role', id), invalidateCache('user')]);
}
