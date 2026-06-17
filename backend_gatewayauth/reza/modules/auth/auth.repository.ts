import { prisma } from '../../../src/shared/lib/prisma.js';

export const authRepository = {
  findByEmail(email: string) {
    return prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  },

  // Login bisa pakai email ATAU username. Keduanya dicocokkan lowercase.
  findByEmailOrUsername(identifier: string) {
    const value = identifier.trim().toLowerCase();
    return prisma.user.findFirst({
      where: { OR: [{ email: value }, { username: value }] },
    });
  },

  findById(id: string) {
    return prisma.user.findUnique({ where: { id } });
  },

  // Cek duplikat email saat Edit Profile — kecuali user itu sendiri.
  findByEmailExcludingId(email: string, excludeId: string) {
    return prisma.user.findFirst({
      where: { email: email.toLowerCase(), NOT: { id: excludeId } },
    });
  },

  updateProfile(id: string, data: { email: string; fullName: string }) {
    return prisma.user.update({
      where: { id },
      data: { email: data.email.toLowerCase(), fullName: data.fullName },
    });
  },

  // `activate` dipakai saat user status `force_change_password` berhasil ganti
  // password → status di-reset jadi `active` supaya tidak terjebak loop force-change.
  updatePassword(id: string, passwordHash: string, activate = false) {
    return prisma.user.update({
      where: { id },
      data: { passwordHash, ...(activate ? { status: 'active' } : {}) },
    });
  },

  recordSuccessfulLogin(userId: string) {
    return prisma.user.update({
      where: { id: userId },
      data: {
        lastLoginAt: new Date(),
        failedLoginAttempts: 0,
        lockedUntil: null,
      },
    });
  },

  recordFailedLogin(userId: string, attempts: number, lockedUntil: Date | null) {
    return prisma.user.update({
      where: { id: userId },
      data: {
        failedLoginAttempts: attempts,
        lockedUntil,
      },
    });
  },
};
