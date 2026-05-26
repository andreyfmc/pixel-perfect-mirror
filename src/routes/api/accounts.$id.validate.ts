import { createFileRoute } from "@tanstack/react-router";
import { db } from "@/lib/db.server";
import { InstagramGraphError, instagram } from "@/lib/instagram.server";

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });

export const Route = createFileRoute("/api/accounts/$id/validate")({
  server: {
    handlers: {
      POST: async ({ params }) => {
        const account = await db.getAccount(params.id);
        if (!account) return json({ ok: false, error: "Conta não encontrada" }, 404);
        if (!account.access_token) return json({ ok: false, error: "Sem access_token" }, 400);
        if (!account.ig_user_id) return json({ ok: false, error: "Sem ig_user_id" }, 400);

        try {
          const result = await instagram.validateCredentials({
            igUserId: account.ig_user_id,
            accessToken: account.access_token,
          });

          if (result.accessToken || result.ig?.id) {
            await db.updateAccountCredentials(params.id, {
              access_token: result.accessToken,
              ig_user_id: typeof result.ig?.id === "string" ? result.ig.id : undefined,
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
          if (err instanceof InstagramGraphError) {
            const first = err.failures[0];
            return json(
              {
                ok: false,
                scope: "graph",
                error: first?.json ?? err.message,
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
