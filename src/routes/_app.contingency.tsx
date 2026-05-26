import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Plus, CheckSquare, FileUp, HardDrive, Save, FileDown, Search,
  Copy, Eye, EyeOff, Trash2, ArrowRightLeft, ChevronDown, X,
} from "lucide-react";
import { toast } from "sonner";
import {
  type ContingencyAccount, type ContingencyStatus, type ContingencyQuality,
  STATUS_META, QUALITY_META,
  loadContingency, saveContingency, newAccount, toCSV, fromCSV,
  fetchFromServer, pushOne, deleteOne, replaceAllOnServer,
} from "@/lib/contingency-store";
import { generateTOTP, totpSecondsRemaining } from "@/lib/totp";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

export const Route = createFileRoute("/_app/contingency")({
  component: ContingencyPage,
  head: () => ({ meta: [{ title: "Contingência · Insta Manager" }] }),
});

// ---- Hook: estado sincronizado com localStorage ----
function useContingency() {
  const [list, setList] = useState<ContingencyAccount[]>([]);
  useEffect(() => {
    const local = loadContingency();
    setList(local);
    // tenta hidratar do servidor (sem apagar o cache local se vier vazio/indisponível)
    fetchFromServer().then((res) => {
      if (!res) return; // servidor indisponível → mantém cache local
      if (res.items.length === 0 && local.length > 0) {
        // servidor vazio mas temos cache local → empurra local pro servidor
        replaceAllOnServer(local);
        return;
      }
      if (res.items.length > 0) {
        setList(res.items);
        saveContingency(res.items);
      }
    });
    const onChange = () => setList(loadContingency());
    window.addEventListener("contingency:changed", onChange);
    return () => window.removeEventListener("contingency:changed", onChange);
  }, []);
  const update = useCallback((updater: (prev: ContingencyAccount[]) => ContingencyAccount[]) => {
    setList((prev) => {
      const next = updater(prev);
      saveContingency(next);
      return next;
    });
  }, []);
  return [list, update] as const;
}

// ---- TOTP cell ----
function TotpCell({ secret }: { secret: string }) {
  const [code, setCode] = useState("------");
  const [left, setLeft] = useState(30);
  useEffect(() => {
    let mounted = true;
    const tick = async () => {
      const c = await generateTOTP(secret);
      if (mounted) {
        setCode(c);
        setLeft(totpSecondsRemaining(30));
      }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => { mounted = false; clearInterval(id); };
  }, [secret]);
  const pct = (left / 30) * 100;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5">
        <div className="flex-1 rounded-md border border-border bg-bg3 px-2 py-1.5 font-mono text-xs tracking-widest text-muted2">
          ••••••••••••••••••••
        </div>
        <button
          type="button"
          onClick={() => { navigator.clipboard.writeText(secret); toast.success("Secret copiado"); }}
          className="rounded-md border border-border bg-bg3 px-2 py-1.5 text-[11px] hover:border-border2"
          title="Copiar secret"
        ><Copy className="h-3 w-3" /></button>
      </div>
      <div className="flex items-center gap-2">
        <span className="font-mono text-sm tabular-nums">
          {code.slice(0, 3)} {code.slice(3)}
        </span>
        <div className="h-1 flex-1 overflow-hidden rounded-full bg-bg3">
          <div className="h-full transition-all" style={{ width: `${pct}%`, background: left > 5 ? "var(--accent2)" : "var(--danger)" }} />
        </div>
        <span className="w-6 text-right text-[10px] tabular-nums text-muted2">{left}s</span>
        <button
          type="button"
          onClick={() => { navigator.clipboard.writeText(code); toast.success("Código TOTP copiado"); }}
          className="rounded-md border border-border bg-bg3 p-1 hover:border-border2"
          title="Copiar código"
        ><Copy className="h-3 w-3" /></button>
      </div>
    </div>
  );
}

