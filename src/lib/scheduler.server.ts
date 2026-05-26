// Scheduler — executado a cada minuto pelo Cron Trigger.
// Lê itens vencidos da fila, publica no Instagram e grava no histórico.

import { db } from "./db.server";
import {
  ensureFreshAccessToken,
  instagram,
  isInvalidAccessTokenError,
  isMismatchedCredentialsError,
} from "./instagram.server";
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
      const account = await db.resolveAccountForPublishing(item.account_id);
      if (!account?.ig_user_id || !account?.access_token) {
        throw new Error("Conta sem ig_user_id ou access_token — reconecte esta conta e recrie/retome a fila");
      }
      let igUserId = account.ig_user_id;
      let accessToken = account.access_token;
      try {
        const fresh =
          account.provider === "instagram"
            ? await ensureFreshAccessToken({
                accessToken,
                tokenExpiresAt: account.token_expires_at,
              })
            : { accessToken, expiresAt: account.token_expires_at, refreshed: false };
        if (fresh.refreshed || account.token_status === "expired") {
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
      await db.setQueueStatus(item.id, "processing");
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
        if (isMismatchedCredentialsError(err)) {
          // Linha tem (ig_user_id, access_token) que não batem entre si.
          // Tenta puxar credenciais frescas de outra linha do mesmo @username
          // (reconexão posterior) e re-valida uma vez. Sem isso o usuário
          // fica preso reconectando sem efeito porque a linha antiga "parece"
          // completa.
          const healed = await db.healMismatchedCredentials(item.account_id);
          if (healed?.ig_user_id && healed?.access_token) {
            try {
              const reValidated = await instagram.validateCredentials({
                igUserId: healed.ig_user_id,
                accessToken: healed.access_token,
              });
              igUserId = (typeof reValidated.ig?.id === "string" ? reValidated.ig.id : undefined) ?? healed.ig_user_id;
              accessToken = (typeof reValidated.accessToken === "string" ? reValidated.accessToken : undefined) ?? healed.access_token;
              await db.updateAccountCredentials(item.account_id, {
                ig_user_id: igUserId,
                access_token: accessToken,
                token_status: "valid",
                health_score: 95,
              });
            } catch (healErr) {
              await db.markAccountNeedsReconnect(item.account_id);
              await db.setQueueStatus(item.id, "canceled", {
                last_error: `Credenciais incompatíveis e auto-recuperação falhou — reconecte a conta. (${healErr instanceof Error ? healErr.message : String(healErr)})`,
              });
              errors++;
              continue;
            }
          } else {
            await db.markAccountNeedsReconnect(item.account_id);
            await db.setQueueStatus(item.id, "canceled", {
              last_error: "Credenciais incompatíveis: o token salvo não acessa o ig_user_id desta conta. Reconecte a conta no Facebook para regenerar o Page token correto.",
            });
            errors++;
            continue;
          }
        } else {
          console.warn(
            `[scheduler] queue=${item.id} validação de credencial falhou: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }

      let containerId = item.ig_container_id ?? undefined;
      if (!containerId) {
        const mediaUrl = publicMediaUrl(item.media_key, opts.baseUrl);
        containerId = await instagram.createContainer({
          igUserId,
          accessToken,
          provider: account.provider,
          mediaType: item.media_type,
          mediaUrl,
          caption: item.caption,
        });
        await db.markQueueProcessing(item.id, containerId);
      }

      const status = await instagram.fetchContainerStatus(containerId, accessToken, account.provider);
      if (status.statusCode === "ERROR" || status.statusCode === "EXPIRED") {
        throw new Error(
          `Container Instagram ${status.statusCode}: ${status.status ?? "sem detalhe"}`,
        );
      }
      if (status.statusCode !== "FINISHED" && status.statusCode !== "PUBLISHED") {
        console.log(
          `[scheduler] queue=${item.id} container ainda ${status.statusCode}, aguardando próximo tick`,
        );
        continue;
      }


      const mediaId = await instagram.publishContainer({
        igUserId,
        accessToken,
        provider: account.provider,
        containerId,
      });

      let permalink: string | undefined;
      try {
        const info = await instagram.fetchMediaInfo(mediaId, accessToken, account.provider);
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

      errors++;
      console.error(`[scheduler] queue=${item.id} err=${msg}`);
      await db.setQueueStatus(item.id, "failed", { last_error: msg });
    }
  }

  return { processed, errors };
}
