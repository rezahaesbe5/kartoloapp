# Kartolo SuperApps — Project Instructions

File ini auto-loaded tiap sesi. **Jaga tetap pendek** — detail panjang ada di memory files
(lazy-loaded, dibaca saat relevan).

---

## Project Overview

**Kartolo SuperApps** = portal multi-produkt + admin IAM. Ecosystem:

```
frontend_kartoloapps :5173  (Vite SPA, React — dev)
   └── backend_gatewayauth :3000  (TRUE gateway: auth, captcha, signature, WS proxy, forwarding, portal cache)
            └── backend_administration :3001  (audit, logs, IAM, data — HANYA via gateway)
   ├── Postgres host :5433  (db_kartolo, schema: gateway_auth)
   └── Docker observability: kartolo-redis :6379, kartolo-loki :3100, kartolo-alloy :12345
```

**PRD**: [PRD_KARTOLOAPPS.md](PRD_KARTOLOAPPS.md)

---

## Aturan Arsitektur (WAJIB)

### HTTP & Forwarding
- Client **HANYA** bicara ke gateway `:3000`. Administration **tidak punya public port**.
- Gateway forward ke admin via `mst_endpoint.backend_url` + Docker internal DNS (`administration:3001`).
- **Setelah deploy, jalankan seed** (`docker exec kartolo-gateway node dist/prisma/seed.js`) —
  seed upsert `backend_url` ke `http://administration:3001`. Tanpa ini: rc=95 UPSTREAM_UNAVAILABLE.
- Response envelope **5 field**: `rc`, `status`, `message`, `error`, `data` (`trace_id` di dalam `data`). Jangan diubah.

### Signature & Auth
- Signature: HMAC-SHA512 + base64 + **3 header** (`X-Client-Id`, `X-Timestamp`, `X-Signature`).
  **PRD out-of-date** untuk topik ini — jangan ikut PRD.
- WS browser pakai Redis ticket short-lived (browser tidak bisa custom header).
- `mfa_required` field di response login (BUKAN rc baru). MFA detail: memory `kartolo_mfa`.

### Redis
- Redis = **cache + session + captcha + WS-ticket**.
- Admin cache data (prefix `kartolo:ad:`) — cache-aside + invalidate-on-write.
- Gateway cache portal per-user (prefix `kartolo:portal:`) — invalidate via **Pub/Sub** ke channel
  `kartolo:cache:invalidate` (admin publish → gateway subscribe → invalidate portal realtime).
- Fallback fail-fast ke DB saat Redis down. Detail: memory `kartolo_admin_redis_cache`.

### Role-Based Product Access
- Akses produk per-role: `mst_produk.role_list` + tabel `map_user_role` (multi-role/user).
- `users.role_id` DI-DROP (per 2026-06-04). `role_list` NULL-allowed.
- superadmin bypass. Non-superadmin pilih role saat masuk produk (role-picker modal di PortalPage).
- role menentukan menu; di-clear saat keluar produk.
- Mapping: tombol "Mapping Role User" di menu useradmin; "Mapping Role" di menu produk.
- Detail: memory `kartolo_role_access_model`.

### User Status & Session
- Status yang bisa login: `active` + `force_change_password`.
- `force_change_password`: login → `ProtectedRoute` paksa ke `/auth/force-change-password` →
  sukses → backend auto set `active` + revoke semua sesi → paksa login ulang.
- `status` user **HARUS** dikirim di `/auth/login`, `/auth/mfa/verify`, **dan** `/auth/me`
  (di `SessionRecord` Redis) — `ProtectedRoute` baca dari situ.
- Single-session enforcement (rc=92) punya pengecualian **same-device** (IP+User-Agent sama → sesi lama diganti).

### Logging
- Backend tulis JSON log ke `<app>/logs/*.log` (bind mount per service). **Frontend TIDAK
  mencatat log** (per 2026-06-18) — `initClientLogger()` dimatikan di `main.tsx`; `logger.ts` &
  route gateway `/logs/client` + `frontendWriter` dibiarkan dormant (tak diimpor → tree-shaken).
