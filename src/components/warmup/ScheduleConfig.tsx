import { CalendarDays, Clock, RefreshCw, Shuffle } from "lucide-react";

type LoopMode = "once" | "snapshot" | "live_folder";
type OrderMode = "sequential" | "random";

type Props = {
  start: string;
  gap: number;
  jitter: number;
  loopMode: LoopMode;
  order: OrderMode;
  onStartChange: (v: string) => void;
  onGapChange: (v: number) => void;
  onJitterChange: (v: number) => void;
  onLoopModeChange: (v: LoopMode) => void;
  onOrderChange: (v: OrderMode) => void;
};

export function ScheduleConfig({
  start,
  gap,
  jitter,
  loopMode,
  order,
  onStartChange,
  onGapChange,
  onJitterChange,
  onLoopModeChange,
  onOrderChange,
}: Props) {
  const startInPast =
    Number.isFinite(new Date(start).getTime()) &&
    new Date(start).getTime() < Date.now() - 60_000;

  return (
    <div className="space-y-4">
      {/* Tempo */}
      <section className="space-y-3 rounded-[10px] border border-border bg-bg3/30 p-4">
        <h3 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-text2">
          <Clock className="h-3.5 w-3.5" /> Configuração de tempo
        </h3>
        <div className="grid grid-cols-3 gap-2">
          <div>
            <label className="mb-1 flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted2">
              <CalendarDays className="h-3 w-3" /> Início
            </label>
            <input
              type="datetime-local"
              value={start}
              onChange={(e) => onStartChange(e.target.value)}
              className={[
                "w-full rounded-[8px] border bg-bg3 px-2 py-1.5 text-xs outline-none focus:border-[var(--accent2)]",
                startInPast ? "border-red-500/60" : "border-border2",
              ].join(" ")}
            />
            {startInPast && (
              <p className="mt-1 text-[10px] text-red-400">data no passado</p>
            )}
          </div>
          <div>
            <label
              className="mb-1 flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted2"
              title="Intervalo entre ciclos (cada vídeo)"
            >
              <Clock className="h-3 w-3" /> Ciclo (min)
            </label>
            <input
              type="number"
              min={1}
              value={gap}
              onChange={(e) => onGapChange(Number(e.target.value))}
              className="w-full rounded-[8px] border border-border2 bg-bg3 px-2 py-1.5 text-xs outline-none focus:border-[var(--accent2)]"
            />
          </div>
          <div>
            <label
              className="mb-1 flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted2"
              title="Atraso aleatório (0 a N min) somado ao intervalo de cada conta"
            >
              <Shuffle className="h-3 w-3" /> Jitter (+min)
            </label>
            <input
              type="number"
              min={0}
              value={jitter}
              onChange={(e) => onJitterChange(Number(e.target.value))}
              className="w-full rounded-[8px] border border-border2 bg-bg3 px-2 py-1.5 text-xs outline-none focus:border-[var(--accent2)]"
            />
          </div>
        </div>
      </section>

      {/* Modo de execução */}
      <section className="space-y-2 rounded-[10px] border border-border bg-bg3/30 p-4">
        <h3 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-text2">
          <RefreshCw className="h-3.5 w-3.5" /> Modo de execução
        </h3>
        <div className="flex flex-wrap gap-1 rounded-full border border-border2 bg-bg3 p-1">
          {(
            [
              { id: "once" as const, label: "Postagem única" },
              { id: "snapshot" as const, label: "Loop (snapshot)" },
              { id: "live_folder" as const, label: "Loop (pasta ao vivo)" },
            ] as const
          ).map((opt) => {
            const active = loopMode === opt.id;
            return (
              <button
                key={opt.id}
                onClick={() => onLoopModeChange(opt.id)}
                className={[
                  "rounded-full px-3 py-1.5 text-xs font-medium transition",
                  active ? "text-white shadow" : "text-text2 hover:text-foreground",
                ].join(" ")}
                style={active ? { background: "var(--accent2)" } : undefined}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
        <p className="text-[11px] text-muted2">
          {loopMode === "once" &&
            "Agenda os ciclos uma vez (todos os vídeos selecionados)."}
          {loopMode === "snapshot" &&
            "Loop infinito sobre a lista de vídeos atualmente selecionados (lista fixa)."}
          {loopMode === "live_folder" &&
            "Loop infinito que relê a pasta atual do Drive antes de cada ciclo — novos vídeos entram, deletados saem. Pausa se a pasta ficar vazia."}
        </p>
      </section>

      {/* Ordem dos vídeos */}
      <section className="space-y-2 rounded-[10px] border border-border bg-bg3/30 p-4">
        <h3 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-text2">
          <Shuffle className="h-3.5 w-3.5" /> Ordem dos vídeos
        </h3>
        <div className="inline-grid grid-cols-2 gap-1 rounded-full border border-border2 bg-bg3 p-1">
          {(
            [
              { id: "sequential" as const, label: "Sequencial" },
              { id: "random" as const, label: "Aleatória" },
            ] as const
          ).map((opt) => {
            const active = order === opt.id;
            return (
              <button
                key={opt.id}
                onClick={() => onOrderChange(opt.id)}
                className={[
                  "rounded-full px-4 py-1.5 text-xs font-medium transition",
                  active ? "text-white shadow" : "text-text2 hover:text-foreground",
                ].join(" ")}
                style={active ? { background: "var(--accent2)" } : undefined}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
        <p className="text-[11px] text-muted2">
          {order === "random"
            ? "Ordem: aleatória e independente por conta (seed = accountId)."
            : "Todas as contas seguem a mesma ordem de seleção."}
        </p>
      </section>
    </div>
  );
}
