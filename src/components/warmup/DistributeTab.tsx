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
import { ActiveLoopsPanel } from "./ActiveLoopsPanel";

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
  const [loopMode, setLoopMode] = useState<"once" | "snapshot" | "live_folder">(
    "once",
  );

  const [enqueueing, setEnqueueing] = useState(false);
  const [enqueueOk, setEnqueueOk] = useState(false);
  const [enqueueMsg, setEnqueueMsg] = useState<string | null>(null);

  // --- Data ------------------------------------------------------------------
  const { data: accounts = [] } = useQuery({
    queryKey: ["accounts"],
    queryFn: () => api.listAccounts(),
  });
  const { data: models = [] } = useQuery({
    queryKey: ["models"],
    queryFn: () => api.listModels(),
  });

  // Hidrata seleção padrão (todas as contas) se não havia persistido
  useEffect(() => {
    if (accounts.length && selectedAccounts.length === 0 && !persisted.selectedAccounts) {
      setSelectedAccounts(accounts.map((a) => a.id));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accounts.length]);

  // Persiste preferências
  useEffect(() => {
    try {
      window.localStorage.setItem(
        POST_STORAGE_KEY,
        JSON.stringify({ selectedAccounts, caption, gap, jitter, order, mediaType }),
      );
    } catch {}
  }, [selectedAccounts, caption, gap, jitter, order, mediaType]);

  // --- Validação -------------------------------------------------------------
  const selectedList = Array.from(selectedVideos.values());
  const startInPast =
    Number.isFinite(new Date(start).getTime()) &&
    new Date(start).getTime() < Date.now() - 60_000;

  const missing: string[] = [];
  if (loopMode !== "live_folder" && !selectedList.length) missing.push("selecione vídeos");
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

    try {
      // Modo LOOP
      if (loopMode !== "once") {
        if (loopMode === "live_folder" && (!currentFolder || currentFolderId === "root")) {
          setEnqueueMsg("Loop live_folder: entre numa pasta do Drive antes de criar.");
          return;
        }
        const res = await api.createLoop({
          source_type: loopMode,
          media_type: mediaType,
          folder_id: currentFolder?.id ?? null,
          folder_name: currentFolder?.name ?? null,
          video_ids: loopMode === "snapshot" ? selectedList.map((v) => v.id) : undefined,
          account_ids: selectedAccounts,
          caption: mediaType === "STORY" ? "" : caption,
          gap_min: Math.max(1, gap),
          jitter_min: Math.max(0, jitter),
          order_mode: order,
          next_cycle_at: new Date(start).toISOString(),
        });
        if (res && "id" in res) {
          setEnqueueOk(true);
          setEnqueueMsg(
            `✓ Loop criado (${loopMode === "live_folder" ? "pasta ao vivo" : "snapshot"}) — próximo ciclo em ${fmtPreview()} · gap ${gap}min · jitter +0–${jitter}min`,
          );
        } else {
          setEnqueueMsg(`Erro ao criar loop${res && "error" in res ? `: ${res.error}` : ""}`);
        }
        return;
      }

      // Modo ONCE — cada conta recebe uma sequência independente de vídeos
      const startMs = new Date(start).getTime();
      const jitterMs = Math.max(0, jitter) * 60_000;
      const accountVideos = new Map<string, DriveVideo[]>();
      for (const accId of selectedAccounts) {
        accountVideos.set(
          accId,
          order === "random" ? shuffleSeeded(selectedList, accId) : selectedList,
        );
      }

      let ok = 0;
      let fail = 0;
      for (let cycle = 0; cycle < selectedList.length; cycle++) {
        const cycleStartMs = startMs + cycle * gap * 60_000;
        const groupId = crypto.randomUUID();
        const groupScheduledAt = new Date(cycleStartMs).toISOString();
        for (const accId of selectedAccounts) {
          const v = accountVideos.get(accId)![cycle];
          const jitterOffset = jitterMs ? Math.floor(Math.random() * (jitterMs + 1)) : 0;
          const scheduledAt = new Date(cycleStartMs + jitterOffset).toISOString();
          const uniqueCaption = mediaType === "STORY" ? "" : variateCaption(caption, `${accId}|${v.id}`);
          const res = await api.enqueue({
            account_id: accId,
            caption: uniqueCaption,
            media_type: mediaType,
            media_key: `drive:${v.id}`,
            scheduled_at: scheduledAt,
            group_id: groupId,
            group_scheduled_at: groupScheduledAt,
          });
          if (res) {
            ok++;
            void api.buildVariant(res.id);
          } else {
            fail++;
          }
        }
      }

      setEnqueueOk(fail === 0 && ok > 0);
      setEnqueueMsg(
        `✓ ${ok} agendado(s)${fail ? ` · ${fail} falha(s)` : ""} · ${selectedList.length} ciclo(s) de ${gap}min · jitter +0–${jitter}min`,
      );
      if (ok > 0 && fail === 0) {
        setTimeout(() => navigate({ to: "/queue" }), 800);
      }
    } catch (e) {
      setEnqueueMsg(`Erro: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setEnqueueing(false);
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
        order={order}
        onStartChange={setStart}
        onGapChange={setGap}
        onJitterChange={setJitter}
        onLoopModeChange={setLoopMode}
        onOrderChange={setOrder}
      />

      <ActiveLoopsPanel />

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
        Cada vídeo vira um ciclo: todas as contas selecionadas postam o mesmo vídeo com um
        atraso aleatório de 0 a {jitter}min, e o próximo ciclo começa {gap}min depois. ✓
        Variantes únicas por conta são geradas automaticamente no servidor.
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
