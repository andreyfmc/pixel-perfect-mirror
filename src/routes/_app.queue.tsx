import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import { fmtDateTime } from "@/lib/format";
import type { QueueItem } from "@/lib/mock";
import { useOAuthPopup } from "@/hooks/use-oauth-popup";
import {
  AlertTriangle,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Eraser,
  ListChecks,
  MoreHorizontal,
  Pause,
  Play,
  RefreshCw,
  Search,
  Trash2,
  Users,
  X,
  Zap,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export const Route = createFileRoute("/_app/queue")({
  component: QueuePage,
  head: () => ({ meta: [{ title: "Fila · Insta Manager" }] }),
});

type StatusKey = QueueItem["status"];
type FilterKey = "all" | StatusKey;
type DateFilterKey = "all" | "today" | "tomorrow" | "after-tomorrow" | string;
type SortKey = "asc" | "desc";

type AccountMeta = {
  id: string;
  username: string;
  name: string;
  profile_picture: string;
  token_status?: "valid" | "expired";
  token_expires_at?: string | null;
};

type QueueGroup = {
  id: string;
  scheduledAt: string;
  caption: string;
  mediaType: QueueItem["media_type"];
  thumb: string;
  items: QueueItem[];
  status: StatusKey;
  counts: Record<StatusKey, number>;
  accounts: AccountMeta[];
};

const STATUS_META: Record<StatusKey, { bg: string; fg: string; label: string; short: string }> = {
  scheduled: {
    bg: "color-mix(in oklab, var(--info) 16%, transparent)",
    fg: "var(--info)",
    label: "Agendado",
    short: "Pendente",
  },
  processing: {
    bg: "color-mix(in oklab, var(--warning) 16%, transparent)",
    fg: "var(--warning)",
    label: "Processando",
    short: "Rodando",
  },
  failed: {
    bg: "color-mix(in oklab, var(--danger) 16%, transparent)",
    fg: "var(--danger)",
    label: "Falhou",
    short: "Erro",
  },
  canceled: {
    bg: "color-mix(in oklab, var(--muted) 22%, transparent)",
    fg: "var(--text2)",
    label: "Pausado",
    short: "Pausado",
  },
  published: {
    bg: "color-mix(in oklab, var(--success) 16%, transparent)",
    fg: "var(--success)",
    label: "Publicado",
    short: "Publicado",
  },
};

const FILTERS: { id: FilterKey; label: string }[] = [
  { id: "all", label: "Todos" },
  { id: "scheduled", label: "Pendentes" },
  { id: "processing", label: "Rodando" },
  { id: "published", label: "Publicados" },
  { id: "failed", label: "Erros" },
  { id: "canceled", label: "Pausados" },
];

const STATUS_PRIORITY: StatusKey[] = ["failed", "processing", "scheduled", "canceled", "published"];

function localDateKey(value: string | Date) {
  const d = value instanceof Date ? value : new Date(value);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function addDays(base: Date, days: number) {
  const d = new Date(base);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + days);
  return d;
}

function dateChipLabel(key: DateFilterKey) {
  const today = localDateKey(new Date());
  const tomorrow = localDateKey(addDays(new Date(), 1));
  const afterTomorrow = localDateKey(addDays(new Date(), 2));
  if (key === "all") return "Todos os dias";
  if (key === "today" || key === today) return "Hoje";
  if (key === "tomorrow" || key === tomorrow) return "Amanhã";
  if (key === "after-tomorrow" || key === afterTomorrow) return "Depois de amanhã";
  const [year, month, day] = key.split("-").map(Number);
  return new Intl.DateTimeFormat("pt-BR", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
  }).format(new Date(year, month - 1, day));
}

function dateFilterToKey(filter: DateFilterKey) {
  if (filter === "all") return "all";
  if (filter === "today") return localDateKey(new Date());
  if (filter === "tomorrow") return localDateKey(addDays(new Date(), 1));
  if (filter === "after-tomorrow") return localDateKey(addDays(new Date(), 2));
  return filter;
}

function groupStatus(items: QueueItem[]): StatusKey {
  return STATUS_PRIORITY.find((status) => items.some((q) => q.status === status)) ?? "scheduled";
}

