import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import { fmtDateTime } from "@/lib/format";
import {
  Eye,
  Heart,
  MessageCircle,
  Search,
  Download,
  ArrowUpDown,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  X,
  Play,
  FileText,
  Check,
  Loader2,
  Trash2,
  CalendarDays,
  ExternalLink,
  Server,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export const Route = createFileRoute("/_app/history")({
  component: HistoryPage,
  head: () => ({ meta: [{ title: "Histórico · Insta Manager" }] }),
});

type SortKey = "published_at" | "reach" | "likes" | "comments";
type Period = "today" | "7d" | "30d" | "90d" | "all" | "custom";
const PERIODS: { id: Period; label: string }[] = [
  { id: "today", label: "Hoje" },
  { id: "7d", label: "Últimos 7 dias" },
  { id: "30d", label: "Últimos 30 dias" },
  { id: "90d", label: "Últimos 90 dias" },
  { id: "all", label: "Tudo" },
  { id: "custom", label: "Período personalizado" },
];

function csvEscape(v: string | number) {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function initialsOf(s: string) {
  const t = (s || "?").replace(/^@/, "").trim();
  const parts = t.split(/[.\s_-]+/).filter(Boolean);
  const a = (parts[0]?.[0] ?? t[0] ?? "?").toUpperCase();
  const b = (parts[1]?.[0] ?? "").toUpperCase();
  return (a + b).slice(0, 2);
}

function colorFromString(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  const hue = h % 360;
  return `hsl(${hue} 55% 35%)`;
}

function AccountAvatar({
  src,
  name,
  size = 28,
}: {
  src?: string;
  name: string;
  size?: number;
}) {
  const [broken, setBroken] = useState(false);
  if (src && !broken) {
    return (
      <img
        src={src}
        alt=""
        onError={() => setBroken(true)}
        style={{ width: size, height: size }}
        className="rounded-full object-cover ring-1 ring-border"
      />
    );
  }
  return (
    <div
      style={{
        width: size,
        height: size,
        background: colorFromString(name),
        fontSize: size * 0.4,
      }}
      className="flex items-center justify-center rounded-full font-semibold uppercase text-white ring-1 ring-border"
    >
      {initialsOf(name)}
    </div>
  );
}

function MetaAppNameBadge({ name }: { name: string | null | undefined }) {
  if (!name) return null;
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium"
      style={{
        background: "color-mix(in oklab, var(--accent2) 12%, transparent)",
        color: "var(--accent2)",
        border: "1px solid color-mix(in oklab, var(--accent2) 25%, transparent)",
      }}
      title={`App usado: ${name}`}
    >
      <Server className="h-2.5 w-2.5" />
      {name}
    </span>
  );
}

function HistoryPage() {
  const { data: history = [] } = useQuery({
    queryKey: ["history"],
    queryFn: () => api.listHistory(),
  });
  const { data: accounts = [] } = useQuery({
    queryKey: ["accounts"],
    queryFn: () => api.listAccounts(),
  });

  // Mapa: account_id OU username → { username, avatar }
  const accountInfo = useMemo(() => {
    const m = new Map<string, { username: string; avatar: string; id: string }>();
    for (const a of accounts) {
      const info = { username: a.username, avatar: a.profile_picture, id: a.id };
      m.set(a.id, info);
      m.set(a.username, info);
    }
    return m;
  }, [accounts]);

  function resolveAccount(key: string) {
    return (
      accountInfo.get(key) ?? {
        username: key.length > 12 ? key.slice(0, 8) : key,
        avatar: "",
        id: key,
      }
    );
  }

  const [search, setSearch] = useState("");
  const [account, setAccount] = useState<string>("all");
  const [period, setPeriod] = useState<Period>("30d");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("published_at");
  const [sortDir, setSortDir] = useState<"desc" | "asc">("desc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [exporting, setExporting] = useState(false);
  const [exportDone, setExportDone] = useState(false);

  // reseta página quando filtros mudam
  useEffect(() => {
    setPage(1);
    setSelected(new Set());
  }, [search, account, period, customFrom, customTo, pageSize]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const now = Date.now();
    let from = 0;
    let to = Number.POSITIVE_INFINITY;
    if (period === "today") {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      from = d.getTime();
    } else if (period === "7d" || period === "30d" || period === "90d") {
      const days = { "7d": 7, "30d": 30, "90d": 90 }[period];
      from = now - days * 24 * 60 * 60 * 1000;
    } else if (period === "custom") {
      if (customFrom) from = new Date(customFrom).getTime();
      if (customTo) to = new Date(customTo).getTime() + 24 * 60 * 60 * 1000;
    }
    return history
      .filter((h) => {
        if (account === "all") return true;
        const info = resolveAccount(h.account);
        return info.id === account || info.username === account || h.account === account;
      })
      .filter((h) => {
        const t = +new Date(h.published_at);
        return t >= from && t < to;
      })
      .filter((h) => !q || h.caption.toLowerCase().includes(q))
      .sort((a, b) => {
        const dir = sortDir === "desc" ? -1 : 1;
        if (sortKey === "published_at")
          return dir * (+new Date(a.published_at) - +new Date(b.published_at));
        return dir * ((a[sortKey] as number) - (b[sortKey] as number));
      });
  }, [history, search, account, period, customFrom, customTo, sortKey, sortDir, accountInfo]);

  const totals = useMemo(
    () =>
      filtered.reduce(
        (s, h) => ({
          reach: s.reach + h.reach,
          likes: s.likes + h.likes,
          comments: s.comments + h.comments,
        }),
        { reach: 0, likes: 0, comments: 0 },
      ),
    [filtered],
  );

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageStart = (safePage - 1) * pageSize;
  const pageEnd = Math.min(pageStart + pageSize, filtered.length);
  const pageItems = filtered.slice(pageStart, pageEnd);

  function toggleSort(k: SortKey) {
    if (sortKey === k) setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    else {
      setSortKey(k);
      setSortDir("desc");
    }
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  const pageAllSelected =
    pageItems.length > 0 && pageItems.every((h) => selected.has(h.id));
  function togglePageAll() {
    setSelected((prev) => {
      const n = new Set(prev);
      if (pageAllSelected) pageItems.forEach((h) => n.delete(h.id));
      else pageItems.forEach((h) => n.add(h.id));
      return n;
    });
  }

  async function exportCsv(items: typeof filtered) {
    if (!items.length) {
      toast.error("Nada para exportar");
      return;
    }
    setExporting(true);
    setExportDone(false);
    try {
      await new Promise((r) => setTimeout(r, 250));
      const rows = [
        ["Publicado", "Conta", "Legenda", "Alcance", "Likes", "Comentários", "Permalink"],
        ...items.map((h) => {
          const info = resolveAccount(h.account);
          return [
            h.published_at,
            `@${info.username}`,
            h.caption,
            h.reach,
            h.likes,
            h.comments,
            (h as { permalink?: string }).permalink ?? "",
          ];
        }),
      ];
      const csv = rows.map((r) => r.map(csvEscape).join(",")).join("\n");
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `historico-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      setExportDone(true);
      setTimeout(() => setExportDone(false), 2000);
    } finally {
      setExporting(false);
    }
  }

  function deleteSelected() {
    // Apenas remove da seleção visual — sem rota backend de delete de history.
    toast.info(`${selected.size} item(ns) — exclusão real requer endpoint de histórico`);
    setSelected(new Set());
  }

  const SortBtn = ({ k, label }: { k: SortKey; label: string }) => {
    const active = sortKey === k;
    const Arrow = active ? (sortDir === "desc" ? ChevronDown : ChevronUp) : ArrowUpDown;
    return (
      <button
        onClick={() => toggleSort(k)}
        className={[
          "inline-flex w-full items-center justify-end gap-1 transition-colors duration-150",
          active ? "text-foreground" : "hover:text-foreground",
        ].join(" ")}
      >
        {label}
        <Arrow className={["h-3 w-3", active ? "opacity-100" : "opacity-60"].join(" ")} />
      </button>
    );
  };

  const periodLabel =
    period === "custom"
      ? customFrom && customTo
        ? `${customFrom} → ${customTo}`
        : "Período personalizado"
      : PERIODS.find((p) => p.id === period)?.label;

  const selectedAccountInfo = account !== "all" ? resolveAccount(account) : null;

  return (
    <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6 sm:py-7 md:px-10 md:py-8">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted2">
            Histórico
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
            Tudo que foi publicado
          </h1>
          <div className="mt-3 flex flex-wrap gap-1.5">
            <MetricPill icon={<FileText className="h-3.5 w-3.5" />} value={filtered.length} label="posts" />
            <MetricPill icon={<Eye className="h-3.5 w-3.5" />} value={totals.reach} label="alcance" />
            <MetricPill icon={<Heart className="h-3.5 w-3.5" />} value={totals.likes} label="likes" />
            <MetricPill icon={<MessageCircle className="h-3.5 w-3.5" />} value={totals.comments} label="comentários" />
          </div>
        </div>
        <button
          onClick={() => exportCsv(filtered)}
          disabled={exporting}
          className={[
            "inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm transition-colors duration-150",
            exportDone
              ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
              : "border-border2 bg-bg3 hover:border-accent",
          ].join(" ")}
        >
          {exporting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> Exportando…
            </>
          ) : exportDone ? (
            <>
              <Check className="h-4 w-4" /> CSV baixado
            </>
          ) : (
            <>
              <Download className="h-4 w-4" /> Exportar CSV
            </>
          )}
        </button>
      </header>

      {/* Filtros */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted2" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar na legenda…"
            className="w-full rounded-lg border border-border2 bg-bg3 py-2 pl-9 pr-9 text-sm outline-none transition-colors duration-150 focus:border-accent"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted2 transition hover:bg-bg4 hover:text-foreground"
              aria-label="Limpar busca"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Account dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="inline-flex items-center gap-2 rounded-lg border border-border2 bg-bg3 px-3 py-2 text-sm text-text2 transition-colors duration-150 hover:border-accent hover:text-foreground">
              {selectedAccountInfo ? (
                <>
                  <AccountAvatar
                    src={selectedAccountInfo.avatar}
                    name={selectedAccountInfo.username}
                    size={18}
                  />
                  @{selectedAccountInfo.username}
                </>
              ) : (
                <>Conta: Todas</>
              )}
              <ChevronDown className="h-3.5 w-3.5 opacity-60" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="max-h-80 w-60 overflow-y-auto">
            <DropdownMenuItem onSelect={() => setAccount("all")}>
              <span className="inline-flex h-[18px] w-[18px] items-center justify-center rounded-full bg-bg4 text-[10px]">
                ✦
              </span>
              <span className="ml-2">Todas as contas</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {accounts.map((a) => (
              <DropdownMenuItem key={a.id} onSelect={() => setAccount(a.id)}>
                <AccountAvatar src={a.profile_picture} name={a.username} size={18} />
                <span className="ml-2">@{a.username}</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Period dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="inline-flex items-center gap-2 rounded-lg border border-border2 bg-bg3 px-3 py-2 text-sm text-text2 transition-colors duration-150 hover:border-accent hover:text-foreground">
              <CalendarDays className="h-3.5 w-3.5" />
              {periodLabel}
              <ChevronDown className="h-3.5 w-3.5 opacity-60" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            {PERIODS.map((p) => (
              <DropdownMenuItem key={p.id} onSelect={() => setPeriod(p.id)}>
                {p.label}
                {period === p.id && <Check className="ml-auto h-3.5 w-3.5" />}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {period === "custom" && (
          <div className="flex items-center gap-1.5 rounded-lg border border-border2 bg-bg3 px-2 py-1.5 text-xs">
            <input
              type="date"
              value={customFrom}
              onChange={(e) => setCustomFrom(e.target.value)}
              className="rounded bg-transparent px-1 text-xs outline-none"
            />
            <span className="text-muted2">→</span>
            <input
              type="date"
              value={customTo}
              onChange={(e) => setCustomTo(e.target.value)}
              className="rounded bg-transparent px-1 text-xs outline-none"
            />
          </div>
        )}
      </div>

      {/* Toolbar flutuante (seleção) */}
      {selected.size > 0 && (
        <div
          className="sticky top-2 z-20 mb-3 flex flex-wrap items-center gap-2 rounded-lg border bg-bg2/95 px-3 py-2 text-sm shadow-lg backdrop-blur"
          style={{ borderColor: "var(--accent2)" }}
        >
          <span className="inline-flex items-center gap-1.5 font-medium">
            <span
              className="inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-semibold text-white"
              style={{ background: "var(--accent2)" }}
            >
              {selected.size}
            </span>
            selecionado{selected.size === 1 ? "" : "s"}
          </span>
          <div className="ml-auto flex items-center gap-1.5">
            <button
              onClick={() => exportCsv(filtered.filter((h) => selected.has(h.id)))}
              className="inline-flex items-center gap-1.5 rounded-md border border-border2 bg-bg3 px-2.5 py-1.5 text-xs hover:border-accent"
            >
              <Download className="h-3.5 w-3.5" /> Exportar selecionados
            </button>
            <button
              onClick={deleteSelected}
              className="inline-flex items-center gap-1.5 rounded-md border border-red-500/30 bg-red-500/10 px-2.5 py-1.5 text-xs text-red-300 hover:bg-red-500/20"
            >
              <Trash2 className="h-3.5 w-3.5" /> Excluir
            </button>
            <button
              onClick={() => setSelected(new Set())}
              className="rounded-md p-1.5 text-muted2 hover:bg-bg3 hover:text-foreground"
              aria-label="Limpar seleção"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Mobile: card list */}
      <div className="space-y-2 md:hidden">
        {pageItems.length === 0 ? (
          <div className="im-card p-8 text-center text-sm text-text2">Nenhum post encontrado.</div>
        ) : (
          pageItems.map((h) => {
            const info = resolveAccount(h.account);
            const isSelected = selected.has(h.id);
            const permalink = (h as { permalink?: string }).permalink;
            return (
              <article
                key={h.id}
                className={`im-card flex gap-3 p-3 ${isSelected ? "ring-1 ring-[var(--accent2)]" : ""}`}
              >
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => toggleSelect(h.id)}
                  className="mt-1 h-4 w-4 shrink-0 accent-[var(--accent2)]"
                  aria-label="Selecionar"
                />
                <PostThumb thumb={h.thumb} permalink={permalink} caption={h.caption} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <AccountAvatar src={info.avatar} name={info.username} size={20} />
                    <span className="truncate text-sm font-medium">@{info.username}</span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-[12px] text-text2">
                    {h.caption || <em className="text-muted2">sem legenda</em>}
                  </p>
                  <div className="mt-1 text-[10px] text-muted2">{fmtDateTime(h.published_at)}</div>
                  {(h as { meta_app_name?: string | null }).meta_app_name && (
                    <div className="mt-1">
                      <MetaAppNameBadge name={(h as { meta_app_name?: string | null }).meta_app_name} />
                    </div>
                  )}
                  <div className="mt-2 flex items-center gap-4 text-[12px] tabular-nums text-text2">
                    <span className="inline-flex items-center gap-1"><Eye className="h-3.5 w-3.5" />{h.reach}</span>
                    <span className="inline-flex items-center gap-1"><Heart className="h-3.5 w-3.5" />{h.likes}</span>
                    <span className="inline-flex items-center gap-1"><MessageCircle className="h-3.5 w-3.5" />{h.comments}</span>
                  </div>
                </div>
              </article>
            );
          })
        )}
      </div>

      {/* Desktop: tabela */}
      <div className="im-card hidden overflow-hidden md:block">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead
              className="text-[11px] uppercase tracking-wider text-muted2"
              style={{ background: "rgba(255,255,255,0.04)" }}
            >
              <tr>
                <th className="w-10 px-4 py-3 text-left font-medium">
                  <input
                    type="checkbox"
                    checked={pageAllSelected}
                    onChange={togglePageAll}
                    className="h-3.5 w-3.5 accent-[var(--accent2)]"
                    aria-label="Selecionar página"
                  />
                </th>
                <th className="px-4 py-3 text-left font-medium">Post</th>
                <th className="px-4 py-3 text-left font-medium">Conta</th>
                <th className="px-4 py-3 text-left font-medium">
                  <button
                    onClick={() => toggleSort("published_at")}
                    className={[
                      "inline-flex items-center gap-1 transition-colors duration-150",
                      sortKey === "published_at" ? "text-foreground" : "hover:text-foreground",
                    ].join(" ")}
                  >
                    Publicado
                    {sortKey === "published_at" ? (
                      sortDir === "desc" ? (
                        <ChevronDown className="h-3 w-3" />
                      ) : (
                        <ChevronUp className="h-3 w-3" />
                      )
                    ) : (
                      <ArrowUpDown className="h-3 w-3 opacity-60" />
                    )}
                  </button>
                </th>
                <th className="px-4 py-3 text-left font-medium">App</th>
                <th className="px-4 py-3 text-right font-medium">
                  <SortBtn k="reach" label="Alcance" />
                </th>
                <th className="px-4 py-3 text-right font-medium">
                  <SortBtn k="likes" label="Likes" />
                </th>
                <th className="px-4 py-3 text-right font-medium">
                  <SortBtn k="comments" label="Comentários" />
                </th>
              </tr>
            </thead>
            <tbody>
              {pageItems.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-sm text-text2">
                    Nenhum post encontrado com os filtros atuais.
                  </td>
                </tr>
              ) : (
                pageItems.map((h, idx) => {
                  const info = resolveAccount(h.account);
                  const isSelected = selected.has(h.id);
                  const permalink = (h as { permalink?: string }).permalink;
                  const synced = h.reach > 0 || h.likes > 0 || h.comments > 0;
                  const syncTooltip = synced
                    ? `Métricas sincronizadas em ${fmtDateTime(h.published_at)}`
                    : "Aguardando sincronização";
                  return (
                    <tr
                      key={h.id}
                      className={[
                        "border-b border-border transition-colors duration-150 hover:bg-white/[0.04]",
                        idx % 2 === 1 ? "bg-white/[0.02]" : "",
                        isSelected ? "bg-[var(--accent2)]/5" : "",
                      ].join(" ")}
                    >
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelect(h.id)}
                          className="h-3.5 w-3.5 accent-[var(--accent2)]"
                          aria-label="Selecionar linha"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <PostThumb thumb={h.thumb} permalink={permalink} caption={h.caption} />
                          <span className="line-clamp-2 max-w-xs text-text2">{h.caption || <em className="text-muted2">sem legenda</em>}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <AccountAvatar src={info.avatar} name={info.username} size={26} />
                          <span className="truncate font-medium">@{info.username}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-text2">{fmtDateTime(h.published_at)}</td>
                      <td className="px-4 py-3">
                        <MetaAppNameBadge name={(h as { meta_app_name?: string | null }).meta_app_name} />
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        <MetricCell value={h.reach} icon={Eye} tooltip={syncTooltip} />
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        <MetricCell value={h.likes} icon={Heart} tooltip={syncTooltip} />
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        <MetricCell value={h.comments} icon={MessageCircle} tooltip={syncTooltip} />
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Paginação */}
        {filtered.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3 text-xs text-text2">
            <div>
              Mostrando{" "}
              <span className="font-medium text-foreground">
                {pageStart + 1}–{pageEnd}
              </span>{" "}
              de <span className="font-medium text-foreground">{filtered.length}</span> posts
            </div>
            <div className="flex items-center gap-3">
              <label className="inline-flex items-center gap-1.5">
                <span className="text-muted2">por página</span>
                <select
                  value={pageSize}
                  onChange={(e) => setPageSize(Number(e.target.value))}
                  className="rounded-md border border-border2 bg-bg3 px-1.5 py-1 text-xs outline-none focus:border-accent"
                >
                  {[10, 25, 50].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={safePage === 1}
                  className="rounded-md border border-border2 bg-bg3 p-1.5 transition hover:border-accent disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </button>
                <select
                  value={safePage}
                  onChange={(e) => setPage(Number(e.target.value))}
                  className="rounded-md border border-border2 bg-bg3 px-2 py-1 text-xs outline-none focus:border-accent"
                >
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map((n) => (
                    <option key={n} value={n}>
                      {n} / {totalPages}
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={safePage === totalPages}
                  className="rounded-md border border-border2 bg-bg3 p-1.5 transition hover:border-accent disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function MetricPill({
  icon,
  value,
  label,
}: {
  icon: React.ReactNode;
  value: number;
  label: string;
}) {
  const zero = value === 0;
  return (
    <span
      className={[
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs",
        zero
          ? "border-border bg-bg3 text-muted2"
          : "border-border2 bg-bg3 text-foreground",
      ].join(" ")}
    >
      <span className={zero ? "text-muted2" : "text-[var(--accent2)]"}>{icon}</span>
      <span className={zero ? "" : "font-semibold tabular-nums"}>
        {value.toLocaleString("pt-BR")}
      </span>
      <span className="text-muted2">{label}</span>
    </span>
  );
}

function MetricCell({
  value,
  icon: Icon,
  tooltip,
}: {
  value: number;
  icon: typeof Eye;
  tooltip: string;
}) {
  const zero = value === 0;
  return (
    <span
      title={tooltip}
      className={[
        "inline-flex items-center justify-end gap-1",
        zero ? "text-muted2" : "font-semibold text-foreground",
      ].join(" ")}
    >
      <Icon className={["h-3.5 w-3.5", zero ? "text-muted2" : "text-[var(--accent2)]"].join(" ")} />
      {value.toLocaleString("pt-BR")}
    </span>
  );
}

function PostThumb({
  thumb,
  permalink,
  caption,
}: {
  thumb: string;
  permalink?: string;
  caption: string;
}) {
  const [broken, setBroken] = useState(false);
  const hasImg = !!thumb && !broken;
  const Wrapper: React.ElementType = permalink ? "a" : "div";
  const wrapperProps = permalink
    ? { href: permalink, target: "_blank", rel: "noreferrer", title: "Abrir no Instagram" }
    : { title: caption };
  return (
    <Wrapper
      {...wrapperProps}
      className="group relative block h-12 w-12 flex-shrink-0 overflow-hidden rounded-md ring-1 ring-border transition hover:ring-[var(--accent2)]"
    >
      {hasImg ? (
        <img
          src={thumb}
          alt=""
          onError={() => setBroken(true)}
          className="h-full w-full object-cover"
        />
      ) : (
        <div
          className="flex h-full w-full items-center justify-center"
          style={{
            background:
              "linear-gradient(135deg, color-mix(in oklch, var(--accent2) 30%, #1a1a1a), #111)",
          }}
        >
          <Play className="h-4 w-4 text-white/80" fill="currentColor" />
        </div>
      )}
      {permalink && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition-all duration-150 group-hover:bg-black/60 group-hover:opacity-100">
          <ExternalLink className="h-4 w-4 text-white" />
        </div>
      )}
    </Wrapper>
  );
}
