import { Link, useRouterState } from "@tanstack/react-router";
import { LayoutDashboard, CalendarClock, Flame, Users, Settings } from "lucide-react";

const items = [
  { to: "/", label: "Início", icon: LayoutDashboard },
  { to: "/queue", label: "Fila", icon: CalendarClock },
  { to: "/warmup", label: "Warmup", icon: Flame },
  { to: "/accounts", label: "Contas", icon: Users },
  { to: "/settings", label: "Ajustes", icon: Settings },
] as const;

export function MobileBottomNav() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <nav
      className="md:hidden fixed bottom-0 inset-x-0 z-40 border-t border-border bg-bg2/95 backdrop-blur"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="grid grid-cols-5">
        {items.map(({ to, label, icon: Icon }) => {
          const active = to === "/" ? pathname === "/" : pathname.startsWith(to);
          return (
            <li key={to}>
              <Link
                to={to}
                className="flex flex-col items-center gap-0.5 py-2 text-[10px] font-medium transition-colors"
                style={{ color: active ? "var(--accent2)" : "var(--text2)" }}
              >
                <Icon className="h-5 w-5" />
                <span className="truncate">{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
