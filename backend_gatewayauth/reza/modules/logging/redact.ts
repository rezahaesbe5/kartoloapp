// Redaksi data sensitif sebelum ditulis ke log file.
// PENTING: request-logger merakit record sendiri, jadi redaksi Pino bawaan
// Fastify tidak berlaku di sini — modul ini wajib redaksi sendiri.

import { env } from '../../../src/shared/config/env.js';

// Header yang di-redact (4 header signature gateway + authorization + cookie).
const SENSITIVE_HEADERS = new Set([
  'authorization',
  'x-timestamp',
  'x-client-id',
  'x-client-secret',
  'x-signature',
  'cookie',
  'set-cookie',
]);

// Key body yang di-redact (case-insensitive).
const SENSITIVE_BODY_KEYS = new Set([
  'password',
  'password_hash',
  'passwordhash',
  'old_password',
  'new_password',
  'current_password',
  'confirm_password',
  'token',
  'access_token',
  'refresh_token',
  'secret',
  'client_secret',
  'client_key',
  'clientkey',
  'captcha_answer',
  'two_factor_secret',
]);

const REDACTED = '[REDACTED]';
const MAX_DEPTH = 8;

export function redactHeaders(
  headers: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(headers)) {
    out[key] = SENSITIVE_HEADERS.has(key.toLowerCase()) ? REDACTED : value;
  }
  return out;
}

export function redactBody(value: unknown, depth = 0): unknown {
  if (value == null) return value;
  if (depth >= MAX_DEPTH) return '[MAX_DEPTH]';

  if (Array.isArray(value)) {
    return value.slice(0, 200).map((v) => redactBody(v, depth + 1));
  }

  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      out[key] = SENSITIVE_BODY_KEYS.has(key.toLowerCase())
        ? REDACTED
        : redactBody(val, depth + 1);
    }
    return out;
  }

  return value;
}

// Cap: kalau hasil serialisasi melewati batas, ganti dengan ringkasan kecil.
export function capValue(value: unknown): unknown {
  if (value == null) return value;
  let serialized: string;
  try {
    serialized = JSON.stringify(value);
  } catch {
    return { _unserializable: true };
  }
  const bytes = Buffer.byteLength(serialized, 'utf8');
  if (bytes <= env.LOG_BODY_MAX_BYTES) return value;
  return {
    _truncated: true,
    _bytes: bytes,
    _preview: serialized.slice(0, 500),
  };
}
