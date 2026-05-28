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
        const url = new URL(request.url);
        const baseUrl = `${url.protocol}//${url.host}`;
        try {
          const result = await runScheduler(new Date(), { baseUrl });
          return new Response(
            JSON.stringify({
              ...result,
              timestamp: new Date().toISOString(),
              queueDue: (result.processed ?? 0) + (result.errors ?? 0),
            }),
            { headers: { "content-type": "application/json" } },
          );
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          const stack = err instanceof Error ? err.stack : undefined;
          console.error("[cron.tick] runScheduler threw", message, stack);
          return new Response(
            JSON.stringify({
              processed: 0,
              errors: 1,
              error: message,
              stack: stack?.split("\n").slice(0, 5).join("\n"),
            }),
            {
              status: 500,
              headers: { "content-type": "application/json" },
            },
          );
        }
      },
    },
  },
});
