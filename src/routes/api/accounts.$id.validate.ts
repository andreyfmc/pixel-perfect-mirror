import { createFileRoute } from "@tanstack/react-router";
import { db } from "@/lib/db.server";
import {
  ensureFreshAccessToken,
  inferGraphProviderFromToken,
  InstagramGraphError,
  instagram,
  isInvalidAccessTokenError,
  isMismatchedCredentialsError,
} from "@/lib/instagram.server";

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });

export const Route = createFileRoute("/api/accounts/$id/validate")({
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
          const fresh =
            account.provider === "instagram"
              ? await ensureFreshAccessToken({
                  accessToken,
                  tokenExpiresAt: account.token_expires_at,
                })
              : { accessToken, expiresAt: account.token_expires_at, refreshed: false };
          if (fresh.refreshed || account.token_status === "expired") {
            accessToken = fresh.accessToken;
            provider = inferGraphProviderFromToken(accessToken, provider);
            await db.updateAccountCredentials(params.id, {
              access_token: fresh.accessToken,
              token_expires_at: fresh.expiresAt,
              provider,
              token_status: "valid",
              health_score: Math.max(account.health_score, 90),
            });
          }
          const result = await instagram.validateCredentials({
            igUserId: account.ig_user_id,
            accessToken,
            expectedUsername: account.username,
          });

          if (result.accessToken || result.ig?.id || result.host) {
            await db.updateAccountCredentials(params.id, {
              access_token: result.accessToken,
              ig_user_id: typeof result.ig?.id === "string" ? result.ig.id : undefined,
              provider: result.host,
              token_status: "valid",
              profile_picture:
                typeof result.ig?.profile_picture_url === "string"
                  ? result.ig.profile_picture_url
                  : undefined,
              followers:
                typeof result.ig?.followers_count === "number"
                  ? result.ig.followers_count
                  : undefined,
              health_score: 95,
            });
          }

          return json({
            ok: true,
            me: result.me,
            ig: result.ig,
            graph_host: result.host,
            suggestions: result.suggestions ?? [],
          });
        } catch (err) {
          if (isMismatchedCredentialsError(err)) {
            const healed = await db.healMismatchedCredentials(params.id);
            if (healed?.ig_user_id && healed.access_token) {
              const result = await instagram.validateCredentials({
                igUserId: healed.ig_user_id,
                accessToken: healed.access_token,
                expectedUsername: healed.username,
              });
              await db.updateAccountCredentials(params.id, {
                access_token: result.accessToken ?? healed.access_token,
                ig_user_id: typeof result.ig?.id === "string" ? result.ig.id : healed.ig_user_id,
                provider: result.host ?? healed.provider,
                token_status: "valid",
                health_score: 95,
              });
              return json({
                ok: true,
                me: result.me,
                ig: result.ig,
                graph_host: result.host,
                suggestions: result.suggestions ?? [],
                healed: true,
              });
            }
          }
          if (err instanceof InstagramGraphError) {
            const needsReconnect = isInvalidAccessTokenError(err);
            if (needsReconnect) await db.markAccountNeedsReconnect(params.id);
            const first = err.failures[0];
            return json(
              {
                ok: false,
                scope: "graph",
                needs_reconnect: needsReconnect,
                error: needsReconnect
                  ? "Token OAuth inválido/expirado. Reconecte a conta pelo Instagram ou Facebook."
                  : (first?.json ?? err.message),
                failures: err.failures,
              },
              200,
            );
          }
          return json({ ok: false, error: err instanceof Error ? err.message : String(err) }, 500);
        }
      },
    },
  },
});
