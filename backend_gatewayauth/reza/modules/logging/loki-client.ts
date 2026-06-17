// Client HTTP ringan untuk Loki. Memakai global fetch (Node 20+) — tanpa
// dependency tambahan. Loki tidak di-expose publik; hanya gateway yang akses.

import { env } from '../../../src/shared/config/env.js';

export interface LokiEntry {
  ts: string; // nanosecond epoch (string)
  line: string;
  labels: Record<string, string>;
}

interface LokiStream {
  stream: Record<string, string>;
  values: Array<[string, string]>;
}

interface LokiQueryResponse {
  status: string;
  data: { resultType: string; result: LokiStream[] };
}

export interface LokiQueryOptions {
  query: string;
  startNs: string;
  endNs: string;
  limit: number;
  direction?: 'forward' | 'backward';
}

export async function lokiQueryRange(opts: LokiQueryOptions): Promise<LokiEntry[]> {
  const url = new URL('/loki/api/v1/query_range', env.LOKI_URL);
  url.searchParams.set('query', opts.query);
  url.searchParams.set('start', opts.startNs);
  url.searchParams.set('end', opts.endNs);
  url.searchParams.set('limit', String(opts.limit));
  url.searchParams.set('direction', opts.direction ?? 'backward');

  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) {
    throw new Error(`Loki query gagal (${res.status}): ${await res.text()}`);
  }
  const json = (await res.json()) as LokiQueryResponse;

  const entries: LokiEntry[] = [];
  for (const stream of json.data?.result ?? []) {
    for (const [ts, line] of stream.values) {
      entries.push({ ts, line, labels: stream.stream });
    }
  }
  // Loki kembalikan per-stream; urutkan global by timestamp.
  entries.sort((a, b) =>
    opts.direction === 'forward'
      ? (a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : 0)
      : (a.ts > b.ts ? -1 : a.ts < b.ts ? 1 : 0),
  );
  return entries;
}

export async function lokiReady(): Promise<boolean> {
  try {
    const res = await fetch(new URL('/ready', env.LOKI_URL), {
      signal: AbortSignal.timeout(3_000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// ---- LogQL builder ----------------------------------------------------------
// Label cardinality rendah: hanya job/source/level. trace_id & keyword =
// line-filter pada isi JSON, BUKAN label.

export interface LogFilter {
  source?: string;
  app?: string;
  level?: string;
  traceId?: string;
  keyword?: string;
}

function escapeLogQL(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

export function buildLogQL(filter: LogFilter): string {
  const labels = ['job="kartolo"'];
  if (filter.source) labels.push(`source="${escapeLogQL(filter.source)}"`);
  if (filter.app) labels.push(`app="${escapeLogQL(filter.app)}"`);
  if (filter.level) labels.push(`level="${escapeLogQL(filter.level)}"`);

  let query = `{${labels.join(',')}}`;

  if (filter.keyword) {
    // case-insensitive substring match pada baris mentah
    query += ` |~ "(?i)${escapeLogQL(filter.keyword)}"`;
  }
  if (filter.traceId) {
    query += ` | json | trace_id="${escapeLogQL(filter.traceId)}"`;
  }
  return query;
}
