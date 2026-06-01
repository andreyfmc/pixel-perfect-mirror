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
  Settings,
  
} from "lucide-react";
import { api } from "@/lib/api-client";


const nav = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, emoji: "📊" },
  { to: "/accounts", label: "Contas", icon: Users, emoji: "👥" },
  { to: "/queue", label: "Fila", icon: CalendarClock, emoji: "🗓️" },
  { to: "/ranking", label: "Ranking", icon: Trophy, emoji: "🏆" },
  { to: "/history", label: "Histórico", icon: History, emoji: "📚" },
  { to: "/warmup", label: "Warmup", icon: Flame, emoji: "🔥" },
  { to: "/contingency", label: "Contingência", icon: ShieldAlert, emoji: "🛡️" },
  { to: "/settings", label: "Configurações", icon: Settings, emoji: "⚙️" },
] as const;

function healthColor(score: number) {
  if (score >= 80) return "var(--success)";
  if (score >= 60) return "var(--warning)";
  return "var(--danger)";
}

export function AppSidebar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { data: accounts = [] } = useQuery({
    queryKey: ["accounts"],
    queryFn: () => api.listAccounts(),
  });

  // Lê os role overrides do localStorage (mesmo formato de _app.accounts.tsx)
  const roleMap: Record<string, string> = (() => {
    if (typeof window === "undefined") return {};
    try { return JSON.parse(localStorage.getItem("accounts.roleOverrides.v1") || "{}"); } catch { return {}; }
  })();

  const visibleAccounts = accounts.filter((a) => {
    const role = roleMap[a.id] ?? (a as { role?: string }).role ?? "active";
    return role !== "discarded";
  });

  return (
    <aside className="hidden md:flex sticky top-0 h-screen w-64 shrink-0 flex-col border-r border-border bg-bg2">
      <div className="flex items-center gap-2.5 px-5 py-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl im-grad-accent im-glow">
          <Sparkles className="h-4 w-4 text-white" />
        </div>
        <div className="leading-tight">
          <div className="text-sm font-semibold tracking-tight">Insta Manager</div>
          <div className="text-[11px] text-muted2">painel · v2</div>
        </div>
      </div>

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
                    <span className="ml-auto h-1.5 w-1.5 rounded-full" style={{ background: "var(--accent2)" }} />
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="mt-6 px-5">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-medium uppercase tracking-wider text-muted2 flex items-center gap-1.5">
            Contas
            <span
              className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums leading-none"
              style={{ background: "color-mix(in oklab, var(--accent2) 15%, transparent)", color: "var(--accent2)" }}
            >
              {visibleAccounts.length}
            </span>
          </span>
          <button
            type="button"
            className="flex h-6 w-6 items-center justify-center rounded-md border border-border bg-bg3 text-text2 hover:text-foreground hover:border-border2"
            aria-label="Conectar Instagram"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <ul className="mt-3 space-y-1 px-3 overflow-y-auto flex-1">
        {visibleAccounts.map((a) => (
          <li key={a.id}>
            <button className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left text-sm hover:bg-bg3">
              <div className="relative">
                <img
                  src={a.profile_picture}
                  alt={a.username}
                  className="h-8 w-8 rounded-full bg-bg3 ring-1 ring-border"
                />
                <span
                  className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-bg2"
                  style={{ background: healthColor(a.health_score) }}
                />
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">@{a.username}</div>
                <div className="text-[11px] text-muted2">saúde {a.health_score}</div>
              </div>
            </button>
          </li>
        ))}
      </ul>

    </aside>
  );
}
