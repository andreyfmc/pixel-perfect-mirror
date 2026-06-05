import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { requireDb } from "@/lib/cf.server";
import type { WarmupPhase } from "@/lib/warmup.server";

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });

const PhaseSchema = z.object({
  label: z.string().optional(),
  postsPerBatch: z.number().int().min(1).max(100),
  pauseHours: z.number().min(0.5).max(72),
  totalPosts: z.number().int().min(0).max(10000),
});

const CreatePlanSchema = z.object({
  name: z.string().min(1).max(100),
  phases: z.array(PhaseSchema).min(1).max(20),
  account_ids: z.array(z.string()).min(1).max(200),
  source_type: z.enum(["snapshot", "live_folder"]),
  folder_id: z.string().optional().nullable(),
  folder_name: z.string().optional().nullable(),
  video_ids: z.array(z.string()).optional().nullable(),
  caption: z.string().max(2200).default(""),
  order_mode: z.enum(["sequential", "random"]).default("random"),
  auto_advance: z.boolean().default(false),
  start_at: z.string().optional(), // ISO — quando iniciar o primeiro lote
});

export const Route = createFileRoute("/api/warmup-plans")({
  server: {
    handlers: {
      GET: async () => {
        const d = requireDb();
        const result = await d
          .prepare(
            `SELECT * FROM warmup_plans ORDER BY created_at DESC LIMIT 100`,
          )
          .all();
        return json({ plans: result.results ?? [] });
      },

      POST: async ({ request }) => {
        const body = CreatePlanSchema.parse(await request.json());

        if (body.source_type === "snapshot" && (!body.video_ids || body.video_ids.length === 0)) {
          return json({ error: "snapshot precisa de video_ids" }, 400);
        }
        if (body.source_type === "live_folder" && !body.folder_id) {
          return json({ error: "live_folder precisa de folder_id" }, 400);
        }

        const id = crypto.randomUUID();
        const startAt = body.start_at ?? new Date().toISOString();

        await requireDb()
          .prepare(
            `INSERT INTO warmup_plans
              (id, name, phases_json, current_phase, posts_done_in_phase, posts_done_total,
               account_ids_json, source_type, folder_id, folder_name, video_ids_json,
               caption, order_mode, auto_advance, status, batch_due_at, video_cursor)
             VALUES (?,?,?,0,0,0,?,?,?,?,?,?,?,?,?,?,0)`,
          )
          .bind(
            id,
            body.name,
            JSON.stringify(body.phases as WarmupPhase[]),
            JSON.stringify(body.account_ids),
            body.source_type,
            body.folder_id ?? null,
            body.folder_name ?? null,
            body.video_ids ? JSON.stringify(body.video_ids) : null,
            body.caption,
            body.order_mode,
            body.auto_advance ? 1 : 0,
            "active",
            startAt,
          )
          .run();

        return json({ id }, 201);
      },
    },
  },
});
