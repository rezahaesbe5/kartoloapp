import { create } from 'zustand';

/**
 * Role yang sedang dipilih user di dalam sebuah produk.
 *
 * Sengaja TIDAK di-persist: selected role hanya hidup selama user berada di
 * dalam menu-menu produk. Begitu user keluar produk (mis. balik ke /portal
 * atau /pengaturan), selected role dibersihkan (lihat ProductShell unmount).
 * Pengecualian superadmin ditangani di ProductShell (bypass role picker).
 *
 * `productUrl` menandai untuk produk mana role ini berlaku — supaya pindah
 * antar produk tidak salah pakai role dari produk sebelumnya.
 */
export interface SelectedRole {
  id: number;
  nama_role: string;
}

interface ProductRoleState {
  productUrl: string | null;
  role: SelectedRole | null;
  setSelectedRole: (productUrl: string, role: SelectedRole) => void;
  clearSelectedRole: () => void;
}

export const useProductRoleStore = create<ProductRoleState>((set) => ({
  productUrl: null,
  role: null,
  setSelectedRole: (productUrl, role) => set({ productUrl, role }),
  clearSelectedRole: () => set({ productUrl: null, role: null }),
}));
