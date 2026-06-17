// Dekripsi password yang dikirim frontend dengan AES-256-CBC.
//
// Skema (harus sinkron dengan frontend_kartoloapps/src/shared/lib/crypto.ts):
//   key      = base64decode(cfg_client.client_key)  → 32 byte
//   payload  = base64( IV[16] || ciphertext )
//
// client_key di-resolve dari req.gwClient (di-attach gateway-guard).

import { createDecipheriv } from 'node:crypto';
import { AppError } from '../errors/app-error.js';

const IV_LENGTH = 16;
const KEY_LENGTH = 32;

export function decryptPassword(payloadB64: string, clientKeyB64: string): string {
  try {
    const key = Buffer.from(clientKeyB64, 'base64');
    if (key.length !== KEY_LENGTH) {
      throw new Error(`client_key bukan 32 byte (dapat ${key.length})`);
    }

    const raw = Buffer.from(payloadB64, 'base64');
    if (raw.length <= IV_LENGTH) {
      throw new Error('payload terlalu pendek');
    }

    const iv = raw.subarray(0, IV_LENGTH);
    const ciphertext = raw.subarray(IV_LENGTH);

    const decipher = createDecipheriv('aes-256-cbc', key, iv);
    const plain = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return plain.toString('utf8');
  } catch (err) {
    throw new AppError('body_invalid', {
      message: 'Password terenkripsi tidak valid.',
      code: 'PASSWORD_DECRYPT_FAILED',
      cause: err,
    });
  }
}
