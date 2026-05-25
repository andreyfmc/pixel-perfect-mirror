import { createFileRoute } from "@tanstack/react-router";
import { db } from "@/lib/db.server";

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });

export const Route = createFileRoute("/api/accounts/$id")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const account = await db.getAccount(params.id);
        if (!account) return json({ error: "not_found" }, 404);
        return json({ account });
      },
      DELETE: async ({ params }) => {
        await db.deleteAccount(params.id);
        return json({ ok: true });
      },
    },
  },
});
