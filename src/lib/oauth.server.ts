// Helpers para OAuth da Meta (Facebook Login + Instagram Login direto).
// Server-only: o sufixo .server.ts impede inclusão no bundle do cliente.
//
// ATUALIZADO: suporte a múltiplos apps Meta via meta-apps.server.ts
// Cada fluxo OAuth usa o app menos carregado do provider correto.
// Fallback para env quando não há apps cadastrados (retrocompatibilidade).

import { env } from "./cf.server";
import { db } from "./db.server";
import { getInstagramClientId, getInstagramClientSecret } from "./instagram.server";
import {
  getLeastLoadedApp,
  getMetaAppById,
  type MetaAppCredentials,
} from "./meta-apps.server";

export type Provider = "facebook" | "instagram";

const FB_DIALOG = "https://www.facebook.com/v21.0/dialog/oauth";
const FB_GRAPH = "https://graph.facebook.com/v21.0";

const IG_DIALOG = "https://www.instagram.com/oauth/authorize";
const IG_TOKEN = "https://api.instagram.com/oauth/access_token";
const IG_GRAPH = "https://graph.instagram.com";

export const FB_SCOPES = [
  "instagram_basic",
  "instagram_content_publish",
  "pages_show_list",
  "pages_read_engagement",
  "business_management",
].join(",");

export const IG_SCOPES = [
  "instagram_business_basic",
  "instagram_business_content_publish",
  "instagram_business_manage_comments",
  "instagram_business_manage_messages",
].join(",");

export function originFromRequest(req: Request): string {
  if (env.PUBLIC_BASE_URL) return env.PUBLIC_BASE_URL.replace(/\/$/, "");
  const url = new URL(req.url);
  return `${url.protocol}//${url.host}`;
}

export function redirectUri(req: Request, provider: Provider): string {
  const path = provider === "facebook" ? "/api/auth/callback" : "/api/auth/callback-ig";
  return originFromRequest(req) + path;
}

// ─────────────────────────────────────────────
// Resolução de credenciais do app
// ─────────────────────────────────────────────

/** Resolve as credenciais corretas para iniciar um fluxo OAuth.
 *  Prioridade: app menos carregado no banco → fallback para env. */
export async function resolveAppCredentials(
  provider: Provider,
  appId?: string | null,
): Promise<MetaAppCredentials & { fromEnv: boolean }> {
  // Se um appId específico foi solicitado, usa ele
  if (appId) {
    const app = await getMetaAppById(appId);
    if (app && app.is_active) {
      return {
        app_id: app.id,
        client_id: app.client_id,
        client_secret: app.client_secret,
        provider: app.provider,
        fromEnv: false,
      };
    }
  }

  // Busca o app ativo com menos contas para este provider
  const app = await getLeastLoadedApp(provider);
  if (app) {
    return {
      app_id: app.id,
      client_id: app.client_id,
      client_secret: app.client_secret,
      provider: app.provider,
      fromEnv: false,
    };
  }

  // Fallback: env (retrocompatibilidade)
  if (provider === "instagram") {
    const clientId = getInstagramClientId();
    const clientSecret = getInstagramClientSecret();
    if (!clientId || !clientSecret) {
      throw new Error("META_IG_APP_ID/META_IG_APP_SECRET não configurados e nenhum app cadastrado");
    }
    return {
      app_id: "env-instagram",
      client_id: clientId,
      client_secret: clientSecret,
      provider: "instagram",
      fromEnv: true,
    };
  }

  const appIdEnv = env.META_APP_ID;
  const appSecret = env.META_APP_SECRET;
  if (!appIdEnv || !appSecret) {
    throw new Error("META_APP_ID/META_APP_SECRET não configurados e nenhum app cadastrado");
  }
  return {
    app_id: "env-facebook",
    client_id: appIdEnv,
    client_secret: appSecret,
    provider: "facebook",
    fromEnv: true,
  };
}

// ─────────────────────────────────────────────
// Construção das URLs de autorização
// ─────────────────────────────────────────────

export async function buildAuthUrl(
  req: Request,
  provider: Provider,
  state: string,
  appId?: string | null,
): Promise<{ url: string; meta_app_id: string | null }> {
  const creds = await resolveAppCredentials(provider, appId);

  if (provider === "facebook") {
    const u = new URL(FB_DIALOG);
    u.searchParams.set("client_id", creds.client_id);
    u.searchParams.set("redirect_uri", redirectUri(req, "facebook"));
    u.searchParams.set("state", state);
    u.searchParams.set("scope", FB_SCOPES);
    u.searchParams.set("response_type", "code");
    return {
      url: u.toString(),
      meta_app_id: creds.fromEnv ? null : creds.app_id,
    };
  }

  const u = new URL(IG_DIALOG);
  u.searchParams.set("client_id", creds.client_id);
  u.searchParams.set("redirect_uri", redirectUri(req, "instagram"));
  u.searchParams.set("scope", IG_SCOPES);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("state", state);
  return {
    url: u.toString(),
    meta_app_id: creds.fromEnv ? null : creds.app_id,
  };
}

