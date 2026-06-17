import 'dotenv/config';
import { z } from 'zod';

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(3001),
  HOST: z.string().default('0.0.0.0'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  // Penanda app sumber log — slug nama folder.
  APP_ID: z.string().default('backend_administration'),
  DATABASE_URL: z.string().url(),

  // ---- Redis (cache store) ----
  // Prefix `kartolo:ad:` membedakan key admin dari gateway (kartolo:session:, kartolo:captcha:, dll).
  REDIS_URL: z.string().url().default('redis://127.0.0.1:6379'),
  REDIS_KEY_PREFIX: z.string().default('kartolo:ad:'),
  // TTL default untuk cache list (detik).
  CACHE_LIST_TTL_SECONDS: z.coerce.number().int().positive().default(60),
  // TTL default untuk cache item/detail (detik).
  CACHE_ITEM_TTL_SECONDS: z.coerce.number().int().positive().default(300),
  // Channel Redis Pub/Sub untuk broadcast invalidasi cache ke backend lain (gateway).
  // Harus SAMA dengan CACHE_INVALIDATION_CHANNEL di gateway.
  CACHE_INVALIDATION_CHANNEL: z.string().default('kartolo:cache:invalidate'),

  // ---- Logging / Observability ----
  // Direktori file log harian (per-app). Path relatif diresolusi dari cwd backend.
  LOG_DIR: z.string().default('./logs'),
  // Folder yang dipantau Alloy. Backend hardlink file log ke sini saat startup.
  LOGLOKI_DIR: z.string().default('../logloki'),
  LOG_LINK_MODE: z.enum(['hardlink', 'symlink']).default('hardlink'),
  // Loki HTTP endpoint untuk modul logs (akses + pencarian + live stream).
  LOKI_URL: z.string().url().default('http://127.0.0.1:3100'),
  // Sampling: porsi response sukses (2xx) yang dicatat. Error selalu 100%.
  LOG_SAMPLE_SUCCESS_RATE: z.coerce.number().min(0).max(1).default(1),
  // Body > nilai ini (byte) akan di-truncate sebelum ditulis ke log.
  LOG_BODY_MAX_BYTES: z.coerce.number().int().positive().default(32768),
  // Path direktori log peer (utk fitur Akses Log File yg link file lintas-service).
  PEER_GATEWAY_LOG_DIR: z.string().default('../backend_gatewayauth/logs'),
  PEER_FRONTEND_LOG_DIR: z.string().default('../frontend_kartoloapps/logs'),
  // Shared secret antara gateway↔admin untuk validate upstream WS handshake.
  // WAJIB diset di production. Default value dipakai dev convenience saja.
  INTERNAL_WS_SECRET: z.string().min(8).default('dev-internal-ws-secret-change-me'),
});

const parsed = EnvSchema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment variables:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
export type Env = z.infer<typeof EnvSchema>;
