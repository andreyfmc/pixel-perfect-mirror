// GET  /api/meta-apps      — lista todos os apps (sem client_secret)
// POST /api/meta-apps      — cria novo app
// POST /api/meta-apps/redistribute — redistribui contas entre apps ativos
// POST /api/meta-apps/preview-redistribute — preview sem aplicar

import { createFileRoute } from "@tanstack/react-router";
import {
  listMetaApps,
  createMetaApp,
  redistributeAccounts,
  previewRedistribution,
} from "@/lib/meta-apps.server";

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export const Route = createFileRoute("/api/meta-apps")({
  server: {
    handlers: {
      GET: async () => {
        try {
          const apps = await listMetaApps();
          return json(apps);
        } catch (e) {
          return json({ error: (e as Error).message }, 500);
        }
      },

      POST: async ({ request }) => {
        try {
          const url = new URL(request.url);

          // Rotas de ação via POST com sufixo na query
          const action = url.searchParams.get("action");

          if (action === "redistribute") {
            const result = await redistributeAccounts();
            return json(result);
          }

          if (action === "preview-redistribute") {
            const result = await previewRedistribution();
            return json(result);
          }

          // Criação de novo app
          const body = (await request.json()) as {
            name?: string;
            client_id?: string;
            client_secret?: string;
            provider?: string;
            notes?: string;
          };

          if (!body.name || !body.client_id || !body.client_secret) {
            return json({ error: "name, client_id e client_secret são obrigatórios" }, 400);
          }

          const provider =
            body.provider === "instagram" || body.provider === "facebook"
              ? body.provider
              : "facebook";

          const app = await createMetaApp({
            name: body.name,
            client_id: body.client_id,
            client_secret: body.client_secret,
            provider,
            notes: body.notes,
          });

          return json(app, 201);
        } catch (e) {
          return json({ error: (e as Error).message }, 500);
        }
      },
    },
  },
});
