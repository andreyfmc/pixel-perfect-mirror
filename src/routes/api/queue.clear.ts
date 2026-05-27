import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { db } from "@/lib/db.server";

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });

const Schema = z.union([
  z.object({
    statuses: z
      .array(z.enum(["scheduled", "processing", "published", "failed", "canceled"]))
      .min(1)
      .max(5),
  }),
  z.object({
    mode: z.literal("published_before_today"),
  }),
]);

export const Route = createFileRoute("/api/queue/clear")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = Schema.parse(await request.json());
        if ("mode" in body) {
          const removed = await db.clearPublishedBeforeToday();
          return json({ ok: true, removed });
        }
        const removed = await db.clearQueueByStatuses(body.statuses);
        return json({ ok: true, removed });
      },
    },
  },
});