- Alloy tail: `/logs-root/*/logs/*.log` → push ke Loki `http://loki:3100`.
- `LOG_LINK_MODE=hardlink`; fallback `copyFileSync` saat source & dest beda filesystem (EXDEV).
- Folder `logs/` aman dihapus: Docker recreate saat container start + writer `mkdirSync` + tulis file hari ini.
- Detail: memory `kartolo_logging_system`.

---

## Build & Deployment

### Folder `build/` (pre-compiled artifact)

Hasil `node scripts/build-production.mjs` → artifact siap push ke GitHub (branch `deploy`).

```
build/
├── build.sh                        # wrapper: build + up + seed (./build.sh all)
├── git-push.sh                     # add+commit+push ke branch deploy
├── .git-credentials.example        # template GitHub PAT
├── .env.gateway.example
├── .env.administration.example
├── .env.frontend.example           # template FE runtime env (di-commit)
├── .env.frontend                   # FE runtime env ACTUAL (gitignored, diedit manual)
├── docker-compose.yml              # 6 service: FE + gateway + admin + redis + loki + alloy
├── nginx.example.conf
├── infra/{loki,alloy}/config.*
├── frontend_kartoloapps/
│   ├── Dockerfile # node server.mjs (bukan serve)
│   ├── server.mjs                  # micro-server: inject .env.frontend ke index.html
│   └── dist/                       # Vite static (VITE_* TIDAK di-bake)
└── backend_{gatewayauth,administration}/dist/src/server.js
```

**File yang DIKIRIM ke Git** (di-commit): `dist/`, `Dockerfile`, `docker-compose.yml`,
`.gitignore`, `.example` files, `server.mjs`. **TIDAK dikirim**: `node_modules/`, `.env.gateway`,
`.env.administration`, `.env.frontend` (gitignored), `.git-credentials`, `logloki/`.

### Mekanisme build & run (Docker)

```bash
cd build

# Setup credential git (sekali)
cp .git-credentials.example .git-credentials
nano .git-credentials          # isi GitHub PAT

# Setup env (sekali — dari .example)
cp .env.gateway.example .env.gateway
cp .env.administration.example .env.administration
# Edit: DATABASE_URL, JWT_SECRET, MFA_ENCRYPTION_KEY, dll

# Build & run (wrapper otomatis)
./build.sh all                # build + up + seed
./build.sh status             # cek health

# Atau manual
docker compose build
docker compose up -d
docker exec kartolo-gateway node dist/prisma/seed.js   # SEKALI — upsert backend_url
```

### VPS Deploy (dari GitHub)

```bash
git clone -b deploy https://github.com/rezahaesbe5/kartoloapp.git /home/project/vibecode/kartoloapp/build
cd /home/project/vibecode/kartoloapp/build
cp .env.gateway.example .env.gateway
cp .env.administration.example .env.administration
cp .env.frontend.example .env.frontend     # FE runtime env (lihat catatan di bawah)
# edit: DATABASE_URL (Postgres VPS), JWT_SECRET, MFA_ENCRYPTION_KEY, INTERNAL_WS_SECRET
# edit .env.frontend: VITE_API_BASE_URL=/api/v1 (VPS+Nginx same-origin)
docker compose build
docker compose up -d
docker exec kartolo-gateway node dist/prisma/seed.js
# Nginx: lihat nginx.example.conf
```

### FE Runtime Env (ganti tanpa rebuild) — per 2026-06-10

**VITE_\* TIDAK lagi di-bake ke bundle JS.** FE pakai **runtime env injection**:
- `build/.env.frontend` di-mount ke container FE (bukan COPY) via `docker-compose.yml`.
- Micro-server `frontend_kartoloapps/server.mjs` (pengganti `serve`) baca `.env.frontend`
  saat **container start**, inject ke `index.html` → `window.__APP_ENV__ = {VITE_*}`.
- FE [env.ts](frontend_kartoloapps/src/shared/config/env.ts) baca `window.__APP_ENV__`
  (prod); fallback `import.meta.env` hanya di dev (gate `import.meta.env.DEV`).
- **Ganti value**: edit `build/.env.frontend` → `docker compose restart frontend_kartoloapps`.
  **TANPA rebuild bundle.** Detail: memory `kartolo_fe_runtime_env`.

