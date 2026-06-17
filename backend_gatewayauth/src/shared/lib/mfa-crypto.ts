// AES-256-GCM untuk enkripsi TOTP secret di kolom users.two_factor_secret_encrypted.
//
// Format payload (base64 single-string):
//   IV[12] || authTag[16] || ciphertext
//
// Kenapa pakai GCM (beda dari crypto-aes.ts yang AES-CBC untuk password client):
//   - GCM authenticated, jadi tampering ke ciphertext langsung detect saat decrypt.
//   - Tidak butuh IV deterministik — sekali enkripsi per enroll, IV random aman.

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { env } from '../config/env.js';

const IV_LENGTH = 12; // GCM standar
const TAG_LENGTH = 16;
const KEY_LENGTH = 32;

function loadKey(): Buffer {
  const key = Buffer.from(env.MFA_ENCRYPTION_KEY, 'base64');
  if (key.length !== KEY_LENGTH) {
    throw new Error(
      `MFA_ENCRYPTION_KEY bukan 32 byte (dapat ${key.length}). Generate ulang dengan: openssl rand -base64 32`,
    );
  }
  return key;
}

export function encryptMfaSecret(plain: string): string {
  const key = loadKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ct]).toString('base64');
}

export function decryptMfaSecret(payloadB64: string): string {
  const key = loadKey();
  const raw = Buffer.from(payloadB64, 'base64');
  if (raw.length <= IV_LENGTH + TAG_LENGTH) {
    throw new Error('Payload TOTP secret terlalu pendek.');
  }
  const iv = raw.subarray(0, IV_LENGTH);
  const tag = raw.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const ct = raw.subarray(IV_LENGTH + TAG_LENGTH);
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
}
