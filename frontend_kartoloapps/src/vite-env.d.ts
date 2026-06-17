/// <reference types="vite/client" />

// Type untuk dev fallback (import.meta.env). Production baca dari window.__APP_ENV__
// (runtime, inject micro-server) — lihat shared/config/env.ts.
interface ImportMetaEnv {
  readonly VITE_API_BASE_URL: string;
  readonly VITE_APP_NAME: string;
  readonly VITE_APP_ID: string;
  readonly VITE_CLIENT_ID: string;
  readonly VITE_CLIENT_KEY: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
