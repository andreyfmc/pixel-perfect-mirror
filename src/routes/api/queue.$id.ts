import { createFileRoute } from "@tanstack/react-router";
import { db } from "@/lib/db.server";

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });

export const Route = createFileRoute("/api/queue/$id")({
  server: {
    handlers: {
      DELETE: async ({ params }) => {
        await db.deleteQueue(params.id);
        return json({ ok: true });
      },
    },
  },
});
