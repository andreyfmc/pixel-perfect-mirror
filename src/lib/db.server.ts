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
      if (!cols.has("model_id")) {
        await db.prepare("ALTER TABLE accounts ADD COLUMN model_id TEXT").run();
      }
      // models — agrupamento de contas por "modelo" (ex: Valentina)
      await db
        .prepare(
          `CREATE TABLE IF NOT EXISTS models (
             id TEXT PRIMARY KEY,
             name TEXT NOT NULL,
             color TEXT NOT NULL DEFAULT '#6366f1',
             created_at TEXT NOT NULL DEFAULT (datetime('now'))
           )`,
        )
        .run();
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
      if (!queueCols.has("retry_count")) {
        await db.prepare("ALTER TABLE queue ADD COLUMN retry_count INTEGER NOT NULL DEFAULT 0").run();
      }
      if (!queueCols.has("variant_processed")) {
        await db
          .prepare("ALTER TABLE queue ADD COLUMN variant_processed INTEGER NOT NULL DEFAULT 0")
          .run();
      }
      if (!queueCols.has("variant_method")) {
        await db.prepare("ALTER TABLE queue ADD COLUMN variant_method TEXT").run();
      }
      if (!queueCols.has("variant_error")) {
        await db.prepare("ALTER TABLE queue ADD COLUMN variant_error TEXT").run();
      }
      if (!queueCols.has("original_media_key")) {
        await db.prepare("ALTER TABLE queue ADD COLUMN original_media_key TEXT").run();
      }
      if (!queueCols.has("loop_id")) {
        await db.prepare("ALTER TABLE queue ADD COLUMN loop_id TEXT").run();
      }
      if (!queueCols.has("cycle_number")) {
        await db.prepare("ALTER TABLE queue ADD COLUMN cycle_number INTEGER").run();
      }
      // loops — agendamentos recorrentes
      await db
        .prepare(
          `CREATE TABLE IF NOT EXISTS loops (
             id TEXT PRIMARY KEY,
             source_type TEXT NOT NULL CHECK (source_type IN ('snapshot','live_folder')),
             media_type TEXT NOT NULL DEFAULT 'REEL' CHECK (media_type IN ('REEL','IMAGE','STORY')),
             folder_id TEXT,
             folder_name TEXT,
             video_ids_json TEXT,
             account_ids_json TEXT NOT NULL,
             caption TEXT NOT NULL DEFAULT '',
             gap_min INTEGER NOT NULL DEFAULT 60,
             jitter_min INTEGER NOT NULL DEFAULT 20,
             order_mode TEXT NOT NULL DEFAULT 'random' CHECK (order_mode IN ('sequential','random')),
             status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','stopped')),
             cycle_number INTEGER NOT NULL DEFAULT 0,
             next_cycle_at TEXT NOT NULL,
             last_error TEXT,
             created_at TEXT NOT NULL DEFAULT (datetime('now')),
             updated_at TEXT NOT NULL DEFAULT (datetime('now'))
           )`,
        )
        .run();
      // Garante media_type em tabelas loops criadas antes desta migração.
      const { results: loopCols } = await db
        .prepare("PRAGMA table_info(loops)")
        .all<{ name: string }>();
      const loopColsSet = new Set((loopCols ?? []).map((r) => r.name));
      if (!loopColsSet.has("media_type")) {
        await db
          .prepare("ALTER TABLE loops ADD COLUMN media_type TEXT NOT NULL DEFAULT 'REEL'")
          .run();
      }
      await db
        .prepare("CREATE INDEX IF NOT EXISTS idx_loops_active ON loops(status, next_cycle_at)")
        .run();
      // oauth_states — links únicos de conexão (Instagram OAuth Tester).
      await db
        .prepare(
          `CREATE TABLE IF NOT EXISTS oauth_states (
             state TEXT PRIMARY KEY,
             status TEXT NOT NULL DEFAULT 'pending'
               CHECK (status IN ('pending','consumed','expired')),
             redirect_uri TEXT NOT NULL,
             created_at TEXT NOT NULL DEFAULT (datetime('now')),
             expires_at TEXT NOT NULL,
             consumed_at TEXT
           )`,
        )
        .run();
      // history.plays — total de reproduções (Reels) com fallback para reach.
      const { results: historyResults } = await db
        .prepare("PRAGMA table_info(history)")
        .all<{ name: string }>();
      const historyCols = new Set((historyResults ?? []).map((r) => r.name));
      if (!historyCols.has("plays")) {
        await db.prepare("ALTER TABLE history ADD COLUMN plays INTEGER DEFAULT 0").run();
        await db
          .prepare("UPDATE history SET plays = reach WHERE (plays IS NULL OR plays = 0) AND reach > 0")
          .run();
      }
      // history_snapshots — snapshots diários por reel.
      await db
        .prepare(
          `CREATE TABLE IF NOT EXISTS history_snapshots (
             id TEXT PRIMARY KEY,
             account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
             ig_media_id TEXT NOT NULL,
             snapshot_date TEXT NOT NULL,
             plays INTEGER DEFAULT 0,
             reach INTEGER DEFAULT 0,
             likes INTEGER DEFAULT 0,
             comments INTEGER DEFAULT 0,
             created_at TEXT NOT NULL DEFAULT (datetime('now')),
             UNIQUE(ig_media_id, snapshot_date)
           )`,
        )
        .run();
      await db
        .prepare(
          "CREATE INDEX IF NOT EXISTS idx_snapshots_account_date ON history_snapshots(account_id, snapshot_date DESC)",
        )
        .run();
      await db
        .prepare(
          "CREATE INDEX IF NOT EXISTS idx_snapshots_media ON history_snapshots(ig_media_id, snapshot_date DESC)",
        )
        .run();
      // followers_snapshots — snapshot diário de seguidores por conta.
      await db
        .prepare(
          `CREATE TABLE IF NOT EXISTS followers_snapshots (
             id TEXT PRIMARY KEY,
             account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
             snapshot_date TEXT NOT NULL,
             followers INTEGER NOT NULL,
             created_at TEXT NOT NULL DEFAULT (datetime('now')),
             UNIQUE(account_id, snapshot_date)
           )`,
        )
        .run();
      await db
        .prepare(
          "CREATE INDEX IF NOT EXISTS idx_followers_snap_account_date ON followers_snapshots(account_id, snapshot_date DESC)",
        )
        .run();
    } catch (err) {
      // Não bloqueia o app se o PRAGMA falhar — reseta a promise para tentar de novo
      // na próxima request.
      ensureSchemaPromise = undefined;
      console.warn("[db] ensureSchema falhou:", err);
    }
  })();
  return ensureSchemaPromise;
}