function tokenDaysLeft(expiresAt?: string | null) {
  if (!expiresAt) return null;
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (!Number.isFinite(ms)) return null;
  return Math.ceil(ms / 86_400_000);
}

function isTokenExpired(account?: AccountMeta) {
  const days = tokenDaysLeft(account?.token_expires_at);
  return account?.token_status === "expired" || (days !== null && days <= 0);
}

function QueuePage() {
  const qc = useQueryClient();
  const { connect, loading } = useOAuthPopup();
  const { data: queue = [] } = useQuery({
    queryKey: ["queue"],
    queryFn: () => api.listQueue(),
  });
  const { data: accounts = [] } = useQuery({
    queryKey: ["accounts"],
    queryFn: () => api.listAccounts(),
  });

  const accountById = useMemo(() => {
    const m = new Map<string, AccountMeta>();
    for (const a of accounts) {
      m.set(a.id, {
        id: a.id,
        username: a.username,
        name: a.name,
        profile_picture: a.profile_picture,
        token_status: a.token_status,
        token_expires_at: a.token_expires_at,
      });
    }
    return m;
  }, [accounts]);

  const [filter, setFilter] = useState<FilterKey>("all");
  const [dateFilter, setDateFilter] = useState<DateFilterKey>("all");
  const [sort, setSort] = useState<SortKey>("asc");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const counts = useMemo(() => {
    const c: Record<FilterKey, number> = {
      all: queue.length,
      scheduled: 0,
      processing: 0,
      canceled: 0,
      failed: 0,
      published: 0,
    };
    for (const q of queue) c[q.status]++;
    return c;
  }, [queue]);

  const dayCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const q of queue)
      m.set(localDateKey(q.scheduled_at), (m.get(localDateKey(q.scheduled_at)) ?? 0) + 1);
    return m;
  }, [queue]);

  const dateFilters = useMemo(() => {
    const base: DateFilterKey[] = ["all", "today", "tomorrow", "after-tomorrow"];
    const known = new Set(base.map(dateFilterToKey));
    const nextDates = [...dayCounts.keys()]
      .sort()
      .filter((key) => !known.has(key))
      .slice(0, 4);
    return [...base, ...nextDates];
  }, [dayCounts]);

  const visibleItems = useMemo(() => {
    const q = query.trim().toLowerCase();
    const pickedDate = dateFilterToKey(dateFilter);

    return queue
      .filter((item) => filter === "all" || item.status === filter)
      .filter((item) => pickedDate === "all" || localDateKey(item.scheduled_at) === pickedDate)
      .filter((item) => {
        if (!q) return true;
        const account = accountById.get(item.account);
        return [
          item.caption,
          item.media_type,
          item.status,
          STATUS_META[item.status].label,
          account?.username,
          account?.name,
          item.account,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(q);
      })
      .sort((a, b) => {
        const diff = new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime();
        return sort === "asc" ? diff : -diff;
      });
  }, [accountById, dateFilter, filter, query, queue, sort]);

  const groups = useMemo<QueueGroup[]>(() => {
    const map = new Map<string, QueueItem[]>();
    for (const item of visibleItems) {
      // Agrupa por "ciclo" = mesma hora cheia + mesma legenda/mídia.
      // Itens da mesma rodada podem ter scheduled_at minutos diferentes
      // (intervalo entre contas para evitar rate limit), mas devem aparecer
      // juntos como uma única publicação coletiva.
      const hourBucket = new Date(item.scheduled_at);
      hourBucket.setMinutes(0, 0, 0);
      const key = [
        hourBucket.toISOString(),
        item.caption,
        item.media_type,
        item.thumb,
      ].join("::");
      map.set(key, [...(map.get(key) ?? []), item]);
    }

    return [...map.entries()].map(([id, items]) => {
      // Ordena itens do ciclo por horário real de cada conta.
      items.sort(
        (a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime(),
      );
      const first = items[0];
      const statusCounts: Record<StatusKey, number> = {
        scheduled: 0,
        processing: 0,
        canceled: 0,
        failed: 0,
        published: 0,
      };
      for (const item of items) statusCounts[item.status]++;
      return {
        id,
        // Usa o horário do primeiro item do ciclo para ordenação/labels.
        scheduledAt: first.scheduled_at,
        caption: first.caption,
        mediaType: first.media_type,
        thumb: first.thumb,
        items,
        status: groupStatus(items),
        counts: statusCounts,
        accounts: items.map(
          (item) =>
            accountById.get(item.account) ?? {
              username: item.account.startsWith("@")
                ? item.account.slice(1)
                : item.account.slice(0, 16),
              name: item.account,
              profile_picture: "",
              id: item.account,
            },
        ),
      };
    });
  }, [accountById, visibleItems]);

  const visibleIds = visibleItems.map((q) => q.id);
  const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selected.has(id));
  const selectedVisibleCount = visibleIds.filter((id) => selected.has(id)).length;
  const someSelected = selected.size > 0;

  function toggle(id: string) {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  function toggleIds(ids: string[]) {
    const everySelected = ids.every((id) => selected.has(id));
    setSelected((s) => {
      const n = new Set(s);
      for (const id of ids) {
        if (everySelected) n.delete(id);
        else n.add(id);
      }
      return n;
    });
  }

  function toggleAllVisible() {
    setSelected((s) => {
      const n = new Set(s);
      if (allSelected) visibleIds.forEach((id) => n.delete(id));
      else visibleIds.forEach((id) => n.add(id));
      return n;
    });
  }

  async function runBulk(label: string, fn: (id: string) => Promise<void>, ids = [...selected]) {
    if (!ids.length) return;
    const t = toast.loading(`${label} ${ids.length} ${ids.length > 1 ? "itens" : "item"}…`);
    try {
      await Promise.all(ids.map(fn));
      toast.success(`${label} concluído`);
      setSelected((s) => {
        const n = new Set(s);
        ids.forEach((id) => n.delete(id));
        return n;
      });
      qc.invalidateQueries({ queryKey: ["queue"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha na operação");
    } finally {
      toast.dismiss(t);
    }
  }

  async function singleAction(label: string, fn: () => Promise<void>) {
    const t = toast.loading(`${label}…`);
    try {
      await fn();
      toast.success(`${label} concluído`);
      qc.invalidateQueries({ queryKey: ["queue"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha na operação");
    } finally {
      toast.dismiss(t);
    }
  }

  async function clearByStatus(statuses: StatusKey[], label: string) {
    if (!confirm(`${label}? Esta ação remove os itens da fila.`)) return;
    await singleAction(label, () => api.clearQueue(statuses));
    setSelected(new Set());
  }

  async function publishSelectedNow(ids = [...selected]) {
    if (!ids.length) return;
    const t = toast.loading(`Preparando ${ids.length} item(ns) para publicar…`);
    try {
      const expiredIds = ids.filter((id) => {
        const item = queue.find((q) => q.id === id);
        return isTokenExpired(item ? accountById.get(item.account) : undefined);
      });
      if (expiredIds.length) {
        await Promise.all(
          expiredIds.map((id) =>
            api.updateQueueStatus(id, "canceled", {
              reset_container: true,
              last_error: "Token expirado. Reconecte a conta antes de publicar.",
            }),
          ),
        );
        toast.warning(
          `${expiredIds.length} item(ns) pausado(s): token expirado. Reconecte a conta.`,
        );
      }
      const runnableIds = ids.filter((id) => !expiredIds.includes(id));
      if (!runnableIds.length) {
        setSelected(new Set());
        qc.invalidateQueries({ queryKey: ["queue"] });
        qc.invalidateQueries({ queryKey: ["accounts"] });
        return;
      }
      const nowIso = new Date().toISOString();
      await Promise.all(
        runnableIds.map((id) =>
          api.updateQueueStatus(id, "scheduled", {
            scheduled_at: nowIso,
            reset_container: true,
          }),
        ),
      );
      await api.runScheduler();
      toast.success("Scheduler disparado");
      setSelected(new Set());
      qc.invalidateQueries({ queryKey: ["queue"] });
      qc.invalidateQueries({ queryKey: ["accounts"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao disparar scheduler");
    } finally {
      toast.dismiss(t);
    }
  }

  async function handleReconnect(account: { username: string; provider?: "facebook" | "instagram" }) {
    const provider = account.provider ?? "facebook";
    const t = toast.loading(`Reconectando @${account.username} via ${provider === "facebook" ? "Facebook" : "Instagram"}…`);
    const res = await connect(provider);
    toast.dismiss(t);
    if (res.ok) {
      toast.success(
        `Reconectado: ${(res.saved ?? []).map((u) => `@${u}`).join(", ") || `@${account.username}`}`,
      );
      qc.invalidateQueries({ queryKey: ["accounts"] });
      qc.invalidateQueries({ queryKey: ["queue"] });
    } else {
      toast.error(res.error ?? "Falha na reconexão");
    }
  }

  const metrics = [
    { label: "Total", value: counts.all, tone: "text-foreground", icon: ListChecks },
    { label: "Pendentes", value: counts.scheduled, tone: "text-info", icon: Clock3 },
    { label: "Publicados", value: counts.published, tone: "text-success", icon: CheckCircle2 },
    { label: "Erros", value: counts.failed, tone: "text-danger", icon: AlertTriangle },
  ];

  return (
    <div className="mx-auto max-w-7xl px-3 py-4 sm:px-6 sm:py-7 md:px-10 md:py-8">
      <header className="mb-5 flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="inline-flex rounded-xl border border-border bg-bg2 p-1">
            <button className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-primary-foreground im-glow">
              <ListChecks className="h-4 w-4" /> Fila{" "}
              <span className="rounded-full bg-bg3/40 px-2 py-0.5 text-[11px]">{counts.all}</span>
            </button>
            <button className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm text-text2 hover:text-foreground">
              <BarChart3 className="h-4 w-4" /> Monitor
            </button>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={() =>
                singleAction("Atualizando scheduler", async () => {
                  await api.runScheduler();
                })
              }
              className="inline-flex items-center gap-1.5 rounded-lg border border-border2 bg-bg3 px-3 py-2 text-sm hover:border-accent"
            >
              <RefreshCw className="h-4 w-4" /> Atualizar
            </button>
            <button
              onClick={toggleAllVisible}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border2 bg-bg3 px-3 py-2 text-sm hover:border-accent"
            >
              <CheckCircle2 className="h-4 w-4" /> {allSelected ? "Desmarcar" : "Selecionar"}
            </button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="inline-flex items-center gap-1.5 rounded-lg border border-danger/35 bg-danger/10 px-3 py-2 text-sm text-danger hover:border-danger">
                  <Eraser className="h-4 w-4" /> Limpar
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64">
                <DropdownMenuItem
                  onSelect={() => clearByStatus(["scheduled"], "Remover agendados")}
                >
                  Remover agendados ({counts.scheduled})
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => clearByStatus(["failed"], "Remover erros")}>
                  Remover erros ({counts.failed})
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => clearByStatus(["canceled"], "Remover pausados")}>
                  Remover pausados ({counts.canceled})
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() => clearByStatus(["published"], "Limpar publicados")}
                >
                  Limpar publicados ({counts.published})
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onSelect={() =>
                    clearByStatus(
                      ["scheduled", "processing", "failed", "canceled", "published"],
                      "Limpar tudo",
                    )
                  }
                  className="text-danger focus:text-danger"
                >
                  Limpar tudo ({queue.length})
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {metrics.map(({ label, value, tone, icon: Icon }) => (
            <div key={label} className="rounded-xl border border-border bg-bg2 px-4 py-4">
              <div className="flex items-center justify-between text-muted2">
                <span className="text-xs">{label}</span>
                <Icon className="h-4 w-4" />
              </div>
              <div className={["mt-2 text-2xl font-bold", tone].join(" ")}>{value}</div>
            </div>
          ))}
        </div>
      </header>

      <section className="mb-4 space-y-3">
        <div className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_auto]">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted2" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar conta, tipo, legenda ou status..."
              className="h-10 w-full rounded-lg border border-border bg-bg3 pl-9 pr-9 text-sm outline-none transition focus:border-accent"
            />
            {query && (
              <button
                onClick={() => setQuery("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted2 hover:text-foreground"
                aria-label="Limpar busca"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </label>
          <button
            onClick={() => setSort((s) => (s === "asc" ? "desc" : "asc"))}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-border2 bg-bg2 px-4 text-sm text-text2 hover:text-foreground"
          >
            <CalendarDays className="h-4 w-4" />{" "}
            {sort === "asc" ? "Mais cedo primeiro" : "Mais tarde primeiro"}
          </button>
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={[
                "shrink-0 rounded-lg border px-3 py-2 text-xs font-semibold transition",
                filter === f.id
                  ? "border-accent bg-accent text-primary-foreground"
                  : "border-border2 bg-bg2 text-text2 hover:text-foreground",
              ].join(" ")}
            >
              {f.label} <span className="opacity-80">({counts[f.id]})</span>
            </button>
          ))}
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {dateFilters.map((f) => {
            const key = dateFilterToKey(f);
            const count = f === "all" ? visibleItems.length : (dayCounts.get(key) ?? 0);
            return (
              <button
                key={f}
                onClick={() => setDateFilter(f)}
                className={[
                  "shrink-0 rounded-lg border px-3 py-2 text-xs font-semibold transition",
                  dateFilter === f
                    ? "border-accent bg-accent text-primary-foreground"
                    : "border-border2 bg-bg2 text-text2 hover:text-foreground",
                ].join(" ")}
              >
                {dateChipLabel(f)} <span className="opacity-80">({count})</span>
              </button>
            );
          })}
        </div>
      </section>

      {someSelected && (
        <div className="sticky top-3 z-20 mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-accent/40 bg-bg3 px-3 py-2 text-sm shadow-lg shadow-bg/40">
          <span className="font-semibold">{selected.size} selecionado(s)</span>
          <span className="text-xs text-muted2">{selectedVisibleCount} visível(is)</span>
          <button
            onClick={() => runBulk("Pausando", (id) => api.updateQueueStatus(id, "canceled"))}
            className="inline-flex items-center gap-1.5 rounded-md border border-border2 bg-bg2 px-2.5 py-1.5 text-xs hover:border-accent"
          >
            <Pause className="h-3.5 w-3.5" /> Pausar
          </button>
          <button
            onClick={() => runBulk("Retomando", (id) => api.updateQueueStatus(id, "scheduled"))}
            className="inline-flex items-center gap-1.5 rounded-md border border-border2 bg-bg2 px-2.5 py-1.5 text-xs hover:border-accent"
          >
            <Play className="h-3.5 w-3.5" /> Retomar
          </button>
          <button
            onClick={() => publishSelectedNow()}
            className="inline-flex items-center gap-1.5 rounded-md border border-warning/40 bg-warning/10 px-2.5 py-1.5 text-xs text-warning hover:border-warning"
          >
            <Zap className="h-3.5 w-3.5" /> Tentar agora
          </button>
          <button
            onClick={() => setSelected(new Set())}
            className="ml-auto inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs text-text2 hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" /> Limpar seleção
          </button>
          <button
            onClick={() => runBulk("Removendo", (id) => api.deleteQueue(id))}
            className="inline-flex items-center gap-1.5 rounded-md border border-danger/35 bg-danger/10 px-2.5 py-1.5 text-xs text-danger hover:border-danger"
          >
            <Trash2 className="h-3.5 w-3.5" /> Remover
          </button>
        </div>
      )}

      <div className="space-y-5">
        {groups.length === 0 ? (
          <div className="flex min-h-[240px] flex-col items-center justify-center rounded-xl border border-border bg-bg2 p-10 text-center text-sm text-text2">
            <CheckCircle2 className="mb-2 h-7 w-7 text-muted2" />
            Nada por aqui.
          </div>
        ) : (
          groups.map((group, groupIndex) => {
            const meta = STATUS_META[group.status];
            const groupIds = group.items.map((item) => item.id);
            const selectedInGroup = groupIds.filter((id) => selected.has(id)).length;
            const isGroupSelected = selectedInGroup === groupIds.length;
            const overdue = group.items.some(
              (item) =>
                item.status === "scheduled" && new Date(item.scheduled_at).getTime() < Date.now(),
            );
            const dayLabel =
              groupIndex === 0 ||
              localDateKey(groups[groupIndex - 1].scheduledAt) !== localDateKey(group.scheduledAt)
                ? dateChipLabel(localDateKey(group.scheduledAt))
                : null;

            return (
              <div key={group.id} className="space-y-3">
                {dayLabel && (
                  <div className="flex items-center gap-3 pt-1">
                    <div className="h-px flex-1 bg-border" />
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-bg2 px-3 py-1 text-xs text-text2">
                      <CalendarDays className="h-3.5 w-3.5" /> {dayLabel} —{" "}
                      {dayCounts.get(localDateKey(group.scheduledAt)) ?? group.items.length} posts
                    </span>
                    <div className="h-px flex-1 bg-border" />
                  </div>
                )}

                <article
                  className={[
                    "overflow-hidden rounded-xl border bg-bg2",
                    overdue
                      ? "border-warning"
                      : group.status === "failed"
                        ? "border-danger/60"
                        : "border-border",
                  ].join(" ")}
                >
                  <div className="flex flex-col gap-3 p-3 sm:p-4 lg:flex-row lg:items-start">
                    <div className="flex items-start gap-3 lg:min-w-0 lg:flex-1">
                      <input
                        type="checkbox"
                        checked={isGroupSelected}
                        onChange={() => toggleIds(groupIds)}
                        className="mt-1 accent-accent"
                        aria-label="Selecionar grupo"
                      />
                      <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-border bg-bg3 sm:h-20 sm:w-20">
                        {group.thumb ? (
                          <img
                            src={group.thumb}
                            alt="Prévia da publicação"
                            className="h-full w-full object-cover"
                            loading="lazy"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-muted2">
                            <Play className="h-5 w-5" />
                          </div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          {overdue && (
                            <span className="rounded-full border border-warning/40 bg-warning/10 px-2 py-1 text-[11px] font-semibold text-warning">
                              <AlertTriangle className="mr-1 inline h-3 w-3" />
                              Atrasado
                            </span>
                          )}
                          <span className="rounded-full border border-border2 bg-bg3 px-2 py-1 text-[11px] font-semibold text-text2">
                            {group.mediaType}
                          </span>
                          <span
                            className="rounded-full px-2 py-1 text-[11px] font-semibold"
                            style={{ background: meta.bg, color: meta.fg }}
                          >
                            {meta.label}
                          </span>
                          {group.items.some((item) => (item.attempts ?? 0) > 0) && (
                            <span className="rounded-full border border-accent/35 bg-accent/10 px-2 py-1 text-[11px] font-semibold text-accent2">
                              +{Math.max(...group.items.map((item) => item.attempts ?? 0))}{" "}
                              tentativa(s)
                            </span>
                          )}
                        </div>
                        <p className="mt-2 line-clamp-2 text-sm font-medium">
                          {group.caption || "Sem legenda"}
                        </p>
                        {group.items.some((item) => item.last_error) && (
                          <p className="mt-1 line-clamp-2 text-xs text-danger">
                            {group.items.find((item) => item.last_error)?.last_error}
                          </p>
                        )}
                        <div className="mt-3 flex flex-wrap gap-1.5">
                          {group.accounts.slice(0, 12).map((account, index) => (
                            <span
                              key={`${account.username}-${index}`}
                              className={[
                                "inline-flex max-w-full items-center gap-1 rounded-full border px-2 py-1 text-[11px] font-semibold",
                                isTokenExpired(account)
                                  ? "border-danger/40 bg-danger/10 text-danger"
                                  : "border-border bg-bg3 text-text2",
                              ].join(" ")}
                            >
                              {account.profile_picture ? (
                                <img
                                  src={account.profile_picture}
                                  alt=""
                                  className="h-4 w-4 rounded-full"
                                />
                              ) : (
                                <Users className="h-3 w-3" />
                              )}
                              <span className="truncate">@{account.username}</span>
                              {isTokenExpired(account) && (
                                <span className="shrink-0">· Token expirado</span>
                              )}
                            </span>
                          ))}
                          {group.accounts.length > 12 && (
                            <span className="rounded-full border border-border bg-bg3 px-2 py-1 text-[11px] text-muted2">
                              +{group.accounts.length - 12}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-3 border-t border-border pt-3 lg:w-64 lg:border-t-0 lg:pt-0">
                      <div className="text-left lg:text-right">
                        <div className="text-sm font-bold text-warning">
                          <Clock3 className="mr-1 inline h-3.5 w-3.5" />
                          {fmtDateTime(group.scheduledAt)}
                        </div>
                        <div className="mt-1 text-xs text-muted2">
                          {group.counts.published}/{group.items.length} contas publicadas
                        </div>
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            className="rounded-lg p-2 text-muted2 hover:bg-bg3 hover:text-foreground"
                            aria-label="Ações"
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-52">
                          <DropdownMenuItem onSelect={() => toggleIds(groupIds)}>
                            <CheckCircle2 className="mr-2 h-4 w-4" />{" "}
                            {isGroupSelected ? "Desmarcar grupo" : "Selecionar grupo"}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onSelect={() =>
                              runBulk(
                                "Pausando",
                                (id) => api.updateQueueStatus(id, "canceled"),
                                groupIds,
                              )
                            }
                          >
                            <Pause className="mr-2 h-4 w-4" /> Pausar grupo
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onSelect={() =>
                              runBulk(
                                "Retomando",
                                (id) => api.updateQueueStatus(id, "scheduled"),
                                groupIds,
                              )
                            }
                          >
                            <Play className="mr-2 h-4 w-4" /> Retomar grupo
                          </DropdownMenuItem>
                          <DropdownMenuItem onSelect={() => publishSelectedNow(groupIds)}>
                            <Zap className="mr-2 h-4 w-4" /> Tentar agora
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-danger focus:text-danger"
                            onSelect={() => {
                              if (!confirm("Remover este grupo da fila?")) return;
                              runBulk("Removendo", (id) => api.deleteQueue(id), groupIds);
                            }}
                          >
                            <Trash2 className="mr-2 h-4 w-4" /> Remover grupo
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>

                  <div className="space-y-1 border-t border-border bg-bg3/25 p-3">
                    {group.items.map((item) => {
                      const account = accountById.get(item.account) ?? {
                        id: item.account,
                        username: item.account.slice(0, 16),
                        name: item.account,
                        profile_picture: "",
                      };
                      const itemMeta = STATUS_META[item.status];
                      const tokenExpired = isTokenExpired(account);
                      return (
                        <label
                          key={item.id}
                          className="flex cursor-pointer items-center gap-2 rounded-lg border border-border bg-bg3/60 px-3 py-2 text-sm hover:border-border2"
                        >
                          <input
                            type="checkbox"
                            checked={selected.has(item.id)}
                            onChange={() => toggle(item.id)}
                            className="accent-accent"
                          />
                          {account.profile_picture ? (
                            <img
                              src={account.profile_picture}
                              alt=""
                              className="h-6 w-6 rounded-full"
                            />
                          ) : (
                            <Users className="h-4 w-4 text-muted2" />
                          )}
                          <span className="min-w-0 flex-1 truncate font-semibold">
                            @{account.username}
                          </span>
                          {tokenExpired && (
                            <span className="shrink-0 rounded-md border border-danger/40 bg-danger/10 px-2 py-1 text-[11px] font-semibold text-danger">
                              Token expirado
                            </span>
                          )}
                          {tokenExpired && (
                            <button
                              type="button"
                              disabled={loading !== null}
                              onClick={(e) => {
                                e.preventDefault();
                                void handleReconnect(account);
                              }}
                              className="shrink-0 rounded-md border border-border2 bg-bg2 px-2 py-1 text-[11px] font-semibold text-text2 hover:border-accent hover:text-foreground disabled:opacity-60"
                            >
                              Reconectar
                            </button>
                          )}
                          <span
                            className="shrink-0 rounded-md px-2 py-1 text-[11px] font-semibold"
                            style={{ background: itemMeta.bg, color: itemMeta.fg }}
                          >
                            {itemMeta.short}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </article>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
