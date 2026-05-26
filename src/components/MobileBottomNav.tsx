import { Link, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { api } from "@/lib/api-client";
import { loadContingency } from "@/lib/contingency-store";

const items = [
  { to: "/", label: "Início", emoji: "📊" },
  { to: "/accounts", label: "Contas", emoji: "👥" },
  { to: "/queue", label: "Fila", emoji: "🗓️" },
  { to: "/warmup", label: "Warmup", emoji: "🔥" },
  { to: "/contingency", label: "Contin.", emoji: "🛡️" },
  { to: "/history", label: "Hist.", emoji: "📚" },
  
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

  // Contingency is localStorage — reflect changes via storage event
  const [contingencyCount, setContingencyCount] = useState(0);
  useEffect(() => {
    const update = () => {
      try {
        setContingencyCount(loadContingency().filter((c) => c.status !== "descartada").length);
      } catch {
        setContingencyCount(0);
      }
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
      <ul className="grid grid-cols-7">
        {items.map(({ to, label, emoji }) => {
          const active = to === "/" ? pathname === "/" : pathname.startsWith(to);
          const badge = badgeFor(to);
          const isWarn = to === "/accounts" || to === "/contingency";
          return (
            <li key={to}>
              <Link
                to={to}
                className="relative flex flex-col items-center gap-0.5 py-2 text-[9px] font-medium transition-colors"
                style={{ color: active ? "var(--accent2)" : "var(--text2)" }}
              >
                <span className="relative">
                  <span
                    className={[
                      "flex h-7 w-7 items-center justify-center rounded-lg text-base leading-none transition",
                      active ? "scale-110 bg-bg3" : "",
                    ].join(" ")}
                  >
                    {emoji}
                  </span>
                  {badge !== null && (
                    <span
                      className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[9px] font-bold text-white ring-2 ring-bg2 tabular-nums"
                      style={{
                        background: isWarn
                          ? badge > 0
                            ? "var(--danger, #ef4444)"
                            : "var(--accent2)"
                          : "var(--accent2)",
                      }}
                    >
                      {badge > 99 ? "99+" : badge}
                    </span>
                  )}
                </span>
                <span className="truncate max-w-full px-0.5">{label}</span>
                {active && (
                  <span
                    className="absolute -top-px left-1/2 h-0.5 w-8 -translate-x-1/2 rounded-full"
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
