import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { db } from "@/lib/db.server";

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });

const EnqueueSchema = z.object({
  account_id: z.string(),
  caption: z.string().max(2200).default(""),
  media_type: z.enum(["REEL", "IMAGE", "STORY", "CAROUSEL"]),
  media_key: z.string().min(1),
  thumb_key: z.string().optional(),
  scheduled_at: z.string(), // ISO8601
});

export const Route = createFileRoute("/api/queue")({
  server: {
    handlers: {
      GET: async () => json({ queue: await db.listQueue() }),
      POST: async ({ request }) => {
        const body = EnqueueSchema.parse(await request.json());
        const id = crypto.randomUUID();
        await db.enqueue({ id, ...body, thumb_key: body.thumb_key ?? null });
        return json({ id }, 201);
      },
    },
  },
});
