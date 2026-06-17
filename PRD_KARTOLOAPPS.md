# Product Requirement Document (PRD)
## Kartolo SuperApps — Portal & Authentication Gateway

| Field | Value |
|---|---|
| **Project Name** | Kartolo SuperApps |
| **Document Version** | 1.0.0 |
| **Status** | Draft — Ready for Development |
| **Posisi dalam Ekosistem** | Base platform (parent) untuk semua produk aplikasi Kartolo, termasuk Bot Trading AI (lihat [PRD.md](PRD.md)) |
| **Target Market** | Internal organisasi (B2B/intra-company), bisa diperluas ke multi-tenant di masa depan |
| **Last Updated** | 2026-05-17 |

---

## 0. Hubungan dengan Dokumen Lain

- **[PRD.md](PRD.md)** — Bot Trading AI. Akan menjadi salah satu *sub-product* yang ter-register dan diakses lewat Kartolo SuperApps portal setelah Kartolo selesai.
- **Urutan pengerjaan:** Kartolo SuperApps (dokumen ini) **dulu**, baru Bot Trading AI.
- **Prinsip integrasi:** Kartolo bertindak sebagai **authentication gateway + product launcher**. Bot Trading AI (dan produk lain) trust JWT yang di-issue oleh Kartolo Gateway Auth.

---

## 1. Executive Summary

**Kartolo SuperApps** adalah platform portal terpusat berbasis web yang berfungsi sebagai **single entry point** untuk seluruh ekosistem produk digital organisasi. Saat user membuka URL Kartolo, mereka diarahkan ke halaman login. Setelah berhasil login, user masuk ke halaman portal yang menampilkan daftar produk aplikasi yang bisa mereka akses, berdasarkan kombinasi **User Type**, **User Role**, dan **User Unit**.

Aplikasi terdiri dari:
- **Frontend SPA** (`frontend_kartoloapps`) — React + Vite + TypeScript
- **Backend Gateway Auth** (`backend_gatewayauth`) — Node.js + Fastify + TypeScript, handle autentikasi, otorisasi, manajemen user, dan SSO untuk sub-app
- **PostgreSQL** dengan schema `gateway_auth` untuk semua tabel terkait auth/portal
- **Redis** untuk session cache, rate limiting, dan revoked token list

Kartolo SuperApps dirancang sebagai **base platform** yang siap menampung produk baru tanpa mengubah core. Produk baru cukup didaftarkan via Administration, lalu otomatis muncul di portal sesuai permission.

---

## 2. Project Goals & Non-Goals

### 2.1 Goals (Yang DIBANGUN)

- Halaman login terpusat sebagai gerbang seluruh ekosistem Kartolo.
- Portal pasca-login yang menampilkan **product cards** berdasarkan permission user.
- Sistem RBAC tiga lapis: **User Type** (level akses), **User Role** (fungsi), **User Unit** (organisasi).
- Modul **Administration** yang otomatis muncul untuk User Type Superadmin (1) dan Admin (2), berisi: user management, role management, unit management, product registration, audit log viewer.
- **SSO mechanism** — JWT yang di-issue Kartolo bisa di-verify oleh sub-app (Bot Trading AI, dst).
- Multi-developer collaboration pattern: setiap developer punya **folder ownership** sendiri di dalam app, dengan kemampuan integrasi antar folder.
- Audit trail untuk semua action sensitif.

### 2.2 Non-Goals (Yang TIDAK DIBANGUN di MVP)

- **BUKAN business logic engine.** Kartolo tidak meng-handle logic bisnis produk (trading, finance, dll). Cuma launcher + auth.
- **BUKAN replacement IAM enterprise** (Keycloak, Auth0, Okta). MVP cukup untuk skala internal organisasi.
- **BUKAN marketplace produk.** Produk hanya bisa didaftarkan oleh Superadmin via Administration, tidak self-service.
- **BUKAN multi-tenant** di MVP. Asumsi: satu instance Kartolo = satu organisasi. Multi-tenant bisa ditambahkan di v2.
- **BUKAN mobile native.** Web responsive, tapi native iOS/Android di luar scope MVP.
- **Tidak ada social login (Google/Microsoft OAuth)** di MVP. Hanya email + password + 2FA.

---

## 3. Critical Safety & Compliance Rules

**Aturan-aturan ini WAJIB diikuti di seluruh codebase. Pelanggaran = blocking issue.**

### 3.1 Kredensial & Secret

- Password user WAJIB di-hash dengan **`argon2id`** (parameter: memoryCost ≥ 19MiB, timeCost ≥ 2, parallelism ≥ 1). **NEVER** simpan plaintext.
- API token (untuk sub-app atau machine-to-machine) di-hash dengan **`bcrypt` cost 12+** sebelum simpan.
- JWT signing key:
  - **Development:** dari `.env` (HMAC HS256 cukup).
  - **Production:** asymmetric **RS256** atau **ES256**, private key di KMS/Vault. Public key di-distribute ke sub-app untuk verify.
- Semua secret di `.env`, jangan pernah di-commit. `.env.example` boleh di-commit (tanpa nilai asli).
- Cookie autentikasi: `httpOnly`, `Secure`, `SameSite=Strict` (atau `Lax` untuk SSO redirect flow).

### 3.2 Audit Trail — Mandatory

Setiap action sensitif WAJIB di-log ke tabel `gateway_auth.audit_logs`:
- Login (success & failed), logout, password change, password reset, 2FA enable/disable/reset.
- User CRUD (create, update, deactivate, delete).
- Role CRUD, Unit CRUD, Product CRUD.
- Permission assignment (assign/revoke role, assign user ke unit).
- Product access permission changes.
- API token create/revoke.
- SSO token issuance ke sub-app.

Log retention: minimum **1 tahun**. Tidak boleh di-purge tanpa approval Superadmin (dengan audit log tersendiri).

### 3.3 Authorization Enforcement

- **Setiap endpoint** (kecuali health check + public auth endpoint) WAJIB di-protect dengan middleware auth.
- Middleware harus check:
  1. JWT valid & belum expired.
  2. JWT belum di-revoke (cek Redis blacklist).
  3. User masih aktif (`users.status = 'active'`).
  4. User punya permission untuk resource yang diakses.
- **Defense in depth:** validasi permission di backend WAJIB, frontend cuma untuk UX. Jangan trust client.

### 3.4 Rate Limiting & Anti-Abuse

- Login endpoint: 5 failed attempts dalam 15 menit → lock akun 1 jam, log ke audit.
- Password reset request: 3 request per email per jam.
- API umum: 100 req/menit per user.
- Brute force protection: increment delay setelah setiap fail (exponential).

### 3.5 No Sensitive Data in Logs

**JANGAN log:**
- Password (plaintext atau hash).
- Full JWT token (max prefix 8 char).
- API token (full).
- 2FA secret / backup codes.
- **4 header signature** (`X-Timestamp`, `X-Client-Id`, `X-Client-Secret`, `X-Signature`) — meski timestamp + client_id sendiri tidak rahasia, redact **semua 4** sebagai grup untuk hindari kesalahan implementasi (Section 10.4).
- PII yang tidak perlu (NIK, no rekening, dll — kalau suatu hari di-store).

**Mandatory log redaction config** (Fastify logger / Pino):
```ts
redact: [
  'req.headers.authorization',
  'req.headers["x-timestamp"]',
  'req.headers["x-client-id"]',
  'req.headers["x-client-secret"]',
  'req.headers["x-signature"]',
  '*.password', '*.password_hash', '*.token', '*.secret',
]
```

### 3.6 Data Privacy

- User berhak request export data mereka (GDPR-style, optional di MVP tapi schema sudah siap).
- User berhak request akun di-deactivate. Hard delete cuma boleh oleh Superadmin dengan justifikasi tercatat.

---

## 4. User Types, Roles, Units — Permission Model

### 4.1 Tiga Dimensi Permission

Kartolo menggunakan **3-dimensi permission model**:

| Dimensi | Deskripsi | Contoh |
|---|---|---|
| **User Type** | Level akses sistem (1=tertinggi). Hardcoded 3 level. | Superadmin (1), Admin (2), Member (3) |
| **User Role** | Fungsi/peran (data-driven, bisa CRUD). Banyak-ke-banyak dengan user. | Trader, Analyst, Finance, Auditor |
| **User Unit** | Unit organisasi (data-driven, bisa hierarchical). Satu user = satu unit utama. | Trading, Finance, IT, HR |

### 4.2 User Type — Detail

| Type | ID | Akses Default |
|---|---|---|
| **Superadmin** | 1 | Akses penuh termasuk Administration. Bisa CRUD semua, termasuk user type lain. Bisa register produk baru. |
| **Admin** | 2 | Akses ke Administration (subset terbatas: tidak bisa create Superadmin, tidak bisa register produk baru). Bisa CRUD user/role/unit dalam scope-nya. |
| **Member** | 3 | Akses ke produk yang di-grant ke role/unit-nya. **Tidak** punya akses ke Administration. |

**Aturan portal display:**
- `user_type IN (1, 2)` → tampilkan card **Administration** sebagai produk pertama, lalu produk lain yang ter-grant.
- `user_type = 3` → tampilkan hanya produk yang ter-grant ke role/unit-nya.

### 4.3 Product Access Resolution Logic

Sebuah produk `P` ditampilkan ke user `U` di portal IF:

```
(P is "Administration" AND U.user_type IN (1,2))
OR
(
  P.is_active = true
  AND EXISTS product_permissions entry PP for P where:
    (PP.min_user_type IS NULL OR U.user_type <= PP.min_user_type)
    AND (PP.role_id IS NULL OR U has role PP.role_id)
    AND (PP.unit_id IS NULL OR U.user_unit_id = PP.unit_id OR PP.unit_id IS descendant of U.user_unit_id)
)
```

- `NULL` berarti "tidak dibatasi pada dimensi tersebut".
- Multiple permission entries untuk satu produk = OR (additive).
- Permission resolution hasilnya di-cache di Redis (TTL 5 menit, invalidate on change).

### 4.4 Asumsi yang Perlu Konfirmasi User

> **CATATAN ASUMSI:** Definisi **User Unit** di PRD ini diasumsikan sebagai **unit organisasi internal** (departemen/divisi), bukan tenant multi-company atau cabang geografis. Schema mendukung hierarchical unit (parent-child). Konfirmasi atau koreksi diperlukan sebelum Phase 1.

---

## 5. Tech Stack (Locked Decisions)

| Layer | Technology | Versi Minimum | Justifikasi |
|---|---|---|---|
| Frontend | React + Vite + TypeScript | React 18+, Vite 5+ | SPA modern, konsisten dengan PRD Bot Trading AI |
| UI Component | shadcn/ui + Tailwind CSS | Latest | Composable, customizable, terbukti di Bot Trading PRD |
| State (client) | TanStack Query + Zustand | Latest | Server state + UI state terpisah |
| Form | React Hook Form + zod resolver | Latest | Validasi yang shared antara FE & BE |
| Routing | React Router | 6+ | De facto standard SPA routing |
| HTTP Client | Axios atau native fetch wrapper | — | Pilih satu, konsisten |
| Backend API | Node.js + Fastify + TypeScript | Node 20 LTS+, Fastify 4+ | Performant, schema validation native, konsisten dengan Bot Trading |
| ORM | Prisma | 5+ | Type-safe, migration tooling, multi-schema support |
| Validation | zod | Latest | Schema sharing FE/BE |
| Auth | `@fastify/jwt`, `argon2`, `speakeasy` (TOTP), `qrcode` | Latest | Stack auth standard |
| DB | PostgreSQL | 15+ | Mature, schema-based isolation |
| Cache | Redis | 7+ | Session, rate limit, blacklist token |
| Mail (dev) | MailHog | Latest | Capture email lokal |
| Mail (prod) | Resend / SES / SMTP provider | — | Pilih satu, configurable via env |
| Container | Docker + Docker Compose | Docker 24+, Compose v2 | **Semua service jalan di Docker, termasuk frontend & backend** (lihat Section 5.1) |
| CI/CD | GitHub Actions | — | Free tier cukup untuk MVP |

**Aturan:** Tech stack ini lock untuk Kartolo SuperApps. **Konsistensi dengan [PRD.md](PRD.md) (Bot Trading AI) adalah disengaja** agar integrasi mulus. Library tambahan boleh, replacement core technology butuh approval.

### 5.1 Docker-First Development (kecuali PostgreSQL)

**Hampir semua service di dev environment dijalankan via Docker Compose**, dengan **satu pengecualian penting: PostgreSQL di-install langsung di host** (bukan container).

