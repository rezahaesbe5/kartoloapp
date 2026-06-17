import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type UserType = 'superadmin' | 'admin' | 'member';

export interface AuthUser {
  id: string;
  email: string;
  full_name: string;
  user_type: UserType;
  status: 'active' | 'inactive' | 'force_change_password' | 'blocked';
}

interface AuthState {
  user: AuthUser | null;
  accessToken: string | null;
  setSession: (user: AuthUser, accessToken: string) => void;
  clearSession: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      setSession: (user, accessToken) => set({ user, accessToken }),
      clearSession: () => set({ user: null, accessToken: null }),
    }),
    {
      name: 'kartolo.auth',
      partialize: (s) => ({ user: s.user, accessToken: s.accessToken }),
    },
  ),
);
