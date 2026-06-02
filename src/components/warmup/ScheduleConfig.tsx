import { CalendarDays, Clock, Infinity as InfinityIcon, Layers, RefreshCw, Shuffle } from "lucide-react";

type LoopMode = "once" | "loop";
type LoopDuration = "infinite" | "days" | "cycles";
type OrderMode = "sequential" | "random";

type Props = {
  start: string;
  gap: number;
  jitter: number;
  loopMode: LoopMode;
  loopDuration: LoopDuration;
  loopDays: number;
  loopCycles: number;
  order: OrderMode;
  videosPerCycle: number;
  onStartChange: (v: string) => void;
  onGapChange: (v: number) => void;
  onJitterChange: (v: number) => void;
  onLoopModeChange: (v: LoopMode) => void;
  onLoopDurationChange: (v: LoopDuration) => void;
  onLoopDaysChange: (v: number) => void;
  onLoopCyclesChange: (v: number) => void;
  onOrderChange: (v: OrderMode) => void;
  onVideosPerCycleChange: (v: number) => void;
};

export function ScheduleConfig({
  start,
  gap,
  jitter,
  loopMode,
  loopDuration,
  loopDays,
  loopCycles,
  order,
  videosPerCycle,
  onStartChange,
  onGapChange,
  onJitterChange,
  onLoopModeChange,
  onLoopDurationChange,
  onLoopDaysChange,
  onLoopCyclesChange,
  onOrderChange,
  onVideosPerCycleChange,
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
        <div className="inline-grid grid-cols-2 gap-1 rounded-full border border-border2 bg-bg3 p-1">
          {(
            [
              { id: "once" as const, label: "Postagem única" },
              { id: "loop" as const, label: "🔁 Loop contínuo" },
            ] as const
          ).map((opt) => {
            const active = loopMode === opt.id;
            return (
              <button
                key={opt.id}
                onClick={() => onLoopModeChange(opt.id)}
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
          {loopMode === "once"
            ? "Agenda os ciclos uma vez (todos os vídeos selecionados)."
            : "Repete a postagem automaticamente, materializando todos os ciclos na fila de uma vez."}
        </p>

        {loopMode === "loop" && (
          <div className="mt-2 space-y-3 rounded-[8px] border border-border2 bg-bg3/50 p-3">
            <div className="space-y-2">
              <label className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-text2">
                <InfinityIcon className="h-3.5 w-3.5" /> Duração do loop
              </label>
              <div className="space-y-2">
                <label className="flex cursor-pointer items-center gap-2 text-xs text-foreground">
                  <input
                    type="radio"
                    name="loop-duration"
                    checked={loopDuration === "infinite"}
                    onChange={() => onLoopDurationChange("infinite")}
                    className="accent-[var(--accent2)]"
                  />
                  Infinito (até eu parar manualmente)
                </label>
                <label className="flex cursor-pointer items-center gap-2 text-xs text-foreground">
                  <input
                    type="radio"
                    name="loop-duration"
                    checked={loopDuration === "days"}
                    onChange={() => onLoopDurationChange("days")}
                    className="accent-[var(--accent2)]"
                  />
                  Por
                  <input
                    type="number"
                    min={1}
                    max={365}
                    value={loopDays}
                    onFocus={() => onLoopDurationChange("days")}
                    onChange={(e) =>
                      onLoopDaysChange(
                        Math.min(365, Math.max(1, Number(e.target.value) || 1)),
                      )
                    }
                    className="w-16 rounded-[8px] border border-border2 bg-bg3 px-2 py-1 text-center text-xs outline-none focus:border-[var(--accent2)]"
                  />
                  dias
                </label>
                <label className="flex cursor-pointer items-center gap-2 text-xs text-foreground">
                  <input
                    type="radio"
                    name="loop-duration"
                    checked={loopDuration === "cycles"}
                    onChange={() => onLoopDurationChange("cycles")}
                    className="accent-[var(--accent2)]"
                  />
                  Por
                  <input
                    type="number"
                    min={1}
                    max={999}
                    value={loopCycles}
                    onFocus={() => onLoopDurationChange("cycles")}
                    onChange={(e) =>
                      onLoopCyclesChange(
                        Math.min(999, Math.max(1, Number(e.target.value) || 1)),
                      )
                    }
                    className="w-16 rounded-[8px] border border-border2 bg-bg3 px-2 py-1 text-center text-xs outline-none focus:border-[var(--accent2)]"
                  />
                  ciclos
                </label>
              </div>
              <p className="text-[10px] text-muted2">
                Máx. 500 ciclos por agendamento. "Infinito" agenda ~30 dias de cada vez.
              </p>
            </div>

            <div className="space-y-2 border-t border-border2 pt-3">
            <label className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-text2">
              <Layers className="h-3.5 w-3.5" /> Posts por ciclo
            </label>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={1}
                max={10}
                step={1}
                value={videosPerCycle}
                onChange={(e) => onVideosPerCycleChange(Number(e.target.value))}
                className="h-1.5 flex-1 cursor-pointer accent-[var(--accent2)]"
              />
              <input
                type="number"
                min={1}
                max={10}
                value={videosPerCycle}
                onChange={(e) =>
                  onVideosPerCycleChange(
                    Math.min(10, Math.max(1, Number(e.target.value) || 1)),
                  )
                }
                className="w-16 rounded-[8px] border border-border2 bg-bg3 px-2 py-1.5 text-center text-xs outline-none focus:border-[var(--accent2)]"
              />
            </div>
            <p className="text-[11px] text-muted2">Quantos reels postar por rodada</p>
            <p className="text-[10px] text-muted2">
              ex: {videosPerCycle} reels com jitter entre eles, depois aguarda o intervalo para o
              próximo ciclo
            </p>
            </div>
          </div>
        )}
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
