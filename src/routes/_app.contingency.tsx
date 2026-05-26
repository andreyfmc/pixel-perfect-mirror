import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Plus, CheckSquare, FileUp, HardDrive, Save, FileDown, Search,
  Copy, Eye, EyeOff, Trash2, ChevronDown, ChevronRight, MoreHorizontal,
  Zap, Lock, Unlock, AlertTriangle, MoreVertical, History,
} from "lucide-react";
import { toast } from "sonner";
import {
  type ContingencyAccount, type ContingencyStatus, type ContingencyQuality,
  type ConnectionType, type ActivationLog,
  STATUS_META, QUALITY_META,
  loadContingency, saveContingency, newAccount, toCSV, fromCSV,
  fetchFromServer, pushOne, deleteOne, replaceAllOnServer,
  appendActivationLog, logsForContingency,
} from "@/lib/contingency-store";
import { generateTOTP, totpSecondsRemaining } from "@/lib/totp";
import { api } from "@/lib/api-client";
import { useServerFn } from "@tanstack/react-start";
import {
  listContingencyCsvs, downloadDriveCsv, uploadContingencyCsv,
  type DriveCsvFile,
} from "@/lib/drive.functions";
import type { Account } from "@/lib/mock";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { ConnectLinkButton } from "@/components/ConnectLinkButton";

export const Route = createFileRoute("/_app/contingency")({
  component: ContingencyPage,
  head: () => ({ meta: [{ title: "Contingência · Insta Manager" }] }),
});

// =====================  helpers  =====================

const PRIVATE_KEY = "im_contingency_private_v1";

function useContingency() {
  const [list, setList] = useState<ContingencyAccount[]>([]);
  useEffect(() => {
    const local = loadContingency();
    setList(local);
    fetchFromServer().then((res) => {
      if (!res) return;
      if (res.items.length === 0 && local.length > 0) { replaceAllOnServer(local); return; }
      if (res.items.length > 0) { setList(res.items); saveContingency(res.items); }
    });
    const onChange = () => setList(loadContingency());
    window.addEventListener("contingency:changed", onChange);
    return () => window.removeEventListener("contingency:changed", onChange);
  }, []);
  const update = useCallback((updater: (prev: ContingencyAccount[]) => ContingencyAccount[]) => {
    setList((prev) => { const next = updater(prev); saveContingency(next); return next; });
  }, []);
  return [list, update] as const;
}

function relTime(iso: string): string {
  const d = (Date.now() - new Date(iso).getTime()) / 1000;
  if (d < 60) return "agora";
  if (d < 3600) return `${Math.floor(d / 60)}min`;
  if (d < 86400) return `${Math.floor(d / 3600)}h`;
  return `${Math.floor(d / 86400)}d`;
}

// =====================  small bits  =====================

function TypeIcon({ type }: { type: ConnectionType }) {
  if (type === "facebook") {
    return (
      <span
        title="Facebook"
        className="inline-flex h-4 w-4 items-center justify-center rounded-[4px] text-[9px] font-bold text-white"
        style={{ background: "#1877F2" }}
      >f</span>
    );
  }
  return (
    <span
      title="Instagram"
      className="inline-flex h-4 w-4 items-center justify-center rounded-[4px] text-[8px] font-bold text-white"
      style={{ background: "linear-gradient(135deg,#feda75,#fa7e1e 30%,#d62976 60%,#962fbf 80%,#4f5bd5)" }}
    >IG</span>
  );
}

function TypeToggle({
  type, onChange,
}: { type: ConnectionType; onChange: (t: ConnectionType) => void }) {
  const next: ConnectionType = type === "instagram" ? "facebook" : "instagram";
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onChange(next);
      }}
      title={`Alternar para ${next === "instagram" ? "Instagram" : "Facebook"}`}
      className="shrink-0 rounded-[4px] outline-none ring-offset-1 transition-transform hover:scale-110 focus-visible:ring-2 focus-visible:ring-accent"
    >
      <TypeIcon type={type} />
    </button>
  );
}

function TotpInline({ secret, privateMode }: { secret: string; privateMode: boolean }) {
  const [code, setCode] = useState("------");
  const [left, setLeft] = useState(30);
  useEffect(() => {
    let mounted = true;
    const tick = async () => {
      if (!secret) { setCode("------"); setLeft(30); return; }
      const c = await generateTOTP(secret);
      if (mounted) { setCode(c); setLeft(totpSecondsRemaining(30)); }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => { mounted = false; clearInterval(id); };
  }, [secret]);
  const pct = (left / 30) * 100;
  const danger = left <= 5;
  if (privateMode || !secret) {
    return (
      <div className="flex items-center gap-1.5">
        <span className="font-mono text-[11px] tracking-widest text-muted2">••••••••</span>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(code); toast.success("TOTP copiado"); }}
        className="inline-flex items-center gap-1 rounded-md border border-border bg-bg3 px-1.5 py-0.5 font-mono text-[11px] tabular-nums hover:border-border2"
        title="Copiar código TOTP"
      >
        <span className={danger ? "text-danger" : ""}>{code.slice(0, 3)} {code.slice(3)}</span>
        <Copy className="h-2.5 w-2.5 opacity-60" />
      </button>
      <div className="h-1 w-10 overflow-hidden rounded-full bg-bg3">
        <div
          className="h-full transition-all"
          style={{ width: `${pct}%`, background: danger ? "var(--danger)" : "var(--accent2)" }}
        />
      </div>
    </div>
  );
}

