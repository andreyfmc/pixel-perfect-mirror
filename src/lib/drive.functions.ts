// Server functions: navega pastas e lista vídeos do Google Drive
// via Lovable Connector Gateway (conta Google conectada ao workspace).
import { createServerFn } from "@tanstack/react-start";

const GATEWAY = "https://connector-gateway.lovable.dev/google_drive/drive/v3";
const FOLDER_MIME = "application/vnd.google-apps.folder";

export type DriveVideo = {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  thumbnailLink?: string;
  durationMillis?: string;
  modifiedTime?: string;
};

export type DriveFolder = {
  id: string;
  name: string;
  modifiedTime?: string;
};

export type DriveCrumb = { id: string; name: string };

export type DriveListing = {
  folders: DriveFolder[];
  videos: DriveVideo[];
  breadcrumbs: DriveCrumb[];
  error: string | null;
};

function headers() {
  const LOVABLE_API_KEY = process.env.LOVABLE_API_KEY;
  const GOOGLE_DRIVE_API_KEY = process.env.GOOGLE_DRIVE_API_KEY;
  if (!LOVABLE_API_KEY) return { err: "LOVABLE_API_KEY ausente" as const };
  if (!GOOGLE_DRIVE_API_KEY) return { err: "Google Drive não conectado" as const };
  return {
    h: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "X-Connection-Api-Key": GOOGLE_DRIVE_API_KEY,
    },
  };
}

async function fetchBreadcrumbs(folderId: string, h: Record<string, string>): Promise<DriveCrumb[]> {
  const crumbs: DriveCrumb[] = [];
  let current: string | undefined = folderId;
  // Safety bound to avoid runaway loops
  for (let i = 0; i < 20 && current && current !== "root"; i++) {
    const res = await fetch(`${GATEWAY}/files/${current}?fields=id,name,parents`, { headers: h });
    if (!res.ok) break;
    const j = (await res.json()) as { id: string; name: string; parents?: string[] };
    crumbs.unshift({ id: j.id, name: j.name });
    current = j.parents?.[0];
  }
  return crumbs;
}

export const listDriveEntries = createServerFn({ method: "GET" })
  .inputValidator((data: { folderId?: string }) => ({ folderId: data?.folderId ?? "root" }))
  .handler(async ({ data }): Promise<DriveListing> => {
    const auth = headers();
    if ("err" in auth) {
      return { folders: [], videos: [], breadcrumbs: [], error: auth.err };
    }
    const { h } = auth;
    const folderId = data.folderId;

    const q = `'${folderId}' in parents and trashed = false and (mimeType = '${FOLDER_MIME}' or mimeType contains 'video/')`;
    const params = new URLSearchParams({
      q,
      fields:
        "files(id,name,mimeType,size,thumbnailLink,modifiedTime,videoMediaMetadata)",
      pageSize: "200",
      orderBy: "folder,name",
    });

    try {
      const [listRes, breadcrumbs] = await Promise.all([
        fetch(`${GATEWAY}/files?${params}`, { headers: h }),
        folderId === "root" ? Promise.resolve([]) : fetchBreadcrumbs(folderId, h),
      ]);
      const json = (await listRes.json()) as {
        files?: Array<{
          id: string;
          name: string;
          mimeType: string;
          size?: string;
          thumbnailLink?: string;
          modifiedTime?: string;
          videoMediaMetadata?: { durationMillis?: string };
        }>;
        error?: { message?: string };
      };
      if (!listRes.ok) {
        return {
          folders: [],
          videos: [],
          breadcrumbs,
          error: json.error?.message ?? `Drive ${listRes.status}`,
        };
      }
      const folders: DriveFolder[] = [];
      const videos: DriveVideo[] = [];
      for (const f of json.files ?? []) {
        if (f.mimeType === FOLDER_MIME) {
          folders.push({ id: f.id, name: f.name, modifiedTime: f.modifiedTime });
        } else {
          videos.push({
            id: f.id,
            name: f.name,
            mimeType: f.mimeType,
            size: f.size,
            thumbnailLink: f.thumbnailLink,
            modifiedTime: f.modifiedTime,
            durationMillis: f.videoMediaMetadata?.durationMillis,
          });
        }
      }
      return { folders, videos, breadcrumbs, error: null };
    } catch (err) {
      return {
        folders: [],
        videos: [],
        breadcrumbs: [],
        error: err instanceof Error ? err.message : String(err),
      };
    }
  });

// Backwards-compatible: lista TODOS os vídeos (busca global) sem navegar.
export const listDriveVideos = createServerFn({ method: "GET" }).handler(async () => {
  const auth = headers();
  if ("err" in auth) return { videos: [] as DriveVideo[], error: auth.err };
  const params = new URLSearchParams({
    q: "mimeType contains 'video/' and trashed = false",
    fields: "files(id,name,mimeType,size,thumbnailLink,modifiedTime,videoMediaMetadata)",
    pageSize: "50",
    orderBy: "modifiedTime desc",
  });
  try {
    const res = await fetch(`${GATEWAY}/files?${params}`, { headers: auth.h });
    const json = (await res.json()) as {
      files?: Array<DriveVideo & { videoMediaMetadata?: { durationMillis?: string } }>;
      error?: { message?: string };
    };
    if (!res.ok) {
      return { videos: [] as DriveVideo[], error: json.error?.message ?? `Drive ${res.status}` };
    }
    const videos: DriveVideo[] = (json.files ?? []).map((f) => ({
      id: f.id,
      name: f.name,
      mimeType: f.mimeType,
      size: f.size,
      thumbnailLink: f.thumbnailLink,
      modifiedTime: f.modifiedTime,
      durationMillis: f.videoMediaMetadata?.durationMillis,
    }));
    return { videos, error: null };
  } catch (err) {
    return { videos: [] as DriveVideo[], error: err instanceof Error ? err.message : String(err) };
  }
});
