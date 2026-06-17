# Product Requirement Document (PRD)
## AI-Powered Trading Bot Platform

| Field | Value |
|---|---|
| **Project Name** | AI Trading Bot Platform |
| **Document Version** | 1.0.0 |
| **Status** | Draft — Ready for Development |
| **Target Market** | Indonesia (BAPPEBTI-aware), Global secondary |
| **Last Updated** | 2026-05-16 |

---

## 1. Executive Summary

Platform berbasis web untuk algorithmic trading di pasar Forex/CFD (termasuk CFD on futures) yang memungkinkan user terhubung ke akun broker MetaTrader 5 (MT5) mereka, menjalankan strategi otomatis yang diperkuat dengan model machine learning, melakukan backtest, dan memonitor performa secara real-time.

Aplikasi terdiri dari **frontend SPA** (React + Vite), **backend orchestration** (Node.js), **ML/AI service** (Python FastAPI), **database transaksional** (PostgreSQL + TimescaleDB extension), **cache layer** (Redis), dan **bridge ke MetaTrader** (MetaApi Cloud SDK).

---

## 2. Project Goals & Non-Goals

### 2.1 Goals (Yang DIBANGUN)

- Memungkinkan user menghubungkan akun MT5 mereka (demo & live) dan trading otomatis dari web.
- Menyediakan library strategi yang bisa dikonfigurasi user, dengan opsi enhancement via ML model.
- Walk-forward backtest engine yang realistis (dengan spread, slippage, commission).
- Risk management layer yang **wajib aktif** untuk semua bot live.
- Dashboard real-time: equity curve, posisi terbuka, P&L harian, log bot.
- Multi-account, multi-strategy per user.
- LLM-assisted analysis untuk news sentiment dan market commentary.

### 2.2 Non-Goals (Yang TIDAK DIBANGUN di MVP)

- **BUKAN broker.** Aplikasi tidak hold dana user. Dana tetap di broker pilihan user.
- **BUKAN signal selling service.** Tidak ada marketplace strategi atau copy trading di MVP.
- **BUKAN crypto-native trading.** Bisa trade crypto CFD via broker MT5, tapi tidak konek ke exchange (Binance, dll) langsung.
- **BUKAN HFT.** Target timeframe minimum 1-minute, ideal 15-minute ke atas. Latency target sub-second, bukan sub-millisecond.
- **BUKAN mobile-first.** Web responsive untuk mobile, tapi native iOS/Android di luar scope MVP.
- **Tidak ada janji ROI atau win rate.** UI tidak boleh menampilkan klaim performa yang menyesatkan.

---

## 3. Critical Safety & Compliance Rules

**Aturan-aturan ini WAJIB diikuti di seluruh codebase. Pelanggaran = blocking issue.**

### 3.1 Kredensial & Secret

- **NEVER** simpan password broker, API key, atau secret apapun dalam plaintext di database, log, atau source code.
- Kredensial broker (`broker_accounts.password_encrypted`) WAJIB di-encrypt dengan **AES-256-GCM**. Master key dari environment variable (development) atau KMS/Vault (production).
- Semua secret di `.env` file, jangan pernah di-commit. `.env.example` boleh di-commit (tanpa nilai asli).
- API key user di-hash dengan `bcrypt` (cost 12+) sebelum simpan ke DB.

### 3.2 Risk Management — Mandatory

Setiap order yang akan dieksekusi WAJIB melewati `RiskGuard` module dengan check berikut. Order DITOLAK kalau ada satu saja yang fail:

- `max_position_size_per_trade` (default 1% dari akun equity).
- `max_concurrent_positions` (default 5 per bot, 10 per akun).
- `daily_loss_limit` (default 3% dari akun equity).
- `max_drawdown_circuit_breaker` (default 15%, kalau tercapai bot auto-stop dan butuh manual reactivate).
- `news_blackout_window` (default 5 menit sebelum + 15 menit setelah high-impact news).
- `weekend_position_check` (warn user kalau ada posisi terbuka menjelang weekend).
- `min_confidence_threshold` (untuk strategi ML, default 0.55, configurable).

Semua nilai di atas BISA diubah user, TAPI **tidak boleh di-disable** untuk akun live. Untuk akun demo, user bisa disable manual.

### 3.3 Audit Trail

Setiap action sensitif WAJIB di-log ke tabel `audit_logs`:
- Login (success & failed), logout, password change, 2FA enable/disable.
- Tambah/hapus broker account.
- Buat/edit/hapus strategi.
- Start/stop bot instance.
- Manual order placement.
- Perubahan risk parameter.

Log retention minimum 1 tahun untuk akun live trading.

### 3.4 User Disclaimer

Sebelum user bisa connect akun live (bukan demo), user WAJIB menerima disclaimer yang menjelaskan:
- Trading bot bisa rugi besar dengan cepat.
- Past performance tidak menjamin future results.
- Aplikasi tidak memberikan financial advice.
- User bertanggung jawab penuh atas keputusan tradingnya.

