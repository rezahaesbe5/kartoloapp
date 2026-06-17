// Filter Navicat-like untuk entry log. Post-filter di Node setelah Loki query.
//
// Diapply ke array LokiEntry hasil lokiQueryRange. Setiap entry JSON-parsed,
// lalu setiap row filter dievaluasi terhadap field record. Semua row AND.
//
// Key terstruktur memetakan ke field di record JSON; key "raw" cocokkan baris
// asli sebelum parse (utk pencarian bebas).

import type { LokiEntry } from './loki-client.js';

export const FILTER_KEYS = [
  'level',
  'message',
  'action',
  'endpoint',
  'method',
  'status',
  'trace_id',
  'source_app',
  'ip',
  'user_email',
  'raw',
] as const;
export type FilterKey = (typeof FILTER_KEYS)[number];

export const FILTER_OPS = [
  '=',
  '!=',
  'contains',
  'not_contains',
  'starts_with',
  'ends_with',
  'is_empty',
  'is_not_empty',
] as const;
export type FilterOp = (typeof FILTER_OPS)[number];

// Connector di-ignore untuk baris pertama; mulai baris ke-2, connector
// menentukan grouping: AND mengelompokkan dgn baris sebelumnya, OR memulai
// grup baru. Mirror dari semantik Navicat / SQL (AND lebih tinggi dari OR).
export type FilterConnector = 'AND' | 'OR';

export interface FilterRow {
  key: FilterKey;
  op: FilterOp;
  value: string;
  connector?: FilterConnector;
}

export interface ParsedLogEntry {
  ts: string;
  labels: Record<string, string>;
  record: Record<string, unknown> & { _raw?: string };
  raw: string;
}

function safeParseJson(line: string): Record<string, unknown> & { _raw?: string } {
  try {
    const v = JSON.parse(line) as unknown;
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      return v as Record<string, unknown>;
    }
  } catch {
    // bukan JSON
  }
  return { _raw: line };
}

export function parseEntries(entries: LokiEntry[]): ParsedLogEntry[] {
  return entries.map((e) => ({
    ts: e.ts,
    labels: e.labels,
    record: safeParseJson(e.line),
    raw: e.line,
  }));
}

// Ambil nilai stringified dari ParsedLogEntry sesuai key filter.
function valueFor(entry: ParsedLogEntry, key: FilterKey): string | null {
  if (key === 'raw') return entry.raw;
  const r = entry.record;
  if (key === 'user_email') {
    const ud = r.user_data;
    if (ud && typeof ud === 'object') {
      const email = (ud as Record<string, unknown>).email;
      return typeof email === 'string' ? email : null;
    }
    return null;
  }
  const v = r[key];
  if (v == null) return null;
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  // object/array → JSON utk pencarian substring.
  try {
    return JSON.stringify(v);
  } catch {
    return null;
  }
}

function matchRow(entry: ParsedLogEntry, row: FilterRow): boolean {
  const val = valueFor(entry, row.key);
  const needle = (row.value ?? '').toLowerCase();
  const hay = (val ?? '').toLowerCase();

  switch (row.op) {
    case 'is_empty':
      return val == null || val.length === 0;
    case 'is_not_empty':
      return val != null && val.length > 0;
    case '=':
      return val != null && hay === needle;
    case '!=':
      // Beda dari "is_not_empty": null dianggap match "!= value" kecuali user mau exact.
      // Konvensi Navicat: != value berarti not equal — null lolos juga.
      return val == null || hay !== needle;
    case 'contains':
      return val != null && hay.includes(needle);
    case 'not_contains':
      return val == null || !hay.includes(needle);
    case 'starts_with':
      return val != null && hay.startsWith(needle);
    case 'ends_with':
      return val != null && hay.endsWith(needle);
    default:
      return true;
  }
}

// Kelompokkan baris filter ke "AND-groups" yang dipisah OR.
// Precedence: AND > OR (sama dgn SQL). Baris pertama selalu mulai grup baru.
// Connector pada baris pertama di-ignore. Hasil: array of group; tiap group
// adalah array row yang harus semua match (AND). Match keseluruhan = ada
// minimal 1 group yang match (OR antar group).
function groupByConnector(rows: FilterRow[]): FilterRow[][] {
  const groups: FilterRow[][] = [];
  let current: FilterRow[] = [];
  rows.forEach((r, idx) => {
    if (idx > 0 && r.connector === 'OR') {
      if (current.length > 0) groups.push(current);
      current = [r];
    } else {
      current.push(r);
    }
  });
  if (current.length > 0) groups.push(current);
  return groups;
}

export function applyFilters(entries: ParsedLogEntry[], filters: FilterRow[]): ParsedLogEntry[] {
  // Buang row "incomplete" (value kosong utk operator yang butuh value).
  const active = filters.filter((r) => {
    if (r.op === 'is_empty' || r.op === 'is_not_empty') return true;
    return (r.value ?? '').length > 0;
  });
  if (active.length === 0) return entries;
  const groups = groupByConnector(active);
  return entries.filter((e) => groups.some((g) => g.every((r) => matchRow(e, r))));
}

// LogQL line-filter (push-down) — optimasi opsional. Hanya aman bila SEMUA
// row pakai connector AND (1 grup) DAN target field "raw". Bila ada OR /
// multi-group, kembalikan string kosong — post-filter di Node yang jaga
// semantik. Drop dini di Loki = tarik byte lebih sedikit, tapi correctness
// tetap dipegang applyFilters.
export function buildLokiLineFilter(filters: FilterRow[]): string {
  // Cek presence OR connector di luar baris pertama → skip push-down.
  for (let i = 1; i < filters.length; i++) {
    if (filters[i]?.connector === 'OR') return '';
  }
  const parts: string[] = [];
  for (const r of filters) {
    if (r.key !== 'raw' || !r.value) continue;
    const v = r.value
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
      .replace(/[.*+?^${}()|[\]]/g, (m) => `\\${m}`);
    if (r.op === 'contains') {
      parts.push(` |~ "(?i)${v}"`);
    } else if (r.op === 'starts_with') {
      parts.push(` |~ "(?i)^${v}"`);
    } else if (r.op === 'ends_with') {
      parts.push(` |~ "(?i)${v}$"`);
    } else if (r.op === '=') {
      parts.push(` |~ "(?i)^${v}$"`);
    }
    // Operator lain di-skip — dievaluasi post di applyFilters.
  }
  return parts.join('');
}
