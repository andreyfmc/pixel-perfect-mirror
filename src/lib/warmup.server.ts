// Processador de planos de aquecimento.
// Cada plano tem N fases; cada fase define:
//   postsPerBatch  → quantos posts por lote
//   pauseHours     → pausa entre lotes (horas)
//   totalPosts     → total para completar a fase (0 = sem limite / manual)
//
// O scheduler chama runWarmupProcessor() a cada tick.

import { db } from "./db.server";
import { fetchFolderVideosLive } from "./drive.server";
import { variateCaption } from "./caption-variant";
import { requireDb } from "./cf.server";

// ── Tipos ──────────────────────────────────────────────────────────────────

export type WarmupPhase = {
  label?: string;
  postsPerBatch: number; // posts por lote (por conta)
  pauseHours: number;    // pausa em horas entre lotes
  totalPosts: number;    // total de posts para concluir a fase (0 = manual)
};

export type WarmupPlanRow = {
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
  updated_at: string;
};

// ── Helpers ────────────────────────────────────────────────────────────────

function parseJson<T>(json: string | null | undefined, fallback: T): T {
  if (!json) return fallback;
  try {
    return JSON.parse(json) as T;
  } catch {
    return fallback;
  }
}

// PRNG seeded (FNV-1a) — idêntico ao usado nos loops
function seededRng(seed: string) {
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

// ── DB helpers (warmup-specific) ───────────────────────────────────────────

async function listDuePlans(nowIso: string): Promise<WarmupPlanRow[]> {
  const d = requireDb();
  const result = await d
    .prepare(
      `SELECT * FROM warmup_plans
       WHERE status = 'active' AND batch_due_at <= ?
       ORDER BY batch_due_at ASC
       LIMIT 20`,
    )
    .bind(nowIso)
    .all<WarmupPlanRow>();
  return result.results ?? [];
}

async function updatePlanAfterBatch(
  id: string,
  opts: {
    postsDoneInPhase: number;
    postsDoneTotal: number;
    currentPhase: number;
    status: WarmupPlanRow["status"];
    batchDueAt: string;
    videoCursor: number;
    lastError?: string | null;
  },
) {
  await requireDb()
    .prepare(
      `UPDATE warmup_plans SET
        posts_done_in_phase = ?,
        posts_done_total    = ?,
        current_phase       = ?,
        status              = ?,
        batch_due_at        = ?,
        video_cursor        = ?,
        last_error          = ?,
        updated_at          = datetime('now')
       WHERE id = ?`,
    )
    .bind(
      opts.postsDoneInPhase,
      opts.postsDoneTotal,
      opts.currentPhase,
      opts.status,
      opts.batchDueAt,
      opts.videoCursor,
      opts.lastError ?? null,
      id,
    )
    .run();
}

async function recordBatch(opts: {
  planId: string;
  phaseIndex: number;
  accountIds: string[];
  mediaKeys: string[];
}) {
  await requireDb()
    .prepare(
      `INSERT INTO warmup_batches (id, plan_id, phase_index, accounts_json, media_keys_json, posts_count)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      crypto.randomUUID(),
      opts.planId,
      opts.phaseIndex,
      JSON.stringify(opts.accountIds),
      JSON.stringify(opts.mediaKeys),
      opts.mediaKeys.length,
    )
    .run();
}

// ── Plan processor ─────────────────────────────────────────────────────────

async function processPlan(plan: WarmupPlanRow, now: Date): Promise<{ enqueued: number }> {
  const phases = parseJson<WarmupPhase[]>(plan.phases_json, []);
  if (phases.length === 0) {
    await requireDb()
      .prepare(`UPDATE warmup_plans SET status='stopped', last_error='Nenhuma fase configurada', updated_at=datetime('now') WHERE id=?`)
      .bind(plan.id)
      .run();
    return { enqueued: 0 };
  }

  const accountIds = parseJson<string[]>(plan.account_ids_json, []);
  if (accountIds.length === 0) {
    await requireDb()
      .prepare(`UPDATE warmup_plans SET status='stopped', last_error='Nenhuma conta selecionada', updated_at=datetime('now') WHERE id=?`)
      .bind(plan.id)
      .run();
    return { enqueued: 0 };
  }

  const phaseIdx = Math.min(plan.current_phase, phases.length - 1);
  const phase = phases[phaseIdx];

  // ── Resolve lista de vídeos ──────────────────────────────────────────────
  let videoIds: string[] = [];

  if (plan.source_type === "live_folder") {
    if (!plan.folder_id) {
      await requireDb()
        .prepare(`UPDATE warmup_plans SET status='stopped', last_error='live_folder sem folder_id', updated_at=datetime('now') WHERE id=?`)
        .bind(plan.id)
        .run();
      return { enqueued: 0 };
    }
    const live = await fetchFolderVideosLive(plan.folder_id);
    if (!live.folder) {
      await requireDb()
        .prepare(`UPDATE warmup_plans SET status='paused', last_error=?, updated_at=datetime('now') WHERE id=?`)
        .bind(live.error ?? "Pasta do Drive não encontrada", plan.id)
        .run();
      return { enqueued: 0 };
    }
    if (live.videos.length === 0) {
      await requireDb()
        .prepare(`UPDATE warmup_plans SET status='paused', last_error='Pasta vazia — sem vídeos para postar', updated_at=datetime('now') WHERE id=?`)
        .bind(plan.id)
        .run();
      return { enqueued: 0 };
    }
    videoIds = live.videos.map((v) => v.id);
  } else {
    videoIds = parseJson<string[]>(plan.video_ids_json, []);
    if (videoIds.length === 0) {
      await requireDb()
        .prepare(`UPDATE warmup_plans SET status='stopped', last_error='snapshot sem vídeos', updated_at=datetime('now') WHERE id=?`)
        .bind(plan.id)
        .run();
      return { enqueued: 0 };
    }
  }

  // ── Monta o lote ─────────────────────────────────────────────────────────
  // postsPerBatch = posts por conta por lote
  const perBatch = Math.max(1, phase.postsPerBatch);
  const nowMs = now.getTime();

  // Para cada conta: seleciona `perBatch` vídeos a partir do cursor (sequential)
  // ou aleatório com seed por conta.
  const enqueueResults: string[] = [];
  let cursor = plan.video_cursor;

  for (const accId of accountIds) {
    let list: string[];
    if (plan.order_mode === "sequential") {
      list = videoIds;
    } else {
      list = shuffleSeeded(videoIds, `${accId}:${plan.id}:${plan.posts_done_total}`);
    }

    for (let i = 0; i < perBatch; i++) {
      const videoId = list[(cursor + i) % list.length];
      // Distribui posts dentro do lote: +5min entre posts da mesma conta
      const offsetMs = i * 5 * 60_000;
      // Jitter leve entre contas (0..3min) para evitar burst exato
      const jitterMs = Math.floor(Math.random() * 3 * 60_000);
      const scheduledAt = new Date(nowMs + offsetMs + jitterMs).toISOString();
      const uniqueCaption = variateCaption(plan.caption, `${accId}|${videoId}|${plan.posts_done_total}`);

      try {
        await db.enqueue({
          id: crypto.randomUUID(),
          account_id: accId,
          caption: uniqueCaption,
          media_type: "REEL",
          media_key: `drive:${videoId}`,
          thumb_key: null,
          scheduled_at: scheduledAt,
        });
        enqueueResults.push(videoId);
      } catch (err) {
        console.error(
          `[warmup] ERRO ao enfileirar plan=${plan.id} acc=${accId} video=${videoId}:`,
          err,
        );
      }
    }
  }

  if (plan.order_mode === "sequential") {
    cursor = (cursor + perBatch) % videoIds.length;
  }

  const enqueued = enqueueResults.length;

  // Registra lote
  if (enqueued > 0) {
    await recordBatch({
      planId: plan.id,
      phaseIndex: phaseIdx,
      accountIds,
      mediaKeys: enqueueResults.map((id) => `drive:${id}`),
    });
  }

  // ── Calcula próximo estado ────────────────────────────────────────────────
  const newDoneInPhase = plan.posts_done_in_phase + enqueued;
  const newDoneTotal = plan.posts_done_total + enqueued;
  const pauseMs = phase.pauseHours * 60 * 60_000;
  const nextBatchAt = new Date(nowMs + pauseMs).toISOString();

  // Verifica se a fase foi concluída
  const phaseComplete =
    phase.totalPosts > 0 && newDoneInPhase >= phase.totalPosts;

  let newPhase = phaseIdx;
  let newStatus: WarmupPlanRow["status"] = "active";
  let newDoneInPhaseValue = newDoneInPhase;

  if (phaseComplete) {
    const hasNextPhase = phaseIdx + 1 < phases.length;
    if (hasNextPhase && plan.auto_advance) {
      // Avança automaticamente
      newPhase = phaseIdx + 1;
      newDoneInPhaseValue = 0;
      newStatus = "active";
      console.log(`[warmup] plan=${plan.id} avançou para fase ${newPhase} automaticamente`);
    } else if (hasNextPhase) {
      // Aguarda avanço manual
      newStatus = "waiting_phase";
      console.log(`[warmup] plan=${plan.id} fase ${phaseIdx} concluída — aguardando avanço manual`);
    } else {
      // Última fase concluída
      newStatus = "finished";
      console.log(`[warmup] plan=${plan.id} concluído — todas as fases completas`);
    }
  }

  await updatePlanAfterBatch(plan.id, {
    postsDoneInPhase: newDoneInPhaseValue,
    postsDoneTotal: newDoneTotal,
    currentPhase: newPhase,
    status: newStatus,
    batchDueAt: nextBatchAt,
    videoCursor: cursor,
  });

  console.log(
    `[warmup] plan=${plan.id} fase=${phaseIdx} lote=${enqueued} posts total=${newDoneTotal} próximo=${nextBatchAt}`,
  );

  return { enqueued };
}

// ── Runner chamado pelo scheduler ──────────────────────────────────────────

export async function runWarmupProcessor(
  now: Date = new Date(),
): Promise<{ plans: number; enqueued: number }> {
  let plans: WarmupPlanRow[];
  try {
    plans = await listDuePlans(now.toISOString());
  } catch {
    // D1 pode não ter a tabela ainda (antes da migration rodar)
    return { plans: 0, enqueued: 0 };
  }

  if (plans.length === 0) return { plans: 0, enqueued: 0 };

  let totalEnqueued = 0;
  for (const plan of plans) {
    try {
      const r = await processPlan(plan, now);
      totalEnqueued += r.enqueued;
    } catch (err) {
      console.error(`[warmup] processPlan erro plan=${plan.id}:`, err);
    }
  }

  return { plans: plans.length, enqueued: totalEnqueued };
}
