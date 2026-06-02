import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { CalendarPlus, CheckCircle2, Loader2 } from "lucide-react";
import { api } from "@/lib/api-client";
import { variateCaption } from "@/lib/caption-variant";
import { fmtDateTime } from "@/lib/format";
import type { DriveVideo, DriveCrumb } from "@/lib/drive.functions";
import { DriveBrowser } from "./DriveBrowser";
import { AccountSelector } from "./AccountSelector";
import { ScheduleConfig } from "./ScheduleConfig";
import { CaptionInput } from "./CaptionInput";

// ---------------------------------------------------------------------------
// Persistência local
// ---------------------------------------------------------------------------
const POST_STORAGE_KEY = "warmup.post.v1";

type PostPersist = {
  selectedAccounts?: string[];
  caption?: string;
  gap?: number;
  jitter?: number;
  order?: "sequential" | "random";
  mediaType?: "REEL" | "IMAGE" | "STORY";
  videosPerCycle?: number;
  loopDuration?: "infinite" | "days" | "cycles";
  loopDays?: number;
  loopCycles?: number;
};

function loadPost(): PostPersist {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(window.localStorage.getItem(POST_STORAGE_KEY) ?? "{}");
  } catch {
    return {};
  }
}

// ---------------------------------------------------------------------------
// PRNG seeded (FNV-1a + xorshift) para shuffle determinístico por conta
// ---------------------------------------------------------------------------
function seededRng(seed: string): () => number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  }
  return () => {
    h ^= h << 13;
    h >>>= 0;
    h ^= h >>> 17;
    h ^= h << 5;
    h >>>= 0;
    return (h >>> 0) / 4294967296;
  };
}

function shuffleSeeded<T>(arr: T[], seed: string): T[] {
  const rng = seededRng(seed);
  const a = [...arr];
  for (let j = a.length - 1; j > 0; j--) {
    const k = Math.floor(rng() * (j + 1));
    [a[j], a[k]] = [a[k], a[j]];
  }
  return a;
}

