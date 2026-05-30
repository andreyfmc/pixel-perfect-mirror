import { useQuery } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { api } from "@/lib/api-client";
import { LoopCard, type LoopRowLite } from "./LoopCard";

export function ActiveLoopsPanel() {
  const { data: loops = [], refetch } = useQuery({
    queryKey: ["loops"],
    queryFn: () => api.listLoops() as Promise<LoopRowLite[]>,
    refetchInterval: 30_000,
  });

  if (!loops.length) return null;

  return (
    <section className="space-y-2 rounded-[10px] border border-[var(--accent2)]/30 bg-[var(--accent2)]/5 p-4">
      <h3 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-text2">
        <RefreshCw className="h-3.5 w-3.5" /> Loops em execução · {loops.length}
      </h3>
      <ul className="space-y-2">
        {loops.map((l) => (
          <LoopCard key={l.id} loop={l} onChanged={() => refetch()} />
        ))}
      </ul>
    </section>
  );
}