| Service | Mode | Container Name | Port (Host) | Tipe |
|---|---|---|---|---|
| `frontend_kartoloapps` | **Docker** | `kartolo-web` | 5173 | App (Node + Vite dev server) |
| `backend_gatewayauth` | **Docker** | `kartolo-api` | 3000 | App (Node + Fastify dev server) |
| **PostgreSQL 15** | **Host (native install)** | — | 5432 | Infra |
| Redis 7 | **Docker** | `kartolo-redis` | 6379 | Infra |
| MailHog | **Docker** | `kartolo-mailhog` | 1025 (SMTP), 8025 (UI) | Infra (dev only) |

**Alasan PostgreSQL di host:**
- Keputusan eksplisit user. PostgreSQL diasumsikan sudah ter-install dan running di mesin developer (atau dipakai bersama dengan aplikasi/proyek lain di host).
- Akses langsung ke `psql`, GUI tools (pgAdmin, DBeaver, TablePlus), backup tooling, dan tuning lokal lebih mudah tanpa lapisan container.
- Data Postgres persistent secara natural di host filesystem, tidak tergantung Docker volume.

**Prinsip Docker untuk service lain:**

- **Source code di-bind mount** dari host ke container (`./frontend_kartoloapps:/app`) supaya edit di host langsung ke-reflect di container (hot reload tetap jalan: Vite HMR + tsx/nodemon watch).
- **`node_modules` pakai named volume** (bukan bind mount) supaya tidak conflict antara host OS dan container OS (penting di Windows/WSL — paket native Linux beda dengan native Windows).
- **`pnpm install` dijalankan di dalam container** (entrypoint script atau `docker compose run --rm web pnpm install`), tidak di host. Host tidak perlu Node ter-install.
- **Internal networking antar container** via service name (e.g., backend connect ke `redis:6379`).
- **Container → Host (untuk Postgres):** backend container connect ke Postgres host via:
  - **Linux:** `host.docker.internal` dengan `extra_hosts: ["host.docker.internal:host-gateway"]` di compose, atau pakai gateway IP `172.17.0.1`.
  - **Mac / Windows (Docker Desktop):** `host.docker.internal` works out of the box.
  - **Connection string:** `DATABASE_URL=postgresql://kartolo:devpass@host.docker.internal:5432/kartolo?schema=gateway_auth`.
- **Host-only access:** browser di host akses `http://localhost:5173` (web) dan `http://localhost:3000` (api), Compose meng-expose port.
- **Dev Dockerfile ≠ Production Dockerfile.** Pakai multi-stage build atau dua Dockerfile terpisah (`Dockerfile.dev` + `Dockerfile`). Dev image bawa dev dependencies + dev server, prod image hanya artefak build + runtime minimal.
- **One command boot:** `docker compose up` di parent folder `kartoloapp/` menjalankan 4 container (web, api, redis, mailhog). **Pra-syarat:** Postgres host sudah running + database `kartolo` + schema `gateway_auth` sudah dibuat.

**Konsekuensi:**
- Onboarding developer baru: install Docker Desktop + install Postgres 15 di host + clone repo + setup database + `docker compose up`. Tidak perlu install Node/Redis di host.
- Postgres host harus accept connection dari Docker network: `listen_addresses = '*'` (atau spesifik gateway), dan `pg_hba.conf` allow connection dari `172.17.0.0/16` (atau range Docker network) dengan auth method yang sesuai.
- Editor (VS Code) bisa attach ke container via Dev Containers extension (opsional, recommended untuk DX terbaik).

---

## 6. System Architecture

### 6.1 High-Level Components (MVP)

```
┌────────────────────────────────────────────────────────────────┐
│  Browser (frontend_kartoloapps — React + Vite SPA)             │
│  Routes:                                                       │
│    /login, /forgot-password, /reset-password                   │
│    /portal (post-login)                                        │
│    /administration/* (user_type 1,2 only)                      │
└──────────────────┬─────────────────────────────────────────────┘
                   │ HTTPS REST (+ optional WebSocket future)
                   ▼
┌────────────────────────────────────────────────────────────────┐
│  backend_gatewayauth (Node.js + Fastify)                       │
│  Endpoints:                                                    │
│    /api/v1/auth/*       (login, logout, refresh, 2FA, reset)   │
│    /api/v1/me           (current user profile + permissions)   │
│    /api/v1/portal/*     (product list for current user)        │
│    /api/v1/admin/*      (user/role/unit/product CRUD)          │
│    /api/v1/sso/*        (token verify endpoint for sub-app)    │
│    /health, /ready                                             │
└──────┬──────────────────────────────────┬──────────────────────┘
       │                                  │
       │ Prisma                           │ ioredis
       ▼                                  ▼
┌─────────────────────────────┐    ┌─────────────────────────┐
│  PostgreSQL                 │    │  Redis                  │
│  schema: gateway_auth       │    │  - session cache        │
│  (lihat Section 9)          │    │  - rate limit counters  │
│                             │    │  - revoked JWT list     │
│  Future schemas:            │    │  - permission cache     │
│  - trading_bot              │    └─────────────────────────┘
│  - (produk lain)            │
└─────────────────────────────┘

                   ▲
                   │ Verify JWT (RS256 public key) OR
                   │ POST /api/v1/sso/verify (kalau perlu introspect)
                   │
┌────────────────────────────────────────────────────────────────┐
│  Sub-Apps (FUTURE)                                             │
│  - Bot Trading AI (PRD.md)                                     │
│  - Produk lain                                                 │
└────────────────────────────────────────────────────────────────┘
```

### 6.2 SSO Flow (untuk Sub-App di Masa Depan)

```
1. User login di Kartolo → dapat JWT access token + refresh token (cookie httpOnly).
2. User klik product card "Bot Trading AI" → frontend redirect ke URL Bot Trading
   dengan JWT di-pass via:
   - Option A (cookie domain shared): cookie auto-sent kalau sub-app di same parent domain.
   - Option B (handoff via URL fragment): single-use code di-exchange ke JWT di sub-app.
3. Sub-app verify JWT:
   - Stateless: verify signature pakai public key Kartolo (RS256).
   - Stateful (extra check): POST ke /api/v1/sso/verify dengan token, dapat user + permissions.
4. Sub-app trust user identity & permission dari JWT claims.
```

> **CATATAN ASUMSI:** PRD ini default ke **Option A (shared cookie domain)** karena lebih sederhana. Kalau sub-app di-deploy di domain berbeda, ganti ke Option B. Final decision di Phase 4.

### 6.3 Deployment Topology (Production Target)

- 1× container `backend_gatewayauth` (scale horizontal di belakang load balancer) — **satu-satunya ingress point**
- 1× container `frontend_kartoloapps` (static build, served via CDN atau nginx)
- N× container sub-app backend (Bot Trading API, dst) — **bind ke internal network saja, TIDAK expose port ke internet**
- 1× managed PostgreSQL (shared dengan sub-app via schema separation)
- 1× managed Redis (shared dengan sub-app, pakai key prefix `kartolo:`)
- HTTPS via reverse proxy (Caddy/Nginx) atau platform-managed (Fly.io, Railway, Render)

### 6.4 API Gateway Architecture

**Prinsip kunci:** `backend_gatewayauth` adalah **satu-satunya pintu masuk** untuk seluruh API ekosistem Kartolo. Sub-app backend TIDAK BOLEH bisa diakses langsung dari internet. Konsekuensinya:

- **Network isolation:** sub-app backend (e.g., Bot Trading API) bind ke internal network/VPC. Tidak punya public IP/DNS, tidak expose port di compose production.
- **Single ingress:** semua client (browser, mobile, partner) ngakses via `https://api.kartolo.com/api/v1/*`. Internal sub-app accessible hanya via gateway proxy path.
- **Defense in depth:** sub-app tetap validate JWT (atau trust forwarded headers + IP allow-list dari gateway saja). Kompromi gateway ≠ kompromi langsung sub-app.

**URL routing di gateway:**

```
https://api.kartolo.com/api/v1/
├── auth/*                  → handled locally (modul auth)
├── me                      → handled locally
├── portal/*                → handled locally
├── admin/*                 → handled locally
├── sso/*                   → handled locally
├── gateway/*               → handled locally (gateway management, Superadmin only)
├── proxy/<slug>/*          → reverse-proxy ke upstream sub-app (HTTP)
└── ws/<slug>/*             → reverse-proxy ke upstream sub-app (WebSocket)
```

**Contoh:**
- `GET /api/v1/proxy/trading-bot/bots` → gateway forward ke `http://trading-bot-api:3001/api/v1/bots` (prefix `/api/v1/proxy/trading-bot` di-strip, base path upstream di-prepend sesuai config).
- `WS /api/v1/ws/trading-bot/ticks` → gateway upgrade & proxy WebSocket ke `ws://trading-bot-api:3001/ticks`.

**Diagram:**

```
                          ┌─────────────────────────────────┐
   Browser / Mobile / ───►│  Public Load Balancer (HTTPS)   │
   Partner                └────────────────┬────────────────┘
                                           │
                                           ▼
                          ┌─────────────────────────────────┐
                          │  backend_gatewayauth (Fastify)  │
                          │  ┌───────────────────────────┐  │
                          │  │ Middleware chain:         │  │
                          │  │  1. signatureGuard        │  │
                          │  │  2. jwtAuth (opt)         │  │
                          │  │  3. rbacGuard             │  │
                          │  │  4. rateLimit             │  │
                          │  │  5. routeMatcher          │  │
                          │  └───────────────────────────┘  │
                          │           │           │         │
                          │  local route        proxy route │
                          │       │                  │      │
                          └───────┼──────────────────┼──────┘
                                  ▼                  │
                          (auth, admin, etc.)        │ http-proxy
                                                     ▼
                          ┌──────────────────────────────────┐
                          │  Internal Docker Network / VPC   │
                          │  (sub-app backend, NO public IP) │
                          │                                  │
                          │  ┌──────────────┐ ┌──────────┐   │
                          │  │ trading-bot  │ │ (future) │   │
                          │  │     -api     │ │   ...    │   │
                          │  └──────────────┘ └──────────┘   │
                          └──────────────────────────────────┘
```

**Header forwarding ke upstream (sub-app):**

Gateway WAJIB strip 4 header signature client (`X-Client-Id`, `X-Client-Secret`, `X-Signature`, `X-Timestamp`) sebelum forward — ini credential client untuk gateway, bukan untuk sub-app. Gateway WAJIB inject:

| Header (ke upstream) | Source | Use |
|---|---|---|
| `X-Forwarded-User-Id` | JWT `sub` | Identitas user di sub-app |
| `X-Forwarded-User-Type` | JWT `user_type` | Level akses |
| `X-Forwarded-Unit-Id` | JWT `unit_id` | Unit organisasi |
| `X-Forwarded-Role-Ids` | JWT `roles` (comma) | Roles user |
| `X-Forwarded-Client-Id` | header `X-Client-Id` | Asal request (web/mobile/partner) |
| `X-Forwarded-Trace-Id` | `trace_id` | Distributed tracing |
| `X-Forwarded-For` | client IP | Untuk logging sub-app |
| `Authorization: Bearer <jwt>` | original | Sub-app boleh re-verify (defense-in-depth) |

Sub-app DI-RECOMMEND-KAN trust forwarded headers (network sudah isolated). Sub-app yang sensitif (e.g., Bot Trading order execution) boleh re-verify JWT untuk extra safety.

**Trust boundary:** Network isolation (sub-app tidak reachable dari luar) adalah trust anchor utama. Gateway = trusted, upstream = trusted. Header injection valid karena gateway tidak akan inject untuk client yang gagal auth.

**Resilience pattern:** circuit breaker (closed/open/half-open), retry dengan exponential backoff, timeout per route, request streaming (tidak buffer body untuk file besar). Detail di Section 7.5.

---

## 7. Functional Requirements

### 7.1 Authentication (FR-AUTH)

**FR-AUTH-01: Registrasi User**
- **MVP: registrasi hanya via Administration (Superadmin/Admin).** Self-registration TIDAK ada di MVP.
- Field wajib: email, full name, user_type, user_unit_id, initial roles[].
- Sistem generate password sementara → kirim email aktivasi dengan link set-password (token expire 24 jam).

**FR-AUTH-02: Login**
- Email + password.
- Validasi: format email, password tidak kosong.
- Rate limit: 5 failed/15 menit → lock 1 jam (per email).
- Return: access token (JWT, 15 menit) + refresh token (cookie httpOnly, 7 hari MVP, configurable).
- Audit log: success/fail + IP + user-agent.

