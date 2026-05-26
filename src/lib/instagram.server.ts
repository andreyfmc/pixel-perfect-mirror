// Cliente mínimo para a Instagram Graph API (Instagram Business / Creator).
// Docs: https://developers.facebook.com/docs/instagram-api/guides/content-publishing
//
// Fluxo de publicação:
//  1. POST /{ig-user-id}/media       → cria container (devolve creation_id)
//  2. POST /{ig-user-id}/media_publish?creation_id=... → publica
//
// Requer access_token de longa duração da conta + ig_user_id (Business).

import { env } from "./cf.server";

const GRAPH_HOSTS = [
  { id: "facebook", base: "https://graph.facebook.com/v21.0" },
  { id: "instagram", base: "https://graph.instagram.com/v21.0" },
] as const;

type GraphHostId = (typeof GRAPH_HOSTS)[number]["id"];
type GraphHost = (typeof GRAPH_HOSTS)[number];
type GraphJson = Record<string, unknown>;
type GraphFailure = {
  host: GraphHostId;
  status: number;
  json: GraphJson;
};

const TOKEN_REFRESH_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

type VisibleFacebookIgAccount = {
  page: string;
  pageId: string;
  pageAccessToken: string;
  ig_id: string;
  ig_username?: string;
  ig_name?: string;
  profile_picture?: string;
  followers?: number;
};

export class InstagramGraphError extends Error {
  failures: GraphFailure[];

  constructor(failures: GraphFailure[]) {
    const primary = failures.at(-1) ?? failures[0];
    const err = primary?.json.error as
      | { code?: number; error_subcode?: number; message?: string }
      | undefined;
    const hint =
      err?.code === 100 && err?.error_subcode === 33
        ? " — credenciais incompatíveis: o token salvo não acessa este ig_user_id. Revalide/reconecte a conta."
        : err?.code === 190
          ? " — token OAuth inválido/expirado ou malformado. Reconecte a conta para gerar um novo token."
          : "";
    const attempts = failures
      .map((f) => `${f.host} ${f.status}: ${JSON.stringify(f.json)}`)
      .join(" | ");
    super(
      `Graph ${primary?.status ?? 400}: ${JSON.stringify(primary?.json ?? {})}${hint}${attempts ? ` · tentativas: ${attempts}` : ""}`,
    );
    this.name = "InstagramGraphError";
    this.failures = failures;
  }
}

export function isInvalidAccessTokenError(err: unknown) {
  if (!(err instanceof InstagramGraphError)) return false;
  return err.failures.some((failure) => {
    const graphErr = failure.json.error as { code?: number; message?: string } | undefined;
    return graphErr?.code === 190;
  });
}

function expiredTokenError(message = "Token OAuth expirado") {
  return new InstagramGraphError([
    {
      host: "instagram",
      status: 400,
      json: { error: { message, type: "OAuthException", code: 190 } },
    },
  ]);
}

export function daysUntilTokenExpiration(expiresAt?: string | null) {
  if (!expiresAt) return null;
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (!Number.isFinite(ms)) return null;
  return Math.ceil(ms / (24 * 60 * 60 * 1000));
}

export async function refreshLongLivedInstagramToken(accessToken: string) {
  const url = new URL("https://graph.instagram.com/refresh_access_token");
  url.searchParams.set("grant_type", "ig_refresh_token");
  url.searchParams.set("access_token", accessToken);
  const res = await fetch(url);
  const json = (await res.json()) as { access_token?: string; expires_in?: number } & GraphJson;
  if (!res.ok || !json.access_token) {
    throw new InstagramGraphError([{ host: "instagram", status: res.status, json }]);
  }
  const expiresIn = json.expires_in ?? 60 * 24 * 3600;
  return {
    accessToken: json.access_token,
    expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
  };
}

export async function ensureFreshAccessToken(input: {
  accessToken: string;
  tokenExpiresAt?: string | null;
  force?: boolean;
}) {
  const expiresTime = input.tokenExpiresAt ? new Date(input.tokenExpiresAt).getTime() : NaN;
  if (Number.isFinite(expiresTime) && expiresTime <= Date.now()) {
    throw expiredTokenError("Token OAuth expirado. Reconecte a conta para gerar um novo token.");
  }
  const shouldRefresh =
    input.force || (Number.isFinite(expiresTime) && expiresTime - Date.now() <= TOKEN_REFRESH_WINDOW_MS);
  if (!shouldRefresh) {
    return { accessToken: input.accessToken, expiresAt: input.tokenExpiresAt ?? null, refreshed: false };
  }
  const refreshed = await refreshLongLivedInstagramToken(input.accessToken);
  return { ...refreshed, refreshed: true };
}

export function getInstagramClientId() {
  return env.META_IG_APP_ID ?? env.IG_APP_ID;
}

export function getInstagramClientSecret() {
  return env.META_IG_APP_SECRET ?? env.IG_APP_SECRET;
}

export type PublishInput = {
  igUserId: string;
  accessToken: string;
  mediaType: "REEL" | "IMAGE" | "STORY" | "CAROUSEL";
  mediaUrl: string; // URL pública (R2 + custom domain ou signed URL)
  caption?: string;
};

