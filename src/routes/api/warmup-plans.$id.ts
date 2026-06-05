import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { requireDb } from "@/lib/cf.server";

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });

const PatchSchema = z.object({
  // Controle de status
  status: z.enum(["active", "paused", "stopped"]).optional(),
  // Avanço manual de fase
  advance_phase: z.boolean().optional(),
  // Editar nome
  name: z.string().min(1).max(100).optional(),
  // Reagendar próximo lote
  batch_due_at: z.string().optional(),
});

export const Route = createFileRoute("/api/warmup-plans/$id")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const d = requireDb();
        const plan = await d
          .prepare(`SELECT * FROM warmup_plans WHERE id = ?`)
          .bind(params.id)
          .first();
        if (!plan) return json({ error: "not_found" }, 404);

        const batches = await d
          .prepare(
            `SELECT * FROM warmup_batches WHERE plan_id = ? ORDER BY enqueued_at DESC LIMIT 20`,
          )
          .bind(params.id)
          .all();

        return json({ plan, batches: batches.results ?? [] });
      },

      PATCH: async ({ params, request }) => {
        const body = PatchSchema.parse(await request.json());
        const d = requireDb();

        if (body.advance_phase) {
          // Lê plano atual para calcular próxima fase
          const plan = await d
            .prepare(`SELECT phases_json, current_phase FROM warmup_plans WHERE id = ?`)
            .bind(params.id)
            .first<{ phases_json: string; current_phase: number }>();

          if (!plan) return json({ error: "not_found" }, 404);

          let phases: { totalPosts: number }[] = [];
          try {
            phases = JSON.parse(plan.phases_json);
          } catch {
            phases = [];
          }

          const nextPhase = plan.current_phase + 1;
          if (nextPhase >= phases.length) {
            // Já está na última fase
            await d
              .prepare(
                `UPDATE warmup_plans SET status='finished', updated_at=datetime('now') WHERE id=?`,
              )
              .bind(params.id)
              .run();
            return json({ ok: true, finished: true });
          }

          await d
            .prepare(
              `UPDATE warmup_plans SET
                current_phase = ?,
                posts_done_in_phase = 0,
                status = 'active',
                batch_due_at = datetime('now'),
                updated_at = datetime('now')
               WHERE id = ?`,
            )
            .bind(nextPhase, params.id)
            .run();

          return json({ ok: true, current_phase: nextPhase });
        }

        if (body.status) {
          const newStatus =
            body.status === "active"
              ? "active"
              : body.status === "paused"
              ? "paused"
              : "stopped";

          // Se reativando, garante que batch_due_at não esteja no passado distante
          // (reseta para agora quando o usuário retoma)
          if (body.status === "active") {
            await d
              .prepare(
                `UPDATE warmup_plans SET
                  status = 'active',
                  batch_due_at = CASE
                    WHEN batch_due_at < datetime('now') THEN datetime('now')
                    ELSE batch_due_at
                  END,
                  updated_at = datetime('now')
                 WHERE id = ?`,
              )
              .bind(params.id)
              .run();
          } else {
            await d
              .prepare(
                `UPDATE warmup_plans SET status=?, updated_at=datetime('now') WHERE id=?`,
              )
              .bind(newStatus, params.id)
              .run();
          }
        }

        if (body.name) {
          await d
            .prepare(`UPDATE warmup_plans SET name=?, updated_at=datetime('now') WHERE id=?`)
            .bind(body.name, params.id)
            .run();
        }

        if (body.batch_due_at) {
          await d
            .prepare(
              `UPDATE warmup_plans SET batch_due_at=?, updated_at=datetime('now') WHERE id=?`,
            )
            .bind(body.batch_due_at, params.id)
            .run();
        }

        return json({ ok: true });
      },

      DELETE: async ({ params }) => {
        await requireDb()
          .prepare(`DELETE FROM warmup_plans WHERE id = ?`)
          .bind(params.id)
          .run();
        return json({ ok: true });
      },
    },
  },
});
