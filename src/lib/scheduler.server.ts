// Scheduler — executado a cada minuto pelo Cron Trigger.
// Lê itens vencidos da fila, publica no Instagram e grava no histórico.

import { db } from "./db.server";
import { instagram } from "./instagram.server";
import { hasDb, env } from "./cf.server";

// URL pública dos arquivos no R2 (Public Access ativado no bucket insta-media).
export const R2_PUBLIC_BASE = "https://pub-5fcd7291327547a084c1e911d5141d6f.r2.dev";

/**
 * Resolve a URL pública que a Instagram Graph API vai baixar.
 *
 * - `drive:<fileId>`  → proxy público do worker: /api/public/drive/<fileId>
 *   (precisa de `baseUrl` ou env `PUBLIC_BASE_URL`)
 * - qualquer outra    → R2 público
 */
export function publicMediaUrl(key: string, baseUrl?: string): string {
  if (key.startsWith("drive:")) {
    const fileId = key.slice("drive:".length);
    const origin = (baseUrl ?? env.PUBLIC_BASE_URL ?? "").replace(/\/$/, "");
    if (!origin) {
      throw new Error(
        "PUBLIC_BASE_URL não configurado — defina a URL pública do worker para servir vídeos do Drive à Instagram",
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

      let containerId = item.ig_container_id ?? undefined;
      if (!containerId) {
        const mediaUrl = publicMediaUrl(item.media_key, opts.baseUrl);
        containerId = await instagram.createContainer({
          igUserId: account.ig_user_id,
          accessToken: account.access_token,
          mediaType: item.media_type,
          mediaUrl,
          caption: item.caption,
        });
        await db.markQueueProcessing(item.id, containerId);
      }

      await instagram.waitUntilReady({
        containerId,
        accessToken: account.access_token,
        attempts: 8,
        delayMs: 5000,
      });

      const mediaId = await instagram.publishContainer({
        igUserId: account.ig_user_id,
        accessToken: account.access_token,
        containerId,
      });

      let permalink: string | undefined;
      try {
        const info = await instagram.fetchMediaInfo(mediaId, account.access_token);
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
        ig_media_id: result.mediaId,
        caption: item.caption,
        media_type: item.media_type,
        permalink: permalink ?? null,
        thumb_url: item.thumb_key ? publicMediaUrl(item.thumb_key, opts.baseUrl) : null,
        published_at: new Date().toISOString(),
      });

      processed++;
    } catch (err) {
      errors++;
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[scheduler] queue=${item.id} err=${msg}`);
      await db.setQueueStatus(item.id, "failed", { last_error: msg });
    }
  }

  return { processed, errors };
}

