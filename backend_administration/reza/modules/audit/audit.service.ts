// Query list audit log dari gateway_auth.audit_logs.
// Pakai $queryRaw (parameterized) supaya bisa ILIKE pada kolom jsonb (user_data)
// dan ORDER BY kolom dinamis — keduanya di luar kemampuan query builder Prisma.

import { Prisma } from '@prisma/client';
import { prisma } from '../../../src/shared/lib/prisma.js';
import {
  CACHE_TTL,
  getItemCache,
  getListCache,
} from '../../../src/shared/lib/cache-store.js';
import type { AuditListBody } from './audit.schema.js';

// Whitelist kolom sort — sort_by sudah divalidasi enum di schema, peta ini
// jadi lapis kedua supaya tidak ada string sembarang masuk ke ORDER BY.
const SORT_COLUMNS: Record<AuditListBody['sort_by'], string> = {
  created_at: 'created_at',
  trace_id: 'trace_id',
  action: 'action',
  endpoint: 'endpoint',
  message: 'message',
  ip: 'ip',
};

export interface AuditLogRow {
  id: string;
  trace_id: string | null;
  source_app: string | null;
  user_id: string | null;
  client_id: string | null;
  action: string;
  endpoint: string | null;
  method: string | null;
  message: string | null;
  ip: string | null;
  user_agent: string | null;
  user_data: unknown;
  created_at: Date;
}

// Detail row = list row + 3 kolom berat yang sengaja tidak ikut di list.
export interface AuditLogDetailRow extends AuditLogRow {
  request_header: unknown;
  request_body: unknown;
  response_body: unknown;
}

export interface AuditListResult {
  items: AuditLogRow[];
  pagination: {
    page: number;
    page_size: number;
    total: number;
    total_pages: number;
  };
}

// date_to "2026-05-22" (tanggal saja) → inklusif sampai akhir hari.
function toRangeEnd(value: string): Date {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return new Date(`${value}T23:59:59.999`);
  return new Date(value);
}

// Query DB murni (tanpa cache) — fetcher untuk cache-aside.
// Catatan: audit_logs append-only (tidak ada update/delete), jadi cukup andalkan
// TTL pendek (10s) untuk konsistensi; tidak perlu invalidate-on-write.
async function queryAuditLogs(q: AuditListBody): Promise<AuditListResult> {
  const conditions: Prisma.Sql[] = [];

  if (q.search) {
    const like = `%${q.search}%`;
    conditions.push(Prisma.sql`(
      "trace_id" ILIKE ${like}
      OR "action" ILIKE ${like}
      OR "endpoint" ILIKE ${like}
      OR "message" ILIKE ${like}
      OR "ip" ILIKE ${like}
      OR "user_data"->>'email' ILIKE ${like}
      OR "user_data"->>'full_name' ILIKE ${like}
    )`);
  }
  if (q.action) {
    conditions.push(Prisma.sql`"action" = ${q.action}`);
  }
  if (q.trace_id) {
    conditions.push(Prisma.sql`"trace_id" ILIKE ${`%${q.trace_id}%`}`);
  }
  if (q.date_from) {
    conditions.push(Prisma.sql`"created_at" >= ${new Date(q.date_from)}`);
  }
  if (q.date_to) {
    conditions.push(Prisma.sql`"created_at" <= ${toRangeEnd(q.date_to)}`);
  }

  const whereSql = conditions.length
    ? Prisma.sql`WHERE ${Prisma.join(conditions, ' AND ')}`
    : Prisma.empty;

  const sortCol = SORT_COLUMNS[q.sort_by];
  const sortDir = q.sort_dir === 'asc' ? 'ASC' : 'DESC';
  const offset = (q.page - 1) * q.page_size;

  const items = await prisma.$queryRaw<AuditLogRow[]>(Prisma.sql`
    SELECT "id", "trace_id", "source_app", "user_id", "client_id", "action",
           "endpoint", "method", "message", "ip", "user_agent", "user_data", "created_at"
    FROM "gateway_auth"."audit_logs"
    ${whereSql}
    ORDER BY ${Prisma.raw(`"${sortCol}"`)} ${Prisma.raw(sortDir)}, "id" DESC
    LIMIT ${q.page_size} OFFSET ${offset}
  `);

  const countRows = await prisma.$queryRaw<Array<{ total: number }>>(Prisma.sql`
    SELECT COUNT(*)::int AS total
    FROM "gateway_auth"."audit_logs"
    ${whereSql}
  `);
  const total = countRows[0]?.total ?? 0;

  return {
    items,
    pagination: {
      page: q.page,
      page_size: q.page_size,
      total,
      total_pages: Math.max(1, Math.ceil(total / q.page_size)),
    },
  };
}

export async function listAuditLogs(q: AuditListBody): Promise<AuditListResult> {
  return getListCache('audit', q, CACHE_TTL.audit.list, () => queryAuditLogs(q));
}

// Ambil 1 baris audit log lengkap (16 kolom) untuk modal detail.
// Audit row immutable → aman di-cache lebih lama (TTL item 30s).
export async function getAuditLogDetail(id: string): Promise<AuditLogDetailRow | null> {
  return getItemCache('audit', id, CACHE_TTL.audit.item, async () => {
    const rows = await prisma.$queryRaw<AuditLogDetailRow[]>(Prisma.sql`
      SELECT "id", "trace_id", "source_app", "user_id", "client_id", "action",
             "endpoint", "method", "message", "ip", "user_agent", "user_data", "created_at",
             "request_header", "request_body", "response_body"
      FROM "gateway_auth"."audit_logs"
      WHERE "id" = ${id}::uuid
      LIMIT 1
    `);
    return rows[0] ?? null;
  });
}