**FR-AUTH-03: 2FA (TOTP)**
- **Mandatory** untuk `user_type IN (1, 2)`.
- **Optional** untuk `user_type = 3` (toggle di profile).
- Setup: scan QR code → input 6 digit code untuk konfirmasi.
- Backup codes: 10 buah, one-time use, di-hash di DB.
- Recovery: Superadmin bisa reset 2FA user lain (dengan audit log).

**FR-AUTH-04: Password Reset**
- Forgot password → input email → kirim link reset (token expire 1 jam, one-time use).
- Reset link membawa user ke halaman set password baru.
- Rate limit: 3 request per email per jam.

**FR-AUTH-05: Logout**
- Invalidate refresh token (delete dari cookie + tambahkan ke Redis blacklist sampai natural expiry).
- Audit log.

**FR-AUTH-06: Refresh Token**
- Endpoint `/api/v1/auth/refresh` (POST, baca refresh token dari cookie).
- Return access token baru. Optional: rotate refresh token (recommended).

**FR-AUTH-07: Session Management**
- User bisa lihat active sessions (device, IP, last active) di profile.
- User bisa revoke session selain current.

**FR-AUTH-08: Change Password**
- Input current password + new password (min 12 char, kombinasi huruf besar/kecil/angka/simbol).
- Invalidate semua refresh token lain user.

### 7.2 Portal (FR-PORTAL)

**FR-PORTAL-01: Portal Page**
- Post-login landing page.
- Header: logo Kartolo, user menu (profile, settings, logout), unit name, role badges.
- Body: grid of **product cards** (icon, name, description, "Open" button).
- Empty state: "Belum ada produk yang bisa diakses. Hubungi admin Anda."

**FR-PORTAL-02: Product Card Logic**
- API `GET /api/v1/portal/products` return daftar produk yang user bisa akses (server resolve permission).
- Untuk `user_type IN (1, 2)`: card **Administration** selalu paling pertama (atau di posisi yang di-config), card lain mengikuti urutan `display_order`.
- Untuk `user_type = 3`: hanya produk hasil resolution di Section 4.3.

**FR-PORTAL-03: Product Launch**
- Klik card → buka URL produk (`products.base_url`) di tab baru atau same-tab (configurable).
- SSO handoff sesuai mekanisme di Section 6.2.

**FR-PORTAL-04: User Profile Mini-View**
- Menu user (header) → dropdown: nama, email, role, unit, link ke Settings, Logout.

### 7.3 Administration (FR-ADMIN)

**Hanya dapat diakses oleh `user_type IN (1, 2)`.** Subset capability:
- Superadmin (1): full akses semua.
- Admin (2): tidak bisa create/edit Superadmin, tidak bisa register/edit/delete produk.

**FR-ADMIN-01: User Management**
- List user (filter by type/role/unit/status, search by name/email, pagination cursor-based).
- Create user (lihat FR-AUTH-01).
- Edit user (name, unit, roles, status). Email tidak boleh diubah di MVP.
- Deactivate / Activate user.
- Reset password user (kirim link set-password baru).
- Reset 2FA user.
- View user audit log.

**FR-ADMIN-02: Role Management**
- List role (search by name).
- Create role (code unique, name, description).
- Edit role (name, description). Code immutable setelah create.
- Delete role (cuma kalau tidak di-assign ke user manapun).

**FR-ADMIN-03: Unit Management**
- List unit (tree view kalau hierarchical, atau flat).
- Create unit (code unique, name, parent_id nullable, description).
- Edit unit (name, parent, description). Code immutable.
- Delete unit (cuma kalau tidak ada user dan tidak ada child unit).

**FR-ADMIN-04: Product Management** (Superadmin only)
- List registered products.
- Register product: code, name, slug, base_url, icon (upload atau URL), description, `is_active`, `display_order`.
- Edit product.
- Soft-delete product (kalau hard-delete, nanti ada FK cascade issue).
- Configure product permissions:
  - Per-product, add permission entries `(role_id?, unit_id?, min_user_type?)`.
  - UI: matrix atau list, dengan preview "siapa yang bisa akses".

**FR-ADMIN-05: Audit Log Viewer**
- List audit logs (filter by user, action, resource, date range).
- Detail view per entry.
- Export CSV (Superadmin only, dengan audit log juga).

**FR-ADMIN-06: API Token Management** (untuk machine-to-machine bearer token)
- Issue token (label, scope, expiry).
- Revoke token.
- List token (display prefix only, never full token).

**FR-ADMIN-07: API Client Management** (untuk request signature — lihat Section 10.4 & 10.5)
- List `api_clients`: name, client_id, type, secret_preview, last_used_at, is_active.
- Create client: name, type. Server generate `client_id` + `client_secret`. Secret ditampilkan **satu kali** dengan banner warning.
- Rotate secret: generate secret baru, secret lama tetap valid grace period 24 jam (configurable).
- Deactivate / Activate client.
- Audit log mandatory untuk semua action.
- **Bootstrap:** seed data wajib include 1 client default `kartolo-web-frontend` untuk frontend Kartolo, dengan secret yang di-inject ke FE build via env var (`VITE_CLIENT_ID`, `VITE_CLIENT_SECRET`).

### 7.4 SSO / Identity Endpoints (FR-SSO)

**FR-SSO-01: Token Verification Endpoint**
- `POST /api/v1/sso/verify` — input JWT (di body), output user identity + permissions (atau error envelope).
- **Auth: 4 header signature standar** (Section 10.4). Sub-app punya `api_client` entry dengan `type=sub_app_backend`. **Tidak pakai `X-Internal-Token` terpisah** — single mekanisme auth via signature.
- Catatan: dengan API Gateway pattern (Section 6.4 + 7.5), sub-app idealnya **tidak perlu** call endpoint ini karena gateway sudah forward header `X-Forwarded-User-*`. Endpoint ini disediakan untuk: (a) sub-app yang mau re-verify defense-in-depth, (b) sub-app yang accessible direct di transisi/legacy.

**FR-SSO-02: Public Key Endpoint**
- `GET /.well-known/jwks.json` — JWKS public key untuk verify JWT secara stateless.

**FR-SSO-03: User Info Endpoint**
- `GET /api/v1/me` — return current user profile + accessible products + roles + unit.
- Untuk frontend & sub-app.

### 7.5 API Gateway Management (FR-GW)

Modul ini bertanggung jawab atas registrasi service backend, route, proxy execution, health check, dan circuit breaker. **Hanya Superadmin** yang bisa CRUD service/route (mencegah escalation attack via route injection).

**FR-GW-01: Service Registration** (Superadmin only)
- List services: name, slug, upstream_url, health status, last_check_at, request count 24h.
- Register service: input `slug`, `name`, `description`, `upstream_url` (e.g., `http://trading-bot-api:3001`), `health_check_path` (default `/health`), `timeout_ms` (default 30000), `retry_count` (default 0), `is_active`.
- Validate: slug unique (regex `^[a-z][a-z0-9-]*$`), upstream reachable (do test ping ke `health_check_path` sebelum save — wajib 2xx).
- Edit service (slug immutable setelah created).
- Soft-delete service (semua route ikut deactivated).
- Audit log mandatory.

**FR-GW-02: Route Registration** (Superadmin only)
- Per-service, admin add routes:
  - `path_pattern`: glob/wildcard (e.g., `/bots/*`, `/bots/:id/stop`, `/*` untuk catch-all).
  - `methods`: array dari `GET`, `POST`, `PATCH`, `PUT`, `DELETE`, `*`.
  - `strip_prefix`: boolean (default `true`). Kalau true, prefix `/api/v1/proxy/<slug>` di-strip sebelum forward.
  - `upstream_path_rewrite`: opsional, regex rewrite tambahan (e.g., `^/bots/(.*)$` → `/v2/bots/$1` kalau upstream pakai versi beda).
  - `requires_auth`: boolean (default `true`). Kalau false, JWT tidak di-check (untuk endpoint public di sub-app).
  - `min_user_type`: nullable, 1-3.
  - `required_role_codes`: array of role codes (OR logic — punya salah satu cukup).
  - `required_unit_codes`: array of unit codes (OR logic).
  - `rate_limit_per_minute`: nullable, override default.
  - `timeout_ms_override`: nullable.
  - `is_active`: boolean.
- Route matching: longest-prefix wins; specificity > insertion order.
- Conflict detection: warn admin kalau pattern overlap dengan route existing.
- Audit log mandatory.

**FR-GW-03: Proxy Execution**
- Untuk request ke `/api/v1/proxy/<slug>/<path>`:
  1. Resolve service by slug. Kalau tidak ada / inactive → `rc=14, status=400`.
  2. Match route (path_pattern + method). Kalau tidak match → `rc=14`.
  3. Cek circuit breaker state. Kalau `open` → `rc=95, status=400, message: "Service sementara tidak tersedia"`.
  4. Auth chain: signatureGuard (Section 10.4) → jwtAuth (kalau `requires_auth`) → RBAC check (`min_user_type`, `role`, `unit`).
  5. Rate limit per route (kalau di-set) — pakai Redis token bucket.
  6. Inject `X-Forwarded-*` headers (Section 6.4), strip 4 header signature client + `X-Client-Secret`.
  7. Forward via `@fastify/http-proxy` (atau implementasi serupa). **Stream** body in/out, jangan buffer.
  8. Apply timeout. Pada timeout / 5xx upstream / connection error: retry sesuai `retry_count` dengan exponential backoff.
  9. Pada failure berturut-turut (default 5 dalam 30 detik) → trip circuit breaker ke `open`.
  10. Log request ke `gateway_request_logs` (lihat 9.2).
- Response upstream **TIDAK di-wrap** ulang dengan envelope Kartolo. Sub-app diasumsikan sudah pakai envelope yang sama (lihat Section 10.2). Kalau sub-app legacy pakai format lain, ada flag `wrap_response` per service (default `false`, untuk MVP).

**FR-GW-04: WebSocket Proxy**
- Untuk request ke `/api/v1/ws/<slug>/<path>` dengan `Upgrade: websocket`:
  1. Auth check **HANYA di handshake** (HTTP upgrade request). Setelah upgrade, tidak ada per-message auth.
  2. Validate JWT (kalau route requires_auth) + signature (header di handshake request).
  3. Inject `X-Forwarded-*` headers sebelum forward handshake.
  4. Pipe WebSocket bidirectional.
  5. Sub-app re-validate JWT pada first message (recommended) atau trust forwarded headers.
- Timeout untuk idle WebSocket configurable per route.
- Circuit breaker juga applicable untuk WebSocket connect failure.

**FR-GW-05: Health Check & Circuit Breaker**
- Background job (Fastify scheduler atau BullMQ job) ping `upstream_url + health_check_path` setiap 30 detik (configurable).
- Update `gateway_services.last_health_check_at` + `last_health_check_ok`.
- 3x fail berturut-turut → set `circuit_breaker_state = 'open'`, schedule transition ke `half-open` setelah 60 detik.
- `half-open` state: izinkan 1 request lewat. Sukses → `closed`. Gagal → `open` lagi.
- Notifikasi ke Superadmin (email + in-app) saat service di-open atau recovered.

**FR-GW-06: Gateway Dashboard** (Superadmin only)
- Overview: total services, health status (green/red), request count 24h, error rate, p95 latency.
- Per-service view: detail config, route list, request count chart 24h/7d, recent errors.
- Live tail request log (filter by service, status, user, error).
- Manual trigger: force health check, reset circuit breaker, deactivate service.

