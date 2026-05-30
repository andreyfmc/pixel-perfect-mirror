import { useQuery } from "@tanstack/react-query";
import { Clock, CheckCircle2, Heart, RefreshCw } from "lucide-react";
import { api } from "@/lib/api-client";
import { fmtDateTime } from "@/lib/format";

type AccountLite = {
  id: string;
  username: string;
  profile_picture: string;
  health_score: number;
  token_status: "valid" | "expired";
  last_post_at?: string;
};

export function MonitorTab({ accounts }: { accounts: AccountLite[] }) {
  const { data: queue = [], refetch, isFetching } = useQuery({
    queryKey: ["queue"],
    queryFn: () => api.listQueue(),
  });

  const byAccount = new Map<
    string,
    {
      next?: string;
      scheduled: number;
      published: number;
      failed: number;
      lastError?: string;
    }
  >();

  for (const a of accounts)
    byAccount.set(a.id, { scheduled: 0, published: 0, failed: 0 });

  for (const q of queue) {
    const slot = byAccount.get(q.account);
    if (!slot) continue;
    if (q.status === "scheduled") {
      slot.scheduled++;
      if (!slot.next || q.scheduled_at < slot.next) slot.next = q.scheduled_at;
    } else if (q.status === "published") {
      slot.published++;
    } else if (q.status === "failed") {
      slot.failed++;
      if (q.last_error) slot.lastError = q.last_error;
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted2">
          {accounts.length} conta{accounts.length === 1 ? "" : "s"} monitorada
          {accounts.length === 1 ? "" : "s"}
        </p>
        <button
          onClick={() => refetch()}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border2 bg-bg3 px-3 py-1.5 text-xs hover:text-foreground"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />{" "}
          Atualizar
        </button>
      </div>

      <ul className="grid gap-3 sm:grid-cols-2">
        {accounts.map((a) => {
          const stats = byAccount.get(a.id) ?? {
            scheduled: 0,
            published: 0,
            failed: 0,
          };
          const total = stats.scheduled + stats.published;
          const pct = total ? Math.round((stats.published / total) * 100) : 0;
          const healthColor =
            a.health_score >= 80
              ? "var(--success)"
              : a.health_score >= 60
                ? "var(--warning)"
                : "var(--danger)";

          return (
            <li key={a.id} className="rounded-xl border border-border bg-bg3 p-4">
              <div className="flex items-center gap-3">
                <div className="relative">
                  <img
                    src={a.profile_picture}
                    alt=""
                    className="h-10 w-10 rounded-full"
                  />
                  <span
                    className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full ring-2 ring-bg3"
                    style={{ background: healthColor }}
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-semibold">
                      @{a.username}
                    </span>
                    {a.token_status === "expired" && (
                      <span className="rounded-full bg-red-500/15 px-2 py-0.5 text-[10px] font-medium text-red-300">
                        token expirado
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-[11px] text-muted2">
                    <span className="inline-flex items-center gap-1">
                      <Heart className="h-3 w-3" /> {a.health_score}
                    </span>
                    {stats.failed > 0 && (
                      <span className="text-red-400">· {stats.failed} erro(s)</span>
                    )}
                  </div>
                </div>
              </div>

              <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                {(
                  [
                    { label: "Agendados", value: stats.scheduled, color: undefined },
                    {
                      label: "Publicados",
                      value: stats.published,
                      color: "text-emerald-400",
                    },
                    { label: "Falhas", value: stats.failed, color: "text-red-400" },
                  ] as const
                ).map(({ label, value, color }) => (
                  <div key={label} className="rounded-md bg-bg4 py-1.5">
                    <div className="text-[10px] uppercase tracking-wider text-muted2">
                      {label}
                    </div>
                    <div
                      className={[
                        "text-sm font-semibold tabular-nums",
                        color ?? "",
                      ].join(" ")}
                    >
                      {value}
                    </div>
                  </div>
                ))}
              </div>

              {total > 0 && (
                <div className="mt-3">
                  <div className="mb-1 flex items-center justify-between text-[10px] text-muted2">
                    <span>{pct}% concluído</span>
                    <span className="tabular-nums">
                      {stats.published}/{total}
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-bg4">
                    <div
                      className="h-full im-grad-accent"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              )}

              <div className="mt-3 space-y-1 text-[11px] text-muted2">
                {stats.next && (
                  <div className="flex items-center gap-1.5">
                    <Clock className="h-3 w-3" />
                    Próximo:{" "}
                    <span className="text-text2">{fmtDateTime(stats.next)}</span>
                  </div>
                )}
                {a.last_post_at && (
                  <div className="flex items-center gap-1.5">
                    <CheckCircle2 className="h-3 w-3" />
                    Último post:{" "}
                    <span className="text-text2">
                      {fmtDateTime(a.last_post_at)}
                    </span>
                  </div>
                )}
                {stats.lastError && (
                  <div
                    className="truncate text-red-400"
                    title={stats.lastError}
                  >
                    ⚠ {stats.lastError}
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
