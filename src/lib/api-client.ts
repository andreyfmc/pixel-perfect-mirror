// Cliente HTTP do front. Tenta /api/* (D1 real) e, em ambiente sem bindings
// (preview Lovable / dev local sem `wrangler dev --remote`), cai no mock.

import { mockAccounts, mockQueue, mockHistory, type Account, type QueueItem } from "./mock";
import type { AccountRow, QueueRow, HistoryRow, LoopRow, ModelRow } from "./db.server";

export type Model = ModelRow;

export type MetaApp = {
  id: string;
  name: string;
  client_id: string;
  client_id_masked: string;
  provider: "facebook" | "instagram";
  is_active: number;
  notes: string | null;
  account_count: number;
  created_at: string;
};


export type AccountStatusReport = {
  status:
    | "healthy"
    | "restricted"
    | "action_blocked"
    | "limited"
    | "token_expired"
    | "needs_reconnect";
  can_publish: boolean;
  restrictions: string[];
  suggestions: string[];
  quota: { used: number; total: number; remaining: number; duration_seconds: number } | null;
  checks: {
    media: { ok: boolean; error: string | null };
    publishing_limit: { ok: boolean; error: string | null };
  };
  health_score: number;
  token_status: "valid" | "expired";
};

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
function accountFromRow(r: AccountRow & { posts?: number }): Account {
  return {
    id: r.id,
    username: r.username,
    name: r.name,
    profile_picture: r.profile_picture ?? "",
    health_score: r.health_score,
    followers: r.followers,
    posts: typeof r.posts === "number" ? r.posts : 0,
    last_post_at: r.last_post_at ?? new Date().toISOString(),
    token_expires_at: r.token_expires_at,
    token_status: r.token_status ?? "valid",
    provider: r.provider ?? "facebook",
    model_id: r.model_id ?? null,
    meta_app_id: r.meta_app_id ?? null,
  };
}

function queueFromRow(r: QueueRow): QueueItem {
  return {
    id: r.id,
    account: r.account_id,
    caption: r.caption,
    scheduled_at: r.scheduled_at,
    media_type: r.media_type === "CAROUSEL" ? "IMAGE" : r.media_type,
    media_key: r.media_key,
    thumb: r.thumb_key ?? "",
    group_id: r.group_id,
    group_scheduled_at: r.group_scheduled_at,
    status: r.status,
    attempts: r.attempts,
    retry_count: r.retry_count ?? 0,
    last_error: r.last_error,
    variant_processed: !!r.variant_processed,
    variant_method: r.variant_method,
    variant_error: r.variant_error,
    loop_id: r.loop_id,
    cycle_number: r.cycle_number,
  };
}

