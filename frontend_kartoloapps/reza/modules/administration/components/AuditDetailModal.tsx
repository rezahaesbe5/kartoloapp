import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import {
  AlertCircle,
  Check,
  ChevronDown,
  Clock,
  Copy,
  Fingerprint,
  Globe,
  Link2,
  Loader2,
  Mail,
  MessageSquare,
  Network,
  ScrollText,
  Server,
  ShieldCheck,
  Tag,
  User as UserIcon,
  X,
} from 'lucide-react';
import { getAuditLogDetail, type AuditLogDetail } from '../api/audit-api';

interface AuditDetailModalProps {
  open: boolean;
  onClose: () => void;
  auditId: string | null;
}

function formatTimestamp(iso: string): string {
  try {
    return new Date(iso).toLocaleString('id-ID', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return iso;
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

/** Badge status berdasarkan prefix message: berhasil/gagal/error. */
function MessageBadge({ value }: { value: string }) {
  const sep = value.indexOf(':');
  const label = sep >= 0 ? value.slice(0, sep).trim().toLowerCase() : '';
  const known = label === 'berhasil' || label === 'gagal' || label === 'error';
  if (!known) return null;
  const cls =
    label === 'berhasil'
      ? 'bg-emerald-50 text-emerald-700 ring-emerald-200/70 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-500/30'
      : label === 'gagal'
        ? 'bg-amber-50 text-amber-700 ring-amber-200/70 dark:bg-amber-500/15 dark:text-amber-300 dark:ring-amber-500/30'
        : 'bg-red-50 text-red-700 ring-red-200/70 dark:bg-red-500/15 dark:text-red-300 dark:ring-red-500/30';
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide ring-1 ${cls}`}
    >
      {label}
    </span>
  );
}

/** Baris metadata kecil: ikon + label + value. */
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

/** Section collapsible berisi pretty JSON + tombol copy. */
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

export function AuditDetailModal({ open, onClose, auditId }: AuditDetailModalProps) {
  // Esc untuk close + lock body scroll selama modal terbuka.
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

  const query = useQuery({
    queryKey: ['admin.audit.detail', auditId],
    queryFn: () => getAuditLogDetail(auditId as string),
    enabled: open && !!auditId,
    staleTime: 60_000,
  });

  if (!open) return null;

  const detail: AuditLogDetail | undefined = query.data;
  const userData = (detail?.user_data ?? null) as Record<string, unknown> | null;
  const userEmail = typeof userData?.email === 'string' ? (userData.email as string) : null;
  const userName = typeof userData?.full_name === 'string' ? (userData.full_name as string) : null;

  // Portal ke document.body supaya modal lepas dari stacking context parent
  // (mis. AppHeader backdrop-blur, ProductShell transform) — z-index dijamin top.
  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Detail Audit Log"
    >
      <div
        className="absolute inset-0 bg-slate-900/50 dark:bg-slate-950/70 backdrop-blur-sm animate-fade-in"
        onClick={onClose}
      />

      <div className="relative w-full sm:max-w-3xl lg:max-w-4xl glass-card rounded-t-3xl sm:rounded-3xl animate-fade-in-up max-h-[92vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 p-5 sm:p-6 border-b border-slate-200/70 dark:border-slate-700/70">
          <div className="flex items-center gap-3 min-w-0">
            <span className="h-11 w-11 rounded-2xl bg-gradient-primary text-white flex items-center justify-center shrink-0 shadow-soft">
              <ScrollText className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <h3 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-slate-50 leading-tight">
                Detail Audit Log
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 leading-snug">
                Jejak lengkap satu entri aktivitas sensitif.
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
        <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-5 sm:py-6">
          {query.isLoading && (
            <div className="flex items-center justify-center gap-2 py-16 text-slate-500 dark:text-slate-400">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span className="text-sm">Memuat detail audit log...</span>
            </div>
          )}

          {!query.isLoading && query.isError && (
            <div className="flex items-center justify-center gap-2 py-16 text-red-600 dark:text-red-400">
              <AlertCircle className="h-5 w-5" />
              <span className="text-sm">Gagal memuat detail audit log.</span>
            </div>
          )}

          {detail && (
            <div className="space-y-5">
              {/* Hero: action + method + timestamp + message status badge */}
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-primary-50 dark:bg-primary-500/15 px-3 py-1 text-sm font-semibold text-primary-700 dark:text-primary-300">
                  <Tag className="h-3.5 w-3.5" />
                  {detail.action}
                </span>
                {detail.method && (
                  <span className="inline-flex items-center rounded-full border border-slate-200 dark:border-slate-700 px-2.5 py-0.5 text-xs font-mono font-semibold text-slate-600 dark:text-slate-300">
                    {detail.method}
                  </span>
                )}
                {detail.message && <MessageBadge value={detail.message} />}
                <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 dark:bg-slate-800 px-2.5 py-1 text-xs text-slate-600 dark:text-slate-300">
                  <Clock className="h-3.5 w-3.5" />
                  {formatTimestamp(detail.created_at)}
                </span>
              </div>

              {/* Grid metadata */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-4 rounded-2xl border border-slate-200 dark:border-slate-700/70 bg-white/50 dark:bg-slate-900/40 p-4 sm:p-5">
                <MetaItem
                  icon={<Fingerprint className="h-3.5 w-3.5" />}
                  label="Trace ID"
                  value={detail.trace_id}
                  mono
                />
                <MetaItem
                  icon={<Server className="h-3.5 w-3.5" />}
                  label="Source App"
                  value={detail.source_app}
                />
                <MetaItem
                  icon={<UserIcon className="h-3.5 w-3.5" />}
                  label="User"
                  value={userName ?? detail.user_id}
                />
                <MetaItem
                  icon={<Mail className="h-3.5 w-3.5" />}
                  label="Email"
                  value={userEmail}
                />
                <MetaItem
                  icon={<ShieldCheck className="h-3.5 w-3.5" />}
                  label="Client ID"
                  value={detail.client_id}
                  mono
                />
                <MetaItem
                  icon={<Network className="h-3.5 w-3.5" />}
                  label="IP Address"
                  value={detail.ip}
                  mono
                />
                <div className="sm:col-span-2">
                  <MetaItem
                    icon={<Link2 className="h-3.5 w-3.5" />}
                    label="Endpoint"
                    value={detail.endpoint}
                    mono
                  />
                </div>
                <div className="sm:col-span-2">
                  <MetaItem
                    icon={<MessageSquare className="h-3.5 w-3.5" />}
                    label="Message"
                    value={detail.message}
                  />
                </div>
                <div className="sm:col-span-2">
                  <MetaItem
                    icon={<Globe className="h-3.5 w-3.5" />}
                    label="User Agent"
                    value={detail.user_agent}
                  />
                </div>
              </div>

              {/* JSON sections */}
              <div className="space-y-3">
                <JsonSection
                  title="Request Header"
                  icon={<ScrollText className="h-3.5 w-3.5" />}
                  data={detail.request_header}
                />
                <JsonSection
                  title="Request Body"
                  icon={<ScrollText className="h-3.5 w-3.5" />}
                  data={detail.request_body}
                  defaultOpen
                />
                <JsonSection
                  title="Response Body"
                  icon={<ScrollText className="h-3.5 w-3.5" />}
                  data={detail.response_body}
                  defaultOpen
                />
                <JsonSection
                  title="User Data"
                  icon={<UserIcon className="h-3.5 w-3.5" />}
                  data={detail.user_data}
                />
              </div>
            </div>
          )}
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
