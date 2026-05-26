// Helpers de acesso ao D1.
import { requireDb } from "./cf.server";

// Auto-migração: garante que colunas adicionadas após o deploy inicial
// existam no banco do usuário (D1 não roda migrations automaticamente).
let ensureSchemaPromise: Promise<void> | undefined;
function normalizeUsername(value?: string | null): string {
  return (value ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

async function ensureSchema(): Promise<void> {
  if (ensureSchemaPromise) return ensureSchemaPromise;
  ensureSchemaPromise = (async () => {
    const db = requireDb();
    try {
      const { results } = await db
        .prepare("PRAGMA table_info(accounts)")
        .all<{ name: string }>();
      const cols = new Set((results ?? []).map((r) => r.name));
      if (!cols.has("token_status")) {
        await db
          .prepare(
            "ALTER TABLE accounts ADD COLUMN token_status TEXT NOT NULL DEFAULT 'valid'",
          )
          .run();
        await db
          .prepare(
            `UPDATE accounts SET token_status = CASE
               WHEN access_token IS NULL THEN 'expired'
               WHEN token_expires_at IS NOT NULL AND datetime(token_expires_at) <= datetime('now') THEN 'expired'
               ELSE 'valid' END`,
          )
          .run();
      }
      if (!cols.has("provider")) {
        // Tokens de Página do Facebook começam com "EAA"; tokens longos do
        // Instagram Login direto começam com "IGAA". Usa esse heurístico para
        // backfill — novas contas gravam o provider explícito.
        await db
          .prepare(
            "ALTER TABLE accounts ADD COLUMN provider TEXT NOT NULL DEFAULT 'facebook'",
          )
          .run();
        await db
          .prepare(
            `UPDATE accounts SET provider = CASE
               WHEN access_token LIKE 'IGAA%' THEN 'instagram'
               ELSE 'facebook' END`,
          )
          .run();
      }
      const { results: queueResults } = await db
        .prepare("PRAGMA table_info(queue)")
        .all<{ name: string }>();
      const queueCols = new Set((queueResults ?? []).map((r) => r.name));
      if (!queueCols.has("group_id")) {
        await db.prepare("ALTER TABLE queue ADD COLUMN group_id TEXT").run();
      }
      if (!queueCols.has("group_scheduled_at")) {
        await db.prepare("ALTER TABLE queue ADD COLUMN group_scheduled_at TEXT").run();
      }
    } catch (err) {
      // Não bloqueia o app se o PRAGMA falhar — reseta a promise para tentar de novo
      // na próxima request.
      ensureSchemaPromise = undefined;
      console.warn("[db] ensureSchema falhou:", err);
    }
  })();
  return ensureSchemaPromise;
}


export type AccountRow = {
  id: string;
  username: string;
  name: string;
  profile_picture: string | null;
  ig_user_id: string | null;
  access_token: string | null;
  token_expires_at: string | null;
  token_status: "valid" | "expired";
  provider: "facebook" | "instagram";
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
  group_id: string | null;
  group_scheduled_at: string | null;
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

const rawDb = {
  // ============ accounts ============
  async listAccounts(): Promise<AccountRow[]> {
    const { results } = await requireDb()
      .prepare("SELECT * FROM accounts ORDER BY created_at DESC")
      .all<AccountRow>();
    const accounts = results ?? [];
    const repairable = accounts.filter((account) => !account.ig_user_id || !account.access_token);
    if (repairable.length) {
      await Promise.all(repairable.map((account) => rawDb.resolveAccountForPublishing(account.id)));
      const repaired = await requireDb()
        .prepare("SELECT * FROM accounts ORDER BY created_at DESC")
        .all<AccountRow>();
      return repaired.results ?? accounts;
    }
    return accounts;
  },
  async getAccount(id: string): Promise<AccountRow | null> {
    return (
      (await requireDb()
        .prepare("SELECT * FROM accounts WHERE id = ?")
        .bind(id)
        .first<AccountRow>()) ?? null
    );
  },
  async createAccount(a: Pick<AccountRow, "id" | "username" | "name"> & Partial<AccountRow>) {
    const provider = a.provider ?? "facebook";
    const normalizedUsername = normalizeUsername(a.username);
    const { results: existingAccounts } = await requireDb()
      .prepare("SELECT * FROM accounts ORDER BY updated_at DESC, created_at DESC")
      .all<AccountRow>();
    const normalizedMatch = (existingAccounts ?? []).find((existing) => {
      if (a.ig_user_id && existing.ig_user_id === a.ig_user_id) return true;
      return normalizedUsername.length > 0 && normalizeUsername(existing.username) === normalizedUsername;
    });
    // Atualiza qualquer registro já conhecido pelo username OU pelo ig_user_id.
    // Isso mantém itens antigos da fila apontando para uma linha com token novo.
    const updated = await requireDb()
      .prepare(
        `UPDATE accounts
         SET username = ?,
             name = ?,
             profile_picture = COALESCE(?, profile_picture),
             ig_user_id = COALESCE(?, ig_user_id),
             access_token = COALESCE(?, access_token),
             token_expires_at = COALESCE(?, token_expires_at),
             token_status = 'valid',
             provider = ?,
             followers = ?,
             health_score = ?,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ? OR username = ? OR (? IS NOT NULL AND ig_user_id = ?)`,
      )
      .bind(
        a.username,
        a.name,
        a.profile_picture ?? null,
        a.ig_user_id ?? null,
        a.access_token ?? null,
        a.token_expires_at ?? null,
        provider,
        a.followers ?? 0,
        a.health_score ?? 100,
        normalizedMatch?.id ?? "",
        a.username,
        a.ig_user_id ?? null,
        a.ig_user_id ?? null,
      )
      .run();
    if (((updated.meta as { changes?: number } | undefined)?.changes ?? 0) > 0) {
      await rawDb.resetCredentialFailedQueue(a.username);
      return;
    }

    await requireDb()
      .prepare(
        `INSERT INTO accounts (id, username, name, profile_picture, ig_user_id, access_token, token_expires_at, token_status, provider, followers, health_score)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'valid', ?, ?, ?)
         ON CONFLICT(username) DO UPDATE SET
           name = excluded.name,
           profile_picture = COALESCE(excluded.profile_picture, accounts.profile_picture),
           ig_user_id = COALESCE(excluded.ig_user_id, accounts.ig_user_id),
           access_token = COALESCE(excluded.access_token, accounts.access_token),
           token_expires_at = COALESCE(excluded.token_expires_at, accounts.token_expires_at),
           token_status = 'valid',
           provider = excluded.provider,
           followers = excluded.followers,
           updated_at = CURRENT_TIMESTAMP`,
      )
      .bind(
        a.id,
        a.username,
        a.name,
        a.profile_picture ?? null,
        a.ig_user_id ?? null,
        a.access_token ?? null,
        a.token_expires_at ?? null,
        provider,
        a.followers ?? 0,
        a.health_score ?? 100,
      )
      .run();
    await rawDb.resetCredentialFailedQueue(a.username);
  },
  async resetCredentialFailedQueue(username: string) {
    await requireDb()
      .prepare(
        `UPDATE queue
         SET status = 'scheduled', last_error = NULL, ig_container_id = NULL, ig_media_id = NULL
         WHERE status = 'failed'
           AND last_error LIKE '%error_subcode":33%'
           AND account_id IN (SELECT id FROM accounts WHERE username = ?)`,
      )
      .bind(username)
      .run();
  },
  async updateAccountCredentials(
    id: string,
    input: {
      ig_user_id?: string | null;
      access_token?: string | null;
      token_expires_at?: string | null;
      token_status?: AccountRow["token_status"] | null;
      profile_picture?: string | null;
      followers?: number | null;
      health_score?: number | null;
      provider?: AccountRow["provider"] | null;
    },
  ) {
    await requireDb()
      .prepare(
        `UPDATE accounts
         SET ig_user_id = COALESCE(?, ig_user_id),
             access_token = COALESCE(?, access_token),
             token_expires_at = COALESCE(?, token_expires_at),
             token_status = COALESCE(?, token_status),
             profile_picture = COALESCE(?, profile_picture),
             followers = COALESCE(?, followers),
             health_score = COALESCE(?, health_score),
              provider = COALESCE(?, provider),
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
      )
      .bind(
        input.ig_user_id ?? null,
        input.access_token ?? null,
        input.token_expires_at ?? null,
        input.token_status ?? null,
        input.profile_picture ?? null,
        input.followers ?? null,
        input.health_score ?? null,
        input.provider ?? null,
        id,
      )
      .run();
  },
  async resolveAccountForPublishing(id: string): Promise<AccountRow | null> {
    const account = await rawDb.getAccount(id);
    if (!account) return null;

    // SEMPRE procura o "irmão" mais recente com credenciais válidas (mesmo username
    // ou mesmo ig_user_id). Isso resolve o caso em que uma linha antiga ficou com
    // (ig_user_id, access_token) que não batem entre si — ex.: tentativa anterior
    // via Instagram OAuth seguida de reconexão via Facebook OAuth criando outra
    // linha. Sem isso, a fila continua usando credenciais quebradas porque a
    // linha antiga "parece" completa.
    const { results } = await requireDb()
      .prepare("SELECT * FROM accounts ORDER BY updated_at DESC, created_at DESC")
      .all<AccountRow>();
    const normalized = normalizeUsername(account.username);
    const currentUpdated = Date.parse(account.updated_at ?? account.created_at ?? "") || 0;
    const sibling = (results ?? []).find((candidate) => {
      if (
        candidate.id === account.id ||
        !candidate.ig_user_id ||
        !candidate.access_token ||
        candidate.token_status === "expired"
      ) {
        return false;
      }
      const candidateUpdated = Date.parse(candidate.updated_at ?? candidate.created_at ?? "") || 0;
      // Se a conta atual já tem credenciais válidas, só substitui por uma mais nova.
      const accountLooksOk =
        !!account.ig_user_id && !!account.access_token && account.token_status !== "expired";
      if (accountLooksOk && candidateUpdated <= currentUpdated) return false;
      if (account.ig_user_id && candidate.ig_user_id === account.ig_user_id) return true;
      return normalized.length > 0 && normalizeUsername(candidate.username) === normalized;
    });

    if (!sibling) {
      // Sem irmão: devolve o que tem. Se está incompleto, o scheduler vai
      // reportar erro claro de reconexão.
      return account;
    }

    await rawDb.updateAccountCredentials(account.id, {
      ig_user_id: sibling.ig_user_id,
      access_token: sibling.access_token,
      token_expires_at: sibling.token_expires_at,
      token_status: "valid",
      profile_picture: sibling.profile_picture,
      followers: sibling.followers,
      health_score: Math.max(account.health_score, sibling.health_score, 90),
      provider: sibling.provider,
    });
    return {
      ...account,
      ig_user_id: sibling.ig_user_id,
      access_token: sibling.access_token,
      token_expires_at: sibling.token_expires_at,
      token_status: "valid",
      profile_picture: sibling.profile_picture ?? account.profile_picture,
      followers: sibling.followers,
      health_score: Math.max(account.health_score, sibling.health_score, 90),
      provider: sibling.provider,
    };
  },

  /**
   * Marca a linha como "precisa reconectar" e tenta recuperar credenciais de um
   * irmão mais novo. Chamado pelo scheduler quando o Graph devolve subcode 33
   * (credenciais incompatíveis) — significa que a linha está corrompida e
   * precisa ser refeita a partir de uma reconexão mais recente.
   */
  async healMismatchedCredentials(id: string): Promise<AccountRow | null> {
    const account = await rawDb.getAccount(id);
    if (!account) return null;
    const { results } = await requireDb()
      .prepare("SELECT * FROM accounts WHERE id != ? ORDER BY updated_at DESC, created_at DESC")
      .bind(id)
      .all<AccountRow>();
    const normalized = normalizeUsername(account.username);
    const sibling = (results ?? []).find((candidate) => {
      if (!candidate.ig_user_id || !candidate.access_token || candidate.token_status === "expired") {
        return false;
      }
      // ig_user_id pode estar errado na linha atual, então só casamos por username.
      return normalized.length > 0 && normalizeUsername(candidate.username) === normalized;
    });
    if (!sibling) return null;
    await rawDb.updateAccountCredentials(account.id, {
      ig_user_id: sibling.ig_user_id,
      access_token: sibling.access_token,
      token_expires_at: sibling.token_expires_at,
      token_status: "valid",
      provider: sibling.provider,
      profile_picture: sibling.profile_picture,
      followers: sibling.followers,
      health_score: Math.max(account.health_score, sibling.health_score, 90),
    });
    return {
      ...account,
      ig_user_id: sibling.ig_user_id,
      access_token: sibling.access_token,
      token_expires_at: sibling.token_expires_at,
      token_status: "valid",
      provider: sibling.provider,
      profile_picture: sibling.profile_picture ?? account.profile_picture,
      followers: sibling.followers,
    };
  },
  async markAccountNeedsReconnect(id: string) {
    await requireDb()
      .prepare(
        `UPDATE accounts
         SET token_status = 'expired',
             health_score = 0,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
      )
      .bind(id)
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
        `SELECT * FROM queue
         WHERE (status = 'scheduled' AND scheduled_at <= ?)
            OR (status = 'processing' AND ig_container_id IS NOT NULL
                AND created_at <= datetime(?, '-60 seconds'))
         ORDER BY scheduled_at ASC
         LIMIT 10`,
      )
      .bind(nowIso, nowIso)
      .all<QueueRow>();
    return results ?? [];
  },

  async enqueue(
    q: Omit<
      QueueRow,
      | "status"
      | "attempts"
      | "last_error"
      | "ig_container_id"
      | "ig_media_id"
      | "created_at"
      | "group_id"
      | "group_scheduled_at"
    > &
      Partial<Pick<QueueRow, "group_id" | "group_scheduled_at">>,
  ) {
    await requireDb()
      .prepare(
        `INSERT INTO queue (id, account_id, caption, media_type, media_key, thumb_key, scheduled_at, group_id, group_scheduled_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        q.id,
        q.account_id,
        q.caption,
        q.media_type,
        q.media_key,
        q.thumb_key ?? null,
        q.scheduled_at,
        q.group_id ?? null,
        q.group_scheduled_at ?? null,
      )
      .run();
  },
  async setQueueStatus(
    id: string,
    status: QueueRow["status"],
    extra?: { last_error?: string; ig_container_id?: string; ig_media_id?: string },
  ) {
    const incrementAttempts = status === "failed" || status === "canceled";
    await requireDb()
      .prepare(
        `UPDATE queue SET status = ?,
           attempts = CASE WHEN ? THEN attempts + 1 ELSE attempts END,
           last_error = COALESCE(?, last_error),
           ig_container_id = COALESCE(?, ig_container_id),
           ig_media_id = COALESCE(?, ig_media_id)
         WHERE id = ?`,
      )
      .bind(
        status,
        incrementAttempts ? 1 : 0,
        extra?.last_error ?? null,
        extra?.ig_container_id ?? null,
        extra?.ig_media_id ?? null,
        id,
      )
      .run();
  },
  async markQueueProcessing(id: string, igContainerId: string) {
    await requireDb()
      .prepare(
        `UPDATE queue
         SET status = 'processing', last_error = NULL, ig_container_id = ?
         WHERE id = ?`,
      )
      .bind(igContainerId, id)
      .run();
  },
  async clearQueueContainer(id: string) {
    await requireDb()
      .prepare(
        `UPDATE queue
         SET ig_container_id = NULL, ig_media_id = NULL, last_error = NULL
         WHERE id = ?`,
      )
      .bind(id)
      .run();
  },
  async updateLastPostAt(id: string, isoDate: string) {
    await requireDb()
      .prepare(
        `UPDATE accounts SET last_post_at = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      )
      .bind(isoDate, id)
      .run();
  },

  async manualSetQueueStatus(id: string, status: QueueRow["status"]) {
    await requireDb().prepare(`UPDATE queue SET status = ? WHERE id = ?`).bind(status, id).run();
  },
  async manualUpdateQueue(
    id: string,
    input: {
      status: QueueRow["status"];
      scheduled_at?: string;
      reset_container?: boolean;
      last_error?: string;
    },
  ) {
    await requireDb()
      .prepare(
        `UPDATE queue
         SET status = ?,
             scheduled_at = COALESCE(?, scheduled_at),
             last_error = ?,
             ig_container_id = CASE WHEN ? THEN NULL ELSE ig_container_id END,
             ig_media_id = CASE WHEN ? THEN NULL ELSE ig_media_id END
         WHERE id = ?`,
      )
      .bind(
        input.status,
        input.scheduled_at ?? null,
        input.last_error ?? null,
        input.reset_container ? 1 : 0,
        input.reset_container ? 1 : 0,
        id,
      )
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
  async recordPublication(
    h: Omit<HistoryRow, "fetched_at" | "reach" | "likes" | "comments"> & Partial<HistoryRow>,
  ) {
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

// Proxy que garante a auto-migração antes de cada chamada de método.
type DbApi = typeof rawDb;
export const db: DbApi = new Proxy(rawDb, {
  get(target, prop: string | symbol) {
    const value = (target as Record<string | symbol, unknown>)[prop];
    if (typeof value !== "function") return value;
    return async (...args: unknown[]) => {
      await ensureSchema();
      return (value as (...a: unknown[]) => unknown).apply(target, args);
    };
  },
}) as DbApi;
