import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Activity,
  Braces,
  Check,
  ChevronDown,
  Clock,
  Copy,
  Fingerprint,
  Globe,
  Hash,
  Link2,
  Mail,
  MessageSquare,
  Network,
  ScrollText,
  Server,
  Tag,
  Terminal,
  X,
} from 'lucide-react';
import type { LogSearchItem } from '../api/logs-api';

interface LogEntryDetailModalProps {
  open: boolean;
  onClose: () => void;
  entry: LogSearchItem | null;
}

function formatFullTsFromNs(ns: string): string {
  try {
    const ms = Number(BigInt(ns) / 1_000_000n);
    const d = new Date(ms);
    return (
      d.toLocaleString('id-ID', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      }) +
      '.' +
      String(d.getMilliseconds()).padStart(3, '0')
    );
  } catch {
    return ns;
  }
}

function stringify(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function strOrNull(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'string') return v.length === 0 ? null : v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  return null;
}

function levelChipClass(lvl: string): string {
  const l = lvl.toLowerCase();
  if (l === 'error' || l === 'fatal')
    return 'bg-red-50 text-red-700 ring-red-200/70 dark:bg-red-500/15 dark:text-red-300 dark:ring-red-500/30';
  if (l === 'warn')
    return 'bg-amber-50 text-amber-700 ring-amber-200/70 dark:bg-amber-500/15 dark:text-amber-300 dark:ring-amber-500/30';
  if (l === 'debug' || l === 'trace')
    return 'bg-slate-100 text-slate-600 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700';
  return 'bg-emerald-50 text-emerald-700 ring-emerald-200/70 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-500/30';
}

function statusChipClass(status: number): string {
  if (status >= 500)
    return 'bg-red-50 text-red-700 ring-red-200/70 dark:bg-red-500/15 dark:text-red-300 dark:ring-red-500/30';
  if (status >= 400)
    return 'bg-amber-50 text-amber-700 ring-amber-200/70 dark:bg-amber-500/15 dark:text-amber-300 dark:ring-amber-500/30';
  if (status >= 300)
    return 'bg-sky-50 text-sky-700 ring-sky-200/70 dark:bg-sky-500/15 dark:text-sky-300 dark:ring-sky-500/30';
  return 'bg-emerald-50 text-emerald-700 ring-emerald-200/70 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-500/30';
}

function MetaItem({
  icon,
  label,
  value,
  mono = false,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | null | undefined;
  mono?: boolean;
}) {
  const empty = !value;
  return (
    <div className="flex items-start gap-2.5 min-w-0">
      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary-50 dark:bg-primary-500/15 text-primary-600 dark:text-primary-300">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
          {label}
        </p>
        <p
          className={`mt-0.5 text-sm break-words ${
            empty
              ? 'italic text-slate-400 dark:text-slate-500'
              : 'text-slate-700 dark:text-slate-100'
          } ${mono && !empty ? 'font-mono text-xs' : ''}`}
        >
          {empty ? '—' : value}
        </p>
      </div>
    </div>
  );
}

