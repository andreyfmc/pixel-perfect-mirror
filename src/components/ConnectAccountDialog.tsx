import { useState } from "react";
import { Facebook, Instagram, Loader2, X } from "lucide-react";
import { useOAuthPopup } from "@/hooks/use-oauth-popup";

export function ConnectAccountDialog({
  open,
  onClose,
  onConnected,
}: {
  open: boolean;
  onClose: () => void;
  onConnected?: (saved: string[]) => void;
}) {
  const { connect, loading } = useOAuthPopup();
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  async function handle(provider: "instagram" | "facebook") {
    setError(null);
    const r = await connect(provider);
    if (!r.ok) {
      setError(r.error ?? "Falha ao conectar");
      return;
    }
    onConnected?.(r.saved ?? []);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="im-card w-full max-w-md p-6"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal
      >
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold">Conectar conta</h2>
            <p className="mt-1 text-sm text-text2">
              Escolha como você quer autorizar.
            </p>
          </div>
          <button onClick={onClose} className="text-text2 hover:text-foreground" aria-label="Fechar">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-3">
          <button
            disabled={loading !== null}
            onClick={() => handle("facebook")}
            className="flex w-full items-center gap-3 rounded-lg border border-border2 bg-bg3 p-4 text-left hover:border-accent disabled:opacity-60"
          >
            <span className="grid h-10 w-10 place-items-center rounded-full bg-[#1877F2] text-white">
              <Facebook className="h-5 w-5" />
            </span>
            <span className="flex-1">
              <span className="block text-sm font-semibold">Facebook Login</span>
              <span className="block text-xs text-text2">
                Para Instagram Business vinculado a uma Página do Facebook.
              </span>
            </span>
            {loading === "facebook" && <Loader2 className="h-4 w-4 animate-spin text-text2" />}
          </button>

          <button
            disabled={loading !== null}
            onClick={() => handle("instagram")}
            className="flex w-full items-center gap-3 rounded-lg border border-border2 bg-bg3 p-4 text-left hover:border-accent disabled:opacity-60"
          >
            <span className="grid h-10 w-10 place-items-center rounded-full im-grad-accent text-white">
              <Instagram className="h-5 w-5" />
            </span>
            <span className="flex-1">
              <span className="block text-sm font-semibold">Instagram Login</span>
              <span className="block text-xs text-text2">
                Login direto para contas Business sem Página do Facebook.
              </span>
            </span>
            {loading === "instagram" && <Loader2 className="h-4 w-4 animate-spin text-text2" />}
          </button>
        </div>

        {error && (
          <p className="mt-4 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