### Bug fixes artifact Docker (WAJIB diingat saat build ulang)

1. **Prisma OpenSSL** — `node:22-alpine` butuh `apk add openssl` SEBELUM `npx prisma generate`.
   Kalau tidak: `libssl.so.1.1 not found` → backend crash saat query DB pertama.
   Di-fix di Dockerfile gateway & admin **DAN** di `scripts/build-production.mjs` (yang regen Dockerfile).
2. **`backend_url` localhost** — DB lama mungkin punya `localhost:3001`. Seed upsert ke
   `administration:3001` (Docker DNS). Jalankan seed setelah deploy (rc=95 kalau lupa).
3. **DB host dari container** — `127.0.0.1` dari DALAM container = loopback container, BUKAN host.
   Pakai `host.docker.internal` (Docker Desktop, resolve ke host Postgres `127.0.0.1:5433`).
   VPS native Linux: IP host atau `--add-host host.docker.internal:host-gateway`.
4. **Captcha gagal di FE (CLIENT_ID_MISSING / parse HTML)** — 2 sebab lama (per 2026-06-09):
   (a) `build-production.mjs` dulu cuma bake `VITE_API_BASE_URL`, TIDAK bake `VITE_CLIENT_ID`/
   `VITE_CLIENT_KEY` → FE kirim undefined. **Fix**: build script bake ketiganya.
   (b) FE Docker (`serve` :8080) TIDAK punya proxy `/api` → `VITE_API_BASE_URL=/api/v1` (relative)
   hit `serve` → dapat HTML (SPA fallback), bukan JSON. **Fix dev Docker**: build FE dengan
   `VITE_API_BASE_URL=http://127.0.0.1:3000/api/v1` (absolute, browser→gateway langsung) +
   `CORS_ORIGIN` include `http://127.0.0.1:8080`. **Di VPS**: Nginx same-origin proxy → `/api/v1` relative tetap benar.
   **Per 2026-06-10**: bake TIDAK diperlukan lagi — FE pakai runtime env (`.env.frontend` + micro-server).

### Nginx VPS (native)

```nginx
location / { proxy_pass http://127.0.0.1:8080; }
location /api/ { proxy_pass http://127.0.0.1:3000/api/; }
location /ws { proxy_pass http://127.0.0.1:3000/ws; upgrade $http_upgrade; }
```

---

## Konvensi Development

- **Docker-first**: observability stack di `docker-compose.observability.yml` (Redis + Loki + Alloy).
  Postgres di host. Backend/frontend native (`tsx watch`, `vite`).
- **WSL bind-mount `/mnt/d/`**: Vite & tsx watch **wajib `usePolling`** — inotify tidak trigger.
  Symptom: "feature baru tidak muncul". Detail: memory `kartolo_wsl_polling`.
- **DB dev**: `postgres / halamanrumah234 / db_kartolo` @ `127.0.0.1:5433`.
- **Folder ownership**: tiap developer punya folder sendiri di `backend_*/` dan `frontend_kartoloapps/`.
  Module ownership = folder ownership.

---

## Perintah Cepat

```bash
# Dev: observability (Docker)
docker compose -f docker-compose.observability.yml up -d
docker exec kartolo-redis redis-cli ping

# Dev: app servers (native, 3 terminal)
cd frontend_kartoloapps   && npm run dev          # :5173
cd backend_gatewayauth    && npm run dev          # :3000
cd backend_administration && npm run dev          # :3001

# Health
curl http://127.0.0.1:3000/health
curl http://127.0.0.1:3100/ready

# Auth helper untuk e2e/test (JANGAN re-derive login flow)
node -e "import('./scripts/auth-helper.js').then(async({loginSuperadmin,api})=>{const r=await loginSuperadmin();const roles=await api('POST','v1/administration/role/list',{page:1,page_size:5},r.token);console.log(roles);});"
```

---

## Auth Helper — `scripts/auth-helper.js`

Sudah teruji. Handle: captcha (dari Redis `kartolo:captcha:<id>`), AES-256-CBC password,
HMAC-SHA512 signature, MFA detection. **JANGAN baca-baca file auth lagi untuk re-derive flow.**

