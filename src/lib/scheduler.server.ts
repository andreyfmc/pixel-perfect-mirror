// Scheduler — executado a cada minuto pelo Cron Trigger.
// Lê itens vencidos da fila, publica no Instagram e grava no histórico.

import { db } from "./db.server";
import {
  type ContainerStatus,
  ensureFreshAccessToken,
  inferGraphProviderFromToken,
  instagram,
  isInvalidAccessTokenError,
  isMismatchedCredentialsError,
  isTransientGraphError,
  refreshLongLivedInstagramToken,
} from "./instagram.server";
import { hasDb, env } from "./cf.server";
import { buildVariantFor } from "./variant-builder.server";
import { runLoopMaterializer } from "./loops.server";
import { getAppForAccount } from "./meta-apps.server";


// URL pública dos arquivos no R2 (Public Access ativado no bucket insta-media).
export const R2_PUBLIC_BASE = "https://pub-5fcd7291327547a084c1e911d5141d6f.r2.dev";

// Cache do último origin visto numa request — fallback para o Cron Trigger
// (que não tem request) quando PUBLIC_BASE_URL não está setado.
let lastKnownOrigin: string | undefined;
export function rememberOrigin(origin: string) {
  if (origin) lastKnownOrigin = origin.replace(/\/$/, "");
}

/**
 * Resolve a URL pública que a Instagram Graph API vai baixar.
 *
 * - `drive:<fileId>`  → proxy público do worker: /api/public/drive/<fileId>
 * - qualquer outra    → R2 público
 *
 * Origin para `drive:`: baseUrl arg → PUBLIC_BASE_URL → último origin visto.
 */
export function publicMediaUrl(key: string, baseUrl?: string): string {
  if (key.startsWith("drive:")) {
    const fileId = key.slice("drive:".length);
    const origin = (baseUrl ?? env.PUBLIC_BASE_URL ?? lastKnownOrigin ?? "").replace(/\/$/, "");
    if (!origin) {
      throw new Error(
        "URL pública do worker desconhecida — abra a Fila no navegador uma vez ou defina PUBLIC_BASE_URL no wrangler para servir vídeos do Drive à Instagram",
      );
    }
    return `${origin}/api/public/drive/${fileId}`;
  }
  return `${R2_PUBLIC_BASE}/${key}`;
}