export type PublishResult = {
  containerId: string;
  mediaId: string;
  permalink?: string;
};

export type ContainerStatus = {
  statusCode: string;
  status?: string;
};

function shouldTryNextHost(failure: GraphFailure) {
  const err = failure.json.error as
    | { code?: number; error_subcode?: number; type?: string; message?: string }
    | undefined;
  return (
    (failure.status === 400 || failure.status === 401) && (err?.code === 100 || err?.code === 190)
  );
}

async function graphRequest(
  method: "GET" | "POST",
  path: string,
  input: Record<string, string>,
  hosts: readonly GraphHost[] = GRAPH_HOSTS,
): Promise<GraphJson> {
  const failures: GraphFailure[] = [];
  for (const host of hosts) {
    const url = new URL(host.base + path);
    const init: RequestInit = { method };
    if (method === "GET") {
      for (const [k, v] of Object.entries(input)) url.searchParams.set(k, v);
    } else {
      init.headers = { "content-type": "application/x-www-form-urlencoded" };
      init.body = new URLSearchParams(input).toString();
    }

    const res = await fetch(url, init);
    const json = (await res.json()) as GraphJson;
    if (res.ok) return json;
    const failure = { host: host.id, status: res.status, json };
    failures.push(failure);
    if (!shouldTryNextHost(failure)) break;
  }
  throw new InstagramGraphError(failures);
}

async function gpost(path: string, body: Record<string, string>) {
  return graphRequest("POST", path, body);
}

async function gget(path: string, params: Record<string, string>) {
  return graphRequest("GET", path, params);
}

async function facebookGet(path: string, params: Record<string, string>) {
  return graphRequest("GET", path, params, [GRAPH_HOSTS[0]]);
}

async function instagramGet(path: string, params: Record<string, string>) {
  return graphRequest("GET", path, params, [GRAPH_HOSTS[1]]);
}

async function facebookPost(path: string, body: Record<string, string>) {
  return graphRequest("POST", path, body, [GRAPH_HOSTS[0]]);
}

async function instagramPost(path: string, body: Record<string, string>) {
  return graphRequest("POST", path, body, [GRAPH_HOSTS[1]]);
}

function normalizeInstagramUser(json: GraphJson): GraphJson {
  return {
    ...json,
    id: String(json.id ?? json.user_id ?? ""),
  };
}

function isSameId(a: unknown, b: unknown) {
  return String(a ?? "") === String(b ?? "");
}