**FR-GW-07: Audit & Observability**
- Semua action di /gateway/* → audit log.
- Setiap proxy request → `gateway_request_logs` row (lihat 9.2). Volume bisa tinggi — pertimbangkan TimescaleDB hypertable + compression untuk retention >30 hari.
- Distributed tracing: `X-Forwarded-Trace-Id` propagated ke upstream. Sub-app log dengan trace_id yang sama.

### 7.6 Notifications (FR-NOTIF)

**FR-NOTIF-01: Email Notifications**
- Account created (dengan link set-password).
- Password reset request.
- Login dari device/IP baru (basic detection).
- 2FA enabled/disabled.

**FR-NOTIF-02: In-App Notification** *(POST-MVP, optional)*
- Bell icon, badge count, list notifikasi.
- Realtime via WebSocket — **tidak di-implement di MVP**, geser ke v1.1.

---

## 8. Non-Functional Requirements

### 8.1 Performance

- **Login endpoint:** p95 < 500ms (termasuk argon2 hash verification).
- **API umum (non-auth):** p95 < 200ms.
- **Portal load (GET /portal/products):** p95 < 150ms (cached) / < 400ms (cold).
- **JWT verification:** < 5ms (stateless RS256).

### 8.2 Security

- HTTPS only di production (HSTS enabled, min 1 tahun).
- All input validated dengan zod.
- SQL injection: dijamin Prisma (parameterized queries).
- XSS: React default escape + CSP header strict.
- CSRF: SameSite cookies + double-submit token untuk state-changing request.
- Rate limiting (lihat Section 3.4).
- Dependency scan: weekly `pnpm audit` + Dependabot.
- Security headers: `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`.

### 8.3 Scalability

- Stateless backend (semua state di Postgres/Redis) → scale horizontal.
- Target MVP: 500 concurrent user, 50 req/s sustained.
- Redis: pakai connection pooling.
- Postgres: pakai pgBouncer atau Prisma connection pool config.

### 8.4 Reliability

- Uptime target: **99.5%** (excluding maintenance window).
- Graceful shutdown: drain in-flight request, close DB/Redis connection.
- Health endpoint `/health` (liveness) + `/ready` (readiness, cek DB/Redis).
- DB backup: daily snapshot, retention 30 hari.

### 8.5 Maintainability

- All code TypeScript strict mode.
- Unit test coverage minimum 70% untuk business logic.
- Integration test untuk critical flow: login, 2FA setup, password reset, permission resolution.
- Linter + formatter wajib (ESLint + Prettier).
- Conventional Commits.

### 8.6 Observability

- Structured logging (JSON) dengan correlation ID (`traceId` per request).
- Health & metrics endpoint.
- Metrics: response time, error rate, login success/fail rate, active session count.
- Sentry (atau equivalent) untuk error tracking di staging/prod.

---

## 9. Data Model Overview

### 9.1 Schema Setup

- Satu PostgreSQL instance.
- Schema `gateway_auth` untuk Kartolo SuperApps (backend_gatewayauth).
- Sub-app punya schema sendiri: `trading_bot`, dst. **Kartolo tidak nulis ke schema sub-app.**
- Migration: Prisma migrate, semua reversible.

### 9.2 Tabel Utama di `gateway_auth`

| Tabel | Tujuan |
|---|---|
| `users` | Identity user. Field: `id`, `email` (unique), `password_hash`, `full_name`, `user_type` (1\|2\|3), `user_unit_id`, `status` (`active`\|`inactive`\|`pending`), `email_verified_at`, `two_factor_enabled`, `two_factor_secret_encrypted`, `last_login_at`, `created_at`, `updated_at` |
| `units` | Unit organisasi. Field: `id`, `code` (unique), `name`, `description`, `parent_id` (nullable, self-FK), `created_at`, `updated_at` |
| `roles` | Role/peran fungsional. Field: `id`, `code` (unique), `name`, `description`, `created_at`, `updated_at` |
| `user_roles` | Junction user ↔ role (many-to-many). PK composite `(user_id, role_id)`. |
| `products` | Sub-app yang ter-register. Field: `id`, `code` (unique), `name`, `slug`, `base_url`, `icon_url`, `description`, `is_active`, `display_order`, `created_at`, `updated_at` |
| `product_permissions` | Aturan akses produk. Field: `id`, `product_id`, `role_id` (nullable), `unit_id` (nullable), `min_user_type` (nullable), `created_at`. Multiple row per produk = OR logic. |
| `sessions` | Active refresh token. Field: `id`, `user_id`, `refresh_token_hash`, `ip`, `user_agent`, `last_active_at`, `expires_at`, `revoked_at`. |
| `password_reset_tokens` | Field: `id`, `user_id`, `token_hash`, `expires_at`, `used_at`. |
| `email_verification_tokens` | Mirip password_reset. |
| `two_factor_backup_codes` | Field: `id`, `user_id`, `code_hash`, `used_at`. |
| `api_tokens` | Machine-to-machine token (long-lived bearer). Field: `id`, `user_id` (atau system), `label`, `token_prefix`, `token_hash`, `scope` (jsonb), `expires_at`, `revoked_at`, `last_used_at`. |
| `api_clients` | **Client untuk request signature (lihat Section 10.5.2).** Field: `id`, `client_id` (unique), `secret_hash`, `secret_preview`, `name`, `type` (`web_frontend`\|`mobile_app`\|`sub_app_backend`\|`external_partner`), `is_active`, `last_used_at`, `created_at`, `updated_at`. |
| `gateway_services` | **Sub-app backend yang ter-register di gateway (Section 7.5).** Field: `id`, `slug` (unique), `name`, `description`, `upstream_url`, `health_check_path` (default `/health`), `timeout_ms`, `retry_count`, `circuit_breaker_state` (`closed`\|`open`\|`half_open`), `circuit_opened_at`, `last_health_check_at`, `last_health_check_ok` (bool), `is_active`, `created_at`, `updated_at`. |
| `gateway_routes` | Route per service. Field: `id`, `service_id` FK, `path_pattern`, `methods` (text[]), `strip_prefix` (bool), `upstream_path_rewrite` (nullable), `requires_auth` (bool), `min_user_type` (nullable), `required_role_codes` (text[]), `required_unit_codes` (text[]), `rate_limit_per_minute` (nullable), `timeout_ms_override` (nullable), `is_active`, `created_at`, `updated_at`. |
| `gateway_request_logs` | High-volume request log. Field: `id`, `service_id`, `route_id`, `user_id` (nullable), `client_id`, `method`, `path`, `upstream_status`, `duration_ms`, `error` (nullable), `trace_id`, `created_at`. **Pertimbangkan TimescaleDB hypertable** + compression kalau volume >1M/hari. |
| `audit_logs` | Field: `id`, `user_id` (nullable, untuk system action), `client_id` (nullable, untuk M2M), `action`, `resource_type`, `resource_id`, `metadata` (jsonb), `ip`, `user_agent`, `created_at`. |

### 9.3 Aturan Migration

- Setiap perubahan schema via Prisma migration.
- Tidak ada manual SQL di production.
- Migration harus reversible (down migration tested di staging).
- Seed data: 1 Superadmin default (email dari env, password dari env atau auto-generate + print di log dev).

### 9.4 ERD

Detail ERD disimpan di `docs/erd.md` (akan dibuat di Phase 0). PRD ini cukup overview.

---

## 10. API Design Principles

### 10.1 REST Conventions

- Base URL: `/api/v1/`
- Resource-oriented endpoint (handled locally di gateway):
  - `/auth/login`, `/auth/logout`, `/auth/refresh`, `/auth/2fa/*`, `/auth/password-reset/*`
  - `/me` (current user info)
  - `/portal/products`
  - `/admin/users`, `/admin/roles`, `/admin/units`, `/admin/products`, `/admin/audit-logs`, `/admin/api-tokens`, `/admin/api-clients`
  - `/sso/verify`, `/.well-known/jwks.json`
  - `/gateway/services`, `/gateway/services/:id/routes`, `/gateway/dashboard`, `/gateway/request-logs` (Superadmin only)
- Reverse-proxy endpoint (forward ke sub-app, lihat Section 6.4 + 7.5):
  - `/proxy/<service-slug>/*` (HTTP)
  - `/ws/<service-slug>/*` (WebSocket)
- Standard HTTP verbs: GET, POST, PATCH, PUT, DELETE.
- JSON request/response, UTF-8.
- ISO 8601 untuk datetime (UTC).
- Pagination: cursor-based untuk list besar (`?limit=50&cursor=...`).
- **HTTP status code SAMA dengan field `status` di body** (lihat 10.2). Hindari 204 No Content — selalu return body dengan envelope standar.

### 10.2 Standard Response Envelope

**Semua response (sukses maupun error) WAJIB pakai envelope yang sama** dengan 5 field top-level: `rc`, `status`, `message`, `error`, `data`.

```json
{
  "rc": "00",
  "status": 200,
  "message": "Login berhasil",
  "error": null,
  "data": {
    "trace_id": "req_abc123",
    "access_token": "eyJhbGc...",
    "user": { "id": "...", "email": "..." }
  }
}
```

**Aturan field:**

| Field | Tipe | Wajib | Keterangan |
|---|---|---|---|
| `rc` | string | ✅ | Response code 2-digit. Lihat tabel di 10.3. `"00"` = sukses, lainnya = error. |
| `status` | integer | ✅ | HTTP status code yang **sama** dengan HTTP status. |
| `message` | string | ✅ | Pesan human-readable Bahasa Indonesia. |
| `error` | object \| null | ✅ | `null` saat sukses. Saat error: berisi `{code, details}` untuk debugging machine-readable. |
| `data` | object | ✅ | **Selalu object**, never `null`. Minimum berisi `trace_id`. Payload + list ada di sini. |

**Aturan untuk `data`:**

- **`trace_id` SELALU di dalam `data`**, baik sukses maupun error. Tidak ada `meta` block terpisah.
- **List/array** ditaruh di dalam `data` sebagai property (default name: `items`). Pagination juga di dalam `data`.
- Untuk endpoint yang tidak mengembalikan payload (e.g., logout, delete), `data` cukup berisi `trace_id` saja.

**Contoh — List response:**

```json
{
  "rc": "00",
  "status": 200,
  "message": "OK",
  "error": null,
  "data": {
    "trace_id": "req_abc123",
    "items": [
      { "id": "user_1", "email": "..." },
      { "id": "user_2", "email": "..." }
    ],
    "pagination": {
      "next_cursor": "eyJpZCI6InVzZXJfMiJ9",
      "has_more": true,
      "limit": 50
    }
  }
}
```

**Contoh — Error response (token invalid):**

```json
{
  "rc": "91",
  "status": 400,
  "message": "Token tidak valid atau sudah expired.",
  "error": {
    "code": "TOKEN_INVALID",
    "details": { "reason": "signature_mismatch" }
  },
  "data": {
    "trace_id": "req_abc123"
  }
}
```

**Contoh — Empty success (e.g., logout):**

```json
{
  "rc": "00",
  "status": 200,
  "message": "Logout berhasil",
  "error": null,
  "data": {
    "trace_id": "req_abc123"
  }
}
```

### 10.3 Response Code (rc) Mapping

| `type` (internal) | `rc` | HTTP `status` | Use Case |
|---|---|---|---|
| `approved` | `00` | **200** | Sukses. |
| `expired` | `12` | 400 | Resource expired (token, sesi, dll). |
| `not_found` | `14` | 400 | Resource tidak ditemukan. *(NOTE: rc 14 dipakai meski semantik biasanya 404 — ini sesuai spec user.)* |
| `too_many_request` | `60` | **429** | Rate limit exceeded. |
| `in_process` | `68` | 400 | Permintaan masih diproses (async pending). |
| `insufficient_fund` | `81` | 400 | Saldo tidak cukup (relevan untuk sub-app trading/payment). |
| `already_paid` | `88` | 400 | Transaksi sudah dibayar/diproses (relevan untuk sub-app trading/payment). |
| `db_error` | `90` | 400 | Error di layer database. |
| `token_invalid` | `91` | 400 | JWT invalid / expired / signature mismatch. |
| `header_unauthorized` | `92` | 400 | Header autentikasi tidak lengkap atau credential salah (X-Client-Id/Secret). |
| `signature_invalid` | `93` | 400 | X-Signature tidak match dengan recomputed. |
| `body_invalid` | `94` | 400 | Request body gagal validasi (zod). Detail field error di `error.details`. |
| `app_close` | `95` | 400 | Service/feature di-disable atau di-maintenance. |
| `other` | `99` | 400 | Catch-all untuk error yang tidak ter-kategori. |

**Aturan implementasi:**

- Backend punya **helper `responseEnvelope(type, opts)`** terpusat. Controller cukup throw `AppError('token_invalid', message, details?)` dan global error handler men-translate ke envelope.
- Tabel mapping di atas WAJIB sumber tunggal (`shared/errors/response-codes.ts`). Jangan hardcode rc/status di banyak tempat.
- Field `error.code` (machine-readable, SCREAMING_SNAKE) terpisah dari `rc` (2-digit). Contoh: `rc=94` → `error.code=BODY_INVALID` atau lebih spesifik `error.code=EMAIL_FORMAT_INVALID`.
- `rc` field **selalu string** (bukan integer) supaya leading zero tetap (`"00"`, `"14"`).
- **Server-side error (5xx)**: kalau backend crash, fallback ke `rc=99`, `status=500`. Tabel di atas tidak meng-cover 5xx eksplisit — `99` jadi umbrella untuk semua error tidak terduga.

> **CATATAN ANALISIS:** Mapping `not_found → status 400` (bukan 404) bertentangan dengan REST convention. Ini disengaja sesuai spec user dan konsisten dengan pola gateway B2B Indonesia (di mana semua client error pakai 400 + rc field). Sub-app/integrator harus aware: mereka tidak bisa hanya cek HTTP status, harus parse `rc` juga.

### 10.4 Required Request Headers

**Semua request ke backend `/api/v1/*`** (kecuali `/health`, `/ready`, `/.well-known/*`) WAJIB membawa 4 header berikut:

| Header | Tipe | Contoh | Validasi |
|---|---|---|---|
| `X-Timestamp` | string (epoch ms, UTC) | `1715900000000` | Wajib ±5 menit dari server time (anti-replay). |
| `X-Client-Id` | string | `kartolo-web-frontend` | Lookup ke tabel `api_clients` (lihat 10.5.2). |
| `X-Client-Secret` | string (raw secret) | `cs_live_a1b2c3...` | Hash + compare constant-time dengan `api_clients.secret_hash`. |
| `X-Signature` | string (hex) | `f3a1b2c4...` | HMAC-SHA256 hasil computation (lihat 10.5.1). |

**Endpoint yang dikecualikan dari header check:**
- `GET /health`, `GET /ready` — supaya container orchestrator bisa check tanpa credential.
- `GET /.well-known/jwks.json` — public endpoint by spec.

**Untuk endpoint user (login, /me, dll):**
- Header signature **DI ATAS** JWT Bearer token. Artinya: request lengkap punya `Authorization: Bearer <jwt>` PLUS 4 header signature.
- Signature memastikan request integrity + identitas client (browser frontend, mobile app, atau sub-app).
- JWT memastikan identitas user.

**Order validasi (middleware chain):**
1. `X-Timestamp` ada & dalam window → kalau gagal: `rc=92`, `status=400`.
2. `X-Client-Id` ada & terdaftar → kalau gagal: `rc=92`.
3. `X-Client-Secret` match dengan stored hash → kalau gagal: `rc=92`.
4. `X-Signature` ada & match recompute → kalau gagal: `rc=93`.
5. **(Untuk endpoint protected)** JWT valid & user aktif → kalau gagal: `rc=91`.
6. RBAC permission check → kalau gagal: `rc=92` (atau spec terpisah).

### 10.5 Request Signature Specification

#### 10.5.1 Algoritma `X-Signature`

```
string_to_sign =
  METHOD + "\n" +
  PATH_WITH_QUERY + "\n" +
  X-Timestamp + "\n" +
  X-Client-Id + "\n" +
  SHA256_HEX(REQUEST_BODY)

signature = HMAC_SHA256_HEX(
  key  = api_client.secret,
  data = string_to_sign
)
```

**Aturan:**
- `METHOD` uppercase (`GET`, `POST`, `PATCH`, `DELETE`).
- `PATH_WITH_QUERY` sudah ter-URL-encode, contoh `/api/v1/users?limit=50&cursor=abc`.
- `REQUEST_BODY` raw bytes. Untuk GET/DELETE tanpa body, pakai SHA256 dari empty string: `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`.
- HMAC output dalam hex lowercase.
- Compare di server dengan **constant-time comparison** (`crypto.timingSafeEqual`) untuk hindari timing attack.

#### 10.5.2 Tabel `api_clients` (di schema `gateway_auth`)

| Kolom | Tipe | Catatan |
|---|---|---|
| `id` | uuid PK | |
| `client_id` | string unique | Yang dikirim di header `X-Client-Id`. |
| `secret_hash` | string | bcrypt hash dari secret. |
| `secret_preview` | string | First 8 char untuk display di admin UI. |
| `name` | string | Human-readable (e.g., "Kartolo Web Frontend", "Bot Trading AI Backend"). |
| `type` | enum | `web_frontend` \| `mobile_app` \| `sub_app_backend` \| `external_partner`. |
| `is_active` | boolean | |
| `last_used_at` | timestamp | |
| `created_at`, `updated_at` | timestamp | |

- Secret di-generate sekali saat create di Administration → ditampilkan ke admin **satu kali** (warning UI), setelah itu hanya `secret_preview` yang visible.
- Rotation: admin bisa generate secret baru, secret lama tetap valid selama grace period (24 jam, configurable).

#### 10.5.3 Analisis & Pertimbangan Desain

> **CATATAN ANALISIS — penting dibaca:**
>
> 1. **Sending `X-Client-Secret` di header bersama `X-Signature` adalah pola "double-check"** yang umum di gateway B2B Indonesia (BNI, BCA, Mandiri API). Alasannya: signature melindungi integritas request, secret menjadi shared-secret pre-auth check. Keduanya bersama membuat replay + tampering jadi sangat sulit. Trade-off: secret muncul di header tiap request → **tidak boleh muncul di log apapun** (lihat Section 3.5). Middleware logger WAJIB redact 4 header ini.
>
> 2. **Frontend browser tidak bisa menyimpan client secret dengan aman.** Konsekuensinya:
>    - Opsi A (default PRD): Web frontend pakai client_id+secret yang ter-embed di build (visible di JS bundle). Threat model: assume user dengan DevTools bisa lihat. Tetap aman karena: (a) HTTPS, (b) X-Signature membatasi tampering, (c) JWT membatasi akses data per user. **Cocok untuk internal/B2B internal use case Kartolo.**
>    - Opsi B (lebih aman, lebih kompleks): Backend-for-Frontend (BFF) pattern — browser tidak signing, BFF di sisi server holds secret dan signing on behalf. Geser ke v2 kalau Kartolo dipakai eksternal.
>
> 3. **Konsistensi dengan SSO ke sub-app (Bot Trading AI):** Sub-app punya `client_id+secret` sendiri (`type=sub_app_backend`). Saat call ke `/api/v1/sso/verify`, sub-app sign request sesuai 10.5.1. Header `X-Internal-Token` yang sebelumnya disebut di Section 7.4 FR-SSO-01 dihapus — diganti dengan 4 header signature standar ini (single auth mechanism).
>
> 4. **JWT `Authorization: Bearer` tetap dipakai** untuk identitas user. Header signature 4 di atas adalah autentikasi *client* (siapa yang call: web/mobile/sub-app), JWT adalah autentikasi *user* (atas nama siapa). Dua lapis berbeda peruntukan.

### 10.6 JWT Claims (Standard)

```json
{
  "iss": "kartolo-superapps",
  "sub": "user_uuid",
  "iat": 1700000000,
  "exp": 1700000900,
  "user_type": 3,
  "unit_id": "unit_uuid",
  "roles": ["trader", "analyst"],
  "session_id": "sess_uuid"
}
```

- Access token: 15 menit.
- Refresh token: 7 hari (configurable). Stored as httpOnly cookie + hash di DB.

---

## 11. Project Structure

### 11.0 Prinsip "Everything Inside `kartoloapp/`"

**Semua artefak project — source code, infra config, scripts, dokumentasi, environment template — WAJIB berada di dalam folder `kartoloapp/`.** Tidak ada file project yang boleh hidup di luar folder ini (misal di `/etc/`, `/usr/local/bin/`, home directory developer, dll).

**Kenapa:**
- Portability — copy/clone folder `kartoloapp/` cukup untuk pindah mesin.
- Onboarding — developer baru tahu satu lokasi untuk semua.
- Backup — satu folder satu rule.
- Konsisten dengan model "monorepo loose" (parent jadi container, tiap app jadi repo independen di dalamnya).

**Pengecualian (yang TIDAK termasuk dalam aturan ini):**
- Data PostgreSQL (di `/var/lib/postgresql/15/` atau lokasi default OS) — karena Postgres di host, data file ikut konvensi OS. **Backup/dump SQL hasil snapshot tetap disimpan di `kartoloapp/backups/` (gitignored).**
- Docker volumes (`kartolo_*_data`, `kartolo_*_node_modules`) — managed Docker engine, tidak terlihat sebagai file di folder project.
- Global tools (Docker Desktop, pnpm jika install global, dll).

### 11.1 Struktur Top-Level

```
kartoloapp/                            # Parent folder (sudah ada)
│                                      # ── Bukan git repo. Container untuk semua.
│
├── PRD.md                             # Bot Trading AI PRD
├── PRD_KARTOLOAPPS.md                 # File ini
├── docker-compose.yml                 # Orchestrate: web, api, redis, mailhog (Postgres di host)
├── docker-compose.override.yml        # Dev-only overrides (bind mount, hot reload)
├── .env.example                       # Template env untuk dev (semua service)
├── .gitignore.parent                  # Manual ref untuk apa yang harus di-ignore (parent bukan repo)
│
├── infra/                             # === SHARED INFRA CONFIG ===
│   ├── postgres/
│   │   ├── init.sql                   # Manual: setup user/db/schema (run via psql)
│   │   ├── pg_hba.example.conf        # Contoh entry yang perlu ditambah ke Postgres host
│   │   └── README.md                  # Step-by-step setup Postgres host
│   ├── nginx/                         # (Future) reverse proxy config untuk prod
│   └── caddy/                         # (Alternative) Caddy config
│
├── scripts/                           # === DEV/OPS SCRIPTS ===
│   ├── setup-postgres.sh              # Wrapper untuk run init.sql + verifikasi
│   ├── reset-dev.sh                   # Drop & recreate schema + restart compose
│   ├── seed-clients.sh                # Generate seed api_clients untuk dev
│   └── README.md
│
├── backups/                           # Local Postgres dump (gitignored)
│   └── .gitkeep
│
├── frontend_kartoloapps/              # === FRONTEND APP ===
│   ├── .git/                          # Git repo di sini (BUKAN di parent)
│   ├── .gitignore
│   ├── .dockerignore                  # Exclude node_modules, dist, .env
│   ├── Dockerfile                     # Production build (multi-stage)
│   ├── Dockerfile.dev                 # Dev image (Vite dev server + HMR)
│   ├── README.md
│   ├── package.json
│   ├── pnpm-lock.yaml
│   ├── tsconfig.json
│   ├── vite.config.ts                 # server.host=0.0.0.0, hmr.host config
│   ├── tailwind.config.ts
│   ├── postcss.config.js
│   ├── index.html
│   ├── public/
│   ├── src/
│   │   ├── main.tsx                   # Entry point
│   │   ├── App.tsx                    # Router shell + providers
│   │   ├── shared/                    # === SHARED (semua dev pakai) ===
│   │   │   ├── components/ui/         # shadcn/ui components
│   │   │   ├── components/layout/     # Header, sidebar, dll
│   │   │   ├── lib/                   # api client, auth helper, dll
│   │   │   ├── hooks/                 # useAuth, useCurrentUser, dll
│   │   │   ├── stores/                # Zustand stores global
│   │   │   ├── types/                 # Shared TS types
│   │   │   └── config/                # env validation, constants
│   │   └── registry.ts                # Module registry (lihat 11.3)
│   │
│   └── reza/                          # === DEV FOLDER (REZA) ===
│       ├── README.md                  # Catatan modul yang dia handle
│       └── modules/
│           ├── auth/                  # Login, register form, dll
│           │   ├── pages/
│           │   ├── components/
│           │   ├── hooks/
│           │   └── index.ts           # Export module manifest
│           ├── portal/
│           │   ├── pages/PortalPage.tsx
│           │   ├── components/ProductCard.tsx
│           │   └── index.ts
│           └── administration/
│               ├── pages/
│               ├── components/
│               └── index.ts
│
├── backend_gatewayauth/               # === BACKEND APP ===
│   ├── .git/                          # Git repo di sini (BUKAN di parent)
│   ├── .gitignore
│   ├── .dockerignore
│   ├── Dockerfile                     # Production (multi-stage, distroless/alpine)
│   ├── Dockerfile.dev                 # Dev (tsx watch / nodemon, listen 0.0.0.0:3000)
│   ├── README.md
│   ├── package.json
│   ├── pnpm-lock.yaml
│   ├── tsconfig.json
│   ├── prisma/
│   │   ├── schema.prisma              # datasource db { schemas = ["gateway_auth"] }
│   │   ├── migrations/
│   │   └── seed.ts
│   ├── src/
│   │   ├── server.ts                  # Fastify bootstrap
│   │   ├── shared/                    # === SHARED ===
│   │   │   ├── plugins/               # @fastify/jwt, cors, helmet, dll
│   │   │   ├── middleware/            # auth, rbac, rate-limit, audit
│   │   │   ├── lib/                   # prisma client, redis client, mailer
│   │   │   ├── errors/                # AppError, error handler
│   │   │   ├── types/
│   │   │   └── config/                # env validation (zod)
│   │   └── registry.ts                # Route registry (lihat 11.3)
│   │
│   └── reza/                          # === DEV FOLDER (REZA) ===
│       ├── README.md
│       └── modules/
│           ├── auth/
│           │   ├── auth.controller.ts
│           │   ├── auth.service.ts
│           │   ├── auth.repository.ts
│           │   ├── auth.schema.ts     # zod schemas
│           │   ├── auth.types.ts
│           │   └── index.ts           # Export module manifest
│           ├── me/
│           ├── portal/
│           ├── administration/
│           │   ├── users/
│           │   ├── roles/
│           │   ├── units/
│           │   ├── products/
│           │   └── audit-logs/
│           └── sso/
│
└── docs/
    ├── erd.md
    ├── api.md
    ├── permission-model.md
    └── developer-folder-guide.md      # Penjelasan pola dev folder
```

### 11.2 Aturan Git

- Git di-init di `frontend_kartoloapps/` dan `backend_gatewayauth/` **secara independen** (2 repo terpisah).
- **TIDAK** ada `.git` di parent `kartoloapp/` (parent cuma container folder).
- **TIDAK** ada `.git` di dalam folder developer (`reza/`).
- Setiap repo punya `.gitignore` sendiri (lihat di MVP: `node_modules`, `.env`, `dist`, `build`, `.cache`, dst).

### 11.3 Pola Developer Folder + Module Registry

Pola ini didesain agar **multiple developer bisa bekerja paralel di app yang sama tanpa konflik**.

**Aturan inti:**

1. **Setiap developer punya folder namanya sendiri** di akar `src/`-level (untuk FE) atau `src/`-level (untuk BE). Contoh: `reza/`, nanti `budi/`, `siti/`, dst.

2. **Kode produksi developer ada di `<nama>/modules/<nama-modul>/`.** Setiap modul punya struktur file standar dan **wajib export sebuah manifest** lewat `index.ts`.

3. **Manifest modul (contoh BE):**
   ```ts
   // backend_gatewayauth/reza/modules/auth/index.ts
   export const authModule = {
     name: 'auth',
     owner: 'reza',
     register: async (app: FastifyInstance) => {
       app.register(authRoutes, { prefix: '/api/v1/auth' });
     },
   };
   ```

4. **Manifest modul (contoh FE):**
   ```ts
   // frontend_kartoloapps/reza/modules/portal/index.ts
   export const portalModule = {
     name: 'portal',
     owner: 'reza',
     routes: [
       { path: '/portal', element: <PortalPage /> },
     ],
   };
   ```

5. **Central registry** (`src/registry.ts`) meng-import dan mendaftarkan semua modul. Inilah satu-satunya tempat yang "tahu" semua modul:
   ```ts
   // backend_gatewayauth/src/registry.ts
   import { authModule } from '../reza/modules/auth';
   import { portalModule } from '../reza/modules/portal';
   // ... future: import { reportModule } from '../budi/modules/reports';

   export const modules = [authModule, portalModule, /* ... */];
   ```

6. **Cross-developer integration** dilakukan via path import absolute:
   ```ts
   // budi bisa pakai service dari reza:
   import { userService } from '@/reza/modules/administration/users/users.service';
   ```
   Path alias `@/` mapped ke root `src/` di tsconfig & vite/tsup config.

7. **Code review etiquette:** kalau dev B ubah modul yang owned dev A, wajib request review ke A. Konvensi via CODEOWNERS file.

8. **Shared code** (yang dipakai >1 dev) ditempatkan di `src/shared/`, **bukan** di folder personal. Setiap penambahan ke `shared/` wajib direview.

> **CATATAN ASUMSI:** Pola ini diasumsikan sebagai **module ownership pattern** dalam satu repo, BUKAN git submodule, BUKAN worktree per developer. Folder personal di-commit ke repo yang sama. Konfirmasi sebelum Phase 0 — kalau salah arah, perlu rework struktur folder.

### 11.4 Hubungan dengan Folder `kartoloapp/` (Parent)

- Parent `kartoloapp/` adalah **container saja**, bukan workspace pnpm/turborepo (di MVP).
- Tidak ada `package.json` di parent.
- **`docker-compose.yml` ditempatkan di parent** karena meng-orchestrate dua app (`frontend_kartoloapps`, `backend_gatewayauth`) + infra (postgres, redis, mailhog). Compose file me-reference Dockerfile di masing-masing app folder.
- File `docker-compose.yml` di parent **bukan** masuk ke git repo manapun (parent bukan repo). Konsekuensi: kalau mau di-version-control, perlu strategi tersendiri:
  - **Opsi A (recommended):** taruh `docker-compose.yml` di repo `backend_gatewayauth` (karena backend yang paling kebergantungan ke infra), parent jadi symlink atau salinan.
  - **Opsi B:** buat repo ke-3 khusus infra/devops di level parent.
  - **Opsi C (MVP shortcut):** parent tidak di-track, developer baru dapat `docker-compose.yml` lewat dokumentasi/onboarding.
  - **Default PRD:** Opsi C untuk MVP, naik ke A kalau tim membesar.
- Kalau di masa depan diperlukan shared lib antar FE/BE (e.g., shared TS types), bisa di-promote jadi monorepo (pnpm workspaces + turborepo) — lihat Section 17 (Future).

### 11.5 Docker Compose Layout

**File `kartoloapp/docker-compose.yml`** (gambaran konseptual, bukan kode final). **Postgres TIDAK ada di sini — di-install di host.**

```yaml
services:
  web:                              # frontend_kartoloapps
    container_name: kartolo-web
    build:
      context: ./frontend_kartoloapps
      dockerfile: Dockerfile.dev    # override di prod
    ports: ["5173:5173"]
    volumes:
      - ./frontend_kartoloapps:/app
      - kartolo_web_node_modules:/app/node_modules
    environment:
      - VITE_API_BASE_URL=http://localhost:3000/api/v1
    depends_on: [api]

  api:                              # backend_gatewayauth
    container_name: kartolo-api
    build:
      context: ./backend_gatewayauth
      dockerfile: Dockerfile.dev
    ports: ["3000:3000"]
    volumes:
      - ./backend_gatewayauth:/app
      - kartolo_api_node_modules:/app/node_modules
    environment:
      # Postgres ada di HOST, bukan container. Akses via host.docker.internal.
      - DATABASE_URL=postgresql://kartolo:${POSTGRES_PASSWORD}@host.docker.internal:5432/kartolo?schema=gateway_auth
      - REDIS_URL=redis://redis:6379
      - JWT_SECRET=${JWT_SECRET}
      - SMTP_HOST=mailhog
      - SMTP_PORT=1025
    extra_hosts:
      # Wajib di Linux supaya host.docker.internal resolve ke host gateway.
      # Di Mac/Windows Docker Desktop sudah otomatis, baris ini tidak harmful.
      - "host.docker.internal:host-gateway"
    depends_on: [redis, mailhog]    # NOTE: tidak ada postgres di sini

  redis:
    image: redis:7-alpine
    container_name: kartolo-redis
    ports: ["6379:6379"]
    volumes:
      - kartolo_redis_data:/data
    command: redis-server --appendonly yes
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s

  mailhog:
    image: mailhog/mailhog:latest
    container_name: kartolo-mailhog
    ports: ["1025:1025", "8025:8025"]

