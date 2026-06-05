import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import {
  Flame,
  Plus,
  Trash2,
  Play,
  Pause,
  ChevronRight,
  ChevronDown,
  Clock,
  Layers,
  Users,
  CheckCircle2,
  AlertCircle,
  Loader2,
  SkipForward,
  GripVertical,
  X,
  Folder,
  Shuffle,
  ListOrdered,
} from "lucide-react";
import { AccountSelector } from "@/components/warmup/AccountSelector";
import { DriveBrowser } from "@/components/warmup/DriveBrowser";
import type { DriveVideo, DriveCrumb } from "@/lib/drive.functions";

// ─── Types ──────────────────────────────────────────────────────────────────

type WarmupPhase = {
  label: string;
  postsPerBatch: number;
  pauseHours: number;
  totalPosts: number;
};

type WarmupPlan = {
  id: string;
  name: string;
  phases_json: string;
  current_phase: number;
  posts_done_in_phase: number;
  posts_done_total: number;
  account_ids_json: string;
  source_type: "snapshot" | "live_folder";
  folder_id: string | null;
  folder_name: string | null;
  video_ids_json: string | null;
  caption: string;
  order_mode: "sequential" | "random";
  auto_advance: number;
  status: "active" | "paused" | "waiting_phase" | "finished" | "stopped";
  batch_due_at: string;
  video_cursor: number;
  last_error: string | null;
  created_at: string;
};

// ─── Route ──────────────────────────────────────────────────────────────────

export const Route = createFileRoute("/_app/warmup-heat")({
  component: WarmupHeatPage,
  head: () => ({ meta: [{ title: "Aquecimento · Insta Manager" }] }),
});

// ─── API helpers ────────────────────────────────────────────────────────────

async function listPlans(): Promise<WarmupPlan[]> {
  const res = await fetch("/api/warmup-plans");
  const data = await res.json<{ plans: WarmupPlan[] }>();
  return data.plans ?? [];
}

async function createPlan(body: object): Promise<{ id: string }> {
  const res = await fetch("/api/warmup-plans", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json<{ error?: string }>();
    throw new Error(err.error ?? `Erro ${res.status}`);
  }
  return res.json();
}

async function patchPlan(id: string, body: object) {
  const res = await fetch(`/api/warmup-plans/${id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Erro ${res.status}`);
  return res.json();
}

async function deletePlan(id: string) {
  await fetch(`/api/warmup-plans/${id}`, { method: "DELETE" });
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function parsePhases(json: string): WarmupPhase[] {
  try {
    return JSON.parse(json) as WarmupPhase[];
  } catch {
    return [];
  }
}

function parseIds(json: string): string[] {
  try {
    return JSON.parse(json) as string[];
  } catch {
    return [];
  }
}

function fmtDuration(hours: number) {
  if (hours < 1) return `${Math.round(hours * 60)}min`;
  if (hours === Math.floor(hours)) return `${hours}h`;
  return `${hours}h`;
}

function fmtNextBatch(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = d.getTime() - now.getTime();
  if (diffMs <= 0) return "agora";
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 60) return `em ${diffMin}min`;
  const diffH = Math.floor(diffMin / 60);
  const remMin = diffMin % 60;
  return remMin > 0 ? `em ${diffH}h ${remMin}min` : `em ${diffH}h`;
}

// ─── Status badge ────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: WarmupPlan["status"] }) {
  const map: Record<
    WarmupPlan["status"],
    { label: string; color: string; bg: string }
  > = {
    active: { label: "Ativo", color: "var(--success)", bg: "rgba(34,197,94,0.12)" },
    paused: { label: "Pausado", color: "var(--warning)", bg: "rgba(234,179,8,0.12)" },
    waiting_phase: { label: "Aguarda fase", color: "var(--accent2)", bg: "rgba(139,92,246,0.12)" },
    finished: { label: "Concluído", color: "var(--text2)", bg: "rgba(120,120,140,0.12)" },
    stopped: { label: "Parado", color: "var(--danger)", bg: "rgba(239,68,68,0.12)" },
  };
  const s = map[status] ?? map.stopped;
  return (
    <span
      className="rounded-full px-2 py-0.5 text-[11px] font-semibold"
      style={{ color: s.color, background: s.bg }}
    >
      {s.label}
    </span>
  );
}

// ─── Phase editor row ────────────────────────────────────────────────────────

