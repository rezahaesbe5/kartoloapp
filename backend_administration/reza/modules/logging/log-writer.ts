// Penulis log harian. Pakai Writable stream append biasa supaya predictable
// di lingkungan WSL + bind-mount /mnt/d (worker-thread transport rawan).

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

  init(): void {
    try {
      this.ensureStream();
    } catch {
      // noop
    }
  }

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

// Prefix file = APP_ID supaya beda dari backend_gatewayauth (yg pakai prefix "backend").
export const backendWriter = new DailyRotatingWriter(env.LOG_DIR, env.APP_ID);
