import { createFileRoute } from "@tanstack/react-router";
import { mockQueue } from "@/lib/mock";
import { GripVertical, Play, RefreshCw, Trash2 } from "lucide-react";

export const Route = createFileRoute("/_app/queue")({
  component: QueuePage,
  head: () => ({ meta: [{ title: "Fila · Insta Manager" }] }),
});

const statusStyle: Record<string, { bg: string; fg: string; label: string }> = {
  scheduled: { bg: "color-mix(in oklab, var(--info) 18%, transparent)", fg: "var(--info)", label: "Agendado" },
  processing: { bg: "color-mix(in oklab, var(--warning) 18%, transparent)", fg: "var(--warning)", label: "Processando" },
  failed: { bg: "color-mix(in oklab, var(--danger) 18%, transparent)", fg: "var(--danger)", label: "Falhou" },
};

function QueuePage() {
  return (
    <div className="mx-auto max-w-7xl px-5 py-8 md:px-10">
      <header className="mb-8 flex items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted2">Fila</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">Próximas publicações</h1>
        </div>
        <button className="inline-flex items-center gap-1.5 rounded-lg border border-border2 bg-bg3 px-3.5 py-2 text-sm hover:border-accent">
          <RefreshCw className="h-4 w-4" /> Disparar scheduler
        </button>
      </header>

      <div className="im-card divide-y divide-border">
        {mockQueue.map((q) => {
          const s = statusStyle[q.status];
          return (
            <article key={q.id} className="flex items-center gap-4 p-4 hover:bg-bg3/40">
              <button className="text-muted2 hover:text-foreground" aria-label="Reordenar">
                <GripVertical className="h-4 w-4" />
              </button>
              <div className="relative">
                <img src={q.thumb} alt="" className="h-16 w-16 rounded-lg object-cover" />
                {q.media_type === "REEL" && (
                  <span className="absolute bottom-1 right-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/70">
                    <Play className="h-3 w-3 text-white" />
                  </span>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
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
              </div>
              <div className="hidden text-right text-xs text-text2 md:block">
                {new Date(q.scheduled_at).toLocaleString("pt-BR", {
                  day: "2-digit",
                  month: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </div>
              <button className="text-muted2 hover:text-danger" aria-label="Remover">
                <Trash2 className="h-4 w-4" />
              </button>
            </article>
          );
        })}
      </div>
    </div>
  );
}
