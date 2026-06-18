import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  AlertCircle,
  Calendar,
  ChevronDown,
  Database,
  FileText,
  Filter as FilterIcon,
  Loader2,
  Pause,
  Play,
  Plus,
  Search,
  Server,
  Terminal,
  X,
} from 'lucide-react';
import {
  closeAllLogAccess,
  FILTER_KEYS,
  FILTER_KEY_LABEL,
  FILTER_OPS,
  FILTER_OP_LABEL,
  getLogSources,
  LEVEL_VALUES,
  openLogAccess,
  searchLogs,
  SOURCE_APP_LABEL,
  type FilterConnector,
  type FilterKey,
  type FilterOp,
  type FilterRow,
  type LogSearchItem,
  type SourceApp,
} from '../api/logs-api';
import { LogStreamSocket, type LogStreamStatus } from '../api/logs-ws';
import { LogEntryDetailModal } from './LogEntryDetailModal';

interface LogAccessModalProps {
  open: boolean;
  onClose: () => void;
}

function todayIso(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatHmsFromNs(ns: string): string {
  try {
    const ms = Number(BigInt(ns) / 1_000_000n);
    const d = new Date(ms);
    return (
      d.toLocaleTimeString('id-ID', { hour12: false }) +
      '.' +
      String(d.getMilliseconds()).padStart(3, '0')
    );
  } catch {
    return ns;
  }
}

function levelColor(record: Record<string, unknown>): string {
  const lvl = String((record.level as string) ?? '').toLowerCase();
  if (lvl === 'error') return 'text-red-500 dark:text-red-400';
  if (lvl === 'warn') return 'text-amber-500 dark:text-amber-400';
  return 'text-emerald-500 dark:text-emerald-400';
}

function levelChipClass(record: Record<string, unknown>): string {
  const lvl = String((record.level as string) ?? '').toLowerCase();
  if (lvl === 'error')
    return 'bg-red-50 text-red-700 ring-red-200/70 dark:bg-red-500/15 dark:text-red-300 dark:ring-red-500/30';
  if (lvl === 'warn')
    return 'bg-amber-50 text-amber-700 ring-amber-200/70 dark:bg-amber-500/15 dark:text-amber-300 dark:ring-amber-500/30';
  return 'bg-emerald-50 text-emerald-700 ring-emerald-200/70 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-500/30';
}

function shortLine(record: Record<string, unknown> & { _raw?: string }): string {
  if (record._raw) return record._raw;
  const method = record.method as string | undefined;
  const ep = (record.endpoint as string | undefined) ?? (record.url as string | undefined);
  const action = record.action as string | undefined;
  const msg = record.message as string | undefined;
  const status = record.status as number | undefined;
  const parts: string[] = [];
  if (method) parts.push(method);
  if (action) parts.push(action);
  if (ep) parts.push(ep);
  if (status != null) parts.push(`→ ${status}`);
  if (msg) parts.push(msg);
  return parts.join(' · ') || JSON.stringify(record);
}

interface AccessedKey {
  source_app: SourceApp;
  date: string;
}

const VALUELESS_OPS: ReadonlySet<FilterOp> = new Set(['is_empty', 'is_not_empty']);
const DEFAULT_FILTER: FilterRow = { key: 'raw', op: 'contains', value: '' };

// Sanitasi filter sebelum kirim ke backend: buang row dengan value kosong
// untuk operator yang butuh value, supaya request body bersih & filter benar2
// merepresentasikan kondisi yang user tampak di UI.
function activeFilters(rows: FilterRow[]): FilterRow[] {
  return rows.filter((r) => {
    if (VALUELESS_OPS.has(r.op)) return true;
    return (r.value ?? '').trim().length > 0;
  });
}

function statusLabel(s: LogStreamStatus): string {
  switch (s) {
    case 'connecting':
      return 'Menghubungkan...';
    case 'open':
      return 'Streaming';
    case 'reconnecting':
      return 'Reconnecting...';
    case 'error':
      return 'Error';
    case 'closed':
      return 'Berhenti';
    default:
      return 'Idle';
  }
}

function statusColor(s: LogStreamStatus): string {
  if (s === 'open') return 'bg-emerald-500';
  if (s === 'connecting' || s === 'reconnecting') return 'bg-amber-500';
  if (s === 'error') return 'bg-red-500';
  return 'bg-slate-400';
}

export function LogAccessModal({ open, onClose }: LogAccessModalProps) {
  // ---- Form state --------------------------------------------------------
  const [sourceApp, setSourceApp] = useState<SourceApp>('backend_gatewayauth');
  const [date, setDate] = useState<string>(todayIso());
  const [filters, setFilters] = useState<FilterRow[]>([{ ...DEFAULT_FILTER }]);
  const [streaming, setStreaming] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const [accessed, setAccessed] = useState<AccessedKey | null>(null);
  const [recentItems, setRecentItems] = useState<LogSearchItem[]>([]);
  const [openErr, setOpenErr] = useState<string | null>(null);
  const [streamStatus, setStreamStatus] = useState<LogStreamStatus>('idle');
  const [streamError, setStreamError] = useState<string | null>(null);
  const [selectedEntry, setSelectedEntry] = useState<LogSearchItem | null>(null);

  const listRef = useRef<HTMLDivElement | null>(null);
  const socketRef = useRef<LogStreamSocket | null>(null);
  const accessedRef = useRef<AccessedKey | null>(null);
  useEffect(() => {
    accessedRef.current = accessed;
  }, [accessed]);

  // ---- Filter helpers ----------------------------------------------------
  const updateFilter = useCallback((idx: number, patch: Partial<FilterRow>) => {
    setFilters((prev) =>
      prev.map((r, i) => {
        if (i !== idx) return r;
        const next = { ...r, ...patch } as FilterRow;
        // Saat user pindah ke key "level": value enum (info/warn/error/...)
        // jadi operator yang masuk akal hanya equality. Auto-set op ke "="
        // dan reset value kalau tidak ada di enum.
        if (patch.key && patch.key === 'level') {
          next.op = '=';
          if (!(LEVEL_VALUES as readonly string[]).includes(next.value)) {
            next.value = '';
          }
        }
        if (VALUELESS_OPS.has(next.op)) next.value = '';
        return next;
      }),
    );
  }, []);
  const addFilter = useCallback(() => {
    setFilters((prev) => [...prev, { ...DEFAULT_FILTER, connector: 'AND' }]);
  }, []);
  const removeFilter = useCallback((idx: number) => {
    setFilters((prev) => {
      if (prev.length <= 1) return [{ ...DEFAULT_FILTER }];
      const next = prev.filter((_, i) => i !== idx);
      // Baris pertama tidak menampilkan connector — clean up agar tidak misleading.
      if (next.length > 0 && next[0]) {
        next[0] = { ...next[0], connector: undefined };
      }
      return next;
    });
  }, []);

  // ---- Load sources & dates ---------------------------------------------
  const sourcesQuery = useQuery({
    queryKey: ['logs.sources'],
    queryFn: getLogSources,
    enabled: open,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    const src = sourcesQuery.data?.sources.find((s) => s.source_app === sourceApp);
    if (src && src.dates.length > 0 && !src.dates.includes(date)) {
      const first = src.dates[0];
      if (first) setDate(first);
    }
  }, [sourceApp, sourcesQuery.data, date]);

  // ---- Open / Close akses -----------------------------------------------
  const openMutation = useMutation({
    mutationFn: (k: AccessedKey) => openLogAccess(k.source_app, k.date),
  });

  const stopStreamInternal = useCallback(() => {
    const s = socketRef.current;
    if (s) {
      s.stop();
      socketRef.current = null;
    }
    setStreaming(false);
    setStreamStatus('idle');
  }, []);

  // Hard-close: stop stream + await unlink supaya logloki/ pasti bersih
  // sebelum modal benar2 ditutup. Dipanggil dari tombol Tutup / backdrop /
  // Esc / X. Fallback fire-and-forget di useEffect cleanup tetap ada untuk
  // kasus unmount paksa (mis. user refresh halaman).
  // Saat modal ditutup atau user ganti akses, kita wipe SEMUA file di
  // logloki/ — bukan hanya file aktif. Ini menghindari kebocoran file kalau
  // user sempat membuka beberapa source/date selama satu sesi modal.
  const handleClose = useCallback(async () => {
    stopStreamInternal();
    try {
      await closeAllLogAccess();
    } catch {
      // network gagal pun, lifecycle cleanup akan retry sekali lagi.
    }
    accessedRef.current = null;
    setAccessed(null);
    setRecentItems([]);
    onClose();
  }, [onClose, stopStreamInternal]);

  async function handleSubmitAccess(e: React.FormEvent) {
    e.preventDefault();
    setOpenErr(null);
    if (accessed && (accessed.source_app !== sourceApp || accessed.date !== date)) {
      stopStreamInternal();
      // Wipe semua file lama supaya logloki/ konsisten dgn yang sedang
      // ditampilkan. Aman karena akses berikutnya akan create-link ulang.
      try {
        await closeAllLogAccess();
      } catch {
        // ignore close error
      }
      setAccessed(null);
      setRecentItems([]);
    }
    try {
      const k = { source_app: sourceApp, date };
      await openMutation.mutateAsync(k);
      setAccessed(k);
      setRecentItems([]);
    } catch (err) {
      const msg = (err as Error).message || 'Gagal mengakses log';
      setOpenErr(msg);
    }
  }

  // ---- Search (manual) --------------------------------------------------
  // Filter dikirim setelah disanitasi via activeFilters() supaya backend hanya
  // menerima row yang complete; mencegah "filter terlihat ada tapi tidak
  // di-apply" akibat value kosong di operator value-required.
  const searchMutation = useMutation({
    mutationFn: () =>
      searchLogs({
        source_app: sourceApp,
        date,
        filters: activeFilters(filters),
        limit: 500,
      }),
  });

  async function handleSearch() {
    if (!accessed) return;
    try {
      const r = await searchMutation.mutateAsync();
      const asc = [...r.items].sort((a, b) => (BigInt(a.ts) > BigInt(b.ts) ? 1 : -1));
      setRecentItems(asc);
    } catch {
      // mutation captures error
    }
  }

  // ---- Live stream via WebSocket ----------------------------------------
  useEffect(() => {
    if (!streaming || !accessed) {
      stopStreamInternal();
      return;
    }
    // Stop existing & start new (filter berubah → koneksi baru).
    const old = socketRef.current;
    if (old) old.stop();
    const sock = new LogStreamSocket();
    socketRef.current = sock;
    setStreamError(null);

    sock.setHandlers({
      onStatus: (s) => {
        setStreamStatus(s);
      },
      onError: (msg) => {
        setStreamError(msg);
      },
      onEntry: (item) => {
        setRecentItems((prev) => {
          const merged = [...prev, item];
          return merged.length > 1000 ? merged.slice(-1000) : merged;
        });
      },
    });

    const runStart = async () => {
      try {
        await sock.start({ source_app: sourceApp, date, filters: activeFilters(filters) });
      } catch (err) {
        // error sudah ditangani di dalam sock via handler
      }
    };
    void runStart();

    return () => {
      sock.stop();
      if (socketRef.current === sock) {
        socketRef.current = null;
      }
    };
    // sengaja: filters mengubah array → reconnect dgn filter baru.
  }, [streaming, accessed, sourceApp, date, filters]); // stopStreamInternal dihapus dari deps karena sudah ada di dalam cleanup

  // ---- Auto-scroll ------------------------------------------------------
  useEffect(() => {
    if (!autoScroll || !listRef.current) return;
    listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [recentItems, autoScroll]);

  // ---- Lifecycle modal --------------------------------------------------
  useEffect(() => {
    if (!open) return;
    // Reset state form & viewer ke kondisi clean tiap kali modal dibuka,
    // supaya filter, viewer, dan stream tidak nyangkut dari sesi sebelumnya.
    setFilters([{ ...DEFAULT_FILTER }]);
    setRecentItems([]);
    setOpenErr(null);
    setStreamError(null);
    setSelectedEntry(null);
    setSourceApp('backend_gatewayauth');
    setDate(todayIso());

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') void handleClose();
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, handleClose]);

  // Saat modal ditutup via prop (open=false): stop WS + wipe semua link.
  // handleClose biasanya sudah men-wipe; ini fallback bila parent menutup
  // modal tanpa lewat handleClose (mis. open dipaksa false dari atas).
  useEffect(() => {
    if (open) return;
    stopStreamInternal();
    if (accessedRef.current) {
      closeAllLogAccess().catch(() => undefined);
      accessedRef.current = null;
      setAccessed(null);
      setRecentItems([]);
    }
  }, [open, stopStreamInternal]);

  useEffect(() => {
    return () => {
      const s = socketRef.current;
      if (s) s.stop();
      if (accessedRef.current) {
        closeAllLogAccess().catch(() => undefined);
      }
    };
  }, []);

  const availableDates = useMemo(
    () => sourcesQuery.data?.sources.find((s) => s.source_app === sourceApp)?.dates ?? [],
    [sourcesQuery.data, sourceApp],
  );

  if (!open) return null;

  return createPortal(
    <>
    <div
      className="fixed inset-0 z-[100] flex items-stretch sm:items-center justify-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Akses Log File"
    >
      <div
        className="absolute inset-0 bg-slate-900/55 dark:bg-slate-950/75 backdrop-blur-sm animate-fade-in"
        onClick={() => void handleClose()}
      />

      <div className="relative w-full sm:max-w-6xl glass-card sm:rounded-3xl animate-fade-in-up max-h-screen sm:max-h-[94vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 p-5 sm:p-6 border-b border-slate-200/70 dark:border-slate-700/70">
          <div className="flex items-center gap-3 min-w-0">
            <span className="h-11 w-11 rounded-2xl bg-gradient-primary text-white flex items-center justify-center shrink-0 shadow-soft">
              <Terminal className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <h3 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-slate-50 leading-tight">
                Akses Log File
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 leading-snug">
                Aktifkan file log, susun filter mirip Navicat, lalu live tail via WebSocket.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void handleClose()}
            aria-label="Tutup"
            className="h-9 w-9 rounded-xl flex items-center justify-center text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors duration-200 shrink-0"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-5 sm:py-6 space-y-5">
          {/* Form: source + date + submit */}
          <form
            onSubmit={handleSubmitAccess}
            className="rounded-2xl border border-slate-200 dark:border-slate-700/70 bg-white/50 dark:bg-slate-900/40 p-4 sm:p-5"
            aria-label="Form akses log"
          >
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="sm:col-span-1">
                <label
                  htmlFor="log-source"
                  className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5 inline-block"
                >
                  Source App
                </label>
                <div className="relative">
                  <Server className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <select
                    id="log-source"
                    value={sourceApp}
                    onChange={(e) => setSourceApp(e.target.value as SourceApp)}
                    className="field field-with-icon !py-2.5 text-sm appearance-none pr-9 cursor-pointer"
                  >
                    {(Object.keys(SOURCE_APP_LABEL) as SourceApp[]).map((s) => (
                      <option key={s} value={s}>
                        {SOURCE_APP_LABEL[s]}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                </div>
              </div>

              <div className="sm:col-span-1">
                <label
                  htmlFor="log-date"
                  className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5 inline-block"
                >
                  Tanggal Log
                </label>
                <div className="relative">
                  <Calendar className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    id="log-date"
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="field field-with-icon !py-2.5 text-sm pr-3 [color-scheme:light] dark:[color-scheme:dark]"
                  />
                </div>
                {availableDates.length > 0 && !availableDates.includes(date) && (
                  <p className="mt-1.5 text-[11px] text-amber-600 dark:text-amber-400 flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" />
                    Tanggal ini tidak terdaftar untuk source ini.
                  </p>
                )}
              </div>

              <div className="sm:col-span-1 flex sm:items-end">
                <button
                  type="submit"
                  disabled={openMutation.isPending}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-primary text-white font-semibold px-4 py-2.5 text-sm shadow-soft transition-all duration-200 hover:shadow-[0_8px_28px_-6px_rgba(34,197,94,0.45)] hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0"
                >
                  {openMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Database className="h-4 w-4" />
                  )}
                  {accessed ? 'Ganti Akses' : 'Akses & Tampilkan'}
                </button>
              </div>
            </div>

            {openErr && (
              <p className="mt-3 inline-flex items-center gap-1.5 text-xs text-red-600 dark:text-red-400">
                <AlertCircle className="h-3.5 w-3.5" />
                {openErr}
              </p>
            )}
            {accessed && !openErr && (
              <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
                Aktif:{' '}
                <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                  {SOURCE_APP_LABEL[accessed.source_app]}
                </span>{' '}
                · <span className="font-mono">{accessed.date}</span>
              </p>
            )}
          </form>

          {/* Filter (Navicat-like) + viewer */}
          {accessed && (
            <div className="rounded-2xl border border-slate-200 dark:border-slate-700/70 bg-white/40 dark:bg-slate-900/40 overflow-hidden">
              {/* Filter rows — Navicat-like dengan connector AND/OR.
                  Saat Live Stream aktif, semua input filter di-lock: stream
                  harus di-stop dahulu agar tidak silent-reconnect setiap user
                  mengetik. */}
              <div className="border-b border-slate-200 dark:border-slate-700/70 px-3 py-3 sm:px-4 sm:py-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    <FilterIcon className="h-3.5 w-3.5" />
                    Filter
                    <span className="ml-1 normal-case font-normal tracking-normal text-slate-400 dark:text-slate-500">
                      {streaming
                        ? '(terkunci — stop stream untuk edit)'
                        : `(${filters.length} kondisi · klik AND/OR untuk toggle)`}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={addFilter}
                    disabled={streaming}
                    title={streaming ? 'Stop Live Stream dulu untuk edit filter' : undefined}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-slate-300 dark:border-slate-600 px-2.5 py-1 text-[11px] font-semibold text-slate-600 dark:text-slate-300 hover:border-primary-400 hover:text-primary-600 dark:hover:text-primary-400 hover:bg-primary-50/50 dark:hover:bg-primary-500/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Plus className="h-3.5 w-3.5" /> Tambah
                  </button>
                </div>

                <div
                  className={`space-y-1.5${streaming ? ' opacity-60 pointer-events-none select-none' : ''}`}
                  aria-disabled={streaming}
                >
                  {filters.map((row, idx) => {
                    const noValue = VALUELESS_OPS.has(row.op);
                    const isLevel = row.key === 'level';
                    const isMethod = row.key === 'method';
                    const isSource = row.key === 'source_app';
                    const connector: FilterConnector = row.connector ?? 'AND';
                    return (
                      <div
                        key={idx}
                        className="flex flex-wrap items-stretch gap-1.5 sm:gap-2 rounded-xl bg-white/70 dark:bg-slate-900/50 ring-1 ring-slate-200/70 dark:ring-slate-700/70 p-1.5 sm:p-2"
                      >
                        {/* Connector — single chip toggle: AND ⇄ OR. Default AND.
                            Width fixed supaya layout tidak shift saat toggle. */}
                        <div className="flex items-center w-12 sm:w-14 shrink-0 justify-center">
                          {idx === 0 ? (
                            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 select-none">
                              Where
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() =>
                                updateFilter(idx, {
                                  connector: connector === 'AND' ? 'OR' : 'AND',
                                })
                              }
                              disabled={streaming}
                              aria-label={`Toggle connector (sekarang ${connector}, klik untuk ganti)`}
                              title={`Klik untuk ganti ke ${connector === 'AND' ? 'OR' : 'AND'}`}
                              className={`w-full h-7 inline-flex items-center justify-center rounded-md text-[10px] font-bold tracking-wider shadow-sm ring-1 transition-all duration-200 active:scale-95 disabled:cursor-not-allowed ${
                                connector === 'AND'
                                  ? 'bg-primary-600 text-white ring-primary-700/40 hover:bg-primary-500'
                                  : 'bg-amber-500 text-white ring-amber-600/40 hover:bg-amber-400'
                              }`}
                            >
                              {connector}
                            </button>
                          )}
                        </div>

                        {/* Key */}
                        <div className="relative flex-1 min-w-[110px] sm:flex-none sm:w-32">
                          <select
                            value={row.key}
                            onChange={(e) => updateFilter(idx, { key: e.target.value as FilterKey })}
                            disabled={streaming}
                            className="w-full appearance-none rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 pl-2.5 pr-7 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 transition-colors focus:outline-none focus:ring-2 focus:ring-primary-400 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                            aria-label="Filter key"
                          >
                            {FILTER_KEYS.map((k) => (
                              <option key={k} value={k}>
                                {FILTER_KEY_LABEL[k]}
                              </option>
                            ))}
                          </select>
                          <ChevronDown className="pointer-events-none absolute right-1.5 top-1/2 h-3 w-3 -translate-y-1/2 text-slate-400" />
                        </div>

                        {/* Operator — utk key=level dibatasi ke = / != karena
                            value-nya enum tertutup, operator string-search tidak
                            relevan. */}
                        <div className="relative flex-1 min-w-[120px] sm:flex-none sm:w-36">
                          <select
                            value={row.op}
                            onChange={(e) => updateFilter(idx, { op: e.target.value as FilterOp })}
                            className="w-full appearance-none rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 pl-2.5 pr-7 py-1.5 text-xs text-slate-700 dark:text-slate-200 transition-colors focus:outline-none focus:ring-2 focus:ring-primary-400 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                            aria-label="Filter operator"
                            disabled={streaming}
                          >
                            {(isLevel ? (['=', '!='] as FilterOp[]) : FILTER_OPS).map((op) => (
                              <option key={op} value={op}>
                                {FILTER_OP_LABEL[op]}
                              </option>
                            ))}
                          </select>
                          <ChevronDown className="pointer-events-none absolute right-1.5 top-1/2 h-3 w-3 -translate-y-1/2 text-slate-400" />
                        </div>

                        {/* Value — enum dropdown utk key tertentu, else text input */}
                        {noValue ? (
                          <div className="flex-1 min-w-[160px] flex items-center px-2.5 py-1.5 text-xs italic text-slate-400 dark:text-slate-500 rounded-md bg-slate-50 dark:bg-slate-800/50 ring-1 ring-slate-200/60 dark:ring-slate-700/60 select-none">
                            (tanpa value)
                          </div>
                        ) : isLevel ? (
                          <div className="relative flex-1 min-w-[140px]">
                            <select
                              value={row.value}
                              onChange={(e) => updateFilter(idx, { value: e.target.value })}
                              disabled={streaming}
                              className="w-full appearance-none rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 pl-2.5 pr-7 py-1.5 text-xs text-slate-700 dark:text-slate-200 transition-colors focus:outline-none focus:ring-2 focus:ring-primary-400 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                              aria-label="Filter value"
                            >
                              <option value="">— pilih level —</option>
                              {LEVEL_VALUES.map((lv) => (
                                <option key={lv} value={lv}>
                                  {lv}
                                </option>
                              ))}
                            </select>
                            <ChevronDown className="pointer-events-none absolute right-1.5 top-1/2 h-3 w-3 -translate-y-1/2 text-slate-400" />
                          </div>
                        ) : isMethod ? (
                          <div className="relative flex-1 min-w-[140px]">
                            <select
                              value={row.value}
                              onChange={(e) => updateFilter(idx, { value: e.target.value })}
                              disabled={streaming}
                              className="w-full appearance-none rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 pl-2.5 pr-7 py-1.5 text-xs text-slate-700 dark:text-slate-200 transition-colors focus:outline-none focus:ring-2 focus:ring-primary-400 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                              aria-label="Filter value"
                            >
                              <option value="">— pilih method —</option>
                              {['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'].map((m) => (
                                <option key={m} value={m}>
                                  {m}
                                </option>
                              ))}
                            </select>
                            <ChevronDown className="pointer-events-none absolute right-1.5 top-1/2 h-3 w-3 -translate-y-1/2 text-slate-400" />
                          </div>
                        ) : isSource ? (
                          <div className="relative flex-1 min-w-[200px]">
                            <select
                              value={row.value}
                              onChange={(e) => updateFilter(idx, { value: e.target.value })}
                              disabled={streaming}
                              className="w-full appearance-none rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 pl-2.5 pr-7 py-1.5 text-xs text-slate-700 dark:text-slate-200 transition-colors focus:outline-none focus:ring-2 focus:ring-primary-400 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                              aria-label="Filter value"
                            >
                              <option value="">— pilih source —</option>
                              {(Object.keys(SOURCE_APP_LABEL) as SourceApp[]).map((s) => (
                                <option key={s} value={s}>
                                  {SOURCE_APP_LABEL[s]}
                                </option>
                              ))}
                            </select>
                            <ChevronDown className="pointer-events-none absolute right-1.5 top-1/2 h-3 w-3 -translate-y-1/2 text-slate-400" />
                          </div>
                        ) : (
                          <input
                            type="text"
                            value={row.value}
                            onChange={(e) => updateFilter(idx, { value: e.target.value })}
                            placeholder="value..."
                            disabled={streaming}
                            className="field !py-1.5 !px-2.5 text-xs flex-1 min-w-[140px] disabled:opacity-60 disabled:cursor-not-allowed"
                            aria-label="Filter value"
                          />
                        )}

                        {/* Remove */}
                        <button
                          type="button"
                          onClick={() => removeFilter(idx)}
                          disabled={streaming}
                          className="h-7 w-7 shrink-0 rounded-md flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors disabled:cursor-not-allowed disabled:hover:text-slate-400 disabled:hover:bg-transparent"
                          aria-label="Hapus filter"
                          title="Hapus baris filter"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    );
                  })}
                </div>

                {/* Action bar — Stream & Cari saling eksklusif:
                    - Saat Live Stream aktif: Cari di-disable (mode realtime,
                      hasil masuk via WS, tidak boleh terjadi query manual lagi).
                    - Saat Cari sedang berjalan: Live Stream di-disable supaya
                      tidak tabrakan dgn hasil yang baru saja dimuat.
                */}
                <div className="flex items-center justify-end gap-2 pt-1 flex-wrap">
                  <label className="inline-flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300 select-none cursor-pointer mr-auto">
                    <input
                      type="checkbox"
                      checked={autoScroll}
                      onChange={(e) => setAutoScroll(e.target.checked)}
                      className="h-3.5 w-3.5 rounded border-slate-300 dark:border-slate-600 text-primary-600 focus:ring-primary-400"
                    />
                    Auto-scroll
                  </label>
                  <button
                    type="button"
                    onClick={handleSearch}
                    disabled={searchMutation.isPending || streaming}
                    title={streaming ? 'Stop Live Stream dulu untuk pakai Cari' : undefined}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {searchMutation.isPending ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Search className="h-3.5 w-3.5" />
                    )}
                    Cari
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setStreaming((v) => {
                        const next = !v;
                        // Start stream → reset viewer supaya tampilan murni
                        // hasil realtime, tidak campur hasil search sebelumnya.
                        if (next) setRecentItems([]);
                        return next;
                      });
                    }}
                    aria-pressed={streaming}
                    disabled={searchMutation.isPending}
                    title={
                      searchMutation.isPending
                        ? 'Tunggu Cari selesai dulu untuk start Live Stream'
                        : undefined
                    }
                    className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                      streaming
                        ? 'bg-emerald-600 text-white shadow-soft'
                        : 'border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800'
                    }`}
                  >
                    {streaming ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                    {streaming ? 'Stop Stream' : 'Live Stream'}
                  </button>
                </div>
              </div>

              {/* Lines viewport */}
              <div
                ref={listRef}
                className="bg-slate-950 text-slate-200 font-mono text-[11px] sm:text-xs leading-relaxed h-[50vh] sm:h-[55vh] overflow-y-auto"
                aria-live={streaming ? 'polite' : 'off'}
              >
                {recentItems.length === 0 ? (
                  <div className="flex h-full items-center justify-center text-slate-500">
                    <div className="text-center px-6">
                      <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p className="text-sm">
                        Belum ada log dimuat. Klik <span className="font-semibold">Cari</span> atau aktifkan{' '}
                        <span className="font-semibold">Live Stream</span>.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="divide-y divide-slate-800/60">
                    {recentItems.map((it, idx) => {
                      const rec = it.record;
                      const lvl = String((rec.level as string) ?? '');
                      const traceFull =
                        (rec.trace_id as string | undefined) ??
                        (it.labels?.trace_id as string | undefined) ??
                        '';
                      const traceShort = traceFull
                        ? traceFull.length > 10
                          ? traceFull.slice(-8)
                          : traceFull
                        : '';
                      return (
                        <button
                          key={`${it.ts}-${idx}`}
                          type="button"
                          onClick={() => setSelectedEntry(it)}
                          className="group flex w-full flex-wrap items-start gap-x-2 gap-y-0.5 px-3 py-1.5 text-left hover:bg-slate-900/60 focus:bg-slate-900/70 focus:outline-none transition-colors cursor-pointer"
                          aria-label="Buka detail log entry"
                          title="Klik untuk lihat detail"
                        >
                          <span className="shrink-0 text-slate-500 tabular-nums">
                            {formatHmsFromNs(it.ts)}
                          </span>
                          {lvl && (
                            <span
                              className={`shrink-0 inline-flex items-center rounded px-1.5 text-[10px] font-bold uppercase ring-1 ${levelChipClass(rec)}`}
                            >
                              {lvl}
                            </span>
                          )}
                          {traceShort && (
                            <span
                              className="shrink-0 inline-flex items-center gap-1 rounded px-1.5 text-[10px] font-mono font-semibold text-slate-300 bg-slate-800/80 ring-1 ring-slate-700/70 group-hover:text-primary-200 group-hover:ring-primary-500/40"
                              title={traceFull}
                            >
                              <span className="text-slate-500">#</span>
                              {traceShort}
                            </span>
                          )}
                          <span
                            className={`min-w-0 flex-1 break-words ${levelColor(rec)} group-hover:underline decoration-dotted underline-offset-4`}
                          >
                            {shortLine(rec)}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Footer status bar */}
              <div className="flex items-center justify-between gap-2 px-3 sm:px-4 py-2 border-t border-slate-200 dark:border-slate-700/70 text-[11px] text-slate-500 dark:text-slate-400">
                <span className="inline-flex items-center gap-2">
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${statusColor(streamStatus)} ${streamStatus === 'open' ? 'animate-pulse' : ''}`}
                  />
                  <span className="font-semibold">{statusLabel(streamStatus)}</span>
                  {streamError && (
                    <span className="text-red-500 dark:text-red-400 inline-flex items-center gap-1">
                      <AlertCircle className="h-3 w-3" /> {streamError}
                    </span>
                  )}
                  {searchMutation.isPending && (
                    <span className="inline-flex items-center gap-1">
                      <Loader2 className="h-3 w-3 animate-spin" /> memuat...
                    </span>
                  )}
                </span>
                <span>{recentItems.length} baris</span>
              </div>
            </div>
          )}

          {sourcesQuery.isLoading && (
            <p className="text-center text-xs text-slate-500 dark:text-slate-400 inline-flex items-center justify-center gap-1.5">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Memuat daftar source...
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-slate-200/70 dark:border-slate-700/70 px-5 sm:px-6 py-3 sm:py-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => void handleClose()}
            className="inline-flex items-center justify-center rounded-xl border border-slate-200 dark:border-slate-700 px-4 py-2 text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
    <LogEntryDetailModal
      open={!!selectedEntry}
      onClose={() => setSelectedEntry(null)}
      entry={selectedEntry}
    />
    </>,
    document.body,
  );
}
