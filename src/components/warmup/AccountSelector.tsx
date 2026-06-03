import { useState, useMemo } from "react";
import { Search, Users, X } from "lucide-react";
import type { Model } from "@/lib/api-client";

type AccountLite = {
  id: string;
  username: string;
  profile_picture: string;
  health_score: number;
  followers?: number;
  last_post_at?: string;
  paused?: boolean;
  token_status?: string;
  model_id?: string | null;
};

type SortKey =
  | "followers_desc"
  | "followers_asc"
  | "health_desc"
  | "health_asc"
  | "alpha"
  | "last_activity";

type Props = {
  accounts: AccountLite[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  models?: Model[];
};

function HealthBadge({ score }: { score: number }) {
  const color =
    score >= 80 ? "var(--success)" : score >= 60 ? "var(--warning)" : "var(--danger)";
  return (
    <span
      className="inline-flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-semibold tabular-nums text-white"
      style={{ background: color }}
      title={`Saúde: ${score}`}
    >
      {score}
    </span>
  );
}

export function AccountSelector({ accounts, selectedIds, onChange, models = [] }: Props) {
  const [localFilter, setLocalFilter] = useState("");
  const [sort, setSort] = useState<SortKey>("followers_desc");

  const toggle = (id: string) =>
    onChange(
      selectedIds.includes(id)
        ? selectedIds.filter((x) => x !== id)
        : [...selectedIds, id],
    );

  const allSelected = accounts.length > 0 && selectedIds.length === accounts.length;
  const toggleAll = () => onChange(allSelected ? [] : accounts.map((a) => a.id));

  const selectHealthy = () =>
    onChange(accounts.filter((a) => (a.health_score ?? 0) >= 80).map((a) => a.id));
  const selectInUse = () =>
    onChange(
      accounts.filter((a) => !a.paused && a.token_status === "valid").map((a) => a.id),
    );

  const selectByModel = (modelId: string | null) => {
    const ids = accounts
      .filter((a) => (a.model_id ?? null) === modelId)
      .map((a) => a.id);
    onChange(ids);
  };

  const filtered = useMemo(
    () =>
      accounts
        .filter((a) =>
          localFilter
            ? a.username.toLowerCase().includes(localFilter.toLowerCase())
            : true,
        )
        .slice()
        .sort((a, b) => {
          switch (sort) {
            case "followers_desc": return (b.followers ?? 0) - (a.followers ?? 0);
            case "followers_asc":  return (a.followers ?? 0) - (b.followers ?? 0);
            case "health_desc":    return (b.health_score ?? 0) - (a.health_score ?? 0);
            case "health_asc":     return (a.health_score ?? 0) - (b.health_score ?? 0);
            case "alpha":          return a.username.localeCompare(b.username);
            case "last_activity": {
              const at = a.last_post_at ? new Date(a.last_post_at).getTime() : 0;
              const bt = b.last_post_at ? new Date(b.last_post_at).getTime() : 0;
              return bt - at;
            }
          }
        }),
    [accounts, localFilter, sort],
  );

  const grouped = useMemo(() => {
    const byId = new Map<string, Model>(models.map((m) => [m.id, m]));
    const groups: { key: string; model: Model | null; items: AccountLite[] }[] = [];
    const map = new Map<string, AccountLite[]>();
    for (const a of filtered) {
      const k = a.model_id && byId.has(a.model_id) ? a.model_id : "__none__";
      const arr = map.get(k) ?? [];
      arr.push(a);
      map.set(k, arr);
    }
    for (const m of models) {
      if (map.has(m.id)) groups.push({ key: m.id, model: m, items: map.get(m.id)! });
    }
    if (map.has("__none__"))
      groups.push({ key: "__none__", model: null, items: map.get("__none__")! });
    return groups;
  }, [filtered, models]);

  const renderAccount = (a: AccountLite) => {
    const checked = selectedIds.includes(a.id);
    return (
      <li key={a.id}>
        <label
          className={[
            "flex h-12 cursor-pointer items-center gap-2 rounded-[8px] border bg-bg3 px-2 text-sm transition hover:-translate-y-[1px]",
            checked ? "border-[var(--accent2)]" : "border-border hover:border-border2",
          ].join(" ")}
        >
          <input
            type="checkbox"
            checked={checked}
            onChange={() => toggle(a.id)}
            className="h-3.5 w-3.5 accent-[var(--accent2)]"
          />
          <img src={a.profile_picture} alt="" className="h-7 w-7 flex-shrink-0 rounded-full" />
          <span className="min-w-0 flex-1 truncate">@{a.username}</span>
          <span className="text-[10px] tabular-nums text-muted2">
            {a.followers != null
              ? a.followers >= 1000
                ? `${(a.followers / 1000).toFixed(1)}k`
                : a.followers
              : "—"}
          </span>
          <HealthBadge score={a.health_score ?? 0} />
        </label>
      </li>
    );
  };

  return (
    <section className="space-y-3 rounded-[10px] border border-border bg-bg3/30 p-4">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-text2">
          <Users className="h-3.5 w-3.5" /> Contas que recebem
        </h3>
        <span
          className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold text-white"
          style={{ background: "var(--accent2)" }}
        >
          {selectedIds.length} de {accounts.length} selecionada{accounts.length === 1 ? "" : "s"}
        </span>
      </div>

      {/* Busca + sort + select all */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[180px] flex-1">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted2" />
          <input
            value={localFilter}
            onChange={(e) => setLocalFilter(e.target.value)}
            placeholder="Buscar conta…"
            className="w-full rounded-[8px] border border-border2 bg-bg3 py-1.5 pl-7 pr-2 text-xs outline-none focus:border-[var(--accent2)]"
          />
        </div>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as SortKey)}
          className="rounded-[8px] border border-border2 bg-bg3 px-2 py-1.5 text-xs text-text2 outline-none focus:border-[var(--accent2)]"
        >
          <option value="followers_desc">Mais seguidores</option>
          <option value="followers_asc">Menos seguidores</option>
          <option value="health_desc">Maior saúde</option>
          <option value="health_asc">Menor saúde</option>
          <option value="alpha">Alfabético</option>
          <option value="last_activity">Última atividade</option>
        </select>
        <button
          onClick={toggleAll}
          className="rounded-[8px] border border-border2 bg-bg3 px-2 py-1.5 text-[11px] text-text2 transition hover:text-foreground"
        >
          {allSelected ? "Desmarcar todas" : "Selecionar todas"}
        </button>
      </div>

      {/* Seleções rápidas */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted2">
        <button onClick={selectHealthy} className="hover:text-foreground">Selecionar saudáveis</button>
        <span>·</span>
        <button onClick={selectInUse} className="hover:text-foreground">Selecionar em uso</button>
        <span>·</span>
        <button onClick={() => onChange([])} className="hover:text-red-300">Limpar</button>
      </div>

      {/* Selecionar por modelo */}
      {models.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
          <span className="text-muted2">Por modelo:</span>
          {models.map((m) => (
            <button
              key={m.id}
              onClick={() => selectByModel(m.id)}
              className="inline-flex items-center gap-1 rounded-full border border-border2 bg-bg3 px-2 py-0.5 hover:border-[var(--accent2)]"
            >
              <span className="h-2 w-2 rounded-full" style={{ background: m.color }} />
              {m.name}
            </button>
          ))}
          <button
            onClick={() => selectByModel(null)}
            className="inline-flex items-center gap-1 rounded-full border border-border2 bg-bg3 px-2 py-0.5 hover:border-[var(--accent2)]"
          >
            <span className="h-2 w-2 rounded-full bg-muted2" />
            Sem modelo
          </button>
        </div>
      )}

      {/* Chips das selecionadas */}
      {selectedIds.length > 0 && (
        <div className="flex max-h-[58px] flex-wrap gap-1.5 overflow-hidden">
          {selectedIds.slice(0, 10).map((id) => {
            const a = accounts.find((x) => x.id === id);
            if (!a) return null;
            return (
              <button
                key={id}
                onClick={() => toggle(id)}
                className="group inline-flex items-center gap-1.5 rounded-full border border-border2 bg-bg3 py-0.5 pl-0.5 pr-2 text-[11px] transition hover:border-[var(--accent2)]"
              >
                <img src={a.profile_picture} alt="" className="h-4 w-4 rounded-full" />
                <span>@{a.username}</span>
                <X className="h-3 w-3 text-muted2 group-hover:text-red-300" />
              </button>
            );
          })}
          {selectedIds.length > 10 && (
            <span className="inline-flex items-center rounded-full bg-bg4 px-2 py-0.5 text-[11px] text-muted2">
              +{selectedIds.length - 10} mais
            </span>
          )}
        </div>
      )}

      {/* Lista de contas agrupadas por modelo */}
      <div className="max-h-[400px] space-y-3 overflow-y-auto pr-1">
        {grouped.length === 0 && (
          <div className="rounded-[8px] border border-border bg-bg3 p-3 text-center text-xs text-muted2">
            {localFilter ? `Nenhuma conta corresponde a "${localFilter}"` : "Nenhuma conta"}
          </div>
        )}
        {grouped.map((g) => {
          const color = g.model?.color ?? "#71717a";
          const label = g.model?.name ?? "Sem modelo";
          const groupIds = g.items.map((i) => i.id);
          const allInGroupSelected = groupIds.every((id) => selectedIds.includes(id));
          return (
            <div key={g.key} className="space-y-1.5">
              <div
                className="flex items-center justify-between gap-2 rounded-[6px] border px-2 py-1"
                style={{
                  borderColor: `color-mix(in oklab, ${color} 40%, var(--border))`,
                  background: `color-mix(in oklab, ${color} 8%, transparent)`,
                }}
              >
                <div className="flex items-center gap-2 text-[11px] font-semibold">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />
                  <span style={{ color }}>{label}</span>
                  <span className="text-muted2">· {g.items.length}</span>
                </div>
                <button
                  onClick={() =>
                    onChange(
                      allInGroupSelected
                        ? selectedIds.filter((id) => !groupIds.includes(id))
                        : Array.from(new Set([...selectedIds, ...groupIds])),
                    )
                  }
                  className="text-[10px] text-muted2 hover:text-foreground"
                >
                  {allInGroupSelected ? "desmarcar" : "selecionar"}
                </button>
              </div>
              <ul className="grid grid-cols-1 gap-1.5 md:grid-cols-2">
                {g.items.map(renderAccount)}
              </ul>
            </div>
          );
        })}
      </div>
    </section>
  );
}
