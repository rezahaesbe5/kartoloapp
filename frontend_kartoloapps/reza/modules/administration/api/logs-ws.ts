// Client WebSocket utk live tail log. Sequence:
//   1. requestWsTicket → REST signed POST /logs/ws-ticket → { ticket, expires_in }
//   2. new WebSocket(`${wsBase}/api/v1/logs/ws?ticket=...`)
//   3. on "entry" frame → emit ke listener; on close/error → auto-reconnect.
//
// Browser WebSocket tidak bisa kirim header signature → ticket Redis dipakai
// sekali (GETDEL di gateway saat upgrade).

import { env } from '@/shared/config/env';
import { requestWsTicket, type FilterRow, type LogSearchItem, type SourceApp } from './logs-api';

export interface LogStreamMessage {
  type: 'open' | 'upstream_open' | 'entry' | 'hb' | 'error';
  ts?: string;
  labels?: Record<string, string>;
  record?: Record<string, unknown>;
  cursor?: string;
  message?: string;
}

export interface LogStreamHandlers {
  onEntry?: (item: LogSearchItem) => void;
  onOpen?: () => void;
  onClose?: (code: number, reason: string) => void;
  onError?: (message: string) => void;
  onStatus?: (status: LogStreamStatus) => void;
}

export type LogStreamStatus = 'idle' | 'connecting' | 'open' | 'reconnecting' | 'closed' | 'error';

export interface StartParams {
  source_app: SourceApp;
  date: string;
  filters: FilterRow[];
}

function wsBase(): string {
  // env.apiBaseUrl mis. "http://localhost:3000/api/v1" atau "/api/v1" (relative).
  let baseUrl = env.apiBaseUrl;

  // Jika relative path (mis. "/api/v1"), gunakan window.location sebagai base.
  if (baseUrl.startsWith('/')) {
    baseUrl = `${window.location.origin}${baseUrl}`;
  }

  try {
    const u = new URL(baseUrl);
    u.protocol = u.protocol === 'https:' ? 'wss:' : 'ws:';
    u.pathname = '';
    u.search = '';
    u.hash = '';
    return u.toString().replace(/\/+$/, '');
  } catch (err) {
    console.error('Failed to construct WebSocket URL from:', baseUrl, err);
    // Fallback kasar jika URL tetap tidak valid
    const wsProto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${wsProto}//${window.location.host}`;
  }
}

const BACKOFF_MS = [1000, 2000, 4000, 8000, 15000, 30000];

export class LogStreamSocket {
  private socket: WebSocket | null = null;
  private params: StartParams | null = null;
  private handlers: LogStreamHandlers = {};
  private status: LogStreamStatus = 'idle';
  private retryIdx = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private manualStop = false;

  setHandlers(h: LogStreamHandlers): void {
    this.handlers = h;
  }

  getStatus(): LogStreamStatus {
    return this.status;
  }

  async start(params: StartParams): Promise<void> {
    if (this.manualStop) return;
    this.params = params;
    this.retryIdx = 0;
    await this.connect();
  }

  stop(): void {
    this.manualStop = true;
    this.clearRetry();
    if (this.socket) {
      try {
        const s = this.socket;
        this.socket = null;
        s.close(1000, 'client_stop');
      } catch {
        // ignore
      }
    }
    this.setStatus('closed');
  }

  private clearRetry(): void {
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
  }

  private setStatus(s: LogStreamStatus): void {
    if (this.manualStop && s !== 'closed') return;
    this.status = s;
    this.handlers.onStatus?.(s);
  }

  private async connect(): Promise<void> {
    if (!this.params || this.manualStop) return;
    this.setStatus(this.retryIdx === 0 ? 'connecting' : 'reconnecting');

    let ticketResp;
    try {
      ticketResp = await requestWsTicket(this.params);
      if (this.manualStop) return;
    } catch (err) {
      if (this.manualStop) return;
      this.handlers.onError?.((err as Error).message ?? 'gagal request ticket');
      this.scheduleReconnect();
      return;
    }

    const url = `${wsBase()}/api/v1/logs/ws?ticket=${encodeURIComponent(ticketResp.ticket)}`;
    let sock: WebSocket;
    try {
      if (this.manualStop) return;
      sock = new WebSocket(url);
    } catch (err) {
      if (this.manualStop) return;
      this.handlers.onError?.((err as Error).message ?? 'gagal buka WebSocket');
      this.scheduleReconnect();
      return;
    }
    this.socket = sock;

    sock.onopen = () => {
      this.retryIdx = 0;
      this.setStatus('open');
      this.handlers.onOpen?.();
    };

    sock.onmessage = (ev) => {
      let msg: LogStreamMessage;
      try {
        msg = JSON.parse(typeof ev.data === 'string' ? ev.data : '') as LogStreamMessage;
      } catch {
        return;
      }
      if (msg.type === 'entry' && msg.ts && msg.record) {
        this.handlers.onEntry?.({
          ts: msg.ts,
          labels: msg.labels ?? {},
          record: msg.record as Record<string, unknown> & { _raw?: string },
        });
      } else if (msg.type === 'error') {
        this.handlers.onError?.(msg.message ?? 'error');
      }
      // 'open' | 'upstream_open' | 'hb' → no-op, status sudah open dr onopen.
    };

    sock.onerror = () => {
      this.handlers.onError?.('WebSocket error');
      // onclose akan dipanggil setelahnya → reconnect dilakukan di sana.
    };

    sock.onclose = (ev) => {
      this.socket = null;
      this.handlers.onClose?.(ev.code, ev.reason);
      if (!this.manualStop) {
        this.scheduleReconnect();
      } else {
        this.setStatus('closed');
      }
    };
  }

  private scheduleReconnect(): void {
    if (this.manualStop) return;
    const delay = BACKOFF_MS[Math.min(this.retryIdx, BACKOFF_MS.length - 1)];
    this.retryIdx += 1;
    this.setStatus('reconnecting');
    this.retryTimer = setTimeout(() => {
      void this.connect();
    }, delay);
  }
}
