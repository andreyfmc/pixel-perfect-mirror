// Endpoint: dispara build de variante serverless para um item da fila.
// Body (JSON): { queue_id: string }

import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { buildVariantFor } from "@/lib/variant-builder.server";

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });

const Body = z.object({ queue_id: z.string().min(1).max(80) });

export const Route = createFileRoute("/api/variants/build")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: { queue_id: string };
        try {
          body = Body.parse(await request.json());
        } catch (err) {
          return json(
            { ok: false, error: `bad_request: ${err instanceof Error ? err.message : err}` },
            400,
          );
        }
        const result = await buildVariantFor(body.queue_id);
        return json(result, result.ok ? 200 : 500);
      },
    },
  },
});
