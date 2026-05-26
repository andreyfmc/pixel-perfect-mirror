import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { requireDb } from "@/lib/cf.server";

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });

const Item = z.object({
  id: z.string().min(1).max(64),
  username: z.string().min(1).max(255),
  password: z.string().max(500).default(""),
  totp_secret: z.string().max(500).default(""),
  status: z.enum(["em_edicao", "pronta", "em_uso", "descartada"]).default("em_edicao"),
  quality: z.enum(["boa", "media", "ruim"]).default("boa"),
  notes: z.string().max(2000).default(""),
  updated_at: z.string().default(() => new Date().toISOString()),
});

const PostSchema = z.union([
  Item,
  z.object({ replaceAll: z.literal(true), items: z.array(Item).max(5000) }),
]);

export const Route = createFileRoute("/api/contingency")({
  server: {
    handlers: {
      GET: async () => {
        try {
          const { results } = await requireDb()
            .prepare("SELECT * FROM contingency ORDER BY updated_at DESC")
            .all();
          return json({ items: results ?? [] });
        } catch (e) {
          return json({ items: [], error: (e as Error).message }, 200);
        }
      },
      POST: async ({ request }) => {
        const body = PostSchema.parse(await request.json());
        const db = requireDb();
        if ("replaceAll" in body) {
          // bulk replace (importação)
          const stmts = [
            db.prepare("DELETE FROM contingency"),
            ...body.items.map((it) =>
              db
                .prepare(
                  `INSERT INTO contingency (id, username, password, totp_secret, status, quality, notes, updated_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                )
                .bind(it.id, it.username, it.password, it.totp_secret, it.status, it.quality, it.notes, it.updated_at),
            ),
          ];
          await db.batch(stmts);
          return json({ ok: true, count: body.items.length });
        }
        // upsert único
        await db
          .prepare(
            `INSERT INTO contingency (id, username, password, totp_secret, status, quality, notes, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(id) DO UPDATE SET
               username=excluded.username, password=excluded.password, totp_secret=excluded.totp_secret,
               status=excluded.status, quality=excluded.quality, notes=excluded.notes, updated_at=excluded.updated_at`,
          )
          .bind(body.id, body.username, body.password, body.totp_secret, body.status, body.quality, body.notes, body.updated_at)
          .run();
        return json({ ok: true });
      },
    },
  },
});