async function recordFollowersSnapshot(accountId: string, followers: number) {
  try {
    const today = new Date().toISOString().slice(0, 10);
    await requireDb()
      .prepare(
        `INSERT INTO followers_snapshots (id, account_id, snapshot_date, followers)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(account_id, snapshot_date) DO UPDATE SET followers = excluded.followers`,
      )
      .bind(`${accountId}:${today}`, accountId, today, followers)
      .run();
  } catch (err) {
    console.warn("[db] recordFollowersSnapshot falhou:", err);
  }
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
  model_id: string | null;
};

export type ModelRow = {
  id: string;
  name: string;
  color: string;
  created_at: string;
};

export type LoopRow = {
  id: string;
  source_type: "snapshot" | "live_folder";
  media_type: "REEL" | "IMAGE" | "STORY";
  folder_id: string | null;
  folder_name: string | null;
  video_ids_json: string | null;
  account_ids_json: string;
  caption: string;
  gap_min: number;
  jitter_min: number;
  order_mode: "sequential" | "random";
  status: "active" | "paused" | "stopped";
  cycle_number: number;
  next_cycle_at: string;
  last_error: string | null;
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
  retry_count: number;
  last_error: string | null;
  ig_container_id: string | null;
  ig_media_id: string | null;
  variant_processed: number;
  variant_method: string | null;
  variant_error: string | null;
  original_media_key: string | null;
  loop_id: string | null;
  cycle_number: number | null;
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
  plays: number;
  likes: number;
  comments: number;
  fetched_at: string | null;
};

