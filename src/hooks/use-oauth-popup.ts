import { useCallback, useEffect, useRef, useState } from "react";

export type OAuthResult = {
  ok: boolean;
  provider?: "facebook" | "instagram";
  saved?: string[];
  error?: string | null;
};

function isMobile(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
}

export function useOAuthPopup() {
  const [loading, setLoading] = useState<null | "instagram" | "facebook">(null);
  const resolverRef = useRef<((r: OAuthResult) => void) | null>(null);
  const popupRef = useRef<Window | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    function onMessage(ev: MessageEvent) {
      const data = ev.data as { source?: string; payload?: OAuthResult } | null;
      if (!data || data.source !== "ig-oauth" || !data.payload) return;
      cleanup();
      resolverRef.current?.(data.payload);
      resolverRef.current = null;
    }
    window.addEventListener("message", onMessage);
    return () => {
      window.removeEventListener("message", onMessage);
      cleanup();
    };
  }, []);

  function cleanup() {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = null;
    setLoading(null);
  }

  const connect = useCallback(
    async (provider: "instagram" | "facebook"): Promise<OAuthResult> => {
      setLoading(provider);
      try {
        const res = await fetch(`/api/auth/instagram?provider=${provider}`);
        const j = (await res.json()) as { url?: string; message?: string };
        if (!res.ok || !j.url) {
          cleanup();
          return { ok: false, error: j.message ?? "Falha ao gerar URL de autorização" };
        }

        if (isMobile()) {
          window.location.href = j.url;
          return new Promise(() => {});
        }

        const w = 600;
        const h = 720;
        const left = window.screenX + Math.max(0, (window.innerWidth - w) / 2);
        const top = window.screenY + Math.max(0, (window.innerHeight - h) / 2);
        const popup = window.open(
          j.url,
          "ig-oauth",
          `width=${w},height=${h},left=${left},top=${top}`,
        );
        if (!popup) {
          cleanup();
          window.location.href = j.url;
          return new Promise(() => {});
        }
        popupRef.current = popup;

        return await new Promise<OAuthResult>((resolve) => {
          resolverRef.current = resolve;
          pollRef.current = setInterval(() => {
            if (popup.closed) {
              cleanup();
              resolverRef.current?.({ ok: false, error: "Janela fechada" });
              resolverRef.current = null;
            }
          }, 600);
        });
      } catch (e) {
        cleanup();
        return { ok: false, error: (e as Error).message };
      }
    },
    [],
  );

  return { connect, loading };
}
