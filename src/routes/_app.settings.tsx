import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Plus,
  MoreHorizontal,
  Eye,
  EyeOff,
  Layers,
  Power,
  Trash2,
  Pencil,
  Shuffle,
  Settings as SettingsIcon,
  Server,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { api, type MetaApp } from "@/lib/api-client";

export const Route = createFileRoute("/_app/settings")({
  component: SettingsPage,
  head: () => ({ meta: [{ title: "Configurações · Insta Manager" }] }),
});

type Tab = "apps" | "general";

function SettingsPage() {
  const [tab, setTab] = useState<Tab>("apps");

  return (
    <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6 sm:py-7 md:px-10 md:py-8">
      <header className="mb-6">
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted2">
          Configurações
        </p>
        <h1 className="mt-2 text-2xl sm:text-3xl font-semibold tracking-tight">
          Configurações
        </h1>
      </header>

      <div className="im-card overflow-hidden">
        <nav className="flex border-b border-border bg-bg2">
          {(
            [
              { id: "apps", label: "Apps Meta", icon: Layers },
              { id: "general", label: "Geral", icon: SettingsIcon },
            ] as const
          ).map(({ id, label, icon: Icon }) => {
            const active = tab === id;
            return (
              <button
                key={id}
                onClick={() => setTab(id)}
                className={[
                  "relative inline-flex shrink-0 items-center gap-2 whitespace-nowrap px-5 py-3.5 text-sm transition-colors",
                  active ? "text-foreground" : "text-text2 hover:text-foreground",
                ].join(" ")}
              >
                <Icon className="h-4 w-4" />
                {label}
                <span
                  className="pointer-events-none absolute inset-x-3 -bottom-px h-[2px] rounded-full transition-all"
                  style={{
                    background: "var(--accent2)",
                    transform: active ? "scaleX(1)" : "scaleX(0)",
                    transformOrigin: "left",
                  }}
                />
              </button>
            );
          })}
        </nav>

        <div className="p-4 sm:p-6">
          {tab === "apps" && <AppsMetaTab />}
          {tab === "general" && (
            <div className="grid place-items-center py-16 text-sm text-muted2">
              Em breve.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================ Apps Meta tab ============================

function AppsMetaTab() {
  const qc = useQueryClient();
  const { data: apps = [], isLoading } = useQuery({
    queryKey: ["meta-apps"],
    queryFn: () => api.listMetaApps(),
  });

  const totalAccounts = useMemo(
    () => apps.reduce((s, a) => s + a.account_count, 0),
    [apps],
  );

  const [editing, setEditing] = useState<MetaApp | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [confirmRedistribute, setConfirmRedistribute] = useState(false);

  async function toggleActive(app: MetaApp) {
    const r = await api.updateMetaApp(app.id, { is_active: app.is_active === 1 ? 0 : 1 });
    if (!r) return toast.error("Falha ao atualizar status do app");
    toast.success(app.is_active === 1 ? "App desativado" : "App ativado");
    qc.invalidateQueries({ queryKey: ["meta-apps"] });
    qc.invalidateQueries({ queryKey: ["accounts"] });
  }

  async function removeApp(app: MetaApp) {
    if (!confirm(`Remover o app "${app.name}"?`)) return;
    const r = await api.deleteMetaApp(app.id);
    if (!r.ok) {
      toast.error(r.error || "Falha ao remover app");
      return;
    }
    toast.success("App removido");
    qc.invalidateQueries({ queryKey: ["meta-apps"] });
    qc.invalidateQueries({ queryKey: ["accounts"] });
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Apps Meta</h2>
          <p className="mt-1 text-sm text-text2">
            Gerencie os apps Meta conectados. Contas são distribuídas
            automaticamente para balancear os rate limits.
          </p>
        </div>
        <button
          onClick={() => {
            setEditing(null);
            setShowForm(true);
          }}
          className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3.5 py-2 text-sm font-semibold text-primary-foreground im-glow"
        >
          <Plus className="h-4 w-4" /> Adicionar App
        </button>
      </div>

      {isLoading ? (
        <div className="grid place-items-center py-12 text-sm text-muted2">
          Carregando...
        </div>
      ) : apps.length === 0 ? (
        <EmptyState onAdd={() => setShowForm(true)} />
      ) : (
        <>
          <div className="grid gap-3 md:grid-cols-2">
            {apps.map((app) => (
              <AppCard
                key={app.id}
                app={app}
                totalAccounts={totalAccounts}
                onEdit={() => {
                  setEditing(app);
                  setShowForm(true);
                }}
                onToggle={() => toggleActive(app)}
                onRemove={() => removeApp(app)}
              />
            ))}
          </div>

          {apps.length > 1 && (
            <div className="flex justify-end">
              <button
                onClick={() => setConfirmRedistribute(true)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border2 bg-bg3 px-3.5 py-2 text-sm font-medium text-foreground hover:border-accent"
              >
                <Shuffle className="h-4 w-4" /> Redistribuir todas as contas
              </button>
            </div>
          )}
        </>
      )}

      {showForm && (
        <AppFormDialog
          app={editing}
          onClose={() => setShowForm(false)}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ["meta-apps"] });
            setShowForm(false);
          }}
        />
      )}

      {confirmRedistribute && (
        <RedistributeDialog onClose={() => setConfirmRedistribute(false)} />
      )}
    </div>
  );
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border2 bg-bg3/40 px-6 py-14 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-bg3">
        <Server className="h-5 w-5 text-text2" />
      </div>
      <h3 className="mt-4 text-base font-semibold">Nenhum app cadastrado</h3>
      <p className="mt-1 max-w-md text-sm text-text2">
        Sem apps cadastrados, o sistema usa as credenciais do ambiente (.env).
        Adicione apps para distribuir as contas e aumentar os limites de
        publicação.
      </p>
      <button
        onClick={onAdd}
        className="mt-5 inline-flex items-center gap-1.5 rounded-lg bg-accent px-3.5 py-2 text-sm font-semibold text-primary-foreground"
      >
        <Plus className="h-4 w-4" /> Adicionar App
      </button>
    </div>
  );
}