Disclaimer acceptance di-record di `users.disclaimer_accepted_at`.

### 3.5 No Misleading Performance Claims

- UI tidak boleh menampilkan win rate atau ROI tanpa konteks (jumlah trade, periode, max drawdown).
- Hasil backtest WAJIB ditampilkan dengan caveat: "Past performance is not indicative of future results."
- Tidak ada fitur "guaranteed profit" atau "85% win rate" — kalau user request, refuse.

---

## 4. User Personas

### 4.1 Hobbyist Trader (Primary)
Trader retail dengan modal $500–$5,000. Punya basic understanding tentang trading, ingin otomasi tanpa harus jadi programmer. Butuh UI yang intuitif, strategi siap pakai yang bisa di-tweak, dan dashboard yang jelas.

### 4.2 Quant Hobbyist (Secondary)
Punya skill coding/data science. Ingin akses lebih dalam: custom indicator, custom ML model, raw backtest data. Butuh API access dan export data.

### 4.3 Admin / Operator (Internal)
Tim development/support. Butuh akses ke system health, user management (dengan audit), dan tools untuk troubleshoot.

---

## 5. Tech Stack (Locked Decisions)

| Layer | Technology | Versi Minimum | Justifikasi |
|---|---|---|---|
| Frontend | React + Vite + TypeScript | React 18+, Vite 5+ | SPA modern, build cepat |
| UI Component | shadcn/ui + Tailwind CSS | Latest | Composable, customizable |
| State (client) | TanStack Query + Zustand | Latest | Server state + UI state terpisah |
| Charting | TradingView Lightweight Charts | Latest | Standard industri trading |
| Realtime client | Socket.IO client | 4+ | Auto-reconnect, fallback |
| Backend API | Node.js + Fastify + TypeScript | Node 20 LTS+, Fastify 4+ | Performant, schema validation |
| Backend Worker | Node.js + BullMQ | Latest | Job queue dengan Redis |
| Realtime server | Socket.IO | 4+ | Match dengan client |
| ORM | Prisma | 5+ | Type-safe, migration tooling baik |
| ML Service | Python 3.11+ + FastAPI | Latest | Async, OpenAPI auto-gen |
| ML Libraries | scikit-learn, XGBoost, LightGBM, pandas-ta | Latest stable | Standard quant stack |
| LLM | Anthropic Claude API (`@anthropic-ai/sdk`) | Latest | Sentiment & reasoning |
| DB Primary | PostgreSQL | 15+ | Relasional, mature |
| DB Time-series | TimescaleDB (PG extension) | Latest | OHLCV efficient storage |
| Cache | Redis | 7+ | Cache, pub/sub, BullMQ backend |
| Broker Bridge | MetaApi Cloud SDK (`metaapi.cloud-sdk`) | Latest | MT4/MT5 cloud API |
| Model Registry | MLflow | Latest | Model versioning |
| Container | Docker + docker-compose | Latest | Dev environment |
| CI/CD | GitHub Actions | — | Free tier cukup |

**Aturan:** Jangan ganti tech stack ini tanpa approval explicit. Library tambahan boleh, replacement core technology tidak.

---

## 6. System Architecture

### 6.1 High-Level Components

```
┌─────────────────────────────────────────────────────────────┐
│  Browser (React + Vite SPA)                                 │
└──────────────────┬──────────────────────────────────────────┘
                   │ HTTPS REST + WebSocket (Socket.IO)
                   ▼
┌─────────────────────────────────────────────────────────────┐
│  Node.js API Service (Fastify)                              │
│  - Auth (JWT + refresh)                                     │
│  - REST endpoints                                           │
│  - WebSocket gateway                                        │
│  - Request validation (zod)                                 │
└──────┬────────────────────────┬─────────────────────────────┘
       │                        │
       │ Redis pub/sub          │ DB queries
       ▼                        ▼
┌─────────────────┐    ┌─────────────────────────────────────┐
│  Node.js Worker │    │  PostgreSQL + TimescaleDB           │
│  (BullMQ)       │◄──►│  - Users, accounts, strategies      │
│  - Order exec   │    │  - Trades, logs, audit              │
│  - Schedulers   │    │  - OHLCV (hypertable)               │
│  - Webhooks     │    └─────────────────────────────────────┘
└──┬───────────┬──┘
   │           │
   │           │ HTTP (internal)
   │           ▼
   │   ┌─────────────────────────────────────────────────────┐
   │   │  Python ML Service (FastAPI)                        │
   │   │  - /features/compute                                │
   │   │  - /inference/predict                               │
   │   │  - /backtest/run                                    │
   │   │  - /sentiment/analyze (calls Claude API)            │
   │   └─────────────────────────────────────────────────────┘
   │
   │ MetaApi WebSocket + REST
   ▼
┌─────────────────────────────────────────────────────────────┐
│  MetaApi Cloud → User's Broker MT5 (IC Markets, MIFX, ...)  │
└─────────────────────────────────────────────────────────────┘
```

