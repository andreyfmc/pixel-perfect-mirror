// GET /api/ranking/daily — ranking dia a dia dos últimos 7 dias (UTC).
// Usa history_snapshots para medir o crescimento real por dia (delta de plays/likes/comments
// por reel). Se ainda não houver snapshots, faz fallback para published_at (lógica antiga).
import { createFileRoute } from "@tanstack/react-router";
import { requireDb, hasDb } from "@/lib/cf.server";

export type DailyAccountData = {
  id: string;
  username: string;
  name: string;
  profile_picture: string | null;
  followers: number;

  daily_reels: number;        // reels que tiveram crescimento naquele dia
  daily_views: number;        // delta de plays naquele dia
  daily_likes: number;
  daily_comments: number;
  daily_avg_views: number;

  reach_ratio: number | null;
  reach_status: "good" | "warn" | "restricted" | null;

  daily_composite_score: number;
  rank: number;
  rank_delta: number | null;
};

export type DailyRankingResponse = {
  [date: string]: {
    date: string;
    label: string;
    accounts: DailyAccountData[];
  };
};

function reachStatusFor(ratio: number | null): DailyAccountData["reach_status"] {
  if (ratio === null) return null;
  if (ratio >= 30) return "good";
  if (ratio >= 10) return "warn";
  return "restricted";
}

