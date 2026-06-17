import type { SessionUserType } from '../../../src/shared/lib/session-store.js';
import { prisma } from '../../../src/shared/lib/prisma.js';
import { getCache, PORTAL_CACHE_TTL, portalKey } from '../../../src/shared/lib/cache-store.js';
import { portalRepository } from './portal.repository.js';

export interface PortalProductItem {
  id: number;
  nama_produk: string;
  role_list: string | null;
  url_produk: string | null;
}

export interface PortalRoleItem {
  id: number;
  nama_role: string;
}

export interface PortalMenuItem {
  id: number;
  menu_name: string;
  url_name: string | null;
  main_menu_id: number;
  single_menu_flag: boolean;
  icon: string | null;
}

// Parse list id ";"-separated → array number (buang token kosong / non-numerik).
// Null/undefined safe: produk dengan role_list=null → [].
function parseIdList(raw: string | null | undefined): number[] {
  if (!raw) return [];
  return raw
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .map((s) => Number(s))
    .filter((n) => Number.isInteger(n));
}

// ---- Raw DB queries (tanpa cache) ----

async function queryProductsForUser(
  userId: string,
  userType: SessionUserType,
): Promise<PortalProductItem[]> {
  const products = await portalRepository.listActiveProducts();

  let visible = products;
  if (userType !== 'superadmin') {
    const userRoleIds = new Set(await portalRepository.getUserRoleIds(userId));
    visible = products.filter((p) =>
      parseIdList(p.roleList).some((rid) => userRoleIds.has(rid)),
    );
  }

  return visible.map((p) => ({
    id: p.id,
    nama_produk: p.namaProduk,
    role_list: p.roleList,
    url_produk: p.urlProduk,
  }));
}

async function queryProductRolesForUser(
  userId: string,
  userType: SessionUserType,
  produkId: number,
): Promise<PortalRoleItem[]> {
  const product = await prisma.mstProduk.findFirst({
    where: { id: produkId, activeFlag: true },
    select: { roleList: true },
  });
  if (!product) return [];

  const productRoleIds = parseIdList(product.roleList);
  if (productRoleIds.length === 0) return [];

  let allowedRoleIds = productRoleIds;
  if (userType !== 'superadmin') {
    const userRoleIds = new Set(await portalRepository.getUserRoleIds(userId));
    allowedRoleIds = productRoleIds.filter((rid) => userRoleIds.has(rid));
  }
  if (allowedRoleIds.length === 0) return [];

  const roles = await prisma.mstRole.findMany({
    where: { id: { in: allowedRoleIds } },
    select: { id: true, namaRole: true },
    orderBy: { namaRole: 'asc' },
  });
  return roles.map((r) => ({ id: r.id, nama_role: r.namaRole }));
}

async function queryMenusForUser(
  userId: string,
  userType: SessionUserType,
  produkId: number,
  roleId: number | null,
): Promise<PortalMenuItem[]> {
  const menus = await portalRepository.listMenusForProduct(produkId);

  let visible = menus;
  if (userType !== 'superadmin') {
    if (roleId == null) {
      visible = [];
    } else {
      const userRoleIds = new Set(await portalRepository.getUserRoleIds(userId));
      if (!userRoleIds.has(roleId)) {
        visible = [];
      } else {
        visible = menus.filter((m) => parseIdList(m.roleIdList).includes(roleId));
      }
    }
  }

  return visible.map((m) => ({
    id: m.id,
    menu_name: m.menuName,
    url_name: m.urlName,
    main_menu_id: m.mainMenuId,
    single_menu_flag: m.singleMenuFlag,
    icon: m.icon,
  }));
}

// ---- Cached wrappers ----

// Daftar produk yang boleh diakses user.
// Cache per-user (key = userId) karena visibility tergantung role user.
export async function listProductsForUser(
  userId: string,
  userType: SessionUserType,
): Promise<PortalProductItem[]> {
  return getCache(portalKey.products(userId), PORTAL_CACHE_TTL, () =>
    queryProductsForUser(userId, userType),
  );
}

// Daftar role yang bisa dipilih user saat masuk sebuah produk.
export async function listProductRolesForUser(
  userId: string,
  userType: SessionUserType,
  produkId: number,
): Promise<PortalRoleItem[]> {
  return getCache(portalKey.roles(userId, produkId), PORTAL_CACHE_TTL, () =>
    queryProductRolesForUser(userId, userType, produkId),
  );
}

// Daftar menu navigasi sebuah produk sesuai role yang sedang dipilih.
export async function listMenusForUser(
  userId: string,
  userType: SessionUserType,
  produkId: number,
  roleId: number | null,
): Promise<PortalMenuItem[]> {
  return getCache(portalKey.menus(userId, produkId, roleId), PORTAL_CACHE_TTL, () =>
    queryMenusForUser(userId, userType, produkId, roleId),
  );
}
