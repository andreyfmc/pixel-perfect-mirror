import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { db } from "@/lib/db.server";

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });

const PatchSchema = z.object({
  status: z.enum(["active", "paused", "stopped"]).optional(),
  cancel_pending: z.boolean().optional(),
});

export const Route = createFileRoute("/api/loops/$id")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const loop = await db.getLoop(params.id);
        if (!loop) return json({ error: "not_found" }, 404);
        return json({ loop });
      },
      PATCH: async ({ params, request }) => {
        const body = PatchSchema.parse(await request.json());
        if (body.status) {
          await db.setLoopStatus(params.id, body.status, null);
        }
        let canceled = 0;
        if (body.cancel_pending || body.status === "stopped" || body.status === "paused") {
          canceled = await db.cancelPendingForLoop(params.id);
        }
        return json({ ok: true, canceled });
      },
      DELETE: async ({ params }) => {
        await db.setLoopStatus(params.id, "stopped", null);
        const canceled = await db.cancelPendingForLoop(params.id);
        return json({ ok: true, canceled });
      },
    },
  },
});
