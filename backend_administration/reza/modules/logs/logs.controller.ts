// Controller modul logs admin. Routes:
//   POST /api/v1/logs/access         — hardlink file (source_app, date) ke logloki/
//   POST /api/v1/logs/access/close   — unlink
//   GET  /api/v1/logs/sources        — daftar (source_app + dates) + linked files
//   POST /api/v1/logs/search         — search via Loki + filter Navicat-like
//
// Auth: requireAdmin baca dari header X-Forwarded-User-Type yg di-inject
// gateway forwarder (defense-in-depth — gateway sudah validate signature+JWT).

import type { FastifyInstance, FastifyPluginAsync, FastifyRequest } from 'fastify';
import { AppError } from '../../../src/shared/errors/app-error.js';
import { successEnvelope } from '../../../src/shared/errors/envelope.js';
import {
  accessLog,
  closeAccessLog,
  listAvailableDates,
  listLinkedFiles,
  SOURCE_APPS,
  wipeAllLinkedFiles,
  type SourceApp,
} from './log-link.service.js';
import { AccessBodySchema, SearchBodySchema } from './logs.schema.js';
import { searchLogsInRange } from './logs.service.js';
import type { FilterRow } from './filter.js';

const ADMIN_TYPES = new Set(['superadmin', 'admin']);

function requireAdmin(req: FastifyRequest): void {
  const raw = req.headers['x-forwarded-user-type'];
  const userType = Array.isArray(raw) ? raw[0] : raw;
  if (!userType || !ADMIN_TYPES.has(userType)) {
    throw new AppError('header_unauthorized', {
      message: 'Hanya admin/superadmin yang boleh mengakses log.',
      code: 'FORBIDDEN',
    });
  }
}

export const logsRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  // GET /sources — daftar source_app + tanggal log file yang tersedia.
  app.get('/sources', async (req, reply) => {
    requireAdmin(req);
    const sources = SOURCE_APPS.map((sa) => ({
      source_app: sa,
      dates: listAvailableDates(sa),
    }));
    return reply
      .status(200)
      .send(successEnvelope(req.id as string, { sources, linked: listLinkedFiles() }, 'OK'));
  });

  // POST /access — hardlink 1 file log ke logloki/. Idempoten.
  app.post('/access', async (req, reply) => {
    requireAdmin(req);
    const body = AccessBodySchema.parse(req.body);
    const result = accessLog(body.source_app as SourceApp, body.date);
    if (result.status === 'source_missing') {
      throw new AppError('not_found', {
        message: `File log ${body.source_app}/${body.date} tidak ditemukan.`,
        code: 'LOG_FILE_NOT_FOUND',
        details: { source_path: result.source_path },
      });
    }
    return reply
      .status(200)
      .send(successEnvelope(req.id as string, result, 'File log diaktifkan untuk dibaca.'));
  });

  // POST /access/close — unlink file dari logloki/.
  app.post('/access/close', async (req, reply) => {
    requireAdmin(req);
    const body = AccessBodySchema.parse(req.body);
    const result = closeAccessLog(body.source_app as SourceApp, body.date);
    return reply
      .status(200)
      .send(successEnvelope(req.id as string, result, 'Akses log ditutup.'));
  });

  // POST /access/close-all — unlink SEMUA file di logloki/. Body kosong;
  // dipakai saat modal Akses Log File ditutup untuk reset bersih, tidak
  // perlu tahu file mana yang sempat dibuka.
  app.post('/access/close-all', async (req, reply) => {
    requireAdmin(req);
    const result = wipeAllLinkedFiles();
    return reply
      .status(200)
      .send(
        successEnvelope(
          req.id as string,
          result,
          `Akses log ditutup (${result.removed.length} file dihapus).`,
        ),
      );
  });

  // POST /search — cari log via Loki + filter Navicat-like.
  app.post('/search', async (req, reply) => {
    requireAdmin(req);
    const body = SearchBodySchema.parse(req.body);
    const result = await searchLogsInRange({
      sourceApp: body.source_app as SourceApp,
      date: body.date,
      filters: body.filters as FilterRow[],
      limit: body.limit,
    });
    return reply.status(200).send(successEnvelope(req.id as string, result, 'OK'));
  });
};
