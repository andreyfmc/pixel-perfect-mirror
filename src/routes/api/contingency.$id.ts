import { createFileRoute } from "@tanstack/react-router";
import { requireDb } from "@/lib/cf.server";

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });

export const Route = createFileRoute("/api/contingency/$id")({
  server: {
    handlers: {
      DELETE: async ({ params }) => {
        await requireDb().prepare("DELETE FROM contingency WHERE id = ?").bind(params.id).run();
        return json({ ok: true });
      },
    },
  },
});