function localNow(): string {
  const d = new Date();
  d.setSeconds(0, 0);
  const tz = d.getTimezoneOffset() * 60_000;
  return new Date(d.getTime() - tz).toISOString().slice(0, 16);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function DistributeTab() {
  const persisted = loadPost();
  const navigate = useNavigate();

  // --- State -----------------------------------------------------------------
  const [selectedVideos, setSelectedVideos] = useState<Map<string, DriveVideo>>(
    new Map(),
  );
  const [currentFolder, setCurrentFolder] = useState<DriveCrumb | null>(null);
  const [currentFolderId, setCurrentFolderId] = useState("root");

  const [selectedAccounts, setSelectedAccounts] = useState<string[]>(
    persisted.selectedAccounts ?? [],
  );
  const [caption, setCaption] = useState(persisted.caption ?? "");
  const [start, setStart] = useState(localNow);
  const [gap, setGap] = useState(persisted.gap ?? 60);
  const [jitter, setJitter] = useState(persisted.jitter ?? 20);
  const [order, setOrder] = useState<"sequential" | "random">(
    persisted.order ?? "sequential",
  );
  const [mediaType, setMediaType] = useState<"REEL" | "IMAGE" | "STORY">(
    persisted.mediaType ?? "REEL",
  );
  const [loopMode, setLoopMode] = useState<"once" | "loop">("once");
  const [loopDuration, setLoopDuration] = useState<"infinite" | "days" | "cycles">(
    persisted.loopDuration ?? "infinite",
  );
  const [loopDays, setLoopDays] = useState<number>(persisted.loopDays ?? 7);
  const [loopCycles, setLoopCycles] = useState<number>(persisted.loopCycles ?? 10);
  const [videosPerCycle, setVideosPerCycle] = useState<number>(
    persisted.videosPerCycle ?? 3,
  );

  const [enqueueing, setEnqueueing] = useState(false);
  const [enqueueOk, setEnqueueOk] = useState(false);
  const [enqueueMsg, setEnqueueMsg] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  // --- Data ------------------------------------------------------------------
  const { data: accountsRaw = [] } = useQuery({
    queryKey: ["accounts"],
    queryFn: () => api.listAccounts(),
  });
  const { data: models = [] } = useQuery({
    queryKey: ["models"],
    queryFn: () => api.listModels(),
  });

  // Lê overrides de role (definidos na aba Contas) e exclui contas descartadas
  const [roleMap, setRoleMap] = useState<Record<string, string>>({});
  useEffect(() => {
    const load = () => {
      try {
        const raw = window.localStorage.getItem("accounts.roleOverrides.v1");
        setRoleMap(raw ? (JSON.parse(raw) as Record<string, string>) : {});
      } catch {
        setRoleMap({});
      }
    };
    load();
    const onStorage = (e: StorageEvent) => {
      if (e.key === "accounts.roleOverrides.v1") load();
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const accounts = accountsRaw.filter((a) => {
    const role = roleMap[a.id] ?? (a as { role?: string }).role ?? "active";
    return role !== "discarded";
  });

  // Hidrata seleção padrão (todas as contas) se não havia persistido
  useEffect(() => {
    if (accounts.length && selectedAccounts.length === 0 && !persisted.selectedAccounts) {
      setSelectedAccounts(accounts.map((a) => a.id));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accounts.length]);

  // Remove contas descartadas da seleção persistida
  useEffect(() => {
    if (!accountsRaw.length) return;
    const validIds = new Set(accounts.map((a) => a.id));
    setSelectedAccounts((prev) => {
      const filtered = prev.filter((id) => validIds.has(id));
      return filtered.length === prev.length ? prev : filtered;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountsRaw, roleMap]);

  // Persiste preferências
  useEffect(() => {
    try {
      window.localStorage.setItem(
        POST_STORAGE_KEY,
        JSON.stringify({
          selectedAccounts,
          caption,
          gap,
          jitter,
          order,
          mediaType,
          videosPerCycle,
          loopDuration,
          loopDays,
          loopCycles,
        }),
      );
    } catch {}
  }, [
    selectedAccounts,
    caption,
    gap,
    jitter,
    order,
    mediaType,
    videosPerCycle,
    loopDuration,
    loopDays,
    loopCycles,
  ]);

  // --- Validação -------------------------------------------------------------
  const selectedList = Array.from(selectedVideos.values());
  const startInPast =
    Number.isFinite(new Date(start).getTime()) &&
    new Date(start).getTime() < Date.now() - 60_000;

  const missing: string[] = [];
  if (!selectedList.length) missing.push("selecione vídeos");
  if (!selectedAccounts.length) missing.push("selecione contas");
  if (startInPast) missing.push("data de início no passado");

  const canEnqueue = missing.length === 0 && !enqueueing;
  const disabledReason = missing.length ? `Faltando: ${missing.join(" · ")}` : "";

  // --- Preview ---------------------------------------------------------------
  const fmtPreview = () => {
    try {
      return new Date(start).toLocaleString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return start;
    }
  };

  // --- Agendar ---------------------------------------------------------------
  const enqueueAll = async () => {
    if (!canEnqueue) return;
    setEnqueueing(true);
    setEnqueueOk(false);
    setEnqueueMsg(null);
    setProgress(null);

    try {
      const startMs = new Date(start).getTime();
      const jitterMs = Math.max(0, jitter) * 60_000;
      const gapMs = Math.max(1, gap) * 60_000;

      // Ordem de vídeos por conta (sequencial ou embaralhada por seed=accountId).
      const accountVideos = new Map<string, DriveVideo[]>();
      for (const accId of selectedAccounts) {
        accountVideos.set(
          accId,
          order === "random" ? shuffleSeeded(selectedList, accId) : selectedList,
        );
      }

      type Payload = {
        account_id: string;
        caption: string;
        media_type: "REEL" | "IMAGE" | "STORY";
        media_key: string;
        scheduled_at: string;
        group_id: string;
        group_scheduled_at: string;
      };
      const payloads: Payload[] = [];

      // Quantos ciclos materializar (loop = todos de uma vez; once = 1 por vídeo).
      let totalCycles = selectedList.length;
      if (loopMode === "loop") {
        if (loopDuration === "cycles") {
          totalCycles = Math.min(500, Math.max(1, loopCycles));
        } else {
          const days = loopDuration === "days" ? Math.max(1, loopDays) : 30;
          totalCycles = Math.min(
            500,
            Math.max(1, Math.floor((days * 24 * 60) / Math.max(1, gap))),
          );
        }
      }

      if (loopMode === "once") {
        // Cada vídeo selecionado vira um ciclo — 1 post por conta por ciclo.
        for (let cycle = 0; cycle < selectedList.length; cycle++) {
          const cycleStartMs = startMs + cycle * gapMs;
          const groupId = crypto.randomUUID();
          const groupScheduledAt = new Date(cycleStartMs).toISOString();
          for (const accId of selectedAccounts) {
            const v = accountVideos.get(accId)![cycle];
            const jitterOffset = jitterMs ? Math.floor(Math.random() * (jitterMs + 1)) : 0;
            payloads.push({
              account_id: accId,
              caption: mediaType === "STORY" ? "" : variateCaption(caption, `${accId}|${v.id}`),
              media_type: mediaType,
              media_key: `drive:${v.id}`,
              scheduled_at: new Date(cycleStartMs + jitterOffset).toISOString(),
              group_id: groupId,
              group_scheduled_at: groupScheduledAt,
            });
          }
        }
      } else {
        // Modo LOOP — materializa todos os ciclos na fila como posts normais.
        // Cada ciclo posta `perCycle` vídeos por conta com jitter entre eles;
        // o próximo ciclo começa `gap` minutos depois.
        const perCycle = Math.min(10, Math.max(1, videosPerCycle));
        for (let cycle = 0; cycle < totalCycles; cycle++) {
          const baseStart = startMs + cycle * gapMs;
          const groupId = crypto.randomUUID();
          const groupScheduledAt = new Date(baseStart).toISOString();
          for (const accId of selectedAccounts) {
            const list = accountVideos.get(accId)!;
            let prevMs = baseStart;
            for (let i = 0; i < perCycle; i++) {
              const v = list[(cycle * perCycle + i) % list.length];
              let scheduledMs: number;
              if (i === 0) {
                scheduledMs = baseStart + (jitterMs ? Math.floor(Math.random() * (jitterMs + 1)) : 0);
              } else {
                const minMs = 2 * 60_000;
                const maxMs = jitterMs + 2 * 60_000;
                scheduledMs = prevMs + minMs + Math.floor(Math.random() * (maxMs - minMs + 1));
              }
              prevMs = scheduledMs;
              payloads.push({
                account_id: accId,
                caption: mediaType === "STORY" ? "" : variateCaption(caption, `${accId}|${v.id}`),
                media_type: mediaType,
                media_key: `drive:${v.id}`,
                scheduled_at: new Date(scheduledMs).toISOString(),
                group_id: groupId,
                group_scheduled_at: groupScheduledAt,
              });
            }
          }
        }
      }

      // Enfileira em lotes de 20 para não travar o Worker, com progresso.
      let ok = 0;
      let fail = 0;
      const BATCH = 20;
      setProgress({ done: 0, total: payloads.length });
      for (let i = 0; i < payloads.length; i += BATCH) {
        const chunk = payloads.slice(i, i + BATCH);
        const results = await Promise.all(
          chunk.map((p) => api.enqueue(p).catch(() => null)),
        );
        for (const res of results) {
          if (res) {
            ok++;
          } else {
            fail++;
          }
        }
        setProgress({ done: Math.min(payloads.length, i + chunk.length), total: payloads.length });
      }

      setEnqueueOk(fail === 0 && ok > 0);
      if (loopMode === "once") {
        setEnqueueMsg(
          `✓ ${ok} agendado(s)${fail ? ` · ${fail} falha(s)` : ""} · ${selectedList.length} ciclo(s) de ${gap}min · jitter +0–${jitter}min`,
        );
      } else {
        const fmtDay = (ms: number) =>
          new Date(ms).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
        const lastMs = startMs + (totalCycles - 1) * gapMs;
        setEnqueueMsg(
          `✓ ${ok} post(s) agendado(s) para ${totalCycles} ciclos${fail ? ` · ${fail} falha(s)` : ""} · período: ${fmtDay(startMs)} até ${fmtDay(lastMs)}`,
        );
      }
      if (ok > 0 && fail === 0) {
        setTimeout(() => navigate({ to: "/queue" }), 800);
      }
    } catch (e) {
      setEnqueueMsg(`Erro: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setEnqueueing(false);
      setProgress(null);
    }
  };

  // --- Botão de agendar (reutilizado desktop e mobile) ----------------------
  const scheduleButton = (extraClass = "") => (
    <button
      onClick={enqueueAll}
      disabled={!canEnqueue}
      title={disabledReason || undefined}
      className={[
        "inline-flex w-full items-center justify-center gap-2 rounded-[10px] px-4 py-2.5 text-sm font-semibold text-white shadow transition",
        enqueueOk ? "bg-emerald-500 hover:bg-emerald-500/90" : "bg-[var(--accent2)] hover:opacity-90",
        !canEnqueue ? "cursor-not-allowed opacity-50" : "",
        extraClass,
      ].join(" ")}
    >
      {enqueueing ? (
        <><Loader2 className="h-4 w-4 animate-spin" /> Agendando…</>
      ) : enqueueOk ? (
        <><CheckCircle2 className="h-4 w-4" /> Agendado com sucesso!</>
      ) : (
        <><CalendarPlus className="h-4 w-4" /> Agendar nas contas selecionadas</>
      )}
    </button>
  );

  // ---------------------------------------------------------------------------
  return (
    <div className="space-y-6 pb-24 md:pb-0">
      {/* Tipo de mídia */}
      <div className="rounded-[10px] border border-border bg-bg3/30 p-3">
        <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-text2">
          Tipo de postagem
        </div>
        <div className="inline-flex rounded-[8px] border border-border2 bg-bg3 p-0.5">
          {(["REEL", "IMAGE", "STORY"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setMediaType(t)}
              className={[
                "rounded-[6px] px-3 py-1.5 text-xs font-semibold transition",
                mediaType === t
                  ? "bg-[var(--accent2)] text-white"
                  : "text-text2 hover:text-foreground",
              ].join(" ")}
            >
              {t}
            </button>
          ))}
        </div>
        {mediaType === "STORY" && (
          <div className="mt-2 space-y-1 text-[11px] text-amber-400/80">
            <p>⚠ Stories não suportam legenda via API — o campo será ignorado.</p>
            <p>⚠ Vídeos em Story devem ter no máximo 15 segundos.</p>
          </div>
        )}
      </div>

      <DriveBrowser
        selectedVideos={selectedVideos}
        onSelectionChange={setSelectedVideos}
        onFolderChange={(folderId, breadcrumbs) => {
          setCurrentFolderId(folderId);
          setCurrentFolder(breadcrumbs[breadcrumbs.length - 1] ?? null);
        }}
      />

      <AccountSelector
        accounts={accounts}
        selectedIds={selectedAccounts}
        onChange={setSelectedAccounts}
        models={models}
      />

      <ScheduleConfig
        start={start}
        gap={gap}
        jitter={jitter}
        loopMode={loopMode}
        loopDuration={loopDuration}
        loopDays={loopDays}
        loopCycles={loopCycles}
        order={order}
        videosPerCycle={videosPerCycle}
        onStartChange={setStart}
        onGapChange={setGap}
        onJitterChange={setJitter}
        onLoopModeChange={setLoopMode}
        onLoopDurationChange={setLoopDuration}
        onLoopDaysChange={setLoopDays}
        onLoopCyclesChange={setLoopCycles}
        onOrderChange={setOrder}
        onVideosPerCycleChange={setVideosPerCycle}
      />

      {mediaType !== "STORY" && <CaptionInput value={caption} onChange={setCaption} />}

      {/* Preview */}
      {selectedList.length > 0 && selectedAccounts.length > 0 && (
        <div className="rounded-[8px] border border-dashed border-border bg-bg3/40 px-3 py-2 text-[11px] text-text2">
          <span className="font-semibold text-foreground">
            {selectedAccounts.length} conta{selectedAccounts.length === 1 ? "" : "s"} ×{" "}
            {selectedList.length} vídeo{selectedList.length === 1 ? "" : "s"}
          </span>{" "}
          → próxima postagem em{" "}
          <span className="font-medium text-foreground">{fmtPreview()}</span>, ciclo de{" "}
          <span className="font-medium text-foreground">{gap}</span> +{" "}
          <span className="font-medium text-foreground">0–{jitter}</span> min
        </div>
      )}

      {/* Feedback */}
      {progress && progress.total > 0 && (
        <div className="space-y-1.5 rounded-[8px] border border-border bg-bg3 px-3 py-2 text-xs text-text2">
          <div className="flex items-center justify-between">
            <span>Agendando posts…</span>
            <span className="tabular-nums font-medium text-foreground">
              {progress.done}/{progress.total}
            </span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-bg2">
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${Math.round((progress.done / progress.total) * 100)}%`,
                background: "var(--accent2)",
              }}
            />
          </div>
        </div>
      )}
      {enqueueMsg && (
        <div
          className={[
            "rounded-[8px] border px-3 py-2 text-xs",
            enqueueOk
              ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
              : "border-border bg-bg3 text-text2",
          ].join(" ")}
        >
          {enqueueMsg}
        </div>
      )}
      {!canEnqueue && missing.length > 0 && (
        <p className="text-[11px] text-amber-400/80">{disabledReason}</p>
      )}
      <p className="text-[11px] text-muted2">
        {loopMode === "once"
          ? `Cada vídeo vira um ciclo: todas as contas selecionadas postam o mesmo vídeo com um atraso aleatório de 0 a ${jitter}min, e o próximo ciclo começa ${gap}min depois.`
          : `Loop contínuo: os ciclos são agendados de uma vez na fila (${videosPerCycle} post/ciclo, a cada ${gap}min). Para parar, cancele os posts agendados na aba Fila.`}{" "}
        ✓ Variantes únicas por conta são geradas automaticamente no servidor.
      </p>

      {/* Desktop: inline */}
      <div className="hidden md:block">{scheduleButton("min-h-[44px]")}</div>

      {/* Mobile: sticky bottom */}
      <div
        className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-bg/95 px-3 py-3 backdrop-blur md:hidden"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 12px)" }}
      >
        {scheduleButton("h-14")}
      </div>
    </div>
  );
}
