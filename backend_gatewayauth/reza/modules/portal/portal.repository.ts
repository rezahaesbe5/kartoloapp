import { prisma } from '../../../src/shared/lib/prisma.js';

export const portalRepository = {
  listActiveProducts() {
    return prisma.mstProduk.findMany({
      where: { activeFlag: true },
      orderBy: { id: 'asc' },
    });
  },

  listMenusForProduct(produkId: number) {
    return prisma.mapMenuProduk.findMany({
      where: { produkId, activeFlag: true },
      orderBy: { id: 'asc' },
    });
  },

  // Daftar role_id yang dimiliki user (many-to-many lewat map_user_role).
  async getUserRoleIds(userId: string): Promise<number[]> {
    const rows = await prisma.mapUserRole.findMany({
      where: { userId },
      select: { roleId: true },
    });
    return rows.map((r) => r.roleId);
  },
};
