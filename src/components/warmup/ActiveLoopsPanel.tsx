import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { RefreshCw, Trash2, StopCircle } from "lucide-react";
import { api } from "@/lib/api-client";
import { LoopCard, type LoopRowLite } from "./LoopCard";

export function ActiveLoopsPanel() {
  const queryClient = useQueryClient();
  const { data: loops = [], refetch } = useQuery({
    queryKey: ["loops"],
    queryFn: () => api.listLoops() as Promise<LoopRowLite[]>,
    refetchInterval: 30_000,
  });

  const { mutate: clearStopped, isPending: clearing } = useMutation({
    mutationFn: () => api.deleteStoppedLoops(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["loops"] }),
  });

  const { mutate: stopAll, isPending: stopping } = useMutation({
    mutationFn: () => api.stopAllLoops(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["loops"] }),
  });

  if (!loops.length) return null;

  const activeCount = loops.filter((l) => l.status === "active" || l.status === "paused").length;

  return (
    <section className="space-y-2 rounded-[10px] border border-[var(--accent2)]/30 bg-[var(--accent2)]/5 p-4">
      <div className="flex items-center gap-2">
        <h3 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-text2">
          <RefreshCw className="h-3.5 w-3.5" /> Loops em execução · {loops.length}
        </h3>
        <div className="ml-auto flex items-center gap-2">
          {activeCount > 0 && (
            <button
              onClick={() => {
                if (confirm(`Encerrar todos os ${activeCount} loops ativos?`)) stopAll();
              }}
              disabled={stopping}
              title="Encerrar todos os loops ativos de uma vez"
              className="flex items-center gap-1 rounded-md border border-orange-500/30 bg-orange-500/10 px-2 py-1 text-[10px] font-semibold text-orange-400 transition hover:border-orange-500/60 hover:bg-orange-500/20 disabled:opacity-50"
            >
              <StopCircle className="h-3 w-3" />
              {stopping ? "Encerrando..." : `Encerrar todos (${activeCount})`}
            </button>
          )}
          <button
            onClick={() => clearStopped()}
            disabled={clearing}
            title="Apagar todos os loops encerrados"
            className="flex items-center gap-1 rounded-md border border-red-500/30 bg-red-500/10 px-2 py-1 text-[10px] font-semibold text-red-400 transition hover:border-red-500/60 hover:bg-red-500/20 disabled:opacity-50"
          >
            <Trash2 className="h-3 w-3" />
            Limpar encerrados
          </button>
        </div>
      </div>
      <ul className="space-y-2">
        {loops.map((l) => (
          <LoopCard key={l.id} loop={l} onChanged={() => refetch()} />
        ))}
      </ul>
    </section>
  );
}
