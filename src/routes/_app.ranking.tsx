import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  Trophy,
  Search,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Minus,
  Eye,
  Heart,
  MessageCircle,
  Users as UsersIcon,
  Film,
  Activity,
  AlertTriangle,
} from "lucide-react";
import { useRanking, useDailyRanking, type Period } from "@/hooks/use-ranking";
import type { AccountRankingData } from "@/routes/api/ranking";
import type { DailyAccountData } from "@/routes/api/ranking.daily";

export const Route = createFileRoute("/_app/ranking")({
  component: RankingPage,
  head: () => ({ meta: [{ title: "Ranking · Insta Manager" }] }),
});

type Tab = "geral" | "alcance" | "metrica" | "diario";
type StatusFilter = "all" | "good" | "warn" | "restricted";
type MetricKey = "views" | "reach" | "followers" | "likes" | "reels" | "eng";

const PERIODS: { id: Period; label: string }[] = [
  { id: "24h", label: "24h" },
  { id: "48h", label: "48h" },
  { id: "72h", label: "72h" },
];

const fmt = (n: number) =>
  n >= 1_000_000
    ? (n / 1_000_000).toFixed(1) + "M"
    : n >= 1_000
      ? (n / 1_000).toFixed(1) + "k"
      : String(Math.round(n));

const fmtPct = (n: number | null) => (n === null ? "—" : `${n.toFixed(1)}%`);

function statusColor(s: AccountRankingData["reach_status"]): string {
  if (s === "good") return "var(--success)";
  if (s === "warn") return "var(--warning)";
  if (s === "restricted") return "var(--danger)";
  return "var(--muted2)";
}
function statusLabel(s: AccountRankingData["reach_status"]): string {
  if (s === "good") return "🟢 Entregando para não-seguidores";
  if (s === "warn") return "🟡 Alcance moderado";
  if (s === "restricted") return "🔴 Possível restrição";
  return "— sem dados no período";
}
function statusBgCell(s: AccountRankingData["reach_status"]): string {
  if (s === "good") return "color-mix(in oklab, var(--success) 25%, transparent)";
  if (s === "warn") return "color-mix(in oklab, var(--warning) 25%, transparent)";
  if (s === "restricted") return "color-mix(in oklab, var(--danger) 25%, transparent)";
  return "var(--bg3)";
}

function Sparkline({ data }: { data: { hour: string; views: number }[] }) {
  const max = Math.max(1, ...data.map((d) => d.views));
  return (
    <div className="flex items-end gap-[2px] h-10">
      {data.map((d, i) => (
        <div
          key={i}
          className="w-1 rounded-sm"
          style={{
            height: `${(d.views / max) * 100}%`,
            background: "var(--accent2)",
            opacity: d.views > 0 ? 0.85 : 0.2,
            minHeight: 2,
          }}
          title={`${d.hour}: ${fmt(d.views)} views`}
        />
      ))}
    </div>
  );
}

function RankDelta({ delta }: { delta: number | null }) {
  if (delta === null)
    return <span className="text-muted2 text-xs">—</span>;
  if (delta === 0)
    return (
      <span className="inline-flex items-center gap-1 text-muted2 text-xs">
        <Minus className="h-3 w-3" />=
      </span>
    );
  if (delta > 0)
    return (
      <span className="inline-flex items-center gap-1 text-xs" style={{ color: "var(--success)" }}>
        <TrendingUp className="h-3 w-3" />+{delta}
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 text-xs" style={{ color: "var(--danger)" }}>
      <TrendingDown className="h-3 w-3" />
      {delta}
    </span>
  );
}

function Avatar({ src, alt, size = 36 }: { src: string | null; alt: string; size?: number }) {
  return src ? (
    <img
      src={src}
      alt={alt}
      style={{ width: size, height: size }}
      className="rounded-full bg-bg3 ring-1 ring-border object-cover"
    />
  ) : (
    <div
      style={{ width: size, height: size }}
      className="rounded-full bg-bg3 ring-1 ring-border flex items-center justify-center text-xs text-muted2"
    >
      {alt.slice(0, 2).toUpperCase()}
    </div>
  );
}

