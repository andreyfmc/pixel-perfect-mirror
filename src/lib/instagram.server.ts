// Cliente mínimo para a Instagram Graph API (Instagram Business / Creator).
// Docs: https://developers.facebook.com/docs/instagram-api/guides/content-publishing
//
// Fluxo de publicação:
//  1. POST /{ig-user-id}/media       → cria container (devolve creation_id)
//  2. POST /{ig-user-id}/media_publish?creation_id=... → publica
//
// Requer access_token de longa duração da conta + ig_user_id (Business).

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

export class InstagramGraphError extends Error {
  failures: GraphFailure[];

  constructor(failures: GraphFailure[]) {
    const first = failures[0];
    const err = first?.json.error as { code?: number; error_subcode?: number; message?: string } | undefined;
    const hint = err?.code === 100 && err?.error_subcode === 33
      ? " — credenciais incompatíveis: o token salvo não acessa este ig_user_id. Revalide/reconecte a conta."
      : "";
    super(`Graph ${first?.status ?? 400}: ${JSON.stringify(first?.json ?? {})}${hint}`);
    this.name = "InstagramGraphError";
    this.failures = failures;
  }
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
  const err = failure.json.error as { code?: number; error_subcode?: number; type?: string; message?: string } | undefined;
  return (failure.status === 400 || failure.status === 401) && (err?.code === 100 || err?.code === 190);
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

function normalizeInstagramUser(json: GraphJson): GraphJson {
  return {
    ...json,
    id: String(json.id ?? json.user_id ?? ""),
  };
}

export const instagram = {
  async validateCredentials(input: { igUserId: string; accessToken: string }) {
    let me: GraphJson | null = null;
    let ig: GraphJson | null = null;
    let host: GraphHostId = "facebook";

    try {
      me = await facebookGet("/me", {
        access_token: input.accessToken,
        fields: "id,name",
      });
    } catch {
      me = normalizeInstagramUser(await instagramGet("/me", {
        access_token: input.accessToken,
        fields: "user_id,username,name",
      }));
      host = "instagram";
    }

    try {
      ig = await facebookGet(`/${input.igUserId}`, {
        access_token: input.accessToken,
        fields: "id,username,name",
      });
      host = "facebook";
    } catch (err) {
      if (err instanceof InstagramGraphError) {
        ig = normalizeInstagramUser(await instagramGet(`/${input.igUserId}`, {
          access_token: input.accessToken,
          fields: "user_id,username,name",
        }));
        host = "instagram";
      } else {
        throw err;
      }
    }

    return { me, ig, host };
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

  async publishContainer(input: { igUserId: string; accessToken: string; containerId: string }): Promise<string> {
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

  async waitUntilReady(input: { containerId: string; accessToken: string; attempts?: number; delayMs?: number }) {
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
