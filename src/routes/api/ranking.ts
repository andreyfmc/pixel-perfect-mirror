// GET /api/ranking?period=1d|3d|5d|30d
// Ranking acumulado por janela. Score composto sem NF-Index (NF-Index é só diagnóstico).

import { createFileRoute } from "@tanstack/react-router";
import { requireDb, hasDb } from "@/lib/cf.server";

type Period = "1d" | "3d" | "5d" | "30d";
type Status = "saudavel" | "atencao" | "restrita" | "critica" | "sem_dados";

export type AccountRankingData = {
  id: string;
  username: string;
  name: string;
  profile_picture: string | null;
  followers: number;
  health_score: number;
  token_status: "valid" | "expired";

  period_reels: number;
  period_views: number;       // plays (com fallback para reach)
  period_reach: number;       // pessoas únicas (insights.reach)
  period_likes: number;
  period_comments: number;
  period_avg_views: number;

  total_reels: number;
  total_views: number;
  total_likes: number;

  // Ganho hoje (0–24h) comparado a 24–48h atrás (e snapshot de seguidores).
  delta_views_24h: number;
  delta_likes_24h: number;
  delta_comments_24h: number;
  delta_followers_24h: number | null;

  reach_ratio: number | null;          // % avg_plays/followers
  non_follower_index: number | null;   // avg_plays/followers (raw, 1.0 = bate seguidores)
  engagement_rate: number | null;      // (likes+comments)/plays * 100
  reach_status: Status;
  // Alias para compat com UI antiga ('good'|'warn'|'restricted'|null)
  reach_status_legacy: "good" | "warn" | "restricted" | null;

  hourly_views_24h: { hour: string; views: number }[];

  // Score 0–100 ponderado: avg_plays 35 / engajamento 30 / likes 20 / consistência 15
  score: number;
  composite_score: number; // alias legado
  rank: number;

  last_post_at: string | null;
  pending_in_queue: number;
};

function periodHours(p: Period): number {
  if (p === "1d") return 24;
  if (p === "3d") return 72;
  if (p === "5d") return 120;
  return 720; // 30d
}

function statusFor(input: {
  reels: number;
  plays: number;
  likes: number;
  nfi: number | null;
  eng: number | null;
}): Status {
  if (input.reels === 0) return "sem_dados";
  // 0 views mas tem likes → problema de permissão/insight do token
  if (input.plays === 0 && input.likes > 0) return "critica";
  if (input.nfi === null) return "sem_dados";
  if (input.nfi >= 0.8 && (input.eng ?? 0) >= 2) return "saudavel";
  if (input.nfi >= 0.3) return "atencao";
  return "restrita";
}

function legacyStatus(s: Status): "good" | "warn" | "restricted" | null {
  if (s === "saudavel") return "good";
  if (s === "atencao") return "warn";
  if (s === "restrita" || s === "critica") return "restricted";
  return null;
}