```js
import { loginSuperadmin, api } from './scripts/auth-helper.js';
const { token, user } = await loginSuperadmin();         // MFA harus disabled
const res = await api('POST', 'v1/administration/role/list', { page: 1, page_size: 5 }, token);
```

- `api(method, endpointUrl, body, token)` — `endpointUrl` TANPA prefix `/api/` (mis. `v1/auth/login`).
- MFA-aktif → `loginSuperadminIfNeeded(totpCode)` atau `resolveMfa(mfaToken, code)`.
- Credential default dari env seed; override via `SUPERADMIN_EMAIL/PASSWORD`, `CLIENT_ID/KEY`.
- MFA superadmin **di-disable per 2026-06-05** (untuk login otomatis). Detail: memory `kartolo_auth_test_helper`.

---

## Verifikasi

User pernah eksplisit: **"analisa dengan detail dan benar"** → verifikasi end-to-end nyata
(script API, uji sukses+error), **bukan cuma `tsc --noEmit`**. Typecheck = syarat perlu, bukan syarat cukup.
Detail: memory `feedback_thorough_verification`.

---

## Project History (kronologis, terbaru di atas)

### 2026-06-19 — Session `source_app`: login lintas source app
- **Masalah**: single-session enforcement menolak login (`ALREADY_LOGGED_IN`) saat user sudah punya
  sesi aktif dari device/IP berbeda, **tanpa peduli aplikasi sumber** → user tak bisa login bersamaan
  dari dua frontend berbeda (beda `client_id`).
- **Solusi**: tambah kolom `source_app` di tabel `sessions` (schema `gateway_auth`), diisi dengan
  `client_id` (`req.gwClient.clientId`) saat login berhasil. Enforcement single-session sekarang
  **per source_app**: sesi dari source berbeda diabaikan (boleh coexist); same-device replace &
  `ALREADY_LOGGED_IN` hanya berlaku dalam source yang sama.
- **File**: [schema.prisma](backend_gatewayauth/prisma/schema.prisma) model `Session` (`sourceApp String? @map("source_app")`, nullable);
  migration `20260619120000_session_source_app`;
  [session-store.ts](backend_gatewayauth/src/shared/lib/session-store.ts) — propagasi `source_app` ke
  DB+Redis snapshot + helper baru `destroySessionsByIds()` (revoke **selektif**, ganti
  `destroyAllSessionsForUser` saat same-device replace agar sesi source lain tidak ikut terhapus);
  [auth.service.ts](backend_gatewayauth/reza/modules/auth/auth.service.ts) `completeLogin` — filter
  `sameSourceSessions`, isi `source_app` saat `createSession`; [sessions.service.ts](backend_gatewayauth/reza/modules/auth/sessions.service.ts) tampilkan `source_app` di `/auth/sessions`.
  Path MFA otomatis ikut (lewat `completeLogin`).
- **Kolom nullable**: row sesi lama (`source_app=NULL`) tetap valid; dibanding login baru (non-null) →
  beda → coexist; hilang sendiri saat expire. Tidak ada backfill.
- **Verified e2e** (4/4): login A sukses; login B (user sama, device beda) coexist sukses; login A
  device berbeda → `ALREADY_LOGGED_IN`; login A same-device → replace sukses & sesi B tetap aktif
  (selective revoke terbukti). DB akhir = 2 sesi aktif dengan `source_app` berbeda. tsc clean.

### 2026-06-18 Sesi 3 — Fix Live Stream WS + Log Separation + Cleanup
- **Fix "Invalid URL" pada Live Stream**: Error `Failed to construct 'URL'` di frontend dipicu karena `VITE_API_BASE_URL` relatif (`/api/v1`). Diperbaiki di [logs-ws.ts](frontend_kartoloapps/reza/modules/administration/api/logs-ws.ts) dengan deteksi `window.location.origin`.
- **Fix Race Condition WebSocket**: Error kanal pesan tertutup diperbaiki dengan menambahkan proteksi `manualStop` di `LogStreamSocket` agar tidak melakukan transisi status setelah komponen di-*unmount*.
- **Pemisahan Log Administration**: Mengubah `LOGLOKI_DIR` dari `./logs` ke `./logloki` agar file link (peer logs) tidak mencampuri file log asli administration.
- **Matikan Logging Frontend Total**:
  - Menghapus `frontendWriter` dari `backend_gatewayauth`.
  - Menonaktifkan ingest di `logs.controller.ts`.
  - Menghapus volume mount `/app/logs` frontend di `docker-compose.yml`.
