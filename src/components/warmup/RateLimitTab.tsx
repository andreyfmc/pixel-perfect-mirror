import { useEffect, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { api } from "@/lib/api-client";

type AccountLite = {
  id: string;
  username: string;
  profile_picture: string;
  health_score: number;
  token_status: "valid" | "expired";
  last_post_at?: string;
};

const RL_STORAGE_KEY = "warmup.rate-limits.v1";

type RateLimitConfig = {
  gapMinutes: number;
  jitterMinutes: number;
  maxPerDay: number;
};

const RL_DEFAULTS: RateLimitConfig = {
  gapMinutes: 60,
  jitterMinutes: 20,
  maxPerDay: 25,
};

function loadRL(): RateLimitConfig {
  if (typeof window === "undefined") return RL_DEFAULTS;
  try {
    const v = JSON.parse(window.localStorage.getItem(RL_STORAGE_KEY) ?? "");
    return { ...RL_DEFAULTS, ...v };
  } catch {
    return RL_DEFAULTS;
  }
}

export function RateLimitTab({ accounts }: { accounts: AccountLite[] }) {
  const [cfg, setCfg] = useState<RateLimitConfig>(loadRL);
  const [checking, setChecking] = useState<string | null>(null);
  const [results, setResults] = useState<
    Record<string, { ok: boolean; msg: string }>
  >({});

  useEffect(() => {
    try {
      window.localStorage.setItem(RL_STORAGE_KEY, JSON.stringify(cfg));
    } catch {}
  }, [cfg]);

  async function checkUsage(id: string) {
    setChecking(id);
    try {
      const r = await api.validateAccount(id);
      setResults((prev) => ({
        ...prev,
        [id]: {
          ok: !!r?.ok,
          msg: r?.ok
            ? `OK · ${r.ig?.username ?? r.me?.name ?? "credencial válida"}`
            : r?.needs_reconnect
              ? "Precisa reconectar"
              : "Falha — verificar",
        },
      }));
    } finally {
      setChecking(null);
    }
  }

  async function checkAll() {
    for (const a of accounts) await checkUsage(a.id);
  }

  return (
    <div className="space-y-6">
      {/* Limites oficiais */}
      <div className="grid gap-4 md:grid-cols-3">
        {[
          {
            label: "Posts / 24h por conta IG",
            value: "25",
            hint: "Limite oficial Graph API (Instagram Content Publishing)",
          },
          {
            label: "Chamadas / hora por app",
            value: "200",
            hint: "Por usuário · X-App-Usage",
          },
          {
            label: "Reels por dia",
            value: "~50",
            hint: "Soft cap antishadowban observado",
          },
        ].map((c) => (
          <div key={c.label} className="rounded-xl border border-border bg-bg3 p-4">
            <div className="text-[10px] uppercase tracking-wider text-muted2">
              {c.label}
            </div>
            <div className="mt-1 text-2xl font-semibold tabular-nums">{c.value}</div>
            <div className="mt-1 text-[11px] text-muted2 leading-snug">{c.hint}</div>
          </div>
        ))}
      </div>

      {/* Defaults globais */}
      <div className="rounded-xl border border-border bg-bg3/40 p-5 space-y-5">
        <div>
          <h3 className="text-sm font-semibold">Defaults globais</h3>
          <p className="text-xs text-muted2 mt-0.5">
            Aplicado como sugestão inicial na aba <b>Postagem</b>. Ajuste para
            respeitar os limites da Meta acima.
          </p>
        </div>
        {[
          {
            key: "gapMinutes",
            label: "Intervalo entre ciclos (min)",
            min: 5,
            max: 240,
            step: 5,
          },
          {
            key: "jitterMinutes",
            label: "Jitter ± entre contas (min)",
            min: 0,
            max: 60,
            step: 1,
          },
          {
            key: "maxPerDay",
            label: "Máx posts/dia por conta",
            min: 1,
            max: 50,
            step: 1,
          },
        ].map((s) => {
          const v = cfg[s.key as keyof RateLimitConfig];
          return (
            <div key={s.key}>
              <div className="flex items-center justify-between text-xs mb-1.5">
                <span className="text-text2">{s.label}</span>
                <span className="font-medium tabular-nums">{v}</span>
              </div>
              <input
                type="range"
                min={s.min}
                max={s.max}
                step={s.step}
                value={v}
                onChange={(e) =>
                  setCfg((c) => ({ ...c, [s.key]: Number(e.target.value) }))
                }
                className="w-full accent-accent"
              />
            </div>
          );
        })}
      </div>

      {/* Verificação ao vivo */}
      <div className="rounded-xl border border-border bg-bg3/40 p-5">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold">Uso atual (live)</h3>
            <p className="text-xs text-muted2 mt-0.5">
              Faz uma chamada à Graph API e mostra o estado da credencial.
            </p>
          </div>
          <button
            onClick={checkAll}
            disabled={!!checking}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border2 bg-bg3 px-3 py-1.5 text-xs hover:text-foreground disabled:opacity-50"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${checking ? "animate-spin" : ""}`}
            />
            Verificar todas
          </button>
        </div>
        <ul className="space-y-1.5">
          {accounts.map((a) => {
            const r = results[a.id];
            return (
              <li
                key={a.id}
                className="flex items-center gap-3 rounded-lg border border-border bg-bg3 p-2.5"
              >
                <img
                  src={a.profile_picture}
                  alt=""
                  className="h-7 w-7 rounded-full"
                />
                <span className="flex-1 truncate text-sm">@{a.username}</span>
                {r && (
                  <span
                    className={`text-xs ${r.ok ? "text-emerald-400" : "text-red-400"}`}
                  >
                    {r.msg}
                  </span>
                )}
                <button
                  onClick={() => checkUsage(a.id)}
                  disabled={checking === a.id}
                  className="rounded-md border border-border2 bg-bg3 px-2 py-1 text-[11px] text-text2 hover:text-foreground disabled:opacity-50"
                >
                  {checking === a.id ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    "verificar"
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
