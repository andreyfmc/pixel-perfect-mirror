import { useQuery } from "@tanstack/react-query";
import type { AccountRankingData } from "@/routes/api/ranking";
import type { DailyRankingResponse } from "@/routes/api/ranking.daily";

export type Period = "24h" | "7d" | "30d";

export function useRanking(period: Period) {
  return useQuery({
    queryKey: ["ranking", period],
    queryFn: async () => {
      const res = await fetch(`/api/ranking?period=${period}`);
      if (!res.ok) throw new Error("falha ao carregar ranking");
      const data = (await res.json()) as { ranking: AccountRankingData[]; period: Period };
      return data.ranking;
    },
    staleTime: 2 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}

export function useDailyRanking() {
  return useQuery({
    queryKey: ["ranking-daily"],
    queryFn: async () => {
      const res = await fetch(`/api/ranking/daily`);
      if (!res.ok) throw new Error("falha ao carregar ranking diário");
      return (await res.json()) as DailyRankingResponse;
    },
    staleTime: 5 * 60 * 1000,
    refetchInterval: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}