- **Cleanup & Verification**: Reset folder logs di host, rebuild images, dan verifikasi folder logs sekarang murni berisi file service-nya sendiri (gateway hanya gateway, admin hanya admin).

### 2026-06-18 Sesi 2 — Fix Akses File Log: nested bind mount → source_missing
- **Symptom**: Akses File Log (menu `auditlog`) source `backend_gatewayauth` → error
  "File log untuk backend_gatewayauth tanggal YYYY-MM-DD tidak ditemukan di sistem", padahal
  file ADA di host (`backend_gatewayauth/logs/*.log`).
- **Root cause**: peer log gateway di-mount **nested** (`/app/logs/gateway` di DALAM mount `/app/logs`).
  Nested bind mount di Docker Desktop/WSL (`/mnt/d`) tidak ter-mount andal — folder kosong/hilang
  di container → `log-link.service.dirFor('backend_gatewayauth')` (`PEER_GATEWAY_LOG_DIR`) →
  `source_missing` → pesan "tidak ditemukan".
- **Fix**: flatten mount peer ke path NON-NESTED `/app/peer-logs/gateway` (bukan `/app/logs/gateway`).
  Ubah `dockerconfig/docker-compose.yml`, `backend_administration/.env` (`PEER_GATEWAY_LOG_DIR`),
  `backend_administration/src/shared/config/env.ts`. Sekalian buang `PEER_FRONTEND_LOG_DIR` +
  mount frontend (FE logging sudah dimatikan, source app frontend dihapus).
- Verified e2e: `POST /logs/access {backend_gatewayauth, 2026-06-18}` rc=00 status=linked (sebelumnya
  source_missing); `/sources` lihat tanggal untuk kedua source; admin access rc=00 juga.

### 2026-06-18 Sesi 1 — Source-based Docker + Matikan FE Logging + Hapus dist/logs
- **Hapus source app "Frontend Kartolo Apps"** dari modal Akses File Log (menu `auditlog`):
  `SourceApp` type + `SOURCE_APP_LABEL` (FE [logs-api.ts](frontend_kartoloapps/reza/modules/administration/api/logs-api.ts)),
  `SOURCE_APPS`/`PREFIX`/`dirFor` ([log-link.service.ts](backend_administration/reza/modules/logs/log-link.service.ts)),
  `SourceAppEnum` ([logs.schema.ts](backend_administration/reza/modules/logs/logs.schema.ts)),
  `sourceToLabel` ([logs.service.ts](backend_administration/reza/modules/logs/logs.service.ts)).
  Akar masalah "masih muncul di web": container FE lama pakai bundle pra-edit → **rebuild** FE.
  Verified e2e: `GET /api/v1/logs/sources` rc=00 → `["backend_gatewayauth","backend_administration"]`.
- **`CLAUDE.md` tidak lagi di-gitignore** — hapus baris dari `.gitignore`.
- **Build dari source** (bukan dist pre-compiled): Dockerfile `COPY <app>/ ./` + `npm run build` di
  container. Folder `dist/` tetap gitignored. Hapus `backend_administration/dist` (stale lokal).
- **Frontend tidak mencatat log**: `initClientLogger()` dimatikan di [main.tsx](frontend_kartoloapps/src/main.tsx)
  (keputusan "matikan saja" — `logger.ts` + route gateway `/logs/client` + `frontendWriter` dormant).
  Bundle FE: `logger.ts` tree-shaken (tak diimpor). String `/logs/client` tersisa hanya guard di api-client.
- **Hapus folder `logs/`** di 3 app (gateway/admin/frontend) — aman: bind mount Docker recreate + writer
  `mkdirSync` + tulis file hari ini saat container start. Backend tulis log ke `<app>/logs/` masing-masing.