volumes:
  kartolo_web_node_modules:
  kartolo_api_node_modules:
  kartolo_redis_data:

networks:
  default:
    name: kartolo-network
```

**Setup PostgreSQL di host (one-time):**

Karena Postgres tidak via Docker, developer wajib setup manual setelah install Postgres 15+. Script `kartoloapp/scripts/setup-postgres.sh` membungkus langkah berikut — file SQL sumber ada di `kartoloapp/infra/postgres/init.sql`:

```sql
-- kartoloapp/infra/postgres/init.sql
-- 1. Buat DB user (di psql sebagai superuser)
CREATE USER kartolo WITH PASSWORD 'devpass';

-- 2. Buat database
CREATE DATABASE kartolo OWNER kartolo;

-- 3. Connect ke database kartolo, lalu buat schema
\c kartolo
CREATE SCHEMA IF NOT EXISTS gateway_auth AUTHORIZATION kartolo;
```

Atau via shell langsung:
```bash
psql -U postgres -f kartoloapp/infra/postgres/init.sql
```

**Allow connection dari Docker network ke Postgres host:**

Edit `postgresql.conf`:
```
listen_addresses = '*'    # atau spesifik 'localhost,172.17.0.1'
```

Edit `pg_hba.conf` — tambahkan baris untuk Docker default bridge network:
```
# TYPE  DATABASE  USER     ADDRESS         METHOD
host    kartolo   kartolo  172.17.0.0/16   scram-sha-256
host    kartolo   kartolo  172.18.0.0/16   scram-sha-256   # range network Compose
```

Restart Postgres setelah ubah config.

> **CATATAN:** Untuk produk masa depan (Bot Trading AI), tambah schema baru manual: `CREATE SCHEMA trading_bot AUTHORIZATION trading_bot_user;` dengan DB user terpisah supaya isolasi tetap terjaga.

**Catatan lain:**
- Healthcheck di redis memastikan `depends_on` di api tidak start sebelum redis siap.
- API tidak punya healthcheck dependency ke Postgres (karena Postgres bukan di compose) — backend wajib retry connection di startup dengan backoff, gagal terus baru exit.
- `docker-compose.override.yml` (auto-loaded di dev) bisa berisi tweak yang tidak masuk prod (e.g., debug logger level).
- **Sub-app future (e.g., Bot Trading API) WAJIB ditambahkan ke compose ini, BUKAN di compose terpisah.** Service block sub-app **tidak punya `ports:` di production** (only `expose:` untuk internal Docker network). Di dev, port boleh di-expose untuk debugging direct (e.g., dengan profile flag `--profile dev-debug`), tapi default = closed. Contoh:
  ```yaml
  trading-bot-api:
    container_name: kartolo-trading-bot-api
    build: ./backend_tradingbot
    # ports: tidak ada — hanya gateway yang bisa reach
    expose: ["3001"]
    environment:
      - DATABASE_URL=postgresql://trading_bot_user:...@host.docker.internal:5432/kartolo?schema=trading_bot
      - REDIS_URL=redis://redis:6379
      - GATEWAY_PUBLIC_KEY_URL=http://api:3000/.well-known/jwks.json
    depends_on: [redis]
  ```
  Gateway `api` container menjangkau via `http://trading-bot-api:3001` (service name di Docker network). Browser HANYA bisa via `http://localhost:3000/api/v1/proxy/trading-bot/...`.