function MaskedField({
  value, label, privateMode,
}: { value: string; label: string; privateMode: boolean }) {
  if (!value) return <span className="text-[11px] text-muted2/60">—</span>;
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        if (privateMode) { toast.error("Modo privado ativo"); return; }
        navigator.clipboard.writeText(value);
        toast.success(`${label} copiado`);
      }}
      className="inline-flex items-center gap-1 rounded-md border border-border bg-bg3 px-1.5 py-0.5 font-mono text-[11px] hover:border-border2"
      title={privateMode ? "Modo privado ativo" : `Copiar ${label.toLowerCase()}`}
    >
      <span className="tracking-widest text-muted2">••••••••</span>
      <Copy className="h-2.5 w-2.5 opacity-60" />
    </button>
  );
}

function StatusPill({
  status, onChange,
}: { status: ContingencyStatus; onChange: (s: ContingencyStatus) => void }) {
  const meta = STATUS_META[status];
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          onClick={(e) => e.stopPropagation()}
          className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide"
          style={{ background: `color-mix(in oklab, ${meta.color} 18%, transparent)`, color: meta.color }}
        >● {meta.label}<ChevronDown className="h-3 w-3" /></button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" onClick={(e) => e.stopPropagation()}>
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

function QualityPill({
  quality, onChange,
}: { quality: ContingencyQuality; onChange: (q: ContingencyQuality) => void }) {
  const meta = QUALITY_META[quality];
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          onClick={(e) => e.stopPropagation()}
          className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide"
          style={{ background: `color-mix(in oklab, ${meta.color} 18%, transparent)`, color: meta.color }}
        >● {meta.label}<ChevronDown className="h-3 w-3" /></button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" onClick={(e) => e.stopPropagation()}>
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

// =====================  Add modal  =====================

function AddAccountModal({
  open, onOpenChange, onSave,
}: { open: boolean; onOpenChange: (v: boolean) => void; onSave: (a: ContingencyAccount) => void }) {
  const [form, setForm] = useState(() => newAccount());
  useEffect(() => { if (open) setForm(newAccount({ connection_type: "instagram" })); }, [open]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-bg2 border-border max-w-md">
        <DialogHeader><DialogTitle>Adicionar conta de contingência</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <Field label="Tipo de conexão">
            <div className="grid grid-cols-2 gap-2">
              {(["instagram", "facebook"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setForm({ ...form, connection_type: t })}
                  className={`flex items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm ${
                    (form.connection_type ?? "instagram") === t ? "border-accent bg-bg4" : "border-border bg-bg3"
                  }`}
                >
                  <TypeIcon type={t} /> {t === "instagram" ? "Instagram" : "Facebook"}
                </button>
              ))}
            </div>
          </Field>
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
      <span className="mb-1 block text-[11px] uppercase tracking-wide text-muted2">{label}</span>
      {children}
    </label>
  );
}

// =====================  Password reveal modal  =====================

function PasswordRevealModal({
  open, onOpenChange, account,
}: { open: boolean; onOpenChange: (v: boolean) => void; account: ContingencyAccount | null }) {
  if (!account) return null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-bg2 border-border max-w-sm">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><Unlock className="h-4 w-4" /> Senha de @{account.username}</DialogTitle></DialogHeader>
        <div className="rounded-md border border-border bg-bg3 p-3 font-mono text-sm break-all">
          {account.password || <span className="text-muted2">— vazio —</span>}
        </div>
        <DialogFooter>
          <button onClick={() => onOpenChange(false)} className="rounded-md border border-border bg-bg3 px-3 py-2 text-sm">Fechar</button>
          <button
            onClick={() => { navigator.clipboard.writeText(account.password); toast.success("Senha copiada"); }}
            className="rounded-md im-grad-accent px-3 py-2 text-sm font-medium text-white">Copiar</button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// =====================  Activation drawer  =====================

function ActivationDrawer({
  open, onOpenChange, account, onConfirm,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  account: ContingencyAccount | null;
  onConfirm: (replaced: Account, reason: string) => void;
}) {
  const [step, setStep] = useState<1 | 2>(1);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [replacedId, setReplacedId] = useState<string>("");
  const [reason, setReason] = useState<string>("Shadowban");
  useEffect(() => {
    if (!open) return;
    setStep(1); setReplacedId(""); setReason("Shadowban");
    api.listAccounts().then(setAccounts).catch(() => setAccounts([]));
  }, [open]);
  const replaced = accounts.find((a) => a.id === replacedId);
  if (!account) return null;
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md bg-bg2 border-border">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-accent2" /> Ativar @{account.username} como principal
          </SheetTitle>
          <SheetDescription>Substitui uma conta principal por esta conta de contingência.</SheetDescription>
        </SheetHeader>

        <div className="mt-5 space-y-4">
          {step === 1 && (
            <>
              <Field label="Qual conta principal está sendo substituída?">
                <select
                  value={replacedId}
                  onChange={(e) => setReplacedId(e.target.value)}
                  className="w-full rounded-md border border-border bg-bg3 px-3 py-2 text-sm"
                >
                  <option value="">— selecionar conta —</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>@{a.username} ({a.name})</option>
                  ))}
                </select>
              </Field>
              <Field label="Motivo">
                <select
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="w-full rounded-md border border-border bg-bg3 px-3 py-2 text-sm"
                >
                  <option>Ban</option>
                  <option>Shadowban</option>
                  <option>Problema técnico</option>
                  <option>Outro</option>
                </select>
              </Field>
              <div className="flex justify-end gap-2 pt-2">
                <button onClick={() => onOpenChange(false)} className="rounded-md border border-border bg-bg3 px-3 py-2 text-sm">Cancelar</button>
                <button
                  disabled={!replacedId}
                  onClick={() => setStep(2)}
                  className="rounded-md im-grad-accent px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
                >Continuar →</button>
              </div>
            </>
          )}

          {step === 2 && replaced && (
            <>
              <div className="rounded-lg border border-accent/40 bg-bg3 p-4 space-y-2 text-sm">
                <p>
                  <strong className="text-accent2">@{account.username}</strong> vai substituir{" "}
                  <strong>@{replaced.username}</strong>
                </p>
                <p className="text-text2">Motivo: <strong>{reason}</strong></p>
                <p className="text-[12px] text-muted2">
                  A conta <strong>@{replaced.username}</strong> será movida para Arquivadas.
                </p>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button onClick={() => setStep(1)} className="rounded-md border border-border bg-bg3 px-3 py-2 text-sm">← Voltar</button>
                <button
                  onClick={() => onConfirm(replaced, reason)}
                  className="rounded-md im-grad-accent px-3 py-2 text-sm font-medium text-white"
                >Confirmar ativação</button>
              </div>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

// =====================  Row  =====================

function Row({
  a, idx, privateMode, expanded, onToggleExpand, onPatch, onRemove, onCopyAll, onActivate, onReveal, selectMode, selected, onSelectChange,
}: {
  a: ContingencyAccount;
  idx: number;
  privateMode: boolean;
  expanded: boolean;
  onToggleExpand: () => void;
  onPatch: (p: Partial<ContingencyAccount>) => void;
  onRemove: () => void;
  onCopyAll: () => void;
  onActivate: () => void;
  onReveal: () => void;
  selectMode: boolean;
  selected: boolean;
  onSelectChange: (v: boolean) => void;
}) {
  const ctype = a.connection_type ?? "instagram";
  const zebra = idx % 2 === 1 ? "bg-white/[0.02]" : "";
  return (
    <div
      className="border-b border-border/60"
      style={{ animation: `fadeUp .25s ease ${Math.min(idx * 20, 400)}ms backwards` }}
    >
      <div
        onClick={onToggleExpand}
        className={`flex h-12 cursor-pointer items-center gap-2 px-2 transition-colors hover:bg-white/[0.03] ${zebra}`}
      >
        {selectMode && (
          <input
            type="checkbox"
            checked={selected}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => onSelectChange(e.target.checked)}
            className="ml-1"
          />
        )}
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onToggleExpand(); }}
          className="text-muted2 hover:text-text"
        >
          {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        </button>
        <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: STATUS_META[a.status].color }} />

        {/* username */}
        <div className="flex w-48 min-w-0 shrink-0 items-center gap-1.5">
          <TypeToggle type={ctype} onChange={(t) => onPatch({ connection_type: t })} />
          <span className="truncate font-mono text-[13px]">@{a.username || <span className="text-muted2">sem nome</span>}</span>
          <button
            onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(a.username); toast.success("Copiado"); }}
            className="shrink-0 text-muted2 hover:text-text"
            title="Copiar username"
          ><Copy className="h-3 w-3" /></button>
        </div>

        {/* password */}
        <div className="flex w-32 shrink-0 items-center gap-1">
          <MaskedField value={a.password} label="Senha" privateMode={privateMode} />
          {!privateMode && a.password && (
            <button
              onClick={(e) => { e.stopPropagation(); onReveal(); }}
              className="text-muted2 hover:text-text"
              title="Visualizar senha"
            ><Eye className="h-3 w-3" /></button>
          )}
        </div>

        {/* 2fa secret */}
        <div className="flex w-28 shrink-0 items-center">
          <MaskedField value={a.totp_secret} label="2FA secret" privateMode={privateMode} />
        </div>

        {/* TOTP code */}
        <div className="w-36 shrink-0">
          <TotpInline secret={a.totp_secret} privateMode={privateMode} />
        </div>

        {/* status / quality */}
        <div className="shrink-0"><StatusPill status={a.status} onChange={(s) => onPatch({ status: s })} /></div>
        <div className="shrink-0"><QualityPill quality={a.quality} onChange={(q) => onPatch({ quality: q })} /></div>

        {/* notes inline (collapsed shows preview, click expands) */}
        <input
          value={a.notes}
          onChange={(e) => onPatch({ notes: e.target.value })}
          onClick={(e) => e.stopPropagation()}
          placeholder="Observações..."
          className="hidden flex-1 min-w-0 rounded-md border border-transparent bg-transparent px-2 py-1 text-[12px] hover:border-border focus:border-accent focus:bg-bg3 lg:block"
        />

        {/* updated */}
        <span className="hidden w-16 shrink-0 text-right text-[10px] text-muted2 md:block">
          {relTime(a.updated_at)}
        </span>

        {/* actions */}
        <button
          onClick={(e) => { e.stopPropagation(); onActivate(); }}
          className="hidden shrink-0 items-center gap-1 rounded-md border border-accent/40 bg-accent/10 px-2 py-1 text-[11px] font-medium text-accent2 hover:bg-accent/20 md:inline-flex"
          title="Ativar como principal"
        >
          <Zap className="h-3 w-3" /> Ativar
        </button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              onClick={(e) => e.stopPropagation()}
              className="shrink-0 rounded-md p-1 text-muted2 hover:bg-bg3 hover:text-text"
            ><MoreVertical className="h-4 w-4" /></button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
            <DropdownMenuItem onClick={onCopyAll}><Copy className="mr-2 h-3.5 w-3.5" /> Copiar tudo</DropdownMenuItem>
            <DropdownMenuItem onClick={onActivate}><Zap className="mr-2 h-3.5 w-3.5" /> Ativar como principal</DropdownMenuItem>
            <DropdownMenuItem onClick={onToggleExpand}><History className="mr-2 h-3.5 w-3.5" /> Ver histórico de uso</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => { if (confirm(`Excluir @${a.username}?`)) onRemove(); }}
              className="text-danger focus:text-danger"
            ><Trash2 className="mr-2 h-3.5 w-3.5" /> Excluir</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* expanded */}
      {expanded && (
        <div className={`px-4 py-3 ${zebra}`} style={{ animation: "fadeIn .15s ease" }}>
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <p className="mb-1 text-[10px] uppercase tracking-wide text-muted2">Notas</p>
              <textarea
                value={a.notes}
                onChange={(e) => onPatch({ notes: e.target.value })}
                rows={3}
                placeholder="Observações..."
                className="w-full rounded-md border border-border bg-bg3 px-2 py-1.5 text-[12px]"
              />
            </div>
            <ExpandedHistory id={a.id} />
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button onClick={onCopyAll}
              className="inline-flex items-center gap-1 rounded-md border border-border bg-bg3 px-2 py-1 text-[11px] hover:border-border2">
              <Copy className="h-3 w-3" /> Copiar tudo
            </button>
            <button onClick={onActivate}
              className="inline-flex items-center gap-1 rounded-md border border-accent/40 bg-accent/10 px-2 py-1 text-[11px] font-medium text-accent2 hover:bg-accent/20">
              <Zap className="h-3 w-3" /> Ativar como principal
            </button>
            <button onClick={() => { if (confirm(`Excluir @${a.username}?`)) onRemove(); }}
              className="inline-flex items-center gap-1 rounded-md border border-border bg-bg3 px-2 py-1 text-[11px] text-danger hover:border-danger">
              <Trash2 className="h-3 w-3" /> Excluir
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ExpandedHistory({ id }: { id: string }) {
  const [logs, setLogs] = useState<ActivationLog[]>([]);
  useEffect(() => { setLogs(logsForContingency(id)); }, [id]);
  return (
    <div>
      <p className="mb-1 text-[10px] uppercase tracking-wide text-muted2">Histórico de uso</p>
      {logs.length === 0 ? (
        <p className="text-[12px] text-muted2/60">Nunca foi ativada.</p>
      ) : (
        <ul className="space-y-1 text-[12px]">
          {logs.map((l) => (
            <li key={l.id} className="rounded-md border border-border bg-bg3 px-2 py-1">
              <span className="text-muted2">{new Date(l.activated_at).toLocaleString("pt-BR")} ·</span>{" "}
              substituiu <strong>@{l.replaced_username}</strong> ({l.reason})
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// =====================  Mobile pieces  =====================

function hapticTap() {
  try { if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate(50); } catch { /* noop */ }
}

function CopyButton({
  getValue, label, className, children,
}: {
  getValue: () => string;
  label: string;
  className?: string;
  children?: React.ReactNode;
}) {
  const [done, setDone] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        const v = getValue();
        if (!v) { toast.error(`${label} vazio`); return; }
        navigator.clipboard.writeText(v);
        hapticTap();
        setDone(true);
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => setDone(false), 1500);
      }}
      className={`inline-flex min-h-[44px] min-w-[44px] items-center justify-center gap-1.5 rounded-lg border px-3 text-[13px] font-medium transition-colors active:scale-[0.97] ${
        done
          ? "border-success bg-success/15 text-success"
          : "border-border bg-bg3 text-text hover:border-border2"
      } ${className ?? ""}`}
      aria-label={`Copiar ${label}`}
    >
      {done ? <>✓ Copiado!</> : (children ?? <><Copy className="h-4 w-4" /> Copiar</>)}
    </button>
  );
}

function MobileTotp({ secret, privateMode }: { secret: string; privateMode: boolean }) {
  const [code, setCode] = useState("------");
  const [left, setLeft] = useState(30);
  useEffect(() => {
    let mounted = true;
    const tick = async () => {
      if (!secret) { setCode("------"); setLeft(30); return; }
      const c = await generateTOTP(secret);
      if (mounted) { setCode(c); setLeft(totpSecondsRemaining(30)); }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => { mounted = false; clearInterval(id); };
  }, [secret]);
  const danger = left <= 5;
  const display = privateMode ? "••• •••" : `${code.slice(0, 3)} ${code.slice(3)}`;
  const pct = (left / 30) * 100;
  return (
    <div>
      <div
        className={`font-mono tabular-nums text-[32px] leading-none tracking-[0.15em] ${
          danger ? "text-danger animate-pulse" : "text-text"
        }`}
      >
        {display}
      </div>
      <div className="mt-2 flex items-center gap-2">
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-bg3">
          <div
            className="h-full transition-all"
            style={{ width: `${pct}%`, background: danger ? "var(--danger)" : "var(--accent2)" }}
          />
        </div>
        <span className={`shrink-0 text-[11px] tabular-nums ${danger ? "text-danger" : "text-muted2"}`}>{left}s</span>
      </div>
    </div>
  );
}

function MobileCard({
  a, privateMode, onPatch, onRemove, onActivate, onCopyAll,
}: {
  a: ContingencyAccount;
  privateMode: boolean;
  onPatch: (p: Partial<ContingencyAccount>) => void;
  onRemove: () => void;
  onActivate: () => void;
  onCopyAll: () => void;
}) {
  const [reveal, setReveal] = useState(false);
  const ctype = a.connection_type ?? "instagram";
  const statusMeta = STATUS_META[a.status];
  return (
    <div className="rounded-xl border border-border bg-bg2 p-3 shadow-sm">
      {/* header */}
      <div className="mb-3 flex items-center gap-2">
        <TypeToggle type={ctype} onChange={(t) => onPatch({ connection_type: t })} />
        <span className="truncate font-mono text-[14px] font-medium">
          @{a.username || <span className="text-muted2">sem nome</span>}
        </span>
        <span
          className="ml-auto rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
          style={{ background: `color-mix(in oklab, ${statusMeta.color} 18%, transparent)`, color: statusMeta.color }}
        >
          {statusMeta.label}
        </span>
      </div>

      {/* username */}
      <div className="mb-3">
        <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted2">Usuário</p>
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1 truncate rounded-lg border border-border bg-bg3 px-3 py-2 font-mono text-[14px]">
            {a.username || <span className="text-muted2">—</span>}
          </div>
          <CopyButton getValue={() => a.username.replace(/^@/, "")} label="usuário" />
        </div>
      </div>

      {/* password */}
      <div className="mb-3">
        <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted2">Senha</p>
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1 truncate rounded-lg border border-border bg-bg3 px-3 py-2 font-mono text-[14px]">
            {a.password
              ? (privateMode || !reveal ? "••••••••••" : a.password)
              : <span className="text-muted2">—</span>}
          </div>
          {!privateMode && a.password && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setReveal((v) => !v); }}
              className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg border border-border bg-bg3 text-muted2 active:scale-[0.97]"
              aria-label={reveal ? "Ocultar senha" : "Mostrar senha"}
            >
              {reveal ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          )}
          <CopyButton getValue={() => a.password} label="senha" />
        </div>
      </div>

      {/* 2fa */}
      {a.totp_secret && (
        <div className="mb-3 rounded-lg border border-border bg-bg3 p-3">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted2">Código 2FA atual</p>
            <button
              type="button"
              onClick={async (e) => {
                e.stopPropagation();
                const code = await generateTOTP(a.totp_secret);
                navigator.clipboard.writeText(code);
                hapticTap();
                toast.success("Código 2FA copiado");
              }}
              className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg border border-border bg-bg2 px-3 text-[13px] font-medium hover:border-border2 active:scale-[0.97]"
            >
              <Copy className="h-4 w-4" /> Copiar
            </button>
          </div>
          <MobileTotp secret={a.totp_secret} privateMode={privateMode} />
        </div>
      )}

      {/* actions */}
      <div className="flex items-center gap-2">
        <button
          onClick={onActivate}
          className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-lg border border-accent/40 bg-accent/10 px-3 text-sm font-medium text-accent2 active:scale-[0.98]"
        >
          <Zap className="h-4 w-4" /> Ativar
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg border border-border bg-bg3 text-muted2 active:scale-[0.97]"
              aria-label="Mais ações"
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onCopyAll}><Copy className="mr-2 h-3.5 w-3.5" /> Copiar tudo</DropdownMenuItem>
            {(Object.keys(STATUS_META) as ContingencyStatus[]).map((s) => (
              <DropdownMenuItem key={s} onClick={() => onPatch({ status: s })}>
                <span className="mr-2" style={{ color: STATUS_META[s].color }}>●</span>
                {STATUS_META[s].label}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => { if (confirm(`Excluir @${a.username}?`)) onRemove(); }}
              className="text-danger focus:text-danger"
            >
              <Trash2 className="mr-2 h-3.5 w-3.5" /> Excluir
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

// =====================  page  =====================

function ContingencyPage() {
  const [list, update] = useContingency();
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | ContingencyStatus>("all");
  const [typeFilter, setTypeFilter] = useState<"all" | ConnectionType>("all");
  const [sortBy, setSortBy] = useState<"updated_desc" | "username_asc" | "username_desc" | "status" | "quality">("updated_desc");
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [addOpen, setAddOpen] = useState(false);
  const [revealOpen, setRevealOpen] = useState(false);
  const [revealAccount, setRevealAccount] = useState<ContingencyAccount | null>(null);
  const [activateOpen, setActivateOpen] = useState(false);
  const [activateAccount, setActivateAccount] = useState<ContingencyAccount | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [privateMode, setPrivateMode] = useState(false);
  const [driveOpen, setDriveOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const uploadCsv = useServerFn(uploadContingencyCsv);
  const listCsvs = useServerFn(listContingencyCsvs);
  const downloadCsv = useServerFn(downloadDriveCsv);

  // private-mode persistence + title indicator
  useEffect(() => {
    try { setPrivateMode(localStorage.getItem(PRIVATE_KEY) === "1"); } catch { /* noop */ }
  }, []);
  useEffect(() => {
    try { localStorage.setItem(PRIVATE_KEY, privateMode ? "1" : "0"); } catch { /* noop */ }
    const base = "Contingência · Insta Manager";
    document.title = privateMode ? `🔒 ${base}` : base;
  }, [privateMode]);

  const counts = useMemo(() => {
    const c = { total: list.length, em_edicao: 0, pronta: 0, em_uso: 0, descartada: 0, instagram: 0, facebook: 0 };
    for (const a of list) {
      c[a.status]++;
      const t = a.connection_type ?? "instagram";
      c[t]++;
    }
    return c;
  }, [list]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const statusOrder: Record<ContingencyStatus, number> = { pronta: 0, em_uso: 1, em_edicao: 2, descartada: 3 };
    const qualityOrder: Record<string, number> = { boa: 0, media: 1, ruim: 2 };
    const out = list.filter((a) => {
      if (statusFilter !== "all" && a.status !== statusFilter) return false;
      if (typeFilter !== "all" && (a.connection_type ?? "instagram") !== typeFilter) return false;
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
  }, [list, query, statusFilter, typeFilter, sortBy]);

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
      update((prev) => { const next = [...imported, ...prev]; replaceAllOnServer(next); return next; });
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

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const onConfirmActivation = (replaced: Account, reason: string) => {
    if (!activateAccount) return;
    // mark contingency as in-use
    patch(activateAccount.id, { status: "em_uso" });
    appendActivationLog({
      id: crypto.randomUUID(),
      contingency_id: activateAccount.id,
      contingency_username: activateAccount.username,
      replaced_account_id: replaced.id,
      replaced_username: replaced.username,
      reason,
      activated_at: new Date().toISOString(),
    });
    toast.success(`✓ @${activateAccount.username} ativada como principal`);
    setActivateOpen(false);
    setActivateAccount(null);
  };

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-5 sm:px-6 sm:py-7 md:px-10 md:py-8">
      <style>{`@keyframes fadeUp{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:translateY(0)}}@keyframes fadeIn{from{opacity:0}to{opacity:1}}`}</style>

      <header className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted2">Contingência</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">Estoque de contas de backup</h1>
          <p className="mt-1 text-sm text-text2">
            Estoque de contas preparadas manualmente — prontas para substituir em caso de ban ou shadowban.
          </p>
        </div>
        <button
          onClick={() => setPrivateMode((v) => !v)}
          className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-2 text-xs transition-colors ${
            privateMode ? "border-accent bg-accent/15 text-accent2" : "border-border bg-bg3 hover:border-border2"
          }`}
          title="Oculta senhas e tokens. Persistente."
        >
          {privateMode ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
          Modo privado {privateMode ? "ativo" : ""}
        </button>
      </header>

      {/* toolbar — primary + more menu */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <button onClick={() => setAddOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-lg im-grad-accent px-3 py-2 text-xs font-medium text-white">
          <Plus className="h-3.5 w-3.5" /> Adicionar
        </button>
        <button
          onClick={() => {
            const ready = list.find((a) => a.status === "pronta") ?? list.find((a) => a.status === "em_edicao");
            if (!ready) { toast.error("Nenhuma conta disponível"); return; }
            setActivateAccount(ready); setActivateOpen(true);
          }}
          className="inline-flex items-center gap-1.5 rounded-lg border border-accent/40 bg-accent/10 px-3 py-2 text-xs font-medium text-accent2 hover:bg-accent/20"
        >
          <Zap className="h-3.5 w-3.5" /> Ativar conta
        </button>

        <ConnectLinkButton variant="ghost" />


        <button
          onClick={() => setDriveOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-bg3 px-3 py-2 text-xs hover:border-border2"
          title="Importar CSV do Google Drive (mesma conexão do app)"
        >
          <HardDrive className="h-3.5 w-3.5" /> Drive
        </button>
        <button
          onClick={async () => {
            const csv = toCSV(list);
            const filename = `contingencia-${new Date().toISOString().slice(0, 10)}.csv`;
            toast.loading("Enviando ao Drive...", { id: "drive-save" });
            const res = await uploadCsv({ data: { filename, csv } });
            if (res.error) toast.error(`Falha: ${res.error}`, { id: "drive-save" });
            else toast.success(`Salvo no Drive: ${filename}`, { id: "drive-save" });
          }}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-bg3 px-3 py-2 text-xs hover:border-border2"
          title="Salvar CSV no Google Drive (mesma conexão do app)"
        >
          <Save className="h-3.5 w-3.5" /> Salvar no Drive
        </button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-bg3 px-3 py-2 text-xs hover:border-border2">
              <MoreHorizontal className="h-3.5 w-3.5" /> Mais ações
              <ChevronDown className="h-3 w-3" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem onClick={() => { setSelectMode((v) => !v); setSelected(new Set()); }}>
              <CheckSquare className="mr-2 h-3.5 w-3.5" /> {selectMode ? "Sair da seleção" : "Selecionar"}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => fileRef.current?.click()}>
              <FileUp className="mr-2 h-3.5 w-3.5" /> Importar CSV/XLSX
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleExport}>
              <FileDown className="mr-2 h-3.5 w-3.5" /> Exportar CSV
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImport(f); e.target.value = ""; }} />


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
        <StatCard
          label="Em Edição"
          value={counts.em_edicao}
          color="var(--accent2)"
          active={statusFilter === "em_edicao"}
          onClick={() => setStatusFilter("em_edicao")}
          icon="✏️"
          title="Contas que ainda precisam de senha ou 2FA preenchidos"
        />
        <StatCard
          label="Pronta"
          value={counts.pronta}
          color="var(--success)"
          active={statusFilter === "pronta"}
          onClick={() => setStatusFilter("pronta")}
          icon="✓"
          warn={counts.pronta === 0}
          warnText="Nenhuma conta pronta para uso imediato"
        />
        <StatCard label="Em Uso" value={counts.em_uso} color="var(--info)" active={statusFilter === "em_uso"} onClick={() => setStatusFilter("em_uso")} icon="●" />
        <StatCard label="Descartada" value={counts.descartada} color="var(--danger)" active={statusFilter === "descartada"} onClick={() => setStatusFilter("descartada")} icon="✕" />
      </div>

      {/* type tabs */}
      <div className="mb-3 flex flex-wrap items-center gap-1 border-b border-border">
        {([
          ["all", `Todas (${counts.total})`, null],
          ["instagram", `Instagram (${counts.instagram})`, "instagram" as const],
          ["facebook", `Facebook (${counts.facebook})`, "facebook" as const],
        ] as const).map(([key, label, t]) => (
          <button
            key={key}
            onClick={() => setTypeFilter(key as typeof typeFilter)}
            className={`relative inline-flex items-center gap-1.5 px-3 py-2 text-xs transition-colors ${
              typeFilter === key ? "text-text" : "text-muted2 hover:text-text"
            }`}
          >
            {t && <TypeIcon type={t} />}
            {label}
            {typeFilter === key && (
              <span className="absolute inset-x-2 -bottom-px h-0.5 rounded bg-accent2" />
            )}
          </button>
        ))}
      </div>

      {/* search + filters compact */}
      <div className="sticky top-0 z-20 -mx-4 mb-3 grid gap-2 bg-bg/95 px-4 py-2 backdrop-blur sm:-mx-6 sm:px-6 md:static md:mx-0 md:bg-transparent md:px-0 md:py-0 md:backdrop-blur-none md:grid-cols-[1fr_auto_auto_auto]">
        <div className="flex h-11 items-center gap-2 rounded-lg border border-border bg-bg2 px-3 md:h-9">
          <Search className="h-4 w-4 text-muted2" />
          <input value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por username..."
            className="flex-1 bg-transparent text-base outline-none placeholder:text-muted2 md:text-sm" />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted2 hover:bg-bg3 hover:text-text"
              aria-label="Limpar busca"
            >✕</button>
          )}
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
          className="h-9 rounded-lg border border-border bg-bg2 px-2 text-xs">
          <option value="all">● Todos os status</option>
          {(Object.keys(STATUS_META) as ContingencyStatus[]).map((s) => (
            <option key={s} value={s}>● {STATUS_META[s].label}</option>
          ))}
        </select>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as typeof typeFilter)}
          className="h-9 rounded-lg border border-border bg-bg2 px-2 text-xs">
          <option value="all">Tipo: Todos</option>
          <option value="instagram">Instagram</option>
          <option value="facebook">Facebook</option>
        </select>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
          className="h-9 rounded-lg border border-border bg-bg2 px-2 text-xs">
          <option value="updated_desc">↓ Recentes</option>
          <option value="username_asc">A → Z</option>
          <option value="username_desc">Z → A</option>
          <option value="status">Status</option>
          <option value="quality">Qualidade</option>
        </select>
      </div>

      <div className="mb-2 text-right text-[11px] text-muted2">{filtered.length}/{list.length}</div>

      {/* list */}
      {filtered.length === 0 ? (
        <div className="im-card flex flex-col items-center justify-center p-12 text-center">
          <p className="text-sm text-text2">
            {list.length === 0
              ? "Nenhuma conta de contingência cadastrada. Clique em + Adicionar ou Importe um CSV."
              : "Nenhuma conta corresponde aos filtros."}
          </p>
        </div>
      ) : (
        <>
          {/* Mobile: stacked cards */}
          <div className="space-y-2 md:hidden">
            {filtered.map((a) => (
              <MobileCard
                key={a.id}
                a={a}
                privateMode={privateMode}
                onPatch={(p) => patch(a.id, p)}
                onRemove={() => removeOne(a.id)}
                onActivate={() => { setActivateAccount(a); setActivateOpen(true); }}
                onCopyAll={() => copyFullCreds(a)}
              />
            ))}
          </div>

          {/* Desktop: table */}
          <div className="im-card hidden overflow-x-auto md:block">
            <div className="min-w-[1000px]">
              {filtered.map((a, i) => (
                <Row
                  key={a.id}
                  a={a}
                  idx={i}
                  privateMode={privateMode}
                  expanded={expanded.has(a.id)}
                  onToggleExpand={() => toggleExpand(a.id)}
                  onPatch={(p) => patch(a.id, p)}
                  onRemove={() => removeOne(a.id)}
                  onCopyAll={() => copyFullCreds(a)}
                  onActivate={() => { setActivateAccount(a); setActivateOpen(true); }}
                  onReveal={() => { setRevealAccount(a); setRevealOpen(true); }}
                  selectMode={selectMode}
                  selected={selected.has(a.id)}
                  onSelectChange={(v) => {
                    const next = new Set(selected);
                    if (v) next.add(a.id); else next.delete(a.id);
                    setSelected(next);
                  }}
                />
              ))}
            </div>
          </div>
        </>
      )}

      <AddAccountModal open={addOpen} onOpenChange={setAddOpen} onSave={handleAdd} />
      <PasswordRevealModal open={revealOpen} onOpenChange={setRevealOpen} account={revealAccount} />
      <ActivationDrawer
        open={activateOpen}
        onOpenChange={(v) => { setActivateOpen(v); if (!v) setActivateAccount(null); }}
        account={activateAccount}
        onConfirm={onConfirmActivation}
      />
      <DriveImportDialog
        open={driveOpen}
        onOpenChange={setDriveOpen}
        listCsvs={listCsvs}
        downloadCsv={downloadCsv}
        onImport={(text) => {
          try {
            const imported = fromCSV(text);
            if (imported.length === 0) { toast.error("Nenhuma conta válida"); return; }
            update((prev) => { const next = [...imported, ...prev]; replaceAllOnServer(next); return next; });
            toast.success(`${imported.length} conta(s) importada(s) do Drive`);
            setDriveOpen(false);
          } catch (e) {
            toast.error("Falha ao importar: " + (e as Error).message);
          }
        }}
      />
    </div>
  );
}

function DriveImportDialog({
  open, onOpenChange, listCsvs, downloadCsv, onImport,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  listCsvs: () => Promise<{ files: DriveCsvFile[]; error: string | null }>;
  downloadCsv: (args: { data: { fileId: string } }) => Promise<{ content: string | null; error: string | null }>;
  onImport: (text: string) => void;
}) {
  const [files, setFiles] = useState<DriveCsvFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (!open) return;
    setLoading(true); setErr(null);
    listCsvs()
      .then((res) => { setFiles(res.files); setErr(res.error); })
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, [open, listCsvs]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-bg2 border-border max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <HardDrive className="h-4 w-4" /> Importar CSV do Drive
          </DialogTitle>
        </DialogHeader>
        <p className="text-[11px] text-muted2">
          Usa a mesma conexão Google Drive do app.
        </p>
        {loading && <p className="py-4 text-center text-sm text-muted2">Carregando...</p>}
        {err && <p className="rounded-md border border-danger/40 bg-danger/10 p-2 text-xs text-danger">{err}</p>}
        {!loading && !err && files.length === 0 && (
          <p className="py-4 text-center text-sm text-muted2">Nenhum CSV encontrado no Drive.</p>
        )}
        <ul className="max-h-80 space-y-1 overflow-y-auto">
          {files.map((f) => (
            <li key={f.id}>
              <button
                onClick={async () => {
                  toast.loading("Baixando...", { id: "drive-dl" });
                  const res = await downloadCsv({ data: { fileId: f.id } });
                  if (res.error || !res.content) {
                    toast.error(`Falha: ${res.error ?? "vazio"}`, { id: "drive-dl" });
                    return;
                  }
                  toast.dismiss("drive-dl");
                  onImport(res.content);
                }}
                className="flex w-full items-center justify-between rounded-md border border-border bg-bg3 px-3 py-2 text-left text-sm hover:border-border2"
              >
                <span className="truncate">{f.name}</span>
                {f.modifiedTime && (
                  <span className="text-[10px] text-muted2">
                    {new Date(f.modifiedTime).toLocaleDateString("pt-BR")}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}


function StatCard({
  label, value, color, active, onClick, icon, warn, warnText, title,
}: {
  label: string; value: number; color: string; active?: boolean; onClick?: () => void;
  icon?: string; warn?: boolean; warnText?: string; title?: string;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`relative rounded-xl border bg-bg2 p-3 text-left transition-all ${
        warn ? "border-warning" : active ? "border-accent" : "border-border hover:border-border2"
      }`}>
      <div className="text-2xl font-semibold tabular-nums" style={{ color }}>{value}</div>
      <div className="mt-1 flex items-center gap-1 text-[11px] text-text2">
        {icon && <span>{icon}</span>}{label}
      </div>
      {warn && warnText && (
        <div className="mt-1 flex items-start gap-1 text-[10px] text-warning">
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
          <span>{warnText}</span>
        </div>
      )}
    </button>
  );
}
