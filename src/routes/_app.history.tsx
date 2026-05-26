import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
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
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export const Route = createFileRoute("/_app/history")({
  component: HistoryPage,
  head: () => ({ meta: [{ title: "Histórico · Insta Manager" }] }),
});

type SortKey = "published_at" | "reach" | "likes" | "comments";
type Period = "7d" | "30d" | "90d" | "all";
const PERIODS: { id: Period; label: string }[] = [
  { id: "7d", label: "Últimos 7 dias" },
  { id: "30d", label: "Últimos 30 dias" },
  { id: "90d", label: "Últimos 90 dias" },
  { id: "all", label: "Tudo" },
];

function csvEscape(v: string | number) {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function HistoryPage() {
  const { data: history = [] } = useQuery({
    queryKey: ["history"],
    queryFn: () => api.listHistory(),
  });

  const [search, setSearch] = useState("");
  const [account, setAccount] = useState<string>("all");
  const [period, setPeriod] = useState<Period>("30d");
  const [sortKey, setSortKey] = useState<SortKey>("published_at");
  const [sortDir, setSortDir] = useState<"desc" | "asc">("desc");

  const accountsList = useMemo(
    () => Array.from(new Set(history.map((h) => h.account))).sort(),
    [history],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const cutoff =
      period === "all"
        ? 0
        : Date.now() -
          { "7d": 7, "30d": 30, "90d": 90 }[period] * 24 * 60 * 60 * 1000;
    return history
      .filter((h) => account === "all" || h.account === account)
      .filter((h) => cutoff === 0 || +new Date(h.published_at) >= cutoff)
      .filter((h) => !q || h.caption.toLowerCase().includes(q))
      .sort((a, b) => {
        const dir = sortDir === "desc" ? -1 : 1;
        if (sortKey === "published_at")
          return dir * (+new Date(a.published_at) - +new Date(b.published_at));
        return dir * ((a[sortKey] as number) - (b[sortKey] as number));
      });
  }, [history, search, account, period, sortKey, sortDir]);

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

  function toggleSort(k: SortKey) {
    if (sortKey === k) {
      setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    } else {
      setSortKey(k);
      setSortDir("desc");
    }
  }

  function exportCsv() {
    if (!filtered.length) {
      toast.error("Nada para exportar");
      return;
    }
    const rows = [
      ["Publicado", "Conta", "Legenda", "Alcance", "Likes", "Comentários"],
      ...filtered.map((h) => [
        h.published_at,
        `@${h.account}`,
        h.caption,
        h.reach,
        h.likes,
        h.comments,
      ]),
    ];
    const csv = rows.map((r) => r.map(csvEscape).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `historico-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`${filtered.length} linhas exportadas`);
  }

  const SortBtn = ({ k, label }: { k: SortKey; label: string }) => {
    const active = sortKey === k;
    const Arrow = active ? (sortDir === "desc" ? ChevronDown : ChevronUp) : ArrowUpDown;
    return (
      <button
        onClick={() => toggleSort(k)}
        className={[
          "inline-flex items-center gap-1 justify-end w-full",
          active ? "text-foreground" : "hover:text-foreground",
        ].join(" ")}
      >
        {label} <Arrow className="h-3 w-3" />
      </button>
    );
  };

  return (
    <div className="mx-auto max-w-7xl px-5 py-8 md:px-10">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted2">Histórico</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">Tudo que foi publicado</h1>
          <p className="mt-1 text-sm text-text2">
            {filtered.length} posts · alcance {totals.reach.toLocaleString("pt-BR")} · {totals.likes.toLocaleString("pt-BR")} likes ·{" "}
            {totals.comments.toLocaleString("pt-BR")} comentários
          </p>
        </div>
        <button
          onClick={exportCsv}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border2 bg-bg3 px-3 py-2 text-sm hover:border-accent"
        >
          <Download className="h-4 w-4" /> Exportar CSV
        </button>
      </header>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted2" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar na legenda…"
            className="w-full rounded-lg border border-border2 bg-bg3 py-2 pl-9 pr-3 text-sm outline-none focus:border-accent"
          />
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="rounded-lg border border-border2 bg-bg3 px-3 py-2 text-sm text-text2 hover:border-accent hover:text-foreground">
              Conta: {account === "all" ? "Todas" : `@${account}`}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="max-h-72 w-52 overflow-y-auto">
            <DropdownMenuItem onSelect={() => setAccount("all")}>Todas</DropdownMenuItem>
            {accountsList.map((u) => (
              <DropdownMenuItem key={u} onSelect={() => setAccount(u)}>
                @{u}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="rounded-lg border border-border2 bg-bg3 px-3 py-2 text-sm text-text2 hover:border-accent hover:text-foreground">
              {PERIODS.find((p) => p.id === period)?.label}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            {PERIODS.map((p) => (
              <DropdownMenuItem key={p.id} onSelect={() => setPeriod(p.id)}>
                {p.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="im-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-bg3 text-xs uppercase tracking-wider text-muted2">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Post</th>
                <th className="px-4 py-3 text-left font-medium">Conta</th>
                <th className="px-4 py-3 text-left font-medium">
                  <button
                    onClick={() => toggleSort("published_at")}
                    className="inline-flex items-center gap-1 hover:text-foreground"
                  >
                    Publicado {sortKey === "published_at" && (sortDir === "desc" ? <ChevronDown className="h-3 w-3" /> : <ChevronUp className="h-3 w-3" />)}
                  </button>
                </th>
                <th className="px-4 py-3 text-right font-medium"><SortBtn k="reach" label="Alcance" /></th>
                <th className="px-4 py-3 text-right font-medium"><SortBtn k="likes" label="Likes" /></th>
                <th className="px-4 py-3 text-right font-medium"><SortBtn k="comments" label="Comentários" /></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-sm text-text2">
                    Nenhum post no período selecionado.
                  </td>
                </tr>
              ) : (
                filtered.map((h) => (
                  <tr key={h.id} className="hover:bg-bg3/40">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <img src={h.thumb} alt="" className="h-10 w-10 rounded-md object-cover" />
                        <span className="line-clamp-1 max-w-xs">{h.caption}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-text2">@{h.account}</td>
                    <td className="px-4 py-3 text-text2">{fmtDateTime(h.published_at)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      <span className="inline-flex items-center gap-1 justify-end">
                        <Eye className="h-3.5 w-3.5 text-muted2" />
                        {h.reach.toLocaleString("pt-BR")}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      <span className="inline-flex items-center gap-1 justify-end">
                        <Heart className="h-3.5 w-3.5 text-muted2" /> {h.likes}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      <span className="inline-flex items-center gap-1 justify-end">
                        <MessageCircle className="h-3.5 w-3.5 text-muted2" /> {h.comments}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