export const api = {
  async listAccounts(opts?: { includeDiscarded?: boolean }): Promise<Account[]> {
    const qs = opts?.includeDiscarded ? "?include_discarded=1" : "";
    const data = await tryJson<{ accounts: AccountRow[] }>(`/api/accounts${qs}`);
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
      permalink: h.permalink ?? "",
    }));
  },

  async deleteAccount(id: string) {
    await fetch(`/api/accounts/${id}`, { method: "DELETE" });
  },

  async setAccountRole(id: string, role: "active" | "reserve" | "discarded"): Promise<void> {
    await fetch(`/api/accounts/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ role }),
    });
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

  async getAccountStatus(id: string): Promise<{
    ok: boolean;
    error?: string;
    report?: AccountStatusReport;
  } | null> {
    try {
      const res = await fetch(`/api/accounts/${id}/status`, { method: "POST" });
      return (await res.json()) as {
        ok: boolean;
        error?: string;
        report?: AccountStatusReport;
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
    group_id?: string;
    group_scheduled_at?: string;
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

  async buildVariant(queueId: string): Promise<{ ok: boolean; mediaKey?: string; error?: string }> {
    try {
      const res = await fetch("/api/variants/build", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ queue_id: queueId }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        mediaKey?: string;
        error?: string;
      };
      return { ok: !!data.ok, mediaKey: data.mediaKey, error: data.error };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  },

  // ============ loops ============
  async listLoops(): Promise<LoopRow[]> {
    const data = await tryJson<{ loops: LoopRow[] }>("/api/loops");
    return data?.loops ?? [];
  },

  async createLoop(body: {
    source_type: "snapshot" | "live_folder";
    media_type?: "REEL" | "IMAGE" | "STORY";
    folder_id?: string | null;
    folder_name?: string | null;
    video_ids?: string[];
    account_ids: string[];
    caption: string;
    gap_min: number;
    jitter_min: number;
    order_mode: "sequential" | "random";
    videos_per_cycle?: number;
    next_cycle_at: string;
  }): Promise<{ id: string } | { error: string } | null> {
    try {
      const res = await fetch("/api/loops", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      return (await res.json()) as { id: string } | { error: string };
    } catch {
      return null;
    }
  },

  async patchLoop(
    id: string,
    body: { status?: "active" | "paused" | "stopped"; cancel_pending?: boolean },
  ) {
    await fetch(`/api/loops/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  },

  async deleteLoop(id: string) {
    await fetch(`/api/loops/${id}`, { method: "DELETE" });
  },

  async deleteStoppedLoops(): Promise<number> {
    const res = await fetch("/api/loops", { method: "DELETE" });
    const data = await res.json() as { deleted: number };
    return data.deleted ?? 0;
  },

  async folderLiveCount(
    folderId: string,
  ): Promise<{ folder: { id: string; name: string } | null; count: number; error: string | null } | null> {
    try {
      const res = await fetch(`/api/drive/folder/${folderId}`);
      if (!res.ok) return null;
      return (await res.json()) as {
        folder: { id: string; name: string } | null;
        count: number;
        error: string | null;
      };
    } catch {
      return null;
    }
  },

  // ============ models ============
  async listModels(): Promise<Model[]> {
    const data = await tryJson<{ models: Model[] }>("/api/models");
    return data?.models ?? [];
  },
  async createModel(body: { name: string; color: string }): Promise<{ id: string } | null> {
    try {
      const res = await fetch("/api/models", {
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
  async patchModel(id: string, body: { name?: string; color?: string }) {
    await fetch(`/api/models/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  },
  async deleteModel(id: string) {
    await fetch(`/api/models/${id}`, { method: "DELETE" });
  },

  async setAccountModel(accountId: string, modelId: string | null) {
    await fetch(`/api/accounts/${accountId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model_id: modelId }),
    });
  },

  // ============ meta-apps ============
  async listMetaApps(): Promise<MetaApp[]> {
    const data = await tryJson<MetaApp[]>("/api/meta-apps");
    return data ?? [];
  },

  async createMetaApp(body: {
    name: string;
    client_id: string;
    client_secret: string;
    provider: "facebook" | "instagram";
    notes?: string;
  }): Promise<MetaApp> {
    const res = await fetch("/api/meta-apps", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(err.error ?? `HTTP ${res.status}`);
    }
    return (await res.json()) as MetaApp;
  },

  async updateMetaApp(
    id: string,
    body: {
      name?: string;
      client_secret?: string;
      notes?: string;
      is_active?: number;
    },
  ): Promise<MetaApp | null> {
    try {
      const res = await fetch(`/api/meta-apps/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) return null;
      return (await res.json()) as MetaApp;
    } catch {
      return null;
    }
  },

  async deleteMetaApp(
    id: string,
  ): Promise<{ ok: true } | { ok: false; error: string; account_count: number }> {
    const res = await fetch(`/api/meta-apps/${id}`, { method: "DELETE" });
    return (await res.json()) as
      | { ok: true }
      | { ok: false; error: string; account_count: number };
  },

  async redistributeApps(): Promise<{
    moved: number;
    distribution: { app_id: string; app_name: string; count: number }[];
  } | null> {
    try {
      const res = await fetch("/api/meta-apps?action=redistribute", { method: "POST" });
      if (!res.ok) return null;
      return (await res.json()) as {
        moved: number;
        distribution: { app_id: string; app_name: string; count: number }[];
      };
    } catch {
      return null;
    }
  },

  async previewRedistributeApps(): Promise<
    { app_id: string; app_name: string; current_count: number; projected_count: number }[] | null
  > {
    try {
      const res = await fetch("/api/meta-apps?action=preview-redistribute", { method: "POST" });
      if (!res.ok) return null;
      return (await res.json()) as {
        app_id: string;
        app_name: string;
        current_count: number;
        projected_count: number;
      }[];
    } catch {
      return null;
    }
  },

  async setAccountMetaApp(accountId: string, metaAppId: string) {
    await fetch(`/api/meta-apps/${metaAppId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ assign_account_id: accountId }),
    });
  },
};



