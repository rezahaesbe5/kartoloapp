import type { FastifyInstance } from 'fastify';
import { backendWriter } from './log-writer.js';
import { logsRoutes } from './logs.controller.js';
import { registerLogsWsProxy } from './logs-ws-proxy.js';
import { purgeOldLogs } from './retention.service.js';
import { registerRequestLogger } from './request-logger.js';

// Catatan desain: SEJAK refactor "Akses Log File" — folder logloki/ TIDAK lagi
// di-populate otomatis. File hanya di-hardlink saat client (modal Akses Log File)
// secara eksplisit submit source_app + tanggal lewat endpoint POST /logs/access.
// Saat client tutup modal, file di-unlink lewat POST /logs/access/close.
// Tujuan: logloki/ hanya berisi file yang sedang aktif diakses.

export const loggingModule = {
  name: 'logging',
  owner: 'reza',
  async register(app: FastifyInstance): Promise<void> {
    // 0. Purge file log mentah (bukan logloki/) yang lebih lama dari retensi.
    purgeOldLogs();

    // 1. Hook global onRequest/onSend — catat tiap transaksi ke file harian.
    registerRequestLogger(app);

    // 2. Init writer (buat file hari ini) — tanpa onRotate hardlink ke logloki/.
    backendWriter.init();
    // frontendWriter dinonaktifkan per 2026-06-18 (user request: FE tidak catat log ke file).
    // frontendWriter.init();

    // 3. Endpoint /api/v1/logs/* yang ditangani LOKAL gateway:
    //    /client (ingest FE), /ws-ticket (issue ticket), /audit, /health.
    //    Endpoint /access, /access/close, /search, /sources sudah dipindah ke
    //    backend_administration — gateway hanya forward via mst_endpoint.backend_url.
    await app.register(logsRoutes, { prefix: '/api/v1/logs' });

    // 4. WebSocket proxy /api/v1/logs/ws → backend_administration upstream.
    //    Diregister di scope app utama supaya path absolute (bukan prefix-based).
    await registerLogsWsProxy(app);

    app.addHook('onClose', async () => {
      backendWriter.close();
      // frontendWriter.close(); // dinonaktifkan
    });
  },
};