### 6.2 Komunikasi Antar Service

- **Frontend ↔ Node API:** HTTPS REST untuk CRUD, Socket.IO untuk realtime (harga tick, status bot, notifikasi).
- **Node API ↔ Node Worker:** Redis (BullMQ queue + pub/sub).
- **Node Worker ↔ Python ML:** HTTP REST internal network (FastAPI). Timeout 5s default.
- **Node Worker ↔ MetaApi:** WebSocket persistent + REST untuk action.
- **Python ML ↔ Claude API:** HTTP via `@anthropic-ai/sdk` (atau equivalent Python SDK).

### 6.3 Deployment Topology (Production Target)

- 1× container API service (scale horizontal)
- 1× container Worker service (scale horizontal)
- 1× container ML service (scale horizontal)
- 1× managed PostgreSQL (dengan TimescaleDB extension enabled)
- 1× managed Redis
- Load balancer di depan API service
- HTTPS via reverse proxy (Caddy/Nginx) atau platform-managed (Fly.io, Railway, Render)

---

## 7. Functional Requirements

### 7.1 Authentication & User Management

**FR-AUTH-01: Registrasi**
- Email + password (min 12 char, harus ada huruf besar, kecil, angka, simbol).
- Email verification via link (token expire 24 jam).
- Password di-hash dengan `argon2id`.

**FR-AUTH-02: Login**
- Email + password.
- Rate limit: 5 failed attempts dalam 15 menit → lock 1 jam.
- Return JWT access token (15 menit) + refresh token (30 hari, httpOnly cookie).

**FR-AUTH-03: 2FA (mandatory untuk akun yang punya broker live)**
- TOTP (Google Authenticator, Authy compatible).
- Backup codes (10 buah, one-time use).

**FR-AUTH-04: Password Reset**
- Email-based reset link (token expire 1 jam).

**FR-AUTH-05: Session Management**
- User bisa lihat active sessions dan revoke.

### 7.2 Broker Account Integration

**FR-BROKER-01: Connect MT5 Account**
- User input: broker name, MT5 login, MT5 password, server name.
- Backend register ke MetaApi, dapat `metaapi_account_id`.
- Test connection sebelum simpan. Kalau fail, return clear error.
- Encrypt password sebelum simpan.

**FR-BROKER-02: Account Status**
- Real-time balance, equity, margin level, free margin.
- Polling MetaApi atau via webhook.

**FR-BROKER-03: Disconnect Account**
- Hapus dari MetaApi.
- Stop semua bot instance yang pakai akun ini.
- Soft-delete di DB (untuk audit), hard-delete kredensial.

**FR-BROKER-04: Multi-Account**
- User bisa connect multiple akun (limit 5 di MVP, configurable).

### 7.3 Strategy Management

**FR-STRAT-01: Strategy Library**
- Pre-built strategies tersedia di MVP:
  - EMA Crossover (multi-timeframe)
  - RSI Mean Reversion + Bollinger Band
  - Donchian Breakout
  - ML-Enhanced Trend Following (XGBoost filter di atas EMA crossover)
  - News Sentiment + Technical (kombinasi LLM + ML)

**FR-STRAT-02: Strategy Configuration**
- User bisa edit parameter (e.g., EMA periods, threshold).
- Setiap save = bikin `strategy_version` baru.
- Versi sebelumnya tetap immutable.

**FR-STRAT-03: Strategy Activation**
- User pilih strategy version + broker account + symbol + timeframe + allocated capital → bikin `bot_instance`.
- Bot status: `idle`, `running`, `paused`, `stopped`, `error`.

**FR-STRAT-04: Strategy Sharing (Future, NOT in MVP)**
- Skip di MVP.

### 7.4 Bot Engine

**FR-BOT-01: Lifecycle**
- Start: validate config → register listener untuk candle close event → masuk state `running`.
- Pause: stop listen event tapi tidak close posisi.
- Stop: pause + optionally close semua posisi terbuka (user pilih).
- Auto-stop on error: log error, notify user.

**FR-BOT-02: Signal Generation**
- Pada setiap candle close pada timeframe yang dipantau, bot:
  1. Tarik data candle terbaru (200 candle terakhir).
  2. Request feature engineering dari Python ML service.
  3. (Optional) Request ML prediction.
  4. Apply strategy rules → generate signal `BUY` / `SELL` / `HOLD`.
  5. Kalau bukan `HOLD`, lewatkan ke RiskGuard.

**FR-BOT-03: Risk Management Layer (RiskGuard)**
- Implementasi semua check di section 3.2.
- Wajib jalan SEBELUM order dikirim ke broker.
- Kalau reject, log alasan di `bot_logs`.

**FR-BOT-04: Order Execution**
- Push job ke BullMQ queue `execute_order`.
- Worker eksekusi via MetaApi.
- Simpan hasil ke `trades` + `trade_fills`.
- Emit WebSocket event ke frontend.