// ---- Password cell ----
function PasswordCell({
  value, onChange,
}: { value: string; onChange: (v: string) => void }) {
  const [shown, setShown] = useState(false);
  return (
    <div className="flex items-center gap-1.5">
      <input
        type={shown ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-border bg-bg3 px-2 py-1.5 text-xs font-mono"
      />
      <button
        type="button"
        onClick={() => setShown((v) => !v)}
        className="rounded-md border border-border bg-bg3 p-1.5 hover:border-border2"
      >{shown ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}</button>
      <button
        type="button"
        onClick={() => { navigator.clipboard.writeText(value); toast.success("Senha copiada"); }}
        className="inline-flex items-center gap-1 rounded-md border border-border bg-bg3 px-2 py-1.5 text-[11px] hover:border-border2"
      ><Copy className="h-3 w-3" /> Copiar</button>
    </div>
  );
}

// ---- Status pill ----
function StatusBadge({
  status, onChange,
}: { status: ContingencyStatus; onChange: (s: ContingencyStatus) => void }) {
  const meta = STATUS_META[status];
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium"
          style={{
            background: `color-mix(in oklab, ${meta.color} 18%, transparent)`,
            color: meta.color,
          }}
        >● {meta.label}<ChevronDown className="h-3 w-3" /></button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {(Object.keys(STATUS_META) as ContingencyStatus[]).map((s) => (
          <DropdownMenuItem key={s} onClick={() => onChange(s)}>
            <span className="mr-2" style={{ color: STATUS_META[s].color }}>●</span>
            {STATUS_META[s].label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function QualityBadge({
  quality, onChange,
}: { quality: ContingencyQuality; onChange: (q: ContingencyQuality) => void }) {
  const meta = QUALITY_META[quality];
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium"
          style={{
            background: `color-mix(in oklab, ${meta.color} 18%, transparent)`,
            color: meta.color,
          }}
        >● {meta.label}<ChevronDown className="h-3 w-3" /></button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {(Object.keys(QUALITY_META) as ContingencyQuality[]).map((q) => (
          <DropdownMenuItem key={q} onClick={() => onChange(q)}>
            <span className="mr-2" style={{ color: QUALITY_META[q].color }}>●</span>
            {QUALITY_META[q].label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ---- Add Account Modal ----
function AddAccountModal({
  open, onOpenChange, onSave,
}: { open: boolean; onOpenChange: (v: boolean) => void; onSave: (a: ContingencyAccount) => void }) {
  const [form, setForm] = useState(() => newAccount());
  useEffect(() => { if (open) setForm(newAccount()); }, [open]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-bg2 border-border max-w-md">
        <DialogHeader><DialogTitle>Adicionar conta de contingência</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <Field label="Username">
            <input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })}
              className="w-full rounded-md border border-border bg-bg3 px-3 py-2 text-sm" placeholder="ex: minha.conta" />
          </Field>
          <Field label="Senha">
            <input value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })}
              className="w-full rounded-md border border-border bg-bg3 px-3 py-2 text-sm font-mono" type="text" />
          </Field>
          <Field label="2FA secret (base32)">
            <input value={form.totp_secret} onChange={(e) => setForm({ ...form, totp_secret: e.target.value.replace(/\s+/g, "") })}
              className="w-full rounded-md border border-border bg-bg3 px-3 py-2 text-sm font-mono" placeholder="JBSWY3DPEHPK3PXP" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Status">
              <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as ContingencyStatus })}
                className="w-full rounded-md border border-border bg-bg3 px-3 py-2 text-sm">
                {(Object.keys(STATUS_META) as ContingencyStatus[]).map((s) => (
                  <option key={s} value={s}>{STATUS_META[s].label}</option>
                ))}
              </select>
            </Field>
            <Field label="Qualidade">
              <select value={form.quality} onChange={(e) => setForm({ ...form, quality: e.target.value as ContingencyQuality })}
                className="w-full rounded-md border border-border bg-bg3 px-3 py-2 text-sm">
                {(Object.keys(QUALITY_META) as ContingencyQuality[]).map((q) => (
                  <option key={q} value={q}>{QUALITY_META[q].label}</option>
                ))}
              </select>
            </Field>
          </div>
          <Field label="Notas">
            <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })}
              rows={2} className="w-full rounded-md border border-border bg-bg3 px-3 py-2 text-sm" />
          </Field>
        </div>
        <DialogFooter>
          <button onClick={() => onOpenChange(false)}
            className="rounded-md border border-border bg-bg3 px-3 py-2 text-sm">Cancelar</button>
          <button
            onClick={() => {
              if (!form.username.trim()) { toast.error("Username obrigatório"); return; }
              onSave({ ...form, updated_at: new Date().toISOString() });
              onOpenChange(false);
            }}
            className="rounded-md im-grad-accent px-3 py-2 text-sm font-medium text-white">Salvar</button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-muted2">{label}</span>
      {children}
    </label>
  );
}

