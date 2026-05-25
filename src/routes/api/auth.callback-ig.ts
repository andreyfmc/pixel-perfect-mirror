import { createFileRoute } from "@tanstack/react-router";
import { handleInstagramCallback, popupResponseHtml } from "@/lib/oauth.server";
import { ensureEnv } from "@/lib/cf.server";

export const Route = createFileRoute("/api/auth/callback-ig")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const code = url.searchParams.get("code");
        const err = url.searchParams.get("error_description") ?? url.searchParams.get("error");
        if (err) return popupResponseHtml({ ok: false, error: err });
        if (!code) return popupResponseHtml({ ok: false, error: "missing_code" });
        try {
          const res = await handleInstagramCallback(request, code);
          return popupResponseHtml({
            ok: true,
            provider: "instagram",
            saved: res.saved,
          });
        } catch (e) {
          return popupResponseHtml({ ok: false, error: (e as Error).message });
        }
      },
    },
  },
});
