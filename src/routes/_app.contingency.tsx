import { createFileRoute } from "@tanstack/react-router";
import { mockAccounts } from "@/lib/mock";
import { fmtDateFull } from "@/lib/format";
import { ShieldAlert, ShieldCheck, Pause, Activity } from "lucide-react";

export const Route = createFileRoute("/_app/contingency")({
  component: ContingencyPage,
  head: () => ({ meta: [{ title: "Contingência · Insta Manager" }] }),
});

function ContingencyPage() {
  const atRisk = mockAccounts.filter((a) => a.health_score < 80);

  return (
    <div className="mx-auto max-w-5xl px-5 py-8 md:px-10">
      <header className="mb-8 flex items-start gap-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl"
          style={{ background: "color-mix(in oklab, var(--warning) 18%, transparent)" }}>
          <ShieldAlert className="h-5 w-5" style={{ color: "var(--warning)" }} />
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted2">Contingência</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">Contas em risco</h1>
          <p className="mt-2 max-w-2xl text-sm text-text2">
            Pausar agendamentos, reduzir frequência ou rodar uma sequência de recuperação para contas com baixa saúde.
          </p>
        </div>
      </header>

      {atRisk.length === 0 ? (
        <div className="im-card flex flex-col items-center justify-center p-12 text-center">
          <ShieldCheck className="h-8 w-8" style={{ color: "var(--success)" }} />
          <p className="mt-3 text-sm text-text2">Nenhuma conta em risco no momento.</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {atRisk.map((a) => (
            <li key={a.id} className="im-card flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
              <img src={a.profile_picture} alt="" className="h-12 w-12 rounded-full" />
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-base font-semibold">@{a.username}</span>
                  <span
                    className="rounded-md px-1.5 py-0.5 text-[10px] font-medium"
                    style={{
                      background: "color-mix(in oklab, var(--danger) 18%, transparent)",
                      color: "var(--danger)",
                    }}
                  >
                    saúde {a.health_score}
                  </span>
                </div>
                <p className="mt-1 text-sm text-text2">
                  Último post {fmtDateFull(a.last_post_at)} · token expira {fmtDateFull(a.token_expires_at)}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button className="inline-flex items-center gap-1.5 rounded-lg border border-border2 bg-bg3 px-3 py-2 text-xs hover:border-accent">
                  <Pause className="h-3.5 w-3.5" /> Pausar fila
                </button>
                <button className="inline-flex items-center gap-1.5 rounded-lg im-grad-accent px-3 py-2 text-xs font-medium text-white">
                  <Activity className="h-3.5 w-3.5" /> Plano de recuperação
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
