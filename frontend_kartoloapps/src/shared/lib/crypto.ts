// Enkripsi password sebelum dikirim ke backend (AES-256-CBC).
//
// Skema (harus sinkron dengan backend_gatewayauth/src/shared/lib/crypto-aes.ts):
//   key      = Base64.parse(clientKey)  → WordArray 32 byte (raw key, bukan passphrase)
//   payload  = Base64( IV[16] || ciphertext )

import CryptoJS from 'crypto-js';
import { env } from '../config/env';

export function encryptPassword(plaintext: string): string {
  const key = CryptoJS.enc.Base64.parse(env.clientKey);
  const iv = CryptoJS.lib.WordArray.random(16);

  const encrypted = CryptoJS.AES.encrypt(plaintext, key, {
    iv,
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7,
  });

  // Gabung IV + ciphertext, encode base64 jadi satu string opaque.
  const combined = iv.clone().concat(encrypted.ciphertext);
  return CryptoJS.enc.Base64.stringify(combined);
}
