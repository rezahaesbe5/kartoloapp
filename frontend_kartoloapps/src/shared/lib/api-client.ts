import axios, { AxiosError, type AxiosInstance, type InternalAxiosRequestConfig } from 'axios';
import { env } from '../config/env';
import type { ApiEnvelope, EnvelopeError } from '../types/envelope';
import { signRequest } from './signature';

// Per-request flag: kalau true, signing pakai tokenStr="noAuth" (untuk endpoint
// dengan auth_flag=false: captcha, login). Caller set `{ noAuth: true }` di
// axios config. Default false → Bearer token disertakan saat sign + di header.
declare module 'axios' {
  interface AxiosRequestConfig {
    noAuth?: boolean;
  }
}

export class ApiError extends Error {
  public readonly rc: string;
  public readonly status: number;
  public readonly error: EnvelopeError | null;
  public readonly traceId?: string;
  public readonly endpoint?: string;

  constructor(envelope: ApiEnvelope, endpoint?: string) {
    super(envelope.message || 'Request gagal');
    this.name = 'ApiError';
    this.rc = envelope.rc;
    this.status = envelope.status;
    this.error = envelope.error;
    this.traceId = envelope.data?.trace_id;
    this.endpoint = endpoint;
  }
}

const TOKEN_KEY = 'kartolo.access_token';

function getAccessToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setAccessToken(token: string | null): void {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

// ---- Session-invalidated event ------------------------------------------------
type SessionInvalidListener = (reason: string) => void;
const sessionInvalidListeners = new Set<SessionInvalidListener>();

export function onSessionInvalid(fn: SessionInvalidListener): () => void {
  sessionInvalidListeners.add(fn);
  return () => sessionInvalidListeners.delete(fn);
}

function emitSessionInvalid(reason: string): void {
  for (const fn of sessionInvalidListeners) fn(reason);
}

// ---- API-error reporter (dipakai client logger) -------------------------------
// Logger frontend mendaftarkan reporter di sini supaya tiap kegagalan API
// otomatis tercatat (dengan trace_id untuk korelasi ke log backend).
type ApiErrorReporter = (err: ApiError) => void;
let apiErrorReporter: ApiErrorReporter | null = null;

export function setApiErrorReporter(fn: ApiErrorReporter | null): void {
  apiErrorReporter = fn;
}

function reportApiError(err: ApiError): void {
  // Cegah loop tak hingga: jangan laporkan kegagalan endpoint ingest log itu sendiri.
  if (err.endpoint?.includes('/logs/client')) return;
  try {
    apiErrorReporter?.(err);
  } catch {
    // reporter tidak boleh mengganggu alur error normal
  }
}

const SESSION_INVALID_CODES = new Set([
  'TOKEN_INVALID',
  'SESSION_REVOKED',
  'SESSION_ID_MISSING',
  'TOKEN_MISSING',
]);

export const api: AxiosInstance = axios.create({
  baseURL: env.apiBaseUrl,
  withCredentials: true,
  timeout: 15_000,
  headers: { 'Content-Type': 'application/json' },
});

// Hitung endpointUrl yang dipakai untuk signing — harus identik dengan format DB
// di backend (tanpa "/api/" prefix). Contoh:
//   baseURL  = http://localhost:3000/api/v1
//   config.url = "/auth/login"
//   → final path = /api/v1/auth/login → strip "/api/" → "v1/auth/login"
//
// JANGAN pakai `new URL(rel, base).pathname` — kalau `rel` diawali slash,
// URL constructor MENG-RESET base path (jadi `/auth/login`, bukan
// `/api/v1/auth/login`). Manual join lebih predictable.
function computeEndpointUrl(config: InternalAxiosRequestConfig): string {
  const base = config.baseURL ?? '';
  const rel = config.url ?? '';

  let basePath = '';
  try {
    basePath = new URL(base).pathname;
  } catch {
    // baseURL bisa juga path-only (mis. "/api/v1") — pakai apa adanya.
    basePath = base;
  }
  basePath = basePath.replace(/\/+$/, ''); // strip trailing slash
  const relPath = rel.startsWith('/') ? rel : `/${rel}`;
  const fullPath = `${basePath}${relPath}`; // contoh: "/api/v1/auth/captcha"

  return fullPath.replace(/^\/api\//, '');
}

api.interceptors.request.use((config) => {
  const accessToken = getAccessToken();
  const useAuth = !config.noAuth && !!accessToken;

  if (useAuth) {
    config.headers.set('Authorization', `Bearer ${accessToken}`);
  } else {
    // Pastikan tidak terkirim untuk endpoint noAuth — kalau ada, hash di server
    // akan pakai "noAuth" tapi FE kirim Bearer → signature mismatch.
    config.headers.delete('Authorization');
  }

  const method = (config.method ?? 'get').toUpperCase();
  const endpointUrl = computeEndpointUrl(config);
  const bodyRaw =
    method === 'GET' || config.data == null
      ? null
      : typeof config.data === 'string'
        ? config.data
        : JSON.stringify(config.data);

  const { xTimestamp, xSignature } = signRequest({
    method,
    endpointUrl,
    bodyRaw,
    accessToken: useAuth ? accessToken : null,
  });

  config.headers.set('X-Client-Id', env.clientId);
  config.headers.set('X-Timestamp', xTimestamp);
  config.headers.set('X-Signature', xSignature);

  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error: AxiosError<ApiEnvelope>) => {
    const endpoint = error.config?.url;
    const data = error.response?.data;
    if (data && typeof data === 'object' && 'rc' in data) {
      const code = data.error?.code;
      if (code && SESSION_INVALID_CODES.has(code)) {
        setAccessToken(null);
        emitSessionInvalid(code);
      }
      const apiError = new ApiError(data, endpoint);
      reportApiError(apiError);
      return Promise.reject(apiError);
    }
    const synthetic: ApiEnvelope = {
      rc: '99',
      status: 0,
      message:
        error.code === 'ECONNABORTED'
          ? 'Permintaan timeout. Periksa koneksi Anda.'
          : 'Tidak bisa terhubung ke server. Coba lagi.',
      error: { code: error.code ?? 'NETWORK_ERROR' },
      data: { trace_id: 'local' },
    };
    const apiError = new ApiError(synthetic, endpoint);
    reportApiError(apiError);
    return Promise.reject(apiError);
  },
);
