import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { mockAccounts } from "@/lib/mock";
import { fmtDateShort, fmtDateFull } from "@/lib/format";
import { Plus, MoreHorizontal, ShieldCheck } from "lucide-react";
import { ConnectAccountDialog } from "@/components/ConnectAccountDialog";

export const Route = createFileRoute("/_app/accounts")({
  component: AccountsPage,
  head: () => ({ meta: [{ title: "Contas · Insta Manager" }] }),
});

function ringForHealth(score: number) {
  if (score >= 80) return "var(--success)";
  if (score >= 60) return "var(--warning)";
  return "var(--danger)";
}

function AccountsPage() {
  const [open, setOpen] = useState(false);
  return (
    <div className="mx-auto max-w-7xl px-5 py-8 md:px-10">
      <header className="mb-8 flex items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted2">Contas</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">Suas conexões</h1>
        </div>
        <button
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-lg im-grad-accent px-3.5 py-2 text-sm font-medium text-white"
        >
          <Plus className="h-4 w-4" /> Conectar Instagram
        </button>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {mockAccounts.map((a) => (
          <article key={a.id} className="im-card im-card-hover p-5">
            <div className="flex items-start gap-4">
              <div
                className="rounded-full p-[2px]"
                style={{ background: `conic-gradient(${ringForHealth(a.health_score)} ${a.health_score}%, var(--border) 0)` }}
              >
                <img
                  src={a.profile_picture}
                  alt={a.username}
                  className="h-14 w-14 rounded-full bg-bg3 ring-2 ring-bg2"
                />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="truncate text-base font-semibold">@{a.username}</h3>
                  <button className="ml-auto text-text2 hover:text-foreground" aria-label="Menu">
                    <MoreHorizontal className="h-4 w-4" />
                  </button>
                </div>
                <p className="text-sm text-text2">{a.name}</p>
              </div>
            </div>

            <dl className="mt-5 grid grid-cols-3 gap-3 text-center">
              <div className="rounded-lg bg-bg3 px-2 py-3">
                <dt className="text-[10px] uppercase tracking-wider text-muted2">Saúde</dt>
                <dd className="mt-1 text-base font-semibold" style={{ color: ringForHealth(a.health_score) }}>
                  {a.health_score}
                </dd>
              </div>
              <div className="rounded-lg bg-bg3 px-2 py-3">
                <dt className="text-[10px] uppercase tracking-wider text-muted2">Seguidores</dt>
                <dd className="mt-1 text-base font-semibold">{a.followers.toLocaleString("pt-BR")}</dd>
              </div>
              <div className="rounded-lg bg-bg3 px-2 py-3">
                <dt className="text-[10px] uppercase tracking-wider text-muted2">Último</dt>
                <dd className="mt-1 text-base font-semibold">{fmtDateShort(a.last_post_at)}</dd>
              </div>
            </dl>

            <div className="mt-4 flex items-center justify-between text-xs text-muted2">
              <span className="inline-flex items-center gap-1">
                <ShieldCheck className="h-3.5 w-3.5" />
                Token expira {fmtDateFull(a.token_expires_at)}
              </span>
              <button className="font-medium text-text2 hover:text-foreground">renovar</button>
            </div>
          </article>
        ))}

        <button
          onClick={() => setOpen(true)}
          className="im-card border-dashed flex min-h-[260px] flex-col items-center justify-center gap-2 text-text2 hover:text-foreground hover:border-accent"
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-bg3">
            <Plus className="h-5 w-5" />
          </div>
          <span className="text-sm">Adicionar nova conta</span>
        </button>
      </div>

      <ConnectAccountDialog open={open} onClose={() => setOpen(false)} />
    </div>
  );
}
