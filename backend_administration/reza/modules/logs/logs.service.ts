// Service layer modul logs di admin: bridge antara controller/WS handler dgn
// Loki client + filter Navicat-like + log-link.

import { applyFilters, buildLokiLineFilter, parseEntries, type FilterRow, type ParsedLogEntry } from './filter.js';
import { buildLogQL, lokiQueryRange } from './loki-client.js';
import type { SourceApp } from './log-link.service.js';

const MS_TO_NS = 1_000_000n;

export function dayBoundsNs(date: string): { startNs: string; endNs: string } {
  const start = new Date(`${date}T00:00:00`);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return {
    startNs: (BigInt(start.getTime()) * MS_TO_NS).toString(),
    endNs: (BigInt(end.getTime()) * MS_TO_NS).toString(),
  };
}

function sourceToLabel(sourceApp: SourceApp): 'backend' | 'frontend' {
  return sourceApp === 'frontend_kartoloapps' ? 'frontend' : 'backend';
}

export interface SearchParams {
  sourceApp: SourceApp;
  date: string;
  filters: FilterRow[];
  limit: number;
}

export interface SearchResult {
  query: string;
  count: number;
  items: ParsedLogEntry[];
}

export async function searchLogsInRange(params: SearchParams): Promise<SearchResult> {
  const baseQuery = buildLogQL({
    source: sourceToLabel(params.sourceApp),
    app: params.sourceApp,
  });
  const lineFilter = buildLokiLineFilter(params.filters);
  const query = `${baseQuery}${lineFilter}`;

  const { startNs, endNs } = dayBoundsNs(params.date);
  // Loki limit: ambil 2-3x dari requested supaya post-filter punya cukup data,
  // tetap di-cap aman.
  const lokiLimit = Math.min(params.limit * 3, 1000);
  const raw = await lokiQueryRange({
    query,
    startNs,
    endNs,
    limit: lokiLimit,
    direction: 'backward',
  });
  const parsed = parseEntries(raw);
  const filtered = applyFilters(parsed, params.filters).slice(0, params.limit);
  return { query, count: filtered.length, items: filtered };
}

export interface StreamTickParams {
  sourceApp: SourceApp;
  filters: FilterRow[];
  startNs: string;
  endNs: string;
}

export async function streamTick(params: StreamTickParams): Promise<ParsedLogEntry[]> {
  const baseQuery = buildLogQL({
    source: sourceToLabel(params.sourceApp),
    app: params.sourceApp,
  });
  const lineFilter = buildLokiLineFilter(params.filters);
  const query = `${baseQuery}${lineFilter}`;
  const raw = await lokiQueryRange({
    query,
    startNs: params.startNs,
    endNs: params.endNs,
    limit: 500,
    direction: 'forward',
  });
  const parsed = parseEntries(raw);
  return applyFilters(parsed, params.filters);
}

export function buildSearchQueryString(sourceApp: SourceApp, filters: FilterRow[]): string {
  const baseQuery = buildLogQL({
    source: sourceToLabel(sourceApp),
    app: sourceApp,
  });
  return `${baseQuery}${buildLokiLineFilter(filters)}`;
}
