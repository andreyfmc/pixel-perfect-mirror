import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import { fmtDateTime } from "@/lib/format";
import type { Account } from "@/lib/mock";
import {
  Plus,
  MoreHorizontal,
  ShieldCheck,
  Loader2,
  Instagram,
  Facebook,
  Trash2,
  ArrowDownUp,
  BadgeCheck,
  AlertTriangle,
  RefreshCw,
  Users,
  Image as ImageIcon,
  Clock,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useOAuthPopup } from "@/hooks/use-oauth-popup";

type SortKey = "followers" | "health" | "recent" | "name";
const SORT_LABELS: Record<SortKey, string> = {
  followers: "Mais seguidores",
  health: "Maior saúde",
  recent: "Postou recentemente",
  name: "Nome (A–Z)",
};

export const Route = createFileRoute("/_app/accounts")({
  component: AccountsPage,
  head: () => ({ meta: [{ title: "Contas · Insta Manager" }] }),
});

function ringForHealth(score: number) {
  if (score >= 80) return "var(--success)";
  if (score >= 60) return "var(--warning)";
  return "var(--danger)";
}

function tokenDaysLeft(expiresAt?: string | null) {
  if (!expiresAt) return null;
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (!Number.isFinite(ms)) return null;
  return Math.ceil(ms / 86_400_000);
}

function tokenInfo(a: { token_status?: string; token_expires_at?: string | null }) {
  const days = tokenDaysLeft(a.token_expires_at);
  const expired = a.token_status === "expired" || (days !== null && days <= 0);
  const warning = !expired && days !== null && days <= 7;
  const label = expired
    ? "Token expirado"
    : days === null
      ? "Expiração desconhecida"
      : days === 1
        ? "Expira em 1 dia"
        : `Expira em ${days} dias`;
  return { days, expired, warning, label };
}