### 11.6 Dockerfile Strategy

**`Dockerfile.dev` (kedua app):**
- Base: `node:20-alpine` (atau `node:20` kalau butuh native module).
- Install `pnpm` global.
- WORKDIR `/app`.
- Entry: `pnpm install && pnpm dev` (atau via entrypoint script supaya install hanya kalau lock berubah).
- Expose port (5173 untuk web, 3000 untuk api).

**`Dockerfile` (production, multi-stage):**

Frontend:
1. **Stage 1 (builder):** `node:20-alpine`, install deps, `pnpm build` → output `/app/dist`.
2. **Stage 2 (runtime):** `nginx:alpine` atau `caddy:alpine`, copy `/app/dist` ke web root, custom config untuk SPA fallback ke `index.html`.

Backend:
1. **Stage 1 (builder):** install deps, run `prisma generate`, compile TS (`pnpm build`).
2. **Stage 2 (runtime):** `node:20-alpine` slim, copy `dist/` + `node_modules` (prod only via `pnpm install --prod`), copy `prisma/`, entry: `node dist/server.js`. Run as non-root user.

**Hot reload di dev:**
- Frontend: Vite HMR works in container kalau `vite.config.ts` set `server.host = '0.0.0.0'` dan `server.hmr.host = 'localhost'` (atau pakai polling kalau di WSL2/Windows: `server.watch.usePolling = true`).
- Backend: `tsx watch src/server.ts` atau `nodemon` dengan `--legacy-watch` di Windows/WSL.

---

## 12. Development Phases & Milestones

### Phase 0: Foundation (Week 1)

**Goal:** Repo setup, dev environment (app + Redis di Docker, Postgres di host), response envelope + signature middleware ready.