export async function runScheduler(
  now: Date = new Date(),
  opts: { baseUrl?: string } = {},
): Promise<{ processed: number; errors: number }> {
  if (!hasDb()) return { processed: 0, errors: 0 };

  // Materializa loops vencidos ANTES de buscar a fila — assim os itens
  // recém-gerados (cujo scheduled_at pode estar no passado) já entram no tick.
  try {
    const lm = await runLoopMaterializer(now);
    if (lm.loops) {
      console.log(
        `[scheduler] loops=${lm.loops} enqueued=${lm.enqueued} paused=${lm.paused} stopped=${lm.stopped}`,
      );
    }
  } catch (err) {
    console.warn("[scheduler] runLoopMaterializer falhou:", err);
  }

  const due = await db.dueQueueItems(now.toISOString());

  let processed = 0;
  let errors = 0;

  for (const item of due) {
    try {
      const account = await db.resolveAccountForPublishing(item.account_id);
      if (!account?.ig_user_id || !account?.access_token) {
        throw new Error(
          "Conta sem ig_user_id ou access_token — reconecte esta conta e recrie/retome a fila",
        );
      }
      let igUserId = account.ig_user_id;
      let accessToken = account.access_token;
      let provider = inferGraphProviderFromToken(account.access_token, account.provider);
      try {
        const fresh =
          provider === "instagram"
            ? await ensureFreshAccessToken({
                accessToken,
                tokenExpiresAt: account.token_expires_at,
              })
            : { accessToken, expiresAt: account.token_expires_at, refreshed: false };
        if (fresh.refreshed || account.token_status === "expired") {
          accessToken = fresh.accessToken;
          provider = inferGraphProviderFromToken(accessToken, provider);
          await db.updateAccountCredentials(item.account_id, {
            access_token: fresh.accessToken,
            token_expires_at: fresh.expiresAt,
            provider,
            token_status: "valid",
            health_score: Math.max(account.health_score, 90),
          });
        }
      } catch (err) {
        if (isInvalidAccessTokenError(err)) {
          await db.markAccountNeedsReconnect(item.account_id);
          await db.setQueueStatus(item.id, "canceled", {
            last_error: "Token OAuth inválido ou expirado. Reconecte esta conta antes de publicar.",
          });
          errors++;
          continue;
        }
        console.warn(
          `[scheduler] queue=${item.id} renovação de token falhou: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
      // NÃO flipar para 'processing' aqui — só quando o container existir
      // (markQueueProcessing faz isso). Se o Worker for morto por timeout
      // entre este ponto e a criação do container, o item ficaria órfão
      // como 'processing' com ig_container_id=NULL e nunca seria reprocessado.

      let containerId = item.ig_container_id ?? undefined;
      if (!containerId) {
        const mediaUrl = publicMediaUrl(item.media_key, opts.baseUrl);
        containerId = await instagram.createContainer({
          igUserId,
          accessToken,
          provider,
          mediaType: item.media_type,
          mediaUrl,
          caption: item.caption,
        });
        await db.markQueueProcessing(item.id, containerId);
      }

      let status: ContainerStatus;
      try {
        status = await instagram.fetchContainerStatus(containerId, accessToken, provider);
      } catch (err) {
        if (!item.ig_container_id || !isMismatchedCredentialsError(err)) throw err;

        // Containers antigos podem ter sido criados com Page token. Eles não são
        // legíveis/publicáveis com o User token correto; recria o container.
        await db.clearQueueContainer(item.id);
        const mediaUrl = publicMediaUrl(item.media_key, opts.baseUrl);
        containerId = await instagram.createContainer({
          igUserId,
          accessToken,
          provider,
          mediaType: item.media_type,
          mediaUrl,
          caption: item.caption,
        });
        await db.markQueueProcessing(item.id, containerId);
        status = await instagram.fetchContainerStatus(containerId, accessToken, provider);
      }
      if (status.statusCode === "ERROR" || status.statusCode === "EXPIRED") {
        throw new Error(
          `Container Instagram ${status.statusCode}: ${status.status ?? "sem detalhe"}`,
        );
      }
      if (status.statusCode !== "FINISHED" && status.statusCode !== "PUBLISHED") {
        // Incrementa attempts a cada tick — combinado com attempts<10 em
        // dueQueueItems, garante que containers travados saiam da fila.
        await db.incrementQueueAttempts(item.id);
        console.log(
          `[scheduler] queue=${item.id} container ainda ${status.statusCode}, aguardando próximo tick`,
        );
        continue;
      }

      const mediaId = await instagram.publishContainer({
        igUserId,
        accessToken,
        provider,
        containerId,
      });

      // Resolve o app vinculado à conta para auditoria (sem bloquear em caso de falha)
      let appId: string | null = null;
      let appName: string | null = null;
      try {
        const appCreds = await getAppForAccount(item.account_id, provider);
        if (appCreds && !appCreds.app_id.startsWith("env-")) {
          appId = appCreds.app_id;
          // Busca nome do app diretamente do banco
          const { requireDb } = await import("./cf.server");
          const appRow = await requireDb()
            .prepare("SELECT name FROM meta_apps WHERE id = ?")
            .bind(appId)
            .first<{ name: string }>();
          appName = appRow?.name ?? null;
        }
      } catch {
        // Não bloqueia a publicação se a busca do app falhar
      }

      await db.setQueueStatus(item.id, "published", {
        ig_container_id: containerId,
        ig_media_id: mediaId,
      });

      if (appId) {
        await db.setQueueAppUsed(item.id, appId).catch(() => {});
      }

      await db.recordPublication({
        id: crypto.randomUUID(),
        account_id: item.account_id,
        queue_id: item.id,
        ig_media_id: mediaId,
        caption: item.caption,
        media_type: item.media_type,
        permalink: null,
        thumb_url: item.thumb_key ? publicMediaUrl(item.thumb_key, opts.baseUrl) : null,
        published_at: new Date().toISOString(),
        meta_app_name: appName,
      });

      await db.updateLastPostAt(item.account_id, new Date().toISOString());

      processed++;
    } catch (err) {
      if (isInvalidAccessTokenError(err)) {
        await db.markAccountNeedsReconnect(item.account_id);
        await db.setQueueStatus(item.id, "canceled", {
          last_error: "Token OAuth inválido ou expirado. Reconecte esta conta antes de publicar.",
        });
        errors++;
        continue;
      }
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("ainda processando")) {
        console.log(`[scheduler] queue=${item.id} aguardando processamento do Instagram`);
        continue;
      }

      // Retry para erros transitórios (Meta `is_transient: true`).
      // Roda em paralelo aos próximos itens — só reagenda este item, sem
      // tocar nos demais. Backoff: 5min → 15min → 30min, máx 3 tentativas.
      const RETRY_DELAYS_MIN = [5, 15, 30];
      const currentRetry = item.retry_count ?? 0;
      if (isTransientGraphError(err) && currentRetry < RETRY_DELAYS_MIN.length) {
        const nextRetry = currentRetry + 1;
        // Cancela retry quando há outro post da mesma conta muito próximo
        // (publicado nos últimos 30min OU agendado para os próximos 30min).
        const conflict = await db.hasNearbyAccountPost(item.account_id, item.id, 30);
        if (conflict) {
          errors++;
          console.warn(`[scheduler] queue=${item.id} retry cancelado por conflito de horário`);
          await db.setQueueStatus(item.id, "failed", {
            last_error: `Retry cancelado — muito próximo de outro post desta conta. (erro original: ${msg})`,
          });
          continue;
        }
        const delayMs = RETRY_DELAYS_MIN[currentRetry] * 60_000;
        const nextAt = new Date(Date.now() + delayMs).toISOString();
        await db.scheduleRetry(item.id, {
          scheduledAt: nextAt,
          retryCount: nextRetry,
          lastError: `Retry ${nextRetry}/3 em ${RETRY_DELAYS_MIN[currentRetry]}min — erro transitório: ${msg}`,
        });
        console.warn(`[scheduler] queue=${item.id} retry ${nextRetry}/3 agendado para ${nextAt}`);
        continue;
      }

      errors++;
      console.error(`[scheduler] queue=${item.id} err=${msg}`);
      const finalError =
        currentRetry >= RETRY_DELAYS_MIN.length
          ? `Falha permanente após ${RETRY_DELAYS_MIN.length} tentativas: ${msg}`
          : msg;
      await db.setQueueStatus(item.id, "failed", { last_error: finalError });
    }
  }

  // Renovação preventiva de tokens longos do Instagram (60 dias).
  // Roda apenas uma vez por dia às 3h UTC para não consumir volume do app
  // a cada tick. Tokens são renovados com até 10 dias de antecedência.
  if (now.getUTCHours() === 3 && now.getUTCMinutes() === 0) {
    try {
      const stale = await db.listAccountsForTokenRefresh(10);
      for (const account of stale) {
        if (!account.access_token) continue;
        try {
          const refreshed = await refreshLongLivedInstagramToken(account.access_token);
          await db.updateAccountCredentials(account.id, {
            access_token: refreshed.accessToken,
            token_expires_at: refreshed.expiresAt,
            token_status: "valid",
          });
        } catch (err) {
          console.warn(`[scheduler] refresh token falhou para ${account.username}:`, err);
          await db.markAccountTokenExpired(account.id);
        }
      }
    } catch (err) {
      console.warn("[scheduler] varredura de refresh falhou:", err);
    }
  }

  // Processa variantes pendentes (1 por tick — cada build pode consumir
  // boa parte do orçamento de CPU do Worker).
  try {
    const pending = await db.listPendingVariantItems(1);
    for (const item of pending) {
      console.log(`[scheduler] gerando variante queue=${item.id}`);
      const r = await buildVariantFor(item.id);
      if (!r.ok) console.warn(`[scheduler] variante falhou queue=${item.id}: ${r.error}`);
    }
  } catch (err) {
    console.warn("[scheduler] build de variantes falhou:", err);
  }

  // Marca como failed qualquer item 'processing' que estourou tentativas.
  try {
    const stuck = await db.failStuckProcessing();
    if (stuck) console.warn(`[scheduler] ${stuck} item(s) travado(s) marcado(s) como failed`);
  } catch (err) {
    console.warn("[scheduler] failStuckProcessing erro:", err);
  }

  console.log(
    `[cron] tick=${now.toISOString()} processed=${processed} errors=${errors} due=${due.length}`,
  );

  return { processed, errors };
}

/**
 * Atualiza reach/likes/comments de até `limit` posts publicados nos últimos 2 dias.
 * Usado pelo tick do scheduler e pelo endpoint manual /api/history/refresh.
 * 1 item por conta para não martelar a mesma Page no rate-limit.
 */
export async function refreshHistoryInsights(
  limit = 3,
): Promise<{ updated: number; failed: number }> {
  if (!hasDb()) return { updated: 0, failed: 0 };
  const rows = await db.listHistoryNeedingInsightsRefresh({ days: 2, limit, minAgeMinutes: 30 });
  let updated = 0;
  let failed = 0;
  for (const row of rows) {
    try {
      const account = await db.resolveAccountForPublishing(row.account_id);
      if (!account?.access_token) {
        failed++;
        continue;
      }
      const provider = inferGraphProviderFromToken(account.access_token, account.provider);
      const metrics = await instagram.fetchMediaMetrics(
        row.ig_media_id,
        account.access_token,
        provider,
      );
      await db.updateHistoryInsights(row.id, metrics);
      updated++;
    } catch (err) {
      failed++;
      if (isInvalidAccessTokenError(err)) {
        await db.markAccountNeedsReconnect(row.account_id);
      }
      console.warn(
        `[insights] history=${row.id} falhou: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
  return { updated, failed };
}
