import { randomUUID } from 'node:crypto';
import svgCaptcha from 'svg-captcha';
import { env } from '../config/env.js';
import { redis } from './redis.js';

const CAPTCHA_KEY = (id: string) => `captcha:${id}`;

export interface CaptchaIssue {
  captcha_id: string;
  svg: string;
  expires_in_seconds: number;
}

// Karakter captcha: huruf besar A–Z + digit 2–9 (tanpa huruf kecil).
// Karakter ambigu visual dikecualikan:
//   - huruf: I, L, O (mirip 1/0)
//   - digit: 0, 1 (mirip O/I/L)
const CAPTCHA_CHARSET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export async function issueCaptcha(): Promise<CaptchaIssue> {
  const cap = svgCaptcha.create({
    size: 5,
    noise: 3,
    color: true,
    background: '#F0FDF4',
    charPreset: CAPTCHA_CHARSET,
    fontSize: 56,
    width: 180,
    height: 64,
  });
  const id = randomUUID();
  // Simpan jawaban dalam uppercase (charset sudah uppercase).
  // Verifikasi tetap toleran terhadap input lowercase (lihat consumeCaptcha).
  await redis.set(CAPTCHA_KEY(id), cap.text.toUpperCase(), 'EX', env.CAPTCHA_TTL_SECONDS);
  return {
    captcha_id: id,
    svg: cap.data,
    expires_in_seconds: env.CAPTCHA_TTL_SECONDS,
  };
}

/**
 * One-time use: kalau cocok, hapus key setelah baca.
 * Return:
 *  - 'ok'        → cocok, key sudah dihapus
 *  - 'mismatch'  → tidak cocok, key sudah dihapus (paksa user fetch baru)
 *  - 'expired'   → key tidak ada / sudah expire
 */
export async function consumeCaptcha(captchaId: string, answer: string): Promise<'ok' | 'mismatch' | 'expired'> {
  const expected = await redis.get(CAPTCHA_KEY(captchaId));
  if (expected === null) return 'expired';
  // Selalu hapus — captcha one-time even on mismatch, hindari brute force.
  await redis.del(CAPTCHA_KEY(captchaId));
  return expected === answer.trim().toUpperCase() ? 'ok' : 'mismatch';
}
