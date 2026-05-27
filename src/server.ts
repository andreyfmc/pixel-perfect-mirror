import "./lib/error-capture";

import { setWorkerEnv } from "./lib/cf.server";
import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => ((m as { default?: ServerEntry }).default ?? (m as unknown as ServerEntry)),
    );
  }
  return serverEntryPromise;
}

function brandedErrorResponse(): Response {
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function isCatastrophicSsrErrorBody(body: string, responseStatus: number): boolean {
  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    return false;
  }

  if (!payload || Array.isArray(payload) || typeof payload !== "object") {
    return false;
  }

  const fields = payload as Record<string, unknown>;
  const expectedKeys = new Set(["message", "status", "unhandled"]);
  if (!Object.keys(fields).every((key) => expectedKeys.has(key))) {
    return false;
  }

  return (
    fields.unhandled === true &&
    fields.message === "HTTPError" &&
    (fields.status === undefined || fields.status === responseStatus)
  );
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isCatastrophicSsrErrorBody(body, response.status)) {
    return response;
  }

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return brandedErrorResponse();
}

function isPublicPath(pathname: string): boolean {
  if (pathname === "/login") return true;
  if (pathname.startsWith("/api/auth/")) return true;
  if (pathname.startsWith("/api/public/")) return true;
  if (pathname.startsWith("/_build/") || pathname.startsWith("/_server/")) return true;
  if (pathname.startsWith("/assets/") || pathname.startsWith("/@")) return true;
  // arquivos estáticos (têm extensão no último segmento)
  const last = pathname.split("/").pop() ?? "";
  if (last.includes(".")) return true;
  return false;
}

async function guardAuth(request: Request): Promise<Response | null> {
  const url = new URL(request.url);
  if (isPublicPath(url.pathname)) return null;
  const { isRequestAuthenticated } = await import("./lib/auth.server");
  if (await isRequestAuthenticated(request)) return null;
  const accept = request.headers.get("accept") ?? "";
  if (accept.includes("text/html")) {
    return new Response(null, { status: 302, headers: { Location: "/login" } });
  }
  return new Response(JSON.stringify({ error: "Não autenticado" }), {
    status: 401,
    headers: { "Content-Type": "application/json" },
  });
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    setWorkerEnv(env);
    try {
      // Memoriza o origin para que o Cron Trigger (sem request) consiga
      // construir URLs absolutas do proxy /api/public/drive.
      try {
        const u = new URL(request.url);
        const { rememberOrigin } = await import("./lib/scheduler.server");
        rememberOrigin(`${u.protocol}//${u.host}`);
      } catch {}
      const blocked = await guardAuth(request);
      if (blocked) return blocked;
      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      return await normalizeCatastrophicSsrResponse(response);
    } catch (error) {
      console.error(error);
      return brandedErrorResponse();
    }
  },

  // Cron Trigger — executado conforme `triggers.crons` em wrangler.jsonc.
  // Carrega o scheduler de forma preguiçosa para manter o cold-start do fetch leve.
  async scheduled(_event: ScheduledController, _env: unknown, ctx: ExecutionContext) {
    setWorkerEnv(_env);
    ctx.waitUntil(
      (async () => {
        try {
          const { runScheduler } = await import("./lib/scheduler.server");
          const r = await runScheduler();
          console.log(`[cron] processed=${r.processed} errors=${r.errors}`);
        } catch (err) {
          console.error("[cron] falhou:", err);
        }
      })(),
    );
  },
};
