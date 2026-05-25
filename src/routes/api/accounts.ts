import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { db } from "@/lib/db.server";
import { hasDb } from "@/lib/cf.server";


const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });

const CreateAccount = z.object({
  username: z.string().min(1).max(64),
  name: z.string().min(1).max(120),
  profile_picture: z.string().url().optional(),
  ig_user_id: z.string().optional(),
  access_token: z.string().optional(),
  token_expires_at: z.string().optional(),
});

export const Route = createFileRoute("/api/accounts")({
  server: {
    handlers: {
      GET: async () => {
        if (!hasDb()) return json({ accounts: [], warning: "D1 not bound (dev)" });
        try {
          return json({ accounts: await db.listAccounts() });
        } catch (e) {
          return json({ accounts: [], error: (e as Error).message }, 200);
        }
      },

      POST: async ({ request }) => {
        const body = CreateAccount.parse(await request.json());
        const id = crypto.randomUUID();
        await db.createAccount({ id, ...body });
        return json({ id }, 201);
      },
    },
  },
});
