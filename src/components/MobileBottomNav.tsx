import { Link, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { LayoutDashboard, Flame, CalendarClock, Users, ShieldAlert, Trophy, Settings } from "lucide-react";
import { api } from "@/lib/api-client";
import { loadContingency } from "@/lib/contingency-store";

const items = [
  { to: "/", label: "Dashboard", Icon: LayoutDashboard },
  { to: "/warmup", label: "Postagem", Icon: Flame },
  { to: "/warmup-heat", label: "Aquec.", Icon: Flame },
  { to: "/queue", label: "Fila", Icon: CalendarClock },
  { to: "/ranking", label: "Ranking", Icon: Trophy },
  { to: "/accounts", label: "Contas", Icon: Users },
  { to: "/contingency", label: "Contingência", Icon: ShieldAlert },
  { to: "/settings", label: "Config.", Icon: Settings },
] as const;

export function MobileBottomNav() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const { data: queue = [] } = useQuery({
    queryKey: ["queue"],
    queryFn: () => api.listQueue(),
    refetchInterval: 20_000,
  });
  const { data: accounts = [] } = useQuery({
    queryKey: ["accounts"],
    queryFn: () => api.listAccounts(),
  });

  const pendingQueue = queue.filter((q) => q.status === "scheduled").length;
  const lowHealth = accounts.filter((a) => (a.health_score ?? 100) < 60).length;

  const [contingencyCount, setContingencyCount] = useState(0);
  useEffect(() => {
    const update = () => {
      try {
        setContingencyCount(loadContingency().filter((c) => c.status !== "descartada").length);
      } catch { setContingencyCount(0); }
    };
    update();
    const onStorage = () => update();
    const onChange = () => update();
    window.addEventListener("storage", onStorage);
    window.addEventListener("contingency:changed", onChange);
    const t = window.setInterval(update, 5000);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("contingency:changed", onChange);
      window.clearInterval(t);
    };
  }, []);

  const badgeFor = (to: string): number | null => {
    if (to === "/queue") return pendingQueue || null;
    if (to === "/contingency") return contingencyCount || null;
    if (to === "/accounts") return lowHealth || null;
    return null;
  };

  return (
    <nav
      className="md:hidden fixed bottom-0 inset-x-0 z-40 border-t border-border bg-bg2/95 backdrop-blur"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="grid grid-cols-8" style={{ height: 60 }}>
        {items.map(({ to, label, Icon }) => {
          const active = to === "/" ? pathname === "/" : pathname.startsWith(to);
          const badge = badgeFor(to);
          const isWarn = to === "/accounts";
          return (
            <li key={to} className="flex">
              <Link
                to={to}
                className="relative flex flex-1 flex-col items-center justify-center gap-1 px-1 active:bg-bg3/60"
                style={{ color: active ? "var(--accent2)" : "var(--text2)" }}
              >
                <span className="relative">
                  <Icon style={{ width: 24, height: 24 }} strokeWidth={active ? 2.4 : 2} />
                  {badge !== null && (
                    <span
                      className="absolute -right-2 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[9px] font-bold text-white ring-2 ring-bg2 tabular-nums"
                      style={{
                        background: isWarn && badge > 0 ? "var(--danger)" : "var(--accent2)",
                      }}
                    >
                      {badge > 99 ? "99+" : badge}
                    </span>
                  )}
                </span>
                <span className="truncate max-w-full text-[11px] font-medium leading-none">{label}</span>
                {active && (
                  <span
                    className="absolute top-0 left-1/2 h-0.5 w-8 -translate-x-1/2 rounded-full"
                    style={{ background: "var(--accent2)" }}
                  />
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
