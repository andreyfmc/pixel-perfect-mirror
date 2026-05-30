import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { api } from "@/lib/api-client";
import { fmtDateTime } from "@/lib/format";

export type LoopRowLite = {
  id: string;
  source_type: "snapshot" | "live_folder";
  folder_id: string | null;
  folder_name: string | null;
  video_ids_json: string | null;
  account_ids_json: string;
  caption: string;
  gap_min: number;
  jitter_min: number;
  order_mode: "sequential" | "random";
  status: "active" | "paused" | "stopped";
  cycle_number: number;
  next_cycle_at: string;
  last_error: string | null;
};

export function LoopCard({
  loop,
  onChanged,
}: {
  loop: LoopRowLite;
  onChanged: () => void;
}) {
  const [liveCount, setLiveCount] = useState<number | null>(null);
  const [liveErr, setLiveErr] = useState<string | null>(null);

  useEffect(() => {
    if (loop.source_type !== "live_folder" || !loop.folder_id) return;
    let alive = true;
    const tick = async () => {
      const r = await api.folderLiveCount(loop.folder_id!);
      if (!alive || !r) return;
      setLiveCount(r.count);
      setLiveErr(r.error);
    };
    tick();
    const i = setInterval(tick, 30_000);
    return () => {
      alive = false;
      clearInterval(i);
    };
  }, [loop.folder_id, loop.source_type]);

  const accCount = (() => {
    try {
      return (JSON.parse(loop.account_ids_json) as string[]).length;
    } catch {
      return 0;
    }
  })();

  const vidCount = (() => {
    if (loop.source_type === "live_folder") return liveCount ?? "—";
    try {
      return (JSON.parse(loop.video_ids_json ?? "[]") as string[]).length;
    } catch {
      return 0;
    }
  })();

  const setStatus = async (status: "active" | "paused" | "stopped") => {
    await api.patchLoop(loop.id, { status, cancel_pending: status !== "active" });
    onChanged();
  };

  const statusBadge =
    loop.status === "active"
      ? "bg-emerald-500/20 text-emerald-300"
      : loop.status === "paused"
        ? "bg-amber-500/20 text-amber-300"
        : "bg-rose-500/20 text-rose-300";

  return (
    <li className="rounded-[8px] border border-border bg-bg3/60 p-3 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={[
            "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase",
            statusBadge,
          ].join(" ")}
        >
          {loop.status}
        </span>
        <span className="text-muted2">
          {loop.source_type === "live_folder" ? "🔄 ao vivo" : "📌 snapshot"}
        </span>
        {loop.folder_name && (
          <span className="font-medium text-foreground">📁 {loop.folder_name}</span>
        )}
        <span className="text-muted2">
          · {vidCount} vídeo{vidCount === 1 ? "" : "s"} · {accCount} conta
          {accCount === 1 ? "" : "s"} · ciclo #{loop.cycle_number}
        </span>
      </div>

      <div className="mt-1 text-muted2">
        Próximo ciclo:{" "}
        <span className="text-foreground">{fmtDateTime(loop.next_cycle_at)}</span> · gap{" "}
        {loop.gap_min}min · jitter +0–{loop.jitter_min}min · {loop.order_mode}
      </div>

      {loop.last_error && (
        <div className="mt-1 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-[11px] text-amber-300">
          ⚠ {loop.last_error}
        </div>
      )}
      {liveErr && loop.source_type === "live_folder" && (
        <div className="mt-1 text-[11px] text-amber-400/80">⚠ {liveErr}</div>
      )}

      <div className="mt-2 flex flex-wrap gap-1">
        {loop.status !== "active" && (
          <button
            onClick={() => setStatus("active")}
            className="rounded-md border border-border2 bg-bg3 px-2 py-1 text-[11px] hover:border-[var(--accent2)]"
          >
            ▶ Retomar
          </button>
        )}
        {loop.status === "active" && (
          <button
            onClick={() => setStatus("paused")}
            className="rounded-md border border-border2 bg-bg3 px-2 py-1 text-[11px] hover:border-amber-400"
          >
            ⏸ Pausar
          </button>
        )}
        <button
          onClick={() => {
            if (
              confirm(
                "Encerrar este loop? Itens agendados ainda não publicados serão removidos.",
              )
            ) {
              setStatus("stopped");
            }
          }}
          className="rounded-md border border-border2 bg-bg3 px-2 py-1 text-[11px] hover:border-rose-400"
        >
          ⏹ Encerrar
        </button>
      </div>
    </li>
  );
}