function normalize(values: number[]): number[] {
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (max === min) return values.map(() => 50);
  return values.map((v) => ((v - min) / (max - min)) * 100);
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
        const raw = url.searchParams.get("period") ?? "1d";
        const period: Period =
          raw === "1d" || raw === "3d" || raw === "5d" || raw === "30d" ? raw : "1d";
        const hours = periodHours(period);

        const db = requireDb();
        const periodCutoff = new Date(Date.now() - hours * 3600_000).toISOString();
        const day24Cutoff = new Date(Date.now() - 24 * 3600_000).toISOString();

        const accountsRes = await db
          .prepare(
            `SELECT id, username, name, profile_picture, followers, health_score, token_status, last_post_at
             FROM accounts`,
          )
          .all<{
            id: string;
            username: string;
            name: string;
            profile_picture: string | null;
            followers: number;
            health_score: number;
            token_status: "valid" | "expired";
            last_post_at: string | null;
          }>();
        const accounts = accountsRes.results ?? [];

        // Usa COALESCE(plays, reach) — fallback para contas que ainda não têm plays gravado.
        const periodAggRes = await db
          .prepare(
            `SELECT account_id,
                    COUNT(*) AS reels,
                    COALESCE(SUM(COALESCE(NULLIF(plays,0), reach)), 0) AS views,
                    COALESCE(SUM(reach), 0) AS reach,
                    COALESCE(SUM(likes), 0) AS likes,
                    COALESCE(SUM(comments), 0) AS comments
             FROM history
             WHERE published_at >= ?
             GROUP BY account_id`,
          )
          .bind(periodCutoff)
          .all<{
            account_id: string;
            reels: number;
            views: number;
            reach: number;
            likes: number;
            comments: number;
          }>();
        const periodAgg = new Map(
          (periodAggRes.results ?? []).map((r) => [r.account_id, r]),
        );

        const totalAggRes = await db
          .prepare(
            `SELECT account_id,
                    COUNT(*) AS reels,
                    COALESCE(SUM(COALESCE(NULLIF(plays,0), reach)), 0) AS views,
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
                    COALESCE(SUM(COALESCE(NULLIF(plays,0), reach)), 0) AS views
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

        // Ganho diário (0–24h vs 24–48h) por conta — usa published_at em history.
        const day48Cutoff = new Date(Date.now() - 48 * 3600_000).toISOString();
        const todayAggRes = await db
          .prepare(
            `SELECT account_id,
                    COALESCE(SUM(COALESCE(NULLIF(plays,0), reach)), 0) AS views,
                    COALESCE(SUM(likes), 0) AS likes,
                    COALESCE(SUM(comments), 0) AS comments
             FROM history
             WHERE published_at >= ?
             GROUP BY account_id`,
          )
          .bind(day24Cutoff)
          .all<{ account_id: string; views: number; likes: number; comments: number }>();
        const todayMap = new Map((todayAggRes.results ?? []).map((r) => [r.account_id, r]));
        const yestAggRes = await db
          .prepare(
            `SELECT account_id,
                    COALESCE(SUM(COALESCE(NULLIF(plays,0), reach)), 0) AS views,
                    COALESCE(SUM(likes), 0) AS likes,
                    COALESCE(SUM(comments), 0) AS comments
             FROM history
             WHERE published_at >= ? AND published_at < ?
             GROUP BY account_id`,
          )
          .bind(day48Cutoff, day24Cutoff)
          .all<{ account_id: string; views: number; likes: number; comments: number }>();
        const yestMap = new Map((yestAggRes.results ?? []).map((r) => [r.account_id, r]));

        // Snapshot de seguidores de ontem (mais recente em até 48h atrás).
        const yesterdayDate = new Date(Date.now() - 24 * 3600_000)
          .toISOString()
          .slice(0, 10);
        const followersSnapMap = new Map<string, number>();
        try {
          const snapRes = await db
            .prepare(
              `SELECT account_id, followers
               FROM followers_snapshots
               WHERE snapshot_date <= ?
               GROUP BY account_id
               HAVING snapshot_date = MAX(snapshot_date)`,
            )
            .bind(yesterdayDate)
            .all<{ account_id: string; followers: number }>();
          for (const r of snapRes.results ?? []) followersSnapMap.set(r.account_id, r.followers);
        } catch {
          // tabela ainda não existe — ignora
        }

        // Pré-cálculo bruto
        const pre = accounts.map((a) => {
          const pa = periodAgg.get(a.id);
          const ta = totalAgg.get(a.id);
          const period_reels = pa?.reels ?? 0;
          const period_views = pa?.views ?? 0;
          const period_reach = pa?.reach ?? 0;
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
            period_reach,
            period_likes,
            period_comments,
            period_avg_views,
            non_follower_index,
            reach_ratio,
            engagement_rate,
          };
        });

        // Score sem NF-Index (avg_plays 35 / eng 30 / likes 20 / reels 15).
        const avgPlaysNorm = normalize(pre.map((p) => p.period_avg_views));
        const engagementNorm = normalize(pre.map((p) => p.engagement_rate ?? 0));
        const likesNorm = normalize(pre.map((p) => p.period_likes));
        const reelsNorm = normalize(pre.map((p) => p.period_reels));

        const rows: AccountRankingData[] = pre.map((p, i) => {
          const { a, ta } = p;
          const score =
            p.period_reels === 0
              ? 0
              : avgPlaysNorm[i] * 0.35 +
                engagementNorm[i] * 0.3 +
                likesNorm[i] * 0.2 +
                reelsNorm[i] * 0.15;

          const sparkRaw = hourlyByAcc.get(a.id) ?? [];
          const sparkMap = new Map(sparkRaw.map((r) => [r.hour, r.views]));
          const hourly_views_24h = buckets.map((h) => ({ hour: h, views: sparkMap.get(h) ?? 0 }));

          const status = statusFor({
            reels: p.period_reels,
            plays: p.period_views,
            likes: p.period_likes,
            nfi: p.non_follower_index,
            eng: p.engagement_rate,
          });

          return {
            id: a.id,
            username: a.username,
            name: a.name,
            profile_picture: a.profile_picture,
            followers: a.followers ?? 0,
            health_score: a.health_score ?? 100,
            token_status: a.token_status ?? "valid",
            period_reels: p.period_reels,
            period_views: p.period_views,
            period_reach: p.period_reach,
            period_likes: p.period_likes,
            period_comments: p.period_comments,
            period_avg_views: p.period_avg_views,
            total_reels: ta?.reels ?? 0,
            total_views: ta?.views ?? 0,
            total_likes: ta?.likes ?? 0,
            reach_ratio: p.reach_ratio,
            non_follower_index: p.non_follower_index,
            engagement_rate: p.engagement_rate,
            reach_status: status,
            reach_status_legacy: legacyStatus(status),
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
