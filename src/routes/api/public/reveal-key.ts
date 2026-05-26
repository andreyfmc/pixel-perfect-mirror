// ⚠️ ROTA TEMPORÁRIA — REMOVER APÓS COPIAR AS KEYS PRO CLOUDFLARE
import { createFileRoute } from "@tanstack/react-router";
import { ensureEnv } from "@/lib/cf.server";

// Use na URL: /api/public/reveal-key?pwd=troque-isto-123
const PASSWORD = "troque-isto-123";

export const Route = createFileRoute("/api/public/reveal-key")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        if (url.searchParams.get("pwd") !== PASSWORD) {
          return new Response("forbidden", { status: 403 });
        }

        const env = await ensureEnv();
        const getSecret = (key: string) =>
          (env as Record<string, string | undefined>)[key] ?? process.env[key] ?? null;

        return Response.json({
          LOVABLE_API_KEY: getSecret("LOVABLE_API_KEY"),
          GOOGLE_DRIVE_API_KEY: getSecret("GOOGLE_DRIVE_API_KEY"),
          META_APP_ID: getSecret("META_APP_ID"),
          META_APP_SECRET: getSecret("META_APP_SECRET"),
        });
      },
    },
  },
});