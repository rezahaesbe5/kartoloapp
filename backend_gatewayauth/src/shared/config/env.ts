import 'dotenv/config';
import { z } from 'zod';

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  HOST: z.string().default('0.0.0.0'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  CORS_ORIGIN: z.string().default('http://localhost:5173'),

  DATABASE_URL: z.string().url(),

  JWT_SECRET: z.string().min(16, 'JWT_SECRET minimal 16 karakter'),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL: z.string().default('7d'),

  REDIS_URL: z.string().url().default('redis://127.0.0.1:6379'),
  REDIS_KEY_PREFIX: z.string().default('kartolo:'),
  SESSION_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  CAPTCHA_TTL_SECONDS: z.coerce.number().int().positive().default(120),
  // TTL cache portal (produk/role/menu per-user) di gateway. Pendek karena
  // data master bisa berubah dari administration; di-invalidate via Pub/Sub.
  PORTAL_CACHE_TTL_SECONDS: z.coerce.number().int().positive().default(120),
  // Channel Redis Pub/Sub tempat administration broadcast invalidasi cache.
  CACHE_INVALIDATION_CHANNEL: z.string().default('kartolo:cache:invalidate'),

  // ---- Logging / Observability ----
  // Penanda app sumber log — slug nama folder. Membedakan log antar sub-app
  // ekosistem Kartolo (gateway + sub-app backend). Masuk ke field "app" tiap record.
  APP_ID: z.string().default('backend_gatewayauth'),
  // Direktori file log harian. Path relatif diresolusi dari cwd backend.
  LOG_DIR: z.string().default('./logs'),
  FRONTEND_LOG_DIR: z.string().default('../frontend_kartoloapps/logs'),
  // Folder yang dipantau Alloy. Backend hardlink file log ke sini on-demand.
  LOGLOKI_DIR: z.string().default('../logloki'),
  LOG_LINK_MODE: z.enum(['hardlink', 'symlink']).default('hardlink'),
  LOKI_URL: z.string().url().default('http://127.0.0.1:3100'),
  // Sampling: porsi response sukses (2xx) yang dicatat. Error selalu 100%.
  LOG_SAMPLE_SUCCESS_RATE: z.coerce.number().min(0).max(1).default(0.2),
  // Body > nilai ini (byte) akan di-truncate sebelum ditulis ke log.
  LOG_BODY_MAX_BYTES: z.coerce.number().int().positive().default(32768),
  LOG_RETENTION_DAYS: z.coerce.number().int().positive().default(90),

  // ---- MFA (TOTP) ----
  // Kunci AES-256-GCM untuk encrypt secret TOTP. 32 byte base64.
  MFA_ENCRYPTION_KEY: z.string().min(40, 'MFA_ENCRYPTION_KEY wajib di-set (32 byte base64).'),
  // TTL Redis untuk pending enrollment & MFA login challenge (detik).
  MFA_CHALLENGE_TTL_SECONDS: z.coerce.number().int().positive().default(300),
  // Label issuer yang tampil di authenticator app.
  MFA_ISSUER: z.string().default('Kartolo SuperApps'),

  // ---- WebSocket (live tail log) ----
  // Base URL admin sebagai upstream WS. HTTP scheme di-rewrite jadi ws://.
  ADMIN_BASE_URL: z.string().url().default('http://localhost:3001'),
  // Shared secret untuk header X-Internal-Token saat gateway buka WS ke admin.
  // Default value cocok untuk dev — ganti di production.
  INTERNAL_WS_SECRET: z.string().min(8).default('dev-internal-ws-secret-change-me'),
  // TTL ticket WS di Redis (detik) — one-shot.
  WS_TICKET_TTL_SECONDS: z.coerce.number().int().positive().default(30),

  SEED_SUPERADMIN_EMAIL: z.string().email().optional(),
  SEED_SUPERADMIN_PASSWORD: z.string().min(8).optional(),
  SEED_SUPERADMIN_NAME: z.string().optional(),
});

const parsed = EnvSchema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment variables:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
export type Env = z.infer<typeof EnvSchema>;
