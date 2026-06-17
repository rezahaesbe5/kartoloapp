// Tampilkan session aktif & riwayat login terbaru milik user yang sedang login.
// Reuse listSessionsForUser() dari session-store; di sini cuma mapping + filter
// + tagging is_current.

import { listSessionsForUser } from '../../../src/shared/lib/session-store.js';

export interface SessionItem {
  id: string;
  ip: string | null;
  user_agent: string | null;
  created_at: string;
  last_active_at: string;
  expires_at: string;
  revoked_at: string | null;
  is_active: boolean;
  is_current: boolean;
}

export interface MySessionsResult {
  active: SessionItem[];
  history: SessionItem[];
}

export async function listMySessions(
  userId: string,
  currentSessionId: string,
): Promise<MySessionsResult> {
  const rows = await listSessionsForUser(userId, 20);
  const now = Date.now();

  const items: SessionItem[] = rows.map((r) => {
    const expiresAt = r.expiresAt.getTime();
    const isActive = r.revokedAt == null && expiresAt > now;
    return {
      id: r.id,
      ip: r.ip,
      user_agent: r.userAgent,
      created_at: r.createdAt.toISOString(),
      last_active_at: r.lastActiveAt.toISOString(),
      expires_at: r.expiresAt.toISOString(),
      revoked_at: r.revokedAt ? r.revokedAt.toISOString() : null,
      is_active: isActive,
      is_current: r.id === currentSessionId,
    };
  });

  return {
    active: items.filter((i) => i.is_active),
    history: items.filter((i) => !i.is_active).slice(0, 10),
  };
}
