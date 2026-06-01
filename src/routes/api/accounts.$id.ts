import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { db } from "@/lib/db.server";

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });

const PatchAccount = z.object({
  model_id: z.string().nullable().optional(),
  meta_app_id: z.string().nullable().optional(),
  role: z.enum(["active", "reserve", "discarded"]).optional(),
});

export const Route = createFileRoute("/api/accounts/$id")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const account = await db.getAccount(params.id);
        if (!account) return json({ error: "not_found" }, 404);
        return json({ account });
      },
      PATCH: async ({ params, request }) => {
        const body = PatchAccount.parse(await request.json());
        if (body.model_id !== undefined) {
          await db.setAccountModel(params.id, body.model_id ?? null);
        }
        if (body.role !== undefined) {
          await db.setAccountRole(params.id, body.role);
        }
        return json({ ok: true });
      },
      DELETE: async ({ params }) => {
        await db.deleteAccount(params.id);
        return json({ ok: true });
      },
    },
  },
});
