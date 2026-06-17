/**
 * Kartolo Auth — reusable login helper untuk e2e / typecheck / test scripts.
 *
 * Menyediakan fungsi:
 *   getCaptcha()     → { id, answer } dari Redis (dev-only)
 *   login()          → { token, user, mfa_required? }
 *   loginIfNeeded()  → auto-resolve MFA challenge bila perlu
 *
 * Pre-requisite environment variables (baca dari ../frontend_kartoloapps/.env):
 *   CLIENT_ID     = kartolo-web-frontend
 *   CLIENT_KEY    = HiqgsukWJHLqY6YvI0EjKN19CpFcHEEjiTX5nsm7EUI=
 *   GATEWAY_URL   = http://127.0.0.1:3000
 *   API_BASE      = http://127.0.0.1:3000/api/v1
 *   SUPERADMIN_EMAIL    = superadmin@kartolo.local
 *   SUPERADMIN_PASSWORD = Superadmin#2026
 *
 * Flows:
 *   1. GET /auth/captcha           → simpan jawaban dari Redis key `kartolo:captcha:<id>`
 *   2. POST /auth/login             → {"identifier", "password"(AES-CBC-base64), "captcha_id", "captcha_answer"}
 *      - mfa_required=true          → perlu /auth/mfa/verify dengan mfa_token + code/recovery_code
 *      - mfa_required=false         → langsung dapat access_token
 *
 * Signature formula (HMAC-SHA512, base64, 3 header):
 *   stringToSign = METHOD + ":" + endpointUrl + ":" + xTimestamp + ":" + tokenStr + ":" + hashedBody
 *   hashedBody   = "nobody" (GET) | SHA256(JSON.stringify(JSON.parse(body))) (POST/PUT/PATCH)
 *   tokenStr     = "Bearer <token>" (auth required) | "noAuth" (no auth)
 *
 * Endpoint format (tanpa "/api/" prefix):
 *   - v1/auth/captcha
 *   - v1/auth/login
 *   - v1/auth/mfa/verify
 *   - v1/administration/role/list
 *   dll.
 *
 * Usage (ESM import atau langsung run):
 *   import { getCaptcha, login, loginIfNeeded } from './auth-helper.js';
 *
 *   // Login (handle MFA otomatis bila perlu)
 *   const { token, user } = await loginIfNeeded();
 *   console.log('Token:', token);
 */

import { execSync } from 'node:child_process';
import { createCipheriv, randomBytes, createHash, createHmac } from 'node:crypto';

// ── Constants ─────────────────────────────────────────────────────────────────

export const GATEWAY_URL = process.env.GATEWAY_URL ?? 'http://127.0.0.1:3000';
export const API_BASE = process.env.API_BASE ?? 'http://127.0.0.1:3000/api/v1';

export const CLIENT_ID = process.env.CLIENT_ID ?? 'kartolo-web-frontend';
export const CLIENT_KEY = process.env.CLIENT_KEY ?? 'HiqgsukWJHLqY6YvI0EjKN19CpFcHEEjiTX5nsm7EUI=';

export const SUPERADMIN_EMAIL = process.env.SUPERADMIN_EMAIL ?? 'superadmin@kartolo.local';
export const SUPERADMIN_PASSWORD = process.env.SUPERADMIN_PASSWORD ?? 'Superadmin#2026';

export const REDIS_KEY_PREFIX = process.env.REDIS_KEY_PREFIX ?? 'kartolo:';

// ── Signature ─────────────────────────────────────────────────────────────────

function sha256hex(str) {
  return createHash('sha256').update(str).digest('hex');
}

export function signRequest(method, endpointUrl, bodyRaw, accessToken) {
  const xTimestamp = new Date().toISOString();
  const tokenStr = accessToken ? `Bearer ${accessToken}` : 'noAuth';
  const hashedBody = method === 'GET' ? 'nobody' : sha256hex(JSON.stringify(JSON.parse(bodyRaw || '{}')));
  const stringToSign = `${method.toUpperCase()}:${endpointUrl}:${xTimestamp}:${tokenStr}:${hashedBody}`;
  const xSignature = createHmac('sha512', CLIENT_KEY).update(stringToSign).digest('base64');
  return { xTimestamp, xSignature };
}

// ── HTTP client ────────────────────────────────────────────────────────────────

/**
 * Kirim request ke gateway dengan signature + auth headers.
 *
 * @param {string} method       - GET | POST | PUT | PATCH | DELETE
 * @param {string} endpointUrl  - path TANPA "/api/" prefix (contoh: "v1/auth/captcha")
 * @param {object|null} body   - body object, atau null untuk GET
 * @param {string|null} token   - access token, atau null untuk no-auth
 * @returns {Promise<object>}    - parsed JSON response
 */
export async function api(method, endpointUrl, body = null, token = null) {
  const url = `${GATEWAY_URL}/api/${endpointUrl}`;
  const bodyRaw = body ? JSON.stringify(body) : undefined;
  const { xTimestamp, xSignature } = signRequest(method, endpointUrl, bodyRaw, token);

  const headers = {
    'Content-Type': 'application/json',
    'X-Client-Id': CLIENT_ID,
    'X-Timestamp': xTimestamp,
    'X-Signature': xSignature,
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const opts = { method, headers };
  if (bodyRaw) opts.body = bodyRaw;

  const res = await fetch(url, opts);
  return res.json();
}

// ── Password encryption ────────────────────────────────────────────────────────

/**
 * Enkripsi password dengan AES-256-CBC (sinkron dengan frontend).
 * key = base64decode(CLIENT_KEY) → 32 byte raw
 * payload = base64( IV[16] || ciphertext )
 */
export function encryptPassword(plaintext) {
  const key = Buffer.from(CLIENT_KEY, 'base64');
  const iv = randomBytes(16);
  const cipher = createCipheriv('aes-256-cbc', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, encrypted]).toString('base64');
}

