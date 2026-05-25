import { createFileRoute } from "@tanstack/react-router";
import { db } from "@/lib/db.server";

export const Route = createFileRoute("/api/history")({
  server: {
    handlers: {
      GET: async () => {
        const history = await db.listHistory();
        return new Response(JSON.stringify({ history }), {
          headers: { "content-type": "application/json" },
        });
      },
    },
  },
});