const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
function labelFor(date: string, today: string, yesterday: string): string {
  if (date === today) return "Hoje";
  if (date === yesterday) return "Ontem";
  const d = new Date(date + "T00:00:00Z");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${WEEKDAYS[d.getUTCDay()]} ${dd}/${mm}`;
}

type DailyAgg = { reels: number; views: number; likes: number; comments: number };

export const Route = createFileRoute("/api/ranking/daily")({
  server: {
    handlers: {
      GET: async () => {
        if (!hasDb()) {
          return new Response(JSON.stringify({}), {
            headers: { "content-type": "application/json" },
          });
        }
        const db = requireDb();
        const accountsRes = await db
          .prepare(
            `SELECT id, username, name, profile_picture, followers FROM accounts`,
          )
          .all<{
            id: string;
            username: string;
            name: string;
            profile_picture: string | null;
            followers: number;
          }>();
        const accounts = accountsRes.results ?? [];

        const now = new Date();
        const todayUtc = now.toISOString().slice(0, 10);
        const dates: string[] = [];
        for (let i = 0; i < 7; i++) {
          const d = new Date(now.getTime() - i * 86400_000);
          dates.push(d.toISOString().slice(0, 10));
        }
        const yesterdayUtc = dates[1];
        const oldest = dates[dates.length - 1];
        // Inclui o dia anterior ao mais antigo para calcular delta correto.
        const lagCutoff = new Date(now.getTime() - 7 * 86400_000)
          .toISOString()
          .slice(0, 10);

        // 1) Tenta usar snapshots (medição real de crescimento diário).
        let dailyByAcc = new Map<string, Map<string, DailyAgg>>();
        let usedSnapshots = false;

        try {
          const snapRes = await db
            .prepare(
              `WITH per_media AS (
                 SELECT account_id, ig_media_id, snapshot_date,
                        plays, likes, comments,
                        LAG(plays)    OVER (PARTITION BY ig_media_id ORDER BY snapshot_date) AS prev_plays,
                        LAG(likes)    OVER (PARTITION BY ig_media_id ORDER BY snapshot_date) AS prev_likes,
                        LAG(comments) OVER (PARTITION BY ig_media_id ORDER BY snapshot_date) AS prev_comments
                 FROM history_snapshots
                 WHERE snapshot_date >= ?
               )
               SELECT account_id, snapshot_date AS date,
                      COUNT(DISTINCT ig_media_id) AS reels,
                      SUM(MAX(plays    - COALESCE(prev_plays, 0), 0))    AS views,
                      SUM(MAX(likes    - COALESCE(prev_likes, 0), 0))    AS likes,
                      SUM(MAX(comments - COALESCE(prev_comments, 0), 0)) AS comments
               FROM per_media
               WHERE snapshot_date >= ?
               GROUP BY account_id, snapshot_date`,
            )
            .bind(lagCutoff, oldest)
            .all<{
              account_id: string;
              date: string;
              reels: number;
              views: number;
              likes: number;
              comments: number;
            }>();

          const rows = snapRes.results ?? [];
          if (rows.length > 0) {
            usedSnapshots = true;
            for (const r of rows) {
              let m = dailyByAcc.get(r.account_id);
              if (!m) {
                m = new Map();
                dailyByAcc.set(r.account_id, m);
              }
              m.set(r.date, {
                reels: r.reels ?? 0,
                views: r.views ?? 0,
                likes: r.likes ?? 0,
                comments: r.comments ?? 0,
              });
            }
          }
        } catch {
          // Tabela ou window function indisponível — segue pro fallback.
          usedSnapshots = false;
        }

        // 2) Fallback: agrega por published_at (reels publicados naquele dia).
        if (!usedSnapshots) {
          dailyByAcc = new Map();
          for (const date of dates) {
            const aggRes = await db
              .prepare(
                `SELECT account_id,
                        COUNT(*) AS reels,
                        COALESCE(SUM(COALESCE(NULLIF(plays,0), reach)), 0) AS views,
                        COALESCE(SUM(likes), 0) AS likes,
                        COALESCE(SUM(comments), 0) AS comments
                 FROM history
                 WHERE date(published_at) = ?
                 GROUP BY account_id`,
              )
              .bind(date)
              .all<{
                account_id: string;
                reels: number;
                views: number;
                likes: number;
                comments: number;
              }>();
            for (const r of aggRes.results ?? []) {
              let m = dailyByAcc.get(r.account_id);
              if (!m) {
                m = new Map();
                dailyByAcc.set(r.account_id, m);
              }
              m.set(date, {
                reels: r.reels ?? 0,
                views: r.views ?? 0,
                likes: r.likes ?? 0,
                comments: r.comments ?? 0,
              });
            }
          }
        }

        const byDate: DailyRankingResponse = {};
        const ranksByDate = new Map<string, Map<string, number>>();

        for (const date of dates) {
          const rows: DailyAccountData[] = accounts.map((a) => {
            const x = dailyByAcc.get(a.id)?.get(date);
            const daily_reels = x?.reels ?? 0;
            const daily_views = x?.views ?? 0;
            const daily_likes = x?.likes ?? 0;
            const daily_comments = x?.comments ?? 0;
            const daily_avg_views = daily_reels > 0 ? daily_views / daily_reels : 0;
            const reach_ratio =
              daily_reels > 0 && a.followers > 0
                ? (daily_avg_views / a.followers) * 100
                : null;
            const daily_composite_score =
              daily_avg_views * 0.5 +
              (a.followers ?? 0) * 0.2 +
              daily_likes * 0.15 +
              (reach_ratio ?? 0) * 1000 * 0.15;
            return {
              id: a.id,
              username: a.username,
              name: a.name,
              profile_picture: a.profile_picture,
              followers: a.followers ?? 0,
              daily_reels,
              daily_views,
              daily_likes,
              daily_comments,
              daily_avg_views,
              reach_ratio,
              reach_status: reachStatusFor(reach_ratio),
              daily_composite_score,
              rank: 0,
              rank_delta: null,
            };
          });

          rows.sort((a, b) => b.daily_composite_score - a.daily_composite_score);
          const rankMap = new Map<string, number>();
          rows.forEach((r, i) => {
            r.rank = i + 1;
            rankMap.set(r.id, r.rank);
          });
          ranksByDate.set(date, rankMap);

          byDate[date] = {
            date,
            label: labelFor(date, todayUtc, yesterdayUtc),
            accounts: rows,
          };
        }

        for (let i = 0; i < dates.length - 1; i++) {
          const date = dates[i];
          const prev = dates[i + 1];
          const prevRanks = ranksByDate.get(prev);
          if (!prevRanks) continue;
          for (const row of byDate[date].accounts) {
            const prevRank = prevRanks.get(row.id);
            row.rank_delta = prevRank ? prevRank - row.rank : null;
          }
        }

        return new Response(JSON.stringify(byDate), {
          headers: { "content-type": "application/json" },
        });
      },
    },
  },
});
