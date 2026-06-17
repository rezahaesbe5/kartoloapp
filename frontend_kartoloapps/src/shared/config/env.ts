// Runtime env reader untuk FE.
//
// PENTING: nilai env TIDAK lagi di-bake ke bundle saat build.
// - Production (Docker): micro-server inject `window.__APP_ENV__` ke index.html
//   dari file .env.frontend saat container start. Ganti .env + restart container
//   = nilai baru langsung dipakai, TANPA rebuild bundle.
// - Dev (vite): `window.__APP_ENV__` tidak ada → fallback ke import.meta.env
//   (vite tetap baca .env lokal seperti biasa, HMR jalan).

interface FrontendEnv {
  apiBaseUrl: string;
  appName: string;
  appId: string;
  clientId: string;
  clientKey: string;
}

// Bentuk objek yang di-inject micro-server ke `window`. Semua opsional —
// reader di bawah yang validasi mana yang wajib.
type RuntimeEnv = Partial<Record<
  'VITE_API_BASE_URL' | 'VITE_APP_NAME' | 'VITE_APP_ID' | 'VITE_CLIENT_ID' | 'VITE_CLIENT_KEY',
  string
>>;

declare global {
  interface Window {
    __APP_ENV__?: RuntimeEnv;
  }
}

// Ambil nilai dari window.__APP_ENV__ (runtime, production) dulu; kalau kosong
// fallback ke import.meta.env (HANYA dev vite). String "undefined"/kosong = absent.
//
// Fallback di-gate `import.meta.env.DEV`: di production build konstanta ini = false,
// jadi cabang import.meta.env di-tree-shake (dead-code eliminated) → nilai VITE_*
// TIDAK ikut ter-bake ke bundle. Production murni baca window.__APP_ENV__.
function read(name: keyof RuntimeEnv): string | undefined {
  const runtime = typeof window !== 'undefined' ? window.__APP_ENV__ : undefined;
  const fromRuntime = runtime?.[name];
  if (fromRuntime && fromRuntime !== 'undefined' && fromRuntime.trim() !== '') {
    return fromRuntime;
  }
  if (import.meta.env.DEV) {
    const fromBuild = import.meta.env[name] as string | undefined;
    if (fromBuild && fromBuild.trim() !== '') return fromBuild;
  }
  return undefined;
}

function required(name: keyof RuntimeEnv): string {
  const value = read(name);
  if (!value) {
    throw new Error(`Environment variable ${name} wajib di-set di .env.frontend`);
  }
  return value;
}

export const env: FrontendEnv = {
  apiBaseUrl: required('VITE_API_BASE_URL'),
  appName: read('VITE_APP_NAME') ?? 'Kartolo SuperApps',
  // Penanda app sumber log — slug nama folder. Masuk ke field "app" tiap record log.
  appId: read('VITE_APP_ID') ?? 'frontend_kartoloapps',
  clientId: required('VITE_CLIENT_ID'),
  clientKey: required('VITE_CLIENT_KEY'),
};