// ---- main page ----
function ContingencyPage() {
  const [list, update] = useContingency();
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | ContingencyStatus>("all");
  const [sortBy, setSortBy] = useState<"updated_desc" | "username_asc" | "username_desc" | "status" | "quality">("updated_desc");
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [addOpen, setAddOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const counts = useMemo(() => {
    const c = { total: list.length, em_edicao: 0, pronta: 0, em_uso: 0, descartada: 0 };
    for (const a of list) c[a.status]++;
    return c;
  }, [list]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const statusOrder: Record<ContingencyStatus, number> = { pronta: 0, em_uso: 1, em_edicao: 2, descartada: 3 };
    const qualityOrder: Record<string, number> = { boa: 0, media: 1, ruim: 2 };
    const out = list.filter((a) => {
      if (statusFilter !== "all" && a.status !== statusFilter) return false;
      if (q && !a.username.toLowerCase().includes(q)) return false;
      return true;
    });
    out.sort((a, b) => {
      switch (sortBy) {
        case "username_asc": return a.username.localeCompare(b.username);
        case "username_desc": return b.username.localeCompare(a.username);
        case "status": return statusOrder[a.status] - statusOrder[b.status];
        case "quality": return qualityOrder[a.quality] - qualityOrder[b.quality];
        case "updated_desc":
        default: return b.updated_at.localeCompare(a.updated_at);
      }
    });
    return out;
  }, [list, query, statusFilter, sortBy]);

  const patch = (id: string, p: Partial<ContingencyAccount>) =>
    update((prev) => {
      const next = prev.map((a) => (a.id === id ? { ...a, ...p, updated_at: new Date().toISOString() } : a));
      const updated = next.find((a) => a.id === id);
      if (updated) pushOne(updated);
      return next;
    });

  const removeOne = (id: string) => {
    update((prev) => prev.filter((a) => a.id !== id));
    deleteOne(id);
  };

  const handleAdd = (a: ContingencyAccount) => {
    update((prev) => [a, ...prev]);
    pushOne(a);
    toast.success("Conta adicionada");
  };

  const handleImport = async (file: File) => {
    try {
      const text = await file.text();
      const imported = fromCSV(text);
      if (imported.length === 0) { toast.error("Nenhuma conta válida no arquivo"); return; }
      update((prev) => {
        const next = [...imported, ...prev];
        replaceAllOnServer(next);
        return next;
      });
      toast.success(`${imported.length} conta(s) importada(s)`);
    } catch (e) {
      toast.error("Falha ao importar: " + (e as Error).message);
    }
  };

  const handleExport = () => {
    const csv = toCSV(list);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `contingencia-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("CSV exportado");
  };

  const copyFullCreds = (a: ContingencyAccount) => {
    const text = `username: ${a.username}\npassword: ${a.password}\n2fa_secret: ${a.totp_secret}`;
    navigator.clipboard.writeText(text);
    toast.success("Credenciais copiadas");
  };

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-5 sm:px-6 sm:py-7 md:px-10 md:py-8">
      <header className="mb-5">
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted2">Contingência</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Estoque de contas de backup</h1>
        <p className="mt-1 text-sm text-text2">
          Estoque de contas preparadas manualmente — prontas para substituir em caso de ban ou shadowban.
        </p>
      </header>

      {/* toolbar */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Tool icon={Plus} onClick={() => setAddOpen(true)}>Adicionar</Tool>
        <Tool icon={CheckSquare} active={selectMode} onClick={() => { setSelectMode((v) => !v); setSelected(new Set()); }}>
          Selecionar
        </Tool>
        <button
          onClick={() => fileRef.current?.click()}
          className="inline-flex items-center gap-1.5 rounded-lg im-grad-accent px-3 py-2 text-xs font-medium text-white">
          <FileUp className="h-3.5 w-3.5" /> Importar CSV/XLSX
        </button>
        <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImport(f); e.target.value = ""; }} />
        <Tool icon={HardDrive} onClick={() => toast.info("Conecte o Google Drive em Configurações")}>Drive</Tool>
        <Tool icon={Save} onClick={() => toast.info("Em breve: salvar no Drive")}>Salvar no Drive</Tool>
        <Tool icon={FileDown} onClick={handleExport}>Exportar CSV</Tool>

        {selectMode && selected.size > 0 && (
          <button
            onClick={() => {
              const ids = Array.from(selected);
              update((prev) => prev.filter((a) => !selected.has(a.id)));
              ids.forEach(deleteOne);
              setSelected(new Set());
              toast.success("Removidas");
            }}
            className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-border bg-bg3 px-3 py-2 text-xs text-danger hover:border-danger">
            <Trash2 className="h-3.5 w-3.5" /> Excluir ({selected.size})
          </button>
        )}
      </div>

      {/* stat cards */}
      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
        <StatCard label="Total" value={counts.total} color="var(--accent2)" active={statusFilter === "all"} onClick={() => setStatusFilter("all")} />
        <StatCard label="Em Edição" value={counts.em_edicao} color="var(--accent2)" active={statusFilter === "em_edicao"} onClick={() => setStatusFilter("em_edicao")} icon="✏️" />
        <StatCard label="Pronta" value={counts.pronta} color="var(--success)" active={statusFilter === "pronta"} onClick={() => setStatusFilter("pronta")} icon="✓" />
        <StatCard label="Em Uso" value={counts.em_uso} color="var(--info)" active={statusFilter === "em_uso"} onClick={() => setStatusFilter("em_uso")} icon="●" />
        <StatCard label="Descartada" value={counts.descartada} color="var(--danger)" active={statusFilter === "descartada"} onClick={() => setStatusFilter("descartada")} icon="✕" />
      </div>

      {/* search + status filter */}
      <div className="mb-3 space-y-2">
        <div className="im-card flex items-center gap-2 px-3 py-2">
          <Search className="h-4 w-4 text-muted2" />
          <input value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por username ou nome..."
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted2" />
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
            className="w-full rounded-lg border border-border bg-bg2 px-3 py-2.5 text-sm">
            <option value="all">● Todos os status</option>
            {(Object.keys(STATUS_META) as ContingencyStatus[]).map((s) => (
              <option key={s} value={s}>● {STATUS_META[s].label}</option>
            ))}
          </select>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
            className="w-full rounded-lg border border-border bg-bg2 px-3 py-2.5 text-sm">
            <option value="updated_desc">↓ Atualizadas recentemente</option>
            <option value="username_asc">A → Z (username)</option>
            <option value="username_desc">Z → A (username)</option>
            <option value="status">Status (prontas primeiro)</option>
            <option value="quality">Qualidade (boas primeiro)</option>
          </select>
        </div>
      </div>

      <div className="mb-2 text-right text-[11px] text-muted2">{filtered.length}/{list.length}</div>

      {/* table */}
      {filtered.length === 0 ? (
        <div className="im-card flex flex-col items-center justify-center p-12 text-center">
          <p className="text-sm text-text2">
            {list.length === 0
              ? "Nenhuma conta de contingência cadastrada. Clique em + Adicionar ou Importe um CSV."
              : "Nenhuma conta corresponde aos filtros."}
          </p>
        </div>
      ) : (
        <div className="im-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-border text-[10px] uppercase tracking-wider text-muted2">
              <tr>
                {selectMode && <th className="w-8 p-3"></th>}
                <th className="p-3 text-left">Username (@)</th>
                <th className="p-3 text-left">Senha</th>
                <th className="p-3 text-left">Token 2FA / TOTP</th>
                <th className="p-3 text-left">Status</th>
                <th className="p-3 text-left">Qualidade</th>
                <th className="p-3 text-left">Notas</th>
                <th className="p-3 text-left">Atualizado em</th>
                <th className="p-3 text-left">Ações</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((a) => (
                <tr key={a.id} className="border-b border-border/60 align-top">
                  {selectMode && (
                    <td className="p-3">
                      <input
                        type="checkbox"
                        checked={selected.has(a.id)}
                        onChange={(e) => {
                          const next = new Set(selected);
                          if (e.target.checked) next.add(a.id); else next.delete(a.id);
                          setSelected(next);
                        }}
                      />
                    </td>
                  )}
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full" style={{ background: STATUS_META[a.status].color }} />
                      <input
                        value={a.username}
                        onChange={(e) => patch(a.id, { username: e.target.value })}
                        className="w-36 rounded-md border border-border bg-bg3 px-2 py-1.5 text-xs"
                      />
                      <button
                        onClick={() => { navigator.clipboard.writeText(a.username); toast.success("Username copiado"); }}
                        className="inline-flex items-center gap-1 rounded-md border border-border bg-bg3 px-2 py-1.5 text-[11px] hover:border-border2">
                        <Copy className="h-3 w-3" /> Copiar
                      </button>
                    </div>
                  </td>
                  <td className="p-3 min-w-[220px]">
                    <PasswordCell value={a.password} onChange={(v) => patch(a.id, { password: v })} />
                  </td>
                  <td className="p-3 min-w-[260px]">
                    <TotpCell secret={a.totp_secret} />
                  </td>
                  <td className="p-3">
                    <StatusBadge status={a.status} onChange={(s) => patch(a.id, { status: s })} />
                  </td>
                  <td className="p-3">
                    <QualityBadge quality={a.quality} onChange={(q) => patch(a.id, { quality: q })} />
                  </td>
                  <td className="p-3 min-w-[180px]">
                    <input
                      value={a.notes}
                      onChange={(e) => patch(a.id, { notes: e.target.value })}
                      placeholder="Observações..."
                      className="w-full rounded-md border border-border bg-bg3 px-2 py-1.5 text-xs"
                    />
                  </td>
                  <td className="p-3 whitespace-nowrap text-[11px] text-text2">
                    {new Date(a.updated_at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" })}
                  </td>
                  <td className="p-3">
                    <div className="flex flex-col gap-1">
                      <button onClick={() => copyFullCreds(a)}
                        className="inline-flex items-center gap-1 rounded-md border border-border bg-bg3 px-2 py-1.5 text-[11px] hover:border-border2">
                        <Copy className="h-3 w-3" /> Copiar tudo
                      </button>
                      <button
                        onClick={() => { patch(a.id, { status: "em_uso" }); toast.success("Marcada como Em Uso"); }}
                        className="inline-flex items-center gap-1 rounded-md border border-border bg-bg3 px-2 py-1.5 text-[11px] hover:border-accent"
                        style={{ color: "var(--accent2)" }}>
                        <ArrowRightLeft className="h-3 w-3" /> Principais
                      </button>
                      <button onClick={() => { if (confirm(`Excluir @${a.username}?`)) removeOne(a.id); }}
                        className="inline-flex items-center gap-1 rounded-md border border-border bg-bg3 px-2 py-1.5 text-[11px] text-danger hover:border-danger">
                        <Trash2 className="h-3 w-3" /> Excluir
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <AddAccountModal open={addOpen} onOpenChange={setAddOpen} onSave={handleAdd} />
    </div>
  );
}

function Tool({
  icon: Icon, children, onClick, active,
}: { icon: typeof Plus; children: React.ReactNode; onClick?: () => void; active?: boolean }) {
  return (
    <button onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs transition-colors ${
        active ? "border-accent bg-bg4" : "border-border bg-bg3 hover:border-border2"
      }`}>
      <Icon className="h-3.5 w-3.5" /> {children}
    </button>
  );
}

function StatCard({
  label, value, color, active, onClick, icon,
}: { label: string; value: number; color: string; active?: boolean; onClick?: () => void; icon?: string }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-xl border bg-bg2 p-3 text-left transition-all ${active ? "border-accent" : "border-border hover:border-border2"}`}>
      <div className="text-2xl font-semibold tabular-nums" style={{ color }}>{value}</div>
      <div className="mt-1 text-[11px] text-text2">{icon && <span className="mr-1">{icon}</span>}{label}</div>
    </button>
  );
}
