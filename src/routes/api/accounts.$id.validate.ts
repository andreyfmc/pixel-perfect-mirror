import { createFileRoute } from "@tanstack/react-router";
import { db } from "@/lib/db.server";

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
          // 1) Token vivo?
          const meRes = await fetch(
            `https://graph.facebook.com/v21.0/me?fields=id,name&access_token=${encodeURIComponent(account.access_token)}`,
          );
          const me = (await meRes.json()) as Record<string, unknown>;
          if (!meRes.ok) {
            return json({ ok: false, scope: "token", error: me }, 200);
          }

          // 2) ig_user_id resolve para essa conta?
          const igRes = await fetch(
            `https://graph.facebook.com/v21.0/${account.ig_user_id}?fields=id,username,name&access_token=${encodeURIComponent(account.access_token)}`,
          );
          const ig = (await igRes.json()) as Record<string, unknown>;
          if (!igRes.ok) {
            return json({ ok: false, scope: "ig_user", me, error: ig }, 200);
          }

          // 3) Sugestão: listar IG business accounts visíveis pelo token (via /me/accounts).
          let suggestions: Array<{ page: string; ig_id?: string; ig_username?: string }> = [];
          try {
            const pagesRes = await fetch(
              `https://graph.facebook.com/v21.0/me/accounts?fields=name,instagram_business_account{id,username}&access_token=${encodeURIComponent(account.access_token)}`,
            );
            const pages = (await pagesRes.json()) as {
              data?: Array<{ name: string; instagram_business_account?: { id: string; username: string } }>;
            };
            suggestions = (pages.data ?? []).map((p) => ({
              page: p.name,
              ig_id: p.instagram_business_account?.id,
              ig_username: p.instagram_business_account?.username,
            }));
          } catch {
            // opcional
          }

          return json({ ok: true, me, ig, suggestions });
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
