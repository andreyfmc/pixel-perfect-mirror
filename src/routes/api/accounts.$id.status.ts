import { createFileRoute } from "@tanstack/react-router";
import { db } from "@/lib/db.server";
import {
  ensureFreshAccessToken,
  inferGraphProviderFromToken,
  instagram,
} from "@/lib/instagram.server";

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });

export const Route = createFileRoute("/api/accounts/$id/status")({
  server: {
    handlers: {
      POST: async ({ params }) => {
        const account = await db.resolveAccountForPublishing(params.id);
        if (!account) return json({ ok: false, error: "Conta não encontrada" }, 404);
        if (!account.access_token) return json({ ok: false, error: "Sem access_token" }, 400);
        if (!account.ig_user_id) return json({ ok: false, error: "Sem ig_user_id" }, 400);

        try {
          let accessToken = account.access_token;
          let provider = inferGraphProviderFromToken(account.access_token, account.provider);
          try {
            const fresh =
              provider === "instagram"
                ? await ensureFreshAccessToken({
                    accessToken,
                    tokenExpiresAt: account.token_expires_at,
                  })
                : { accessToken, expiresAt: account.token_expires_at, refreshed: false };
            if (fresh.refreshed) {
              accessToken = fresh.accessToken;
              provider = inferGraphProviderFromToken(accessToken, provider);
              await db.updateAccountCredentials(params.id, {
                access_token: fresh.accessToken,
                token_expires_at: fresh.expiresAt,
                provider,
                token_status: "valid",
              });
            }
          } catch {
            // segue — checkAccountStatus reportará token expirado
          }

          const report = await instagram.checkAccountStatus({
            igUserId: account.ig_user_id,
            accessToken,
            provider,
          });

          await db.updateAccountCredentials(params.id, {
            health_score: report.health_score,
            token_status: report.token_status,
          });

          if (report.token_status === "expired") {
            await db.markAccountNeedsReconnect(params.id);
          }

          return json({ ok: true, report });
        } catch (err) {
          return json(
            { ok: false, error: err instanceof Error ? err.message : String(err) },
            500,
          );
        }
      },
    },
  },
});
