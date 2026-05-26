// Proxy público: streama um arquivo do Google Drive (via Lovable Connector)
// para que a Instagram Graph API consiga baixar mídias do Drive.
// IMPORTANTE: este endpoint é público (sem auth) porque a IG precisa
// acessá-lo sem cabeçalhos. Só serve arquivos do Drive do operador, então
// o "vazamento" é restrito ao que já está nessa conta.
import { createFileRoute } from "@tanstack/react-router";
import { ensureEnv } from "@/lib/cf.server";

const GATEWAY = "https://connector-gateway.lovable.dev/google_drive/drive/v3";

export const Route = createFileRoute("/api/public/drive/$id")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const env = await ensureEnv();
        const LOVABLE_API_KEY = env.LOVABLE_API_KEY ?? process.env.LOVABLE_API_KEY;
        const GOOGLE_DRIVE_API_KEY =
          env.GOOGLE_DRIVE_API_KEY ?? process.env.GOOGLE_DRIVE_API_KEY;
        if (!LOVABLE_API_KEY || !GOOGLE_DRIVE_API_KEY) {
          return new Response("Drive não conectado", { status: 500 });
        }
        const upstream = await fetch(`${GATEWAY}/files/${params.id}?alt=media`, {
          headers: {
            Authorization: `Bearer ${LOVABLE_API_KEY}`,
            "X-Connection-Api-Key": GOOGLE_DRIVE_API_KEY,
          },
        });
        if (!upstream.ok || !upstream.body) {
          const body = await upstream.text().catch(() => "");
          return new Response(`Drive ${upstream.status}: ${body.slice(0, 200)}`, {
            status: 502,
          });
        }
        const headers = new Headers();
        const ct = upstream.headers.get("content-type");
        if (ct) headers.set("content-type", ct);
        const cl = upstream.headers.get("content-length");
        if (cl) headers.set("content-length", cl);
        headers.set("cache-control", "public, max-age=3600");
        return new Response(upstream.body, { status: 200, headers });
      },
    },
  },
});
