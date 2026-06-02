// Botão "Gerar link de conexão" + modal com seletor de app Meta.
// Permite escolher para qual app o link será gerado, facilitando
// o controle de qual conta vai para qual app (útil em modo desenvolvimento).

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Link2, Copy, Check, Loader2, ChevronDown } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type MetaApp = {
  id: string;
  name: string;
  provider: "facebook" | "instagram";
  is_active: number;
  account_count: number;
  client_id_masked: string;
};

type LinkResponse = {
  url?: string;
  state?: string;
  expiresAt?: string;
  meta_app_id?: string;
  message?: string;
  error?: string;
};

export function ConnectLinkButton({
  variant = "primary",
  label = "Gerar link de conexão",
}: {
  variant?: "primary" | "ghost";
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingApps, setLoadingApps] = useState(false);
  const [apps, setApps] = useState<MetaApp[]>([]);
  const [selectedAppId, setSelectedAppId] = useState<string>("auto");
  const [data, setData] = useState<{ url: string; expiresAt: string; appName?: string } | null>(null);
  const [copied, setCopied] = useState(false);

  // Carrega apps quando o modal abre
  useEffect(() => {
    if (!open) return;
    setLoadingApps(true);
    fetch("/api/meta-apps")
      .then((r) => r.json())
      .then((list: unknown) => {
        const arr = (list as MetaApp[]) ?? [];
        // Filtra somente apps Instagram ativos
        const igApps = list.filter((a) => a.provider === "instagram" && a.is_active === 1);
        setApps(igApps);
        setSelectedAppId("auto");
      })
      .catch(() => {
        setApps([]);
      })
      .finally(() => setLoadingApps(false));
  }, [open]);

  async function generate(appId = selectedAppId) {
    setLoading(true);
    setData(null);
    setCopied(false);
    try {
      const body = appId !== "auto" ? { meta_app_id: appId } : {};
      const res = await fetch("/api/auth/instagram/link", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = (await res.json()) as LinkResponse;
      if (!res.ok || !j.url) {
        toast.error(j.message ?? "Falha ao gerar link");
        return;
      }
      const usedApp = apps.find((a) => a.id === j.meta_app_id);
      setData({
        url: j.url,
        expiresAt: j.expiresAt ?? "",
        appName: usedApp?.name ?? (j.meta_app_id ? j.meta_app_id : "App padrão (env)"),
      });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function copy() {
    if (!data) return;
    try {
      await navigator.clipboard.writeText(data.url);
      setCopied(true);
      toast.success("Link copiado");
      setTimeout(() => setCopied(false), 1800);
    } catch {
      toast.error("Não foi possível copiar");
    }
  }

  function handleOpen() {
    setOpen(true);
    setData(null);
    setCopied(false);
  }

  function handleClose(v: boolean) {
    setOpen(v);
    if (!v) {
      setData(null);
      setCopied(false);
    }
  }

  const expiresText = data?.expiresAt
    ? new Date(data.expiresAt).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  const triggerClass =
    variant === "primary"
      ? "inline-flex items-center gap-1.5 rounded-lg border border-accent/40 bg-accent/10 px-3 py-2 text-xs font-medium text-accent2 hover:bg-accent/20"
      : "inline-flex items-center gap-1.5 rounded-lg border border-border bg-bg3 px-3 py-2 text-xs hover:border-border2";

  return (
    <>
      <button type="button" className={triggerClass} onClick={handleOpen}>
        <Link2 className="h-3.5 w-3.5" /> {label}
      </button>

      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Gerar link de conexão</DialogTitle>
            <DialogDescription>
              Escolha o app Meta e envie o link para a conta autorizar. A conta precisa ser
              Testadora do app escolhido enquanto estiver em modo desenvolvimento.
            </DialogDescription>
          </DialogHeader>

          {/* Seletor de app */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-text2">App Meta</label>
            {loadingApps ? (
              <div className="flex items-center gap-2 text-xs text-muted2">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Carregando apps…
              </div>
            ) : (
              <div className="relative">
                <select
                  value={selectedAppId}
                  onChange={(e) => {
                    setSelectedAppId(e.target.value);
                    setData(null);
                  }}
                  className="w-full appearance-none rounded-lg border border-border bg-bg3 py-2 pl-3 pr-8 text-xs text-text focus:border-accent focus:outline-none"
                >
                  <option value="auto">
                    Automático (menor número de contas)
                  </option>
                  {apps.map((app) => (
                    <option key={app.id} value={app.id}>
                      {app.name} — {app.client_id_masked} · {app.account_count} conta
                      {app.account_count !== 1 ? "s" : ""}
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted2" />
              </div>
            )}
          </div>

          {/* Botão gerar */}
          {!data && (
            <button
              onClick={() => generate(selectedAppId)}
              disabled={loading || loadingApps}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg im-grad-accent py-2.5 text-sm font-medium text-white disabled:opacity-50"
            >
              {loading ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Gerando…</>
              ) : (
                <><Link2 className="h-4 w-4" /> Gerar link</>
              )}
            </button>
          )}

          {/* Link gerado */}
          {data && (
            <div className="space-y-3">
              {/* Badge do app usado */}
              <div className="flex items-center gap-1.5 text-xs text-muted2">
                <span className="rounded-md bg-accent/10 px-2 py-0.5 text-accent2 font-medium">
                  {data.appName}
                </span>
                <span>· uso único · expira {expiresText ? `às ${expiresText}` : "em 30 min"}</span>
              </div>

              <div className="rounded-lg border border-border bg-bg3 p-2.5">
                <div className="break-all font-mono text-[11px] leading-snug text-text2">
                  {data.url}
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => { setData(null); }}
                  className="rounded-md border border-border bg-bg3 px-2.5 py-1.5 text-xs hover:border-border2"
                >
                  Gerar novo
                </button>
                <button
                  onClick={copy}
                  className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-md im-grad-accent px-3 py-1.5 text-xs font-medium text-white"
                >
                  {copied ? (
                    <><Check className="h-3.5 w-3.5" /> Copiado</>
                  ) : (
                    <><Copy className="h-3.5 w-3.5" /> Copiar link</>
                  )}
                </button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
