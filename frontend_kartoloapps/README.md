# frontend_kartoloapps

Kartolo SuperApps — **Frontend SPA** (portal + UI auth + admin nantinya).

Stack: **React 18 · Vite 5 · TypeScript (strict) · Tailwind CSS · TanStack Query · Zustand · React Hook Form + zod · React Router 6 · Axios · lucide-react**.

Lihat [PRD_KARTOLOAPPS.md](../PRD_KARTOLOAPPS.md) untuk konteks lengkap (Section 5, 7, 11).

---

## Phase 0 — Status

Yang sudah ada:

- ✅ Bootstrap Vite + struktur folder per developer (`reza/modules/...`) + module registry.
- ✅ Tailwind palette custom (Primary `#22C55E`, Soft `#BBF7D0`, Background `#F8FAFC`, Text `#0F172A`).
- ✅ Shared layer: API client (Axios) dengan envelope interceptor, auth store (Zustand persist), env validation.
- ✅ `LoginPage` lengkap — design soft & cantik, fresh & smooth, responsif mobile→desktop.
- ✅ `PortalPage` placeholder (akan diisi di Phase 3 PRD).
- ✅ Router + `ProtectedRoute`.

Belum (Phase 1+):

- ⏳ Halaman forgot/reset password, set password (link aktivasi), 2FA setup.
- ⏳ Inject 4 header signature di Axios interceptor (slot sudah ada).
- ⏳ Halaman Administration (Phase 4).

---

## Setup pertama kali

```bash
# 1. Salin env
cp .env.example .env
# Default: VITE_API_BASE_URL=http://localhost:3000/api/v1

# 2. Install deps
npm install
```

## Menjalankan

```bash
# Dev (Vite + HMR)
npm run dev
# → http://localhost:5173

# Production build + preview
npm run build
npm run preview
```

Pastikan **backend `backend_gatewayauth` running** di `http://localhost:3000` sebelum coba login. Kalau belum ada superadmin, jalankan `npm run db:seed` di backend dulu.

---

## Design system

Palette diset di [tailwind.config.ts](tailwind.config.ts):

| Token | Hex | Pemakaian |
|---|---|---|
| `primary` (DEFAULT 500) | `#22C55E` | Tombol utama, link, focus ring |
| `primary-200` / `soft` | `#BBF7D0` | Soft accent, selection |
| `surface` | `#F8FAFC` | Background page |
| `ink` | `#0F172A` | Text utama |
| `muted` | `#64748B` | Text sekunder |

Komponen utility di [src/index.css](src/index.css):

- `.glass-card` — kartu glassmorphism + shadow lembut.
- `.field` / `.field-with-icon` — input baseline dengan focus glow.
- `.btn-primary` — tombol gradient hijau + hover lift.
- `.btn-ghost` — tombol transparan.
- `.blob` — utility untuk blob decorative.

Animasi custom: `animate-fade-in`, `animate-fade-in-up`, `animate-float-slow`, `animate-pulse-soft`.

## Responsif

- **Mobile (< lg / 1024px)**: header compact gradient hijau di atas, form full width di bawah, decorative blobs lembut.
- **Desktop (≥ lg)**: split 2 kolom — kiri brand panel gradient + feature cards, kanan form glass card centered.

Diuji semantik dengan `viewport` `width=device-width, initial-scale=1.0, viewport-fit=cover`.

---

## Struktur folder

```
frontend_kartoloapps/
├── public/favicon.svg
├── index.html
├── tailwind.config.ts            # palette + animations
├── src/
│   ├── main.tsx                  # entry
│   ├── App.tsx                   # router + QueryClient
│   ├── registry.ts               # central module registrar
│   ├── index.css                 # tailwind base + utilities
│   ├── vite-env.d.ts
│   └── shared/
│       ├── config/env.ts         # validated VITE_*
│       ├── lib/api-client.ts     # Axios + ApiError + token mgmt
│       ├── lib/cn.ts             # clsx + tailwind-merge
│       ├── stores/auth-store.ts  # Zustand persist
│       ├── types/envelope.ts
│       ├── types/module.ts
│       └── components/layout/ProtectedRoute.tsx
└── reza/                         # developer folder (Section 11.3 PRD)
    └── modules/
        ├── auth/
        │   ├── api/auth-api.ts
        │   ├── hooks/useLogin.ts
        │   ├── components/   (LogoMark, InputField, PasswordField, BrandPanel)
        │   ├── pages/LoginPage.tsx
        │   └── index.tsx          # manifest
        └── portal/
            ├── pages/PortalPage.tsx
            └── index.tsx
```

Tambah modul baru: bikin `<dev>/modules/<nama>/` dengan `index.tsx` yang export `ModuleManifest`, lalu import di [src/registry.ts](src/registry.ts).
