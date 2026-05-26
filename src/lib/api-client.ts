// Cliente HTTP do front. Tenta /api/* (D1 real) e, em ambiente sem bindings
// (preview Lovable / dev local sem `wrangler dev --remote`), cai no mock.

import { mockAccounts, mockQueue, mockHistory, type Account, type QueueItem } from "./mock";
import type { AccountRow, QueueRow, HistoryRow } from "./db.server";

async function tryJson<T>(path: string, init?: RequestInit): Promise<T | null> {
  try {
    const res = await fetch(path, init);
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

// ---- Adapters: linhas do D1 → tipos de UI ----
function accountFromRow(r: AccountRow): Account {
  return {
    id: r.id,
    username: r.username,
    name: r.name,
    profile_picture: r.profile_picture ?? "",
    health_score: r.health_score,
    followers: r.followers,
    last_post_at: r.last_post_at ?? new Date().toISOString(),
    token_expires_at: r.token_expires_at ?? new Date().toISOString(),
    token_status: r.token_status ?? "valid",
  };
}

function queueFromRow(r: QueueRow): QueueItem {
  return {
    id: r.id,
    account: r.account_id,
    caption: r.caption,
    scheduled_at: r.scheduled_at,
    media_type: r.media_type === "CAROUSEL" ? "IMAGE" : r.media_type,
    thumb: r.thumb_key ?? "",
    status: r.status,
    attempts: r.attempts,
    last_error: r.last_error,
  };
}

export const api = {
  async listAccounts(): Promise<Account[]> {
    const data = await tryJson<{ accounts: AccountRow[] }>("/api/accounts");
    return data?.accounts?.map(accountFromRow) ?? mockAccounts;
  },

  async listQueue(): Promise<QueueItem[]> {
    const data = await tryJson<{ queue: QueueRow[] }>("/api/queue");
    return data?.queue?.map(queueFromRow) ?? mockQueue;
  },

  async listHistory() {
    const data = await tryJson<{ history: HistoryRow[] }>("/api/history");
    if (!data?.history) return mockHistory;
    return data.history.map((h) => ({
      id: h.id,
      account: h.account_id,
      caption: h.caption ?? "",
      published_at: h.published_at,
      reach: h.reach,
      likes: h.likes,
      comments: h.comments,
      thumb: h.thumb_url ?? "",
    }));
  },

  async deleteAccount(id: string) {
    await fetch(`/api/accounts/${id}`, { method: "DELETE" });
  },

  async validateAccount(id: string): Promise<{
    ok: boolean;
    error?: unknown;
    scope?: string;
    needs_reconnect?: boolean;
    me?: { id?: string; name?: string };
    ig?: { id?: string; username?: string; name?: string };
    suggestions?: Array<{ page: string; ig_id?: string; ig_username?: string }>;
  } | null> {
    try {
      const res = await fetch(`/api/accounts/${id}/validate`, { method: "POST" });
      return (await res.json()) as {
        ok: boolean;
        error?: unknown;
        scope?: string;
        needs_reconnect?: boolean;
        me?: { id?: string; name?: string };
        ig?: { id?: string; username?: string; name?: string };
        suggestions?: Array<{ page: string; ig_id?: string; ig_username?: string }>;
      };
    } catch {
      return null;
    }
  },

  async deleteQueue(id: string) {
    await fetch(`/api/queue/${id}`, { method: "DELETE" });
  },

  async updateQueueStatus(
    id: string,
    status: QueueItem["status"],
    options?: { scheduled_at?: string; reset_container?: boolean; last_error?: string },
  ) {
    await fetch(`/api/queue/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status, ...options }),
    });
  },

  async clearQueue(statuses: QueueItem["status"][]) {
    await fetch(`/api/queue/clear`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ statuses }),
    });
  },

  async runScheduler(): Promise<{
    processed: number;
    errors: number;
    error?: string;
    stack?: string;
  }> {
    const res = await fetch(`/api/cron/tick`, { method: "POST" });
    const text = await res.text();
    let parsed: { processed?: number; errors?: number; error?: string; stack?: string } = {};
    try {
      parsed = text ? JSON.parse(text) : {};
    } catch {
      parsed = { error: text || `HTTP ${res.status}` };
    }
    if (!res.ok) {
      throw new Error(parsed.error || `Scheduler falhou (HTTP ${res.status})`);
    }
    return {
      processed: parsed.processed ?? 0,
      errors: parsed.errors ?? 0,
      error: parsed.error,
      stack: parsed.stack,
    };
  },

  async enqueue(body: {
    account_id: string;
    caption: string;
    media_type: "REEL" | "IMAGE" | "STORY" | "CAROUSEL";
    media_key: string;
    thumb_key?: string;
    scheduled_at: string;
  }): Promise<{ id: string } | null> {
    try {
      const res = await fetch("/api/queue", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) return null;
      return (await res.json()) as { id: string };
    } catch {
      return null;
    }
  },

  async uploadMedia(file: File): Promise<{ key: string; url: string } | null> {
    try {
      const res = await fetch("/api/media/upload", {
        method: "POST",
        headers: {
          "content-type": file.type || "application/octet-stream",
          "x-filename": file.name,
        },
        body: await file.arrayBuffer(),
      });
      if (!res.ok) return null;
      const { key } = (await res.json()) as { key: string };
      return { key, url: `https://pub-5fcd7291327547a084c1e911d5141d6f.r2.dev/${key}` };
    } catch {
      return null;
    }
  },
};
