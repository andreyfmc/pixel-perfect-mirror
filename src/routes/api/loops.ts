import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { db } from "@/lib/db.server";

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });

const CreateLoopSchema = z.object({
  source_type: z.enum(["snapshot", "live_folder"]),
  folder_id: z.string().optional().nullable(),
  folder_name: z.string().optional().nullable(),
  video_ids: z.array(z.string().min(1)).max(500).optional(),
  account_ids: z.array(z.string().min(1)).min(1).max(200),
  caption: z.string().max(2200).default(""),
  gap_min: z.number().int().min(1).max(24 * 60),
  jitter_min: z.number().int().min(0).max(120),
  order_mode: z.enum(["sequential", "random"]),
  next_cycle_at: z.string(), // ISO
});

export const Route = createFileRoute("/api/loops")({
  server: {
    handlers: {
      GET: async () => json({ loops: await db.listLoops() }),
      POST: async ({ request }) => {
        const body = CreateLoopSchema.parse(await request.json());
        if (body.source_type === "snapshot" && (!body.video_ids || body.video_ids.length === 0)) {
          return json({ error: "snapshot precisa de video_ids" }, 400);
        }
        if (body.source_type === "live_folder" && !body.folder_id) {
          return json({ error: "live_folder precisa de folder_id" }, 400);
        }
        const id = crypto.randomUUID();
        await db.createLoop({
          id,
          source_type: body.source_type,
          folder_id: body.folder_id ?? null,
          folder_name: body.folder_name ?? null,
          video_ids_json: body.video_ids ? JSON.stringify(body.video_ids) : null,
          account_ids_json: JSON.stringify(body.account_ids),
          caption: body.caption,
          gap_min: body.gap_min,
          jitter_min: body.jitter_min,
          order_mode: body.order_mode,
          next_cycle_at: body.next_cycle_at,
          status: "active",
        });
        return json({ id }, 201);
      },
    },
  },
});
