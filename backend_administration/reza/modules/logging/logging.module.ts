import type { FastifyInstance } from 'fastify';
import { backendWriter } from './log-writer.js';
import { registerRequestLogger } from './request-logger.js';

// Catatan: sejak refactor "Akses Log File", admin TIDAK auto-link file ke
// logloki/. Hardlink hanya dibuat oleh gateway saat client submit Akses Log
// File. Admin cukup menulis file harian + DB.

export const loggingModule = {
  name: 'logging',
  owner: 'reza',
  async register(app: FastifyInstance): Promise<void> {
    // 1. Hook global onRequest/onSend — file harian + audit_logs DB.
    registerRequestLogger(app);

    // 2. Init writer (buat file hari ini di /logs admin).
    backendWriter.init();

    app.addHook('onClose', async () => {
      backendWriter.close();
    });
  },
};
