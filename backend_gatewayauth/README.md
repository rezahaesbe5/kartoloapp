# backend_gatewayauth

Kartolo SuperApps — **Gateway Auth** service. Authentication, RBAC, dan (di phase berikutnya) API Gateway untuk seluruh ekosistem produk Kartolo.

Stack: **Node.js 20+ · Fastify 4 · TypeScript (strict) · Prisma 5 · PostgreSQL 15+ · argon2**.

Lihat [PRD_KARTOLOAPPS.md](../PRD_KARTOLOAPPS.md) untuk konteks lengkap (Section 6, 7, 9, 10).

---

## Phase 0 — Status

Yang sudah ada:

- ✅ Bootstrap Fastify + struktur folder per developer (`reza/modules/...`) + module registry (Section 11.3).
- ✅ Response envelope 5-field + tabel `rc` lengkap + `AppError` (Section 10.2-10.3).
- ✅ Health (`/health`), readiness (`/ready` cek DB), CORS, JWT plugin, error handler global.
- ✅ Schema Prisma awal (`users`, `sessions`) di schema `gateway_auth` + seed superadmin (argon2id).
- ✅ Endpoint login basic (`POST /api/v1/auth/login`) — rate-limit per-akun + lockout 5 percobaan.
- ✅ Logger Pino + redaction otomatis untuk 4 header signature & field sensitif (Section 3.5).

Belum (Phase 1+):

- ⏳ `signatureGuard` middleware (4-header signature). Slot interceptor sudah disediakan di FE.
- ⏳ Refresh token + session table populated + Redis blacklist.
- ⏳ 2FA TOTP (Phase 2).
- ⏳ Modul `/me`, `/portal`, `/admin/*`, `/sso/*`, `/gateway/*`.

---

## Prasyarat

1. **Node.js ≥ 20**.
2. **PostgreSQL ≥ 15** running di host. Pastikan accept TCP/IP dari `127.0.0.1:5432`.
3. Database `db_kartolo` dengan user `postgres` (password sesuai `.env`).

> **WSL users:** Kalau Postgres ada di Windows host dan backend dijalankan dari WSL, pastikan:
> - Postgres listen di `0.0.0.0` (edit `postgresql.conf` → `listen_addresses = '*'`).
> - Windows Firewall membuka port 5432 dari WSL subnet (`172.x.x.0/20`).
> - Ganti `DB_HOST` di `.env` jadi `host.docker.internal` (atau gateway IP WSL hasil `ip route | grep default | awk '{print $3}'`).
> Atau jalankan backend dari Windows langsung (`npm run dev` di CMD/PowerShell).

---

## Setup pertama kali

```bash
# 1. Salin env
cp .env.example .env
# Lalu isi DATABASE_URL, JWT_SECRET, SEED_SUPERADMIN_PASSWORD

# 2. Install deps
npm install

# 3. Buat database (kalau belum ada)
#    Login ke psql sebagai superuser, lalu:
#    CREATE DATABASE db_kartolo;
#    Schema "gateway_auth" akan dibuat otomatis oleh Prisma migrate.

# 4. Generate Prisma client + jalankan migration
npm run prisma:generate
npm run prisma:migrate    # akan minta nama migration → ketik: init

# 5. Seed superadmin
npm run db:seed
# Catat email + password yang di-print
```

## Menjalankan

```bash
# Dev (hot reload via tsx watch)
npm run dev
# → http://localhost:3000

# Production build
npm run build
npm start
```

## Endpoint yang sudah ada

| Method | Path | Auth | Keterangan |
|---|---|---|---|
| GET  | `/health` | – | Liveness, return envelope `rc=00` |
| GET  | `/ready` | – | Readiness (cek koneksi DB) |
| POST | `/api/v1/auth/login` | – | Body: `{email, password, remember_me?}`. Return `access_token` + `user`. |
| POST | `/api/v1/auth/logout` | – | Stateless di MVP. |

### Contoh request login

```bash
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"superadmin@kartolo.local","password":"Superadmin#2026"}'
```

Response sukses (envelope 5-field):

```json
{
  "rc": "00",
  "status": 200,
  "message": "Login berhasil",
  "error": null,
  "data": {
    "trace_id": "req_xxx",
    "access_token": "eyJhbGciOiJIUzI1NiIs...",
    "expires_in_seconds": 900,
    "user": { "id": "...", "email": "...", "full_name": "...", "user_type": "superadmin" }
  }
}
```

Response gagal:

```json
{
  "rc": "92",
  "status": 400,
  "message": "Email atau password salah",
  "error": { "code": "INVALID_CREDENTIALS" },
  "data": { "trace_id": "req_xxx" }
}
```

---

## Struktur folder

```
backend_gatewayauth/
├── prisma/
│   ├── schema.prisma          # multi-schema: ["gateway_auth"]
│   └── seed.ts                # seed superadmin
├── src/
│   ├── server.ts              # Fastify bootstrap
│   ├── registry.ts            # central module registrar (Section 11.3)
│   └── shared/
│       ├── config/env.ts      # zod-validated env
│       ├── errors/            # response-codes + envelope + AppError + handler
│       ├── lib/prisma.ts
│       ├── plugins/           # cors, jwt
│       └── middleware/        # (future: signature, rbac, rate-limit)
└── reza/                      # developer folder (Section 11.3)
    └── modules/
        └── auth/
            ├── auth.schema.ts       # zod input
            ├── auth.repository.ts   # Prisma access
            ├── auth.service.ts      # argon2 verify + lockout
            ├── auth.controller.ts   # routes
            └── index.ts             # module manifest
```

Untuk menambah modul baru: bikin folder baru di `<dev>/modules/<nama>/` dengan struktur sama, lalu register di [src/registry.ts](src/registry.ts).
