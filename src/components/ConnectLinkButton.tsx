// Botão "Gerar link de conexão" + modal com URL única para conectar uma
// conta Instagram que já é Testadora do app Meta. O link expira em 30min
// e é de uso único.

import { useState } from "react";
import { toast } from "sonner";
import { Link2, Copy, Check, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type LinkResponse = {
  url?: string;
  state?: string;
  expiresAt?: string;
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
  const [data, setData] = useState<{ url: string; expiresAt: string } | null>(null);
  const [copied, setCopied] = useState(false);

  async function generate() {
    setLoading(true);
    setData(null);
    setCopied(false);
    try {
      const res = await fetch("/api/auth/instagram/link", { method: "POST" });
      const j = (await res.json()) as LinkResponse;
      if (!res.ok || !j.url) {
        toast.error(j.message ?? "Falha ao gerar link");
        return;
      }
      setData({ url: j.url, expiresAt: j.expiresAt ?? "" });
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
      <button
        type="button"
        className={triggerClass}
        onClick={() => {
          setOpen(true);
          generate();
        }}
      >
        <Link2 className="h-3.5 w-3.5" /> {label}
      </button>

      <Dialog
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          if (!v) {
            setData(null);
            setCopied(false);
          }
        }}
      >
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Link de conexão Instagram</DialogTitle>
            <DialogDescription>
              Abra este link no navegador onde o Instagram está logado e clique em Autorizar.
              A conta precisa ser Testadora do app no painel Meta.
            </DialogDescription>
          </DialogHeader>

          {loading || !data ? (
            <div className="flex items-center gap-2 py-6 text-sm text-text2">
              <Loader2 className="h-4 w-4 animate-spin" /> Gerando link único…
            </div>
          ) : (
            <div className="space-y-3">
              <div className="rounded-lg border border-border bg-bg3 p-2.5">
                <div className="break-all font-mono text-[11px] leading-snug text-text2">
                  {data.url}
                </div>
              </div>
              <div className="flex items-center justify-between gap-2">
                <div className="text-[11px] text-muted2">
                  Uso único · expira {expiresText ? `às ${expiresText}` : "em 30 min"}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={generate}
                    className="rounded-md border border-border bg-bg3 px-2.5 py-1.5 text-xs hover:border-border2"
                  >
                    Gerar novo
                  </button>
                  <button
                    onClick={copy}
                    className="inline-flex items-center gap-1.5 rounded-md im-grad-accent px-3 py-1.5 text-xs font-medium text-white"
                  >
                    {copied ? (
                      <>
                        <Check className="h-3.5 w-3.5" /> Copiado
                      </>
                    ) : (
                      <>
                        <Copy className="h-3.5 w-3.5" /> Copiar link
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
