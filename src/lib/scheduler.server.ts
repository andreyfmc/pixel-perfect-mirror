// Scheduler — executado a cada minuto pelo Cron Trigger.
// Lê itens vencidos da fila, publica no Instagram e grava no histórico.

import { db } from "./db.server";
import { ensureFreshAccessToken, instagram, isInvalidAccessTokenError } from "./instagram.server";
import { hasDb, env } from "./cf.server";

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

  const due = await db.dueQueueItems(now.toISOString());
  let processed = 0;
  let errors = 0;

  for (const item of due) {
    try {
      await db.setQueueStatus(item.id, "processing");
      const account = await db.getAccount(item.account_id);
      if (!account?.ig_user_id || !account?.access_token) {
        throw new Error("Conta sem ig_user_id ou access_token");
      }
      if (account.token_status === "expired") {
        await db.setQueueStatus(item.id, "canceled", {
          last_error: "Token expirado. Reconecte a conta antes de publicar.",
        });
        errors++;
        continue;
      }
      let igUserId = account.ig_user_id;
      let accessToken = account.access_token;
      try {
        const fresh = await ensureFreshAccessToken({
          accessToken,
          tokenExpiresAt: account.token_expires_at,
        });
        if (fresh.refreshed) {
          accessToken = fresh.accessToken;
          await db.updateAccountCredentials(item.account_id, {
            access_token: fresh.accessToken,
            token_expires_at: fresh.expiresAt,
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
      try {
        const validated = await instagram.validateCredentials({
          igUserId,
          accessToken,
        });
        const validatedIgId = typeof validated.ig?.id === "string" ? validated.ig.id : undefined;
        const validatedToken =
          typeof validated.accessToken === "string" ? validated.accessToken : undefined;
        if (validatedIgId || validatedToken) {
          igUserId = validatedIgId ?? igUserId;
          accessToken = validatedToken ?? accessToken;
          await db.updateAccountCredentials(item.account_id, {
            ig_user_id: validatedIgId,
            access_token: validatedToken,
            token_status: "valid",
            profile_picture:
              typeof validated.ig?.profile_picture_url === "string"
                ? validated.ig.profile_picture_url
                : undefined,
            followers:
              typeof validated.ig?.followers_count === "number"
                ? validated.ig.followers_count
                : undefined,
            health_score: 95,
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
          `[scheduler] queue=${item.id} validação de credencial falhou: ${err instanceof Error ? err.message : String(err)}`,
        );
      }

      let containerId = item.ig_container_id ?? undefined;
      if (!containerId) {
        const mediaUrl = publicMediaUrl(item.media_key, opts.baseUrl);
        containerId = await instagram.createContainer({
          igUserId,
          accessToken,
          mediaType: item.media_type,
          mediaUrl,
          caption: item.caption,
        });
        await db.markQueueProcessing(item.id, containerId);
      }

      await instagram.waitUntilReady({
        containerId,
        accessToken,
        attempts: 1,
        delayMs: 0,
      });

      const mediaId = await instagram.publishContainer({
        igUserId,
        accessToken,
        containerId,
      });

      let permalink: string | undefined;
      try {
        const info = await instagram.fetchMediaInfo(mediaId, accessToken);
        permalink = info.permalink as string | undefined;
      } catch {
        // campo opcional
      }

      await db.setQueueStatus(item.id, "published", {
        ig_container_id: containerId,
        ig_media_id: mediaId,
      });

      await db.recordPublication({
        id: crypto.randomUUID(),
        account_id: item.account_id,
        queue_id: item.id,
        ig_media_id: mediaId,
        caption: item.caption,
        media_type: item.media_type,
        permalink: permalink ?? null,
        thumb_url: item.thumb_key ? publicMediaUrl(item.thumb_key, opts.baseUrl) : null,
        published_at: new Date().toISOString(),
      });

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

      errors++;
      console.error(`[scheduler] queue=${item.id} err=${msg}`);
      await db.setQueueStatus(item.id, "failed", { last_error: msg });
    }
  }

  return { processed, errors };
}
