import { Prisma } from '@prisma/client';
import { AppError } from '../../../src/shared/errors/app-error.js';
import { prisma } from '../../../src/shared/lib/prisma.js';
import {
  CACHE_TTL,
  getItemCache,
  getListCache,
  invalidateCache,
} from '../../../src/shared/lib/cache-store.js';
import type { ProdukListBody } from './produk.schema.js';

export interface ProdukRow {
  id: number;
  nama_produk: string;
  url_produk: string | null;
  active_flag: boolean;
  role_ids: number[];
}

export interface ProdukListResult {
  items: ProdukRow[];
  pagination: {
    page: number;
    page_size: number;
    total: number;
    total_pages: number;
  };
}

// Parse role_list (";"-separated) → array number. Null-safe.
function parseRoleList(raw: string | null): number[] {
  if (!raw) return [];
  return raw
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .map((s) => Number(s))
    .filter((n) => Number.isInteger(n));
}

const sortColumnMap: Record<string, keyof Prisma.MstProdukOrderByWithRelationInput> = {
  nama_produk: 'namaProduk',
  url_produk: 'urlProduk',
  active_flag: 'activeFlag',
};

// Query DB murni (tanpa cache) — dipakai sebagai fetcher cache-aside.
async function queryProdukList(q: ProdukListBody): Promise<ProdukListResult> {
  const where: Prisma.MstProdukWhereInput = {};

  if (q.search) {
    where.OR = [
      { namaProduk: { contains: q.search, mode: 'insensitive' } },
      { urlProduk: { contains: q.search, mode: 'insensitive' } },
    ];
  }

  const offset = (q.page - 1) * q.page_size;
  const orderByCol = sortColumnMap[q.sort_by] ?? 'namaProduk';

  const [items, total] = await Promise.all([
    prisma.mstProduk.findMany({
      where,
      orderBy: { [orderByCol]: q.sort_dir },
      skip: offset,
      take: q.page_size,
    }),
    prisma.mstProduk.count({ where }),
  ]);

  return {
    items: items.map((p) => ({
      id: p.id,
      nama_produk: p.namaProduk,
      url_produk: p.urlProduk,
      active_flag: p.activeFlag,
      role_ids: parseRoleList(p.roleList),
    })),
    pagination: {
      page: q.page,
      page_size: q.page_size,
      total,
      total_pages: Math.max(1, Math.ceil(total / q.page_size)),
    },
  };
}

export async function listProduk(q: ProdukListBody): Promise<ProdukListResult> {
  return getListCache('produk', q, CACHE_TTL.produk.list, () => queryProdukList(q));
}

// Detail satu produk (cache-aside). Return null bila tidak ditemukan.
export async function getProduk(id: number): Promise<ProdukRow | null> {
  return getItemCache('produk', id, CACHE_TTL.produk.item, async () => {
    const row = await prisma.mstProduk.findUnique({ where: { id } });
    return row ? toProdukRow(row) : null;
  });
}

// Cek url_produk unik (case-insensitive). excludeId untuk update (exclude diri sendiri).
async function assertUrlUnique(urlProduk: string, excludeId?: number): Promise<void> {
  const existing = await prisma.mstProduk.findFirst({
    where: {
      urlProduk: { equals: urlProduk, mode: 'insensitive' },
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: { id: true },
  });
  if (existing) {
    throw new AppError('body_invalid', {
      message: `URL Produk "${urlProduk}" sudah digunakan oleh produk lain.`,
      code: 'PRODUK_DUPLICATE',
    });
  }
}

function toProdukRow(p: {
  id: number;
  namaProduk: string;
  urlProduk: string | null;
  activeFlag: boolean;
  roleList: string | null;
}): ProdukRow {
  return {
    id: p.id,
    nama_produk: p.namaProduk,
    url_produk: p.urlProduk,
    active_flag: p.activeFlag,
    role_ids: parseRoleList(p.roleList),
  };
}

export async function createProduk(
  namaProduk: string,
  urlProduk: string,
  activeFlag: boolean,
): Promise<ProdukRow> {
  await assertUrlUnique(urlProduk);
  // role_list null saat baru dibuat — mapping role dilakukan terpisah.
  const row = await prisma.mstProduk.create({
    data: {
      namaProduk,
      urlProduk,
      activeFlag,
      roleList: null,
    },
  });
  await invalidateCache('produk');
  return toProdukRow(row);
}

export async function updateProduk(
  id: number,
  namaProduk: string,
  urlProduk: string,
  activeFlag: boolean,
): Promise<ProdukRow> {
  const existing = await prisma.mstProduk.findUnique({ where: { id }, select: { id: true } });
  if (!existing) {
    throw new AppError('not_found', { message: 'Produk tidak ditemukan.', code: 'PRODUK_NOT_FOUND' });
  }
  await assertUrlUnique(urlProduk, id);
  const row = await prisma.mstProduk.update({
    where: { id },
    data: { namaProduk, urlProduk, activeFlag },
  });
  await invalidateCache('produk', id);
  return toProdukRow(row);
}

/**
 * Hapus produk. Tidak boleh dihapus bila masih ada menu yang ter-mapping ke
 * produk ini (map_menu_produk.produk_id).
 */
export async function deleteProduk(id: number): Promise<void> {
  const produk = await prisma.mstProduk.findUnique({ where: { id }, select: { id: true, namaProduk: true } });
  if (!produk) {
    throw new AppError('not_found', { message: 'Produk tidak ditemukan.', code: 'PRODUK_NOT_FOUND' });
  }

  const menuCount = await prisma.mapMenuProduk.count({ where: { produkId: id } });
  if (menuCount > 0) {
    throw new AppError('db_error', {
      message: `Produk "${produk.namaProduk}" tidak bisa dihapus karena masih dipakai oleh ${menuCount} menu.`,
      code: 'PRODUK_IN_USE',
    });
  }

  await prisma.mstProduk.delete({ where: { id } });
  await invalidateCache('produk', id);
}

/**
 * Replace-all mapping role produk: simpan daftar role_id ke mst_produk.role_list
 * (";"-separated). Validasi semua role_id benar-benar ada di mst_role.
 * role_ids kosong → role_list di-set null (produk tanpa batasan role).
 */
export async function setProdukRoleMappings(
  id: number,
  roleIds: number[],
): Promise<{ produk_id: number; role_ids: number[] }> {
  const produk = await prisma.mstProduk.findUnique({ where: { id }, select: { id: true } });
  if (!produk) {
    throw new AppError('not_found', { message: 'Produk tidak ditemukan.', code: 'PRODUK_NOT_FOUND' });
  }

  const uniqueIds = [...new Set(roleIds)];

  if (uniqueIds.length > 0) {
    const existing = await prisma.mstRole.findMany({
      where: { id: { in: uniqueIds } },
      select: { id: true },
    });
    if (existing.length !== uniqueIds.length) {
      throw new AppError('body_invalid', {
        message: 'Sebagian role tidak ditemukan atau sudah dihapus.',
        code: 'ROLE_NOT_FOUND',
      });
    }
  }

  const sorted = uniqueIds.sort((a, b) => a - b);
  await prisma.mstProduk.update({
    where: { id },
    data: { roleList: sorted.length > 0 ? sorted.join(';') : null },
  });
  // Mapping role mengubah role_list produk → invalidate cache produk.
  // Sekaligus invalidate user (products-with-roles ikut berubah).
  await Promise.all([invalidateCache('produk', id), invalidateCache('user')]);

  return { produk_id: id, role_ids: sorted };
}
