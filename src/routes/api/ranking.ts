// GET /api/ranking?period=24h|7d|30d
// Ranking acumulado por janela, com score composto normalizado (0-100).

import { createFileRoute } from "@tanstack/react-router";
import { requireDb, hasDb } from "@/lib/cf.server";

type Period = "24h" | "7d" | "30d";

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

  reach_ratio: number | null;          // % avg_views/followers
  non_follower_index: number | null;   // avg_views/followers (raw, 1.0 = bate seguidores)
  engagement_rate: number | null;      // (likes+comments)/views * 100
  reach_status: "good" | "warn" | "restricted" | null;

  hourly_views_24h: { hour: string; views: number }[];

  // Score 0–100 ponderado (NFI 40 / Eng 30 / Reach 20 / Consistência 10)
  score: number;
  composite_score: number; // alias legado
  rank: number;

  last_post_at: string | null;
  pending_in_queue: number;
};

function reachStatusFor(
  nfi: number | null,
  eng: number | null,
): AccountRankingData["reach_status"] {
  if (nfi === null) return null;
  if (nfi >= 0.8 && (eng ?? 0) >= 2) return "good";
  if (nfi < 0.3) return "restricted";
  return "warn";
}

function periodHours(p: Period): number {
  if (p === "24h") return 24;
  if (p === "30d") return 720;
  return 168; // 7d
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
        const periodParam = (url.searchParams.get("period") ?? "7d") as Period;
        const period: Period =
          periodParam === "24h" || periodParam === "30d" ? periodParam : "7d";
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

        // Pré-cálculo bruto
        const pre = accounts.map((a) => {
          const pa = periodAgg.get(a.id);
          const ta = totalAgg.get(a.id);
          const period_reels = pa?.reels ?? 0;
          const period_views = pa?.views ?? 0;
          const period_likes = pa?.likes ?? 0;
          const period_comments = pa?.comments ?? 0;
          const period_avg_views = period_reels > 0 ? period_views / period_reels : 0;

          const has_data = period_reels > 0 && a.followers > 0;
          const non_follower_index = has_data ? period_avg_views / a.followers : null;
          const reach_ratio = non_follower_index !== null ? non_follower_index * 100 : null;
          const engagement_rate =
            period_views > 0 ? ((period_likes + period_comments) / period_views) * 100 : null;

          return {
            a,
            ta,
            period_reels,
            period_views,
            period_likes,
            period_comments,
            period_avg_views,
            non_follower_index,
            reach_ratio,
            engagement_rate,
          };
        });

        // Normalização min-max para score 0-100
        const nfiVals = pre.map((p) => p.non_follower_index ?? 0);
        const engVals = pre.map((p) => p.engagement_rate ?? 0);
        const reachVals = pre.map((p) => p.reach_ratio ?? 0);
        const reelVals = pre.map((p) => p.period_reels);
        const maxNfi = Math.max(0.01, ...nfiVals);
        const maxEng = Math.max(0.01, ...engVals);
        const maxReach = Math.max(0.01, ...reachVals);
        const maxReels = Math.max(1, ...reelVals);

        const rows: AccountRankingData[] = pre.map((p) => {
          const { a, ta } = p;
          const nNfi = ((p.non_follower_index ?? 0) / maxNfi) * 100;
          const nEng = ((p.engagement_rate ?? 0) / maxEng) * 100;
          const nReach = ((p.reach_ratio ?? 0) / maxReach) * 100;
          const nReels = (p.period_reels / maxReels) * 100;
          const score =
            p.non_follower_index === null
              ? 0
              : nNfi * 0.4 + nEng * 0.3 + nReach * 0.2 + nReels * 0.1;

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
            period_reels: p.period_reels,
            period_views: p.period_views,
            period_likes: p.period_likes,
            period_comments: p.period_comments,
            period_avg_views: p.period_avg_views,
            total_reels: ta?.reels ?? 0,
            total_views: ta?.views ?? 0,
            total_likes: ta?.likes ?? 0,
            reach_ratio: p.reach_ratio,
            non_follower_index: p.non_follower_index,
            engagement_rate: p.engagement_rate,
            reach_status: reachStatusFor(p.non_follower_index, p.engagement_rate),
            hourly_views_24h,
            score: Math.round(score * 10) / 10,
            composite_score: Math.round(score * 10) / 10,
            rank: 0,
            last_post_at: a.last_post_at,
            pending_in_queue: pendingMap.get(a.id) ?? 0,
          };
        });

        rows.sort((a, b) => b.score - a.score);
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
