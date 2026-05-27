// Helpers de Drive somente-servidor (usados pelo scheduler/loops).
import { ensureEnv } from "./cf.server";
import type { DriveVideo, DriveFolder } from "./drive.functions";

const GATEWAY = "https://connector-gateway.lovable.dev/google_drive/drive/v3";
const FOLDER_MIME = "application/vnd.google-apps.folder";

async function buildHeaders(): Promise<Record<string, string> | null> {
  const env = await ensureEnv();
  const LOVABLE_API_KEY = env.LOVABLE_API_KEY ?? process.env.LOVABLE_API_KEY;
  const GOOGLE_DRIVE_API_KEY = env.GOOGLE_DRIVE_API_KEY ?? process.env.GOOGLE_DRIVE_API_KEY;
  if (!LOVABLE_API_KEY || !GOOGLE_DRIVE_API_KEY) return null;
  return {
    Authorization: `Bearer ${LOVABLE_API_KEY}`,
    "X-Connection-Api-Key": GOOGLE_DRIVE_API_KEY,
  };
}

export type FolderLiveListing = {
  folder: DriveFolder | null; // null se a pasta sumiu (deletada/sem acesso)
  videos: DriveVideo[];
  error: string | null;
};

/** Releitura ao vivo dos vídeos de uma pasta — usada pelo loop materializer
 *  e pela UI quando precisa de contagem ao vivo. */
export async function fetchFolderVideosLive(folderId: string): Promise<FolderLiveListing> {
  const h = await buildHeaders();
  if (!h) return { folder: null, videos: [], error: "Google Drive não conectado" };

  try {
    // Metadados da pasta primeiro — para detectar pasta deletada.
    const metaRes = await fetch(`${GATEWAY}/files/${folderId}?fields=id,name,mimeType,trashed`, {
      headers: h,
    });
    if (metaRes.status === 404) {
      return { folder: null, videos: [], error: "Pasta não encontrada (foi deletada?)" };
    }
    const meta = (await metaRes.json()) as {
      id?: string;
      name?: string;
      mimeType?: string;
      trashed?: boolean;
      error?: { message?: string };
    };
    if (!metaRes.ok) {
      return { folder: null, videos: [], error: meta.error?.message ?? `Drive ${metaRes.status}` };
    }
    if (meta.trashed || meta.mimeType !== FOLDER_MIME) {
      return { folder: null, videos: [], error: "Pasta foi removida ou não é mais uma pasta" };
    }

    const folder: DriveFolder = { id: meta.id!, name: meta.name! };

    const q = `'${folderId}' in parents and trashed = false and mimeType contains 'video/'`;
    const params = new URLSearchParams({
      q,
      fields: "files(id,name,mimeType,size,thumbnailLink,modifiedTime,videoMediaMetadata)",
      pageSize: "200",
      orderBy: "name",
    });
    const res = await fetch(`${GATEWAY}/files?${params}`, { headers: h });
    const json = (await res.json()) as {
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
    if (!res.ok) {
      return { folder, videos: [], error: json.error?.message ?? `Drive ${res.status}` };
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
    return { folder, videos, error: null };
  } catch (err) {
    return { folder: null, videos: [], error: err instanceof Error ? err.message : String(err) };
  }
}
