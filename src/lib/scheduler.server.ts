// Scheduler — executado a cada minuto pelo Cron Trigger.
// Lê itens vencidos da fila, publica no Instagram e grava no histórico.

import { db } from "./db.server";
import { instagram } from "./instagram.server";
import { env, hasDb } from "./cf.server";

// URL pública dos arquivos no R2. Em produção configure um custom domain
// no bucket (ex: media.seusite.com) e defina aqui.
function publicMediaUrl(key: string): string {
  const base = env.APP_ENV === "production"
    ? "https://media.example.com"
    : "https://pub-placeholder.r2.dev";
  return `${base}/${key}`;
}

export async function runScheduler(now = new Date()): Promise<{ processed: number; errors: number }> {
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

      const result = await instagram.publish({
        igUserId: account.ig_user_id,
        accessToken: account.access_token,
        mediaType: item.media_type,
        mediaUrl: publicMediaUrl(item.media_key),
        caption: item.caption,
      });

      await db.setQueueStatus(item.id, "published", {
        ig_container_id: result.containerId,
        ig_media_id: result.mediaId,
      });

      await db.recordPublication({
        id: crypto.randomUUID(),
        account_id: item.account_id,
        queue_id: item.id,
        ig_media_id: result.mediaId,
        caption: item.caption,
        media_type: item.media_type,
        permalink: result.permalink ?? null,
        thumb_url: item.thumb_key ? publicMediaUrl(item.thumb_key) : null,
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
