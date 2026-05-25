import { createFileRoute } from "@tanstack/react-router";
import { buildAuthUrl } from "@/lib/oauth.server";
import { ensureEnv } from "@/lib/cf.server";

export const Route = createFileRoute("/api/auth/instagram")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const provider = (url.searchParams.get("provider") ?? "instagram") as
          | "instagram"
          | "facebook";
        const state = crypto.randomUUID();
        try {
          const authUrl = buildAuthUrl(request, provider, state);
          return new Response(JSON.stringify({ url: authUrl, state }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        } catch (e) {
          return new Response(
            JSON.stringify({ error: "config", message: (e as Error).message }),
            { status: 500, headers: { "content-type": "application/json" } },
          );
        }
      },
    },
  },
});
