import { createFileRoute } from "@tanstack/react-router";
import { Fragment, useMemo, useState } from "react";
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
  Radio,
  ExternalLink,
  X,
} from "lucide-react";
import { useRanking, useDailyRanking, type Period } from "@/hooks/use-ranking";
import type { AccountRankingData } from "@/routes/api/ranking";
import type { DailyAccountData } from "@/routes/api/ranking.daily";

export const Route = createFileRoute("/_app/ranking")({
  component: RankingPage,
  head: () => ({ meta: [{ title: "Ranking · Insta Manager" }] }),
});

type Tab = "geral" | "alcance" | "metrica" | "diario";
type StatusFilter = "all" | "saudavel" | "atencao" | "restrita" | "critica";
type MetricKey = "views" | "reach" | "followers" | "likes" | "reels" | "eng" | "nfi";
type SortKey = "score" | "views" | "followers" | "eng" | "nfi";
type AnyStatus = AccountRankingData["reach_status"] | DailyAccountData["reach_status"];

const PERIODS: { id: Period; label: string }[] = [
  { id: "1d", label: "1d" },
  { id: "3d", label: "3d" },
  { id: "5d", label: "5d" },
  { id: "30d", label: "30d" },
];

const fmt = (n: number) =>
  n >= 1_000_000
    ? (n / 1_000_000).toFixed(1) + "M"
    : n >= 1_000
      ? (n / 1_000).toFixed(1) + "k"
      : String(Math.round(n));

const fmtPct = (n: number | null) => (n === null ? "—" : `${n.toFixed(1)}%`);

function statusColor(s: AnyStatus): string {
  if (s === "saudavel" || s === "good") return "var(--success)";
  if (s === "atencao" || s === "warn") return "var(--warning)";
  if (s === "restrita" || s === "restricted") return "var(--danger)";
  if (s === "critica") return "var(--danger)";
  return "var(--muted2)";
}
function statusLabel(s: AnyStatus): string {
  if (s === "saudavel" || s === "good") return "🟢 Saudável";
  if (s === "atencao" || s === "warn") return "🟡 Atenção";
  if (s === "restrita" || s === "restricted") return "🔴 Restrita";
  if (s === "critica") return "⚠️ Crítica";
  return "⚪ Sem dados";
}
function statusBgCell(s: AnyStatus): string {
  if (s === "saudavel" || s === "good") return "color-mix(in oklab, var(--success) 25%, transparent)";
  if (s === "atencao" || s === "warn") return "color-mix(in oklab, var(--warning) 25%, transparent)";
  if (s === "restrita" || s === "restricted" || s === "critica")
    return "color-mix(in oklab, var(--danger) 25%, transparent)";
  return "var(--bg3)";
}

function nfiColor(nfi: number | null): string {
  if (nfi === null) return "var(--muted2)";
  if (nfi >= 1) return "var(--success)";
  if (nfi >= 0.3) return "var(--warning)";
  return "var(--danger)";
}
function nfiLabel(nfi: number | null): string {
  if (nfi === null) return "—";
  return `${nfi.toFixed(1)}x`;
}

function scoreColor(score: number): string {
  if (score >= 70) return "var(--success)";
  if (score >= 40) return "var(--warning)";
  return "var(--danger)";
}

