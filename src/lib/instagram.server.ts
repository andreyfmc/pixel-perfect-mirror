// Cliente mínimo para a Instagram Graph API (Instagram Business / Creator).
// Docs: https://developers.facebook.com/docs/instagram-api/guides/content-publishing
//
// Fluxo de publicação:
//  1. POST /{ig-user-id}/media       → cria container (devolve creation_id)
//  2. POST /{ig-user-id}/media_publish?creation_id=... → publica
//
// Requer access_token de longa duração da conta + ig_user_id (Business).

const GRAPH = "https://graph.facebook.com/v21.0";

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

async function gpost(path: string, body: Record<string, string>) {
  const url = new URL(GRAPH + path);
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body).toString(),
  });
  const json = (await res.json()) as Record<string, unknown>;
  if (!res.ok) throw new Error(`Graph ${res.status}: ${JSON.stringify(json)}`);
  return json;
}

async function gget(path: string, params: Record<string, string>) {
  const url = new URL(GRAPH + path);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url);
  const json = (await res.json()) as Record<string, unknown>;
  if (!res.ok) throw new Error(`Graph ${res.status}: ${JSON.stringify(json)}`);
  return json;
}

export const instagram = {
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

  /** Helper completo: cria container → aguarda → publica. */
  async publish(input: PublishInput): Promise<PublishResult> {
    const containerId = await this.createContainer(input);
    // Pequena espera — REELS exigem processamento. Para produção use polling
    // de GET /{container-id}?fields=status_code até FINISHED.
    if (input.mediaType === "REEL") {
      await new Promise((r) => setTimeout(r, 8000));
    }
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