// ─────────────────────────────────────────────
// Facebook Login → Instagram Business
// ─────────────────────────────────────────────

async function fbExchangeCode(
  req: Request,
  code: string,
  creds: MetaAppCredentials,
): Promise<string> {
  const u = new URL(`${FB_GRAPH}/oauth/access_token`);
  u.searchParams.set("client_id", creds.client_id);
  u.searchParams.set("client_secret", creds.client_secret);
  u.searchParams.set("redirect_uri", redirectUri(req, "facebook"));
  u.searchParams.set("code", code);
  const r = await fetch(u);
  const j = (await r.json()) as { access_token?: string; error?: unknown };
  if (!r.ok || !j.access_token) throw new Error(`fb token: ${JSON.stringify(j)}`);
  return j.access_token;
}

async function fbLongLived(
  token: string,
  creds: MetaAppCredentials,
): Promise<{ token: string; expiresIn: number }> {
  const u = new URL(`${FB_GRAPH}/oauth/access_token`);
  u.searchParams.set("grant_type", "fb_exchange_token");
  u.searchParams.set("client_id", creds.client_id);
  u.searchParams.set("client_secret", creds.client_secret);
  u.searchParams.set("fb_exchange_token", token);
  const r = await fetch(u);
  const j = (await r.json()) as { access_token?: string; expires_in?: number };
  if (!r.ok || !j.access_token) throw new Error(`fb long: ${JSON.stringify(j)}`);
  return { token: j.access_token, expiresIn: j.expires_in ?? 60 * 24 * 3600 };
}

type IgBizAccount = {
  igUserId: string;
  username: string;
  name: string;
  profilePicture: string;
  followers: number;
  pageId: string;
};

async function fbListIgAccounts(userToken: string): Promise<IgBizAccount[]> {
  const u = new URL(`${FB_GRAPH}/me/accounts`);
  u.searchParams.set("access_token", userToken);
  u.searchParams.set("fields", "id,name,access_token,instagram_business_account");
  const r = await fetch(u);
  const j = (await r.json()) as {
    data?: Array<{
      id: string;
      name: string;
      access_token: string;
      instagram_business_account?: { id: string };
    }>;
  };
  if (!r.ok) throw new Error(`fb pages: ${JSON.stringify(j)}`);
  const out: IgBizAccount[] = [];
  for (const p of j.data ?? []) {
    if (!p.instagram_business_account) continue;
    const igId = p.instagram_business_account.id;
    const igU = new URL(`${FB_GRAPH}/${igId}`);
    igU.searchParams.set("access_token", p.access_token);
    igU.searchParams.set("fields", "id,username,name,profile_picture_url,followers_count");
    const ir = await fetch(igU);
    const ij = (await ir.json()) as {
      id: string;
      username: string;
      name?: string;
      profile_picture_url?: string;
      followers_count?: number;
    };
    if (!ir.ok) continue;
    out.push({
      igUserId: ij.id,
      username: ij.username,
      name: ij.name ?? ij.username,
      profilePicture: ij.profile_picture_url ?? "",
      followers: ij.followers_count ?? 0,
      pageId: p.id,
    });
  }
  return out;
}

export async function handleFacebookCallback(
  req: Request,
  code: string,
  metaAppId?: string | null,
) {
  const creds = await resolveAppCredentials("facebook", metaAppId);
  const userToken = await fbExchangeCode(req, code, creds);
  const long = await fbLongLived(userToken, creds);
  const igs = await fbListIgAccounts(long.token);
  if (!igs.length) {
    return {
      saved: [] as string[],
      error: "Nenhuma conta Instagram Business vinculada às suas Páginas.",
    };
  }
  const saved: string[] = [];
  const expiresAt = new Date(Date.now() + long.expiresIn * 1000).toISOString();
  for (const ig of igs) {
    const id = crypto.randomUUID();
    await db.createAccount({
      id,
      username: ig.username,
      name: ig.name,
      profile_picture: ig.profilePicture,
      ig_user_id: ig.igUserId,
      access_token: long.token,
      token_expires_at: expiresAt,
      provider: "facebook",
      followers: ig.followers,
      health_score: 90,
      meta_app_id: creds.fromEnv ? undefined : creds.app_id,
    } as Parameters<typeof db.createAccount>[0]);
    saved.push(ig.username);
  }
  return { saved, error: null as string | null };
}

