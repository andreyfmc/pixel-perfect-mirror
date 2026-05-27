// Endpoint manual para forçar refresh de insights (reach/likes/comments).
// GET ou POST /api/history/refresh?limit=20
import { createFileRoute } from "@tanstack/react-router";
import { refreshHistoryInsights } from "@/lib/scheduler.server";

async function handle({ request }: { request: Request }) {
  const url = new URL(request.url);
  const limit = Math.min(50, Math.max(1, Number(url.searchParams.get("limit") ?? 20)));
  try {
    const r = await refreshHistoryInsights(limit);
    return Response.json({ ok: true, ...r });
  } catch (err) {
    return Response.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}

export const Route = createFileRoute("/api/history/refresh")({
  server: {
    handlers: {
      GET: handle,
      POST: handle,
    },
  },
});