const rawDb = {
  // ============ accounts ============
  async listAccounts(): Promise<(AccountRow & { posts: number })[]> {
    const sql = `
      SELECT a.*,
        (SELECT COUNT(*) FROM history h WHERE h.account_id = a.id) AS posts
      FROM accounts a
      ORDER BY a.created_at DESC`;
    const { results } = await requireDb().prepare(sql).all<AccountRow & { posts: number }>();
    const accounts = results ?? [];
    const repairable = accounts.filter((account) => !account.ig_user_id || !account.access_token);
    if (repairable.length) {
      await Promise.all(repairable.map((account) => rawDb.resolveAccountForPublishing(account.id)));
      const repaired = await requireDb().prepare(sql).all<AccountRow & { posts: number }>();
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
    if (typeof a.followers === "number" && a.followers >= 0) {
      await recordFollowersSnapshot(a.id, a.followers);
    }
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
    if (typeof input.followers === "number" && input.followers >= 0) {
      await recordFollowersSnapshot(id, input.followers);
    }
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
  async dueQueueItems(nowIso: string, limit = 50): Promise<QueueRow[]> {
    // Inclui:
    //  - 'scheduled' vencidos
    //  - 'processing' COM container (aguardando FINISHED no Instagram) — máx 10 tentativas
    //  - 'processing' SEM container e parados há >2min (órfãos) — máx 5 tentativas
    // Tentativas excedidas são marcadas como failed via failStuckProcessing().
    const { results } = await requireDb()
      .prepare(
        `SELECT * FROM queue
         WHERE (status = 'scheduled' AND scheduled_at <= ?)
            OR (status = 'processing' AND ig_container_id IS NOT NULL AND attempts < 10)
            OR (status = 'processing' AND ig_container_id IS NULL
                AND scheduled_at <= datetime(?, '-2 minutes')
                AND attempts < 5)
         ORDER BY scheduled_at ASC
         LIMIT ?`,
      )
      .bind(nowIso, nowIso, limit)
      .all<QueueRow>();
    return results ?? [];
  },

  /** Marca como failed itens 'processing' que estouraram o limite de tentativas
   *  (evita reprocessamento infinito de containers travados no Instagram). */
  async failStuckProcessing(): Promise<number> {
    const r = await requireDb()
      .prepare(
        `UPDATE queue
         SET status = 'failed',
             last_error = 'Container travado — excedeu limite de tentativas'
         WHERE status = 'processing'
           AND ((ig_container_id IS NOT NULL AND attempts >= 10)
             OR (ig_container_id IS NULL AND attempts >= 5))`,
      )
      .run();
    return (r.meta?.changes as number | undefined) ?? 0;
  },

  async enqueue(
    q: Omit<
      QueueRow,
      | "status"
      | "attempts"
      | "retry_count"
      | "last_error"
      | "ig_container_id"
      | "ig_media_id"
      | "created_at"
      | "group_id"
      | "group_scheduled_at"
      | "variant_processed"
      | "variant_method"
      | "variant_error"
      | "original_media_key"
      | "loop_id"
      | "cycle_number"
    > &
      Partial<
        Pick<
          QueueRow,
          | "group_id"
          | "group_scheduled_at"
          | "variant_processed"
          | "variant_method"
          | "original_media_key"
          | "loop_id"
          | "cycle_number"
        >
      >,
  ) {
    await requireDb()
      .prepare(
        `INSERT INTO queue (id, account_id, caption, media_type, media_key, thumb_key, scheduled_at, group_id, group_scheduled_at, variant_processed, variant_method, original_media_key, loop_id, cycle_number)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
        q.variant_processed ?? 0,
        q.variant_method ?? null,
        q.original_media_key ?? null,
        q.loop_id ?? null,
        q.cycle_number ?? null,
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
         SET status = 'processing', last_error = NULL, ig_container_id = ?,
             attempts = attempts + 1
         WHERE id = ?`,
      )
      .bind(igContainerId, id)
      .run();
  },
  async incrementQueueAttempts(id: string) {
    await requireDb()
      .prepare(`UPDATE queue SET attempts = attempts + 1 WHERE id = ?`)
      .bind(id)
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

  /** Reagenda um item para uma nova data (retry). Não bloqueia outros itens —
   *  o item fica como 'scheduled' e será reprocessado quando vencer. */
  async scheduleRetry(
    id: string,
    input: { scheduledAt: string; retryCount: number; lastError?: string | null },
  ) {
    await requireDb()
      .prepare(
        `UPDATE queue
         SET status = 'scheduled',
             scheduled_at = ?,
             retry_count = ?,
             last_error = ?,
             ig_container_id = NULL,
             ig_media_id = NULL
         WHERE id = ?`,
      )
      .bind(input.scheduledAt, input.retryCount, input.lastError ?? null, id)
      .run();
  },

  /** True quando a conta tem outro post publicado nos últimos `windowMin`
   *  OU agendado para os próximos `windowMin` (excluindo o próprio item). */
  async hasNearbyAccountPost(
    accountId: string,
    excludeQueueId: string,
    windowMin = 30,
  ): Promise<boolean> {
    const db = requireDb();
    const since = new Date(Date.now() - windowMin * 60_000).toISOString();
    const until = new Date(Date.now() + windowMin * 60_000).toISOString();
    const recent = await db
      .prepare(
        `SELECT 1 FROM history
         WHERE account_id = ? AND published_at >= ?
         LIMIT 1`,
      )
      .bind(accountId, since)
      .first<{ 1: number }>();
    if (recent) return true;
    const near = await db
      .prepare(
        `SELECT 1 FROM queue
         WHERE account_id = ?
           AND id != ?
           AND status IN ('scheduled','processing','published')
           AND scheduled_at >= ?
           AND scheduled_at <= ?
         LIMIT 1`,
      )
      .bind(accountId, excludeQueueId, since, until)
      .first<{ 1: number }>();
    return !!near;
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
  async clearPublishedBeforeToday(): Promise<number> {
    // Usa fuso de Brasília (UTC-3) para definir "hoje" — workers rodam em UTC.
    const result = await requireDb()
      .prepare(
        `DELETE FROM queue
         WHERE status = 'published'
           AND date(scheduled_at, '-3 hours') < date('now', '-3 hours')`,
      )
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
    h: Omit<HistoryRow, "fetched_at" | "reach" | "plays" | "likes" | "comments"> & Partial<HistoryRow>,
  ) {
    await requireDb()
      .prepare(
        `INSERT INTO history (id, account_id, queue_id, ig_media_id, caption, media_type, permalink, thumb_url, published_at, reach, plays, likes, comments)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
        h.plays ?? 0,
        h.likes ?? 0,
        h.comments ?? 0,
      )
      .run();
  },

  /**
   * Lista posts dos últimos N dias que precisam de refresh de insights.
   * Prioriza linhas nunca buscadas (fetched_at IS NULL) e depois as mais antigas.
   * Limita por tick para não estourar rate-limit da Graph API.
   */
  async listHistoryNeedingInsightsRefresh(opts: {
    days?: number;
    limit?: number;
    minAgeMinutes?: number;
  } = {}): Promise<HistoryRow[]> {
    const days = opts.days ?? 2;
    const limit = opts.limit ?? 3;
    const minAge = opts.minAgeMinutes ?? 30;
    const sinceIso = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    const staleBefore = new Date(Date.now() - minAge * 60_000).toISOString();
    // 1 item por account_id por tick (evita martelar a mesma conta) + janela
    // de 10min entre refreshes da mesma linha (já garantido por staleBefore=30min).
    const { results } = await requireDb()
      .prepare(
        `SELECT * FROM (
           SELECT *,
             ROW_NUMBER() OVER (
               PARTITION BY account_id
               ORDER BY (fetched_at IS NULL) DESC, fetched_at ASC, published_at DESC
             ) AS rn
           FROM history
           WHERE published_at >= ?
             AND (fetched_at IS NULL OR datetime(fetched_at) <= datetime(?))
         )
         WHERE rn = 1
         ORDER BY (fetched_at IS NULL) DESC, fetched_at ASC, published_at DESC
         LIMIT ?`,
      )
      .bind(sinceIso, staleBefore, limit)
      .all<HistoryRow>();
    return results ?? [];
  },
  async updateHistoryInsights(
    id: string,
    metrics: { reach: number; plays: number; likes: number; comments: number },
  ) {
    await requireDb()
      .prepare(
        `UPDATE history
         SET reach = ?, plays = ?, likes = ?, comments = ?, fetched_at = datetime('now')
         WHERE id = ?`,
      )
      .bind(metrics.reach, metrics.plays, metrics.likes, metrics.comments, id)
      .run();
    // Atualiza/insere snapshot do dia (UTC) para crescimento diário.
    const row = await requireDb()
      .prepare("SELECT account_id, ig_media_id FROM history WHERE id = ?")
      .bind(id)
      .first<{ account_id: string; ig_media_id: string }>();
    if (row) {
      await requireDb()
        .prepare(
          `INSERT INTO history_snapshots (id, account_id, ig_media_id, snapshot_date, plays, reach, likes, comments)
           VALUES (?, ?, ?, date('now'), ?, ?, ?, ?)
           ON CONFLICT(ig_media_id, snapshot_date) DO UPDATE SET
             plays = excluded.plays,
             reach = excluded.reach,
             likes = excluded.likes,
             comments = excluded.comments`,
        )
        .bind(
          crypto.randomUUID(),
          row.account_id,
          row.ig_media_id,
          metrics.plays,
          metrics.reach,
          metrics.likes,
          metrics.comments,
        )
        .run();
    }
  },

  // ============ oauth_states (links únicos de conexão) ============
  async createOAuthState(input: { state: string; redirectUri: string; ttlMinutes?: number }) {
    const ttl = Math.max(1, input.ttlMinutes ?? 30);
    const expires = new Date(Date.now() + ttl * 60_000).toISOString();
    await requireDb()
      .prepare(
        `INSERT INTO oauth_states (state, status, redirect_uri, expires_at)
         VALUES (?, 'pending', ?, ?)`,
      )
      .bind(input.state, input.redirectUri, expires)
      .run();
    return { state: input.state, expiresAt: expires };
  },
  async takeOAuthState(state: string): Promise<{ ok: boolean; reason?: string; redirectUri?: string }> {
    const row = await requireDb()
      .prepare("SELECT * FROM oauth_states WHERE state = ?")
      .bind(state)
      .first<{ status: string; expires_at: string; redirect_uri: string }>();
    if (!row) return { ok: false, reason: "not_found" };
    if (row.status !== "pending") return { ok: false, reason: "consumed" };
    if (Date.parse(row.expires_at) <= Date.now()) {
      await requireDb()
        .prepare("UPDATE oauth_states SET status = 'expired' WHERE state = ?")
        .bind(state)
        .run();
      return { ok: false, reason: "expired" };
    }
    await requireDb()
      .prepare("UPDATE oauth_states SET status = 'consumed', consumed_at = datetime('now') WHERE state = ?")
      .bind(state)
      .run();
    return { ok: true, redirectUri: row.redirect_uri };
  },

  // ============ token refresh ============
  async listAccountsForTokenRefresh(daysAhead = 10): Promise<AccountRow[]> {
    const cutoff = new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000).toISOString();
    const { results } = await requireDb()
      .prepare(
        `SELECT * FROM accounts
         WHERE provider = 'instagram'
           AND access_token IS NOT NULL
           AND token_status = 'valid'
           AND (token_expires_at IS NULL OR datetime(token_expires_at) <= datetime(?))
         ORDER BY token_expires_at ASC
         LIMIT 50`,
      )
      .bind(cutoff)
      .all<AccountRow>();
    return results ?? [];
  },
  async markAccountTokenExpired(id: string) {
    await requireDb()
      .prepare("UPDATE accounts SET token_status = 'expired', updated_at = CURRENT_TIMESTAMP WHERE id = ?")
      .bind(id)
      .run();
  },

  // ============ variantes serverless ============
  async getQueueItem(id: string): Promise<QueueRow | null> {
    return (
      (await requireDb()
        .prepare("SELECT * FROM queue WHERE id = ?")
        .bind(id)
        .first<QueueRow>()) ?? null
    );
  },
  async listPendingVariantItems(limit = 8): Promise<QueueRow[]> {
    // Itens com variante ainda não processada, ordenados por proximidade do scheduled_at.
    const { results } = await requireDb()
      .prepare(
        `SELECT * FROM queue
         WHERE variant_processed = 0
           AND status IN ('scheduled')
           AND media_type IN ('REEL','STORY','IMAGE')
           AND (media_key LIKE 'drive:%' OR original_media_key LIKE 'drive:%')
         ORDER BY scheduled_at ASC
         LIMIT ?`,
      )
      .bind(limit)
      .all<QueueRow>();
    return results ?? [];
  },
  async markVariantProcessed(
    id: string,
    input: { mediaKey: string; method: string; originalMediaKey?: string | null },
  ) {
    await requireDb()
      .prepare(
        `UPDATE queue
         SET variant_processed = 1,
             variant_method = ?,
             variant_error = NULL,
             original_media_key = COALESCE(original_media_key, ?),
             media_key = ?
         WHERE id = ?`,
      )
      .bind(input.method, input.originalMediaKey ?? null, input.mediaKey, id)
      .run();
  },
  async markVariantFailed(id: string, error: string) {
    await requireDb()
      .prepare(`UPDATE queue SET variant_error = ? WHERE id = ?`)
      .bind(error.slice(0, 500), id)
      .run();
  },

  // ============ loops ============
  async createLoop(input: Omit<LoopRow, "created_at" | "updated_at" | "cycle_number" | "last_error" | "status"> & { status?: LoopRow["status"] }) {
    await requireDb()
      .prepare(
        `INSERT INTO loops (id, source_type, media_type, folder_id, folder_name, video_ids_json, account_ids_json, caption, gap_min, jitter_min, order_mode, status, cycle_number, next_cycle_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`,
      )
      .bind(
        input.id,
        input.source_type,
        input.media_type ?? "REEL",
        input.folder_id ?? null,
        input.folder_name ?? null,
        input.video_ids_json ?? null,
        input.account_ids_json,
        input.caption,
        input.gap_min,
        input.jitter_min,
        input.order_mode,
        input.status ?? "active",
        input.next_cycle_at,
      )
      .run();
  },
  async listLoops(): Promise<LoopRow[]> {
    const { results } = await requireDb()
      .prepare(`SELECT * FROM loops WHERE status != 'stopped' ORDER BY created_at DESC`)
      .all<LoopRow>();
    return results ?? [];
  },
  async getLoop(id: string): Promise<LoopRow | null> {
    return (
      (await requireDb().prepare(`SELECT * FROM loops WHERE id = ?`).bind(id).first<LoopRow>()) ??
      null
    );
  },
  async listDueActiveLoops(nowIso: string, windowMinutes = 120): Promise<LoopRow[]> {
    // Loops ativos cujo next_cycle_at está dentro da janela (próximas X min)
    const horizon = new Date(new Date(nowIso).getTime() + windowMinutes * 60_000).toISOString();
    const { results } = await requireDb()
      .prepare(
        `SELECT * FROM loops WHERE status = 'active' AND next_cycle_at <= ? ORDER BY next_cycle_at ASC`,
      )
      .bind(horizon)
      .all<LoopRow>();
    return results ?? [];
  },
  async setLoopStatus(id: string, status: LoopRow["status"], lastError?: string | null) {
    await requireDb()
      .prepare(
        `UPDATE loops SET status = ?, last_error = ?, updated_at = datetime('now') WHERE id = ?`,
      )
      .bind(status, lastError ?? null, id)
      .run();
  },
  async advanceLoop(id: string, nextCycleAt: string, cycleNumber: number) {
    await requireDb()
      .prepare(
        `UPDATE loops SET next_cycle_at = ?, cycle_number = ?, last_error = NULL, updated_at = datetime('now') WHERE id = ?`,
      )
      .bind(nextCycleAt, cycleNumber, id)
      .run();
  },
  async cancelPendingForLoop(id: string): Promise<number> {
    const res = await requireDb()
      .prepare(`DELETE FROM queue WHERE loop_id = ? AND status = 'scheduled'`)
      .bind(id)
      .run();
    return (res.meta?.changes as number) ?? 0;
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
