// Gera um link OAuth único (state) para conectar uma conta Instagram que já é
// Testadora do app Meta (modo desenvolvimento). O state é salvo na tabela
// `oauth_states` com expiração de 30 minutos e marcado como consumed após o
// callback bem-sucedido.

import { createFileRoute } from "@tanstack/react-router";
import { ensureEnv, env } from "@/lib/cf.server";
import { db } from "@/lib/db.server";
import { getInstagramClientId } from "@/lib/instagram.server";
import { originFromRequest } from "@/lib/oauth.server";

const SCOPES = "instagram_business_basic,instagram_business_content_publish";

export const Route = createFileRoute("/api/auth/instagram/link")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          await ensureEnv();
          const clientId = getInstagramClientId();
          if (!clientId) {
            return Response.json(
              { error: "config", message: "META_IG_APP_ID não configurado" },
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
          const url = new URL("https://www.instagram.com/oauth/authorize");
          url.searchParams.set("client_id", clientId);
          url.searchParams.set("redirect_uri", redirectUri);
          url.searchParams.set("scope", SCOPES);
          url.searchParams.set("response_type", "code");
          url.searchParams.set("state", state);
          return Response.json({ url: url.toString(), state, expiresAt });
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
