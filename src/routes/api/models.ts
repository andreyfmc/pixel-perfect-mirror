import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { db } from "@/lib/db.server";

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });

const CreateModel = z.object({
  name: z.string().min(1).max(80),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
});

export const Route = createFileRoute("/api/models")({
  server: {
    handlers: {
      GET: async () => json({ models: await db.listModels() }),
      POST: async ({ request }) => {
        const body = CreateModel.parse(await request.json());
        const id = crypto.randomUUID();
        await db.createModel({ id, ...body });
        return json({ id }, 201);
      },
    },
  },
});
