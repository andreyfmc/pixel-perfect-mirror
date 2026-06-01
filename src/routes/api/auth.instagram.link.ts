// Gera um link OAuth único (state) para conectar uma conta Instagram.
// Seleciona automaticamente o app Meta com menos contas vinculadas (load balancing).
// O state é salvo na tabela `oauth_states` com expiração de 30 minutos,
// incluindo o meta_app_id escolhido para que o callback use as credenciais certas.

import { createFileRoute } from "@tanstack/react-router";
import { ensureEnv, env } from "@/lib/cf.server";
import { db } from "@/lib/db.server";
import { originFromRequest } from "@/lib/oauth.server";
import { getLeastLoadedApp } from "@/lib/meta-apps.server";
import { getInstagramClientId } from "@/lib/instagram.server";

const SCOPES = "instagram_business_basic,instagram_business_content_publish";

export const Route = createFileRoute("/api/auth/instagram/link")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          await ensureEnv();

          // Escolhe o app Instagram com menos contas (load balancing automático).
          // Fallback para variável de ambiente se não houver apps cadastrados.
          const app = await getLeastLoadedApp("instagram");
          const clientId = app?.client_id ?? getInstagramClientId();
          const metaAppId = app?.id ?? null;

          if (!clientId) {
            return Response.json(
              { error: "config", message: "Nenhum app Instagram configurado. Cadastre um app em Configurações > Apps Meta." },
              { status: 500 },
            );
          }

          const base = (env.PUBLIC_BASE_URL ?? originFromRequest(request)).replace(/\/$/, "");
          const redirectUri = `${base}/api/auth/instagram/callback`;
          const state = crypto.randomUUID();

          // Cria o state OAuth
          const { expiresAt } = await db.createOAuthState({
            state,
            redirectUri,
            ttlMinutes: 30,
          });

          // Grava o app escolhido no state para o callback usar as credenciais certas
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
            // Retorna qual app foi escolhido (útil para debug no frontend)
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