function MedalBadge({ rank }: { rank: number }) {
  const colors = ["#facc15", "#cbd5e1", "#d97706"];
  if (rank > 3) return null;
  return (
    <span
      className="inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-bold text-black"
      style={{ background: colors[rank - 1] }}
    >
      {rank === 1 ? "🥇" : rank === 2 ? "🥈" : "🥉"}
    </span>
  );
}

function Podium({ top: top3 }: { top: AccountRankingData[] }) {
  if (top3.length === 0) return null;
  const positions = [top3[1], top3[0], top3[2]].filter(Boolean);
  const heights = [120, 160, 100];
  return (
    <div className="flex items-end justify-center gap-4 py-6">
      {positions.map((acc, idx) => {
        const realRank = acc === top3[0] ? 1 : acc === top3[1] ? 2 : 3;
        return (
          <div key={acc.id} className="flex flex-col items-center gap-2">
            <Avatar src={acc.profile_picture} alt={acc.username} size={realRank === 1 ? 64 : 48} />
            <div className="text-center">
              <div className="text-sm font-semibold truncate max-w-[120px]">@{acc.username}</div>
              <div className="text-xs" style={{ color: statusColor(acc.reach_status) }}>
                {fmtPct(acc.reach_ratio)}
              </div>
            </div>
            <div
              className="w-20 rounded-t-lg flex items-start justify-center pt-2 text-2xl font-bold"
              style={{
                height: heights[idx],
                background:
                  realRank === 1
                    ? "linear-gradient(180deg, #facc15, #ca8a04)"
                    : realRank === 2
                      ? "linear-gradient(180deg, #e2e8f0, #94a3b8)"
                      : "linear-gradient(180deg, #fb923c, #c2410c)",
                color: "#000",
              }}
            >
              {realRank}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function RankingPage() {
  const [period, setPeriod] = useState<Period>("48h");
  const [tab, setTab] = useState<Tab>("geral");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [metric, setMetric] = useState<MetricKey>("views");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const { data: ranking = [], isLoading, refetch, isFetching } = useRanking(period);
  const { data: daily } = useDailyRanking();

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return ranking.filter((r) => {
      if (q && !r.username.toLowerCase().includes(q) && !r.name.toLowerCase().includes(q))
        return false;
      if (statusFilter !== "all" && r.reach_status !== statusFilter) return false;
      return true;
    });
  }, [ranking, search, statusFilter]);

  const top3 = ranking.slice(0, 3);
  const restricted = ranking.filter((r) => r.reach_status === "restricted");

  return (
    <div className="space-y-6 pb-24">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Trophy className="h-6 w-6" style={{ color: "var(--accent2)" }} />
            Ranking
          </h1>
          <p className="text-sm text-muted2">
            {ranking.length} contas · janela {period}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Seletor janela */}
          <div className="inline-flex rounded-lg border border-border bg-bg2 p-1">
            {PERIODS.map((p) => (
              <button
                key={p.id}
                onClick={() => setPeriod(p.id)}
                disabled={tab === "diario"}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition ${
                  period === p.id ? "bg-bg3 text-foreground" : "text-text2 hover:text-foreground"
                } ${tab === "diario" ? "opacity-40 cursor-not-allowed" : ""}`}
              >
                {p.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => refetch()}
            className="inline-flex items-center gap-1 rounded-lg border border-border bg-bg2 px-3 py-1.5 text-xs hover:bg-bg3"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
            Atualizar
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border overflow-x-auto">
        {(
          [
            { id: "geral", label: "Ranking Geral" },
            { id: "alcance", label: "Alcance & Restrição" },
            { id: "metrica", label: "Por Métrica" },
            { id: "diario", label: "Histórico Diário" },
          ] as { id: Tab; label: string }[]
        ).map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-sm whitespace-nowrap border-b-2 transition ${
              tab === t.id
                ? "border-[var(--accent2)] text-foreground"
                : "border-transparent text-text2 hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Filtros secundários (não na aba diário) */}
      {tab !== "diario" && (
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted2" />
            <input
              type="text"
              placeholder="Buscar conta…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg border border-border bg-bg2 pl-9 pr-3 py-2 text-sm placeholder:text-muted2 focus:outline-none focus:border-border2"
            />
          </div>
          <div className="inline-flex rounded-lg border border-border bg-bg2 p-1">
            {(
              [
                { id: "all", label: "Todos" },
                { id: "good", label: "Saudáveis" },
                { id: "warn", label: "Atenção" },
                { id: "restricted", label: "Restritas" },
              ] as { id: StatusFilter; label: string }[]
            ).map((f) => (
              <button
                key={f.id}
                onClick={() => setStatusFilter(f.id)}
                className={`px-3 py-1.5 rounded-md text-xs ${
                  statusFilter === f.id
                    ? "bg-bg3 text-foreground"
                    : "text-text2 hover:text-foreground"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Empty */}
      {!isLoading && ranking.length === 0 && (
        <div className="rounded-xl border border-border bg-bg2 p-10 text-center text-muted2">
          Nenhum post publicado ainda — os dados aparecerão após o primeiro reel.
        </div>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-14 rounded-lg bg-bg2 animate-pulse" />
          ))}
        </div>
      )}

      {/* TAB 1 — Geral */}
      {tab === "geral" && !isLoading && ranking.length > 0 && (
        <div className="space-y-4">
          <div className="rounded-xl border border-border bg-bg2">
            <Podium top={top3} />
          </div>
          <div className="rounded-xl border border-border bg-bg2 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-bg3 text-text2 text-xs uppercase">
                  <tr>
                    <th className="px-3 py-2 text-left">#</th>
                    <th className="px-3 py-2 text-left">Conta</th>
                    <th className="px-3 py-2 text-right">Seguidores</th>
                    <th className="px-3 py-2 text-right">Views</th>
                    <th className="px-3 py-2 text-right">Avg/Reel</th>
                    <th className="px-3 py-2 text-right">Curtidas</th>
                    <th className="px-3 py-2 text-right">Reach</th>
                    <th className="px-3 py-2 text-right">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => (
                    <>
                      <tr
                        key={r.id}
                        onClick={() => setExpanded(expanded === r.id ? null : r.id)}
                        className="border-t border-border hover:bg-bg3 cursor-pointer"
                      >
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-1.5">
                            <span className="text-sm font-semibold">{r.rank}</span>
                            <MedalBadge rank={r.rank} />
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-2">
                            <Avatar src={r.profile_picture} alt={r.username} size={28} />
                            <div className="min-w-0">
                              <div className="truncate text-sm">@{r.username}</div>
                              <div className="truncate text-[11px] text-muted2">{r.name}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{fmt(r.followers)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{fmt(r.period_views)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {fmt(r.period_avg_views)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{fmt(r.period_likes)}</td>
                        <td
                          className="px-3 py-2 text-right tabular-nums font-medium"
                          style={{ color: statusColor(r.reach_status) }}
                        >
                          {fmtPct(r.reach_ratio)}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <span
                            className="inline-block h-2 w-2 rounded-full"
                            style={{ background: statusColor(r.reach_status) }}
                          />
                        </td>
                      </tr>
                      {expanded === r.id && (
                        <tr className="bg-bg3/40">
                          <td colSpan={8} className="px-4 py-3">
                            <div className="flex items-center gap-4">
                              <Sparkline data={r.hourly_views_24h} />
                              <div className="text-xs text-muted2 space-y-0.5">
                                <div>📈 Últimas 24h por hora</div>
                                <div>
                                  Reels no período: <b>{r.period_reels}</b> ·
                                  Comentários: <b>{fmt(r.period_comments)}</b>
                                </div>
                                <div>
                                  Total histórico: <b>{r.total_reels}</b> reels ·{" "}
                                  <b>{fmt(r.total_views)}</b> views
                                </div>
                                <div>
                                  Score composto: <b>{fmt(r.composite_score)}</b> · Fila:{" "}
                                  <b>{r.pending_in_queue}</b>
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2 — Alcance */}
      {tab === "alcance" && !isLoading && ranking.length > 0 && (
        <div className="space-y-4">
          {restricted.length > 0 && (
            <div
              className="rounded-xl border p-3 flex items-start gap-2"
              style={{
                borderColor: "var(--danger)",
                background: "color-mix(in oklab, var(--danger) 12%, transparent)",
              }}
            >
              <AlertTriangle className="h-4 w-4 mt-0.5" style={{ color: "var(--danger)" }} />
              <div className="text-sm">
                <b>🚨 {restricted.length}</b> conta(s) com possível restrição de alcance. Views
                médias muito abaixo do esperado para o número de seguidores.
              </div>
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {[...filtered]
              .sort((a, b) => {
                const order = { restricted: 0, warn: 1, good: 2, null: 3 };
                const ka = order[(a.reach_status ?? "null") as keyof typeof order];
                const kb = order[(b.reach_status ?? "null") as keyof typeof order];
                if (ka !== kb) return ka - kb;
                return (a.reach_ratio ?? 0) - (b.reach_ratio ?? 0);
              })
              .map((r) => (
                <div
                  key={r.id}
                  className="rounded-xl border border-border bg-bg2 p-4 space-y-3"
                  style={{ borderLeftColor: statusColor(r.reach_status), borderLeftWidth: 4 }}
                >
                  <div className="flex items-center gap-2">
                    <Avatar src={r.profile_picture} alt={r.username} size={36} />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold truncate">@{r.username}</div>
                      <div className="text-[11px] text-muted2">{fmt(r.followers)} seguidores</div>
                    </div>
                  </div>
                  <div
                    className="text-3xl font-bold tabular-nums"
                    style={{ color: statusColor(r.reach_status) }}
                  >
                    {fmtPct(r.reach_ratio)}
                  </div>
                  <div className="text-xs" style={{ color: statusColor(r.reach_status) }}>
                    {statusLabel(r.reach_status)}
                  </div>
                  <Sparkline data={r.hourly_views_24h} />
                  <div className="text-[11px] text-muted2">
                    Média período: <b>{fmt(r.period_avg_views)}</b> views/reel · Reels:{" "}
                    <b>{r.period_reels}</b>
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* TAB 3 — Por Métrica */}
      {tab === "metrica" && !isLoading && ranking.length > 0 && (
        <MetricTab metric={metric} setMetric={setMetric} accounts={filtered} />
      )}

      {/* TAB 4 — Diário */}
      {tab === "diario" && (
        <DailyTab
          data={daily}
          selectedDay={selectedDay}
          setSelectedDay={setSelectedDay}
          search={search}
          setSearch={setSearch}
        />
      )}
    </div>
  );
}

function MetricTab({
  metric,
  setMetric,
  accounts,
}: {
  metric: MetricKey;
  setMetric: (m: MetricKey) => void;
  accounts: AccountRankingData[];
}) {
  const metricOptions: { id: MetricKey; label: string; Icon: typeof Eye }[] = [
    { id: "views", label: "Mais views", Icon: Eye },
    { id: "reach", label: "Melhor reach", Icon: Activity },
    { id: "followers", label: "Mais seguidores", Icon: UsersIcon },
    { id: "likes", label: "Mais curtidas", Icon: Heart },
    { id: "reels", label: "Mais reels", Icon: Film },
    { id: "eng", label: "Maior engajamento", Icon: MessageCircle },
  ];

  const valueFor = (a: AccountRankingData): number => {
    switch (metric) {
      case "views":
        return a.period_views;
      case "reach":
        return a.reach_ratio ?? 0;
      case "followers":
        return a.followers;
      case "likes":
        return a.period_likes;
      case "reels":
        return a.period_reels;
      case "eng":
        return a.period_views > 0
          ? ((a.period_likes + a.period_comments) / a.period_views) * 100
          : 0;
    }
  };
  const fmtMetric = (n: number) =>
    metric === "reach" || metric === "eng" ? n.toFixed(2) + "%" : fmt(n);

  const sorted = [...accounts].sort((a, b) => valueFor(b) - valueFor(a));
  const max = Math.max(1, ...sorted.map(valueFor));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {metricOptions.map(({ id, label, Icon }) => (
          <button
            key={id}
            onClick={() => setMetric(id)}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs transition ${
              metric === id
                ? "border-[var(--accent2)] bg-bg3 text-foreground"
                : "border-border bg-bg2 text-text2 hover:text-foreground"
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
      </div>
      <div className="rounded-xl border border-border bg-bg2 p-3 space-y-2">
        {sorted.map((a, idx) => {
          const v = valueFor(a);
          const pct = (v / max) * 100;
          return (
            <div
              key={a.id}
              className="flex items-center gap-3 transition-all duration-300"
              style={{ order: idx }}
            >
              <div className="w-6 text-right text-xs text-muted2 tabular-nums">{idx + 1}</div>
              <Avatar src={a.profile_picture} alt={a.username} size={28} />
              <div className="min-w-[120px] text-sm truncate">@{a.username}</div>
              <div className="flex-1 h-2 rounded-full bg-bg3 overflow-hidden">
                <div
                  className="h-full transition-all duration-500"
                  style={{
                    width: `${pct}%`,
                    background: "linear-gradient(90deg, var(--accent2), var(--accent))",
                  }}
                />
              </div>
              <div className="w-20 text-right text-sm tabular-nums">{fmtMetric(v)}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DailyTab({
  data,
  selectedDay,
  setSelectedDay,
  search,
  setSearch,
}: {
  data?: { [k: string]: { date: string; label: string; accounts: DailyAccountData[] } };
  selectedDay: string | null;
  setSelectedDay: (d: string) => void;
  search: string;
  setSearch: (s: string) => void;
}) {
  if (!data) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-14 rounded-lg bg-bg2 animate-pulse" />
        ))}
      </div>
    );
  }
  const days = Object.values(data).sort((a, b) => b.date.localeCompare(a.date));
  if (days.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-bg2 p-10 text-center text-muted2">
        Nenhum dado dos últimos 7 dias.
      </div>
    );
  }
  const current = selectedDay
    ? (data[selectedDay] ?? days[0])
    : days[0];

  // todas as contas únicas para o heatmap
  const allAccountIds = new Map<string, DailyAccountData>();
  for (const d of days)
    for (const a of d.accounts)
      if (!allAccountIds.has(a.id)) allAccountIds.set(a.id, a);

  const q = search.trim().toLowerCase();
  const filteredAccounts = current.accounts.filter(
    (a) => !q || a.username.toLowerCase().includes(q),
  );
  const top3 = current.accounts.slice(0, 3);

  return (
    <div className="space-y-4">
      {/* Day selector */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {days.map((d) => (
          <button
            key={d.date}
            onClick={() => setSelectedDay(d.date)}
            className={`shrink-0 rounded-lg px-3 py-2 text-sm border transition ${
              current.date === d.date
                ? "border-[var(--accent2)] bg-bg3 text-foreground"
                : "border-border bg-bg2 text-text2 hover:text-foreground"
            }`}
          >
            {d.label}
          </button>
        ))}
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted2" />
        <input
          type="text"
          placeholder="Buscar conta…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-lg border border-border bg-bg2 pl-9 pr-3 py-2 text-sm placeholder:text-muted2 focus:outline-none focus:border-border2"
        />
      </div>

      {/* Podium do dia */}
      {top3.length > 0 && (
        <div className="rounded-xl border border-border bg-bg2">
          <Podium
            top={top3.map((a) => ({
              ...a,
              period_views: a.daily_views,
              period_avg_views: a.daily_avg_views,
              period_likes: a.daily_likes,
              period_reels: a.daily_reels,
              period_comments: a.daily_comments,
              total_reels: 0,
              total_views: 0,
              total_likes: 0,
              composite_score: a.daily_composite_score,
              hourly_views_24h: [],
              health_score: 100,
              last_post_at: null,
              pending_in_queue: 0,
            })) as unknown as AccountRankingData[]}
          />
        </div>
      )}

      {/* Tabela do dia */}
      <div className="rounded-xl border border-border bg-bg2 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-bg3 text-text2 text-xs uppercase">
              <tr>
                <th className="px-3 py-2 text-left">#</th>
                <th className="px-3 py-2 text-left">Δ</th>
                <th className="px-3 py-2 text-left">Conta</th>
                <th className="px-3 py-2 text-right">Reels</th>
                <th className="px-3 py-2 text-right">Views</th>
                <th className="px-3 py-2 text-right">Avg/Reel</th>
                <th className="px-3 py-2 text-right">Curtidas</th>
                <th className="px-3 py-2 text-right">Reach</th>
              </tr>
            </thead>
            <tbody>
              {filteredAccounts.map((a) => (
                <tr key={a.id} className="border-t border-border hover:bg-bg3">
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-semibold">{a.rank}</span>
                      <MedalBadge rank={a.rank} />
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <RankDelta delta={a.rank_delta} />
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <Avatar src={a.profile_picture} alt={a.username} size={28} />
                      <div className="text-sm truncate">@{a.username}</div>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{a.daily_reels}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmt(a.daily_views)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmt(a.daily_avg_views)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmt(a.daily_likes)}</td>
                  <td
                    className="px-3 py-2 text-right tabular-nums"
                    style={{ color: statusColor(a.reach_status) }}
                  >
                    {fmtPct(a.reach_ratio)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Heatmap semanal */}
      <div className="rounded-xl border border-border bg-bg2 p-3 overflow-x-auto">
        <div className="text-xs text-muted2 mb-2">Heatmap semanal · reach por dia</div>
        <table className="text-xs">
          <thead>
            <tr>
              <th className="px-2 py-1 text-left text-muted2 font-normal">Conta</th>
              {[...days].reverse().map((d) => (
                <th
                  key={d.date}
                  className="px-1 py-1 text-center text-muted2 font-normal whitespace-nowrap"
                >
                  {d.label.replace("Hoje", "Hoje").split(" ")[0]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[...allAccountIds.values()]
              .filter((a) => !q || a.username.toLowerCase().includes(q))
              .map((acc) => (
                <tr key={acc.id}>
                  <td className="px-2 py-1 whitespace-nowrap">@{acc.username}</td>
                  {[...days].reverse().map((d) => {
                    const cell = d.accounts.find((x) => x.id === acc.id);
                    const status = cell?.reach_status ?? null;
                    return (
                      <td key={d.date} className="px-1 py-1">
                        <div
                          className="rounded text-center text-[10px] py-1 px-1.5 min-w-[44px]"
                          style={{
                            background: statusBgCell(status),
                            color: status ? "var(--foreground)" : "var(--muted2)",
                          }}
                          title={`@${acc.username} · ${d.label} · reach: ${fmtPct(cell?.reach_ratio ?? null)} · ${cell?.daily_reels ?? 0} reels`}
                        >
                          {cell?.reach_ratio != null ? cell.reach_ratio.toFixed(0) + "%" : "—"}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