**FR-BOT-05: Position Management**
- Monitor posisi terbuka.
- Apply trailing stop kalau strategi mengaktifkannya.
- Close manual atau otomatis sesuai signal.

### 7.5 ML/AI Pipeline

**FR-ML-01: Feature Engineering**
- Endpoint `/features/compute` (POST).
- Input: `{symbol, timeframe, candles[]}`.
- Output: feature vector + metadata (feature names, version).
- Cache hasil di Redis dengan TTL = duration timeframe.

**FR-ML-02: Inference**
- Endpoint `/inference/predict` (POST).
- Input: `{model_version_id, feature_vector}`.
- Output: `{action: 'BUY'|'SELL'|'HOLD', confidence: 0-1, predicted_return?, suggested_sl?, suggested_tp?}`.

**FR-ML-03: Model Training**
- CLI command + scheduled job (weekly).
- Pull historical candles dari DB.
- Apply feature engineering.
- Train model dengan walk-forward CV.
- Save artifact + log metrics ke MLflow.
- Tag stage: `staging` (default), `production` (manual promote).

**FR-ML-04: Model Promotion**
- Admin/user dengan permission promote model dari `staging` ke `production`.
- Audit log mandatory.

**FR-ML-05: LLM Sentiment Analysis**
- Endpoint `/sentiment/analyze` (POST).
- Input: news headline + body, OR raw text.
- Calls Claude API.
- Output: `{sentiment: -1..+1, confidence: 0..1, summary: string, affected_pairs: string[]}`.
- Cache hasil 1 jam.

### 7.6 Backtest Engine

**FR-BT-01: Run Backtest**
- User pilih: strategy version, symbol, timeframe, period (start, end), initial capital.
- Backend trigger Python `/backtest/run`.
- Walk-forward validation: minimum 3 fold.
- Simulate dengan spread realistis (ambil dari broker symbol metadata).
- Return: equity curve, trades list, metrics (Sharpe, Sortino, max DD, win rate, profit factor, total trades, avg trade duration).

**FR-BT-02: Backtest Comparison**
- User bisa compare 2-3 backtest side-by-side.

**FR-BT-03: Backtest History**
- Simpan semua backtest run di `backtests` table.
- Bisa di-rerun dengan parameter sama (reproducible).

### 7.7 Dashboard & UI

**FR-UI-01: Overview Page**
- Total equity across all broker accounts.
- Today's P&L.
- Active bots count.
- Open positions count.
- Recent trades (last 10).
- Notification feed.

**FR-UI-02: Bot Detail Page**
- Live equity curve (TradingView chart).
- Open positions table (dengan close button).
- Trade history.
- Bot logs (filterable by level).
- Configuration (read-only kalau running).
- Start/Stop/Pause controls.

**FR-UI-03: Strategy Builder Page**
- Visual config untuk parameter strategi.
- Preview indicator pada chart.
- Save creates new strategy version.

**FR-UI-04: Backtest Page**
- Run new backtest form.
- Result viewer: equity curve, drawdown chart, trade list, metrics card.

**FR-UI-05: Settings Page**
- Profile management.
- Broker account list.
- API keys.
- 2FA setup.
- Notification preferences.

### 7.8 Notifications

**FR-NOTIF-01: In-app**
- Bell icon dengan badge count.
- Realtime via Socket.IO.

**FR-NOTIF-02: Email**
- Critical events: bot stopped due to error, daily loss limit hit, large drawdown, login from new device.

**FR-NOTIF-03: User Preferences**
- Toggle per kategori notifikasi.

### 7.9 Audit & Logging

**FR-AUDIT-01:** Semua action sensitif (section 3.3) ter-log.
**FR-AUDIT-02:** User bisa view audit log mereka sendiri (read-only).
**FR-AUDIT-03:** Admin bisa export audit log dengan justifikasi.

---

## 8. Non-Functional Requirements

### 8.1 Performance

- **API response time:** p95 < 300ms untuk endpoint non-ML, p95 < 2s untuk endpoint yang memicu ML inference.
- **Order execution latency:** dari candle close → order dikirim ke MetaApi: target p95 < 500ms.
- **WebSocket message delivery:** < 100ms dari server emit ke client receive.
- **Backtest 1 tahun M15 EURUSD:** target < 30 detik.

### 8.2 Security

- HTTPS only (HSTS enabled).
- All input validated dengan zod (Node) / Pydantic (Python).
- SQL injection: dijamin oleh Prisma (parameterized queries).
- XSS: React default escape + CSP header.
- CSRF: SameSite cookies + double-submit token untuk state-changing requests.
- Rate limiting: 100 req/min per user untuk API umum, 10 req/min untuk auth endpoints.
- Dependency scanning: weekly `npm audit` + `pip-audit`.

### 8.3 Scalability

- Stateless API service (scale horizontal via load balancer).
- Worker bisa di-scale dengan tambah instance (BullMQ partition by queue).
- Target MVP: 100 concurrent users, 500 active bots.
- DB: ready untuk 10M trades, 1B candle rows (TimescaleDB compression).

