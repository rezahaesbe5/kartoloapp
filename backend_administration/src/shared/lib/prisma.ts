import { PrismaClient } from '@prisma/client';

declare global {
  // eslint-disable-next-line no-var
  var __prisma_admin: PrismaClient | undefined;
}

export const prisma =
  globalThis.__prisma_admin ??
  new PrismaClient({
    log: ['error', 'warn'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalThis.__prisma_admin = prisma;
}
