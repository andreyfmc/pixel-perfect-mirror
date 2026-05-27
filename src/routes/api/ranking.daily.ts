// GET /api/ranking/daily — ranking dia a dia dos últimos 7 dias (UTC).
import { createFileRoute } from "@tanstack/react-router";
import { requireDb, hasDb } from "@/lib/cf.server";

export type DailyAccountData = {
  id: string;
  username: string;
  name: string;
  profile_picture: string | null;
  followers: number;

  daily_reels: number;
  daily_views: number;
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

        // Para cada dia, agregar e ranquear.
        const byDate: DailyRankingResponse = {};
        // Mapa para calcular delta: date → (accId → rank)
        const ranksByDate = new Map<string, Map<string, number>>();

        for (const date of dates) {
          const aggRes = await db
            .prepare(
              `SELECT account_id,
                      COUNT(*) AS reels,
                      COALESCE(SUM(reach), 0) AS views,
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
          const agg = new Map((aggRes.results ?? []).map((r) => [r.account_id, r]));

          const rows: DailyAccountData[] = accounts.map((a) => {
            const x = agg.get(a.id);
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

        // Calcular rank_delta = rank_ontem - rank_hoje (positivo = subiu).
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
