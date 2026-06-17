// Kartolo API Gateway request signing (client side).
// Sinkron dengan backend_gatewayauth/src/shared/middleware/gateway-guard.ts.
//
// Formula:
//   stringToSign = METHOD + ":" + endpointUrl + ":" + xTimestamp + ":" + tokenStr + ":" + hashedBody
//   xSignature   = Base64(HMAC_SHA512(clientKey, stringToSign))
//
// endpointUrl   : path tanpa "/api/" prefix, contoh "v1/auth/login"
// tokenStr      : "Bearer <jwt>" kalau endpoint butuh auth, else literal "noAuth"
// hashedBody    : "nobody" untuk GET; selain itu SHA256(JSON.stringify(JSON.parse(bodyRaw))) hex lowercase

import CryptoJS from 'crypto-js';
import { env } from '../config/env';

export interface SignResult {
  xTimestamp: string;
  xSignature: string;
}

export function signRequest(args: {
  method: string;
  endpointUrl: string;
  bodyRaw: string | null;
  accessToken: string | null;
}): SignResult {
  const method = args.method.toUpperCase();
  const xTimestamp = new Date().toISOString(); // ISO 8601, UTC dengan suffix "Z" — backend Date.parse accept.
  const tokenStr = args.accessToken ? `Bearer ${args.accessToken}` : 'noAuth';
  const hashedBody = computeHashedBody(method, args.bodyRaw);

  const stringToSign = `${method}:${args.endpointUrl}:${xTimestamp}:${tokenStr}:${hashedBody}`;

  // Sesuai pattern user: HmacSHA512 → toString (hex) → Hex.parse → Base64.stringify.
  // Equivalent dengan langsung Base64.stringify(HmacSHA512(...)) — keduanya hasilkan string yang sama.
  const hash = CryptoJS.HmacSHA512(stringToSign, env.clientKey);
  const xSignature = CryptoJS.enc.Base64.stringify(CryptoJS.enc.Hex.parse(hash.toString()));

  return { xTimestamp, xSignature };
}

function computeHashedBody(method: string, bodyRaw: string | null): string {
  if (method === 'GET') return 'nobody';
  const raw = bodyRaw && bodyRaw.length > 0 ? bodyRaw : '{}';
  // Minify: parse lalu stringify ulang supaya whitespace tidak pengaruh hash.
  const minified = JSON.stringify(JSON.parse(raw));
  return CryptoJS.SHA256(minified).toString(CryptoJS.enc.Hex).toLowerCase();
}
