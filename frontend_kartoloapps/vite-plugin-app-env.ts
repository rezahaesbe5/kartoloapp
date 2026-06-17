/**
 * vite-plugin-app-env.ts
 * ======================
 * Mengelola placeholder `__APP_ENV_JSON__` di index.html:
 *
 *   <script>window.__APP_ENV__ = __APP_ENV_JSON__;</script>
 *
 * - DEV (vite serve)  : placeholder diganti `{}` → window.__APP_ENV__ kosong →
 *   FE fallback ke import.meta.env (vite baca .env lokal, HMR jalan). Cara dev
 *   TIDAK berubah sama sekali.
 *
 * - BUILD (vite build): placeholder DIBIARKAN apa adanya di dist/index.html.
 *   Micro-server (server.mjs) yang MENGGANTI `__APP_ENV_JSON__` dengan JSON dari
 *   .env.frontend SAAT CONTAINER START. Ganti .env.frontend + restart container
 *   = nilai baru langsung aktif, TANPA rebuild bundle JS.
 */

import type { Plugin } from 'vite';

export default function appEnvPlugin(): Plugin {
  let isBuild = false;

  return {
    name: 'vite-plugin-app-env',

    config(_config, { command }) {
      isBuild = command === 'build';
    },

    transformIndexHtml(html) {
      // Build: biarkan placeholder untuk diganti micro-server saat runtime.
      if (isBuild) return html;
      // Dev: window.__APP_ENV__ = {} → FE fallback ke import.meta.env.
      return html.replace('__APP_ENV_JSON__', '{}');
    },
  };
}