- [ ] Install PostgreSQL 15+ di host. Buat user `kartolo`, database `kartolo`, schema `gateway_auth` via `kartoloapp/infra/postgres/init.sql`.
- [ ] Konfigurasi `postgresql.conf` (`listen_addresses`) + `pg_hba.conf` (allow Docker network).
- [ ] Init folder `frontend_kartoloapps/` + `git init` di dalamnya.
- [ ] Init folder `backend_gatewayauth/` + `git init` di dalamnya.
- [ ] Setup TypeScript + ESLint + Prettier di kedua app.
- [ ] Tulis `Dockerfile.dev` + `Dockerfile` (prod multi-stage) + `.dockerignore` di kedua app.
- [ ] `vite.config.ts` set `server.host=0.0.0.0`, HMR config untuk container.
- [ ] Backend dev entry pakai `tsx watch` atau `nodemon` listen di `0.0.0.0:3000`.
- [ ] Tulis `docker-compose.yml` di parent dengan **4 service** (web, api, redis, mailhog) sesuai Section 11.5. **TIDAK ada service postgres.**
- [ ] Tulis `infra/` + `scripts/` + `backups/` di parent sesuai Section 11.1.
- [ ] Backend: Fastify hello-world + health endpoint + connect Prisma (ke Postgres host via `host.docker.internal`) + Redis (lewat service name container).
- [ ] Backend startup wajib retry-with-backoff connect Postgres (karena tidak ada compose `depends_on` ke Postgres).
- [ ] **Backend `shared/errors/response-codes.ts`** dengan tabel rc/status mapping (Section 10.3). Helper `responseEnvelope(type, opts)` + `AppError` class + global error handler. Semua handler return envelope standar.
- [ ] **Backend middleware `signatureGuard`** (Section 10.4 + 10.5): validasi `X-Timestamp` + `X-Client-Id` + `X-Client-Secret` + `X-Signature`. Skip untuk `/health`, `/ready`, `/.well-known/*`.
- [ ] **Logger middleware redact 4 header signature** dan field `password`, `token`, `secret` di body.
- [ ] Prisma schema awal (`users`, `units`, `roles`, `user_roles`, **`api_clients`**) dengan `@@schema("gateway_auth")`. Jalankan `prisma migrate dev` (dari dalam container api).
- [ ] **Seed `api_clients`**: 1 entry `kartolo-web-frontend` (type=web_frontend). Print client_id+secret saat seed supaya bisa di-set ke `.env` frontend.
- [ ] Setup developer folder pattern + registry di kedua app.
- [ ] **Frontend API client wrapper** yang otomatis append 4 header signature (`X-Timestamp`, `X-Client-Id`, `X-Client-Secret`, `X-Signature`) ke setiap request. Signing util shared di `src/shared/lib/api-signer.ts`.
- [ ] **Frontend env**: `VITE_CLIENT_ID`, `VITE_CLIENT_SECRET` di `.env` (gitignored). Build pipeline inject.
- [ ] `.env.example` lengkap untuk semua service termasuk client_id/secret placeholder.
- [ ] GitHub Actions: lint + test + build Docker image (no deploy).

**Definition of Done:**
- Postgres host running, DB `kartolo` + schema `gateway_auth` + tabel awal (`api_clients` included) ada.
- `docker compose up` di parent menjalankan **4 container** (web, api, redis, mailhog).
- Browser akses `http://localhost:5173` lihat halaman login dummy. Setiap request dari FE ke BE membawa 4 header signature dan lulus validasi.
- `http://localhost:3000/health` return 200 dengan envelope `{rc:"00", status:200, message:"OK", error:null, data:{trace_id:"..."}}`.
- Test: request tanpa header → response `{rc:"92", status:400, ...}`. Request dengan signature salah → `{rc:"93", ...}`. Request dengan body invalid → `{rc:"94", ...}`.
- Edit file di host langsung reflect di container (hot reload jalan).
- `prisma migrate dev` sukses dari dalam container api.

### Phase 1: Authentication Core (Week 2-3)

- [ ] Modul `auth` di BE: register endpoint (untuk seed superadmin), login, logout, refresh.
- [ ] Argon2id password hashing.
- [ ] JWT (access + refresh) dengan rotation.
- [ ] Redis blacklist untuk revoked token.
- [ ] Rate limit + login lockout.
- [ ] Email verification (set-password flow, via MailHog di dev).
- [ ] Password reset flow.
- [ ] Modul `auth` di FE: login page, set-password page, forgot/reset password page.
- [ ] Audit logging untuk semua action auth.

**DoD:** Superadmin pertama bisa di-seed, login, logout. Reset password lewat email berfungsi.

### Phase 2: 2FA & Session Management (Week 4)

- [ ] 2FA TOTP setup endpoint + backup codes.
- [ ] Enforce 2FA untuk user_type 1, 2 saat login.
- [ ] Session list + revoke endpoint + UI.
- [ ] Change password endpoint.

**DoD:** Superadmin/Admin wajib pakai 2FA. User bisa lihat & revoke sesi.

### Phase 3: Portal + `/me` Endpoint (Week 5)

- [ ] `GET /api/v1/me` (user info + accessible products + roles + unit).
- [ ] `GET /api/v1/portal/products` (product list dengan permission resolution).
- [ ] Permission resolution logic + Redis cache (TTL 5 menit).
- [ ] Portal page UI (product cards).
- [ ] Empty state, loading state, error state.

**DoD:** User Member login → portal kosong (belum ada produk ter-register). Superadmin login → portal tampilkan "Administration" card.

### Phase 4: Administration Module (Week 6-8)

- [ ] User CRUD UI + API (FR-ADMIN-01).
- [ ] Role CRUD UI + API.
- [ ] Unit CRUD UI + API (dengan tree view kalau hierarchical).
- [ ] Product CRUD UI + API (Superadmin only).
- [ ] Product permission matrix UI.
- [ ] Audit log viewer.
- [ ] API token management (basic).

**DoD:** Superadmin bisa create user baru lewat UI, assign role+unit, register "Bot Trading AI" sebagai produk dummy (link ke URL placeholder), set permission, dan user yang sesuai bisa lihat card-nya di portal.

### Phase 5: API Gateway & SSO (Week 9-11)

**Goal:** Backend_gatewayauth jadi true API Gateway. Sub-app accessible HANYA via gateway.

**Phase 5a: SSO Identity (Week 9)**
- [ ] `POST /api/v1/sso/verify` endpoint.
- [ ] `GET /.well-known/jwks.json` (switch ke RS256 untuk asymmetric).
- [ ] Dokumentasi integrasi untuk sub-app (`docs/sso-integration.md`).

**Phase 5b: Gateway Core (Week 10)**
- [ ] Tabel `gateway_services`, `gateway_routes`, `gateway_request_logs` (migration).
- [ ] CRUD endpoint `/gateway/services/*` + `/gateway/routes/*` (Superadmin only).
- [ ] Admin UI untuk service & route management.
- [ ] Proxy middleware (HTTP) pakai `@fastify/http-proxy` (atau equivalent):
  - Route matching (longest-prefix wins).
  - Header injection (`X-Forwarded-*`) + strip 4 header signature.
  - Body streaming (jangan buffer).
  - Per-route timeout + retry exponential backoff.
- [ ] Circuit breaker implementation + background health checker (BullMQ scheduled job atau cron in-process).
- [ ] Rate limit per route (Redis token bucket).
- [ ] Request logging ke `gateway_request_logs`.

**Phase 5c: WebSocket Proxy (Week 10-11)**
- [ ] WS proxy endpoint `/api/v1/ws/<slug>/*`.
- [ ] Auth check di handshake (HTTP upgrade).
- [ ] Bidirectional pipe + idle timeout.

**Phase 5d: Dashboard & Test (Week 11)**
- [ ] Gateway dashboard UI (service health overview, request count, error rate, p95).
- [ ] Live tail request log.
- [ ] **Dummy sub-app container** untuk E2E test:
  - Bind ke internal Docker network (tidak expose port).
  - Endpoint dummy: `/health`, `/echo` (POST yang return body + forwarded headers).
  - Validasi gateway forward header dengan benar.
- [ ] Test scenario:
  - Request `/api/v1/proxy/dummy-app/echo` lewat browser → response berisi `X-Forwarded-User-Id` dll.
  - Stop dummy sub-app → setelah 3 health check fail, circuit open, request balas `rc=95`.
  - Restart dummy → setelah half-open success, circuit closed lagi.
  - Coba akses dummy sub-app langsung dari host browser → connection refused (port tidak expose).

**DoD:**
- Superadmin register dummy service via UI → routes tampil di gateway dashboard.
- Request via gateway sukses dengan forwarded headers.
- Request direct ke sub-app dari luar Docker network ditolak (network-level).
- Circuit breaker terbukti jalan (open + recover).
- WebSocket proxy berfungsi untuk dummy WS endpoint.

### Phase 6: Polish & Production Prep (Week 10-11)

- [ ] Email notification system lengkap.
- [ ] Comprehensive monitoring (logs, metrics, error tracking).
- [ ] Load testing dasar (k6).
- [ ] Security audit (manual + `pnpm audit`, snyk).
- [ ] Documentation lengkap (`README`, `docs/`).
- [ ] Deploy ke staging environment.

**DoD:** Aplikasi siap untuk integrasi pertama dengan Bot Trading AI.

---

## 13. Acceptance Criteria (General)

Setiap feature dianggap selesai kalau:

1. **Functional:** Sesuai requirement, jalan via UI dan API.
2. **Tested:** Unit test untuk logic, integration test untuk flow, manual test pass.
3. **Documented:** API docs auto-gen via Fastify schema, README di-update kalau perlu.
4. **Reviewed:** Code review approved.
5. **Audit-ready:** Action sensitif ter-log.
6. **Permission-checked:** Endpoint protected sesuai user type/role/unit.
7. **Error-handled:** Tidak ada unhandled rejection / uncaught exception.
8. **Performant:** Memenuhi target di Section 8.1.

---

## 14. Coding Conventions

### 14.1 TypeScript (Frontend & Backend)

- Strict mode ON (`"strict": true`).
- No `any` (use `unknown` + type guards).
- Functions return type explicit untuk public API.
- Naming: `camelCase` variables/functions, `PascalCase` types/classes, `SCREAMING_SNAKE` constants.
- File naming: `kebab-case.ts` (e.g., `auth.controller.ts`).
- Backend module structure: `*.controller.ts` (routes), `*.service.ts` (business logic), `*.repository.ts` (DB), `*.schema.ts` (zod), `*.types.ts`.

### 14.2 React (Frontend)

- Functional components only.
- Hooks naming: `use*` prefix.
- TanStack Query untuk semua server state.
- Zustand untuk client-only state (UI toggle, dll).
- Page file: `<Name>Page.tsx`, component file: `<Name>.tsx`.
- No inline styles (gunakan Tailwind atau component variants).

### 14.3 Git

- Conventional Commits: `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`.
- Branch naming: `feature/short-description`, `fix/issue-123`, `chore/...`.
- PR template wajib.
- Squash merge ke main.
- **Setiap commit menyebut modul owner kalau cross-folder:** misal `feat(reza/auth): add 2FA backup codes`.

### 14.4 Logging

- Structured (JSON) di production.
- Levels: `error`, `warn`, `info`, `debug`.
- Selalu include `traceId` dan `userId` (kalau ada).
- **JANGAN log:** password, full token, full API key, 2FA secret, PII tidak perlu.

### 14.5 Bahasa

- Code, comment, commit message: **English** (lebih portable).
- User-facing message (UI text, email, error message): **Bahasa Indonesia** (i18n-ready, kalau perlu English bisa ditambahkan).

---

## 15. Testing Strategy

### 15.1 Unit Tests
- Backend: Vitest.
- Frontend: Vitest + React Testing Library.
- Target coverage: 70%+ untuk business logic, 90%+ untuk permission resolution & auth flow (kritis).

### 15.2 Integration Tests
- Backend: Vitest + Testcontainers (real Postgres + Redis di test).
- Test flow kritis: register/login, password reset, 2FA setup, permission resolution, product access.

### 15.3 E2E Tests
- Playwright untuk frontend critical path.
- Minimum: login → portal → buka product (link saja, tidak harus integrate).
- Login dengan 2FA: pakai TOTP library di test untuk generate code.

### 15.4 Load Tests
- k6 untuk API critical (login, /me, /portal/products).
- Target di Section 8.1.

### 15.5 Test Data
- Seed: 1 Superadmin, 2 Admin, 5 Member, 3 Unit, 5 Role, 2 Product dummy.
- Mock email transport di test (capture, jangan kirim).

---

## 16. Deployment & DevOps

### 16.1 Environment

- **dev** (local): `docker compose up` di parent folder menjalankan **4 service di Docker** (web, api, redis, mailhog). **PostgreSQL di-install langsung di host** (bukan container). Detail di Section 5.1 + 11.5 + 11.6.
- **staging**: cloud, persistent, mirror production. Image yang sama dengan production (cuma env vars beda). Postgres pakai managed service.
- **production**: cloud, scale ready. Pakai `Dockerfile` (multi-stage, optimized), bukan `Dockerfile.dev`. Postgres pakai managed service.

