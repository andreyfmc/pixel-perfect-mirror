// Callback do fluxo OAuth de link único.
// Valida o state, troca code → token curto → token longo, busca perfil e
// salva a conta. Redireciona para /accounts?connected=@username em caso
// de sucesso, ou devolve uma página de erro clara.
//
// ATUALIZADO: lê meta_app_id do oauth_state e usa o app correto para trocar o code.

import { createFileRoute } from "@tanstack/react-router";
import { ensureEnv } from "@/lib/cf.server";
import { db } from "@/lib/db.server";
import { resolveAppCredentials } from "@/lib/oauth.server";

function errorPage(title: string, message: string): Response {
  const html = `<!doctype html><meta charset="utf-8"><title>${title}</title>
<body style="font-family:system-ui;background:#0b0b0f;color:#eaeaf0;display:grid;place-items:center;height:100vh;margin:0">
<div style="max-width:420px;text-align:center;padding:24px;border:1px solid #2a2a35;border-radius:12px;background:#13131a">
<div style="font-size:18px;font-weight:600;margin-bottom:8px">${title}</div>
<div style="font-size:13px;opacity:.8;line-height:1.5">${message}</div>
<a href="/accounts" style="display:inline-block;margin-top:18px;padding:8px 14px;border-radius:8px;background:#7c3aed;color:#fff;text-decoration:none;font-size:13px">Voltar para Contas</a>
</div></body>`;
  return new Response(html, {
    status: 400,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

async function exchangeCodeForShortToken(input: {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  code: string;
}): Promise<{ accessToken: string; userId: string }> {
  const body = new URLSearchParams({
    client_id: input.clientId,
    client_secret: input.clientSecret,
    grant_type: "authorization_code",
    redirect_uri: input.redirectUri,
    code: input.code,
  });
  const r = await fetch("https://api.instagram.com/oauth/access_token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  const j = (await r.json()) as { access_token?: string; user_id?: string | number };
  if (!r.ok || !j.access_token) throw new Error(`short_token: ${JSON.stringify(j)}`);
  return { accessToken: j.access_token, userId: String(j.user_id ?? "") };
}

async function exchangeForLongToken(input: {
  appSecret: string;
  shortToken: string;
}): Promise<{ accessToken: string; expiresIn: number }> {
  // A Meta só aceita app_secret (não client_id/client_secret) neste endpoint
  const u = new URL("https://graph.instagram.com/access_token");
  u.searchParams.set("grant_type", "ig_exchange_token");
  u.searchParams.set("client_secret", input.appSecret);
  u.searchParams.set("access_token", input.shortToken);
  const r = await fetch(u);
  const j = (await r.json()) as { access_token?: string; expires_in?: number };
  if (!r.ok || !j.access_token) throw new Error(`long_token: ${JSON.stringify(j)}`);
  return { accessToken: j.access_token, expiresIn: j.expires_in ?? 60 * 24 * 3600 };
}

async function fetchProfile(token: string): Promise<{
  igUserId: string;
  username: string;
  profilePicture: string;
}> {
  const u = new URL("https://graph.instagram.com/me");
  u.searchParams.set("fields", "id,username,profile_picture_url,account_type");
  u.searchParams.set("access_token", token);
  const r = await fetch(u);
  const j = (await r.json()) as {
    id?: string;
    username?: string;
    profile_picture_url?: string;
  };
  if (!r.ok || !j.username) throw new Error(`profile: ${JSON.stringify(j)}`);
  return {
    igUserId: String(j.id ?? ""),
    username: j.username,
    profilePicture: j.profile_picture_url ?? "",
  };
}

export const Route = createFileRoute("/api/auth/instagram/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        const oauthError =
          url.searchParams.get("error_description") ?? url.searchParams.get("error");
        if (oauthError) {
          return errorPage("Autorização cancelada", oauthError);
        }
        if (!code || !state) {
          return errorPage("Link inválido", "Faltam parâmetros code/state na URL.");
        }
        try {
          await ensureEnv();

          // Valida e consome o state OAuth
          const stateRow = await db.takeOAuthState(state);
          if (!stateRow.ok) {
            return errorPage(
              "Link expirado ou já utilizado",
              "Este link de conexão não é mais válido. Gere um novo link no painel e tente de novo.",
            );
          }

          // Recupera o meta_app_id gravado no state (pode ser null em contas antigas)
          const metaAppId = await db.getOAuthStateMeta(state).catch(() => null);

          // Resolve credenciais do app: usa o app do state, ou o menos carregado, ou env
          const creds = await resolveAppCredentials("instagram", metaAppId);

          const redirectUriUsed = stateRow.redirectUri!;

          const short = await exchangeCodeForShortToken({
            clientId: creds.client_id,
            clientSecret: creds.client_secret,
            redirectUri: redirectUriUsed,
            code,
          });
          const long = await exchangeForLongToken({
            appSecret: creds.client_secret,
            shortToken: short.accessToken,
          });
          const profile = await fetchProfile(long.accessToken);
          const expiresAt = new Date(Date.now() + long.expiresIn * 1000).toISOString();

          await db.createAccount({
            id: crypto.randomUUID(),
            username: profile.username,
            name: profile.username,
            profile_picture: profile.profilePicture,
            ig_user_id: profile.igUserId || short.userId,
            access_token: long.accessToken,
            token_expires_at: expiresAt,
            provider: "instagram",
            followers: 0,
            health_score: 90,
            // Vincula ao app usado neste fluxo OAuth
            meta_app_id: creds.app_id.startsWith("env-") ? undefined : creds.app_id,
          } as Parameters<typeof db.createAccount>[0]);

          return new Response(null, {
            status: 302,
            headers: {
              location: `/accounts?connected=${encodeURIComponent("@" + profile.username)}`,
            },
          });
        } catch (e) {
          const msg = (e as Error).message ?? "Erro desconhecido";
          return errorPage("Falha ao conectar", msg);
        }
      },
    },
  },
});
