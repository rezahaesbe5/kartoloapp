// Client-side logger: menangkap error JS & kegagalan API, lalu mengirim
// batch ke backend (POST /api/v1/logs/client). Backend menulisnya ke file
// harian frontend-YYYY-MM-DD.log sehingga ikut masuk pipeline Loki.

import { env } from '../config/env';
import { useAuthStore } from '../stores/auth-store';
import { api, setApiErrorReporter, type ApiError } from './api-client';

type LogLevel = 'info' | 'warn' | 'error';

interface ClientLogEntry {
  app: string;
  level: LogLevel;
  ts_request: string;
  message?: string;
  error_stack?: string;
  page_url?: string;
  endpoint?: string;
  status?: number;
  trace_id?: string;
  user_data?: Record<string, unknown>;
  meta?: Record<string, unknown>;
}

const MAX_BUFFER = 20;
const FLUSH_INTERVAL_MS = 10_000;
const MAX_BATCH = 100;

const buffer: ClientLogEntry[] = [];
let flushing = false;
let started = false;

function currentUserData(): Record<string, unknown> | undefined {
  const user = useAuthStore.getState().user;
  if (!user) return undefined;
  return { user_id: user.id, email: user.email, user_type: user.user_type };
}

function push(entry: Omit<ClientLogEntry, 'app' | 'page_url' | 'user_data'>): void {
  buffer.push({
    ...entry,
    app: env.appId,
    page_url: window.location.href,
    user_data: currentUserData(),
  });
  if (buffer.length >= MAX_BUFFER) void flush();
}

async function flush(): Promise<void> {
  if (flushing || buffer.length === 0) return;
  flushing = true;
  const batch = buffer.splice(0, MAX_BATCH);
  try {
    await api.post('/logs/client', { logs: batch }, { noAuth: true });
  } catch {
    // Gagal kirim — batch dibuang (TIDAK di-buffer ulang) untuk mencegah
    // penumpukan memори & loop tak hingga bila endpoint ingest bermasalah.
  } finally {
    flushing = false;
  }
}

/** Catat event manual dari kode aplikasi. */
export function logClientEvent(
  level: LogLevel,
  message: string,
  meta?: Record<string, unknown>,
): void {
  push({ level, ts_request: new Date().toISOString(), message, meta });
}

/** Inisialisasi logger — dipanggil sekali saat bootstrap aplikasi. */
export function initClientLogger(): void {
  if (started) return;
  started = true;

  window.addEventListener('error', (e: ErrorEvent) => {
    push({
      level: 'error',
      ts_request: new Date().toISOString(),
      message: e.message,
      error_stack: e.error instanceof Error ? e.error.stack : undefined,
      meta: { filename: e.filename, lineno: e.lineno, colno: e.colno },
    });
  });

  window.addEventListener('unhandledrejection', (e: PromiseRejectionEvent) => {
    const reason = e.reason;
    push({
      level: 'error',
      ts_request: new Date().toISOString(),
      message: reason instanceof Error ? reason.message : String(reason),
      error_stack: reason instanceof Error ? reason.stack : undefined,
      meta: { kind: 'unhandledrejection' },
    });
  });

  setApiErrorReporter((err: ApiError) => {
    push({
      level: 'error',
      ts_request: new Date().toISOString(),
      message: `API ${err.rc}: ${err.message}`,
      endpoint: err.endpoint,
      status: err.status,
      trace_id: err.traceId,
    });
  });

  setInterval(() => void flush(), FLUSH_INTERVAL_MS);

  // Flush saat tab disembunyikan/ditutup — best-effort.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void flush();
  });
}
