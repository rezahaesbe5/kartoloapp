// Penulis log harian. Sengaja TIDAK pakai pino-roll transport: di lingkungan
// WSL + bind-mount /mnt/d, worker-thread transport rawan tidak reliable.
// Writable stream append biasa lebih predictable dan tetap async (non-blocking).

import fs from 'node:fs';
import path from 'node:path';
import { env } from '../../../src/shared/config/env.js';

export type RotateCallback = (filePath: string) => void;

function dateStr(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export class DailyRotatingWriter {
  readonly dir: string;
  readonly prefix: string;
  /** Dipanggil saat file hari baru pertama kali dibuat (untuk hardlink ke logloki/). */
  onRotate?: RotateCallback;

  private streamDate = '';
  private stream: fs.WriteStream | null = null;

  constructor(dir: string, prefix: string) {
    this.dir = path.resolve(dir);
    this.prefix = prefix;
  }

  fileNameFor(date: string): string {
    return `${this.prefix}-${date}.log`;
  }

  filePathFor(date: string): string {
    return path.join(this.dir, this.fileNameFor(date));
  }

  currentFilePath(): string {
    return this.filePathFor(dateStr());
  }

  private ensureStream(): fs.WriteStream {
    const today = dateStr();
    if (this.stream && this.streamDate === today) return this.stream;
    if (this.stream) this.stream.end();

    fs.mkdirSync(this.dir, { recursive: true });
    this.streamDate = today;
    const filePath = this.filePathFor(today);
    const isNewFile = !fs.existsSync(filePath);
    this.stream = fs.createWriteStream(filePath, { flags: 'a' });
    if (isNewFile && this.onRotate) {
      try {
        this.onRotate(filePath);
      } catch {
        // hardlink gagal tidak boleh mengganggu penulisan log
      }
    }
    return this.stream;
  }

  /** Buat file hari ini lebih awal (dipanggil saat startup). */
  init(): void {
    try {
      this.ensureStream();
    } catch {
      // noop
    }
  }

  /** Tulis satu record sebagai 1 baris JSON. Tidak pernah melempar error. */
  write(record: unknown): void {
    try {
      this.ensureStream().write(`${JSON.stringify(record)}\n`);
    } catch {
      // logging tidak boleh pernah men-throw ke jalur request
    }
  }

  close(): void {
    try {
      this.stream?.end();
    } catch {
      // noop
    }
    this.stream = null;
  }
}

// Dua writer: log transaksi backend, dan log yang dikirim frontend via ingest.
// Prefix file = APP_ID (mis. "backend_gatewayauth-YYYY-MM-DD.log") supaya tiap
// app punya identitas unik di nama file — konsisten dgn pola admin.
export const backendWriter = new DailyRotatingWriter(env.LOG_DIR, env.APP_ID);
export const frontendWriter = new DailyRotatingWriter(
  env.FRONTEND_LOG_DIR,
  'frontend_kartoloapps',
);