- ⚠️ **Gotcha restart**: menghapus folder sumber bind mount saat container HIDUP bikin `docker compose
  restart` GAGAL (`mkdir ... file exists` — Docker remount handle lama). **Fix**: recreate host dir
  (`mkdir -p`) lalu `docker compose up -d --force-recreate`, BUKAN `restart`.
- Verified: tsc FE clean, 3 image rebuilt, semua container Up, gateway health rc=00, seed 54 endpoint.

### 2026-06-17 Sesi 1 — Environment Variables Docker Compose + Log Access Fix
Migrasi environment variables dari `docker-compose.yml` ke file `.env` masing-masing service:

- `docker-compose.yml` service `gateway` → gunakan `env_file: ../backend_gatewayauth/.env`
- `docker-compose.yml` service `administration` → gunakan `env_file: ../backend_administration/.env`
- `docker-compose.yml` service `frontend` → mount `.env` ke `/app/.env.frontend` (runtime injection)
- Hapus blok `environment:` redundan di `docker-compose.yml` — service sekarang fokus ke `env_file` + volume mount.

**Perbaikan lain:**

1. **`VITE_API_BASE_URL` di `.env.frontend`**: nilai `http://gateway:3000/api/v1` (Docker internal DNS) tidak bisa di-resolve dari browser host. Diubah ke `http://127.0.0.1:3000/api/v1` agar browser bisa akses gateway via port mapping.
2. **`backend_administration/.env`**: `REDIS_URL` dan `LOKI_URL` diubah dari `127.0.0.1` ke `redis`/`loki` (Docker internal DNS); `DATABASE_URL` gunakan `host.docker.internal`.
3. **Volume mount logs di `administration`**: Tambahkan mount `gateway` dan `frontend` logs ke `/app/logs/gateway` dan `/app/logs/frontend` (read-only), serta `logloki` ke `/app/logloki` agar service bisa akses file log peer.
4. **Log Access EXDEV fix** (`log-link.service.ts`): `fs.linkSync` gagal dengan `EXDEV: cross-device link not permitted` saat source (bind mount) dan dest (named volume) beda filesystem. Ditambahkan fallback `fs.copyFileSync` sehingga fitur Log Access tetap berfungsi.
5. **Pesan error Log Access**: Pesan `'File log ${source_app}/${date} tidak ditemukan.'` (membingungkan — pakai slash) diubah menjadi `'File log untuk ${source_app} tanggal ${date} tidak ditemukan di sistem.'`.

**Folder `dockerconfig/`** — konfigurasi Docker terpusat:
```
dockerconfig/
├── docker-compose.yml     # 6 service: FE + gateway + admin + redis + loki + alloy
├── Dockerfile.gateway
├── Dockerfile.administration
├── Dockerfile.frontend
└── infra/{loki,alloy}/config.*
```
Volume mount log dari host (bind mount) agar Alloy bisa tail dan `log-link.service` bisa hardlink/copy.
VITE_* TIDAK lagi di-bake ke bundle JS. FE sekarang pakai **runtime env injection**:
`.env.frontend` (gitignored) di-mount ke container → micro-server `server.mjs` inject ke
`index.html` (`window.__APP_ENV__`) saat container start → FE baca dari `window`.
**Ganti .env.frontend + restart container = langsung aktif, tanpa rebuild.** Verified
e2e: bundle 0 baked secrets + change env + restart → new value injected. Dev mode
tidak berubah. Detail: memory `kartolo_fe_runtime_env`.

### 2026-06-09 Sesi 4 — Fix Captcha FE + DB config + Exclude scripts dari Git
**Captcha gagal di FE** — root cause ganda: (a) `build-production.mjs` tidak bake `VITE_CLIENT_ID`/
`VITE_CLIENT_KEY` → FE kirim undefined → gateway `CLIENT_ID_MISSING`; (b) FE Docker `serve` :8080
tidak proxy `/api` → relative `/api/v1` dapat HTML bukan JSON. **Fix**: build script bake 3 VITE var +
rebuild FE dengan `VITE_API_BASE_URL=http://127.0.0.1:3000/api/v1` absolute + `CORS_ORIGIN` tambah :8080.
**Verified**: captcha rc=00 + CORS allow-origin OK + login e2e rc=00.
**DB config**: `127.0.0.1:5433` tidak reachable dari container (loopback container) → `host.docker.internal`
(= host Postgres `127.0.0.1:5433` yang sama), tanpa ubah docker-compose. **Git**: `build.sh` + `git-push.sh`
di-`.gitignore` + `git rm --cached` (tidak push ke GitHub, tetap di disk lokal).
Build script juga di-fix bawa openssl ke Dockerfile yang di-regenerate.