// ─────────────────────────────────────────────
// Instagram Login direto
// ─────────────────────────────────────────────

async function igExchangeCode(
  req: Request,
  code: string,
  creds: MetaAppCredentials,
) {
  const body = new URLSearchParams({
    client_id: creds.client_id,
    client_secret: creds.client_secret,
    grant_type: "authorization_code",
    redirect_uri: redirectUri(req, "instagram"),
    code,
  });
  const r = await fetch(IG_TOKEN, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  const j = (await r.json()) as { access_token?: string; user_id?: string | number };
  if (!r.ok || !j.access_token) throw new Error(`ig token: ${JSON.stringify(j)}`);
  return { token: j.access_token, userId: String(j.user_id ?? "") };
}

async function igLongLived(shortToken: string, creds: MetaAppCredentials) {
  const u = new URL(`${IG_GRAPH}/access_token`);
  u.searchParams.set("grant_type", "ig_exchange_token");
  u.searchParams.set("client_id", creds.client_id);
  u.searchParams.set("client_secret", creds.client_secret);
  u.searchParams.set("access_token", shortToken);
  const r = await fetch(u);
  const j = (await r.json()) as { access_token?: string; expires_in?: number };
  if (!r.ok || !j.access_token) throw new Error(`ig long: ${JSON.stringify(j)}`);
  return { token: j.access_token, expiresIn: j.expires_in ?? 60 * 24 * 3600 };
}

async function igFetchProfile(token: string) {
  const u = new URL(`${IG_GRAPH}/v21.0/me`);
  u.searchParams.set("access_token", token);
  u.searchParams.set(
    "fields",
    "user_id,username,name,profile_picture_url,followers_count,account_type",
  );
  const r = await fetch(u);
  const j = (await r.json()) as {
    user_id?: string | number;
    username?: string;
    name?: string;
    profile_picture_url?: string;
    followers_count?: number;
  };
  if (!r.ok || !j.username) throw new Error(`ig me: ${JSON.stringify(j)}`);
  return {
    igUserId: String(j.user_id ?? ""),
    username: j.username,
    name: j.name ?? j.username,
    profilePicture: j.profile_picture_url ?? "",
    followers: j.followers_count ?? 0,
  };
}

export async function handleInstagramCallback(
  req: Request,
  code: string,
  metaAppId?: string | null,
) {
  const creds = await resolveAppCredentials("instagram", metaAppId);
  const short = await igExchangeCode(req, code, creds);
  const long = await igLongLived(short.token, creds);
  const profile = await igFetchProfile(long.token);
  const id = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + long.expiresIn * 1000).toISOString();
  await db.createAccount({
    id,
    username: profile.username,
    name: profile.name,
    profile_picture: profile.profilePicture,
    ig_user_id: profile.igUserId || short.userId,
    access_token: long.token,
    token_expires_at: expiresAt,
    provider: "instagram",
    followers: profile.followers,
    health_score: 90,
    meta_app_id: creds.fromEnv ? undefined : creds.app_id,
  } as Parameters<typeof db.createAccount>[0]);
  return { saved: [profile.username], error: null as string | null };
}

// ─────────────────────────────────────────────
// Resposta HTML do popup
// ─────────────────────────────────────────────

export function popupResponseHtml(payload: Record<string, unknown>): Response {
  const json = JSON.stringify(payload).replace(/</g, "\\u003c");
  const html = `<!doctype html><meta charset="utf-8"><title>Conectando…</title>
<body style="font-family:system-ui;background:#0b0b0f;color:#eaeaf0;display:grid;place-items:center;height:100vh;margin:0">
<div style="text-align:center"><div style="font-size:14px;opacity:.8">Conexão concluída. Você pode fechar esta janela.</div></div>
<script>
(function(){
  var payload = ${json};
  try {
    if (window.opener) {
      window.opener.postMessage({ source: "ig-oauth", payload: payload }, "*");
      setTimeout(function(){ window.close(); }, 300);
    } else {
      var p = new URLSearchParams();
      Object.keys(payload).forEach(function(k){ p.set(k, typeof payload[k] === "string" ? payload[k] : JSON.stringify(payload[k])); });
      location.replace("/accounts?" + p.toString());
    }
  } catch (e) { document.body.innerText = "Erro: " + e.message; }
})();
</script>`;
  return new Response(html, {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}
