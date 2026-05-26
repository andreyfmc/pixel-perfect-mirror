// ⚠️ ROTA TEMPORÁRIA — REMOVER APÓS COPIAR AS KEYS PRO CLOUDFLARE
import { createFileRoute } from "@tanstack/react-router";
import { ensureEnv } from "@/lib/cf.server";

// Troque por uma senha forte e use ela na URL: /api/_reveal-key?pwd=SUA_SENHA
const PASSWORD = "troque-isto-123";

export const Route = createFileRoute("/api/_reveal-key")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        if (url.searchParams.get("pwd") !== PASSWORD) {
          return new Response("forbidden", { status: 403 });
        }
        const env = await ensureEnv();
        const fromProc = (k: string) =>
          (env as Record<string, string | undefined>)[k] ??
          process.env[k] ??
          null;
        return Response.json({
          LOVABLE_API_KEY: fromProc("LOVABLE_API_KEY"),
          GOOGLE_DRIVE_API_KEY: fromProc("GOOGLE_DRIVE_API_KEY"),
          META_APP_ID: fromProc("META_APP_ID"),
          META_APP_SECRET: fromProc("META_APP_SECRET"),
        });
      },
    },
  },
});
