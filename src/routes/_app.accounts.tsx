import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { api, type AccountStatusReport, type Model } from "@/lib/api-client";
import type { Account } from "@/lib/mock";
import {
  Plus,
  MoreHorizontal,
  ShieldCheck,
  Loader2,
  Instagram,
  Facebook,
  Trash2,
  BadgeCheck,
  RefreshCw,
  Users,
  Image as ImageIcon,
  Clock,
  List,
  LayoutGrid,
  ArrowRightLeft,
  ArrowLeftToLine,
  Pause,
  History,
  ListChecks,
  Search,
  X,
  Check,
  Power,
  Activity,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useOAuthPopup } from "@/hooks/use-oauth-popup";
import { ConnectLinkButton } from "@/components/ConnectLinkButton";

export const Route = createFileRoute("/_app/accounts")({
  component: AccountsPage,
  head: () => ({ meta: [{ title: "Contas · Insta Manager" }] }),
});

type Role = "active" | "reserve";
type View = "list" | "grid";
type SortKey = "followers" | "health-asc" | "recent" | "name";
type HealthFilter = "all" | "good" | "warn" | "bad";

const SORT_LABELS: Record<SortKey, string> = {
  followers: "Mais seguidores",
  "health-asc": "Menor saúde",
  recent: "Última atividade",
  name: "Alfabético",
};

const HEALTH_LABELS: Record<HealthFilter, string> = {
  all: "Saúde: Todas",
  good: "Saudáveis (≥80)",
  warn: "Atenção (60–79)",
  bad: "Críticas (<60)",
};

const ROLE_KEY = "accounts.roleOverrides.v1";
const PAUSED_KEY = "accounts.pausedOverrides.v1";
const TAB_KEY = "accounts.activeTab.v1";
const VIEW_KEY = "accounts.view.v1";

// -------------- overrides (localStorage, until backend has role column) --------------
function loadMap(key: string): Record<string, boolean | Role> {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(key) || "{}");
  } catch {
    return {};
  }
}
function saveMap(key: string, m: Record<string, unknown>) {
  if (typeof window === "undefined") return;
  localStorage.setItem(key, JSON.stringify(m));
}

