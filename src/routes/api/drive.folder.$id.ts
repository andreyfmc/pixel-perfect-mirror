import { createFileRoute } from "@tanstack/react-router";
import { fetchFolderVideosLive } from "@/lib/drive.server";

export const Route = createFileRoute("/api/drive/folder/$id")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const r = await fetchFolderVideosLive(params.id);
        return new Response(
          JSON.stringify({
            folder: r.folder,
            count: r.videos.length,
            error: r.error,
          }),
          { headers: { "content-type": "application/json" } },
        );
      },
    },
  },
});
