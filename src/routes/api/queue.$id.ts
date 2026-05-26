import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { db } from "@/lib/db.server";

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });

const PatchSchema = z.object({
  status: z.enum(["scheduled", "processing", "published", "failed", "canceled"]),
});

export const Route = createFileRoute("/api/queue/$id")({
  server: {
    handlers: {
      PATCH: async ({ params, request }) => {
        const body = PatchSchema.parse(await request.json());
        await db.manualSetQueueStatus(params.id, body.status);
        return json({ ok: true });
      },
      DELETE: async ({ params }) => {
        await db.deleteQueue(params.id);
        return json({ ok: true });
      },
    },
  },
});