function AppCard({
  app,
  totalAccounts,
  onEdit,
  onToggle,
  onRemove,
}: {
  app: MetaApp;
  totalAccounts: number;
  onEdit: () => void;
  onToggle: () => void;
  onRemove: () => void;
}) {
  const pct = totalAccounts > 0 ? (app.account_count / totalAccounts) * 100 : 0;
  const active = app.is_active === 1;

  return (
    <div className="rounded-xl border border-border bg-bg2 p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-sm font-semibold">{app.name}</h3>
            <span
              className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
              style={
                active
                  ? {
                      background: "color-mix(in oklab, var(--success) 15%, transparent)",
                      color: "var(--success)",
                      border: "1px solid color-mix(in oklab, var(--success) 30%, transparent)",
                    }
                  : {
                      background: "color-mix(in oklab, var(--muted2) 15%, transparent)",
                      color: "var(--muted2)",
                      border: "1px solid color-mix(in oklab, var(--muted2) 30%, transparent)",
                    }
              }
            >
              {active ? "Ativo" : "Inativo"}
            </span>
            <span className="rounded-full border border-border2 bg-bg3 px-2 py-0.5 text-[10px] font-medium text-text2 capitalize">
              {app.provider}
            </span>
          </div>
          <div className="mt-1 font-mono text-[11px] text-text2">
            {app.client_id_masked}
          </div>
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
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem onSelect={(e) => { e.preventDefault(); onEdit(); }}>
              <Pencil className="mr-2 h-4 w-4" /> Editar
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={(e) => { e.preventDefault(); onToggle(); }}>
              <Power className="mr-2 h-4 w-4" /> {active ? "Desativar" : "Ativar"}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-danger focus:text-danger"
              onSelect={(e) => { e.preventDefault(); onRemove(); }}
            >
              <Trash2 className="mr-2 h-4 w-4" /> Deletar
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="mt-4 flex items-center justify-between text-xs">
        <Link to="/accounts" className="text-text2 hover:text-foreground">
          {app.account_count} conta{app.account_count === 1 ? "" : "s"}
        </Link>
        <span className="tabular-nums text-muted2">{pct.toFixed(0)}%</span>
      </div>
      <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-bg3">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${pct}%`, background: "var(--accent2)" }}
        />
      </div>

      {app.notes && (
        <p className="mt-3 text-[11px] italic text-muted2">{app.notes}</p>
      )}
    </div>
  );
}

// ============================ Form Dialog ============================