### 8.4 Reliability

- Uptime target: 99.5% (excluding broker downtime).
- Graceful degradation: kalau Python ML service down, strategi non-ML tetap jalan; UI tampilkan banner warning.
- Auto-retry untuk transient error (network blip ke MetaApi): 3x dengan exponential backoff.
- DB backup: daily snapshot, retention 30 hari.

### 8.5 Maintainability

- All code TypeScript (Node) + typed Python (mypy strict).
- Unit test coverage: minimum 70% untuk business logic.
- Integration test untuk critical flow (auth, order execution, backtest).
- Linter + formatter wajib (ESLint + Prettier, Ruff + Black).
- Git: conventional commits, semantic versioning.

### 8.6 Observability

- Structured logging (JSON) dengan correlation ID.
- Health check endpoint per service (`/health`).
- Metrics: response time, error rate, queue depth, active bot count.
- Distributed tracing opsional di MVP (OpenTelemetry-ready).

---

## 9. Data Model Overview

Lihat ERD terpisah di `docs/erd.md`. Tabel utama:

- `users`, `api_keys`, `audit_logs`
- `broker_accounts`
- `strategies`, `strategy_versions`
- `ml_models`, `ml_model_versions`
- `bot_instances`, `bot_logs`
- `trades`, `trade_fills`
- `backtests`
- `symbols`, `candles` (TimescaleDB hypertable)

**Aturan migration:** Setiap perubahan schema via Prisma migration. Tidak ada manual SQL di production. Migration harus reversible (down migration tested).

---

## 10. API Design Principles

### 10.1 REST Conventions

- Base URL: `/api/v1/`
- Resource-oriented: `/users`, `/broker-accounts`, `/strategies`, `/bots`, `/trades`, `/backtests`.
- Standard HTTP verbs: GET, POST, PATCH, DELETE.
- JSON request/response.
- ISO 8601 untuk datetime (UTC).
- Pagination: cursor-based untuk list besar (`?limit=50&cursor=...`).

### 10.2 Error Format

```json
{
  "error": {
    "code": "INSUFFICIENT_MARGIN",
    "message": "Account margin tidak cukup untuk volume yang diminta.",
    "details": { "required": 250.0, "available": 180.5 },
    "trace_id": "req_abc123"
  }
}
```

HTTP status: 4xx untuk client error, 5xx untuk server error. Selalu sertakan `trace_id` untuk debugging.

### 10.3 WebSocket Events

Format: `{event: 'event.name', payload: {...}, timestamp: '...'}`

Channels (room-based):
- `user:{userId}` — notifikasi user
- `bot:{botId}` — events per bot
- `account:{accountId}` — balance/equity updates
- `symbol:{symbolId}` — price ticks (optional, on subscribe)

### 10.4 Internal API (Node Worker ↔ Python ML)

- Base URL: `http://ml-service:8000/internal/`
- Auth: shared secret header `X-Internal-Token`.
- Tidak di-expose ke public.

---

## 11. Project Structure (Monorepo)

```
trading-bot-platform/
├── README.md
├── PRD.md                          # This file
├── docker-compose.yml              # Local dev: postgres, redis, mailhog
├── .env.example
├── package.json                    # Workspace root (pnpm)
├── pnpm-workspace.yaml
├── turbo.json                      # Turborepo config
│
├── apps/
│   ├── web/                        # React + Vite frontend
│   │   ├── src/
│   │   │   ├── components/
│   │   │   ├── pages/
│   │   │   ├── hooks/
│   │   │   ├── lib/                # API client, socket client
│   │   │   ├── stores/             # Zustand stores
│   │   │   └── main.tsx
│   │   ├── index.html
│   │   ├── vite.config.ts
│   │   └── package.json
│   │
│   ├── api/                        # Node.js Fastify API
│   │   ├── src/
│   │   │   ├── routes/
│   │   │   ├── services/
│   │   │   ├── middleware/
│   │   │   ├── websocket/
│   │   │   ├── lib/
│   │   │   └── server.ts
│   │   └── package.json
│   │
│   ├── worker/                     # Node.js BullMQ worker
│   │   ├── src/
│   │   │   ├── jobs/               # Job handlers
│   │   │   ├── botEngine/          # Strategy execution
│   │   │   ├── riskGuard/          # Risk management
│   │   │   ├── metaApi/            # MetaApi client wrapper
│   │   │   └── index.ts
│   │   └── package.json
│   │
│   └── ml/                         # Python FastAPI ML service
│       ├── app/
│       │   ├── routers/
│       │   │   ├── features.py
│       │   │   ├── inference.py
│       │   │   ├── backtest.py
│       │   │   └── sentiment.py
│       │   ├── services/
│       │   │   ├── feature_engineering.py
│       │   │   ├── models/         # Model wrappers
│       │   │   └── backtest_engine.py
│       │   ├── core/
│       │   │   ├── config.py
│       │   │   └── claude_client.py
│       │   └── main.py
│       ├── tests/
│       ├── pyproject.toml
│       └── Dockerfile
│
├── packages/                       # Shared code antar app Node
│   ├── db/                         # Prisma schema + client
│   │   ├── prisma/
│   │   │   ├── schema.prisma
│   │   │   └── migrations/
│   │   └── package.json
│   ├── shared-types/               # TS types shared FE/BE
│   ├── shared-utils/
│   └── shared-config/              # Env validation, constants
│
├── infra/
│   ├── docker/
│   │   ├── api.Dockerfile
│   │   ├── worker.Dockerfile
│   │   ├── ml.Dockerfile
│   │   └── web.Dockerfile
│   ├── k8s/                        # (Future) k8s manifests
│   └── terraform/                  # (Future) IaC
│
└── docs/
    ├── erd.md
    ├── api.md
    ├── ml-pipeline.md
    └── deployment.md
```

