// Server function: lista vídeos do Google Drive via Lovable Connector Gateway.
// Usa a conta Google conectada ao workspace (App Connector).
import { createServerFn } from "@tanstack/react-start";

const GATEWAY = "https://connector-gateway.lovable.dev/google_drive/drive/v3";

export type DriveVideo = {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  thumbnailLink?: string;
  durationMillis?: string;
  modifiedTime?: string;
};

export const listDriveVideos = createServerFn({ method: "GET" }).handler(async () => {
  const LOVABLE_API_KEY = process.env.LOVABLE_API_KEY;
  const GOOGLE_DRIVE_API_KEY = process.env.GOOGLE_DRIVE_API_KEY;
  if (!LOVABLE_API_KEY) return { videos: [] as DriveVideo[], error: "LOVABLE_API_KEY ausente" };
  if (!GOOGLE_DRIVE_API_KEY) return { videos: [] as DriveVideo[], error: "Google Drive não conectado" };

  const params = new URLSearchParams({
    q: "mimeType contains 'video/' and trashed = false",
    fields: "files(id,name,mimeType,size,thumbnailLink,modifiedTime,videoMediaMetadata)",
    pageSize: "50",
    orderBy: "modifiedTime desc",
  });

  try {
    const res = await fetch(`${GATEWAY}/files?${params}`, {
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "X-Connection-Api-Key": GOOGLE_DRIVE_API_KEY,
      },
    });
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
