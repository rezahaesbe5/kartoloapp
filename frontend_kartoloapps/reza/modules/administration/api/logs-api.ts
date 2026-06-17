// API helper untuk fitur "Akses Log File". Bridge axios signed ke endpoint
// /api/v1/logs/* (sources, access, access/close, search, ws-ticket).
//
// Catatan arsitektur:
//   - /logs/access, /logs/access/close, /logs/sources, /logs/search di-forward
//     gateway ke backend_administration (lihat seed.ts) — FE tidak perlu tahu.
//   - /logs/ws-ticket tetap di gateway (issue Redis ticket).
//   - /logs/search SEKARANG POST body (sebelumnya GET) — supaya filter array
//     muat dikirim.

import { api } from '@/shared/lib/api-client';
import type { ApiEnvelope } from '@/shared/types/envelope';

export type SourceApp =
  | 'backend_gatewayauth'
  | 'backend_administration'
  | 'frontend_kartoloapps';

export const SOURCE_APP_LABEL: Record<SourceApp, string> = {
  backend_gatewayauth: 'Backend Gateway Auth',
  backend_administration: 'Backend Administration',
  frontend_kartoloapps: 'Frontend Kartolo Apps',
};

// ---- Filter (Navicat-like) -------------------------------------------------
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

export const FILTER_KEY_LABEL: Record<FilterKey, string> = {
  level: 'Level',
  message: 'Message',
  action: 'Action',
  endpoint: 'Endpoint',
  method: 'Method',
  status: 'Status',
  trace_id: 'Trace ID',
  source_app: 'Source App',
  ip: 'IP',
  user_email: 'User Email',
  raw: 'Raw',
};
export const FILTER_OP_LABEL: Record<FilterOp, string> = {
  '=': '=',
  '!=': '≠',
  contains: 'contains',
  not_contains: 'not contains',
  starts_with: 'starts with',
  ends_with: 'ends with',
  is_empty: 'is empty',
  is_not_empty: 'is not empty',
};

export type FilterConnector = 'AND' | 'OR';

// Level values — keys yang punya enum value tertentu di-dropdown bukan free text.
export const LEVEL_VALUES = ['info', 'warn', 'error', 'debug', 'trace', 'fatal'] as const;
export type LevelValue = (typeof LEVEL_VALUES)[number];

export interface FilterRow {
  key: FilterKey;
  op: FilterOp;
  value: string;
  connector?: FilterConnector;
}

// ---- Sources & Access ------------------------------------------------------
export interface LogSource {
  source_app: SourceApp;
  dates: string[];
}

export interface SourcesResult {
  sources: LogSource[];
  linked: string[];
}

export async function getLogSources(): Promise<SourcesResult> {
  const res = await api.get<ApiEnvelope<SourcesResult>>('/logs/sources');
  return res.data.data;
}

export interface AccessResult {
  source_app: SourceApp;
  date: string;
  source_path: string;
  dest_path: string;
  status: 'linked' | 'already_linked' | 'source_missing' | 'unlinked' | 'absent';
}

export async function openLogAccess(
  source_app: SourceApp,
  date: string,
): Promise<AccessResult> {
  const res = await api.post<ApiEnvelope<AccessResult>>('/logs/access', { source_app, date });
  return res.data.data;
}

export async function closeLogAccess(
  source_app: SourceApp,
  date: string,
): Promise<AccessResult> {
  const res = await api.post<ApiEnvelope<AccessResult>>('/logs/access/close', {
    source_app,
    date,
  });
  return res.data.data;
}

export interface CloseAllResult {
  removed: string[];
  failed: { file: string; error: string }[];
}

// Wipe semua file di logloki/ — dipakai saat modal Akses Log File ditutup,
// supaya tidak ada file yang tertinggal walaupun user sempat ganti source/date.
export async function closeAllLogAccess(): Promise<CloseAllResult> {
  const res = await api.post<ApiEnvelope<CloseAllResult>>('/logs/access/close-all', {});
  return res.data.data;
}

// ---- Search ----------------------------------------------------------------
export interface LogSearchItem {
  ts: string;
  labels: Record<string, string>;
  record: Record<string, unknown> & { _raw?: string };
  raw?: string;
}

export interface LogSearchResult {
  query: string;
  count: number;
  items: LogSearchItem[];
}

export interface LogSearchBody {
  source_app: SourceApp;
  date: string;
  filters: FilterRow[];
  limit?: number;
}

export async function searchLogs(body: LogSearchBody): Promise<LogSearchResult> {
  const res = await api.post<ApiEnvelope<LogSearchResult>>('/logs/search', {
    source_app: body.source_app,
    date: body.date,
    filters: body.filters,
    limit: body.limit ?? 200,
  });
  return res.data.data;
}

// ---- WebSocket ticket ------------------------------------------------------
export interface WsTicket {
  ticket: string;
  expires_in: number;
}

export async function requestWsTicket(body: LogSearchBody): Promise<WsTicket> {
  const res = await api.post<ApiEnvelope<WsTicket>>('/logs/ws-ticket', {
    source_app: body.source_app,
    date: body.date,
    filters: body.filters,
  });
  return res.data.data;
}