function AccountsPage() {
  const qc = useQueryClient();
  const [sortKey, setSortKey] = useState<SortKey>("followers");
  const { data: accounts = [], isLoading } = useQuery({
    queryKey: ["accounts"],
    queryFn: () => api.listAccounts(),
  });
  const sorted = useMemo(() => {
    const arr = [...accounts];
    switch (sortKey) {
      case "followers":
        return arr.sort((a, b) => b.followers - a.followers);
      case "health":
        return arr.sort((a, b) => b.health_score - a.health_score);
      case "recent":
        return arr.sort((a, b) => +new Date(b.last_post_at) - +new Date(a.last_post_at));
      case "name":
        return arr.sort((a, b) => a.username.localeCompare(b.username));
    }
  }, [accounts, sortKey]);

  const { connect, loading } = useOAuthPopup();

  async function handleConnect(provider: "instagram" | "facebook") {
    const label = provider === "instagram" ? "Instagram" : "Facebook";
    const t = toast.loading(`Conectando ao ${label}…`);
    const res = await connect(provider);
    toast.dismiss(t);
    if (res.ok) {
      const names = (res.saved ?? []).map((u) => `@${u}`).join(", ") || "conta";
      toast.success(`Conectado: ${names}`);
      qc.invalidateQueries({ queryKey: ["accounts"] });
    } else {
      toast.error(res.error ?? "Falha na conexão");
    }
  }

  // Fallback redirect (mobile): lê resultado da query string
  useEffect(() => {
    if (typeof window === "undefined") return;
    const p = new URLSearchParams(window.location.search);
    if (!p.has("ok")) return;
    const ok = p.get("ok") === "true";
    if (ok) {
      const saved = p.get("saved");
      toast.success(`Conta conectada: ${saved ?? ""}`);
      qc.invalidateQueries({ queryKey: ["accounts"] });
    } else {
      toast.error(p.get("error") ?? "Falha na conexão");
    }
    window.history.replaceState({}, "", window.location.pathname);
  }, [qc]);

  return (
    <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6 sm:py-7 md:px-10 md:py-8">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted2">Contas</p>
          <h1 className="mt-2 text-2xl sm:text-3xl font-semibold tracking-tight">Suas conexões</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={async () => {
              if (!accounts.length) return;
              const t = toast.loading(`Atualizando ${accounts.length} contas…`);
              let ok = 0;
              const fails: string[] = [];
              for (const a of accounts) {
                try {
                  const r = await api.validateAccount(a.id);
                  if (r?.ok) ok++;
                  else fails.push(`@${a.username}`);
                } catch {
                  fails.push(`@${a.username}`);
                }
              }
              toast.dismiss(t);
              qc.invalidateQueries({ queryKey: ["accounts"] });
              if (!fails.length) toast.success(`Atualizadas (${ok}/${accounts.length})`);
              else
                toast.error(`${ok}/${accounts.length} ok · falhas: ${fails.join(", ")}`, {
                  duration: 12000,
                });
            }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border2 bg-bg3 px-3 py-2 text-sm text-text2 hover:border-accent hover:text-foreground"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Atualizar todas
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="inline-flex items-center gap-1.5 rounded-lg border border-border2 bg-bg3 px-3 py-2 text-sm text-text2 hover:border-accent hover:text-foreground">
                <ArrowDownUp className="h-3.5 w-3.5" /> {SORT_LABELS[sortKey]}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              {(Object.keys(SORT_LABELS) as SortKey[]).map((k) => (
                <DropdownMenuItem key={k} onSelect={() => setSortKey(k)}>
                  {SORT_LABELS[k]}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <section className="mb-8 grid gap-4 md:grid-cols-2">
        <button
          type="button"
          onClick={() => handleConnect("instagram")}
          disabled={loading !== null}
          className="im-card im-card-hover group relative flex items-center gap-4 p-5 text-left disabled:opacity-60"
          style={{
            background: "linear-gradient(135deg, rgba(225,48,108,0.18), rgba(131,58,180,0.18))",
          }}
        >
          <div
            className="flex h-12 w-12 items-center justify-center rounded-xl text-white"
            style={{
              background: "linear-gradient(135deg,#f09433,#e6683c,#dc2743,#cc2366,#bc1888)",
            }}
          >
            {loading === "instagram" ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Instagram className="h-5 w-5" />
            )}
          </div>
          <div className="min-w-0">
            <div className="text-base font-semibold">Conectar com Instagram</div>
            <div className="text-xs text-text2">
              Instagram Login direto · contas Business sem Página
            </div>
          </div>
        </button>

        <button
          type="button"
          onClick={() => handleConnect("facebook")}
          disabled={loading !== null}
          className="im-card im-card-hover group relative flex items-center gap-4 p-5 text-left disabled:opacity-60"
          style={{
            background: "linear-gradient(135deg, rgba(24,119,242,0.18), rgba(0,82,204,0.18))",
          }}
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#1877F2] text-white">
            {loading === "facebook" ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Facebook className="h-5 w-5" />
            )}
          </div>
          <div className="min-w-0">
            <div className="text-base font-semibold">Conectar via Facebook</div>
            <div className="text-xs text-text2">Para contas Business com Página vinculada</div>
          </div>
        </button>
      </section>

      {isLoading ? (
        <div className="flex items-center justify-center py-20 text-text2">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : (
        <div className="space-y-2">
          {sorted.map((a) => {
            const token = tokenInfo(a as Account);
            const posts = (a as Account).posts ?? 0;
            const hasLastPost = !!a.last_post_at;
            return (
              <article
                key={a.id}
                className="im-card im-card-hover flex items-center gap-3 px-3 py-2.5 sm:gap-4 sm:px-4"
              >
                <div
                  className="shrink-0 rounded-full p-[2px]"
                  style={{
                    background: `conic-gradient(${ringForHealth(a.health_score)} ${a.health_score}%, var(--border) 0)`,
                  }}
                  title={`Saúde ${a.health_score}`}
                >
                  <img
                    src={a.profile_picture}
                    alt={a.username}
                    className="h-10 w-10 rounded-full bg-bg3 ring-2 ring-bg2"
                  />
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="truncate text-sm font-semibold">@{a.username}</h3>
                    {token.expired ? (
                      <span className="shrink-0 rounded-full border border-danger/40 bg-danger/10 px-1.5 py-0.5 text-[10px] font-semibold text-danger">
                        Token expirado
                      </span>
                    ) : token.warning ? (
                      <span className="shrink-0 rounded-full border border-warning/40 bg-warning/10 px-1.5 py-0.5 text-[10px] font-semibold text-warning">
                        Expira em breve
                      </span>
                    ) : null}
                  </div>
                  <p className="truncate text-xs text-text2">{a.name}</p>
                </div>

                <div
                  className="hidden shrink-0 items-center gap-1 rounded-md bg-bg3 px-2 py-1 text-xs font-semibold sm:inline-flex"
                  style={{ color: ringForHealth(a.health_score) }}
                  title="Saúde"
                >
                  <ShieldCheck className="h-3.5 w-3.5" /> {a.health_score}
                </div>

                <div
                  className="hidden shrink-0 items-center gap-1 text-xs text-text2 md:inline-flex"
                  title="Seguidores"
                >
                  <Users className="h-3.5 w-3.5" />
                  <span className="tabular-nums">{a.followers.toLocaleString("pt-BR")}</span>
                </div>

                <div
                  className="hidden shrink-0 items-center gap-1 text-xs text-text2 md:inline-flex"
                  title="Posts publicados"
                >
                  <ImageIcon className="h-3.5 w-3.5" />
                  <span className="tabular-nums">{posts.toLocaleString("pt-BR")}</span>
                </div>

                <div
                  className="hidden shrink-0 items-center gap-1 text-xs text-text2 lg:inline-flex"
                  title="Último post"
                >
                  <Clock className="h-3.5 w-3.5" />
                  <span className="tabular-nums">
                    {hasLastPost ? fmtDateTime(a.last_post_at) : "—"}
                  </span>
                </div>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      className="shrink-0 rounded-md p-1.5 text-text2 hover:bg-bg3 hover:text-foreground"
                      aria-label="Menu"
                    >
                      <MoreHorizontal className="h-4 w-4" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    <DropdownMenuItem
                      onSelect={async (e) => {
                        e.preventDefault();
                        const t = toast.loading("Validando credenciais…");
                        try {
                          const r = await api.validateAccount(a.id);
                          toast.dismiss(t);
                          if (!r) {
                            toast.error("Falha ao validar (sem resposta)");
                            return;
                          }
                          if (r.ok) {
                            toast.success(
                              `OK · IG @${r.ig?.username ?? "?"} (id ${r.ig?.id ?? "?"})`,
                            );
                            qc.invalidateQueries({ queryKey: ["accounts"] });
                          } else if (r.needs_reconnect) {
                            toast.error(
                              `@${a.username}: token expirado/inválido. Reconecte a conta.`,
                              { duration: 12000 },
                            );
                            qc.invalidateQueries({ queryKey: ["accounts"] });
                          } else {
                            const sugg = (r.suggestions ?? [])
                              .filter((s) => s.ig_id)
                              .map((s) => `@${s.ig_username} (${s.ig_id})`)
                              .join(", ");
                            const detail =
                              typeof r.error === "object"
                                ? JSON.stringify(r.error)
                                : String(r.error ?? "erro");
                            toast.error(
                              `Falha (${r.scope ?? "graph"}): ${detail}${sugg ? ` · sugestões: ${sugg}` : ""}`,
                              { duration: 12000 },
                            );
                            console.warn("[validate]", r);
                          }
                        } catch (err) {
                          toast.dismiss(t);
                          toast.error(err instanceof Error ? err.message : "Falha");
                        }
                      }}
                    >
                      <BadgeCheck className="mr-2 h-4 w-4" />
                      Validar credenciais
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onSelect={(e) => {
                        e.preventDefault();
                        handleConnect(a.provider ?? "facebook");
                      }}
                    >
                      <RefreshCw className="mr-2 h-4 w-4" />
                      Reconectar via{" "}
                      {(a.provider ?? "facebook") === "facebook" ? "Facebook" : "Instagram"}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="text-red-500 focus:text-red-500"
                      onSelect={async (e) => {
                        e.preventDefault();
                        if (!confirm(`Remover @${a.username}? Esta ação não pode ser desfeita.`))
                          return;
                        const t = toast.loading("Removendo conta…");
                        try {
                          await api.deleteAccount(a.id);
                          toast.success(`@${a.username} removida`);
                          qc.invalidateQueries({ queryKey: ["accounts"] });
                        } catch (err) {
                          toast.error(err instanceof Error ? err.message : "Falha ao remover");
                        } finally {
                          toast.dismiss(t);
                        }
                      }}
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Remover conta
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </article>
            );
          })}

          <button
            type="button"
            onClick={() => handleConnect("instagram")}
            disabled={loading !== null}
            className="im-card border-dashed flex w-full items-center justify-center gap-2 px-4 py-3 text-sm text-text2 hover:border-accent hover:text-foreground disabled:opacity-60"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Adicionar nova conta
          </button>
        </div>
      )}
    </div>
  );
}
