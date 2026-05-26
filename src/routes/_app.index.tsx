import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { mockQueue, mockHistory } from "@/lib/mock";
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
} from "lucide-react";

export const Route = createFileRoute("/_app/")({
  component: Dashboard,
  head: () => ({
    meta: [
      { title: "Dashboard · Insta Manager" },
      { name: "description", content: "Visão geral das contas, saúde e fila pendente." },
    ],
  }),
});

function Stat({
  label,
  value,
  delta,
  icon: Icon,
}: {
  label: string;
  value: string;
  delta?: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="im-card im-card-hover p-5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wider text-muted2">{label}</span>
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-bg3">
          <Icon className="h-4 w-4 text-text2" />
        </div>
      </div>
      <div className="mt-3 flex items-baseline gap-2">
        <span className="text-3xl font-semibold tracking-tight">{value}</span>
        {delta && (
          <span className="text-xs font-medium" style={{ color: "var(--success)" }}>
            {delta}
          </span>
        )}
      </div>
    </div>
  );
}

function Dashboard() {
  const { data: accounts = [] } = useQuery({
    queryKey: ["accounts"],
    queryFn: () => api.listAccounts(),
  });
  const avgHealth = accounts.length
    ? Math.round(accounts.reduce((s, a) => s + a.health_score, 0) / accounts.length)
    : 0;
  const totalFollowers = accounts.reduce((s, a) => s + a.followers, 0);



  return (
    <div className="mx-auto max-w-7xl px-5 py-8 md:px-10">
      <header className="mb-8 flex items-end justify-between gap-6">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted2">Visão geral</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight md:text-4xl">
            Bom dia. <span className="im-grad-text">Tudo no ar.</span>
          </h1>
        </div>
        <Link
          to="/queue"
          className="hidden md:inline-flex items-center gap-1.5 rounded-lg border border-border2 bg-bg3 px-3.5 py-2 text-sm hover:border-accent"
        >
          Ver fila <ArrowUpRight className="h-3.5 w-3.5" />
        </Link>
      </header>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Contas ativas" value={String(accounts.length)} icon={Activity} />
        <Stat label="Saúde média" value={`${avgHealth}`} delta="+4 esta semana" icon={TrendingUp} />
        <Stat label="Na fila" value={String(mockQueue.length)} icon={CalendarClock} />
        <Stat label="Seguidores totais" value={totalFollowers.toLocaleString("pt-BR")} icon={Eye} />
      </section>

      <section className="mt-8 grid gap-5 lg:grid-cols-3">
        <div className="im-card p-5 lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold tracking-tight">Próximas publicações</h2>
            <Link to="/queue" className="text-xs text-text2 hover:text-foreground">
              ver tudo →
            </Link>
          </div>
          <ul className="divide-y divide-border">
            {mockQueue.slice(0, 4).map((q) => (
              <li key={q.id} className="flex items-center gap-4 py-3">
                <img src={q.thumb} alt="" className="h-14 w-14 rounded-lg object-cover" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">@{q.account}</span>
                    <span className="rounded-md bg-bg3 px-1.5 py-0.5 text-[10px] uppercase text-text2">
                      {q.media_type}
                    </span>
                  </div>
                  <p className="mt-0.5 truncate text-sm text-text2">{q.caption}</p>
                </div>
                <div className="text-right text-xs text-muted2">{fmtDateTime(q.scheduled_at)}</div>
              </li>
            ))}
          </ul>
        </div>

        <div className="im-card p-5">
          <div className="mb-4 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" style={{ color: "var(--warning)" }} />
            <h2 className="text-sm font-semibold tracking-tight">Atenção</h2>
          </div>
          <ul className="space-y-3">
            {accounts
              .filter((a) => a.health_score < 80)
              .map((a) => (
                <li key={a.id} className="flex items-center gap-3 rounded-lg bg-bg3 p-3">
                  <img src={a.profile_picture} alt="" className="h-9 w-9 rounded-full" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">@{a.username}</div>
                    <div className="text-[11px] text-muted2">saúde {a.health_score} · revisar</div>
                  </div>
                  <Link
                    to="/contingency"
                    className="text-xs font-medium"
                    style={{ color: "var(--accent2)" }}
                  >
                    abrir
                  </Link>
                </li>
              ))}
          </ul>
        </div>
      </section>

      <section className="mt-8">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold tracking-tight">Publicados recentemente</h2>
          <Link to="/history" className="text-xs text-text2 hover:text-foreground">
            histórico →
          </Link>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {mockHistory.map((h) => (
            <article key={h.id} className="im-card im-card-hover overflow-hidden">
              <img src={h.thumb} alt="" className="h-40 w-full object-cover" />
              <div className="p-4">
                <div className="text-xs text-muted2">@{h.account}</div>
                <p className="mt-1 line-clamp-2 text-sm">{h.caption}</p>
                <div className="mt-3 flex items-center gap-4 text-xs text-text2">
                  <span className="inline-flex items-center gap-1">
                    <Eye className="h-3.5 w-3.5" /> {h.reach.toLocaleString("pt-BR")}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Heart className="h-3.5 w-3.5" /> {h.likes}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <MessageCircle className="h-3.5 w-3.5" /> {h.comments}
                  </span>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
