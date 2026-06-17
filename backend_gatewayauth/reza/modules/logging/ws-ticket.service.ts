// Short-lived ticket service untuk handshake WebSocket.
//
// Browser WebSocket tidak bisa men-set X-Signature/X-Client-Id/Authorization
// (custom header tidak didukung di constructor `new WebSocket(...)`). Sebagai
// gantinya client memanggil REST `POST /logs/ws-ticket` (signed normal), lalu
// buka WS dgn `?ticket=<token>` di query. Gateway GETDEL ticket dari Redis,
// validate, lalu open upstream WS ke admin.
//
// Ticket TTL singkat (default 30 dtk) supaya jendela serangan kecil.

import { randomBytes } from 'node:crypto';
import { redis } from '../../../src/shared/lib/redis.js';
import { env } from '../../../src/shared/config/env.js';
import type { FilterKey, FilterOp } from './filter-types.js';

const KEY_PREFIX = 'wsticket:';

export interface WsTicketFilter {
  key: FilterKey;
  op: FilterOp;
  value: string;
  connector?: 'AND' | 'OR';
}

export interface WsTicketPayload {
  user_id: string;
  user_type: string;
  email: string;
  full_name: string;
  session_id: string;
  client_id: string | null;
  source_app: 'backend_gatewayauth' | 'backend_administration' | 'frontend_kartoloapps';
  date: string;
  filters: WsTicketFilter[];
}

export interface IssuedTicket {
  ticket: string;
  expires_in: number;
}

function genTicket(): string {
  return randomBytes(24).toString('base64url');
}

export async function issueWsTicket(payload: WsTicketPayload): Promise<IssuedTicket> {
  const ticket = genTicket();
  const ttl = env.WS_TICKET_TTL_SECONDS;
  await redis.set(KEY_PREFIX + ticket, JSON.stringify(payload), 'EX', ttl);
  return { ticket, expires_in: ttl };
}

/**
 * GETDEL atomik: ambil + hapus. Return null bila tidak ada / expired.
 */
export async function consumeWsTicket(ticket: string): Promise<WsTicketPayload | null> {
  if (!ticket || typeof ticket !== 'string') return null;
  // ioredis getdel tersedia di Redis 6.2+. Container kartolo-redis pakai redis:7-alpine.
  const raw = await redis.getdel(KEY_PREFIX + ticket);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as WsTicketPayload;
  } catch {
    return null;
  }
}