function engColor(eng: number | null): string {
  if (eng === null) return "var(--muted2)";
  if (eng >= 5) return "var(--success)";
  if (eng >= 2) return "var(--warning)";
  return "var(--danger)";
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
  if (delta === null) return <span className="text-muted2 text-xs">—</span>;
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

function Avatar({
  src,
  alt,
  size = 36,
  ring,
}: {
  src: string | null;
  alt: string;
  size?: number;
  ring?: string;
}) {
  const style: React.CSSProperties = { width: size, height: size };
  if (ring) {
    style.boxShadow = `0 0 0 3px ${ring}, 0 0 0 5px var(--bg2)`;
  }
  return src ? (
    <img
      src={src}
      alt={alt}
      style={style}
      className="rounded-full bg-bg3 object-cover"
    />
  ) : (
    <div
      style={style}
      className="rounded-full bg-bg3 flex items-center justify-center text-xs text-muted2"
    >
      {alt.slice(0, 2).toUpperCase()}
    </div>
  );
}

const RING_COLORS = ["#FFD700", "#C0C0C0", "#CD7F32"];
const MEDAL_EMOJI = ["🥇", "🥈", "🥉"];

function PodiumCard({
  acc,
  position,
  big,
  onClick,
}: {
  acc: AccountRankingData;
  position: 1 | 2 | 3;
  big?: boolean;
  onClick: () => void;
}) {
  const size = big ? 80 : 56;
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex flex-col items-center gap-2 rounded-2xl border border-border bg-bg3/60 px-4 pt-5 pb-4 transition hover:bg-bg3 hover:border-border2"
      style={{
        minWidth: big ? 180 : 140,
        boxShadow: big
          ? "0 12px 40px -12px color-mix(in oklab, #FFD700 30%, transparent)"
          : "0 6px 20px -8px rgba(0,0,0,0.4)",
      }}
    >
      <div className="relative">
        <Avatar src={acc.profile_picture} alt={acc.username} size={size} ring={RING_COLORS[position - 1]} />
        <span
          className="absolute -bottom-1 -right-1 text-lg drop-shadow"
          aria-hidden
        >
          {MEDAL_EMOJI[position - 1]}
        </span>
      </div>
      <div className="text-center min-w-0 w-full">
        <div className={`font-semibold truncate ${big ? "text-base" : "text-sm"}`}>
          @{acc.username}
        </div>
        <div className="text-[11px] text-muted2 truncate">{fmt(acc.followers)} seguidores</div>
      </div>
      <div
        className={`tabular-nums font-bold ${big ? "text-3xl" : "text-2xl"}`}
        style={{ color: scoreColor(acc.score) }}
      >
        {acc.score.toFixed(1)}
      </div>
      <div
        className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold"
        style={{
          color: nfiColor(acc.non_follower_index),
          background: `color-mix(in oklab, ${nfiColor(acc.non_follower_index)} 14%, transparent)`,
        }}
      >
        <Radio className="h-3 w-3" />
        {nfiLabel(acc.non_follower_index)}
      </div>
    </button>
  );
}

function Podium({ top, onPick }: { top: AccountRankingData[]; onPick: (id: string) => void }) {
  if (top.length === 0) return null;
  const [first, second, third] = top;
  return (
    <div className="flex flex-wrap items-end justify-center gap-3 sm:gap-6 py-6 px-3">
      {second && <PodiumCard acc={second} position={2} onClick={() => onPick(second.id)} />}
      {first && <PodiumCard acc={first} position={1} big onClick={() => onPick(first.id)} />}
      {third && <PodiumCard acc={third} position={3} onClick={() => onPick(third.id)} />}
    </div>
  );
}

function NfiBadge({ nfi }: { nfi: number | null }) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-semibold tabular-nums"
      style={{
        color: nfiColor(nfi),
        background: `color-mix(in oklab, ${nfiColor(nfi)} 14%, transparent)`,
      }}
      title="Views médias por reel ÷ seguidores. >1x = entregando além dos seguidores."
    >
      <Radio className="h-3 w-3" />
      {nfiLabel(nfi)}
    </span>
  );
}

function ScoreBadge({ score }: { score: number }) {
  return (
    <span
      className="inline-flex items-center justify-center rounded-md px-2 py-0.5 text-xs font-bold tabular-nums min-w-[44px]"
      style={{
        color: scoreColor(score),
        background: `color-mix(in oklab, ${scoreColor(score)} 14%, transparent)`,
      }}
    >
      {score.toFixed(1)}
    </span>
  );
}

