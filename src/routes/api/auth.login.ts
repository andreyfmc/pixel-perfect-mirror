import { createFileRoute } from "@tanstack/react-router";
import {
  COOKIE_MAX_AGE,
  getAuthEnv,
  rateLimitCheck,
  rateLimitConsume,
  rateLimitReset,
  sessionCookie,
  signJwt,
  verifyPassword,
} from "@/lib/auth.server";

function clientIp(request: Request): string {
  return (
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    "unknown"
  );
}

export const Route = createFileRoute("/api/auth/login")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const ip = clientIp(request);
        const rl = rateLimitCheck(ip);
        if (!rl.allowed) {
          return Response.json(
            { error: "Muitas tentativas. Tente novamente em alguns minutos." },
            { status: 429, headers: { "Retry-After": String(rl.retryAfter) } },
          );
        }

        let body: { email?: string; password?: string };
        try {
          body = (await request.json()) as typeof body;
        } catch {
          return Response.json({ error: "Requisição inválida" }, { status: 400 });
        }
        const email = (body.email ?? "").trim().toLowerCase();
        const password = body.password ?? "";
        if (!email || !password) {
          rateLimitConsume(ip);
          return Response.json({ error: "Email ou senha incorretos" }, { status: 401 });
        }

        const { email: adminEmail, hash, secret } = getAuthEnv();
        if (!adminEmail || !hash || !secret) {
          return Response.json(
            { error: "Login não configurado no servidor (defina ADMIN_EMAIL, ADMIN_PASSWORD_HASH e JWT_SECRET)." },
            { status: 500 },
          );
        }

        const okEmail = email === adminEmail;
        const okPass = okEmail ? await verifyPassword(password, hash) : false;
        if (!okEmail || !okPass) {
          rateLimitConsume(ip);
          return Response.json({ error: "Email ou senha incorretos" }, { status: 401 });
        }

        rateLimitReset(ip);
        const now = Math.floor(Date.now() / 1000);
        const token = await signJwt({ sub: email, iat: now, exp: now + COOKIE_MAX_AGE }, secret);
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Set-Cookie": sessionCookie(token),
          },
        });
      },
    },
  },
});
