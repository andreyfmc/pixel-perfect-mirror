// Materializador de loops contínuos.
// A cada tick, transforma loops cujo `next_cycle_at` venceu em itens da fila
// (1 ciclo = 1 vídeo por conta selecionada) e avança o cursor do loop.
//
// Modos:
//   snapshot    → usa a lista fixa em video_ids_json
//   live_folder → relê a pasta no Drive a cada ciclo (auto-pause se vazia,
//                 auto-stop se a pasta sumir)

import { db, type LoopRow } from "./db.server";
import { fetchFolderVideosLive } from "./drive.server";
import { variateCaption } from "./caption-variant";

// PRNG seeded — copiado da UI (FNV-1a + xorshift).
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

function parseIds(json: string | null | undefined): string[] {
  if (!json) return [];
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export async function materializeLoop(
  loop: LoopRow,
  now: Date = new Date(),
): Promise<{ enqueued: number; status: "advanced" | "paused" | "stopped"; reason?: string }> {
  const accountIds = parseIds(loop.account_ids_json);
  if (accountIds.length === 0) {
    await db.setLoopStatus(loop.id, "stopped", "Nenhuma conta selecionada");
    return { enqueued: 0, status: "stopped", reason: "no_accounts" };
  }

  // Resolve a lista de vídeos do ciclo.
  let videoIds: string[] = [];
  if (loop.source_type === "live_folder") {
    if (!loop.folder_id) {
      await db.setLoopStatus(loop.id, "stopped", "Loop live_folder sem folder_id");
      return { enqueued: 0, status: "stopped", reason: "no_folder" };
    }
    const live = await fetchFolderVideosLive(loop.folder_id);
    if (!live.folder) {
      await db.setLoopStatus(
        loop.id,
        "stopped",
        live.error ?? "Pasta do Drive não encontrada — loop encerrado",
      );
      return { enqueued: 0, status: "stopped", reason: "folder_gone" };
    }
    videoIds = live.videos.map((v) => v.id);
    if (videoIds.length === 0) {
      await db.setLoopStatus(
        loop.id,
        "paused",
        `⚠ Loop pausado — pasta "${live.folder.name}" está vazia`,
      );
      return { enqueued: 0, status: "paused", reason: "empty_folder" };
    }
  } else {
    videoIds = parseIds(loop.video_ids_json);
    if (videoIds.length === 0) {
      await db.setLoopStatus(loop.id, "stopped", "Snapshot vazio");
      return { enqueued: 0, status: "stopped", reason: "empty_snapshot" };
    }
  }

  const cycleStart = new Date(loop.next_cycle_at).getTime();
  const baseStart = Number.isFinite(cycleStart) ? cycleStart : now.getTime();
  const cycle = loop.cycle_number; // ciclo atual a materializar
  const perCycle = Math.max(1, loop.videos_per_cycle ?? 1);
  const cycleMs = Math.max(1, loop.gap_min) * 60_000;
  const jitterMs = Math.max(0, loop.jitter_min ?? 0) * 60_000;

  // CAS: reivindica este ciclo antes de enfileirar. Se dois ticks do Cron
  // Trigger se sobrepõem, apenas um avança o cursor — o outro vê 0 changes
  // e desiste, evitando dupla-postagem.
  const nextAt = new Date(baseStart + cycleMs).toISOString();
  const claimed = await db.claimLoopCycle(loop.id, cycle, nextAt);
  if (!claimed) {
    return { enqueued: 0, status: "advanced", reason: "already_claimed" };
  }

  const groupId = crypto.randomUUID();
  const groupScheduledAt = new Date(baseStart).toISOString();

  // Offsets aleatórios para os N posts de uma conta dentro do ciclo, com
  // mínimo de 15min entre posts consecutivos (comportamento natural).
  // Ex: ciclo=60min, posts=3 → [0, ~23min, ~52min]
  const MIN_GAP_MS = 15 * 60_000;

  function randomOffsetsForAccount(n: number): number[] {
    if (n <= 1) return [0];
    const slack = cycleMs - (n - 1) * MIN_GAP_MS;
    if (slack <= 0) {
      return Array.from({ length: n }, (_, i) => Math.floor((cycleMs / n) * i));
    }
    const points: number[] = Array.from({ length: n - 1 }, () =>
      Math.floor(Math.random() * (slack + 1)),
    ).sort((a, b) => a - b);
    return [0, ...points.map((p, i) => p + (i + 1) * MIN_GAP_MS)];
  }

  let enqueued = 0;
  for (const accId of accountIds) {
    const list = loop.order_mode === "random" ? shuffleSeeded(videoIds, accId) : videoIds;
    const offsets = randomOffsetsForAccount(perCycle);
    for (let i = 0; i < perCycle; i++) {
      const videoId = list[(cycle * perCycle + i) % list.length];
      // Jitter configurável: adiciona +0..jitterMs ao horário, respeitando
      // o teto do ciclo (não invade o próximo ciclo).
      const maxJitter = Math.max(0, Math.min(jitterMs, cycleMs - offsets[i] - 1));
      const jitterOffset = maxJitter > 0 ? Math.floor(Math.random() * (maxJitter + 1)) : 0;
      const scheduledMs = baseStart + offsets[i] + jitterOffset;
      const scheduledAt = new Date(scheduledMs).toISOString();
      const uniqueCaption = variateCaption(loop.caption, `${accId}|${videoId}`);
      try {
        await db.enqueue({
          id: crypto.randomUUID(),
          account_id: accId,
          caption: uniqueCaption,
          media_type: loop.media_type ?? "REEL",
          media_key: `drive:${videoId}`,
          thumb_key: null,
          scheduled_at: scheduledAt,
          group_id: groupId,
          group_scheduled_at: groupScheduledAt,
          loop_id: loop.id,
          cycle_number: cycle,
        });
        enqueued++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(
          `[loops] ERRO ao enfileirar loop=${loop.id} acc=${accId} video=${videoId}: ${msg}`,
        );
        await db.setLoopStatus(loop.id, "active", `Erro no ciclo ${cycle}, acc=${accId}: ${msg}`).catch(() => {});
      }
    }
  }

  // Se nenhum post foi enfileirado mesmo com vídeos e contas válidos, pausa
  // o loop para evitar loop eterno silencioso — o usuário vê o erro na UI
  // e pode retomar manualmente após investigar.
  if (enqueued === 0) {
    const reason = `Ciclo ${cycle}: nenhum post enfileirado (${accountIds.length} conta(s), ${perCycle} post(s)/conta). Loop pausado — verifique os logs.`;
    console.error(`[loops] loop=${loop.id} ${reason}`);
    await db.setLoopStatus(loop.id, "paused", reason);
    return { enqueued: 0, status: "paused", reason: "zero_enqueued" };
  }

  return { enqueued, status: "advanced" };
}

export async function runLoopMaterializer(
  now: Date = new Date(),
): Promise<{ loops: number; enqueued: number; paused: number; stopped: number }> {
  const due = await db.listDueActiveLoops(now.toISOString(), 2);
  let enqueued = 0;
  let paused = 0;
  let stopped = 0;
  for (const loop of due) {
    try {
      const r = await materializeLoop(loop, now);
      enqueued += r.enqueued;
      if (r.status === "paused") paused++;
      if (r.status === "stopped") stopped++;
    } catch (err) {
      console.error(
        `[loops] materialize falhou loop=${loop.id}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
  return { loops: due.length, enqueued, paused, stopped };
}
