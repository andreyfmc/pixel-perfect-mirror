import { Link, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  LayoutDashboard,
  Users,
  CalendarClock,
  History,
  Flame,
  ShieldAlert,
  Plus,
  Sparkles,
  Trophy,
  Instagram,
  ChevronsUpDown,
} from "lucide-react";
import { api } from "@/lib/api-client";
import { useState, useMemo, useEffect } from "react";
import { useHideData } from "@/hooks/use-hide-data";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const nav = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, emoji: "📊" },
  { to: "/accounts", label: "Contas", icon: Users, emoji: "👥" },
  { to: "/queue", label: "Fila", icon: CalendarClock, emoji: "🗓️" },
  { to: "/ranking", label: "Ranking", icon: Trophy, emoji: "🏆" },
  { to: "/history", label: "Histórico", icon: History, emoji: "📚" },
  { to: "/warmup", label: "Warmup", icon: Flame, emoji: "🔥" },
  { to: "/contingency", label: "Contingência", icon: ShieldAlert, emoji: "🛡️" },
] as const;

type SortKey = "recent" | "oldest" | "followers" | "health" | "model" | "alpha";

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "recent",    label: "Mais recentes" },
  { key: "oldest",    label: "Mais antigas" },
  { key: "followers", label: "Seguidores" },
  { key: "health",    label: "Saúde" },
  { key: "model",     label: "Modelo" },
  { key: "alpha",     label: "Alfabética" },
];

const SORT_STORAGE_KEY = "sidebar.sort.v1";

function loadSort(): SortKey {
  if (typeof window === "undefined") return "recent";
  return (localStorage.getItem(SORT_STORAGE_KEY) as SortKey) ?? "recent";
}

function healthColor(score: number) {
  if (score >= 80) return "var(--success)";
  if (score >= 60) return "var(--warning)";
  return "var(--danger)";
}

export function AppSidebar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { data: accountsRaw = [] } = useQuery({
    queryKey: ["accounts"],
    queryFn: () => api.listAccounts(),
  });
  const [hideData] = useHideData();
  const [sort, setSort] = useState<SortKey>("recent");

  useEffect(() => {
    setSort(loadSort());
  }, []);

  function changeSort(key: SortKey) {
    setSort(key);
    localStorage.setItem(SORT_STORAGE_KEY, key);
  }

  const accounts = useMemo(() => {
    const list = accountsRaw.filter((a: any) => a.role !== "discarded");
    return [...list].sort((a: any, b: any) => {
      switch (sort) {
        case "oldest":
          return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        case "followers":
          return (b.followers ?? 0) - (a.followers ?? 0);
        case "health":
          return (b.health_score ?? 0) - (a.health_score ?? 0);
        case "model":
          return (a.model_id ?? "zzz").localeCompare(b.model_id ?? "zzz");
        case "alpha":
          return a.username.localeCompare(b.username);
        case "recent":
        default:
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      }
    });
  }, [accountsRaw, sort]);

  const currentSortLabel = SORT_OPTIONS.find((o) => o.key === sort)?.label ?? "Recentes";

  return (
    <aside className="hidden md:flex sticky top-0 h-screen w-64 shrink-0 flex-col border-r border-border bg-bg2">
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-5 py-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl im-grad-accent im-glow">
          <Sparkles className="h-4 w-4 text-white" />
        </div>
        <div className="leading-tight">
          <div className="text-sm font-semibold tracking-tight">Insta Manager</div>
          <div className="text-[11px] text-muted2">painel · v2</div>
        </div>
      </div>

      {/* Nav */}
      <nav className="px-3">
        <ul className="space-y-0.5">
          {nav.map(({ to, label, emoji }) => {
            const active = to === "/" ? pathname === "/" : pathname.startsWith(to);
            return (
              <li key={to}>
                <Link
                  to={to}
                  className={[
                    "group flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                    active
                      ? "bg-bg3 text-foreground"
                      : "text-text2 hover:bg-bg3 hover:text-foreground",
                  ].join(" ")}
                >
                  <span className="text-base leading-none w-5 text-center">{emoji}</span>
                  <span>{label}</span>
                  {active && (
                    <span
                      className="ml-auto h-1.5 w-1.5 rounded-full"
                      style={{ background: "var(--accent2)" }}
                    />
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Header contas */}
      <div className="mt-6 px-3">
        <div className="flex items-center justify-between gap-1">
          {/* Label + contador */}
          <span className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-muted2 pl-2">
            Contas
            <span
              className="rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums"
              style={{
                background: "rgba(34,197,94,0.15)",
                border: "1px solid rgba(34,197,94,0.35)",
                color: "var(--success)",
              }}
            >
              {accounts.length}
            </span>
          </span>

          <div className="flex items-center gap-1">
            {/* Ordenação */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="flex items-center gap-1 rounded-md border border-border bg-bg3 px-2 py-1 text-[10px] text-text2 hover:border-border2 hover:text-foreground"
                  title={`Ordenar: ${currentSortLabel}`}
                >
                  <ChevronsUpDown className="h-3 w-3 shrink-0" />
                  <span className="max-w-[56px] truncate">{currentSortLabel}</span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-40">
                <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted2">
                  Ordenar por
                </div>
                <DropdownMenuSeparator />
                {SORT_OPTIONS.map((o) => (
                  <DropdownMenuItem
                    key={o.key}
                    onClick={() => changeSort(o.key)}
                    className={sort === o.key ? "text-accent2 font-medium" : ""}
                  >
                    {sort === o.key && <span className="mr-1.5">✓</span>}
                    {o.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Adicionar conta */}
            <button
              type="button"
              className="flex h-6 w-6 items-center justify-center rounded-md border border-border bg-bg3 text-text2 hover:text-foreground hover:border-border2"
              aria-label="Conectar Instagram"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Lista */}
      <ul className="mt-3 space-y-1 px-3 overflow-y-auto flex-1 pb-4">
        {accounts.map((a: any) => (
          <li key={a.id}>
            <button className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left text-sm hover:bg-bg3">
              <div className="relative shrink-0">
                <SidebarAvatar
                  src={a.profile_picture}
                  username={a.username}
                  hide={hideData}
                />
                {!hideData && (
                  <span
                    className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-bg2"
                    style={{ background: healthColor(a.health_score) }}
                  />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">
                  {hideData ? "••••••••" : `@${a.username}`}
                </div>
                <div className="text-[11px] text-muted2">
                  {hideData
                    ? "•••"
                    : sort === "followers" && a.followers > 0
                    ? `${a.followers >= 1000 ? (a.followers / 1000).toFixed(1) + "k" : a.followers} seguidores`
                    : `saúde ${a.health_score}`}
                </div>
              </div>
            </button>
          </li>
        ))}
      </ul>
    </aside>
  );
}

function SidebarAvatar({
  src,
  username,
  hide,
}: {
  src?: string;
  username: string;
  hide: boolean;
}) {
  const [errored, setErrored] = useState(false);
  const showFallback = hide || errored || !src;
  if (showFallback) {
    return (
      <div
        className="flex h-8 w-8 items-center justify-center rounded-full text-white ring-1 ring-border"
        style={{
          background: "linear-gradient(135deg,#f09433,#e6683c,#dc2743,#cc2366,#bc1888)",
        }}
        aria-label={username}
      >
        <Instagram className="h-4 w-4" />
      </div>
    );
  }
  return (
    <img
      src={src}
      alt={username}
      onError={() => setErrored(true)}
      className="h-8 w-8 rounded-full bg-bg3 ring-1 ring-border object-cover"
    />
  );
}
