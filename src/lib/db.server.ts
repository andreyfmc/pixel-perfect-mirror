// Helpers de acesso ao D1.
import { requireDb } from "./cf.server";

export type AccountRow = {
  id: string;
  username: string;
  name: string;
  profile_picture: string | null;
  ig_user_id: string | null;
  access_token: string | null;
  token_expires_at: string | null;
  followers: number;
  health_score: number;
  last_post_at: string | null;
  created_at: string;
  updated_at: string;
};

export type QueueRow = {
  id: string;
  account_id: string;
  caption: string;
  media_type: "REEL" | "IMAGE" | "STORY" | "CAROUSEL";
  media_key: string;
  thumb_key: string | null;
  scheduled_at: string;
  status: "scheduled" | "processing" | "published" | "failed" | "canceled";
  attempts: number;
  last_error: string | null;
  ig_container_id: string | null;
  ig_media_id: string | null;
  created_at: string;
};

export type HistoryRow = {
  id: string;
  account_id: string;
  queue_id: string | null;
  ig_media_id: string;
  caption: string | null;
  media_type: string | null;
  permalink: string | null;
  thumb_url: string | null;
  published_at: string;
  reach: number;
  likes: number;
  comments: number;
  fetched_at: string | null;
};

export const db = {
  // ============ accounts ============
  async listAccounts(): Promise<AccountRow[]> {
    const { results } = await requireDb()
      .prepare("SELECT * FROM accounts ORDER BY created_at DESC")
      .all<AccountRow>();
    return results ?? [];
  },
  async getAccount(id: string): Promise<AccountRow | null> {
    return (
      (await requireDb()
        .prepare("SELECT * FROM accounts WHERE id = ?")
        .bind(id)
        .first<AccountRow>()) ?? null
    );
  },
  async createAccount(
    a: Pick<AccountRow, "id" | "username" | "name"> & Partial<AccountRow>,
  ) {
    await requireDb()
      .prepare(
        `INSERT INTO accounts (id, username, name, profile_picture, ig_user_id, access_token, token_expires_at, followers, health_score)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        a.id,
        a.username,
        a.name,
        a.profile_picture ?? null,
        a.ig_user_id ?? null,
        a.access_token ?? null,
        a.token_expires_at ?? null,
        a.followers ?? 0,
        a.health_score ?? 100,
      )
      .run();
  },
  async deleteAccount(id: string) {
    await requireDb().prepare("DELETE FROM accounts WHERE id = ?").bind(id).run();
  },

  // ============ queue ============
  async listQueue(): Promise<QueueRow[]> {
    const { results } = await requireDb()
      .prepare("SELECT * FROM queue ORDER BY scheduled_at ASC")
      .all<QueueRow>();
    return results ?? [];
  },
  async dueQueueItems(nowIso: string): Promise<QueueRow[]> {
    const { results } = await requireDb()
      .prepare(
        `SELECT * FROM queue WHERE status = 'scheduled' AND scheduled_at <= ? ORDER BY scheduled_at ASC LIMIT 10`,
      )
      .bind(nowIso)
      .all<QueueRow>();
    return results ?? [];
  },
  async enqueue(q: Omit<QueueRow, "status" | "attempts" | "last_error" | "ig_container_id" | "ig_media_id" | "created_at">) {
    await requireDb()
      .prepare(
        `INSERT INTO queue (id, account_id, caption, media_type, media_key, thumb_key, scheduled_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(q.id, q.account_id, q.caption, q.media_type, q.media_key, q.thumb_key ?? null, q.scheduled_at)
      .run();
  },
  async setQueueStatus(id: string, status: QueueRow["status"], extra?: { last_error?: string; ig_container_id?: string; ig_media_id?: string }) {
    await requireDb()
      .prepare(
        `UPDATE queue SET status = ?, attempts = attempts + 1,
           last_error = COALESCE(?, last_error),
           ig_container_id = COALESCE(?, ig_container_id),
           ig_media_id = COALESCE(?, ig_media_id)
         WHERE id = ?`,
      )
      .bind(status, extra?.last_error ?? null, extra?.ig_container_id ?? null, extra?.ig_media_id ?? null, id)
      .run();
  },
  async manualSetQueueStatus(id: string, status: QueueRow["status"]) {
    await requireDb()
      .prepare(`UPDATE queue SET status = ? WHERE id = ?`)
      .bind(status, id)
      .run();
  },
  async deleteQueue(id: string) {
    await requireDb().prepare("DELETE FROM queue WHERE id = ?").bind(id).run();
  },
  async clearQueueByStatuses(statuses: QueueRow["status"][]): Promise<number> {
    if (!statuses.length) return 0;
    const placeholders = statuses.map(() => "?").join(",");
    const result = await requireDb()
      .prepare(`DELETE FROM queue WHERE status IN (${placeholders})`)
      .bind(...statuses)
      .run();
    return (result.meta as { changes?: number } | undefined)?.changes ?? 0;
  },


  // ============ history ============
  async listHistory(): Promise<HistoryRow[]> {
    const { results } = await requireDb()
      .prepare("SELECT * FROM history ORDER BY published_at DESC LIMIT 200")
      .all<HistoryRow>();
    return results ?? [];
  },
  async recordPublication(h: Omit<HistoryRow, "fetched_at" | "reach" | "likes" | "comments"> & Partial<HistoryRow>) {
    await requireDb()
      .prepare(
        `INSERT INTO history (id, account_id, queue_id, ig_media_id, caption, media_type, permalink, thumb_url, published_at, reach, likes, comments)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        h.id,
        h.account_id,
        h.queue_id ?? null,
        h.ig_media_id,
        h.caption ?? null,
        h.media_type ?? null,
        h.permalink ?? null,
        h.thumb_url ?? null,
        h.published_at,
        h.reach ?? 0,
        h.likes ?? 0,
        h.comments ?? 0,
      )
      .run();
  },
};
