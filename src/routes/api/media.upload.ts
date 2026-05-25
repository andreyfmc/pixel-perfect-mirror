// Upload de mídia direto para o R2.
// Body: arquivo binário. Headers: content-type + x-filename.

import { createFileRoute } from "@tanstack/react-router";
import { requireMedia } from "@/lib/cf.server";

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });

export const Route = createFileRoute("/api/media/upload")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const filename = request.headers.get("x-filename") ?? "upload.bin";
        const contentType = request.headers.get("content-type") ?? "application/octet-stream";
        const body = await request.arrayBuffer();
        if (!body.byteLength) return json({ error: "empty_body" }, 400);
        if (body.byteLength > 100 * 1024 * 1024) return json({ error: "too_large" }, 413);

        const safe = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
        const now = new Date();
        const key = `media/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}/${crypto.randomUUID()}-${safe}`;

        await requireMedia().put(key, body, { httpMetadata: { contentType } });
        return json({ key }, 201);
      },
    },
  },
});
