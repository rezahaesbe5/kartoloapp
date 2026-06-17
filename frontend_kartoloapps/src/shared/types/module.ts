import type { ReactNode } from 'react';

export interface ModuleRoute {
  path: string;
  element: ReactNode;
  /**
   * 'protected' (default) — butuh session valid.
   * 'public-only'         — hanya untuk yang BELUM login (login, register, forgot-password). Auto redirect ke /portal kalau sudah login.
   * 'public'              — bebas (404, legal, dst).
   */
  access?: 'protected' | 'public-only' | 'public';
}

export interface ModuleManifest {
  name: string;
  owner: string;
  routes: ModuleRoute[];
}