### 16.2 Deployment Flow

- Push to `main` (per repo) → CI runs tests → build image → push to registry → deploy staging.
- Manual promotion staging → production.
- DB migration jalan otomatis via release task (sebelum app baru start).

### 16.3 Rollback

- Setiap deploy ada image tag (commit SHA).
- Rollback = redeploy image lama (1 command).
- DB migration HARUS reversible.

### 16.4 Secrets Management

- Dev: `.env` (gitignored).
- Staging/prod: platform secret manager (Doppler / AWS Secrets Manager / Fly.io secrets).
- JWT private key (RS256) HANYA di secret manager production, tidak boleh di repo.

### 16.5 Database & Cache

- **Postgres single instance**, multi-schema. Tiap app punya schema dengan **DB user terpisah** dan permission terbatas (hanya akses schema-nya).
  - **Di dev:** Postgres **di-install langsung di host** (bukan container). Lihat Section 5.1 + 11.5. Data persistent di filesystem host (e.g., `/var/lib/postgresql/15/` di Linux).
  - **Di prod:** managed Postgres (RDS, Cloud SQL, Supabase, dll). Backend container connect via DSN dari secret manager.
- **Redis single instance**, key prefix per app (`kartolo:*`, `trading_bot:*`).
  - **Di dev:** container `kartolo-redis` dengan named volume `kartolo_redis_data` supaya data persistent antar `docker compose down/up`. Reset total: `docker compose down -v`.
  - **Di prod:** managed Redis (ElastiCache, Upstash, dll).

---

## 17. Risks & Mitigations

| Risk | Impact | Likelihood | Mitigation |
|---|---|---|---|
| Permission logic bug → user akses produk yang harusnya tidak | Tinggi | Sedang | Test coverage 90%+ permission resolution, integration test, defense-in-depth (FE + BE check) |
| JWT private key bocor | Sangat Tinggi | Rendah | KMS/Secret manager, rotation policy, monitor access |
| Folder dev jadi monolith besar yang sulit di-maintain | Sedang | Sedang | Module manifest, CODEOWNERS, review wajib lintas folder |
| Konflik antar developer di shared/ | Sedang | Sedang | Aturan ketat penambahan ke shared (review wajib), prefer composition |
| Sub-app tidak compatible dengan SSO model | Sedang | Sedang | Sediakan 2 mode (stateless verify + introspect endpoint), dokumentasi jelas |
| Schema gateway_auth conflict dengan schema sub-app | Rendah | Rendah | DB user terpisah per schema, FK cross-schema dilarang di MVP |
| Migrasi pnpm workspaces nanti memerlukan rework | Rendah | Sedang | Struktur folder dijaga supaya migrasi ke monorepo minim disrupsi |
| Asumsi User Unit salah arah (tenant vs unit organisasi) | Tinggi | Sedang | Konfirmasi user sebelum Phase 1, schema fleksibel cukup di-tweak |
| Developer baru bingung dengan pola dev folder | Sedang | Tinggi | `docs/developer-folder-guide.md` wajib, onboarding session |
| Gateway jadi single point of failure (semua traffic lewat sini) | **Sangat Tinggi** | Sedang | Scale horizontal di belakang LB, health check ketat, deploy zero-downtime, monitoring + alert agresif |
| Latensi tambahan karena hop gateway → sub-app | Sedang | Tinggi | Connection pool ke upstream, HTTP keep-alive, p95 target <50ms overhead. Co-locate gateway + sub-app di region/AZ yang sama |
| Gateway compromise → akses ke semua sub-app | Sangat Tinggi | Rendah | Defense-in-depth: sub-app re-verify JWT untuk endpoint sensitif, network policy strict, audit log lengkap, secret rotation rutin |
| Admin salah register route → expose endpoint internal sub-app yang sensitif | Tinggi | Sedang | Validasi route saat create (warn kalau pattern terlalu broad seperti `/*`), default `requires_auth=true`, hanya Superadmin yang boleh CRUD route, audit log mandatory |
| Sub-app developer asumsikan accessible direct → bypass header check | Tinggi | Sedang | Dokumentasi jelas, contract test di CI sub-app, sub-app refuse kalau request datang tanpa `X-Forwarded-*` (di prod) |
| Volume `gateway_request_logs` jadi besar | Sedang | Tinggi | TimescaleDB hypertable + compression, retention policy 30 hari hot + archive ke S3 |
| WebSocket connection leak / memory exhaust di gateway | Sedang | Sedang | Max concurrent WS per user, idle timeout, monitoring connection count |

---

## 18. Glossary

| Term | Definition |
|---|---|
| **Kartolo SuperApps** | Platform portal yang jadi gerbang utama ke semua produk. |
| **Gateway Auth** | Backend service yang handle autentikasi dan otorisasi, sekaligus jadi SSO provider. |
| **Sub-App / Sub-Product** | Aplikasi yang terdaftar di Kartolo dan di-launch dari portal (e.g., Bot Trading AI). |
| **User Type** | Level akses sistem (1=Superadmin, 2=Admin, 3=Member). |
| **User Role** | Peran fungsional user (data-driven, banyak-ke-banyak). |
| **User Unit** | Unit organisasi user (data-driven, satu user satu unit utama). |
| **Module** | Unit kode dalam developer folder yang punya manifest dan di-register ke central registry. |
| **Registry** | File `src/registry.ts` yang meng-import semua modul untuk diaktifkan saat boot. |
| **Product Permission** | Aturan yang menentukan kombinasi (role, unit, user_type) apa yang bisa lihat sebuah produk. |
| **SSO** | Single Sign-On — login sekali, akses semua sub-app. |
| **JWKS** | JSON Web Key Set, set public key untuk verify JWT. |
| **TOTP** | Time-based One-Time Password (2FA standard, kompatibel Google Authenticator). |
| **API Gateway** | Komponen yang jadi single entry point untuk semua API, menangani auth, routing, rate-limit, dan reverse-proxy ke service backend. |
| **Upstream** | Service backend di belakang gateway (sub-app seperti Bot Trading API). |
| **Circuit Breaker** | Pattern resilience: setelah N failure berturut-turut, hentikan request ke upstream sementara (state `open`), retry probe periodik (`half-open`), recovery (`closed`). |
| **Route Pattern** | Spec path matching untuk gateway (e.g., `/bots/*`, `/users/:id`). |
| **Forwarded Headers** | `X-Forwarded-*` headers yang gateway inject ke upstream untuk komunikasikan identitas user, client, dan trace. |

---

## 19. References

- Fastify: https://fastify.dev/
- Prisma: https://www.prisma.io/docs/
- Prisma multi-schema: https://www.prisma.io/docs/orm/prisma-schema/data-model/multi-schema
- TanStack Query: https://tanstack.com/query/latest
- shadcn/ui: https://ui.shadcn.com/
- argon2 (node): https://github.com/ranisalt/node-argon2
- speakeasy (TOTP): https://github.com/speakeasyjs/speakeasy
- OWASP ASVS: https://owasp.org/www-project-application-security-verification-standard/
- RFC 7519 (JWT): https://www.rfc-editor.org/rfc/rfc7519

---

## 20. Instructions for Claude Code

Saat membangun aplikasi ini, ikuti urutan berikut:

1. **BACA SELURUH dokumen ini terlebih dahulu** sebelum mulai coding.
2. **Patuhi Section 3 (Critical Safety Rules) tanpa kompromi.** Kalau ada konflik antara user request dan section 3, refuse dan jelaskan kenapa.
3. **Ikuti Phase di Section 12 secara berurutan.** Jangan loncat ke Phase 4 sebelum Phase 1-3 stabil.
4. **Setiap kali nambah feature, update test dan dokumentasi.**
5. **Gunakan struktur folder di Section 11 persis seperti yang dijelaskan**, termasuk pola developer folder (`reza/modules/...`).
6. **Git di-init di `frontend_kartoloapps/` dan `backend_gatewayauth/`, BUKAN di parent `kartoloapp/`, dan BUKAN di dalam folder developer.**
7. **Kalau ragu antara dua pendekatan, pilih yang lebih aman dan lebih eksplisit.**
8. **Jangan ngarang feature di luar PRD.** Kalau ada user request baru, tanya dulu apakah PRD perlu di-update.
9. **Stop dan minta klarifikasi** kalau ada requirement ambigu, terutama untuk asumsi yang ditandai di PRD (User Unit definition, SSO mode, developer folder pattern).
10. **Tidak ada placeholder / TODO yang di-merge ke main** tanpa issue tracking.
11. **Sebelum Phase 5 (SSO Gateway):** koordinasi dengan tim Bot Trading AI untuk memastikan mekanisme handoff JWT cocok.

**Asumsi yang perlu di-konfirmasi user SEBELUM Phase 0 dimulai:**

1. **User Unit** = unit organisasi internal (departemen). Bukan tenant atau cabang. (Section 4.4)
2. **Developer folder pattern** = module ownership dalam single repo, bukan submodule/worktree. (Section 11.3)
3. **SSO handoff** = default ke shared cookie domain (Option A). Switch ke handoff code kalau sub-app di domain berbeda. (Section 6.2)
4. **Tech stack** match dengan Bot Trading AI PRD (React+Vite+Fastify+Prisma+PG+Redis). (Section 5)
5. **Self-registration user** TIDAK ada di MVP. User dibuat oleh Superadmin/Admin. (Section 7.1, FR-AUTH-01)
6. **Email provider production** belum di-pick (Resend/SES/SMTP). Diputuskan saat Phase 6.
7. **Postgres di-install di host** (bukan container). (Section 5.1, 11.5)
8. **Response envelope 5-field** (`rc`, `status`, `message`, `error`, `data`) dipakai untuk SEMUA response termasuk error. `trace_id` di dalam `data`. (Section 10.2)
9. **`not_found` map ke HTTP 400** (bukan 404) sesuai spec rc=14. Sub-app/integrator perlu aware. (Section 10.3)
10. **4 header signature mandatory** (`X-Timestamp`, `X-Client-Id`, `X-Client-Secret`, `X-Signature`) untuk semua endpoint `/api/v1/*` kecuali health/jwks. (Section 10.4 & 10.5)
11. **Web frontend menyimpan `client_id+secret` di JS bundle** (Opsi A di Section 10.5.3). Acceptable untuk B2B internal use case. Kalau Kartolo mau dipakai eksternal, ganti ke BFF pattern.
12. **Semua artefak project di dalam `kartoloapp/`** — tidak ada file di luar folder ini. (Section 11.0)
13. **`backend_gatewayauth` = TRUE API Gateway.** Sub-app (Bot Trading API, dst) HANYA accessible via `/api/v1/proxy/<slug>/*`, tidak boleh punya public DNS/IP/port sendiri. (Section 6.4, 7.5)
14. **Sub-app trust forwarded headers** (`X-Forwarded-User-Id`, dll) sebagai default. Sub-app sensitif boleh re-verify JWT via JWKS untuk defense-in-depth. (Section 6.4)
15. **WebSocket proxy** included di MVP gateway (dibutuhkan Bot Trading AI untuk realtime tick). (FR-GW-04)
16. **Hanya Superadmin** yang bisa CRUD service/route gateway. Salah register route bisa expose endpoint internal. (FR-GW-01, FR-GW-02)

**Pre-flight check sebelum Phase 0:**
- Konfirmasi 6 asumsi di atas.
- Pastikan **Docker Desktop** (Mac/Windows) atau **Docker Engine + Compose v2** (Linux) terinstall di mesin dev. **Node tidak perlu di host** (jalan di container).
- Pastikan **PostgreSQL 15+ terinstall dan running di host** (bukan di Docker). Buat user/db/schema sesuai Section 11.5.
- Konfigurasi Postgres host (`postgresql.conf` + `pg_hba.conf`) supaya bisa diakses dari Docker network.
- Pastikan port 5173, 3000, 5432, 6379, 1025, 8025 tidak occupied di host (5432 dipakai Postgres host).
- Generate JWT secret untuk dev (`openssl rand -hex 32`).
- WSL2 user: enable WSL2 backend di Docker Desktop, dan pertimbangkan taruh folder project di filesystem Linux (`~/projects/`) bukan di `/mnt/c/` atau `/mnt/d/` supaya bind-mount file watching cepat. **Catatan:** kalau Postgres di-install di Windows host (bukan di WSL Linux), backend container yang jalan via Docker Desktop WSL backend tetap bisa reach via `host.docker.internal` — Docker Desktop sudah handle network bridge ini.

---

**End of PRD v1.0.0 — Kartolo SuperApps**