// -------------- helpers --------------
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
  return { days, expired, warning };
}
function compact(n: number) {
  if (n >= 1000) {
    const k = n / 1000;
    return k.toFixed(k >= 10 ? 0 : 1).replace(".", ",") + "k";
  }
  return n.toLocaleString("pt-BR");
}
function relTime(iso: string, now: number) {
  const diff = now - new Date(iso).getTime();
  if (!Number.isFinite(diff)) return "—";
  const min = Math.round(diff / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min}min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h}h`;
  const d = Math.floor(h / 24);
  if (d < 30) return `há ${d}d`;
  return new Date(iso).toLocaleDateString("pt-BR");
}
function absDateTime(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// -------------- Health Badge --------------
function HealthBadge({ score, size = 32 }: { score: number; size?: number }) {
  const color = ringForHealth(score);
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className="flex shrink-0 items-center justify-center rounded-full font-bold tabular-nums"
            style={{
              width: size,
              height: size,
              background: `color-mix(in oklab, ${color} 18%, transparent)`,
              color,
              border: `1.5px solid ${color}`,
              fontSize: size > 28 ? 13 : 11,
            }}
          >
            {score}
          </div>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs text-xs">
          Saúde calculada com base em: taxa de engajamento, frequência de posts e idade da conta.
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

const STATUS_META: Record<
  AccountStatusReport["status"],
  { label: string; color: string; bg: string }
> = {
  healthy: { label: "Saudável", color: "var(--success)", bg: "color-mix(in oklab, var(--success) 18%, transparent)" },
  limited: { label: "Limitada", color: "var(--warning)", bg: "color-mix(in oklab, var(--warning) 18%, transparent)" },
  restricted: { label: "Restrita", color: "#fb923c", bg: "rgba(251,146,60,0.18)" },
  action_blocked: { label: "Bloqueada", color: "#a855f7", bg: "rgba(168,85,247,0.18)" },
  token_expired: { label: "Token expirado", color: "var(--danger)", bg: "color-mix(in oklab, var(--danger) 18%, transparent)" },
  needs_reconnect: { label: "Reconectar", color: "var(--danger)", bg: "color-mix(in oklab, var(--danger) 18%, transparent)" },
};

function StatusBadge({ status }: { status: AccountStatusReport["status"] }) {
  const m = STATUS_META[status];
  return (
    <span
      className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold whitespace-nowrap"
      style={{ background: m.bg, color: m.color, border: `1px solid ${m.color}` }}
    >
      {m.label}
    </span>
  );
}

function ModelBadge({ model }: { model: Model | undefined }) {
  if (!model) return null;
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold whitespace-nowrap"
      style={{
        background: `color-mix(in oklab, ${model.color} 18%, transparent)`,
        color: model.color,
        border: `1px solid ${model.color}`,
      }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: model.color }} />
      {model.name}
    </span>
  );
}

// -------------- Connect Modal --------------
function ConnectDialog({
  loading,
  onConnect,
}: {
  loading: "instagram" | "facebook" | null;
  onConnect: (p: "instagram" | "facebook") => void;
}) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3.5 py-2 text-sm font-semibold text-primary-foreground im-glow">
          <Plus className="h-4 w-4" /> Conectar conta
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Conectar conta</DialogTitle>
          <DialogDescription>Escolha o método de autenticação.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <button
            onClick={() => onConnect("instagram")}
            disabled={loading !== null}
            className="im-card im-card-hover flex flex-col gap-3 p-4 text-left disabled:opacity-60"
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
            <div>
              <div className="text-sm font-semibold">Instagram</div>
              <div className="mt-1 text-xs text-text2">
                Instagram Login direto · contas Business sem Página vinculada
              </div>
            </div>
          </button>
          <button
            onClick={() => onConnect("facebook")}
            disabled={loading !== null}
            className="im-card im-card-hover flex flex-col gap-3 p-4 text-left disabled:opacity-60"
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
            <div>
              <div className="text-sm font-semibold">Facebook</div>
              <div className="mt-1 text-xs text-text2">
                Para contas Business com Página vinculada ao Facebook
              </div>
            </div>
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// -------------- main page --------------
function AccountsPage() {
  const qc = useQueryClient();
  const { connect, loading } = useOAuthPopup();
  const { data: accountsRaw = [], isLoading } = useQuery({
    queryKey: ["accounts"],
    queryFn: () => api.listAccounts(),
  });
  const { data: models = [] } = useQuery({
    queryKey: ["models"],
    queryFn: () => api.listModels(),
  });
  const [newModelName, setNewModelName] = useState("");
  const [newModelColor, setNewModelColor] = useState("#6366f1");
  const MODEL_COLORS = ["#6366f1", "#ec4899", "#f59e0b", "#10b981", "#3b82f6", "#ef4444", "#8b5cf6", "#14b8a6"];

  async function createModel() {
    if (!newModelName.trim()) return;
    const r = await api.createModel({ name: newModelName.trim(), color: newModelColor });
    if (r) {
      setNewModelName("");
      toast.success("Modelo criada");
      qc.invalidateQueries({ queryKey: ["models"] });
    }
  }
  async function deleteModel(id: string) {
    if (!confirm("Remover modelo? As contas vinculadas ficarão sem modelo.")) return;
    await api.deleteModel(id);
    toast.success("Modelo removida");
    qc.invalidateQueries({ queryKey: ["models"] });
    qc.invalidateQueries({ queryKey: ["accounts"] });
  }
  async function assignModel(accountId: string, modelId: string | null) {
    await api.setAccountModel(accountId, modelId);
    qc.invalidateQueries({ queryKey: ["accounts"] });
  }

  // localStorage overrides
  const [roleMap, setRoleMap] = useState<Record<string, Role>>({});
  const [pausedMap, setPausedMap] = useState<Record<string, boolean>>({});
  useEffect(() => {
    setRoleMap(loadMap(ROLE_KEY) as Record<string, Role>);
    setPausedMap(loadMap(PAUSED_KEY) as Record<string, boolean>);
  }, []);

  // Merge overrides into accounts
  const accounts = useMemo(
    () =>
      accountsRaw.map((a) => ({
        ...a,
        role: (roleMap[a.id] ?? a.role ?? "active") as Role,
        paused: pausedMap[a.id] ?? a.paused ?? false,
      })),
    [accountsRaw, roleMap, pausedMap],
  );

  function setRole(id: string, role: Role) {
    setRoleMap((m) => {
      const n = { ...m, [id]: role };
      saveMap(ROLE_KEY, n);
      return n;
    });
  }
  function togglePaused(id: string, value?: boolean) {
    setPausedMap((m) => {
      const next = value ?? !m[id];
      const n = { ...m, [id]: next };
      saveMap(PAUSED_KEY, n);
      return n;
    });
  }

  // UI state
  const [tab, setTab] = useState<Role>("active");
  const [view, setView] = useState<View>("list");
  const [sortKey, setSortKey] = useState<SortKey>("followers");
  const [healthFilter, setHealthFilter] = useState<HealthFilter>("all");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmMove, setConfirmMove] = useState<string | null>(null);
  const [refreshProgress, setRefreshProgress] = useState<{ done: number; total: number } | null>(
    null,
  );
  const [statusDialog, setStatusDialog] = useState<{
    account: Account;
    loading: boolean;
    report: AccountStatusReport | null;
    error: string | null;
  } | null>(null);
  const [lastRefresh, setLastRefresh] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  // Toast pós-callback do link OAuth (/accounts?connected=@user)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const connected = params.get("connected");
    if (!connected) return;
    toast.success(`${connected} conectada com sucesso`);
    qc.invalidateQueries({ queryKey: ["accounts"] });
    params.delete("connected");
    const next = window.location.pathname + (params.toString() ? `?${params}` : "");
    window.history.replaceState({}, "", next);
  }, [qc]);

  // Restore tab/view from localStorage
  useEffect(() => {
    const t = localStorage.getItem(TAB_KEY);
    if (t === "active" || t === "reserve") setTab(t);
    const v = localStorage.getItem(VIEW_KEY);
    if (v === "list" || v === "grid") setView(v);
  }, []);
  useEffect(() => {
    localStorage.setItem(TAB_KEY, tab);
  }, [tab]);
  useEffect(() => {
    localStorage.setItem(VIEW_KEY, view);
  }, [view]);

  // Counters by role
  const activeCount = accounts.filter((a) => a.role === "active").length;
  const reserveCount = accounts.filter((a) => a.role === "reserve").length;

  // Filtered + sorted within current tab
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = accounts.filter((a) => a.role === tab);
    if (q) {
      list = list.filter(
        (a) =>
          a.username.toLowerCase().includes(q) || a.name.toLowerCase().includes(q),
      );
    }
    if (healthFilter !== "all") {
      list = list.filter((a) => {
        if (healthFilter === "good") return a.health_score >= 80;
        if (healthFilter === "warn") return a.health_score >= 60 && a.health_score < 80;
        return a.health_score < 60;
      });
    }
    const arr = [...list];
    switch (sortKey) {
      case "followers":
        arr.sort((a, b) => b.followers - a.followers);
        break;
      case "health-asc":
        arr.sort((a, b) => a.health_score - b.health_score);
        break;
      case "recent":
        arr.sort((a, b) => +new Date(b.last_post_at) - +new Date(a.last_post_at));
        break;
      case "name":
        arr.sort((a, b) => a.username.localeCompare(b.username));
        break;
    }
    return arr;
  }, [accounts, tab, query, healthFilter, sortKey]);

  // Reset selection when tab/filters change drastically
  const tabRef = useRef(tab);
  useEffect(() => {
    if (tabRef.current !== tab) {
      setSelected(new Set());
      tabRef.current = tab;
    }
  }, [tab]);

  function toggleSelect(id: string) {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }
  function clearSelection() {
    setSelected(new Set());
  }

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

  // Fallback redirect (mobile)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const p = new URLSearchParams(window.location.search);
    if (!p.has("ok")) return;
    const ok = p.get("ok") === "true";
    if (ok) {
      toast.success(`Conta conectada: ${p.get("saved") ?? ""}`);
      qc.invalidateQueries({ queryKey: ["accounts"] });
    } else {
      toast.error(p.get("error") ?? "Falha na conexão");
    }
    window.history.replaceState({}, "", window.location.pathname);
  }, [qc]);

  async function refreshAll(targets = accounts) {
    if (!targets.length) return;
    setRefreshProgress({ done: 0, total: targets.length });
    let ok = 0;
    const fails: string[] = [];
    for (const a of targets) {
      try {
        const r = await api.validateAccount(a.id);
        if (r?.ok) ok++;
        else fails.push(`@${a.username}`);
      } catch {
        fails.push(`@${a.username}`);
      }
      setRefreshProgress((p) => (p ? { ...p, done: p.done + 1 } : p));
    }
    setRefreshProgress(null);
    setLastRefresh(Date.now());
    qc.invalidateQueries({ queryKey: ["accounts"] });
    if (!fails.length) toast.success(`Atualizadas (${ok}/${targets.length})`);
    else toast.error(`${ok}/${targets.length} ok · falhas: ${fails.join(", ")}`, { duration: 12000 });
  }

  async function validateOne(a: Account) {
    const t = toast.loading("Validando credenciais…");
    try {
      const r = await api.validateAccount(a.id);
      toast.dismiss(t);
      if (!r) return toast.error("Falha ao validar (sem resposta)");
      if (r.ok) {
        toast.success(`OK · IG @${r.ig?.username ?? "?"}`);
        qc.invalidateQueries({ queryKey: ["accounts"] });
      } else if (r.needs_reconnect) {
        toast.error(`@${a.username}: token expirado. Reconecte.`, { duration: 12000 });
      } else {
        toast.error(`Falha: ${JSON.stringify(r.error ?? "erro")}`, { duration: 12000 });
      }
    } catch (err) {
      toast.dismiss(t);
      toast.error(err instanceof Error ? err.message : "Falha");
    }
  }

  async function openStatus(a: Account) {
    setStatusDialog({ account: a, loading: true, report: null, error: null });
    try {
      const r = await api.getAccountStatus(a.id);
      if (!r) {
        setStatusDialog({ account: a, loading: false, report: null, error: "Sem resposta do servidor" });
        return;
      }
      if (r.ok && r.report) {
        setStatusDialog({ account: a, loading: false, report: r.report, error: null });
        qc.invalidateQueries({ queryKey: ["accounts"] });
      } else {
        setStatusDialog({ account: a, loading: false, report: null, error: r.error ?? "Falha" });
      }
    } catch (err) {
      setStatusDialog({
        account: a,
        loading: false,
        report: null,
        error: err instanceof Error ? err.message : "Falha",
      });
    }
  }

  async function removeAccount(a: Account) {
    if (!confirm(`Remover @${a.username}? Esta ação não pode ser desfeita.`)) return;
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
  }

  // ----- Bulk actions -----
  function bulkMoveToReserve() {
    selected.forEach((id) => setRole(id, "reserve"));
    toast.success(`${selected.size} contas movidas para Reservas`);
    clearSelection();
  }
  function bulkActivate() {
    selected.forEach((id) => setRole(id, "active"));
    toast.success(`${selected.size} contas ativadas`);
    clearSelection();
  }
  function bulkRefresh() {
    const targets = accounts.filter((a) => selected.has(a.id));
    void refreshAll(targets);
    clearSelection();
  }
  async function bulkDisconnect() {
    if (!confirm(`Desconectar ${selected.size} contas?`)) return;
    const ids = [...selected];
    await Promise.all(ids.map((id) => api.deleteAccount(id)));
    toast.success(`${ids.length} contas removidas`);
    qc.invalidateQueries({ queryKey: ["accounts"] });
    clearSelection();
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6 sm:py-7 md:px-10 md:py-8">
      {/* ============ Header ============ */}
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted2">Contas</p>
          <h1 className="mt-2 text-2xl sm:text-3xl font-semibold tracking-tight">
            Suas conexões
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {refreshProgress ? (
            <div className="flex items-center gap-2 rounded-lg border border-border2 bg-bg3 px-3 py-2 text-sm">
              <Loader2 className="h-4 w-4 animate-spin text-accent2" />
              <span className="tabular-nums">
                Atualizando {refreshProgress.done}/{refreshProgress.total}
              </span>
              <div className="h-1 w-24 overflow-hidden rounded bg-bg">
                <div
                  className="h-full bg-accent2 transition-all"
                  style={{ width: `${(refreshProgress.done / refreshProgress.total) * 100}%` }}
                />
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => refreshAll()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border2 bg-bg3 px-3 py-2 text-sm text-text2 hover:border-accent hover:text-foreground"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              {lastRefresh ? (
                <span>
                  Atualizar todas{" "}
                  <span className="text-[10px] text-muted2">· há {relTime(new Date(lastRefresh).toISOString(), now).replace("há ", "")}</span>
                </span>
              ) : (
                "Atualizar todas"
              )}
            </button>
          )}
          <ConnectLinkButton />
          <ConnectDialog loading={loading} onConnect={handleConnect} />
        </div>
      </header>

      {/* ============ Modelos ============ */}
      <section className="mb-5 rounded-xl border border-border bg-bg2 p-3">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-text2">Modelos</h2>
          <span className="text-[11px] text-muted2">{models.length} modelo{models.length === 1 ? "" : "s"}</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {models.map((m) => (
            <div
              key={m.id}
              className="group inline-flex items-center gap-1.5 rounded-full border border-border2 bg-bg3 px-2 py-1 text-[11px]"
              style={{ borderColor: `color-mix(in oklab, ${m.color} 50%, var(--border))` }}
            >
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: m.color }} />
              <span className="font-medium">{m.name}</span>
              <span className="text-muted2">
                · {accounts.filter((a) => a.model_id === m.id).length}
              </span>
              <button
                onClick={() => deleteModel(m.id)}
                className="ml-1 text-muted2 opacity-0 transition group-hover:opacity-100 hover:text-danger"
                title="Remover modelo"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
          <div className="inline-flex items-center gap-1.5">
            <input
              value={newModelName}
              onChange={(e) => setNewModelName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && createModel()}
              placeholder="Nova modelo…"
              className="h-7 rounded-md border border-border2 bg-bg3 px-2 text-xs outline-none focus:border-accent"
            />
            <div className="flex items-center gap-1">
              {MODEL_COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => setNewModelColor(c)}
                  className="h-4 w-4 rounded-full border-2 transition"
                  style={{
                    background: c,
                    borderColor: newModelColor === c ? "var(--foreground)" : "transparent",
                  }}
                />
              ))}
            </div>
            <button
              onClick={createModel}
              disabled={!newModelName.trim()}
              className="inline-flex items-center gap-1 rounded-md bg-accent px-2 py-1 text-[11px] font-semibold text-primary-foreground disabled:opacity-50"
            >
              <Plus className="h-3 w-3" /> Criar
            </button>
          </div>
        </div>
      </section>

      {/* ============ Tabs ============ */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-border">
        <div className="flex">
          {(
            [
              { id: "active" as Role, label: "Ativas", count: activeCount, dot: "●" },
              { id: "reserve" as Role, label: "Reservas", count: reserveCount, dot: "◎" },
            ]
          ).map((t) => {
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={[
                  "relative -mb-px flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors",
                  active ? "text-foreground" : "text-muted2 hover:text-text2",
                ].join(" ")}
              >
                <span style={{ color: active ? "var(--accent2)" : undefined }}>{t.dot}</span>
                {t.label}
                <span
                  className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums"
                  style={{
                    background: active
                      ? "color-mix(in oklab, var(--accent2) 22%, transparent)"
                      : "var(--bg3)",
                    color: active ? "var(--accent2)" : "var(--text2)",
                  }}
                >
                  {t.count}
                </span>
                {active && (
                  <span
                    className="absolute inset-x-0 -bottom-px h-0.5"
                    style={{ background: "var(--accent2)" }}
                  />
                )}
              </button>
            );
          })}
        </div>

        {/* View toggle */}
        <div className="inline-flex rounded-lg border border-border bg-bg2 p-0.5">
          <button
            onClick={() => setView("list")}
            className={[
              "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
              view === "list" ? "bg-bg3 text-foreground" : "text-muted2 hover:text-text2",
            ].join(" ")}
          >
            <List className="h-3.5 w-3.5" /> Lista
          </button>
          <button
            onClick={() => setView("grid")}
            className={[
              "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
              view === "grid" ? "bg-bg3 text-foreground" : "text-muted2 hover:text-text2",
            ].join(" ")}
          >
            <LayoutGrid className="h-3.5 w-3.5" /> Grid
          </button>
        </div>
      </div>

      {/* ============ Filters ============ */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <label className="relative block min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted2" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar @username ou nome..."
            className="h-9 w-full rounded-lg border border-border bg-bg3 pl-9 pr-9 text-sm outline-none focus:border-accent"
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted2 hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </label>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border2 bg-bg3 px-3 text-xs text-text2 hover:border-accent hover:text-foreground">
              <ShieldCheck className="h-3.5 w-3.5" /> {HEALTH_LABELS[healthFilter]}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            {(Object.keys(HEALTH_LABELS) as HealthFilter[]).map((k) => (
              <DropdownMenuItem key={k} onSelect={() => setHealthFilter(k)}>
                {HEALTH_LABELS[k]}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border2 bg-bg3 px-3 text-xs text-text2 hover:border-accent hover:text-foreground">
              <ListChecks className="h-3.5 w-3.5" /> Ordenar: {SORT_LABELS[sortKey]}
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

      {/* ============ Bulk toolbar ============ */}
      {selected.size >= 2 && (
        <div className="sticky top-3 z-20 mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-accent/40 bg-bg3 px-3 py-2 text-sm shadow-lg">
          <span className="font-semibold tabular-nums">{selected.size} contas selecionadas</span>
          {tab === "active" ? (
            <button
              onClick={bulkMoveToReserve}
              className="inline-flex items-center gap-1.5 rounded-md border border-border2 bg-bg2 px-2.5 py-1.5 text-xs hover:border-accent"
            >
              <ArrowRightLeft className="h-3.5 w-3.5" /> Mover para Reservas
            </button>
          ) : (
            <button
              onClick={bulkActivate}
              className="inline-flex items-center gap-1.5 rounded-md border border-border2 bg-bg2 px-2.5 py-1.5 text-xs hover:border-accent"
            >
              <Power className="h-3.5 w-3.5" /> Ativar
            </button>
          )}
          <button
            onClick={bulkRefresh}
            className="inline-flex items-center gap-1.5 rounded-md border border-border2 bg-bg2 px-2.5 py-1.5 text-xs hover:border-accent"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Atualizar saúde
          </button>
          <button
            onClick={bulkDisconnect}
            className="inline-flex items-center gap-1.5 rounded-md border border-danger/35 bg-danger/10 px-2.5 py-1.5 text-xs text-danger hover:border-danger"
          >
            <Trash2 className="h-3.5 w-3.5" /> Desconectar
          </button>
          <button
            onClick={clearSelection}
            className="ml-auto inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs text-text2 hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" /> Limpar
          </button>
        </div>
      )}

      {/* ============ Content ============ */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20 text-text2">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex min-h-[240px] flex-col items-center justify-center rounded-xl border border-border bg-bg2 p-10 text-center text-sm text-text2">
          <Users className="mb-2 h-7 w-7 text-muted2" />
          {query || healthFilter !== "all"
            ? "Nenhuma conta encontrada com esses filtros."
            : tab === "active"
              ? "Nenhuma conta ativa. Conecte ou mova de Reservas."
              : "Nenhuma conta em reserva."}
        </div>
      ) : view === "list" ? (
        <ListView
          items={filtered}
          selected={selected}
          onToggleSelect={toggleSelect}
          tab={tab}
          now={now}
          confirmMove={confirmMove}
          setConfirmMove={setConfirmMove}
          onMove={(id, role) => {
            setRole(id, role);
            toast.success(`Conta movida para ${role === "reserve" ? "Reservas" : "Ativas"}`);
          }}
          onTogglePaused={togglePaused}
          onValidate={validateOne}
          onReconnect={(a) => handleConnect(a.provider ?? "facebook")}
          onRemove={removeAccount}
          onStatus={openStatus}
        />
      ) : (
        <GridView
          items={filtered}
          selected={selected}
          onToggleSelect={toggleSelect}
          tab={tab}
          confirmMove={confirmMove}
          setConfirmMove={setConfirmMove}
          onMove={(id, role) => {
            setRole(id, role);
            toast.success(`Conta movida para ${role === "reserve" ? "Reservas" : "Ativas"}`);
          }}
          onValidate={validateOne}
          onReconnect={(a) => handleConnect(a.provider ?? "facebook")}
          onRemove={removeAccount}
          onTogglePaused={togglePaused}
          onStatus={openStatus}
        />
      )}

      <style>{`
        @keyframes accFadeIn {
          from { opacity: 0; transform: translateY(4px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .acc-row, .acc-card { animation: accFadeIn 250ms ease both; }
      `}</style>

      <Dialog open={!!statusDialog} onOpenChange={(o) => !o && setStatusDialog(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Activity className="h-4 w-4" />
              Status · @{statusDialog?.account.username}
            </DialogTitle>
            <DialogDescription>
              Verificação de saúde da conta Instagram (token, permissões e cota).
            </DialogDescription>
          </DialogHeader>
          {statusDialog?.loading && (
            <div className="flex items-center gap-2 py-6 text-sm text-text2">
              <Loader2 className="h-4 w-4 animate-spin" /> Verificando conta…
            </div>
          )}
          {statusDialog?.error && (
            <div className="rounded-md border border-danger/40 bg-danger/10 p-3 text-sm text-danger">
              {statusDialog.error}
            </div>
          )}
          {statusDialog?.report && (
            <div className="space-y-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge status={statusDialog.report.status} />
                <span className="text-xs text-text2">
                  Saúde: <span className="tabular-nums font-semibold text-foreground">{statusDialog.report.health_score}</span>
                </span>
                <span className="text-xs text-text2">
                  {statusDialog.report.can_publish ? "Pode publicar ✓" : "Publicação bloqueada ✗"}
                </span>
              </div>

              {statusDialog.report.quota && (
                <div className="rounded-lg border border-border bg-bg3 p-3">
                  <div className="mb-1 flex items-center justify-between text-xs text-text2">
                    <span>Cota de publicação (janela 24h)</span>
                    <span className="tabular-nums">
                      {statusDialog.report.quota.used}/{statusDialog.report.quota.total}
                    </span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded bg-bg">
                    <div
                      className="h-full bg-accent2"
                      style={{
                        width: `${Math.min(100, (statusDialog.report.quota.used / Math.max(1, statusDialog.report.quota.total)) * 100)}%`,
                      }}
                    />
                  </div>
                </div>
              )}

              {statusDialog.report.restrictions.length > 0 && (
                <div>
                  <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted2">
                    Restrições
                  </div>
                  <ul className="list-disc space-y-1 pl-5 text-xs text-text2">
                    {statusDialog.report.restrictions.map((r, i) => (
                      <li key={i}>{r}</li>
                    ))}
                  </ul>
                </div>
              )}

              {statusDialog.report.suggestions.length > 0 && (
                <div>
                  <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted2">
                    Sugestões
                  </div>
                  <ul className="list-disc space-y-1 pl-5 text-xs text-text2">
                    {statusDialog.report.suggestions.map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="grid grid-cols-2 gap-2 text-[11px] text-text2">
                <div className="rounded border border-border bg-bg3 p-2">
                  <div className="font-semibold text-foreground">/media</div>
                  <div>{statusDialog.report.checks.media.ok ? "OK" : statusDialog.report.checks.media.error ?? "Falhou"}</div>
                </div>
                <div className="rounded border border-border bg-bg3 p-2">
                  <div className="font-semibold text-foreground">/content_publishing_limit</div>
                  <div>{statusDialog.report.checks.publishing_limit.ok ? "OK" : statusDialog.report.checks.publishing_limit.error ?? "Falhou"}</div>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// -------------- List view --------------
type RowHandlers = {
  items: Account[];
  selected: Set<string>;
  onToggleSelect: (id: string) => void;
  tab: Role;
  now: number;
  confirmMove: string | null;
  setConfirmMove: (id: string | null) => void;
  onMove: (id: string, role: Role) => void;
  onTogglePaused: (id: string, value?: boolean) => void;
  onValidate: (a: Account) => void;
  onReconnect: (a: Account) => void;
  onRemove: (a: Account) => void;
  onStatus: (a: Account) => void;
};

function ListView({
  items,
  selected,
  onToggleSelect,
  tab,
  now,
  confirmMove,
  setConfirmMove,
  onMove,
  onTogglePaused,
  onValidate,
  onReconnect,
  onRemove,
  onStatus,
}: RowHandlers) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-bg2">
      {items.map((a, i) => {
        const token = tokenInfo(a);
        const posts = a.posts ?? 0;
        const isSelected = selected.has(a.id);
        const isConfirming = confirmMove === a.id;
        return (
          <div
            key={a.id}
            className="acc-row group relative flex h-14 items-center gap-3 border-b border-border px-3 transition-colors last:border-b-0 hover:bg-bg3"
            style={{
              animationDelay: `${Math.min(i, 20) * 30}ms`,
              background: i % 2 === 1 ? "rgba(255,255,255,0.04)" : undefined,
            }}
          >
            <input
              type="checkbox"
              checked={isSelected}
              onChange={() => onToggleSelect(a.id)}
              className="shrink-0 accent-accent"
            />
            <img
              src={a.profile_picture}
              alt=""
              className="h-9 w-9 shrink-0 rounded-full bg-bg3"
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="truncate text-sm font-semibold">@{a.username}</span>
                {a.paused && (
                  <span className="rounded-full border border-muted/40 bg-muted/10 px-1.5 py-0.5 text-[10px] font-semibold text-text2">
                    Pausada
                  </span>
                )}
                {token.expired && (
                  <span className="rounded-full border border-danger/40 bg-danger/10 px-1.5 py-0.5 text-[10px] font-semibold text-danger">
                    Token expirado
                  </span>
                )}
              </div>
              <p className="truncate text-[11px] text-muted2">{a.name}</p>
            </div>

            <HealthBadge score={a.health_score} size={28} />
            <StatusBadge status={token.expired ? "token_expired" : a.health_score < 40 ? "restricted" : a.health_score < 70 ? "limited" : "healthy"} />

            <div className="hidden w-20 shrink-0 items-center gap-1 text-xs text-text2 md:flex">
              <Users className="h-3.5 w-3.5" />
              <span className="tabular-nums">{compact(a.followers)}</span>
            </div>

            <TooltipProvider delayDuration={150}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="hidden w-16 shrink-0 items-center gap-1 text-xs text-text2 md:flex">
                    <ImageIcon className="h-3.5 w-3.5" />
                    <span className="tabular-nums">{posts}</span>
                  </div>
                </TooltipTrigger>
                <TooltipContent className="text-xs">{posts} posts</TooltipContent>
              </Tooltip>
            </TooltipProvider>

            <TooltipProvider delayDuration={150}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="hidden w-20 shrink-0 items-center gap-1 text-xs text-text2 lg:flex">
                    <Clock className="h-3.5 w-3.5" />
                    <span className="tabular-nums">
                      {a.last_post_at ? relTime(a.last_post_at, now) : "—"}
                    </span>
                  </div>
                </TooltipTrigger>
                {a.last_post_at && (
                  <TooltipContent className="text-xs">
                    {absDateTime(a.last_post_at)}
                  </TooltipContent>
                )}
              </Tooltip>
            </TooltipProvider>

            <Link
              to="/queue"
              className="hidden shrink-0 rounded-md border border-border2 bg-bg2 px-2 py-1 text-[11px] font-medium text-text2 opacity-0 hover:border-accent hover:text-foreground group-hover:opacity-100 sm:inline-flex"
            >
              Ver fila
            </Link>

            {isConfirming ? (
              <div className="flex items-center gap-1">
                <span className="hidden text-[11px] text-text2 sm:inline">
                  Mover @{a.username} para {tab === "active" ? "Reservas" : "Ativas"}?
                </span>
                <button
                  onClick={() => {
                    onMove(a.id, tab === "active" ? "reserve" : "active");
                    setConfirmMove(null);
                  }}
                  className="inline-flex items-center gap-1 rounded-md bg-accent px-2 py-1 text-[11px] font-semibold text-primary-foreground"
                >
                  <Check className="h-3 w-3" /> Confirmar
                </button>
                <button
                  onClick={() => setConfirmMove(null)}
                  className="inline-flex items-center gap-1 rounded-md border border-border2 bg-bg2 px-2 py-1 text-[11px] text-text2"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ) : (
              <AccountMenu
                a={a}
                tab={tab}
                onAskMove={() => setConfirmMove(a.id)}
                onValidate={() => onValidate(a)}
                onReconnect={() => onReconnect(a)}
                onTogglePaused={() => onTogglePaused(a.id)}
                onRemove={() => onRemove(a)}
                onStatus={() => onStatus(a)}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// -------------- Grid view --------------
function GridView({
  items,
  selected,
  onToggleSelect,
  tab,
  confirmMove,
  setConfirmMove,
  onMove,
  onValidate,
  onReconnect,
  onRemove,
  onTogglePaused,
  onStatus,
}: Omit<RowHandlers, "now">) {
  return (
    <div
      className="grid gap-3"
      style={{ gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))" }}
    >
      {items.map((a, i) => {
        const color = ringForHealth(a.health_score);
        const isSelected = selected.has(a.id);
        const isConfirming = confirmMove === a.id;
        return (
          <div
            key={a.id}
            className="acc-card group relative flex h-[140px] flex-col gap-2 rounded-xl border bg-bg2 p-3.5 transition-all hover:-translate-y-0.5"
            style={{
              borderColor: color,
              animationDelay: `${Math.min(i, 20) * 30}ms`,
            }}
          >
            <div className="flex items-start gap-2">
              <input
                type="checkbox"
                checked={isSelected}
                onChange={() => onToggleSelect(a.id)}
                className="mt-1 accent-accent"
              />
              <img
                src={a.profile_picture}
                alt=""
                className="h-12 w-12 shrink-0 rounded-full bg-bg3"
              />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold">@{a.username}</div>
                <div className="truncate text-[11px] text-muted2">
                  {compact(a.followers)} seg.
                </div>
              </div>
              <HealthBadge score={a.health_score} size={32} />
              <StatusBadge status={(a.token_status === "expired") ? "token_expired" : a.health_score < 40 ? "restricted" : a.health_score < 70 ? "limited" : "healthy"} />
            </div>

            <div className="mt-auto flex items-center justify-between gap-1.5">
              {a.paused && (
                <span className="rounded-full border border-muted/40 bg-muted/10 px-1.5 py-0.5 text-[10px] font-semibold text-text2">
                  Pausada
                </span>
              )}
              {!isConfirming && (
                <div className="ml-auto flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                  <Link
                    to="/queue"
                    className="rounded-md border border-border2 bg-bg2 px-1.5 py-1 text-[10px] font-medium text-text2 hover:border-accent hover:text-foreground"
                  >
                    Fila
                  </Link>
                  <button
                    onClick={() => setConfirmMove(a.id)}
                    className="rounded-md border border-border2 bg-bg2 px-1.5 py-1 text-[10px] font-medium text-text2 hover:border-accent hover:text-foreground"
                  >
                    {tab === "active" ? "Desativar" : "Ativar"}
                  </button>
                  <AccountMenu
                    a={a}
                    tab={tab}
                    compact
                    onAskMove={() => setConfirmMove(a.id)}
                    onValidate={() => onValidate(a)}
                    onReconnect={() => onReconnect(a)}
                    onTogglePaused={() => onTogglePaused(a.id)}
                    onRemove={() => onRemove(a)}
                    onStatus={() => onStatus(a)}
                  />
                </div>
              )}
            </div>

            {isConfirming && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-xl bg-bg2/95 p-3 text-center backdrop-blur">
                <p className="text-xs">
                  Mover <span className="font-semibold">@{a.username}</span> para{" "}
                  {tab === "active" ? "Reservas" : "Ativas"}?
                </p>
                <div className="flex gap-1.5">
                  <button
                    onClick={() => {
                      onMove(a.id, tab === "active" ? "reserve" : "active");
                      setConfirmMove(null);
                    }}
                    className="inline-flex items-center gap-1 rounded-md bg-accent px-2.5 py-1 text-[11px] font-semibold text-primary-foreground"
                  >
                    <Check className="h-3 w-3" /> Confirmar
                  </button>
                  <button
                    onClick={() => setConfirmMove(null)}
                    className="inline-flex items-center gap-1 rounded-md border border-border2 bg-bg2 px-2.5 py-1 text-[11px] text-text2"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// -------------- Account menu (shared) --------------
function AccountMenu({
  a,
  tab,
  compact = false,
  onAskMove,
  onValidate,
  onReconnect,
  onTogglePaused,
  onRemove,
  onStatus,
}: {
  a: Account;
  tab: Role;
  compact?: boolean;
  onAskMove: () => void;
  onValidate: () => void;
  onReconnect: () => void;
  onTogglePaused: () => void;
  onRemove: () => void;
  onStatus: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className={`shrink-0 rounded-md ${compact ? "p-1" : "p-1.5"} text-text2 hover:bg-bg3 hover:text-foreground`}
          aria-label="Menu"
        >
          <MoreHorizontal className={compact ? "h-3.5 w-3.5" : "h-4 w-4"} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuItem onSelect={onAskMove}>
          {tab === "active" ? (
            <>
              <ArrowRightLeft className="mr-2 h-4 w-4" /> Mover para Reservas
            </>
          ) : (
            <>
              <ArrowLeftToLine className="mr-2 h-4 w-4" /> Ativar conta
            </>
          )}
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={(e) => {
            e.preventDefault();
            onTogglePaused();
          }}
        >
          <Pause className="mr-2 h-4 w-4" /> {a.paused ? "Retomar conta" : "Pausar conta"}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to="/history" className="cursor-pointer">
            <History className="mr-2 h-4 w-4" /> Ver histórico
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link to="/queue" className="cursor-pointer">
            <ListChecks className="mr-2 h-4 w-4" /> Ver fila
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={(e) => {
            e.preventDefault();
            onStatus();
          }}
        >
          <Activity className="mr-2 h-4 w-4" /> Ver Status
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={(e) => {
            e.preventDefault();
            onValidate();
          }}
        >
          <BadgeCheck className="mr-2 h-4 w-4" /> Forçar atualização de métricas
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={(e) => {
            e.preventDefault();
            onReconnect();
          }}
        >
          <RefreshCw className="mr-2 h-4 w-4" /> Reconectar via{" "}
          {(a.provider ?? "facebook") === "facebook" ? "Facebook" : "Instagram"}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="text-danger focus:text-danger"
          onSelect={(e) => {
            e.preventDefault();
            onRemove();
          }}
        >
          <Trash2 className="mr-2 h-4 w-4" /> Remover conta
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
