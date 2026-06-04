// Build de variantes serverless (lógica pura — sem dependência de rota).
// Roda em Worker. Limites: 80MB input por arquivo.
//
// Método primário: servidor Oracle (ffmpeg reencoding via REENC_URL + REENC_SECRET).
// Fallback: variação serverless por metadados (mp4-variant.server.ts).
// Se tudo falhar, libera o item com a mídia original para a fila não parar.

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

// Converte Uint8Array para base64 sem usar Buffer (compatível com Cloudflare Workers)
function uint8ToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
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
  if (!REENC_URL || !REENC_SECRET) {
    console.warn("[variant-builder] REENC_URL ou REENC_SECRET não configurados — usando fallback");
    return null;
  }

  try {
    console.log(`[variant-builder] chamando Oracle: ${REENC_URL}`);
    const res = await fetch(`${REENC_URL}/reencode`, {
      method: "POST",
      headers: {
        "x-secret": REENC_SECRET,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        seed,
        videoBase64: uint8ToBase64(videoBytes),
      }),
      signal: AbortSignal.timeout(20_000),
    });

    if (!res.ok) {
      console.warn(`[variant-builder] Oracle reencode falhou: ${res.status}`);
      return null;
    }

    const buf = await res.arrayBuffer();
    console.log(`[variant-builder] Oracle reencode ok — ${buf.byteLength} bytes`);
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
      const variant = await variateMp4(oracleBytes, seed);
      finalBytes = variant.bytes;
      method = "oracle+serverless";
      changes = variant.changes;
    } else {
      const variant = await variateMp4(raw, seed);
      finalBytes = variant.bytes;
      method = "serverless";
      changes = variant.changes;
    }

    console.log(`[variant-builder] method=${method} queue=${queueId}`);

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
    await db.markVariantProcessed(item.id, {
      mediaKey: sourceKey,
      method: "original-fallback",
      originalMediaKey: sourceKey,
    });
    return { ok: true, mediaKey: sourceKey };
  }
}
