// Endpoint manual de cron — útil para acionar o scheduler em dev/preview.
// Em produção quem chama é o Cron Trigger via src/server.ts.
// Proteja com CRON_SECRET: `curl -H "x-cron-secret: ..." https://.../api/cron/tick`

import { createFileRoute } from "@tanstack/react-router";
import { runScheduler } from "@/lib/scheduler.server";
import { env } from "@/lib/cf.server";

export const Route = createFileRoute("/api/cron/tick")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = env.CRON_SECRET;
        if (secret && request.headers.get("x-cron-secret") !== secret) {
          return new Response("forbidden", { status: 403 });
        }
        const result = await runScheduler();
        return new Response(JSON.stringify(result), {
          headers: { "content-type": "application/json" },
        });
      },
    },
  },
});
