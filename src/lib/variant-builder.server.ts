// Build de variantes serverless (lógica pura — sem dependência de rota).
// Roda em Worker. Limites: 80MB input por arquivo.

import { db } from "./db.server";
import { ensureEnv, hasMedia, requireMedia } from "./cf.server";
import { variateMp4 } from "./mp4-variant.server";

const GATEWAY = "https://connector-gateway.lovable.dev/google_drive/drive/v3";
const MAX_INPUT_BYTES = 80 * 1024 * 1024;

async function downloadDrive(fileId: string): Promise<Uint8Array> {
  const env = await ensureEnv();
  const LOVABLE_API_KEY = env.LOVABLE_API_KEY ?? process.env.LOVABLE_API_KEY;
  const GOOGLE_DRIVE_API_KEY = env.GOOGLE_DRIVE_API_KEY ?? process.env.GOOGLE_DRIVE_API_KEY;
  if (!LOVABLE_API_KEY || !GOOGLE_DRIVE_API_KEY) {
    throw new Error("Google Drive não conectado");
  }
  const res = await fetch(`${GATEWAY}/files/${fileId}?alt=media`, {
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "X-Connection-Api-Key": GOOGLE_DRIVE_API_KEY,
    },
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Drive ${res.status}: ${txt.slice(0, 160)}`);
  }
  const buf = await res.arrayBuffer();
  if (buf.byteLength > MAX_INPUT_BYTES) {
    throw new Error(
      `Arquivo grande demais (${(buf.byteLength / 1_048_576).toFixed(1)}MB) — máx ${MAX_INPUT_BYTES / 1_048_576}MB no Worker. Reduza o reel ou ative Cloudflare Queues.`,
    );
  }
  return new Uint8Array(buf);
}

export async function buildVariantFor(
  queueId: string,
): Promise<{ ok: true; mediaKey: string } | { ok: false; error: string }> {
  if (!hasMedia()) {
    return { ok: false, error: "R2 'MEDIA' indisponível neste ambiente" };
  }
  const item = await db.getQueueItem(queueId);
  if (!item) return { ok: false, error: "queue_not_found" };
  if (item.variant_processed) {
    return { ok: true, mediaKey: item.media_key };
  }
  const sourceKey = item.original_media_key ?? item.media_key;
  if (!sourceKey.startsWith("drive:")) {
    await db.markVariantProcessed(item.id, {
      mediaKey: item.media_key,
      method: "skip-non-drive",
    });
    return { ok: true, mediaKey: item.media_key };
  }
  const driveId = sourceKey.slice("drive:".length);
  try {
    const raw = await downloadDrive(driveId);
    const seed = `${item.account_id}|${driveId}`;
    const variant = await variateMp4(raw, seed);
    const key = `variants/${driveId}/${item.account_id}.mp4`;
    await requireMedia().put(key, variant.bytes, {
      httpMetadata: { contentType: "video/mp4" },
      customMetadata: {
        accountId: item.account_id,
        driveId,
        queueId: item.id,
        method: "serverless",
        changes: JSON.stringify(variant.changes),
      },
    });
    await db.markVariantProcessed(item.id, {
      mediaKey: key,
      method: "serverless",
      originalMediaKey: sourceKey,
    });
    return { ok: true, mediaKey: key };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await db.markVariantFailed(item.id, msg);
    return { ok: false, error: msg };
  }
}