### 2026-06-09 Sesi 3 — Run build/ via Docker + Mekanisme Build + Konsolidasi ke CLAUDE.md
Menjalankan stack `build/` via `docker compose` — **verified e2e**: login superadmin
(captcha+AES+HMAC+JWT) + `role/list` rc=00 lewat gateway→admin→Postgres+Redis.
Buat `build/build.sh` (wrapper: prereq check → ensure .env → build → up → seed → status).
**2 bug nyata ditemukan & di-fix**: (1) Prisma OpenSSL `libssl.so.1.1 not found` → `apk add openssl`
di Dockerfile; (2) `mst_endpoint.backend_url=localhost:3001` → seed upsert ke `administration:3001`.
CHECKPOINT.md DIHAPUS — histori dipindah ke CLAUDE.md (file ini) + memory.

### 2026-06-09 Sesi 2 — Git Push Flow (branch `deploy`)
`build/git-push.sh`: `git init` (sekali) → set remote dari `.git-credentials`
(token di-`.gitignore`, tidak pernah di-commit) → checkout orphan branch `deploy` →
`fetch`+`rebase` → `add -A` → `commit` → `push --force-with-lease`. Push berhasil **192 file**.
⚠️ Token PAT di-chat = sudah ter-ekspos. **Revoke + buat baru** bila perlu.
Detail: memory `kartolo_deploy_docker`.

### 2026-06-09 Sesi 1 — Log Volume → Bind Mount
`kartolo-logs` named volume → `./logloki` bind mount (di folder `build/`).
Log runtime muncul di `build/logloki/*.log`. Path internal container tidak berubah → backend & Alloy aman.

### 2026-06-08 Sesi 2 — Docker VPS Deployment Build
Folder `build/` pre-compiled (FE dist + 2 BE dist + Dockerfile + unified docker-compose).
Bug fix: start-script `dist/server.js` → `dist/src/server.js`; seed.ts hardcode `localhost:3001`
→ `SEED_ADMIN_BACKEND_URL`. Artefak: `scripts/build-production.mjs`. Detail: memory `kartolo_deploy_docker`.

### 2026-06-08 Sesi 1 — Redis Cache Layer + Pub/Sub Broadcast
Admin cache-aside (`kartolo:ad:`) + gateway portal cache (`kartolo:portal:`) +
Pub/Sub channel `kartolo:cache:invalidate`. +3 endpoint detail (produk/role/user). Total **54 endpoint**.
32/32 e2e. Detail: memory `kartolo_admin_redis_cache`.

### 2026-06-05 Sesi 2 — Menu Produk + User Member
Menu Produk CRUD + Mapping Role Produk + Menu User Member (klon useradmin, user_type=member).
ZERO endpoint baru. `role_list` nullable. 20/20 + 11/11 e2e. Total 51 endpoint.

### 2026-06-05 Sesi 1 — Role Delete Validation + Auth Helper
Backend cek 3 tabel sebelum hapus role → rc=90 ROLE_IN_USE. `scripts/auth-helper.js` reusable.

### 2026-06-04 Sesi 4 — Role Picker Modal UX
Modal role picker di **PortalPage** (bukan ProductShell). Ganti role in-product.
Fix React StrictMode cleanup pitfall. Detail: memory `kartolo_role_picker_modal_ux`.

### 2026-06-04 Sesi 3 — Role-Based Product Access (RBAC)
`mst_produk.role_list` + `map_user_role` (multi-role/user). `users.role_id` DI-DROP.
role-picker flow. superadmin bypass. Detail: memory `kartolo_role_access_model`.

