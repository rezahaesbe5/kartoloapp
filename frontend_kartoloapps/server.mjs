/**
 * server.mjs — Micro static server untuk FE (production Docker).
 * ============================================================
 * Pengganti `serve`. Zero dependency (Node.js built-in saja).
 *
 * Fungsi utama: RUNTIME ENV INJECTION.
 *   Saat start, baca .env.frontend → parse VITE_* → inject ke index.html
 *   dengan mengganti placeholder `__APP_ENV_JSON__` jadi JSON nyata.
 *   Browser load HTML → window.__APP_ENV__ = {nilai dari .env.frontend}.
 *
 *   Akibatnya: GANTI .env.frontend + RESTART container = nilai baru langsung
 *   dipakai, TANPA rebuild bundle JS. (Bundle JS tidak punya nilai env apa pun.)
 *
 * Static serving:
 *   - File ada di dist/ → serve dengan Content-Type + cache header benar.
 *   - File asset (hash di nama) → cache panjang (immutable).
 *   - index.html → no-cache (selalu ambil yang fresh, env bisa berubah).
 *   - Route tidak match file (SPA) → fallback ke index.html.
 *
 * Env config:
 *   PORT        port listen (default 8080)
 *   ENV_FILE    path .env.frontend (default ./.env.frontend)
 *   DIST_DIR    folder static (default ./dist)
 */

import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, normalize, extname } from 'node:path';

const PORT = Number(process.env.PORT ?? 8080);
const DIST_DIR = process.env.DIST_DIR ?? join(process.cwd(), 'dist');
const ENV_FILE = process.env.ENV_FILE ?? join(process.cwd(), '.env.frontend');
const PLACEHOLDER = '__APP_ENV_JSON__';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.eot': 'application/vnd.ms-fontobject',
  '.map': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
};

// ── Parse .env.frontend → ambil VITE_* saja ──────────────────────────────────
function loadRuntimeEnv() {
  const out = {};
  if (!existsSync(ENV_FILE)) {
    console.warn(`[fe-server] ⚠ ENV_FILE not found: ${ENV_FILE} — window.__APP_ENV__ = {}`);
    return out;
  }
  const content = readFileSync(ENV_FILE, 'utf8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    if (!key.startsWith('VITE_')) continue;
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

// ── Siapkan index.html dengan env ter-inject (di-build SEKALI saat start) ────
const runtimeEnv = loadRuntimeEnv();
const envJson = JSON.stringify(runtimeEnv);

const indexPath = join(DIST_DIR, 'index.html');
if (!existsSync(indexPath)) {
  console.error(`[fe-server] ✗ index.html not found in ${DIST_DIR}`);
  process.exit(1);
}
let indexHtml = readFileSync(indexPath, 'utf8');
if (indexHtml.includes(PLACEHOLDER)) {
  indexHtml = indexHtml.replaceAll(PLACEHOLDER, envJson);
  console.log(`[fe-server] ✓ injected window.__APP_ENV__ = ${envJson}`);
} else {
  console.warn(`[fe-server] ⚠ placeholder ${PLACEHOLDER} tidak ditemukan di index.html`);
}

// ── Static file resolver (anti path-traversal) ───────────────────────────────
function resolveStatic(urlPath) {
  // Strip query string + decode
  let pathname = decodeURIComponent(urlPath.split('?')[0]);
  if (pathname === '/') pathname = '/index.html';
  // Normalize + cegah traversal keluar DIST_DIR
  const safe = normalize(pathname).replace(/^(\.\.[/\\])+/, '');
  const full = join(DIST_DIR, safe);
  if (!full.startsWith(DIST_DIR)) return null;
  if (existsSync(full) && statSync(full).isFile()) return full;
  return null;
}

const server = createServer((req, res) => {
  const urlPath = req.url ?? '/';

  // index.html (root atau eksplisit) → versi ter-inject, no-cache.
  if (urlPath === '/' || urlPath.split('?')[0] === '/index.html') {
    res.writeHead(200, {
      'Content-Type': MIME['.html'],
      'Cache-Control': 'no-cache, no-store, must-revalidate',
    });
    res.end(indexHtml);
    return;
  }

  const filePath = resolveStatic(urlPath);
  if (filePath) {
    const ext = extname(filePath).toLowerCase();
    // Asset ber-hash (Vite) → immutable. File lain → cache pendek.
    const isHashed = /\/assets\//.test(filePath);
    res.writeHead(200, {
      'Content-Type': MIME[ext] ?? 'application/octet-stream',
      'Cache-Control': isHashed
        ? 'public, max-age=31536000, immutable'
        : 'public, max-age=3600',
    });
    res.end(readFileSync(filePath));
    return;
  }

  // SPA fallback → index.html ter-inject (no-cache).
  res.writeHead(200, {
    'Content-Type': MIME['.html'],
    'Cache-Control': 'no-cache, no-store, must-revalidate',
  });
  res.end(indexHtml);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[fe-server] listening on :${PORT} (dist=${DIST_DIR})`);
});
