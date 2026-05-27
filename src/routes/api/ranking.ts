// GET /api/ranking?period=24h|48h|72h
// Ranking acumulado por janela.

import { createFileRoute } from "@tanstack/react-router";
import { requireDb, hasDb } from "@/lib/cf.server";

type Period = "24h" | "48h" | "72h";

export type AccountRankingData = {
  id: string;
  username: string;
  name: string;
  profile_picture: string | null;
  followers: number;
  health_score: number;

  period_reels: number;
  period_views: number;
  period_likes: number;
  period_comments: number;
  period_avg_views: number;

  total_reels: number;
  total_views: number;
  total_likes: number;

  reach_ratio: number | null;
  reach_status: "good" | "warn" | "restricted" | null;

  hourly_views_24h: { hour: string; views: number }[];

  composite_score: number;
  rank: number;

  last_post_at: string | null;
  pending_in_queue: number;
};

function reachStatusFor(ratio: number | null): AccountRankingData["reach_status"] {
  if (ratio === null) return null;
  if (ratio >= 30) return "good";
  if (ratio >= 10) return "warn";
  return "restricted";
}

function periodHours(p: Period): number {
  if (p === "24h") return 24;
  if (p === "72h") return 72;
  return 48;
}

export const Route = createFileRoute("/api/ranking")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!hasDb()) {
          return new Response(JSON.stringify({ ranking: [] }), {
            headers: { "content-type": "application/json" },
          });
        }
        const url = new URL(request.url);
        const periodParam = (url.searchParams.get("period") ?? "48h") as Period;
        const period: Period = periodParam === "24h" || periodParam === "72h" ? periodParam : "48h";
        const hours = periodHours(period);

        const db = requireDb();
        const periodCutoff = new Date(Date.now() - hours * 3600_000).toISOString();
        const day24Cutoff = new Date(Date.now() - 24 * 3600_000).toISOString();

        const accountsRes = await db
          .prepare(
            `SELECT id, username, name, profile_picture, followers, health_score, last_post_at
             FROM accounts`,
          )
          .all<{
            id: string;
            username: string;
            name: string;
            profile_picture: string | null;
            followers: number;
            health_score: number;
            last_post_at: string | null;
          }>();
        const accounts = accountsRes.results ?? [];

        const periodAggRes = await db
          .prepare(
            `SELECT account_id,
                    COUNT(*) AS reels,
                    COALESCE(SUM(reach), 0) AS views,
                    COALESCE(SUM(likes), 0) AS likes,
                    COALESCE(SUM(comments), 0) AS comments
             FROM history
             WHERE published_at >= ?
             GROUP BY account_id`,
          )
          .bind(periodCutoff)
          .all<{ account_id: string; reels: number; views: number; likes: number; comments: number }>();
        const periodAgg = new Map(
          (periodAggRes.results ?? []).map((r) => [r.account_id, r]),
        );

        const totalAggRes = await db
          .prepare(
            `SELECT account_id,
                    COUNT(*) AS reels,
                    COALESCE(SUM(reach), 0) AS views,
                    COALESCE(SUM(likes), 0) AS likes
             FROM history
             GROUP BY account_id`,
          )
          .all<{ account_id: string; reels: number; views: number; likes: number }>();
        const totalAgg = new Map((totalAggRes.results ?? []).map((r) => [r.account_id, r]));

        const hourlyRes = await db
          .prepare(
            `SELECT account_id,
                    strftime('%Y-%m-%dT%H:00:00Z', published_at) AS hour,
                    COALESCE(SUM(reach), 0) AS views
             FROM history
             WHERE published_at >= ?
             GROUP BY account_id, hour`,
          )
          .bind(day24Cutoff)
          .all<{ account_id: string; hour: string; views: number }>();
        const hourlyByAcc = new Map<string, { hour: string; views: number }[]>();
        for (const row of hourlyRes.results ?? []) {
          const arr = hourlyByAcc.get(row.account_id) ?? [];
          arr.push({ hour: row.hour, views: row.views });
          hourlyByAcc.set(row.account_id, arr);
        }
        // Preencher 24 buckets contínuos por conta
        const now = new Date();
        const buckets: string[] = [];
        for (let i = 23; i >= 0; i--) {
          const d = new Date(now.getTime() - i * 3600_000);
          d.setUTCMinutes(0, 0, 0);
          buckets.push(d.toISOString().slice(0, 13) + ":00:00Z");
        }

        const pendingRes = await db
          .prepare(
            `SELECT account_id, COUNT(*) AS c
             FROM queue
             WHERE status IN ('scheduled','processing')
             GROUP BY account_id`,
          )
          .all<{ account_id: string; c: number }>();
        const pendingMap = new Map((pendingRes.results ?? []).map((r) => [r.account_id, r.c]));

        const rows: AccountRankingData[] = accounts.map((a) => {
          const pa = periodAgg.get(a.id);
          const ta = totalAgg.get(a.id);
          const period_reels = pa?.reels ?? 0;
          const period_views = pa?.views ?? 0;
          const period_likes = pa?.likes ?? 0;
          const period_comments = pa?.comments ?? 0;
          const period_avg_views = period_reels > 0 ? period_views / period_reels : 0;
          const reach_ratio =
            period_reels > 0 && a.followers > 0
              ? (period_avg_views / a.followers) * 100
              : null;
          const reach_status = reachStatusFor(reach_ratio);
          const composite_score =
            period_avg_views * 0.5 +
            (a.followers ?? 0) * 0.2 +
            period_likes * 0.15 +
            (reach_ratio ?? 0) * 1000 * 0.15;

          const sparkRaw = hourlyByAcc.get(a.id) ?? [];
          const sparkMap = new Map(sparkRaw.map((r) => [r.hour, r.views]));
          const hourly_views_24h = buckets.map((h) => ({ hour: h, views: sparkMap.get(h) ?? 0 }));

          return {
            id: a.id,
            username: a.username,
            name: a.name,
            profile_picture: a.profile_picture,
            followers: a.followers ?? 0,
            health_score: a.health_score ?? 100,
            period_reels,
            period_views,
            period_likes,
            period_comments,
            period_avg_views,
            total_reels: ta?.reels ?? 0,
            total_views: ta?.views ?? 0,
            total_likes: ta?.likes ?? 0,
            reach_ratio,
            reach_status,
            hourly_views_24h,
            composite_score,
            rank: 0,
            last_post_at: a.last_post_at,
            pending_in_queue: pendingMap.get(a.id) ?? 0,
          };
        });

        rows.sort((a, b) => b.composite_score - a.composite_score);
        rows.forEach((r, i) => {
          r.rank = i + 1;
        });

        return new Response(JSON.stringify({ ranking: rows, period }), {
          headers: { "content-type": "application/json" },
        });
      },
    },
  },
});
