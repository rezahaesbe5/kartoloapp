// Link service untuk fitur "Akses Log File" — dipindahkan dari gateway.
//
// logloki/ dipantau Alloy → Loki. File source TIDAK auto-link; admin membuat
// hardlink eksplisit saat POST /logs/access dan unlink saat /logs/access/close.
//
// Sumber log yang didukung (prefix = APP_ID — sinkron dgn DailyRotatingWriter):
//   - backend_gatewayauth     → <PEER_GATEWAY_LOG_DIR>/backend_gatewayauth-YYYY-MM-DD.log
//   - backend_administration  → <LOG_DIR>/backend_administration-YYYY-MM-DD.log
//   - frontend_kartoloapps    → <PEER_FRONTEND_LOG_DIR>/frontend_kartoloapps-YYYY-MM-DD.log

import fs from 'node:fs';
import path from 'node:path';
import { env } from '../../../src/shared/config/env.js';

const LOKI_DIR = path.resolve(env.LOGLOKI_DIR);

export type SourceApp =
  | 'backend_gatewayauth'
  | 'backend_administration'
  | 'frontend_kartoloapps';

export const SOURCE_APPS: SourceApp[] = [
  'backend_gatewayauth',
  'backend_administration',
  'frontend_kartoloapps',
];

// Prefix = APP_ID per source — sinkron dgn DailyRotatingWriter di tiap app.
const PREFIX: Record<SourceApp, string> = {
  backend_gatewayauth: 'backend_gatewayauth-',
  backend_administration: 'backend_administration-',
  frontend_kartoloapps: 'frontend_kartoloapps-',
};

export interface LinkResult {
  source_app: SourceApp;
  date: string;
  source_path: string;
  dest_path: string;
  status: 'linked' | 'already_linked' | 'source_missing' | 'unlinked' | 'absent';
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function ensureLokiDir(): void {
  fs.mkdirSync(LOKI_DIR, { recursive: true });
}

function dirFor(sourceApp: SourceApp): string {
  switch (sourceApp) {
    case 'backend_gatewayauth':
      return path.resolve(env.PEER_GATEWAY_LOG_DIR);
    case 'backend_administration':
      return path.resolve(env.LOG_DIR);
    case 'frontend_kartoloapps':
      return path.resolve(env.PEER_FRONTEND_LOG_DIR);
  }
}

export function resolveSourcePath(sourceApp: SourceApp, date: string): string {
  return path.join(dirFor(sourceApp), `${PREFIX[sourceApp]}${date}.log`);
}

function destPathFor(sourcePath: string): string {
  return path.join(LOKI_DIR, path.basename(sourcePath));
}

export function linkFileIntoLoki(sourceFilePath: string): LinkResult['status'] {
  ensureLokiDir();
  const dest = destPathFor(sourceFilePath);
  if (fs.existsSync(dest)) return 'already_linked';
  if (!fs.existsSync(sourceFilePath)) return 'source_missing';
  try {
    if (env.LOG_LINK_MODE === 'symlink') {
      const relTarget = path.relative(LOKI_DIR, path.resolve(sourceFilePath));
      fs.symlinkSync(relTarget, dest);
    } else {
      fs.linkSync(sourceFilePath, dest);
    }
    return 'linked';
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'EEXIST') return 'already_linked';
    throw err;
  }
}

export function accessLog(sourceApp: SourceApp, date: string): LinkResult {
  if (!DATE_RE.test(date)) throw new Error('Format tanggal harus YYYY-MM-DD');
  const src = resolveSourcePath(sourceApp, date);
  const status = linkFileIntoLoki(src);
  return { source_app: sourceApp, date, source_path: src, dest_path: destPathFor(src), status };
}

export function closeAccessLog(sourceApp: SourceApp, date: string): LinkResult {
  if (!DATE_RE.test(date)) throw new Error('Format tanggal harus YYYY-MM-DD');
  const src = resolveSourcePath(sourceApp, date);
  const dest = destPathFor(src);
  if (!fs.existsSync(dest)) {
    return { source_app: sourceApp, date, source_path: src, dest_path: dest, status: 'absent' };
  }
  fs.unlinkSync(dest);
  return { source_app: sourceApp, date, source_path: src, dest_path: dest, status: 'unlinked' };
}

// Hapus SEMUA file di logloki/. Dipakai saat modal Akses Log File ditutup —
// pastikan tidak ada hardlink/symlink yang tertinggal walaupun modal sempat
// membuka beberapa file sekaligus. Diam-diam skip entry yang sudah hilang.
export interface WipeResult {
  removed: string[];
  failed: { file: string; error: string }[];
}

export function wipeAllLinkedFiles(): WipeResult {
  const result: WipeResult = { removed: [], failed: [] };
  if (!fs.existsSync(LOKI_DIR)) return result;
  const entries = fs.readdirSync(LOKI_DIR);
  for (const f of entries) {
    const full = path.join(LOKI_DIR, f);
    try {
      const st = fs.lstatSync(full);
      if (!st.isFile() && !st.isSymbolicLink()) continue;
      fs.unlinkSync(full);
      result.removed.push(f);
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === 'ENOENT') continue;
      result.failed.push({ file: f, error: (err as Error).message });
    }
  }
  return result;
}

export function listAvailableDates(sourceApp: SourceApp): string[] {
  const dir = dirFor(sourceApp);
  if (!fs.existsSync(dir)) return [];
  const re = new RegExp(`^${PREFIX[sourceApp]}(\\d{4}-\\d{2}-\\d{2})\\.log$`);
  return fs
    .readdirSync(dir)
    .map((f) => f.match(re)?.[1])
    .filter((d): d is string => Boolean(d))
    .sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));
}

export function listLinkedFiles(): string[] {
  if (!fs.existsSync(LOKI_DIR)) return [];
  return fs.readdirSync(LOKI_DIR).sort();
}
