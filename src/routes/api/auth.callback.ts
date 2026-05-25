import { createFileRoute } from "@tanstack/react-router";
import { handleFacebookCallback, popupResponseHtml } from "@/lib/oauth.server";
import { ensureEnv } from "@/lib/cf.server";

export const Route = createFileRoute("/api/auth/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const code = url.searchParams.get("code");
        const err = url.searchParams.get("error_description") ?? url.searchParams.get("error");
        if (err) return popupResponseHtml({ ok: false, error: err });
        if (!code) return popupResponseHtml({ ok: false, error: "missing_code" });
        try {
          await ensureEnv();
          const res = await handleFacebookCallback(request, code);
          return popupResponseHtml({
            ok: res.saved.length > 0,
            provider: "facebook",
            saved: res.saved,
            error: res.error,
          });
        } catch (e) {
          return popupResponseHtml({ ok: false, error: (e as Error).message });
        }
      },
    },
  },
});