function EngBar({ eng }: { eng: number | null }) {
  const v = eng ?? 0;
  const pct = Math.min(100, (v / 10) * 100);
  const color = engColor(eng);
  return (
    <div className="flex items-center gap-2 min-w-[90px]">
      <div className="flex-1 h-1.5 rounded-full bg-bg3 overflow-hidden">
        <div
          className="h-full transition-all"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
      <span className="text-[11px] tabular-nums w-10 text-right" style={{ color }}>
        {eng === null ? "—" : `${eng.toFixed(1)}%`}
      </span>
    </div>
  );
}

function StatusPill({ status }: { status: AccountRankingData["reach_status"] }) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium whitespace-nowrap"
      style={{
        color: statusColor(status),
        background: `color-mix(in oklab, ${statusColor(status)} 12%, transparent)`,
      }}
    >
      {statusLabel(status)}
    </span>
  );
}

function AccountDrawer({
  acc,
  onClose,
}: {
  acc: AccountRankingData | null;
  onClose: () => void;
}) {
  if (!acc) return null;
  const reels = acc.hourly_views_24h;
  const maxView = Math.max(1, ...reels.map((r) => r.views));
  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/60 animate-in fade-in"
        onClick={onClose}
      />
      <div className="fixed inset-y-0 right-0 z-50 w-full sm:w-[440px] bg-bg2 border-l border-border shadow-2xl overflow-y-auto animate-in slide-in-from-right duration-200">
        <div className="flex items-center justify-between p-4 border-b border-border sticky top-0 bg-bg2 z-10">
          <div className="flex items-center gap-3 min-w-0">
            <Avatar src={acc.profile_picture} alt={acc.username} size={44} ring={scoreColor(acc.score)} />
            <div className="min-w-0">
              <div className="font-semibold truncate">@{acc.username}</div>
              <div className="text-xs text-muted2 truncate">{acc.name}</div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 hover:bg-bg3"
            aria-label="Fechar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          <div className="flex justify-center">
            <StatusPill status={acc.reach_status} />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-lg border border-border bg-bg3/40 p-3">
              <div className="text-[11px] text-muted2 uppercase">Seguidores</div>
              <div className="text-xl font-bold tabular-nums">{fmt(acc.followers)}</div>
            </div>
            <div className="rounded-lg border border-border bg-bg3/40 p-3">
              <div className="text-[11px] text-muted2 uppercase">Score</div>
              <div
                className="text-xl font-bold tabular-nums"
                style={{ color: scoreColor(acc.score) }}
              >
                {acc.score.toFixed(1)}
              </div>
            </div>
            <div className="rounded-lg border border-border bg-bg3/40 p-3">
              <div className="text-[11px] text-muted2 uppercase flex items-center gap-1">
                <Radio className="h-3 w-3" /> NF-Index
              </div>
              <div
                className="text-xl font-bold tabular-nums"
                style={{ color: nfiColor(acc.non_follower_index) }}
              >
                {nfiLabel(acc.non_follower_index)}
              </div>
            </div>
            <div className="rounded-lg border border-border bg-bg3/40 p-3">
              <div className="text-[11px] text-muted2 uppercase">Engajamento</div>
              <div
                className="text-xl font-bold tabular-nums"
                style={{ color: engColor(acc.engagement_rate) }}
              >
                {acc.engagement_rate === null ? "—" : `${acc.engagement_rate.toFixed(1)}%`}
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-border bg-bg3/40 p-3">
            <div className="text-xs text-muted2 mb-2">📈 Views por hora (24h)</div>
            <div className="flex items-end gap-[3px] h-20">
              {reels.map((r, i) => (
                <div
                  key={i}
                  className="flex-1 rounded-sm"
                  style={{
                    height: `${(r.views / maxView) * 100}%`,
                    minHeight: 2,
                    background: r.views > 0 ? "var(--accent2)" : "var(--bg2)",
                    opacity: r.views > 0 ? 0.9 : 0.3,
                  }}
                  title={`${r.hour}: ${fmt(r.views)}`}
                />
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-border bg-bg3/40 p-3 space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-muted2">Reels no período</span>
              <span className="tabular-nums font-medium">{acc.period_reels}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted2">Views totais</span>
              <span className="tabular-nums font-medium">{fmt(acc.period_views)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted2">Avg/reel</span>
              <span className="tabular-nums font-medium">{fmt(acc.period_avg_views)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted2">Curtidas</span>
              <span className="tabular-nums font-medium">{fmt(acc.period_likes)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted2">Comentários</span>
              <span className="tabular-nums font-medium">{fmt(acc.period_comments)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted2">Fila pendente</span>
              <span className="tabular-nums font-medium">{acc.pending_in_queue}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted2">Total histórico</span>
              <span className="tabular-nums font-medium">
                {acc.total_reels} reels · {fmt(acc.total_views)} views
              </span>
            </div>
          </div>

          <a
            href={`https://instagram.com/${acc.username}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 rounded-lg im-grad-accent px-3 py-2 text-sm font-medium text-white hover:opacity-95"
          >
            <ExternalLink className="h-4 w-4" />
            Ver conta no Instagram
          </a>
        </div>
      </div>
    </>
  );
}

function RankingPage() {
  const [period, setPeriod] = useState<Period>("1d");
  const [tab, setTab] = useState<Tab>("geral");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sortBy, setSortBy] = useState<SortKey>("score");
  const [metric, setMetric] = useState<MetricKey>("views");
  const [openId, setOpenId] = useState<string | null>(null);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const { data: ranking = [], isLoading, refetch, isFetching } = useRanking(period);
  const { data: daily } = useDailyRanking();

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = ranking.filter((r) => {
      if (q && !r.username.toLowerCase().includes(q) && !r.name.toLowerCase().includes(q))
        return false;
      if (statusFilter !== "all" && r.reach_status !== statusFilter) return false;
      return true;
    });
    const get = (r: AccountRankingData) => {
      switch (sortBy) {
        case "views": return r.period_views;
        case "followers": return r.followers;
        case "eng": return r.engagement_rate ?? 0;
        case "nfi": return r.non_follower_index ?? 0;
        default: return r.score;
      }
    };
    return [...list].sort((a, b) => get(b) - get(a));
  }, [ranking, search, statusFilter, sortBy]);

  const top3 = ranking.slice(0, 3);
  const restricted = ranking.filter((r) => r.reach_status === "restrita" || r.reach_status === "critica");
  const opened = openId ? ranking.find((r) => r.id === openId) ?? null : null;

  return (
    <div className="space-y-6 p-4 sm:p-6 pb-24">
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
      <div className="flex gap-1 border-b border-border overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
        {(
          [
            { id: "geral", label: "Geral" },
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

      {/* Filtros secundários */}
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
                { id: "good", label: "🟢" },
                { id: "warn", label: "🟡" },
                { id: "restricted", label: "🔴" },
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
          {tab === "geral" && (
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortKey)}
              className="rounded-lg border border-border bg-bg2 px-3 py-2 text-xs hover:bg-bg3"
            >
              <option value="score">Ordenar: Score</option>
              <option value="views">Views</option>
              <option value="followers">Seguidores</option>
              <option value="eng">Engajamento</option>
              <option value="nfi">NF-Index</option>
            </select>
          )}
        </div>
      )}

      {/* Empty / Loading */}
      {!isLoading && ranking.length === 0 && (
        <div className="rounded-xl border border-border bg-bg2 p-10 text-center text-muted2">
          Nenhum post publicado ainda — os dados aparecerão após o primeiro reel.
        </div>
      )}
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
          <div className="rounded-2xl border border-border bg-gradient-to-b from-bg2 to-bg3/30 overflow-hidden">
            <Podium top={top3} onPick={setOpenId} />
          </div>

          {/* Desktop table */}
          <div className="hidden md:block rounded-xl border border-border bg-bg2 overflow-hidden">
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
                    <th className="px-3 py-2 text-left">Engajamento</th>
                    <th className="px-3 py-2 text-right">NF-Index</th>
                    <th className="px-3 py-2 text-right">Score</th>
                    <th className="px-3 py-2 text-left">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => (
                    <tr
                      key={r.id}
                      onClick={() => setOpenId(r.id)}
                      className="border-t border-border hover:bg-bg3 cursor-pointer"
                      style={
                        r.reach_status === "restrita" || r.reach_status === "critica"
                          ? { background: "color-mix(in oklab, var(--danger) 5%, transparent)" }
                          : undefined
                      }
                    >
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm font-semibold tabular-nums w-6">{r.rank}</span>
                          {r.rank <= 3 && (
                            <span className="text-sm">{MEDAL_EMOJI[r.rank - 1]}</span>
                          )}
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
                      <td className="px-3 py-2">
                        <EngBar eng={r.engagement_rate} />
                      </td>
                      <td className="px-3 py-2 text-right">
                        <NfiBadge nfi={r.non_follower_index} />
                      </td>
                      <td className="px-3 py-2 text-right">
                        <ScoreBadge score={r.score} />
                      </td>
                      <td className="px-3 py-2">
                        <StatusPill status={r.reach_status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden space-y-2">
            {filtered.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => setOpenId(r.id)}
                className="w-full rounded-xl border border-border bg-bg2 p-3 text-left active:bg-bg3"
                style={
                  r.reach_status === "restrita" || r.reach_status === "critica"
                    ? { borderLeft: "3px solid var(--danger)" }
                    : undefined
                }
              >
                <div className="flex items-center gap-3">
                  <div className="flex flex-col items-center w-8">
                    <span className="text-sm font-bold tabular-nums">{r.rank}</span>
                    {r.rank <= 3 && <span className="text-xs">{MEDAL_EMOJI[r.rank - 1]}</span>}
                  </div>
                  <Avatar src={r.profile_picture} alt={r.username} size={36} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold truncate text-sm">@{r.username}</span>
                      <ScoreBadge score={r.score} />
                    </div>
                    <div className="text-[11px] text-muted2 truncate">
                      {fmt(r.followers)} seg · {fmt(r.period_views)} views
                    </div>
                  </div>
                </div>
                <div className="mt-2 flex items-center justify-between gap-2">
                  <NfiBadge nfi={r.non_follower_index} />
                  <div className="flex-1 max-w-[140px]">
                    <EngBar eng={r.engagement_rate} />
                  </div>
                  <StatusPill status={r.reach_status} />
                </div>
              </button>
            ))}
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
                <b>⚠️ {restricted.length}</b> conta(s) com possível restrição de alcance —
                views médias muito abaixo do número de seguidores.
              </div>
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {[...filtered]
              .filter((r) => r.reach_status === "atencao" || r.reach_status === "restrita" || r.reach_status === "critica")
              .sort((a, b) => (a.non_follower_index ?? 0) - (b.non_follower_index ?? 0))
              .map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setOpenId(r.id)}
                  className="text-left rounded-xl border border-border bg-bg2 p-4 space-y-3 hover:border-border2"
                  style={{ borderLeftColor: statusColor(r.reach_status), borderLeftWidth: 4 }}
                >
                  <div className="flex items-center gap-2">
                    <Avatar src={r.profile_picture} alt={r.username} size={36} />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold truncate">@{r.username}</div>
                      <div className="text-[11px] text-muted2">{fmt(r.followers)} seguidores</div>
                    </div>
                    <StatusPill status={r.reach_status} />
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span
                      className="text-3xl font-bold tabular-nums"
                      style={{ color: nfiColor(r.non_follower_index) }}
                    >
                      {nfiLabel(r.non_follower_index)}
                    </span>
                    <span className="text-xs text-muted2">NF-Index</span>
                  </div>
                  <Sparkline data={r.hourly_views_24h} />
                  <div className="text-[11px] text-muted2">
                    Avg: <b>{fmt(r.period_avg_views)}</b> v/reel · Reels:{" "}
                    <b>{r.period_reels}</b> · Eng:{" "}
                    <b>{r.engagement_rate === null ? "—" : `${r.engagement_rate.toFixed(1)}%`}</b>
                  </div>
                </button>
              ))}
          </div>
        </div>
      )}

      {/* TAB 3 — Por Métrica */}
      {tab === "metrica" && !isLoading && ranking.length > 0 && (
        <MetricTab metric={metric} setMetric={setMetric} accounts={filtered} onPick={setOpenId} />
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

      <AccountDrawer acc={opened} onClose={() => setOpenId(null)} />
    </div>
  );
}

function MetricTab({
  metric,
  setMetric,
  accounts,
  onPick,
}: {
  metric: MetricKey;
  setMetric: (m: MetricKey) => void;
  accounts: AccountRankingData[];
  onPick: (id: string) => void;
}) {
  const metricOptions: { id: MetricKey; label: string; Icon: typeof Eye }[] = [
    { id: "views", label: "Mais views", Icon: Eye },
    { id: "nfi", label: "Maior NF-Index", Icon: Radio },
    { id: "reach", label: "Melhor reach %", Icon: Activity },
    { id: "followers", label: "Mais seguidores", Icon: UsersIcon },
    { id: "likes", label: "Mais curtidas", Icon: Heart },
    { id: "reels", label: "Mais reels", Icon: Film },
    { id: "eng", label: "Maior engajamento", Icon: MessageCircle },
  ];

  const valueFor = (a: AccountRankingData): number => {
    switch (metric) {
      case "views": return a.period_views;
      case "reach": return a.reach_ratio ?? 0;
      case "followers": return a.followers;
      case "likes": return a.period_likes;
      case "reels": return a.period_reels;
      case "eng": return a.engagement_rate ?? 0;
      case "nfi": return a.non_follower_index ?? 0;
    }
  };
  const fmtMetric = (n: number) =>
    metric === "reach" || metric === "eng"
      ? n.toFixed(2) + "%"
      : metric === "nfi"
        ? n.toFixed(2) + "x"
        : fmt(n);

  const sorted = [...accounts].sort((a, b) => valueFor(b) - valueFor(a));
  const max = Math.max(0.01, ...sorted.map(valueFor));

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
            <button
              key={a.id}
              type="button"
              onClick={() => onPick(a.id)}
              className="w-full flex items-center gap-3 hover:bg-bg3 rounded-md px-1 py-1 -mx-1"
            >
              <div className="w-6 text-right text-xs text-muted2 tabular-nums">{idx + 1}</div>
              <Avatar src={a.profile_picture} alt={a.username} size={28} />
              <div className="min-w-[100px] sm:min-w-[120px] text-sm truncate text-left">
                @{a.username}
              </div>
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
            </button>
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
  const current = selectedDay ? (data[selectedDay] ?? days[0]) : days[0];

  const allAccountIds = new Map<string, DailyAccountData>();
  for (const d of days)
    for (const a of d.accounts) if (!allAccountIds.has(a.id)) allAccountIds.set(a.id, a);

  const q = search.trim().toLowerCase();
  const filteredAccounts = current.accounts.filter(
    (a) => !q || a.username.toLowerCase().includes(q),
  );

  return (
    <div className="space-y-4">
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
                      {a.rank <= 3 && <span>{MEDAL_EMOJI[a.rank - 1]}</span>}
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
                  {d.label.split(" ")[0]}
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
// Fragment kept for legacy parser
export const _legacy = Fragment;