---

## 12. Development Phases & Milestones

### Phase 0: Foundation (Week 1-2)

**Goal:** Repo setup, dev environment, CI/CD skeleton.

- [ ] Init monorepo (pnpm + turborepo).
- [ ] Setup TypeScript + ESLint + Prettier (Node), Ruff + Black (Python).
- [ ] Docker Compose: postgres (with TimescaleDB), redis, mailhog.
- [ ] Prisma schema awal (users, sessions, audit_logs).
- [ ] Basic Fastify server dengan health check.
- [ ] Basic React + Vite shell dengan routing.
- [ ] FastAPI hello-world.
- [ ] GitHub Actions: lint, test, build (no deploy yet).

**Definition of Done:** `pnpm dev` jalan semua service di local, smoke test pass di CI.

### Phase 1: Authentication & User Management (Week 3-4)

- [ ] Register, login, logout, refresh token.
- [ ] Email verification (via mailhog di dev).
- [ ] Password reset.
- [ ] 2FA (TOTP).
- [ ] Session management UI.
- [ ] Rate limiting + lockout.
- [ ] Audit logging untuk auth events.

**DoD:** User bisa register, verify email, login dengan 2FA, reset password. All flows ada integration test.

### Phase 2: Broker Integration (Week 5-6)

- [ ] MetaApi SDK wrapper.
- [ ] Connect broker account flow (form + test connection).
- [ ] Encrypt password sebelum simpan.
- [ ] Display balance & equity realtime.
- [ ] Disconnect flow.
- [ ] Symbol list sync dari broker.

**DoD:** User bisa connect akun demo IC Markets, lihat balance update, disconnect dengan bersih.

### Phase 3: Manual Trading + Trade History (Week 7)

- [ ] Manual order placement (BUY/SELL dengan SL/TP).
- [ ] Trade list dengan filter.
- [ ] Trade detail page.
- [ ] Realtime trade updates via WebSocket.

**DoD:** User bisa place order manual, lihat di history, close position.

### Phase 4: Strategy Framework + 1st Strategy (Week 8-9)

- [ ] Strategy interface (abstract).
- [ ] Implement EMA Crossover strategy.
- [ ] Strategy versioning.
- [ ] Strategy config UI.
- [ ] Bot instance lifecycle.
- [ ] **RiskGuard module** (semua check section 3.2).
- [ ] Bot start/stop/pause.
- [ ] Bot logs UI.

**DoD:** User bisa start bot EMA Crossover di akun demo, bot jalan otomatis sesuai candle close, RiskGuard aktif.

### Phase 5: Backtest Engine (Week 10-11)

- [ ] Historical data ingestion (download dari MetaApi).
- [ ] Python backtest service dengan vectorbt.
- [ ] Walk-forward validation.
- [ ] Backtest result UI dengan TradingView chart.
- [ ] Backtest history.

**DoD:** User bisa backtest EMA Crossover 1 tahun EURUSD M15, lihat hasil dalam <30 detik.

### Phase 6: ML Pipeline (Week 12-14)

- [ ] Feature engineering service (Python).
- [ ] Training pipeline (XGBoost).
- [ ] MLflow integration.
- [ ] Inference service.
- [ ] ML-enhanced strategy (EMA + XGBoost filter).
- [ ] Model promotion workflow.

**DoD:** Train XGBoost classifier dengan walk-forward CV, deploy ke staging, gunakan di paper trade.

### Phase 7: LLM Integration (Week 15)

- [ ] News API integration.
- [ ] Claude API client.
- [ ] Sentiment analysis endpoint.
- [ ] Sentiment-aware strategy.
- [ ] Sentiment display di dashboard.

**DoD:** Sistem bisa fetch news, analisis sentiment via Claude, dan strategi consume sentiment score.

### Phase 8: Polish & Production Prep (Week 16-18)

- [ ] Notification system (in-app + email).
- [ ] Comprehensive monitoring (logs, metrics, alerts).
- [ ] Load testing.
- [ ] Security audit (manual + automated scan).
- [ ] Documentation lengkap.
- [ ] Deploy ke staging environment.
- [ ] Disclaimer & legal pages.

