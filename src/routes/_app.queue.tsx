import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import { fmtDateTime } from "@/lib/format";
import type { QueueItem } from "@/lib/mock";
import {
  Play,
  Pause,
  RefreshCw,
  Trash2,
  MoreHorizontal,
  Eraser,
  CheckCircle2,
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

const STATUS_META: Record<StatusKey, { bg: string; fg: string; label: string }> = {
  scheduled: { bg: "color-mix(in oklab, var(--info) 18%, transparent)", fg: "var(--info)", label: "Agendado" },
  processing: { bg: "color-mix(in oklab, var(--warning) 18%, transparent)", fg: "var(--warning)", label: "Processando" },
  failed: { bg: "color-mix(in oklab, var(--danger) 18%, transparent)", fg: "var(--danger)", label: "Falhou" },
  canceled: { bg: "color-mix(in oklab, var(--muted) 22%, transparent)", fg: "var(--text2)", label: "Pausado" },
  published: { bg: "color-mix(in oklab, var(--success) 18%, transparent)", fg: "var(--success)", label: "Publicado" },
};

type FilterKey = "all" | StatusKey;
const FILTERS: { id: FilterKey; label: string }[] = [
  { id: "all", label: "Todos" },
  { id: "scheduled", label: "Agendados" },
  { id: "processing", label: "Processando" },
  { id: "canceled", label: "Pausados" },
  { id: "failed", label: "Falharam" },
  { id: "published", label: "Publicados" },
];

function QueuePage() {
  const qc = useQueryClient();
  const { data: queue = [] } = useQuery({
    queryKey: ["queue"],
    queryFn: () => api.listQueue(),
  });

  const [filter, setFilter] = useState<FilterKey>("all");
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

  const filtered = useMemo(
    () => (filter === "all" ? queue : queue.filter((q) => q.status === filter)),
    [queue, filter],
  );

  const allSelected = filtered.length > 0 && filtered.every((q) => selected.has(q.id));
  const someSelected = selected.size > 0;

  function toggle(id: string) {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }
  function toggleAll() {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map((q) => q.id)));
    }
  }

  async function runBulk(label: string, fn: (id: string) => Promise<void>) {
    if (!selected.size) return;
    const ids = [...selected];
    const t = toast.loading(`${label} ${ids.length} ${ids.length > 1 ? "itens" : "item"}…`);
    try {
      await Promise.all(ids.map(fn));
      toast.success(`${label} concluído`);
      setSelected(new Set());
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
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6 sm:py-7 md:px-10 md:py-8">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted2">Fila</p>
          <h1 className="mt-2 text-2xl sm:text-3xl font-semibold tracking-tight">Próximas publicações</h1>
          <p className="mt-1 text-sm text-text2">
            {counts.scheduled} agendados · {counts.processing} processando · {counts.failed} com falha
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => singleAction("Disparando scheduler", () => api.runScheduler())}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border2 bg-bg3 px-3 py-2 text-sm hover:border-accent"
          >
            <RefreshCw className="h-4 w-4" /> Disparar scheduler
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="inline-flex items-center gap-1.5 rounded-lg border border-border2 bg-bg3 px-3 py-2 text-sm text-text2 hover:border-accent hover:text-foreground">
                <Eraser className="h-4 w-4" /> Limpar
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem onSelect={() => clearByStatus(["failed"], "Remover falhas")}>
                Remover falhas ({counts.failed})
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => clearByStatus(["canceled"], "Remover pausados")}>
                Remover pausados ({counts.canceled})
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => clearByStatus(["published"], "Limpar publicados")}>
                Limpar publicados ({counts.published})
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-red-500 focus:text-red-500"
                onSelect={() =>
                  clearByStatus(["failed", "canceled", "published"], "Limpar tudo concluído/pausado/falho")
                }
              >
                Limpar tudo finalizado
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <div className="mb-4 flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={[
              "rounded-full border px-3 py-1.5 text-xs transition-colors",
              filter === f.id
                ? "border-accent bg-accent/15 text-foreground"
                : "border-border2 bg-bg3 text-text2 hover:text-foreground",
            ].join(" ")}
          >
            {f.label} <span className="text-muted2">· {counts[f.id]}</span>
          </button>
        ))}
      </div>

      {someSelected && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-border bg-bg3 px-3 py-2 text-sm">
          <span className="text-text2">{selected.size} selecionado(s)</span>
          <button
            onClick={() =>
              runBulk("Pausando", (id) => api.updateQueueStatus(id, "canceled"))
            }
            className="inline-flex items-center gap-1.5 rounded-md border border-border2 bg-bg2 px-2.5 py-1 text-xs hover:border-accent"
          >
            <Pause className="h-3.5 w-3.5" /> Pausar
          </button>
          <button
            onClick={() =>
              runBulk("Retomando", (id) => api.updateQueueStatus(id, "scheduled"))
            }
            className="inline-flex items-center gap-1.5 rounded-md border border-border2 bg-bg2 px-2.5 py-1 text-xs hover:border-accent"
          >
            <Play className="h-3.5 w-3.5" /> Retomar
          </button>
          <button
            onClick={() => runBulk("Removendo", (id) => api.deleteQueue(id))}
            className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-border2 bg-bg2 px-2.5 py-1 text-xs text-red-400 hover:border-red-500/40"
          >
            <Trash2 className="h-3.5 w-3.5" /> Remover
          </button>
        </div>
      )}

      <div className="im-card divide-y divide-border">
        <div className="flex items-center gap-3 px-4 py-2 text-xs text-muted2">
          <input
            type="checkbox"
            checked={allSelected}
            onChange={toggleAll}
            className="accent-accent"
            aria-label="Selecionar todos"
          />
          <span>Selecionar tudo visível</span>
        </div>

        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 p-12 text-center text-sm text-text2">
            <CheckCircle2 className="h-6 w-6 text-muted2" />
            Nada por aqui.
          </div>
        ) : (
          filtered.map((q) => {
            const s = STATUS_META[q.status];
            const checked = selected.has(q.id);
            const isCanceled = q.status === "canceled";
            return (
              <article key={q.id} className="flex items-start gap-3 p-3 sm:items-center sm:gap-4 sm:p-4 hover:bg-bg3/40">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggle(q.id)}
                  className="mt-1 sm:mt-0 accent-accent"
                  aria-label="Selecionar item"
                />
                <div className="relative shrink-0">
                  <img src={q.thumb} alt="" className="h-14 w-14 sm:h-16 sm:w-16 rounded-lg object-cover" />
                  {q.media_type === "REEL" && (
                    <span className="absolute bottom-1 right-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/70">
                      <Play className="h-3 w-3 text-white" />
                    </span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-sm font-medium">@{q.account}</span>
                    <span className="rounded-md bg-bg3 px-1.5 py-0.5 text-[10px] uppercase text-text2">
                      {q.media_type}
                    </span>
                    <span
                      className="rounded-md px-1.5 py-0.5 text-[10px] font-medium"
                      style={{ background: s.bg, color: s.fg }}
                    >
                      {s.label}
                    </span>
                  </div>
                  <p className="mt-1 line-clamp-1 text-sm text-text2">{q.caption}</p>
                  <div className="mt-1 text-[11px] text-muted2 md:hidden">
                    {fmtDateTime(q.scheduled_at)}
                  </div>
                </div>
                <div className="hidden text-right text-xs text-text2 md:block">
                  {fmtDateTime(q.scheduled_at)}
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className="text-muted2 hover:text-foreground" aria-label="Ações">
                      <MoreHorizontal className="h-4 w-4" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-44">
                    {isCanceled ? (
                      <DropdownMenuItem
                        onSelect={() =>
                          singleAction("Retomando", () => api.updateQueueStatus(q.id, "scheduled"))
                        }
                      >
                        <Play className="mr-2 h-4 w-4" /> Retomar
                      </DropdownMenuItem>
                    ) : (
                      <DropdownMenuItem
                        onSelect={() =>
                          singleAction("Pausando", () => api.updateQueueStatus(q.id, "canceled"))
                        }
                      >
                        <Pause className="mr-2 h-4 w-4" /> Pausar
                      </DropdownMenuItem>
                    )}
                    {q.status === "failed" && (
                      <DropdownMenuItem
                        onSelect={() =>
                          singleAction("Reagendando", () => api.updateQueueStatus(q.id, "scheduled"))
                        }
                      >
                        <RefreshCw className="mr-2 h-4 w-4" /> Tentar de novo
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="text-red-500 focus:text-red-500"
                      onSelect={() => {
                        if (!confirm("Remover esta publicação da fila?")) return;
                        singleAction("Removendo", () => api.deleteQueue(q.id));
                      }}
                    >
                      <Trash2 className="mr-2 h-4 w-4" /> Remover
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </article>
            );
          })
        )}
      </div>
    </div>
  );
}
