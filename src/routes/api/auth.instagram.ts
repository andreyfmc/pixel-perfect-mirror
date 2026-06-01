import { createFileRoute } from "@tanstack/react-router";
import { buildAuthUrl } from "@/lib/oauth.server";
import { ensureEnv } from "@/lib/cf.server";
import { db } from "@/lib/db.server";

export const Route = createFileRoute("/api/auth/instagram")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const provider = (url.searchParams.get("provider") ?? "instagram") as
          | "instagram"
          | "facebook";
        // appId opcional — se passado, força uso desse app específico
        const requestedAppId = url.searchParams.get("app_id") ?? null;
        const state = crypto.randomUUID();
        try {
          await ensureEnv();
          const { url: authUrl, meta_app_id } = await buildAuthUrl(
            request,
            provider,
            state,
            requestedAppId,
          );

          // Persiste o meta_app_id no estado OAuth para recuperar no callback
          if (meta_app_id) {
            await db.updateOAuthStateMeta(state, meta_app_id).catch(() => {
              // Se a coluna ainda não existir (migração pendente), não bloqueia
              console.warn("[auth.instagram] Não foi possível salvar meta_app_id no state");
            });
          }

          return new Response(JSON.stringify({ url: authUrl, state, meta_app_id }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        } catch (e) {
          return new Response(
            JSON.stringify({ error: "config", message: (e as Error).message }),
            { status: 500, headers: { "content-type": "application/json" } },
          );
        }
      },
    },
  },
});