### 2026-06-04 Sesi 2 — Disable MFA Action di Useradmin
Tombol "Disable MFA": reset `mfa_enabled=false` + hapus recovery codes.

### 2026-06-04 Sesi 1 — 4 Useradmin Action Buttons
Reset Password, Update Status, Reset Block, Logout Semua Device. 27/27 e2e.

### 2026-06-03 — Force Change Password
Status propagation (transient) + revoke semua sesi + same-device relogin.
Detail: memory `kartolo_force_change_password`.

### 2026-06-02 Sesi 2 — Force Change Password UI
Form UI + auto-redirect.

### 2026-06-02 Sesi 1 — UserDetailModal Redesign + force_change_password Login
UserDetailModal baru + fix login baca `force_change_password` status.

### 2026-05-28 — Menu Pengaturan + MFA TOTP + Recovery Codes
Modul `pengaturan` + MFA enrollment (otplib v13, AES-256-GCM) + 10 recovery codes.
30 endpoint. Detail: memory `kartolo_mfa`.

### 2026-05-27 Sesi 2 — Log UX + Docker Unified
Docker compose disatukan (Redis + Loki + Alloy). Connector AND/OR di Log Access filter.

### 2026-05-27 Sesi 1 — Captcha + WebSocket + Navicat Filter
Captcha uppercase+digit one-time use. WS log proxy gateway→admin. Navicat filter di User Admin.

### 2026-05-24 — Audit Log Enhancement + Log Access
Snapshot arsitektur + audit log + Log Access menu.

### 2026-05-22 — Multi-Backend + Gateway Forwarding
Arsitektur multi-backend: client → gateway → admin. Forward via `mst_endpoint.backend_url` +
inject `X-Forwarded-*`. Detail: memory `kartolo_api_gateway`.

### 2026-05-21 — Layout Responsif + Menu Beranda
Responsive navbar + sidebar collapse (Zustand persist). Menu Beranda.

### 2026-05-20 — mst_produk + Username + Profile
Model `MstProduk` + endpoint `GET /api/v1/portal/products`. Profile module.

### 2026-05-20 — Logging System (Loki + Alloy + Audit Trail)
3 jenis log (audit, request, application). Loki + Alloy pipeline. Detail: memory `kartolo_logging_system`.

### 2026-05-18 — Gateway Management + Session Persistence
Session history di DB + admin force-logout. Single-session rc=92. Dual Redis + Postgres store.
Detail: memory `kartolo_session_persistence`.

### 2026-05-18 — Dark/Light Mode
Zustand theme store + persist localStorage + Tailwind dark mode class.

---

## Pointer ke Memory

Memory index: `memory/MEMORY.md` (auto-loaded saat sesi baru).

| Memory | Topik |
|---|---|
| `kartolo_api_contract` | Response envelope, rc mapping, header signature |
| `kartolo_api_gateway` | Gateway forwarding, `mst_endpoint`, `cfg_client` |
| `kartolo_signature_formula` | HMAC-SHA512 + base64 + 3 header (BUKAN SHA-256/hex/4 header) |
| `kartolo_api_gateway_tables` | DB tables gateway |
| `kartolo_mfa` | MFA TOTP flow, `mfa_required` flag, recovery codes |
| `kartolo_role_access_model` | RBAC: role_list, map_user_role, role-picker |
| `kartolo_session_persistence` | Redis + Postgres dual store, single-session rc=92 |
| `kartolo_force_change_password` | force_change_password flow + status propagation |
| `kartolo_admin_redis_cache` | Cache-aside admin, Pub/Sub, portal cache gateway |
| `kartolo_logging_system` | Loki + Alloy + file log + audit trail |
| `kartolo_auth_test_helper` | `scripts/auth-helper.js` usage |
| `kartolo_deploy_docker` | Build artifact, build.sh, git-push.sh, VPS deploy, Docker bug fixes |
| `kartolo_wsl_polling` | Vite/tsx usePolling di WSL |
| `react_strictmode_cleanup_pitfall` | Jangan clear global state di StrictMode cleanup |
| `feedback_thorough_verification` | Verifikasi end-to-end nyata, bukan cuma typecheck |
