// Build de variantes serverless (lógica pura — sem dependência de rota).
// Roda em Worker. Limites: 80MB input por arquivo.
//
// Método primário: servidor Oracle (ffmpeg reencoding via REENC_URL + REENC_SECRET).
// Fallback: variação serverless por metadados (mp4-variant.server.ts).

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

// Tenta reencoding via servidor Oracle (ffmpeg).
// Retorna os bytes do vídeo reprocessado ou null se o servidor não estiver configurado.
async function tryOracleReencode(
  videoBytes: Uint8Array,
  seed: string,
  env: Record<string, string | undefined>,
): Promise<Uint8Array | null> {
  const REENC_URL = env.REENC_URL ?? process.env.REENC_URL;
  const REENC_SECRET = env.REENC_SECRET ?? process.env.REENC_SECRET;
  if (!REENC_URL || !REENC_SECRET) return null;

  try {
    // Faz upload do vídeo como multipart para o servidor Oracle
    const blob = new Blob([videoBytes], { type: "video/mp4" });
    const form = new FormData();
    form.append("video", blob, "input.mp4");
    form.append("seed", seed);

    const res = await fetch(`${REENC_URL}/reencode`, {
      method: "POST",
      headers: {
        "x-secret": REENC_SECRET,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        seed,
        // Envia o vídeo como base64 para o servidor Oracle processar
        videoBase64: Buffer.from(videoBytes).toString("base64"),
      }),
      signal: AbortSignal.timeout(180_000), // 3 minutos
    });

    if (!res.ok) {
      console.warn(`[variant-builder] Oracle reencode falhou: ${res.status}`);
      return null;
    }

    const buf = await res.arrayBuffer();
    return new Uint8Array(buf);
  } catch (err) {
    console.warn(`[variant-builder] Oracle reencode erro: ${err}`);
    return null;
  }
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
    const env = await ensureEnv();

    // Tenta método primário: Oracle ffmpeg reencoding
    const oracleBytes = await tryOracleReencode(raw, seed, env as Record<string, string | undefined>);

    let finalBytes: Uint8Array;
    let method: string;
    let changes: object;

    if (oracleBytes) {
      // Aplica também a variação de metadados por cima do vídeo reencoded
      const variant = await variateMp4(oracleBytes, seed);
      finalBytes = variant.bytes;
      method = "oracle+serverless";
      changes = variant.changes;
    } else {
      // Fallback: só variação de metadados
      const variant = await variateMp4(raw, seed);
      finalBytes = variant.bytes;
      method = "serverless";
      changes = variant.changes;
    }

    const key = `variants/${driveId}/${item.account_id}.mp4`;
    await requireMedia().put(key, finalBytes, {
      httpMetadata: { contentType: "video/mp4" },
      customMetadata: {
        accountId: item.account_id,
        driveId,
        queueId: item.id,
        method,
        changes: JSON.stringify(changes),
      },
    });
    await db.markVariantProcessed(item.id, {
      mediaKey: key,
      method,
      originalMediaKey: sourceKey,
    });
    return { ok: true, mediaKey: key };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await db.markVariantFailed(item.id, msg);
    return { ok: false, error: msg };
  }
}
