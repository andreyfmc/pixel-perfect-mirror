// PATCH /api/meta-apps/:id — atualiza nome, secret, notes, is_active
// DELETE /api/meta-apps/:id — deleta app (bloqueia se tiver contas vinculadas)

import { createFileRoute } from "@tanstack/react-router";
import {
  updateMetaApp,
  deleteMetaApp,
  assignAppToAccount,
  listMetaApps,
} from "@/lib/meta-apps.server";

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export const Route = createFileRoute("/api/meta-apps/$id")({
  server: {
    handlers: {
      PATCH: async ({ request, params }) => {
        try {
          const body = (await request.json()) as {
            name?: string;
            client_secret?: string;
            notes?: string;
            is_active?: number;
            // Atribuir conta específica a este app
            assign_account_id?: string;
          };

          // Ação especial: vincular uma conta a este app
          if (body.assign_account_id) {
            await assignAppToAccount(body.assign_account_id, params.id);
            const apps = await listMetaApps();
            const updated = apps.find((a) => a.id === params.id);
            return json(updated ?? { id: params.id });
          }

          const updated = await updateMetaApp(params.id, {
            name: body.name,
            client_secret: body.client_secret,
            notes: body.notes,
            is_active: body.is_active,
          });
          return json(updated);
        } catch (e) {
          return json({ error: (e as Error).message }, 500);
        }
      },

      DELETE: async ({ params }) => {
        try {
          const result = await deleteMetaApp(params.id);
          if (!result.ok) {
            return json(result, 409); // Conflict
          }
          return json({ ok: true });
        } catch (e) {
          return json({ error: (e as Error).message }, 500);
        }
      },
    },
  },
});
