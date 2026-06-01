import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api-client";
import { fmtDateTime } from "@/lib/format";
import {
  Activity,
  TrendingUp,
  CalendarClock,
  AlertTriangle,
  ArrowUpRight,
  Heart,
  MessageCircle,
  Eye,
  CheckCircle2,
  ExternalLink,
  Clock,
  Layers,
} from "lucide-react";
import { LineChart, Line, ResponsiveContainer } from "recharts";

export const Route = createFileRoute("/_app/")({
  component: Dashboard,
  head: () => ({
    meta: [
      { title: "Dashboard · Insta Manager" },
      { name: "description", content: "Visão geral das contas, saúde e fila pendente." },
    ],
  }),
});

// ---------- helpers ----------
function useCountUp(target: number, duration = 800) {
  const [v, setV] = useState(0);
  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    const from = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setV(Math.round(from + (target - from) * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return v;
}

function formatCompact(n: number) {
  if (n >= 1000) {
    const k = n / 1000;
    return k.toFixed(k >= 10 ? 0 : 1).replace(".", ",") + "k";
  }
  return n.toLocaleString("pt-BR");
}

function relativeTime(iso: string): { label: string; tone: "ok" | "warn" | "soon" | "late" } {
  const t = new Date(iso).getTime();
  const diff = t - Date.now();
  const abs = Math.abs(diff);
  const min = Math.round(abs / 60000);
  if (diff < 0) return { label: `há ${min < 60 ? min + "min" : Math.round(min / 60) + "h"}`, tone: "late" };
  if (abs < 3600_000) {
    return { label: `em ${min}min`, tone: "soon" };
  }
  if (abs < 3 * 3600_000) {
    const h = Math.floor(min / 60);
    const m = min % 60;
    return { label: `em ${h}h${m.toString().padStart(2, "0")}`, tone: "warn" };
  }
  const day = new Date(iso);
  const today = new Date();
  const isToday = day.toDateString() === today.toDateString();
  return {
    label: isToday
      ? `Hoje, ${day.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`
      : fmtDateTime(iso),
    tone: "ok",
  };
}

function useGreet() {
  const [g, setG] = useState("Olá");
  useEffect(() => {
    const h = new Date().getHours();
    setG(h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite");
  }, []);
  return g;
}

// Deterministic sparkline based on a seed so values don't jump on each render.
function sparkData(seed: number, base: number) {
  const arr: { v: number }[] = [];
  let v = base;
  for (let i = 0; i < 7; i++) {
    const x = Math.sin(seed + i * 1.3) * 0.5 + Math.sin(seed * 0.7 + i) * 0.3;
    v = Math.max(1, v + x * Math.max(2, base * 0.04));
    arr.push({ v });
  }
  return arr;
}

const TYPE_BADGE: Record<string, { bg: string; fg: string; label: string }> = {
  REEL: { bg: "color-mix(in oklab, var(--accent2) 22%, transparent)", fg: "var(--accent2)", label: "REEL" },
  IMAGE: { bg: "color-mix(in oklab, #3b82f6 22%, transparent)", fg: "#7aa8ff", label: "IMAGE" },
  STORY: { bg: "color-mix(in oklab, #f97316 22%, transparent)", fg: "#ffb072", label: "STORY" },
};

// ---------- Metric card ----------
function MetricCard({
  label,
  value,
  delta,
  deltaTone = "positive",
  icon: Icon,
  accent,
  to,
  sparkSeed,
}: {
  label: string;
  value: number;
  delta?: string;
  deltaTone?: "positive" | "negative" | "muted";
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  accent: string;
  to?: string;
  sparkSeed: number;
}) {
  const animated = useCountUp(value);
  const display = label === "Seguidores totais" ? animated.toLocaleString("pt-BR") : String(animated);
  const data = useMemo(() => sparkData(sparkSeed, Math.max(10, value || 10)), [sparkSeed, value]);
  const deltaColor =
    deltaTone === "positive" ? "var(--success)" : deltaTone === "negative" ? "var(--danger)" : "var(--muted2)";

  const inner = (
    <div
      className="im-card im-card-hover relative overflow-hidden p-5 transition-all"
      style={{
        borderTop: `2px solid ${accent}`,
        boxShadow: to ? undefined : undefined,
      }}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wider text-muted2">{label}</span>
        <div
          className="flex h-8 w-8 items-center justify-center rounded-lg"
          style={{ background: `color-mix(in oklab, ${accent} 15%, transparent)` }}
        >
          <Icon className="h-4 w-4" style={{ color: accent }} />
        </div>
      </div>
      <div className="mt-3 flex items-baseline gap-2">
        <span className="text-3xl font-semibold tracking-tight tabular-nums">{display}</span>
        {delta && (
          <span className="text-xs font-medium" style={{ color: deltaColor }}>
            {delta}
          </span>
        )}
      </div>
      <div className="mt-2 h-10 -mx-1">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <Line type="monotone" dataKey="v" stroke={accent} strokeWidth={2} dot={false} isAnimationActive />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div
        className="pointer-events-none absolute inset-0 rounded-[inherit] opacity-0 transition-opacity hover:opacity-100"
        style={{ boxShadow: `inset 0 0 0 1px ${accent}, 0 0 28px -10px ${accent}` }}
      />
    </div>
  );

  return to ? (
    <Link to={to} className="block cursor-pointer">
      {inner}
    </Link>
  ) : (
    inner
  );
}

// ---------- Dashboard ----------
function Dashboard() {
  const greeting = useGreet();
  const [now, setNow] = useState(Date.now());
  const [lastRefresh, setLastRefresh] = useState(Date.now());
  const [tick, setTick] = useState(0);

  const accountsQ = useQuery({
    queryKey: ["accounts"],
    queryFn: () => api.listAccounts(),
    refetchInterval: 60_000,
  });
  const queueQ = useQuery({
    queryKey: ["queue"],
    queryFn: () => api.listQueue(),
    refetchInterval: 60_000,
  });
  const historyQ = useQuery({
    queryKey: ["history"],
    queryFn: () => api.listHistory(),
    refetchInterval: 60_000,
  });
  const metaAppsQ = useQuery({
    queryKey: ["meta-apps"],
    queryFn: () => api.listMetaApps(),
    staleTime: 30_000,
  });

  const accounts = accountsQ.data ?? [];
  const queue = queueQ.data ?? [];
  const history = historyQ.data ?? [];
  const metaApps = metaAppsQ.data ?? [];

  // tick "atualizado há Xs"
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    if (accountsQ.dataUpdatedAt) setLastRefresh(accountsQ.dataUpdatedAt);
  }, [accountsQ.dataUpdatedAt]);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  const avgHealth = accounts.length
    ? Math.round(accounts.reduce((s, a) => s + a.health_score, 0) / accounts.length)
    : 0;
  const totalFollowers = accounts.reduce((s, a) => s + a.followers, 0);

  // Resolve account info for queue/history rows
  const acctMap = useMemo(() => {
    const m = new Map<string, { username: string; pic: string; health: number }>();
    accounts.forEach((a) =>
      m.set(a.id, { username: a.username, pic: a.profile_picture, health: a.health_score }),
    );
    // also accept username in mock items
    return m;
  }, [accounts]);

  function acctInfo(key: string) {
    return (
      acctMap.get(key) ?? {
        username: key,
        pic: "",
        health: 100,
      }
    );
  }

  // Upcoming (next 4 scheduled)
  const upcoming = useMemo(
    () =>
      [...queue]
        .filter((q) => q.status === "scheduled" || q.status === "processing")
        .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime())
        .slice(0, 6),
    [queue],
  );

  // Alerts
  const lowHealth = accounts.filter((a) => a.health_score < 60);
  const late = queue.filter(
    (q) => new Date(q.scheduled_at).getTime() < now && q.status !== "published" && q.status !== "canceled",
  );
  const errors = queue.filter((q) => q.status === "failed" && q.last_error);
  const alertCount = lowHealth.length + late.length + errors.length;

  // Subtitle dynamic
  let subtitle = (
    <span className="im-grad-text">Tudo no ar.</span>
  );
  let subtitleTone: "ok" | "warn" | "muted" = "ok";
  if (alertCount > 0) {
    subtitle = <span style={{ color: "var(--warning)" }}>⚠ Atenção necessária.</span>;
    subtitleTone = "warn";
  } else if (upcoming.length === 0) {
    subtitle = <span className="text-muted2">Fila vazia — agende novos posts.</span>;
    subtitleTone = "muted";
  }
  void subtitleTone;

  const [expanded, setExpanded] = useState<string | null>(null);

  const secondsAgo = Math.max(0, Math.round((Date.now() - lastRefresh) / 1000));
  void tick;

  return (
    <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6 sm:py-7 md:px-10 md:py-8">
      {/* Header */}
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4 sm:mb-8 sm:gap-6">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted2">Visão geral</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl md:text-4xl">
            {greeting}. {subtitle}
          </h1>
        </div>
        <Link
          to="/queue"
          className="hidden md:inline-flex items-center gap-1.5 rounded-lg border border-border2 bg-bg3 px-3.5 py-2 text-sm hover:border-accent"
        >
          Ver fila <ArrowUpRight className="h-3.5 w-3.5" />
        </Link>
      </header>

      {/* Metric cards */}
      <section className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <MetricCard
          label="Contas ativas"
          value={accounts.length}
          icon={Activity}
          accent="var(--accent2)"
          sparkSeed={1}
        />
        <MetricCard
          label="Saúde média"
          value={avgHealth}
          delta="+4 esta semana"
          deltaTone="positive"
          icon={TrendingUp}
          accent="var(--success)"
          sparkSeed={2}
        />
        <MetricCard
          label="Na fila"
          value={queue.filter((q) => q.status === "scheduled").length}
          icon={CalendarClock}
          accent="#3b82f6"
          to="/queue"
          sparkSeed={3}
        />
        <MetricCard
          label="Seguidores totais"
          value={totalFollowers}
          delta="+12 hoje"
          deltaTone="positive"
          icon={Eye}
          accent="#22d3ee"
          sparkSeed={4}
        />
      </section>

      <MetaAppsCard apps={metaApps} />



      {/* Main grid */}
      <section className="mt-8 grid gap-5 lg:grid-cols-3">
        {/* Upcoming */}
        <div className="im-card flex min-h-[420px] flex-col p-5 lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold tracking-tight">Próximas publicações</h2>
            <Link to="/queue" className="text-xs text-text2 hover:text-foreground">
              ver tudo →
            </Link>
          </div>
          <ul className="-mx-1 flex-1 divide-y divide-border overflow-auto pr-1">
            {upcoming.length === 0 && (
              <li className="py-10 text-center text-sm text-muted2">Nada agendado.</li>
            )}
            {upcoming.map((q) => {
              const info = acctInfo(q.account);
              const rel = relativeTime(q.scheduled_at);
              const isLate = rel.tone === "late";
              const typeMeta = TYPE_BADGE[q.media_type] ?? TYPE_BADGE.IMAGE;
              const open = expanded === q.id;
              return (
                <li
                  key={q.id}
                  className="cursor-pointer px-1 transition-colors"
                  style={isLate ? { background: "color-mix(in oklab, var(--danger) 8%, transparent)" } : undefined}
                  onClick={() => setExpanded(open ? null : q.id)}
                >
                  <div className="flex items-center gap-4 py-3">
                    {q.thumb ? (
                      <img src={q.thumb} alt="" className="h-14 w-14 rounded-lg object-cover" />
                    ) : (
                      <div className="h-14 w-14 rounded-lg bg-bg3" />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        {info.pic ? (
                          <img src={info.pic} alt="" className="h-5 w-5 rounded-full" />
                        ) : (
                          <div className="h-5 w-5 rounded-full bg-bg3" />
                        )}
                        <span className="text-sm font-medium">@{info.username}</span>
                        <span
                          className="rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
                          style={{ background: typeMeta.bg, color: typeMeta.fg }}
                        >
                          {typeMeta.label}
                        </span>
                        {isLate && (
                          <span
                            className="rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
                            style={{
                              background: "color-mix(in oklab, var(--danger) 22%, transparent)",
                              color: "var(--danger)",
                            }}
                          >
                            ATRASADO
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 truncate text-sm text-text2">{q.caption}</p>
                    </div>
                    <div
                      className="whitespace-nowrap text-right text-xs tabular-nums"
                      style={{
                        color:
                          rel.tone === "late"
                            ? "var(--danger)"
                            : rel.tone === "soon"
                              ? "var(--success)"
                              : rel.tone === "warn"
                                ? "var(--warning)"
                                : "var(--muted2)",
                      }}
                    >
                      <Clock className="mr-1 inline h-3 w-3" />
                      {rel.label}
                    </div>
                  </div>
                  {open && (
                    <div className="ml-[72px] mr-2 mb-3 rounded-lg bg-bg3 p-3 text-sm text-text2">
                      <p className="whitespace-pre-wrap">{q.caption || "(sem legenda)"}</p>
                      <Link
                        to="/queue"
                        className="mt-2 inline-flex items-center gap-1 text-xs font-medium"
                        style={{ color: "var(--accent2)" }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        Ver na fila <ArrowUpRight className="h-3 w-3" />
                      </Link>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>

        {/* Attention */}
        <div className="im-card flex min-h-[420px] flex-col p-5">
          <div className="mb-4 flex items-center gap-2">
            <AlertTriangle
              className="h-4 w-4"
              style={{ color: alertCount ? "var(--warning)" : "var(--success)" }}
            />
            <h2 className="text-sm font-semibold tracking-tight">Atenção</h2>
            {alertCount > 0 && (
              <span
                className="ml-auto rounded-full px-2 py-0.5 text-[10px] font-semibold tabular-nums"
                style={{
                  background: "color-mix(in oklab, var(--danger) 22%, transparent)",
                  color: "var(--danger)",
                }}
              >
                {alertCount}
              </span>
            )}
          </div>

          <div className="flex-1 space-y-2 overflow-auto pr-1">
            {alertCount === 0 && (
              <div
                className="flex items-center gap-2 rounded-lg p-3 text-sm"
                style={{
                  background: "color-mix(in oklab, var(--success) 10%, transparent)",
                  color: "var(--success)",
                }}
              >
                <CheckCircle2 className="h-4 w-4" />
                Tudo certo — nenhum alerta no momento
              </div>
            )}

            {late.map((q) => {
              const info = acctInfo(q.account);
              const min = Math.round((now - new Date(q.scheduled_at).getTime()) / 60000);
              return (
                <Link
                  key={`late-${q.id}`}
                  to="/queue"
                  className="flex items-center gap-3 rounded-lg p-3 transition-colors hover:bg-bg3"
                  style={{ background: "color-mix(in oklab, var(--danger) 8%, transparent)" }}
                >
                  <AlertTriangle className="h-4 w-4 shrink-0" style={{ color: "var(--danger)" }} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">
                      Postagem atrasada: @{info.username}
                    </div>
                    <div className="text-[11px] text-muted2">há {min}min</div>
                  </div>
                </Link>
              );
            })}

            {lowHealth.map((a) => (
              <Link
                key={`h-${a.id}`}
                to="/accounts"
                className="flex items-center gap-3 rounded-lg bg-bg3 p-3 transition-colors hover:bg-[color-mix(in_oklab,var(--danger)_8%,transparent)]"
              >
                {a.profile_picture ? (
                  <img src={a.profile_picture} alt="" className="h-9 w-9 rounded-full" />
                ) : (
                  <div className="h-9 w-9 rounded-full bg-bg2" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">@{a.username}</div>
                  <div className="text-[11px] text-muted2">saúde baixa · revisar</div>
                </div>
                <span className="text-sm font-semibold tabular-nums" style={{ color: "var(--danger)" }}>
                  {a.health_score}
                </span>
              </Link>
            ))}

            {errors.map((q) => {
              const info = acctInfo(q.account);
              return (
                <Link
                  key={`e-${q.id}`}
                  to="/queue"
                  className="flex items-start gap-3 rounded-lg p-3 transition-colors hover:bg-bg3"
                  style={{ background: "color-mix(in oklab, var(--danger) 8%, transparent)" }}
                >
                  <AlertTriangle className="h-4 w-4 shrink-0" style={{ color: "var(--danger)" }} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">Erro em @{info.username}</div>
                    <div className="line-clamp-2 text-[11px] text-muted2">{q.last_error}</div>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      {/* Recent posts */}
      <section className="mt-8">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold tracking-tight">Publicados recentemente</h2>
          <Link to="/history" className="text-xs text-text2 hover:text-foreground">
            histórico →
          </Link>
        </div>
        <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:grid sm:snap-none sm:gap-4 sm:overflow-visible sm:px-0 sm:grid-cols-2 lg:grid-cols-3">
          {history.slice(0, 3).map((h) => {
            const info = acctInfo(h.account);
            const permalink = (h as { permalink?: string }).permalink;
            return (
              <article key={h.id} className="im-card im-card-hover group relative w-[82%] shrink-0 snap-start overflow-hidden sm:w-auto sm:shrink">
                <div className="relative">
                  {h.thumb ? (
                    <img src={h.thumb} alt="" className="h-40 w-full object-cover" />
                  ) : (
                    <div className="h-40 w-full bg-bg3" />
                  )}
                  <div className="absolute left-2 top-2 flex items-center gap-1.5 rounded-full bg-black/55 px-2 py-1 backdrop-blur">
                    {info.pic ? (
                      <img src={info.pic} alt="" className="h-5 w-5 rounded-full" />
                    ) : (
                      <div className="h-5 w-5 rounded-full bg-bg3" />
                    )}
                    <span className="text-[11px] font-medium text-white">@{info.username}</span>
                  </div>
                  {permalink && (
                    <a
                      href={permalink}
                      target="_blank"
                      rel="noreferrer"
                      className="absolute inset-0 flex items-center justify-center bg-black/65 opacity-0 transition-opacity group-hover:opacity-100"
                    >
                      <span
                        className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium"
                        style={{ background: "var(--accent2)", color: "white" }}
                      >
                        Ver no Instagram <ExternalLink className="h-3 w-3" />
                      </span>
                    </a>
                  )}
                </div>
                <div className="p-4">
                  <p className="line-clamp-2 text-sm">{h.caption}</p>
                  <div className="mt-3 flex items-center gap-4 text-xs text-text2">
                    <span className="inline-flex items-center gap-1 tabular-nums">
                      <Eye className="h-3.5 w-3.5" /> {formatCompact(h.reach)}
                    </span>
                    <span className="inline-flex items-center gap-1 tabular-nums">
                      <Heart className="h-3.5 w-3.5" /> {formatCompact(h.likes)}
                    </span>
                    <span className="inline-flex items-center gap-1 tabular-nums">
                      <MessageCircle className="h-3.5 w-3.5" /> {formatCompact(h.comments)}
                    </span>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      {/* Refresh indicator */}
      <div className="pointer-events-none fixed bottom-4 right-4 z-30 rounded-full border border-border bg-bg2/80 px-3 py-1.5 text-[11px] text-muted2 backdrop-blur">
        Atualizado há {secondsAgo}s
      </div>
    </div>
  );
}

function MetaAppsCard({
  apps,
}: {
  apps: import("@/lib/api-client").MetaApp[];
}) {
  const activeApps = apps.filter((a) => a.is_active === 1);
  const totalAccounts = apps.reduce((s, a) => s + a.account_count, 0);
  const maxLoad = Math.max(...activeApps.map((a) => a.account_count), 0);
  const isUnbalanced =
    totalAccounts > 0 &&
    activeApps.some((a) => a.account_count / totalAccounts > 0.6);
  const hasInactiveWithAccounts = apps.some(
    (a) => a.is_active === 0 && a.account_count > 0,
  );

  return (
    <section className="mt-6">
      <div className="im-card p-5">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Layers className="h-4 w-4 text-text2" />
            <h2 className="text-sm font-semibold tracking-tight">Apps Meta</h2>
            <span className="rounded-full bg-bg3 px-2 py-0.5 text-[10px] font-semibold text-text2 tabular-nums">
              {activeApps.length} ativo{activeApps.length === 1 ? "" : "s"}
            </span>
          </div>
          <Link to="/settings" className="text-xs text-text2 hover:text-foreground">
            Gerenciar →
          </Link>
        </div>

        {apps.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--muted2)" }}>
            Usando env
          </p>
        ) : (
          <div className="space-y-1.5">
            {activeApps.map((a) => {
              const pct = maxLoad > 0 ? (a.account_count / maxLoad) * 100 : 0;
              const over =
                totalAccounts > 0 && a.account_count / totalAccounts > 0.6;
              return (
                <div key={a.id} className="flex items-center gap-3 text-xs">
                  <span className="w-28 truncate text-text2">
                    {a.name.length > 12 ? a.name.slice(0, 12) + "…" : a.name}
                  </span>
                  <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-bg3">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${pct}%`,
                        background: over ? "var(--warning)" : "var(--accent2)",
                      }}
                    />
                  </div>
                  <span className="w-8 text-right tabular-nums text-text2">
                    {a.account_count}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {(isUnbalanced || hasInactiveWithAccounts) && (
          <div className="mt-4 space-y-1.5 text-xs">
            {isUnbalanced && (
              <div
                className="flex items-center gap-1.5"
                style={{ color: "var(--warning)" }}
              >
                <AlertTriangle className="h-3.5 w-3.5" />
                Distribuição desbalanceada — considere redistribuir
              </div>
            )}
            {hasInactiveWithAccounts && (
              <div
                className="flex items-center gap-1.5"
                style={{ color: "var(--danger)" }}
              >
                <AlertTriangle className="h-3.5 w-3.5" />
                App inativo com contas vinculadas
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