function AppFormDialog({
  app,
  onClose,
  onSaved,
}: {
  app: MetaApp | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const editing = !!app;
  const [name, setName] = useState(app?.name ?? "");
  const [provider, setProvider] = useState<"facebook" | "instagram">(
    app?.provider ?? "instagram",
  );
  const [clientId, setClientId] = useState(editing ? app!.client_id_masked : "");
  const [clientSecret, setClientSecret] = useState("");
  const [showSecret, setShowSecret] = useState(false);
  const [notes, setNotes] = useState(app?.notes ?? "");
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!name.trim()) return toast.error("Nome é obrigatório");
    if (!editing && !clientId.trim()) return toast.error("App ID é obrigatório");
    if (!editing && !clientSecret.trim()) return toast.error("App Secret é obrigatório");
    setSaving(true);
    try {
      if (editing) {
        const body: { name?: string; client_secret?: string; notes?: string } = {
          name: name.trim(),
          notes: notes.trim() || undefined,
        };
        if (clientSecret.trim()) body.client_secret = clientSecret.trim();
        const r = await api.updateMetaApp(app!.id, body);
        if (!r) throw new Error("Falha ao atualizar");
        toast.success("App atualizado");
      } else {
        await api.createMetaApp({
          name: name.trim(),
          client_id: clientId.trim(),
          client_secret: clientSecret.trim(),
          provider,
          notes: notes.trim() || undefined,
        });
        toast.success("App criado");
      }
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? "Editar app" : "Adicionar app"}</DialogTitle>
          <DialogDescription>
            {editing
              ? "Atualize as credenciais do app Meta. Deixe o secret vazio para mantê-lo."
              : "Cadastre um novo app Meta para receber contas."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <label className="block">
            <span className="text-xs font-medium text-text2">Nome</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 w-full rounded-md border border-border2 bg-bg3 px-3 py-2 text-sm text-foreground outline-none focus:border-accent"
              placeholder="Ex: App principal"
            />
          </label>

          <label className="block">
            <span className="text-xs font-medium text-text2">Provider</span>
            <select
              value={provider}
              onChange={(e) => setProvider(e.target.value as "facebook" | "instagram")}
              disabled={editing}
              className="mt-1 w-full rounded-md border border-border2 bg-bg3 px-3 py-2 text-sm text-foreground outline-none focus:border-accent disabled:opacity-60"
            >
              <option value="instagram">Instagram</option>
              <option value="facebook">Facebook</option>
            </select>
          </label>

          <label className="block">
            <span className="text-xs font-medium text-text2">App ID</span>
            <input
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              disabled={editing}
              className="mt-1 w-full rounded-md border border-border2 bg-bg3 px-3 py-2 font-mono text-sm text-foreground outline-none focus:border-accent disabled:opacity-60"
              placeholder="Ex: 1234567890123456"
            />
          </label>

          <label className="block">
            <span className="text-xs font-medium text-text2">
              App Secret {editing && <span className="text-muted2">(opcional)</span>}
            </span>
            <div className="relative mt-1">
              <input
                type={showSecret ? "text" : "password"}
                value={clientSecret}
                onChange={(e) => setClientSecret(e.target.value)}
                className="w-full rounded-md border border-border2 bg-bg3 px-3 py-2 pr-9 font-mono text-sm text-foreground outline-none focus:border-accent"
                placeholder={editing ? "Deixe vazio para não alterar" : "App secret"}
              />
              <button
                type="button"
                onClick={() => setShowSecret((s) => !s)}
                className="absolute inset-y-0 right-0 flex items-center px-2 text-text2 hover:text-foreground"
                aria-label={showSecret ? "Ocultar" : "Mostrar"}
              >
                {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </label>

          <label className="block">
            <span className="text-xs font-medium text-text2">Notas</span>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="mt-1 w-full resize-none rounded-md border border-border2 bg-bg3 px-3 py-2 text-sm text-foreground outline-none focus:border-accent"
              placeholder="Anotações internas (opcional)"
            />
          </label>
        </div>

        <DialogFooter>
          <button
            onClick={onClose}
            className="rounded-md border border-border2 bg-bg3 px-3.5 py-2 text-sm text-text2 hover:text-foreground"
          >
            Cancelar
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="rounded-md bg-accent px-3.5 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
          >
            {saving ? "Salvando..." : "Salvar"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================ Redistribute Dialog ============================

function RedistributeDialog({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const { data: preview, isLoading } = useQuery({
    queryKey: ["meta-apps", "preview-redistribute"],
    queryFn: () => api.previewRedistributeApps(),
    staleTime: 0,
  });
  const [running, setRunning] = useState(false);

  const moved = useMemo(() => {
    if (!preview) return 0;
    return preview.reduce(
      (s, r) => s + Math.max(0, r.projected_count - r.current_count),
      0,
    );
  }, [preview]);

  async function confirm() {
    setRunning(true);
    const r = await api.redistributeApps();
    setRunning(false);
    if (!r) {
      toast.error("Falha ao redistribuir");
      return;
    }
    toast.success(`${r.moved} conta(s) movidas`);
    qc.invalidateQueries({ queryKey: ["meta-apps"] });
    qc.invalidateQueries({ queryKey: ["accounts"] });
    onClose();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Redistribuir contas</DialogTitle>
          <DialogDescription>
            Confirme a redistribuição abaixo. Apenas apps ativos recebem contas.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="py-6 text-center text-sm text-muted2">Calculando...</div>
        ) : !preview || preview.length === 0 ? (
          <div className="py-6 text-center text-sm text-muted2">Sem dados.</div>
        ) : (
          <div className="overflow-hidden rounded-md border border-border">
            <table className="w-full text-sm">
              <thead className="bg-bg3 text-xs text-text2">
                <tr>
                  <th className="px-3 py-2 text-left">App</th>
                  <th className="px-3 py-2 text-right">Atual</th>
                  <th className="px-3 py-2 text-right">Após</th>
                </tr>
              </thead>
              <tbody>
                {preview.map((r) => (
                  <tr key={r.app_id} className="border-t border-border">
                    <td className="px-3 py-2">{r.app_name}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-text2">
                      {r.current_count}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums font-semibold">
                      {r.projected_count}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-border bg-bg3 text-xs">
                  <td colSpan={3} className="px-3 py-2 text-right text-text2">
                    {moved} conta(s) serão movidas
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        <DialogFooter>
          <button
            onClick={onClose}
            className="rounded-md border border-border2 bg-bg3 px-3.5 py-2 text-sm text-text2 hover:text-foreground"
          >
            Cancelar
          </button>
          <button
            onClick={confirm}
            disabled={running || !preview?.length}
            className="rounded-md bg-accent px-3.5 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
          >
            {running ? "Redistribuindo..." : "Confirmar redistribuição"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