**DoD:** Aplikasi siap untuk closed beta dengan user terbatas.

---

## 13. Acceptance Criteria (General)

Setiap feature dianggap selesai kalau:

1. **Functional:** Bisa dilakukan via UI dan API, sesuai requirement.
2. **Tested:** Unit test untuk logic, integration test untuk flow, manual test pass.
3. **Documented:** API docs auto-gen (OpenAPI). README updated kalau perlu.
4. **Reviewed:** Code review approved (kalau ada team).
5. **Audit-ready:** Semua action sensitif ter-log.
6. **Error-handled:** Tidak ada unhandled rejection / uncaught exception.
7. **Performant:** Memenuhi target di section 8.1.

---

## 14. Coding Conventions

### 14.1 TypeScript (Node)

- Strict mode ON (`"strict": true` di tsconfig).
- No `any` (use `unknown` + type guards).
- Functions return type explicit untuk public API.
- Naming: `camelCase` variables/functions, `PascalCase` types/classes, `SCREAMING_SNAKE` constants.
- File naming: `kebab-case.ts` (e.g., `broker-account.service.ts`).
- Structure per module: `*.controller.ts` (routing), `*.service.ts` (business logic), `*.repository.ts` (DB), `*.schema.ts` (zod validation), `*.types.ts`.

### 14.2 Python (ML Service)

- Type hints wajib untuk public functions (enforce dengan `mypy --strict`).
- Pydantic models untuk request/response.
- Black formatter, Ruff linter (replace flake8 + isort).
- Naming: PEP 8.
- Structure: `app/routers/`, `app/services/`, `app/models/` (Pydantic), `app/core/`.

### 14.3 React (Frontend)

- Functional components only.
- Hooks naming: `use*` prefix.
- TanStack Query untuk semua server state.
- Zustand untuk client-only state (UI toggle, dll).
- Component file: `ComponentName.tsx`, page file: `route-name.page.tsx`.
- No inline styles (gunakan Tailwind classes atau CSS modules).

### 14.4 Git

- Conventional Commits: `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`.
- Branch naming: `feature/short-description`, `fix/issue-123`, `chore/...`.
- PR template wajib.
- Squash merge ke main.

### 14.5 Logging

- Structured (JSON) di production.
- Levels: `error`, `warn`, `info`, `debug`.
- Selalu include `traceId` dan `userId` (kalau ada) di context.
- **JANGAN log:** password, tokens, full API keys, broker password, full credit card.

---

## 15. Testing Strategy

### 15.1 Unit Tests
- Node: Vitest.
- Python: pytest.
- Target coverage: 70%+ untuk business logic, 90%+ untuk RiskGuard (kritis).

### 15.2 Integration Tests
- Node: Vitest + Testcontainers (real Postgres + Redis di test).
- Test flow penting: auth, order execution, backtest run, broker connect.

### 15.3 E2E Tests
- Playwright untuk frontend critical paths.
- Minimum: register → login → connect demo → run backtest.

### 15.4 Load Tests
- k6 atau Artillery untuk load test API.
- Target di section 8.1.

### 15.5 Test Data
- Seed data untuk dev: 3 user, 5 strategi, 2 model.
- Mock MetaApi untuk unit/integration test (real MetaApi hanya di E2E staging).

---

## 16. Deployment & DevOps

### 16.1 Environment

- **dev** (local): docker-compose.
- **staging**: cloud, persistent, mirror production.
- **production**: cloud, scale ready.

### 16.2 Deployment Flow

- Push to `main` → CI runs tests → build images → push to registry → deploy staging.
- Manual promotion staging → production.
- Database migration: run sebelum deploy app baru.

### 16.3 Rollback

- Setiap deploy ada tag image.
- Rollback = redeploy image lama (1 command).
- Database migration HARUS reversible.

### 16.4 Secrets Management

- Dev: `.env` (gitignored).
- Staging/prod: platform secret manager (e.g., Doppler, AWS Secrets Manager, Fly.io secrets).

---

## 17. Risks & Mitigations

| Risk | Impact | Likelihood | Mitigation |
|---|---|---|---|
| User kehilangan uang karena bug di bot | Tinggi | Sedang | RiskGuard wajib, demo trade dulu, kill switch, audit log lengkap, disclaimer |
| MetaApi downtime | Tinggi | Rendah | Monitor status, queue retry, notif ke user, fallback graceful |
| Broker block koneksi otomatis | Tinggi | Rendah | Comply dengan ToS broker, kontak broker untuk konfirmasi algo trading allowed |
| Kredensial broker bocor | Sangat Tinggi | Rendah | AES-256-GCM, KMS, audit access, no log of passwords |
| Model ML overfit, performa live buruk | Sedang | Tinggi | Walk-forward CV, paper trading wajib sebelum live, monitoring drift |
| Latency tinggi di order execution | Sedang | Sedang | Worker dekat ke MetaApi region, monitor p95, alert |
| Compliance issue regulasi Indonesia | Tinggi | Sedang | Konsultasi legal, comply BAPPEBTI kalau broker lokal, tidak provide financial advice |
| Database scale issue di growth | Sedang | Sedang | TimescaleDB compression, partition, read replica |
| Claude API down / rate limit | Rendah | Rendah | Graceful degradation (skip sentiment, strategi tetap jalan), cache aggressive |
| Developer baru sulit onboarding | Sedang | Sedang | Docs lengkap, README per app, runbook |

