// Gerenciamento de múltiplos apps Meta com rotação automática de contas.
// Server-only — sufixo .server.ts impede inclusão no bundle do cliente.

import { requireDb } from "./cf.server";
import { env } from "./cf.server";

// ─────────────────────────────────────────────
// Tipos
// ─────────────────────────────────────────────

export type MetaAppRow = {
  id: string;
  name: string;
  client_id: string;
  client_secret: string;
  provider: "facebook" | "instagram";
  is_active: number; // 1 = ativo, 0 = inativo
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type MetaAppPublic = Omit<MetaAppRow, "client_secret"> & {
  client_id_masked: string; // ex: "••••••••••••8f2a1b"
  account_count: number;
};

export type MetaAppCredentials = {
  app_id: string;
  client_id: string;
  client_secret: string;
  provider: "facebook" | "instagram";
};

export type RedistributeResult = {
  moved: number;
  distribution: { app_id: string; app_name: string; count: number }[];
};

// ─────────────────────────────────────────────
// Helpers internos
// ─────────────────────────────────────────────

function maskClientId(clientId: string): string {
  if (clientId === "__ENV_PLACEHOLDER__") return "••••••• (env)";
  const visible = clientId.slice(-6);
  return "••••••••••••" + visible;
}

/** Credenciais de fallback vindas do env — usadas quando não há apps cadastrados
 *  ou a conta não tem meta_app_id definido. */
function envFallbackCredentials(provider: "facebook" | "instagram"): MetaAppCredentials | null {
  if (provider === "instagram") {
    const id = env.META_IG_APP_ID;
    const secret = env.META_IG_APP_SECRET;
    if (id && secret) {
      return { app_id: "env-instagram", client_id: id, client_secret: secret, provider };
    }
  } else {
    const id = env.META_APP_ID;
    const secret = env.META_APP_SECRET;
    if (id && secret) {
      return { app_id: "env-facebook", client_id: id, client_secret: secret, provider };
    }
  }
  return null;
}

// ─────────────────────────────────────────────
// Auto-migração (chamada pelo ensureSchema do db.server.ts)
// ─────────────────────────────────────────────

/** Garante que a tabela meta_apps existe e que contas existentes sem
 *  meta_app_id sejam migradas para um app "padrão" criado a partir do env. */
export async function ensureMetaAppsSchema(): Promise<void> {
  const db = requireDb();

  // 1. Criar tabela se não existir
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS meta_apps (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        client_id TEXT NOT NULL UNIQUE,
        client_secret TEXT NOT NULL,
        provider TEXT NOT NULL DEFAULT 'facebook'
          CHECK (provider IN ('facebook','instagram')),
        is_active INTEGER NOT NULL DEFAULT 1,
        notes TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
    )
    .run();

  // 2. Adicionar coluna meta_app_id em accounts se não existir
  const { results: accCols } = await db
    .prepare("PRAGMA table_info(accounts)")
    .all<{ name: string }>();
  const accColSet = new Set((accCols ?? []).map((r) => r.name));
  if (!accColSet.has("meta_app_id")) {
    await db.prepare("ALTER TABLE accounts ADD COLUMN meta_app_id TEXT").run();
  }

  // 3. Adicionar coluna meta_app_id em oauth_states se não existir
  const { results: oauthCols } = await db
    .prepare("PRAGMA table_info(oauth_states)")
    .all<{ name: string }>();
  const oauthColSet = new Set((oauthCols ?? []).map((r) => r.name));
  if (!oauthColSet.has("meta_app_id")) {
    await db.prepare("ALTER TABLE oauth_states ADD COLUMN meta_app_id TEXT").run();
  }

  // 4. Se não há apps cadastrados e o env tem credenciais, cria app padrão
  //    e vincula todas as contas existentes a ele.
  const { results: existingApps } = await db
    .prepare("SELECT id FROM meta_apps LIMIT 1")
    .all<{ id: string }>();

  if (!existingApps?.length) {
    // Tenta criar app padrão para Facebook
    const fbId = env.META_APP_ID;
    const fbSecret = env.META_APP_SECRET;
    if (fbId && fbSecret && fbId !== "__ENV_PLACEHOLDER__") {
      await db
        .prepare(
          `INSERT OR IGNORE INTO meta_apps (id, name, client_id, client_secret, provider, notes)
           VALUES (?, ?, ?, ?, 'facebook', ?)`,
        )
        .bind(
          "default-facebook",
          "App Padrão (Facebook)",
          fbId,
          fbSecret,
          "Migrado automaticamente do env na primeira execução",
        )
        .run();
      await db
        .prepare(
          `UPDATE accounts SET meta_app_id = 'default-facebook'
           WHERE meta_app_id IS NULL AND (provider = 'facebook' OR access_token NOT LIKE 'IGAA%')`,
        )
        .run();
    }

    // Tenta criar app padrão para Instagram
    const igId = env.META_IG_APP_ID;
    const igSecret = env.META_IG_APP_SECRET;
    if (igId && igSecret && igId !== "__ENV_PLACEHOLDER__") {
      await db
        .prepare(
          `INSERT OR IGNORE INTO meta_apps (id, name, client_id, client_secret, provider, notes)
           VALUES (?, ?, ?, ?, 'instagram', ?)`,
        )
        .bind(
          "default-instagram",
          "App Padrão (Instagram)",
          igId,
          igSecret,
          "Migrado automaticamente do env na primeira execução",
        )
        .run();
      await db
        .prepare(
          `UPDATE accounts SET meta_app_id = 'default-instagram'
           WHERE meta_app_id IS NULL AND (provider = 'instagram' OR access_token LIKE 'IGAA%')`,
        )
        .run();
    }
  }
}

// ─────────────────────────────────────────────
// Leitura
// ─────────────────────────────────────────────

/** Lista todos os apps com contagem real de contas vinculadas. */
export async function listMetaApps(): Promise<MetaAppPublic[]> {
  const db = requireDb();
  const { results } = await db
    .prepare(
      `SELECT a.*,
        (SELECT COUNT(*) FROM accounts ac WHERE ac.meta_app_id = a.id) AS account_count
       FROM meta_apps a
       ORDER BY a.created_at ASC`,
    )
    .all<MetaAppRow & { account_count: number }>();

  return (results ?? []).map((r) => ({
    ...r,
    client_secret: undefined as never, // nunca expor
    client_id_masked: maskClientId(r.client_id),
    account_count: r.account_count ?? 0,
  }));
}

/** Retorna um app pelo id incluindo client_secret (uso interno apenas). */
export async function getMetaAppById(id: string): Promise<MetaAppRow | null> {
  return (
    (await requireDb()
      .prepare("SELECT * FROM meta_apps WHERE id = ?")
      .bind(id)
      .first<MetaAppRow>()) ?? null
  );
}

/** Retorna as credenciais do app vinculado a uma conta.
 *  Fallback em cascata:
 *    1. App vinculado à conta (meta_app_id) e ativo
 *    2. Qualquer app ativo do mesmo provider com menos contas
 *    3. Variáveis de ambiente (retrocompatibilidade)
 */
export async function getAppForAccount(
  accountId: string,
  provider: "facebook" | "instagram" = "facebook",
): Promise<MetaAppCredentials | null> {
  const db = requireDb();

  // Busca conta com meta_app_id
  const account = await db
    .prepare("SELECT meta_app_id, provider FROM accounts WHERE id = ?")
    .bind(accountId)
    .first<{ meta_app_id: string | null; provider: string }>();

  const resolvedProvider = (account?.provider as "facebook" | "instagram") ?? provider;

  if (account?.meta_app_id) {
    const app = await db
      .prepare("SELECT * FROM meta_apps WHERE id = ? AND is_active = 1")
      .bind(account.meta_app_id)
      .first<MetaAppRow>();
    if (app) {
      return {
        app_id: app.id,
        client_id: app.client_id,
        client_secret: app.client_secret,
        provider: app.provider,
      };
    }
    // App vinculado está inativo — tenta outro ativo do mesmo provider
    console.warn(
      `[meta-apps] App ${account.meta_app_id} inativo para conta ${accountId}. Usando fallback.`,
    );
  }

  // Fallback: app ativo do mesmo provider com menos contas
  const fallbackApp = await getLeastLoadedApp(resolvedProvider);
  if (fallbackApp) {
    return {
      app_id: fallbackApp.id,
      client_id: fallbackApp.client_id,
      client_secret: fallbackApp.client_secret,
      provider: fallbackApp.provider,
    };
  }

  // Último fallback: env
  return envFallbackCredentials(resolvedProvider);
}

/** Retorna o app ativo com menor número de contas vinculadas para um provider.
 *  Empate desempatado por created_at ASC (o mais antigo fica com a conta). */
export async function getLeastLoadedApp(
  provider: "facebook" | "instagram" = "facebook",
): Promise<MetaAppRow | null> {
  const app = await requireDb()
    .prepare(
      `SELECT a.*,
        (SELECT COUNT(*) FROM accounts ac WHERE ac.meta_app_id = a.id) AS cnt
       FROM meta_apps a
       WHERE a.is_active = 1 AND a.provider = ?
       ORDER BY cnt ASC, a.created_at ASC
       LIMIT 1`,
    )
    .bind(provider)
    .first<MetaAppRow>();
  return app ?? null;
}

// ─────────────────────────────────────────────
// Escrita
// ─────────────────────────────────────────────

/** Cria novo app Meta. Valida client_id único. */
export async function createMetaApp(data: {
  name: string;
  client_id: string;
  client_secret: string;
  provider: "facebook" | "instagram";
  notes?: string;
}): Promise<MetaAppPublic> {
  const db = requireDb();

  // Valida duplicata
  const existing = await db
    .prepare("SELECT id FROM meta_apps WHERE client_id = ?")
    .bind(data.client_id)
    .first<{ id: string }>();
  if (existing) {
    throw new Error(`Já existe um app com este client_id (id: ${existing.id})`);
  }

  const id = crypto.randomUUID();
  await db
    .prepare(
      `INSERT INTO meta_apps (id, name, client_id, client_secret, provider, notes)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .bind(id, data.name, data.client_id, data.client_secret, data.provider, data.notes ?? null)
    .run();

  const created = await getMetaAppById(id);
  if (!created) throw new Error("Falha ao recuperar app criado");

  return {
    ...created,
    client_secret: undefined as never,
    client_id_masked: maskClientId(created.client_id),
    account_count: 0,
  };
}

/** Atualiza nome, secret, notes ou status de um app. */
export async function updateMetaApp(
  id: string,
  data: Partial<{
    name: string;
    client_secret: string;
    notes: string;
    is_active: number;
  }>,
): Promise<MetaAppPublic> {
  const db = requireDb();

  const fields: string[] = ["updated_at = CURRENT_TIMESTAMP"];
  const values: unknown[] = [];

  if (data.name !== undefined) { fields.push("name = ?"); values.push(data.name); }
  if (data.client_secret !== undefined) { fields.push("client_secret = ?"); values.push(data.client_secret); }
  if (data.notes !== undefined) { fields.push("notes = ?"); values.push(data.notes); }
  if (data.is_active !== undefined) { fields.push("is_active = ?"); values.push(data.is_active); }

  if (fields.length === 1) throw new Error("Nenhum campo para atualizar");

  values.push(id);
  await db
    .prepare(`UPDATE meta_apps SET ${fields.join(", ")} WHERE id = ?`)
    .bind(...values)
    .run();

  const apps = await listMetaApps();
  const updated = apps.find((a) => a.id === id);
  if (!updated) throw new Error("App não encontrado após atualização");
  return updated;
}

/** Deleta um app. Bloqueia se houver contas vinculadas. */
export async function deleteMetaApp(
  id: string,
): Promise<{ ok: true } | { ok: false; error: string; account_count: number }> {
  const db = requireDb();

  const { results } = await db
    .prepare("SELECT COUNT(*) as cnt FROM accounts WHERE meta_app_id = ?")
    .bind(id)
    .all<{ cnt: number }>();
  const count = results?.[0]?.cnt ?? 0;

  if (count > 0) {
    return {
      ok: false,
      error: `Este app tem ${count} conta(s) vinculada(s). Redistribua-as antes de deletar.`,
      account_count: count,
    };
  }

  await db.prepare("DELETE FROM meta_apps WHERE id = ?").bind(id).run();
  return { ok: true };
}

// ─────────────────────────────────────────────
// Atribuição de apps às contas
// ─────────────────────────────────────────────

/** Vincula uma conta a um app específico. */
export async function assignAppToAccount(accountId: string, appId: string): Promise<void> {
  await requireDb()
    .prepare(
      "UPDATE accounts SET meta_app_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
    )
    .bind(appId, accountId)
    .run();
}

/** Atribui automaticamente o app menos carregado a uma conta.
 *  Retorna as credenciais do app atribuído. */
export async function autoAssignApp(
  accountId: string,
  provider: "facebook" | "instagram" = "facebook",
): Promise<MetaAppCredentials | null> {
  const app = await getLeastLoadedApp(provider);
  if (!app) return envFallbackCredentials(provider);

  await assignAppToAccount(accountId, app.id);
  return {
    app_id: app.id,
    client_id: app.client_id,
    client_secret: app.client_secret,
    provider: app.provider,
  };
}

/** Redistribui todas as contas igualmente entre apps ativos (round-robin).
 *  Ordena contas por created_at ASC para distribuição determinística. */
export async function redistributeAccounts(): Promise<RedistributeResult> {
  const db = requireDb();

  // Busca apps ativos agrupados por provider
  const { results: apps } = await db
    .prepare("SELECT * FROM meta_apps WHERE is_active = 1 ORDER BY created_at ASC")
    .all<MetaAppRow>();

  if (!apps?.length) {
    return { moved: 0, distribution: [] };
  }

  // Busca todas as contas ordenadas por created_at
  const { results: accounts } = await db
    .prepare("SELECT id, provider, access_token FROM accounts ORDER BY created_at ASC")
    .all<{ id: string; provider: string; access_token: string | null }>();

  if (!accounts?.length) {
    return { moved: 0, distribution: [] };
  }

  // Separa apps por provider
  const fbApps = apps.filter((a) => a.provider === "facebook");
  const igApps = apps.filter((a) => a.provider === "instagram");

  let moved = 0;
  const stmts: ReturnType<typeof db.prepare>[] = [];

  for (let i = 0; i < accounts.length; i++) {
    const account = accounts[i];
    const isIg =
      account.provider === "instagram" || (account.access_token ?? "").startsWith("IGAA");
    const pool = isIg ? igApps : fbApps;

    if (!pool.length) continue; // sem apps para esse provider, pula

    const targetApp = pool[i % pool.length];
    stmts.push(
      db
        .prepare(
          "UPDATE accounts SET meta_app_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        )
        .bind(targetApp.id, account.id),
    );
    moved++;
  }

  // Executa em batch
  if (stmts.length) {
    await db.batch(stmts);
  }

  // Monta resultado com contagens reais após redistribuição
  const { results: dist } = await db
    .prepare(
      `SELECT a.id as app_id, a.name as app_name,
        COUNT(ac.id) as count
       FROM meta_apps a
       LEFT JOIN accounts ac ON ac.meta_app_id = a.id
       WHERE a.is_active = 1
       GROUP BY a.id, a.name
       ORDER BY a.created_at ASC`,
    )
    .all<{ app_id: string; app_name: string; count: number }>();

  return {
    moved,
    distribution: (dist ?? []).map((d) => ({
      app_id: d.app_id,
      app_name: d.app_name,
      count: d.count ?? 0,
    })),
  };
}

/** Preview da redistribuição sem aplicar — usado pelo frontend para confirmar antes de executar. */
export async function previewRedistribution(): Promise<
  { app_id: string; app_name: string; current_count: number; projected_count: number }[]
> {
  const db = requireDb();

  const { results: apps } = await db
    .prepare(
      `SELECT a.id, a.name, a.provider,
        (SELECT COUNT(*) FROM accounts ac WHERE ac.meta_app_id = a.id) as current_count
       FROM meta_apps a
       WHERE a.is_active = 1
       ORDER BY a.created_at ASC`,
    )
    .all<{ id: string; name: string; provider: string; current_count: number }>();

  const { results: accounts } = await db
    .prepare("SELECT id, provider, access_token FROM accounts ORDER BY created_at ASC")
    .all<{ id: string; provider: string; access_token: string | null }>();

  if (!apps?.length || !accounts?.length) {
    return (apps ?? []).map((a) => ({
      app_id: a.id,
      app_name: a.name,
      current_count: a.current_count ?? 0,
      projected_count: 0,
    }));
  }

  const fbApps = apps.filter((a) => a.provider === "facebook");
  const igApps = apps.filter((a) => a.provider === "instagram");

  const projectedCounts: Record<string, number> = {};
  apps.forEach((a) => { projectedCounts[a.id] = 0; });

  for (let i = 0; i < accounts.length; i++) {
    const account = accounts[i];
    const isIg =
      account.provider === "instagram" || (account.access_token ?? "").startsWith("IGAA");
    const pool = isIg ? igApps : fbApps;
    if (!pool.length) continue;
    const targetApp = pool[i % pool.length];
    projectedCounts[targetApp.id] = (projectedCounts[targetApp.id] ?? 0) + 1;
  }

  return apps.map((a) => ({
    app_id: a.id,
    app_name: a.name,
    current_count: a.current_count ?? 0,
    projected_count: projectedCounts[a.id] ?? 0,
  }));
}


/** Recalcula account_count em memória para todos os apps via COUNT real do banco.
 *  Como o D1 não suporta UPDATE com subquery correlacionada, faz um SELECT
 *  por app e atualiza em batch. Útil após redistribuições em lote. */
export async function syncAppCounts(): Promise<
  { app_id: string; app_name: string; count: number }[]
> {
  const db = requireDb();

  const { results: apps } = await db
    .prepare("SELECT id, name FROM meta_apps ORDER BY created_at ASC")
    .all<{ id: string; name: string }>();

  if (!apps?.length) return [];

  // Busca contagem real de cada app em uma única query
  const { results: counts } = await db
    .prepare(
      `SELECT meta_app_id, COUNT(*) AS cnt
       FROM accounts
       WHERE meta_app_id IS NOT NULL
       GROUP BY meta_app_id`,
    )
    .all<{ meta_app_id: string; cnt: number }>();

  const countMap = new Map<string, number>(
    (counts ?? []).map((r) => [r.meta_app_id, r.cnt ?? 0]),
  );

  return (apps ?? []).map((a) => ({
    app_id: a.id,
    app_name: a.name,
    count: countMap.get(a.id) ?? 0,
  }));
}