function PhaseRow({
  phase,
  index,
  total,
  onChange,
  onRemove,
}: {
  phase: WarmupPhase;
  index: number;
  total: number;
  onChange: (p: WarmupPhase) => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-border bg-bg3 px-3 py-3">
      <GripVertical className="h-4 w-4 shrink-0 text-muted2" />
      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold"
        style={{ background: "rgba(139,92,246,0.18)", color: "var(--accent2)" }}>
        {index + 1}
      </div>

      <div className="flex flex-1 flex-wrap gap-2">
        {/* Label */}
        <input
          type="text"
          placeholder={`Fase ${index + 1}`}
          value={phase.label}
          onChange={(e) => onChange({ ...phase, label: e.target.value })}
          className="h-8 w-28 rounded-lg border border-border bg-bg2 px-2 text-xs text-foreground placeholder:text-muted2 focus:border-accent2 focus:outline-none"
        />
        {/* Posts por lote */}
        <label className="flex items-center gap-1 text-xs text-text2">
          <Layers className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Posts/lote</span>
          <input
            type="number"
            min={1}
            max={100}
            value={phase.postsPerBatch}
            onChange={(e) =>
              onChange({ ...phase, postsPerBatch: Math.max(1, +e.target.value) })
            }
            className="h-8 w-14 rounded-lg border border-border bg-bg2 px-2 text-center text-xs text-foreground focus:border-accent2 focus:outline-none"
          />
        </label>
        {/* Pausa */}
        <label className="flex items-center gap-1 text-xs text-text2">
          <Clock className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Pausa</span>
          <input
            type="number"
            min={0.5}
            max={72}
            step={0.5}
            value={phase.pauseHours}
            onChange={(e) =>
              onChange({ ...phase, pauseHours: Math.max(0.5, +e.target.value) })
            }
            className="h-8 w-14 rounded-lg border border-border bg-bg2 px-2 text-center text-xs text-foreground focus:border-accent2 focus:outline-none"
          />
          <span className="text-muted2">h</span>
        </label>
        {/* Total */}
        <label className="flex items-center gap-1 text-xs text-text2">
          <CheckCircle2 className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Total</span>
          <input
            type="number"
            min={0}
            max={10000}
            value={phase.totalPosts}
            onChange={(e) =>
              onChange({ ...phase, totalPosts: Math.max(0, +e.target.value) })
            }
            className="h-8 w-16 rounded-lg border border-border bg-bg2 px-2 text-center text-xs text-foreground focus:border-accent2 focus:outline-none"
          />
          <span className="text-muted2 text-[10px]">{phase.totalPosts === 0 ? "(manual)" : "posts"}</span>
        </label>
      </div>

      {total > 1 && (
        <button
          type="button"
          onClick={onRemove}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted2 hover:bg-danger/10 hover:text-danger"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

// ─── Plan card ───────────────────────────────────────────────────────────────

function PlanCard({
  plan,
  accounts,
  onRefresh,
}: {
  plan: WarmupPlan;
  accounts: any[];
  onRefresh: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const qc = useQueryClient();

  const phases = parsePhases(plan.phases_json);
  const accountIds = parseIds(plan.account_ids_json);
  const curPhase = phases[plan.current_phase] as WarmupPhase | undefined;

  const patchMut = useMutation({
    mutationFn: (body: object) => patchPlan(plan.id, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["warmup-plans"] });
      onRefresh();
    },
  });

  const deleteMut = useMutation({
    mutationFn: () => deletePlan(plan.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["warmup-plans"] });
      onRefresh();
    },
  });

  const isActive = plan.status === "active";
  const canAdvance = plan.status === "waiting_phase";
  const isDone = plan.status === "finished" || plan.status === "stopped";

  // Progress within current phase
  const phaseProgress =
    curPhase && curPhase.totalPosts > 0
      ? Math.min(100, (plan.posts_done_in_phase / curPhase.totalPosts) * 100)
      : null;

  return (
    <div className="rounded-2xl border border-border bg-bg2">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex items-center gap-2 min-w-0 flex-1 text-left"
        >
          {expanded ? (
            <ChevronDown className="h-4 w-4 shrink-0 text-muted2" />
          ) : (
            <ChevronRight className="h-4 w-4 shrink-0 text-muted2" />
          )}
          <span className="truncate text-sm font-semibold">{plan.name}</span>
        </button>

        <StatusBadge status={plan.status} />

        <div className="flex items-center gap-1">
          {/* Play/Pause */}
          {!isDone && (
            <button
              type="button"
              disabled={patchMut.isPending}
              onClick={() =>
                patchMut.mutate({ status: isActive ? "paused" : "active" })
              }
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-text2 hover:bg-bg3 hover:text-foreground disabled:opacity-50"
              title={isActive ? "Pausar" : "Retomar"}
            >
              {patchMut.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : isActive ? (
                <Pause className="h-3.5 w-3.5" />
              ) : (
                <Play className="h-3.5 w-3.5" />
              )}
            </button>
          )}
          {/* Advance phase */}
          {canAdvance && (
            <button
              type="button"
              disabled={patchMut.isPending}
              onClick={() => patchMut.mutate({ advance_phase: true })}
              className="flex h-8 items-center gap-1.5 rounded-lg border px-2 text-xs font-medium hover:bg-bg3 disabled:opacity-50"
              style={{
                borderColor: "var(--accent2)",
                color: "var(--accent2)",
              }}
              title="Avançar para próxima fase"
            >
              <SkipForward className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Próxima fase</span>
            </button>
          )}
          {/* Delete */}
          <button
            type="button"
            disabled={deleteMut.isPending}
            onClick={() => {
              if (confirm(`Excluir plano "${plan.name}"?`)) deleteMut.mutate();
            }}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-text2 hover:bg-danger/10 hover:text-danger disabled:opacity-50"
          >
            {deleteMut.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Trash2 className="h-3.5 w-3.5" />
            )}
          </button>
        </div>
      </div>

      {/* Summary row */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border px-4 py-2">
        <span className="text-xs text-text2">
          <span className="font-medium text-foreground">{plan.posts_done_total}</span> posts totais
        </span>
        <span className="text-xs text-text2">
          Fase <span className="font-medium text-foreground">{plan.current_phase + 1}</span>/{phases.length}
        </span>
        <span className="text-xs text-text2">
          <Users className="inline h-3 w-3 mr-0.5" />
          {accountIds.length} contas
        </span>
        {plan.status === "active" && (
          <span className="text-xs text-text2">
            <Clock className="inline h-3 w-3 mr-0.5" />
            próximo lote {fmtNextBatch(plan.batch_due_at)}
          </span>
        )}
        {curPhase && (
          <span className="text-xs text-text2">
            <Layers className="inline h-3 w-3 mr-0.5" />
            {curPhase.postsPerBatch} posts · pausa {fmtDuration(curPhase.pauseHours)}
          </span>
        )}
      </div>

      {/* Phase progress bar */}
      {phaseProgress !== null && (
        <div className="px-4 pb-2">
          <div className="flex items-center gap-2">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-bg3">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${phaseProgress}%`,
                  background: "var(--accent2)",
                }}
              />
            </div>
            <span className="text-[11px] tabular-nums text-muted2">
              {plan.posts_done_in_phase}/{curPhase!.totalPosts}
            </span>
          </div>
        </div>
      )}

      {/* Error */}
      {plan.last_error && (
        <div className="mx-4 mb-2 flex items-start gap-1.5 rounded-lg bg-danger/10 px-3 py-2 text-xs text-danger">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {plan.last_error}
        </div>
      )}

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t border-border px-4 py-3 space-y-3">
          {/* Phases timeline */}
          <div>
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted2">
              Fases
            </div>
            <div className="space-y-1.5">
              {phases.map((p, i) => {
                const isCurrent = i === plan.current_phase;
                const isDonePh = i < plan.current_phase;
                return (
                  <div
                    key={i}
                    className="flex items-center gap-2 rounded-lg px-3 py-2"
                    style={{
                      background: isCurrent
                        ? "rgba(139,92,246,0.08)"
                        : isDonePh
                        ? "rgba(34,197,94,0.06)"
                        : "var(--bg3)",
                      border: isCurrent
                        ? "1px solid rgba(139,92,246,0.3)"
                        : "1px solid transparent",
                    }}
                  >
                    <span
                      className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold"
                      style={{
                        background: isDonePh
                          ? "rgba(34,197,94,0.2)"
                          : isCurrent
                          ? "rgba(139,92,246,0.2)"
                          : "var(--bg2)",
                        color: isDonePh
                          ? "var(--success)"
                          : isCurrent
                          ? "var(--accent2)"
                          : "var(--text2)",
                      }}
                    >
                      {isDonePh ? "✓" : i + 1}
                    </span>
                    <span className="flex-1 text-xs font-medium">
                      {p.label || `Fase ${i + 1}`}
                    </span>
                    <span className="text-[11px] text-text2">
                      {p.postsPerBatch} posts · pausa {fmtDuration(p.pauseHours)}
                      {p.totalPosts > 0
                        ? ` · total ${p.totalPosts}`
                        : " · manual"}
                    </span>
                    {isCurrent && (
                      <span
                        className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold"
                        style={{
                          background: "rgba(139,92,246,0.18)",
                          color: "var(--accent2)",
                        }}
                      >
                        atual
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Accounts */}
          <div>
            <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted2">
              Contas ({accountIds.length})
            </div>
            <div className="flex flex-wrap gap-1.5">
              {accountIds.slice(0, 20).map((id) => {
                const acc = accounts.find((a) => a.id === id);
                return (
                  <span
                    key={id}
                    className="rounded-full border border-border bg-bg3 px-2 py-0.5 text-[11px] text-text2"
                  >
                    @{acc?.username ?? id.slice(0, 8)}
                  </span>
                );
              })}
              {accountIds.length > 20 && (
                <span className="rounded-full border border-border bg-bg3 px-2 py-0.5 text-[11px] text-muted2">
                  +{accountIds.length - 20}
                </span>
              )}
            </div>
          </div>

          {/* Source */}
          <div className="text-xs text-text2">
            <Folder className="mr-1 inline h-3.5 w-3.5" />
            {plan.source_type === "live_folder"
              ? `Pasta: ${plan.folder_name ?? plan.folder_id ?? "—"}`
              : `Snapshot: ${parseIds(plan.video_ids_json ?? "[]").length} vídeos`}
            <span className="ml-3">
              {plan.order_mode === "random" ? (
                <><Shuffle className="mr-0.5 inline h-3 w-3" />Aleatório</>
              ) : (
                <><ListOrdered className="mr-0.5 inline h-3 w-3" />Sequencial</>
              )}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Create plan drawer ───────────────────────────────────────────────────────

const DEFAULT_PHASE: WarmupPhase = {
  label: "",
  postsPerBatch: 10,
  pauseHours: 8,
  totalPosts: 30,
};

function CreatePlanDrawer({
  onClose,
  onCreated,
  accounts,
  models,
}: {
  onClose: () => void;
  onCreated: () => void;
  accounts: any[];
  models: any[];
}) {
  const [name, setName] = useState("Aquecimento");
  const [phases, setPhases] = useState<WarmupPhase[]>([
    { label: "Aquecimento leve", postsPerBatch: 5, pauseHours: 8, totalPosts: 15 },
    { label: "Aquecimento médio", postsPerBatch: 10, pauseHours: 6, totalPosts: 40 },
    { label: "Ritmo normal", postsPerBatch: 20, pauseHours: 4, totalPosts: 0 },
  ]);
  const [selectedAccounts, setSelectedAccounts] = useState<string[]>([]);
  const [autoAdvance, setAutoAdvance] = useState(true);
  const [orderMode, setOrderMode] = useState<"sequential" | "random">("random");
  const [caption, setCaption] = useState("");

  // Drive
  const [folderId, setFolderId] = useState<string | null>(null);
  const [folderName, setFolderName] = useState<string | null>(null);
  const [crumbs, setCrumbs] = useState<DriveCrumb[]>([]);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function updatePhase(i: number, p: WarmupPhase) {
    setPhases((prev) => prev.map((x, j) => (j === i ? p : x)));
  }

  function removePhase(i: number) {
    setPhases((prev) => prev.filter((_, j) => j !== i));
  }

  function addPhase() {
    setPhases((prev) => [...prev, { ...DEFAULT_PHASE, label: `Fase ${prev.length + 1}` }]);
  }

  async function handleSave() {
    setError(null);
    if (!name.trim()) return setError("Defina um nome para o plano");
    if (phases.length === 0) return setError("Adicione ao menos uma fase");
    if (selectedAccounts.length === 0) return setError("Selecione ao menos uma conta");
    if (!folderId) return setError("Selecione uma pasta do Google Drive");

    setSaving(true);
    try {
      await createPlan({
        name: name.trim(),
        phases,
        account_ids: selectedAccounts,
        source_type: "live_folder",
        folder_id: folderId,
        folder_name: folderName,
        caption,
        order_mode: orderMode,
        auto_advance: autoAdvance,
      });
      onCreated();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao criar plano");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="relative flex w-full max-w-2xl max-h-[90dvh] flex-col rounded-t-2xl sm:rounded-2xl border border-border bg-bg1 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div className="flex items-center gap-2">
            <Flame className="h-5 w-5" style={{ color: "var(--accent2)" }} />
            <span className="text-base font-semibold">Novo plano de aquecimento</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted2 hover:bg-bg3 hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {/* Nome */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-text2">
              Nome do plano
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="ex: Aquecimento 3 dias"
              className="h-9 w-full rounded-xl border border-border bg-bg3 px-3 text-sm text-foreground placeholder:text-muted2 focus:border-accent2 focus:outline-none"
            />
          </div>

          {/* Fases */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted2">
                Fases de postagem
              </label>
              <button
                type="button"
                onClick={addPhase}
                className="flex items-center gap-1 rounded-lg border border-border bg-bg3 px-2 py-1 text-xs text-text2 hover:border-border2 hover:text-foreground"
              >
                <Plus className="h-3 w-3" />
                Adicionar fase
              </button>
            </div>
            <div className="space-y-2">
              {phases.map((p, i) => (
                <PhaseRow
                  key={i}
                  phase={p}
                  index={i}
                  total={phases.length}
                  onChange={(np) => updatePhase(i, np)}
                  onRemove={() => removePhase(i)}
                />
              ))}
            </div>
            <p className="mt-2 text-[11px] text-muted2">
              Total = 0 significa que a fase só avança quando você apertar "Próxima fase" manualmente.
            </p>
          </div>

          {/* Auto advance */}
          <div className="flex items-center justify-between rounded-xl border border-border bg-bg3 px-4 py-3">
            <div>
              <div className="text-sm font-medium">Avanço automático de fase</div>
              <div className="text-xs text-text2">
                Quando o total é atingido, avança para a próxima fase sem intervenção
              </div>
            </div>
            <button
              type="button"
              onClick={() => setAutoAdvance((v) => !v)}
              className="relative h-6 w-11 shrink-0 rounded-full border-2 transition-colors"
              style={{
                background: autoAdvance ? "var(--accent2)" : "var(--bg2)",
                borderColor: autoAdvance ? "var(--accent2)" : "var(--border)",
              }}
            >
              <span
                className="absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform"
                style={{ transform: autoAdvance ? "translateX(20px)" : "translateX(0)" }}
              />
            </button>
          </div>

          {/* Order mode */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-text2">
              Ordem dos vídeos
            </label>
            <div className="flex gap-2">
              {(["random", "sequential"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setOrderMode(m)}
                  className="flex flex-1 items-center justify-center gap-2 rounded-xl border py-2 text-sm transition-colors"
                  style={{
                    borderColor: orderMode === m ? "var(--accent2)" : "var(--border)",
                    background: orderMode === m ? "rgba(139,92,246,0.1)" : "var(--bg3)",
                    color: orderMode === m ? "var(--accent2)" : "var(--text2)",
                  }}
                >
                  {m === "random" ? (
                    <><Shuffle className="h-3.5 w-3.5" /> Aleatório</>
                  ) : (
                    <><ListOrdered className="h-3.5 w-3.5" /> Sequencial</>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Drive folder */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-text2">
              Pasta do Google Drive
            </label>
            {folderId ? (
              <div className="flex items-center gap-2 rounded-xl border border-border bg-bg3 px-3 py-2">
                <Folder className="h-4 w-4 shrink-0" style={{ color: "var(--accent2)" }} />
                <span className="flex-1 truncate text-sm">{folderName ?? folderId}</span>
                <button
                  type="button"
                  onClick={() => { setFolderId(null); setFolderName(null); setCrumbs([]); }}
                  className="text-muted2 hover:text-danger"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : (
              <DriveBrowser
                selectedVideos={new Map()}
                onSelectionChange={(_videos, folder) => {
                  if (folder) {
                    setFolderId(folder.id);
                    setFolderName(folder.name);
                  }
                }}
                onFolderChange={(id, breadcrumbs) => {
                  setCrumbs(breadcrumbs);
                  // Only save folder when user explicitly navigates and picks
                  // (they click "Usar esta pasta" button below)
                }}
              />
            )}
            {!folderId && crumbs.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  const last = crumbs[crumbs.length - 1];
                  if (last) { setFolderId(last.id); setFolderName(last.name); }
                }}
                className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl border py-2 text-sm font-medium"
                style={{ borderColor: "var(--accent2)", color: "var(--accent2)" }}
              >
                <Folder className="h-4 w-4" />
                Usar pasta atual
              </button>
            )}
          </div>

          {/* Caption */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-text2">
              Legenda (opcional)
            </label>
            <textarea
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              rows={2}
              placeholder="Legenda padrão para os posts..."
              className="w-full rounded-xl border border-border bg-bg3 px-3 py-2 text-sm text-foreground placeholder:text-muted2 focus:border-accent2 focus:outline-none resize-none"
            />
          </div>

          {/* Accounts */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-text2">
              Contas para aquecimento
            </label>
            <AccountSelector
              accounts={accounts}
              selectedIds={selectedAccounts}
              onChange={setSelectedAccounts}
              models={models}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-border px-5 py-4">
          {error && (
            <div className="mb-3 flex items-center gap-2 rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-xl border border-border bg-bg3 py-2 text-sm text-text2 hover:bg-bg2"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl py-2 text-sm font-semibold text-white disabled:opacity-60"
              style={{ background: "var(--accent2)" }}
            >
              {saving ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Salvando...</>
              ) : (
                <><Flame className="h-4 w-4" /> Criar plano</>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main page ───────────────────────────────────────────────────────────────

function WarmupHeatPage() {
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);

  const { data: plans = [], isLoading: loadingPlans } = useQuery({
    queryKey: ["warmup-plans"],
    queryFn: listPlans,
    refetchInterval: 30_000,
  });

  const { data: accountsRaw = [] } = useQuery({
    queryKey: ["accounts"],
    queryFn: () => api.listAccounts(),
  });

  const { data: models = [] } = useQuery({
    queryKey: ["models"],
    queryFn: () => api.listModels(),
  });

  const accounts = useMemo(
    () => accountsRaw.filter((a: any) => a.role !== "discarded"),
    [accountsRaw],
  );

  const active = plans.filter((p) => p.status === "active").length;
  const paused = plans.filter((p) => p.status === "paused" || p.status === "waiting_phase").length;
  const done = plans.filter((p) => p.status === "finished" || p.status === "stopped").length;

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 pb-24 md:pb-6">
      {/* Page header */}
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div
            className="flex h-10 w-10 items-center justify-center rounded-xl"
            style={{ background: "rgba(139,92,246,0.15)" }}
          >
            <Flame className="h-5 w-5" style={{ color: "var(--accent2)" }} />
          </div>
          <div>
            <h1 className="text-lg font-bold">Aquecimento</h1>
            <p className="text-xs text-text2">
              Postagem gradual em fases para novos perfis
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-white"
          style={{ background: "var(--accent2)" }}
        >
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">Novo plano</span>
        </button>
      </div>

      {/* Stats row */}
      {plans.length > 0 && (
        <div className="mb-5 grid grid-cols-3 gap-3">
          {[
            { label: "Ativos", value: active, color: "var(--success)" },
            { label: "Pausados", value: paused, color: "var(--warning)" },
            { label: "Concluídos", value: done, color: "var(--text2)" },
          ].map((s) => (
            <div
              key={s.label}
              className="rounded-xl border border-border bg-bg2 px-4 py-3 text-center"
            >
              <div className="text-2xl font-bold tabular-nums" style={{ color: s.color }}>
                {s.value}
              </div>
              <div className="text-xs text-text2">{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Plans list */}
      {loadingPlans ? (
        <div className="flex items-center justify-center py-16 text-muted2">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : plans.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border py-16 text-center">
          <Flame className="mb-3 h-10 w-10 text-muted2" />
          <p className="text-sm font-medium">Nenhum plano criado</p>
          <p className="mt-1 text-xs text-muted2">
            Crie um plano para aquecer contas novas com postagem gradual
          </p>
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="mt-4 flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-white"
            style={{ background: "var(--accent2)" }}
          >
            <Plus className="h-4 w-4" />
            Criar primeiro plano
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {plans.map((plan) => (
            <PlanCard
              key={plan.id}
              plan={plan}
              accounts={accounts}
              onRefresh={() => qc.invalidateQueries({ queryKey: ["warmup-plans"] })}
            />
          ))}
        </div>
      )}

      {/* Create drawer */}
      {showCreate && (
        <CreatePlanDrawer
          onClose={() => setShowCreate(false)}
          onCreated={() => qc.invalidateQueries({ queryKey: ["warmup-plans"] })}
          accounts={accounts}
          models={models}
        />
      )}
    </div>
  );
}
