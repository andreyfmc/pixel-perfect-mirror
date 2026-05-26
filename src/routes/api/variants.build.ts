// Build de variantes serverless: baixa o original do Drive, aplica
// transformações binárias no MP4 e faz upload para o R2.
//
// Body (JSON): { queue_id: string }
// Resposta: { ok: true, media_key } | { ok: false, error }
//
// Importante: este endpoint é interno (chamado pela UI após enqueue e
// pelo cron tick). Não tem auth porque o domínio é compartilhado com
// outras rotas autenticadas; a segurança vem do queue_id ser opaco.

import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { db } from "@/lib/db.server";
import { ensureEnv, hasMedia, requireMedia } from "@/lib/cf.server";
import { variateMp4 } from "@/lib/mp4-variant.server";

const GATEWAY = "https://connector-gateway.lovable.dev/google_drive/drive/v3";
const MAX_INPUT_BYTES = 80 * 1024 * 1024; // 80MB — segurança vs limite de memória 128MB do Worker

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });

const Body = z.object({ queue_id: z.string().min(1).max(80) });

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

export async function buildVariantFor(queueId: string): Promise<{ ok: true; mediaKey: string } | { ok: false; error: string }> {
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
    // já é um upload R2 — marca como ok sem transformar
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

export const Route = createFileRoute("/api/variants/build")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: { queue_id: string };
        try {
          body = Body.parse(await request.json());
        } catch (err) {
          return json({ ok: false, error: `bad_request: ${err instanceof Error ? err.message : err}` }, 400);
        }
        const result = await buildVariantFor(body.queue_id);
        return json(result, result.ok ? 200 : 500);
      },
    },
  },
});
