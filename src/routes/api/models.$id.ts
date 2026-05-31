import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { db } from "@/lib/db.server";

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });

const PatchModel = z.object({
  name: z.string().min(1).max(80).optional(),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
});

export const Route = createFileRoute("/api/models/$id")({
  server: {
    handlers: {
      PATCH: async ({ params, request }) => {
        const body = PatchModel.parse(await request.json());
        await db.updateModel(params.id, body);
        return json({ ok: true });
      },
      DELETE: async ({ params }) => {
        await db.deleteModel(params.id);
        return json({ ok: true });
      },
    },
  },
});