export const instagram = {
  async listVisibleFacebookIgAccounts(accessToken: string): Promise<VisibleFacebookIgAccount[]> {
    const pages = (await facebookGet("/me/accounts", {
      access_token: accessToken,
      fields:
        "id,name,access_token,instagram_business_account{id,username,name,profile_picture_url,followers_count}",
    })) as {
      data?: Array<{
        id: string;
        name: string;
        access_token?: string;
        instagram_business_account?: {
          id: string;
          username?: string;
          name?: string;
          profile_picture_url?: string;
          followers_count?: number;
        };
      }>;
    };

    return (pages.data ?? [])
      .filter((page) => page.access_token && page.instagram_business_account?.id)
      .map((page) => ({
        page: page.name,
        pageId: page.id,
        pageAccessToken: page.access_token!,
        ig_id: page.instagram_business_account!.id,
        ig_username: page.instagram_business_account!.username,
        ig_name: page.instagram_business_account!.name,
        profile_picture: page.instagram_business_account!.profile_picture_url,
        followers: page.instagram_business_account!.followers_count,
      }));
  },

  async validateCredentials(input: { igUserId: string; accessToken: string }) {
    try {
      const me = await facebookGet("/me", {
        access_token: input.accessToken,
        fields: "id,name",
      });
      try {
        const page = await facebookGet(`/${me.id}`, {
          access_token: input.accessToken,
          fields:
            "instagram_business_account{id,username,name,profile_picture_url,followers_count}",
        });
        const pageIg = page.instagram_business_account as
          | {
              id?: string;
              username?: string;
              name?: string;
              profile_picture_url?: string;
              followers_count?: number;
            }
          | undefined;
        if (pageIg?.id) {
          return {
            me,
            ig: pageIg,
            host: "facebook" as GraphHostId,
            accessToken: input.accessToken,
            suggestions: [
              {
                page: String(me.name ?? me.id ?? "Página"),
                pageId: String(me.id ?? ""),
                pageAccessToken: input.accessToken,
                ig_id: pageIg.id,
                ig_username: pageIg.username,
                ig_name: pageIg.name,
                profile_picture: pageIg.profile_picture_url,
                followers: pageIg.followers_count,
              },
            ],
          };
        }
      } catch {
        // Se o token for de usuário Facebook, a conta IG vem por /me/accounts abaixo.
      }

      const accounts = await this.listVisibleFacebookIgAccounts(input.accessToken).catch(
        () => [] as VisibleFacebookIgAccount[],
      );
      const suggestion = accounts.find((a) => isSameId(a.ig_id, input.igUserId));
      if (suggestion) {
        return {
          me,
          ig: {
            id: suggestion.ig_id,
            username: suggestion.ig_username,
            name: suggestion.ig_name,
            profile_picture_url: suggestion.profile_picture,
            followers_count: suggestion.followers,
          },
          host: "facebook" as GraphHostId,
          accessToken: suggestion.pageAccessToken,
          suggestions: accounts,
        };
      }

      const ig = await facebookGet(`/${input.igUserId}`, {
        access_token: input.accessToken,
        fields: "id,username,name,profile_picture_url,followers_count",
      });
      return { me, ig, host: "facebook" as GraphHostId, suggestions: accounts };
    } catch (facebookErr) {
      let me: GraphJson;
      try {
        me = normalizeInstagramUser(
          await instagramGet("/me", {
            access_token: input.accessToken,
            fields: "user_id,username,name,profile_picture_url,followers_count",
          }),
        );
      } catch (instagramErr) {
        if (
          facebookErr instanceof InstagramGraphError &&
          instagramErr instanceof InstagramGraphError
        ) {
          throw new InstagramGraphError([...facebookErr.failures, ...instagramErr.failures]);
        }
        throw instagramErr;
      }
      if (!isSameId(me.id, input.igUserId)) {
        const instagramErr = new InstagramGraphError([
          {
            host: "instagram",
            status: 400,
            json: {
              error: {
                message: `Instagram token pertence ao usuário ${me.id}, mas a conta salva usa ${input.igUserId}`,
                code: 100,
                error_subcode: 33,
              },
            },
          },
        ]);
        if (facebookErr instanceof InstagramGraphError) {
          instagramErr.failures = [...facebookErr.failures, ...instagramErr.failures];
        }
        throw instagramErr;
      }
      return { me, ig: me, host: "instagram" as GraphHostId };
    }
  },

  async createContainer(input: PublishInput): Promise<string> {
    const body: Record<string, string> = {
      access_token: input.accessToken,
      caption: input.caption ?? "",
    };
    if (input.mediaType === "REEL") {
      body.media_type = "REELS";
      body.video_url = input.mediaUrl;
    } else if (input.mediaType === "STORY") {
      body.media_type = "STORIES";
      if (input.mediaUrl.endsWith(".mp4")) body.video_url = input.mediaUrl;
      else body.image_url = input.mediaUrl;
    } else {
      body.image_url = input.mediaUrl;
    }
    const json = await gpost(`/${input.igUserId}/media`, body);
    return String(json.id);
  },

  async publishContainer(input: {
    igUserId: string;
    accessToken: string;
    containerId: string;
  }): Promise<string> {
    const json = await gpost(`/${input.igUserId}/media_publish`, {
      access_token: input.accessToken,
      creation_id: input.containerId,
    });
    return String(json.id);
  },

  async fetchMediaInfo(mediaId: string, accessToken: string) {
    return gget(`/${mediaId}`, {
      access_token: accessToken,
      fields: "id,permalink,media_type,caption,timestamp",
    });
  },

  async fetchContainerStatus(containerId: string, accessToken: string): Promise<ContainerStatus> {
    const json = await gget(`/${containerId}`, {
      access_token: accessToken,
      fields: "status_code,status",
    });
    return {
      statusCode: String(json.status_code ?? "UNKNOWN"),
      status: typeof json.status === "string" ? json.status : undefined,
    };
  },

  async waitUntilReady(input: {
    containerId: string;
    accessToken: string;
    attempts?: number;
    delayMs?: number;
  }) {
    const attempts = input.attempts ?? 24;
    const delayMs = input.delayMs ?? 5000;
    let last: ContainerStatus | null = null;

    for (let i = 0; i < attempts; i++) {
      last = await this.fetchContainerStatus(input.containerId, input.accessToken);
      if (last.statusCode === "FINISHED" || last.statusCode === "PUBLISHED") return last;
      if (last.statusCode === "ERROR" || last.statusCode === "EXPIRED") {
        throw new Error(`Container Instagram ${last.statusCode}: ${last.status ?? "sem detalhe"}`);
      }
      await new Promise((r) => setTimeout(r, delayMs));
    }

    throw new Error(
      `Container Instagram ainda processando (${last?.statusCode ?? "UNKNOWN"}). Tente novamente em alguns minutos.`,
    );
  },

  /** Helper completo: cria container → aguarda → publica. */
  async publish(input: PublishInput): Promise<PublishResult> {
    const containerId = await this.createContainer(input);
    await this.waitUntilReady({ containerId, accessToken: input.accessToken });
    const mediaId = await this.publishContainer({
      igUserId: input.igUserId,
      accessToken: input.accessToken,
      containerId,
    });
    let permalink: string | undefined;
    try {
      const info = await this.fetchMediaInfo(mediaId, input.accessToken);
      permalink = info.permalink as string | undefined;
    } catch {
      // ignore — campo opcional
    }
    return { containerId, mediaId, permalink };
  },
};