function JsonSection({
  title,
  icon,
  data,
  defaultOpen = false,
}: {
  title: string;
  icon: React.ReactNode;
  data: unknown;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [copied, setCopied] = useState(false);
  const text = useMemo(() => stringify(data), [data]);
  const empty = !text;

  async function copy() {
    if (empty) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="rounded-2xl border border-slate-200 dark:border-slate-700/70 bg-white/50 dark:bg-slate-900/40 overflow-hidden">
      <div className="flex items-center gap-2 px-3 sm:px-4 py-2.5">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex flex-1 items-center gap-2 text-left min-w-0"
          aria-expanded={open}
        >
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary-50 dark:bg-primary-500/15 text-primary-600 dark:text-primary-300">
            {icon}
          </span>
          <span className="text-sm font-semibold text-slate-700 dark:text-slate-100 truncate">
            {title}
          </span>
          {empty && (
            <span className="text-[10px] font-medium uppercase tracking-wider text-slate-400 dark:text-slate-500">
              kosong
            </span>
          )}
          <ChevronDown
            className={`ml-auto h-4 w-4 shrink-0 text-slate-400 transition-transform duration-200 ${
              open ? 'rotate-180' : ''
            }`}
          />
        </button>
        {!empty && open && (
          <button
            type="button"
            onClick={copy}
            aria-label={`Salin ${title}`}
            className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            {copied ? (
              <>
                <Check className="h-3.5 w-3.5 text-emerald-500" />
                <span className="hidden sm:inline">Tersalin</span>
              </>
            ) : (
              <>
                <Copy className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Salin</span>
              </>
            )}
          </button>
        )}
      </div>
      {open && (
        <div className="border-t border-slate-200 dark:border-slate-700/70 bg-slate-50/80 dark:bg-slate-950/40 max-h-72 overflow-auto">
          {empty ? (
            <p className="px-4 py-3 text-xs italic text-slate-400 dark:text-slate-500">
              Tidak ada data.
            </p>
          ) : (
            <pre className="px-3 sm:px-4 py-3 text-xs leading-relaxed font-mono text-slate-700 dark:text-slate-200 whitespace-pre-wrap break-words">
              {text}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

export function LogEntryDetailModal({ open, onClose, entry }: LogEntryDetailModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open || !entry) return null;

  const rec = entry.record ?? {};
  const userData = (rec.user_data ?? null) as Record<string, unknown> | null;

  const level = strOrNull(rec.level);
  const method = strOrNull(rec.method);
  const endpoint = strOrNull(rec.endpoint) ?? strOrNull(rec.url);
  const action = strOrNull(rec.action);
  const message = strOrNull(rec.message);
  const traceId = strOrNull(rec.trace_id) ?? strOrNull(entry.labels?.trace_id);
  const sourceApp =
    strOrNull(rec.source_app) ??
    strOrNull(entry.labels?.source_app) ??
    strOrNull(entry.labels?.source) ??
    null;
  const ip = strOrNull(rec.ip);
  const userEmail =
    strOrNull(userData?.email) ?? strOrNull(rec.user_email);
  const userName = strOrNull(userData?.full_name);
  const userAgent = strOrNull(rec.user_agent);
  const clientId = strOrNull(rec.client_id);
  const statusRaw = rec.status;
  const status =
    typeof statusRaw === 'number'
      ? statusRaw
      : typeof statusRaw === 'string' && statusRaw.length > 0
        ? Number(statusRaw)
        : null;

  // Section split: header umum vs payload spesifik.
  const requestHeader = (rec.request_header ?? rec.req_header ?? null) as unknown;
  const requestBody = (rec.request_body ?? rec.req_body ?? null) as unknown;
  const responseBody = (rec.response_body ?? rec.res_body ?? null) as unknown;

  return createPortal(
    <div
      className="fixed inset-0 z-[110] flex items-end sm:items-center justify-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Detail Log Entry"
    >
      <div
        className="absolute inset-0 bg-slate-900/55 dark:bg-slate-950/75 backdrop-blur-sm animate-fade-in"
        onClick={onClose}
      />

      <div className="relative w-full sm:max-w-3xl lg:max-w-4xl glass-card rounded-t-3xl sm:rounded-3xl animate-fade-in-up max-h-[92vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 p-5 sm:p-6 border-b border-slate-200/70 dark:border-slate-700/70">
          <div className="flex items-center gap-3 min-w-0">
            <span className="h-11 w-11 rounded-2xl bg-gradient-primary text-white flex items-center justify-center shrink-0 shadow-soft">
              <Terminal className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <h3 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-slate-50 leading-tight">
                Detail Log Entry
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 leading-snug">
                Satu baris log diuraikan ke metadata + payload mentah.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup"
            className="h-9 w-9 rounded-xl flex items-center justify-center text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors duration-200 shrink-0"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-5 sm:py-6 space-y-5">
          {/* Hero badges */}
          <div className="flex flex-wrap items-center gap-2">
            {level && (
              <span
                className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide ring-1 ${levelChipClass(level)}`}
              >
                {level}
              </span>
            )}
            {action && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-primary-50 dark:bg-primary-500/15 px-3 py-1 text-sm font-semibold text-primary-700 dark:text-primary-300">
                <Tag className="h-3.5 w-3.5" />
                {action}
              </span>
            )}
            {method && (
              <span className="inline-flex items-center rounded-full border border-slate-200 dark:border-slate-700 px-2.5 py-0.5 text-xs font-mono font-semibold text-slate-600 dark:text-slate-300">
                {method}
              </span>
            )}
            {status != null && !Number.isNaN(status) && (
              <span
                className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-mono font-bold ring-1 ${statusChipClass(status)}`}
              >
                {status}
              </span>
            )}
            <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 dark:bg-slate-800 px-2.5 py-1 text-xs text-slate-600 dark:text-slate-300">
              <Clock className="h-3.5 w-3.5" />
              {formatFullTsFromNs(entry.ts)}
            </span>
          </div>

          {/* Message */}
          {message && (
            <div className="rounded-2xl border border-slate-200 dark:border-slate-700/70 bg-white/50 dark:bg-slate-900/40 p-4 sm:p-5">
              <div className="flex items-start gap-2.5 min-w-0">
                <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary-50 dark:bg-primary-500/15 text-primary-600 dark:text-primary-300">
                  <MessageSquare className="h-3.5 w-3.5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                    Message
                  </p>
                  <p className="mt-0.5 text-sm break-words text-slate-700 dark:text-slate-100">
                    {message}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Meta grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-4 rounded-2xl border border-slate-200 dark:border-slate-700/70 bg-white/50 dark:bg-slate-900/40 p-4 sm:p-5">
            <MetaItem
              icon={<Fingerprint className="h-3.5 w-3.5" />}
              label="Trace ID"
              value={traceId}
              mono
            />
            <MetaItem
              icon={<Server className="h-3.5 w-3.5" />}
              label="Source App"
              value={sourceApp}
            />
            <MetaItem
              icon={<Activity className="h-3.5 w-3.5" />}
              label="Action"
              value={action}
            />
            <MetaItem
              icon={<Hash className="h-3.5 w-3.5" />}
              label="Status"
              value={status != null && !Number.isNaN(status) ? String(status) : null}
              mono
            />
            <div className="sm:col-span-2">
              <MetaItem
                icon={<Link2 className="h-3.5 w-3.5" />}
                label="Endpoint"
                value={method && endpoint ? `${method} ${endpoint}` : endpoint}
                mono
              />
            </div>
            <MetaItem
              icon={<Mail className="h-3.5 w-3.5" />}
              label="User"
              value={userName ?? userEmail}
            />
            <MetaItem
              icon={<Network className="h-3.5 w-3.5" />}
              label="IP Address"
              value={ip}
              mono
            />
            <MetaItem
              icon={<Hash className="h-3.5 w-3.5" />}
              label="Client ID"
              value={clientId}
              mono
            />
            <MetaItem
              icon={<Globe className="h-3.5 w-3.5" />}
              label="User Agent"
              value={userAgent}
            />
          </div>

          {/* JSON sections */}
          <div className="space-y-3">
            <JsonSection
              title="Record (full)"
              icon={<Braces className="h-3.5 w-3.5" />}
              data={rec}
              defaultOpen
            />
            {requestHeader != null && (
              <JsonSection
                title="Request Header"
                icon={<ScrollText className="h-3.5 w-3.5" />}
                data={requestHeader}
              />
            )}
            {requestBody != null && (
              <JsonSection
                title="Request Body"
                icon={<ScrollText className="h-3.5 w-3.5" />}
                data={requestBody}
              />
            )}
            {responseBody != null && (
              <JsonSection
                title="Response Body"
                icon={<ScrollText className="h-3.5 w-3.5" />}
                data={responseBody}
              />
            )}
            <JsonSection
              title="Loki Labels"
              icon={<Tag className="h-3.5 w-3.5" />}
              data={entry.labels}
            />
            {entry.raw && (
              <JsonSection
                title="Raw Line"
                icon={<Terminal className="h-3.5 w-3.5" />}
                data={entry.raw}
              />
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-slate-200/70 dark:border-slate-700/70 px-5 sm:px-6 py-3 sm:py-4 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center justify-center rounded-xl bg-slate-900 dark:bg-slate-700 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 dark:hover:bg-slate-600 transition-colors"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
