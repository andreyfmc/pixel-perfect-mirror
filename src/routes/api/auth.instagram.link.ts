// Gera um link OAuth único (state) para conectar uma conta Instagram.
// Aceita meta_app_id opcional no body — se informado, usa aquele app.
// Se não informado, seleciona automaticamente o app com menos contas.

import { createFileRoute } from "@tanstack/react-router";
import { ensureEnv, env } from "@/lib/cf.server";
import { db } from "@/lib/db.server";
import { originFromRequest } from "@/lib/oauth.server";
import { getLeastLoadedApp, getMetaAppById } from "@/lib/meta-apps.server";
import { getInstagramClientId } from "@/lib/instagram.server";

const SCOPES = "instagram_business_basic,instagram_business_content_publish";

export const Route = createFileRoute("/api/auth/instagram/link")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          await ensureEnv();

          // Lê meta_app_id opcional do body
          let requestedAppId: string | null = null;
          try {
            const body = await request.json() as { meta_app_id?: string };
            requestedAppId = body.meta_app_id ?? null;
          } catch {
            // body vazio ou não-JSON: tudo bem, usa automático
          }

          // Resolve o app a usar: explícito → automático (menor carga) → env
          let clientId: string | null = null;
          let metaAppId: string | null = null;

          if (requestedAppId) {
            const app = await getMetaAppById(requestedAppId);
            if (app && app.is_active) {
              clientId = app.client_id;
              metaAppId = app.id;
            }
          }

          if (!clientId) {
            const app = await getLeastLoadedApp("instagram");
            if (app) {
              clientId = app.client_id;
              metaAppId = app.id;
            }
          }

          if (!clientId) {
            clientId = getInstagramClientId() ?? null;
          }

          if (!clientId) {
            return Response.json(
              { error: "config", message: "Nenhum app Instagram configurado. Cadastre um app em Configurações > Apps Meta." },
              { status: 500 },
            );
          }

          const base = (env.PUBLIC_BASE_URL ?? originFromRequest(request)).replace(/\/$/, "");
          const redirectUri = `${base}/api/auth/instagram/callback`;
          const state = crypto.randomUUID();

          const { expiresAt } = await db.createOAuthState({
            state,
            redirectUri,
            ttlMinutes: 30,
          });

          if (metaAppId) {
            await db.updateOAuthStateMeta(state, metaAppId);
          }

          const url = new URL("https://www.instagram.com/oauth/authorize");
          url.searchParams.set("client_id", clientId);
          url.searchParams.set("redirect_uri", redirectUri);
          url.searchParams.set("scope", SCOPES);
          url.searchParams.set("response_type", "code");
          url.searchParams.set("state", state);

          return Response.json({
            url: url.toString(),
            state,
            expiresAt,
            meta_app_id: metaAppId,
          });
        } catch (e) {
          return Response.json(
            { error: "internal", message: (e as Error).message },
            { status: 500 },
          );
        }
      },
    },
  },
});