---

## 18. Glossary

| Term | Definition |
|---|---|
| **Bot Instance** | Satu strategi yang sedang jalan di satu broker account + symbol + timeframe. |
| **Candle** | Bar OHLCV dalam timeframe tertentu. |
| **CFD** | Contract for Difference. Derivatif yang track harga underlying asset. |
| **Drawdown** | Penurunan equity dari peak ke trough. |
| **Equity Curve** | Grafik nilai akun seiring waktu. |
| **Expert Advisor (EA)** | Trading robot di platform MetaTrader (MQL). |
| **Expectancy** | Rata-rata profit/loss per trade. |
| **Feature** | Variable input untuk ML model (e.g., RSI value). |
| **Forex** | Foreign exchange trading. |
| **Long** | Beli, profit kalau harga naik. |
| **Lot** | Satuan volume di forex (1 lot = 100,000 unit currency). |
| **MetaApi** | Cloud service penyedia API untuk MT4/MT5. |
| **MT4 / MT5** | MetaTrader 4 / 5, platform trading broker. |
| **OHLCV** | Open, High, Low, Close, Volume. |
| **Order** | Instruksi buy/sell ke broker. |
| **Pip** | Smallest price move di forex (biasanya 0.0001). |
| **Position** | Trade yang sedang aktif. |
| **Profit Factor** | Total profit / Total loss (>1 = profitable). |
| **Risk-to-Reward (R:R)** | Ratio potential profit vs potential loss. |
| **Scalping** | Trading dengan timeframe sangat pendek. |
| **Sharpe Ratio** | Risk-adjusted return metric. |
| **Short** | Jual, profit kalau harga turun. |
| **Slippage** | Selisih harga expected vs harga eksekusi. |
| **Spread** | Selisih bid vs ask price. |
| **Stop Loss (SL)** | Harga otomatis close posisi untuk batasi loss. |
| **Take Profit (TP)** | Harga otomatis close posisi untuk lock profit. |
| **Timeframe (TF)** | Periode candle (M1, M5, M15, M30, H1, H4, D1). |
| **Tick** | Setiap perubahan harga. |
| **Walk-forward validation** | Time-series CV: train periode T1, test T2, geser. |
| **Win Rate** | % trade yang profit dari total trade. |

---

## 19. References

- MetaApi Documentation: https://metaapi.cloud/docs/
- MetaApi JavaScript SDK: https://github.com/metaapi/metaapi-javascript-sdk
- Anthropic Claude API: https://docs.claude.com/
- BAPPEBTI Indonesia: https://www.bappebti.go.id/
- "Advances in Financial Machine Learning" — Marcos López de Prado (recommended reading)
- vectorbt documentation: https://vectorbt.dev/
- TimescaleDB: https://docs.timescale.com/
- Fastify: https://fastify.dev/
- Prisma: https://www.prisma.io/docs/

---

## 20. Instructions for Claude Code

Saat membangun aplikasi ini, ikuti urutan berikut:

1. **BACA SELURUH dokumen ini terlebih dahulu** sebelum mulai coding.
2. **Patuhi Section 3 (Critical Safety Rules) tanpa kompromi.** Kalau ada konflik antara user request dan section 3, refuse dan jelaskan kenapa.
3. **Ikuti Phase yang ada di Section 12 secara berurutan.** Jangan loncat ke Phase 6 sebelum Phase 1-5 stabil.
4. **Setiap kali nambah feature, update test, dan update dokumentasi.**
5. **Gunakan struktur folder di Section 11.** Konsistensi memudahkan navigasi.
6. **Kalau ragu antara dua pendekatan, pilih yang lebih aman, bukan yang lebih cepat.** Ini aplikasi finansial.
7. **Jangan pernah ngarang feature yang tidak ada di PRD.** Kalau user request, tanya dulu apakah perlu update PRD.
8. **Setiap PR/perubahan harus reference Phase dan FR ID** (e.g., "Implements FR-AUTH-03").
9. **Stop dan minta klarifikasi** kalau ada requirement ambigu, jangan asumsikan.
10. **Tidak ada placeholder atau TODO yang di-merge ke main** tanpa issue tracking.

**Inisialisasi project:**
- Mulai dari Phase 0.
- Pertanyaan pertama yang harus dipastikan: apakah user sudah punya akun MetaApi (https://metaapi.cloud) dan akun demo broker (IC Markets recommended)? Kalau belum, arahkan setup itu dulu sebelum coding Phase 2.

---

**End of PRD v1.0.0**