// ── Captcha ────────────────────────────────────────────────────────────────────

/**
 * Ambil captcha baru dan jawabannya dari Redis.
 *
 * @returns {Promise<{captchaId: string, captchaAnswer: string}>}
 */
export async function getCaptcha() {
  const resp = await api('GET', 'v1/auth/captcha', null, null);
  const captchaId = resp.data?.captcha_id;
  if (!captchaId) throw new Error('Captcha gagal: ' + JSON.stringify(resp));

  // Jawaban tersimpan di Redis dengan prefix: kartolo:captcha:<id>
  const redisKey = `${REDIS_KEY_PREFIX}captcha:${captchaId}`;
  let captchaAnswer = execSync(`docker exec kartolo-redis redis-cli --raw get "${redisKey}"`, {
    encoding: 'utf8',
  }).trim();

  if (!captchaAnswer || captchaAnswer === '(nil)') {
    throw new Error(`Captcha answer tidak ditemukan di Redis (key: ${redisKey})`);
  }

  return { captchaId, captchaAnswer };
}

// ── Login ─────────────────────────────────────────────────────────────────────

/**
 * Login tanpa MFA (akun harus MFA-disabled).
 *
 * @param {string} identifier  - email atau username
 * @param {string} password    - plaintext password
 * @returns {Promise<{token: string, user: object}>}
 */
export async function login(identifier, password) {
  const { captchaId, captchaAnswer } = await getCaptcha();

  const resp = await api('POST', 'v1/auth/login', {
    identifier,
    password: encryptPassword(password),
    captcha_id: captchaId,
    captcha_answer: captchaAnswer,
  }, null);

  if (resp.rc !== '00') {
    throw new Error(`Login gagal (rc=${resp.rc}): ${resp.message} | ${JSON.stringify(resp.error)}`);
  }

  if (resp.data?.mfa_required) {
    throw new Error(`Akun ini butuh MFA verification. Gunakan loginIfNeeded() atau resolveMfa() instead.`);
  }

  return {
    token: resp.data.access_token,
    user: resp.data.user,
  };
}

/**
 * Handle login dengan MFA resolution otomatis.
 * - Jika login tanpa MFA → return { token, user }
 * - Jika login butuh MFA → tanya `mfa_token` + TOTP/recovery code → return { token, user }
 *
 * @param {string} identifier
 * @param {string} password
 * @param {string|null} totpCode  - 6-digit TOTP atau recovery code (optional, akan diprompt bila null)
 * @returns {Promise<{token: string, user: object}>}
 */
export async function loginIfNeeded(identifier, password, totpCode = null) {
  const { captchaId, captchaAnswer } = await getCaptcha();

  const resp = await api('POST', 'v1/auth/login', {
    identifier,
    password: encryptPassword(password),
    captcha_id: captchaId,
    captcha_answer: captchaAnswer,
  }, null);

  if (resp.rc !== '00') {
    throw new Error(`Login gagal (rc=${resp.rc}): ${resp.message}`);
  }

  if (resp.data?.mfa_required) {
    // resolve MFA
    if (!totpCode) {
      throw new Error('MFA required but totpCode not provided. Pass totpCode parameter or enroll MFA first.');
    }
    const mfaToken = resp.data.mfa_token;
    const verifyResp = await api('POST', 'v1/auth/mfa/verify', {
      mfa_token: mfaToken,
      code: totpCode,
    }, null);

    if (verifyResp.rc !== '00') {
      throw new Error(`MFA verification gagal (rc=${verifyResp.rc}): ${verifyResp.message}`);
    }

    return {
      token: verifyResp.data.access_token,
      user: verifyResp.data.user,
      mfa_token: mfaToken,
    };
  }

  return {
    token: resp.data.access_token,
    user: resp.data.user,
  };
}

/**
 * Resolve login MFA dengan token + code.
 *
 * @param {string} mfaToken  - dari response login (mfa_token)
 * @param {string} code      - 6-digit TOTP atau recovery code
 * @returns {Promise<{token: string, user: object}>}
 */
export async function resolveMfa(mfaToken, code) {
  const resp = await api('POST', 'v1/auth/mfa/verify', {
    mfa_token: mfaToken,
    code,
  }, null);

  if (resp.rc !== '00') {
    throw new Error(`MFA verification gagal (rc=${resp.rc}): ${resp.message}`);
  }

  return {
    token: resp.data.access_token,
    user: resp.data.user,
  };
}

// ── Convenience: superadmin login ─────────────────────────────────────────────

/**
 * Login sebagai superadmin (MFA harus disabled).
 * Convenience wrapper untuk script yang cuma butuh superadmin token.
 */
export async function loginSuperadmin() {
  return login(SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD);
}

/**
 * Login sebagai superadmin dengan auto MFA resolve.
 */
export async function loginSuperadminIfNeeded(totpCode = null) {
  return loginIfNeeded(SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD, totpCode);
}