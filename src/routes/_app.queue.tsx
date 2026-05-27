import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import { fmtDateTime } from "@/lib/format";
import type { QueueItem } from "@/lib/mock";
import { useOAuthPopup } from "@/hooks/use-oauth-popup";
import {
  AlertTriangle,
  BarChart3,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Clock3,
  Eraser,
  ExternalLink,
  Image as ImageIcon,
  Layers,
  ListChecks,
  Loader2,
  MoreHorizontal,
  Pause,
  Play,
  RefreshCw,
  Rows3,
  Search,
  Trash2,
  Users,
  X,
  XCircle,
  Zap,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export const Route = createFileRoute("/_app/queue")({
  component: QueuePage,
  head: () => ({ meta: [{ title: "Fila · Insta Manager" }] }),
});

type StatusKey = QueueItem["status"];
type FilterKey = "all" | StatusKey;
type DateFilterKey = "all" | "today" | "tomorrow" | "after-tomorrow" | "this-week" | string;
type SortKey = "asc" | "desc";
type Density = "expanded" | "compact";

type AccountMeta = {
  id: string;
  username: string;
  name: string;
  profile_picture: string;
  token_status?: "valid" | "expired";
  token_expires_at?: string | null;
  provider?: "facebook" | "instagram";
};

type QueueGroup = {
  id: string;
  scheduledAt: string;
  caption: string;
  mediaType: QueueItem["media_type"];
  thumb: string;
  items: QueueItem[];
  status: StatusKey;
  counts: Record<StatusKey, number>;
  accounts: AccountMeta[];
};

const STATUS_META: Record<StatusKey, { bg: string; fg: string; label: string; short: string }> = {
  scheduled: {
    bg: "color-mix(in oklab, var(--info) 16%, transparent)",
    fg: "var(--info)",
    label: "Agendado",
    short: "Pendente",
  },
  processing: {
    bg: "color-mix(in oklab, var(--warning) 18%, transparent)",
    fg: "var(--warning)",
    label: "Processando",
    short: "Rodando",
  },
  failed: {
    bg: "color-mix(in oklab, var(--danger) 18%, transparent)",
    fg: "var(--danger)",
    label: "Falhou",
    short: "Erro",
  },
  canceled: {
    bg: "color-mix(in oklab, var(--muted) 22%, transparent)",
    fg: "var(--text2)",
    label: "Pausado",
    short: "Pausado",
  },
  published: {
    bg: "color-mix(in oklab, var(--success) 16%, transparent)",
    fg: "var(--success)",
    label: "Publicado",
    short: "Publicado",
  },
};

const TYPE_BADGE: Record<string, { bg: string; fg: string }> = {
  REEL: { bg: "color-mix(in oklab, var(--accent2) 22%, transparent)", fg: "var(--accent2)" },
  IMAGE: { bg: "color-mix(in oklab, #3b82f6 22%, transparent)", fg: "#7aa8ff" },
  STORY: { bg: "color-mix(in oklab, #ec4899 22%, transparent)", fg: "#f9a8d4" },
  CAROUSEL: { bg: "color-mix(in oklab, #f97316 22%, transparent)", fg: "#ffb072" },
};

const FILTERS: { id: FilterKey; label: string; key: string }[] = [
  { id: "all", label: "Todos", key: "T" },
  { id: "scheduled", label: "Pendentes", key: "P" },
  { id: "processing", label: "Rodando", key: "R" },
  { id: "published", label: "Publicados", key: "U" },
  { id: "failed", label: "Erros", key: "E" },
  { id: "canceled", label: "Pausados", key: "S" },
];

const STATUS_PRIORITY: StatusKey[] = ["failed", "processing", "scheduled", "canceled", "published"];

function localDateKey(value: string | Date) {
  const d = value instanceof Date ? value : new Date(value);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function addDays(base: Date, days: number) {
  const d = new Date(base);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + days);
  return d;
}

function dateChipLabel(key: DateFilterKey) {
  const today = localDateKey(new Date());
  const tomorrow = localDateKey(addDays(new Date(), 1));
  const afterTomorrow = localDateKey(addDays(new Date(), 2));
  if (key === "all") return "Todos os dias";
  if (key === "this-week") return "Esta semana";
  if (key === "today" || key === today) return "Hoje";
  if (key === "tomorrow" || key === tomorrow) return "Amanhã";
  if (key === "after-tomorrow" || key === afterTomorrow) return "Depois de amanhã";
  const [year, month, day] = key.split("-").map(Number);
  return new Intl.DateTimeFormat("pt-BR", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
  }).format(new Date(year, month - 1, day));
}

function isInThisWeek(iso: string) {
  const d = new Date(iso);
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = addDays(start, 7);
  return d >= start && d < end;
}

function groupStatus(items: QueueItem[]): StatusKey {
  return STATUS_PRIORITY.find((status) => items.some((q) => q.status === status)) ?? "scheduled";
}

function tokenDaysLeft(expiresAt?: string | null) {
  if (!expiresAt) return null;
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (!Number.isFinite(ms)) return null;
  return Math.ceil(ms / 86_400_000);
}

function isTokenExpired(account?: AccountMeta) {
  const days = tokenDaysLeft(account?.token_expires_at);
  return account?.token_status === "expired" || (days !== null && days <= 0);
}

function queueGroupKey(item: QueueItem) {
  if (item.group_id) return `group:${item.group_id}`;
  const mediaKey = item.media_key || item.thumb || "media";
  const ms = new Date(item.group_scheduled_at ?? item.scheduled_at).getTime();
  const hourBucketMs = Math.round(ms / 3_600_000) * 3_600_000;
  return [new Date(hourBucketMs).toISOString(), mediaKey, item.caption, item.media_type].join("::");
}

function relativeFromNow(iso: string, now: number) {
  const t = new Date(iso).getTime();
  const diff = t - now;
  const abs = Math.abs(diff);
  const min = Math.round(abs / 60000);
  if (min < 60) return diff >= 0 ? `em ${min}min` : `há ${min}min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return (diff >= 0 ? "em " : "há ") + `${h}h${m ? m.toString().padStart(2, "0") : ""}`;
}

function timeHHmm(iso: string) {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function StatusBadge({
  status,
  scheduledAt,
  lastError,
  now,
  retryCount,
}: {
  status: StatusKey;
  scheduledAt?: string;
  lastError?: string | null;
  now: number;
  retryCount?: number;
}) {
  const meta = STATUS_META[status];
  const isRetry = status === "scheduled" && (retryCount ?? 0) > 0;
  const Icon = ({ className = "" }: { className?: string }) => {
    if (status === "processing")
      return <Loader2 className={`h-3 w-3 animate-spin ${className}`} />;
    if (status === "published") return <Check className={`h-3 w-3 ${className}`} />;
    if (status === "failed") return <XCircle className={`h-3 w-3 ${className}`} />;
    if (status === "canceled") return <Pause className={`h-3 w-3 ${className}`} />;
    return <Clock className={`h-3 w-3 ${className}`} />;
  };
  const extra =
    status === "scheduled" && scheduledAt
      ? relativeFromNow(scheduledAt, now)
      : status === "processing" && scheduledAt
        ? `há ${Math.max(0, Math.round((now - new Date(scheduledAt).getTime()) / 60000))}min`
        : null;

  const label = isRetry ? `Retry (${retryCount}/3)` : meta.short;
  const bg = isRetry ? "color-mix(in oklab, var(--warning) 22%, transparent)" : meta.bg;
  const fg = isRetry ? "var(--warning)" : meta.fg;

  const pill = (
    <span
      className="inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-[11px] font-semibold"
      style={{ background: bg, color: fg }}
    >
      <Icon />
      {label}
      {extra && <span className="opacity-80">· {extra}</span>}
    </span>
  );

  if ((status === "failed" || isRetry) && lastError) {
    return (
      <TooltipProvider delayDuration={150}>
        <Tooltip>
          <TooltipTrigger asChild>{pill}</TooltipTrigger>
          <TooltipContent side="top" className="max-w-xs">
            <p className="text-xs">{lastError}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }
  return pill;
}

function ProgressBar({ counts, total }: { counts: Record<StatusKey, number>; total: number }) {
  const pub = total ? (counts.published / total) * 100 : 0;
  const proc = total ? (counts.processing / total) * 100 : 0;
  const fail = total ? (counts.failed / total) * 100 : 0;
  return (
    <div className="flex h-1 w-full overflow-hidden bg-bg3">
      <div style={{ width: `${pub}%`, background: "var(--success)" }} />
      <div style={{ width: `${proc}%`, background: "var(--warning)" }} />
      <div style={{ width: `${fail}%`, background: "var(--danger)" }} />
    </div>
  );
}

function CountPill({ done, total }: { done: number; total: number }) {
  const full = total > 0 && done === total;
  const partial = done > 0 && done < total;
  const bg = full
    ? "color-mix(in oklab, var(--success) 18%, transparent)"
    : partial
      ? "color-mix(in oklab, var(--warning) 16%, transparent)"
      : "color-mix(in oklab, var(--muted) 22%, transparent)";
  const fg = full ? "var(--success)" : partial ? "var(--warning)" : "var(--text2)";
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-semibold tabular-nums"
      style={{ background: bg, color: fg }}
    >
      {full && <CheckCircle2 className="h-3 w-3" />}
      {done}/{total} contas
    </span>
  );
}

function TypeBadge({ type }: { type: string }) {
  const m = TYPE_BADGE[type] ?? TYPE_BADGE.IMAGE;
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-wider"
      style={{ background: m.bg, color: m.fg }}
    >
      {type}
    </span>
  );
}

function VariantBadge({ item }: { item: QueueItem }) {
  if (item.variant_processed) {
    return (
      <span
        title={item.variant_method ? `método: ${item.variant_method}` : undefined}
        className="inline-flex items-center rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-300"
      >
        ✓ Variante
      </span>
    );
  }
  if (item.variant_error) {
    return (
      <span
        title={item.variant_error}
        className="inline-flex items-center rounded-full border border-danger/40 bg-danger/10 px-2 py-0.5 text-[10px] font-semibold text-danger"
      >
        ⚠ Variante falhou
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full border border-amber-400/40 bg-amber-400/10 px-2 py-0.5 text-[10px] font-semibold text-amber-300 animate-pulse">
      ⟳ Gerando…
    </span>
  );
}

function VariantGroupBadge({ items }: { items: QueueItem[] }) {
  const total = items.length;
  const done = items.filter((i) => i.variant_processed).length;
  const failed = items.filter((i) => !i.variant_processed && i.variant_error).length;
  if (done === total) {
    return (
      <span className="inline-flex items-center rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-300">
        {done}/{total} variantes ✓
      </span>
    );
  }
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
        failed
          ? "border-danger/40 bg-danger/10 text-danger"
          : "border-amber-400/40 bg-amber-400/10 text-amber-300"
      }`}
    >
      {done}/{total} variantes {failed ? "⚠" : "⟳"}
    </span>
  );
}


function Thumb({ src, type, size = "md" }: { src?: string; type: string; size?: "sm" | "md" }) {
  const cls = size === "sm" ? "h-12 w-12" : "h-16 w-16 sm:h-20 sm:w-20";
  return (
    <div className={`${cls} relative shrink-0 overflow-hidden rounded-lg border border-border`}>
      {src ? (
        <img src={src} alt="" className="h-full w-full object-cover" loading="lazy" />
      ) : (
        <div
          className="flex h-full w-full items-center justify-center"
          style={{
            background:
              "linear-gradient(135deg, color-mix(in oklab, var(--accent2) 38%, transparent), color-mix(in oklab, var(--accent) 28%, transparent))",
          }}
        >
          {type === "IMAGE" ? (
            <ImageIcon className="h-5 w-5 text-white/85" />
          ) : (
            <Play className="h-5 w-5 fill-white/85 text-white/85" />
          )}
        </div>
      )}
    </div>
  );
}

function AvatarStack({
  accounts,
  onClick,
}: {
  accounts: AccountMeta[];
  onClick?: () => void;
}) {
  const shown = accounts.slice(0, 5);
  const extra = accounts.length - shown.length;
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick?.();
      }}
      className="inline-flex items-center hover:opacity-90"
      title={accounts.map((a) => `@${a.username}`).join(", ")}
    >
      {shown.map((a, i) =>
        a.profile_picture ? (
          <img
            key={a.id + i}
            src={a.profile_picture}
            alt=""
            className="h-[22px] w-[22px] rounded-full border-2 border-bg2 object-cover"
            style={{ marginLeft: i === 0 ? 0 : -6 }}
          />
        ) : (
          <span
            key={a.id + i}
            className="flex h-[22px] w-[22px] items-center justify-center rounded-full border-2 border-bg2 bg-bg3 text-[9px]"
            style={{ marginLeft: i === 0 ? 0 : -6 }}
          >
            {a.username.slice(0, 1).toUpperCase()}
          </span>
        ),
      )}
      {extra > 0 && (
        <span
          className="ml-[-6px] flex h-[22px] min-w-[22px] items-center justify-center rounded-full border-2 border-bg2 bg-bg3 px-1 text-[10px] font-semibold text-text2"
        >
          +{extra}
        </span>
      )}
    </button>
  );
}

function QueuePage() {
  const qc = useQueryClient();
  const { connect, loading } = useOAuthPopup();
  const { data: queue = [] } = useQuery({
    queryKey: ["queue"],
    queryFn: () => api.listQueue(),
    refetchInterval: 30_000,
  });
  const { data: accounts = [] } = useQuery({
    queryKey: ["accounts"],
    queryFn: () => api.listAccounts(),
    refetchInterval: 60_000,
  });

  const accountById = useMemo(() => {
    const m = new Map<string, AccountMeta>();
    for (const a of accounts) {
      m.set(a.id, {
        id: a.id,
        username: a.username,
        name: a.name,
        profile_picture: a.profile_picture,
        token_status: a.token_status,
        token_expires_at: a.token_expires_at,
        provider: a.provider,
      });
    }
    return m;
  }, [accounts]);

  const [filter, setFilter] = useState<FilterKey>("all");
  const [dateFilter, setDateFilter] = useState<DateFilterKey>("all");
  const [sort, setSort] = useState<SortKey>("asc");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [density, setDensity] = useState<Density>("expanded");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [confirmClear, setConfirmClear] = useState<null | {
    statuses: StatusKey[];
    label: string;
    count: number;
  }>(null);
  const [confirmCleanOld, setConfirmCleanOld] = useState(false);
  const [cleaningOld, setCleaningOld] = useState(false);

  // Live clock and refresh countdown
  const [now, setNow] = useState(() => Date.now());
  const [refreshIn, setRefreshIn] = useState(30);
  useEffect(() => {
    const id = setInterval(() => {
      setNow(Date.now());
      setRefreshIn((s) => (s <= 1 ? 30 : s - 1));
    }, 1000);
    return () => clearInterval(id);
  }, []);

  // Keyboard shortcuts for filters
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      const k = e.key.toUpperCase();
      const hit = FILTERS.find((f) => f.key === k);
      if (hit) {
        e.preventDefault();
        setFilter(hit.id);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const counts = useMemo(() => {
    const c: Record<FilterKey, number> = {
      all: queue.length,
      scheduled: 0,
      processing: 0,
      canceled: 0,
      failed: 0,
      published: 0,
    };
    for (const q of queue) c[q.status]++;
    return c;
  }, [queue]);

  const dayCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const q of queue)
      m.set(localDateKey(q.scheduled_at), (m.get(localDateKey(q.scheduled_at)) ?? 0) + 1);
    return m;
  }, [queue]);

  const dateFilters = useMemo(() => {
    const base: DateFilterKey[] = ["all", "today", "tomorrow", "after-tomorrow", "this-week"];
    return base;
  }, []);

  const matchesDate = (iso: string) => {
    if (dateFilter === "all") return true;
    if (dateFilter === "this-week") return isInThisWeek(iso);
    const key =
      dateFilter === "today"
        ? localDateKey(new Date())
        : dateFilter === "tomorrow"
          ? localDateKey(addDays(new Date(), 1))
          : dateFilter === "after-tomorrow"
            ? localDateKey(addDays(new Date(), 2))
            : (dateFilter as string);
    return localDateKey(iso) === key;
  };

  const visibleItems = useMemo(() => {
    const q = query.trim().toLowerCase();
    return queue
      .filter((item) => filter === "all" || item.status === filter)
      .filter((item) => matchesDate(item.scheduled_at))
      .filter((item) => {
        if (!q) return true;
        const account = accountById.get(item.account);
        return [
          item.caption,
          item.media_type,
          item.status,
          STATUS_META[item.status].label,
          account?.username,
          account?.name,
          item.account,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(q);
      })
      .sort((a, b) => {
        const diff = new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime();
        return sort === "asc" ? diff : -diff;
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountById, dateFilter, filter, query, queue, sort]);

  const groups = useMemo<QueueGroup[]>(() => {
    const map = new Map<string, QueueItem[]>();
    for (const item of visibleItems) {
      const key = queueGroupKey(item);
      map.set(key, [...(map.get(key) ?? []), item]);
    }
    return [...map.entries()].map(([id, items]) => {
      items.sort(
        (a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime(),
      );
      const first = items[0];
      const statusCounts: Record<StatusKey, number> = {
        scheduled: 0,
        processing: 0,
        canceled: 0,
        failed: 0,
        published: 0,
      };
      for (const item of items) statusCounts[item.status]++;
      return {
        id,
        scheduledAt: first.group_scheduled_at ?? first.scheduled_at,
        caption: first.caption,
        mediaType: first.media_type,
        thumb: first.thumb,
        items,
        status: groupStatus(items),
        counts: statusCounts,
        accounts: items.map(
          (item) =>
            accountById.get(item.account) ?? {
              username: item.account.startsWith("@")
                ? item.account.slice(1)
                : item.account.slice(0, 16),
              name: item.account,
              profile_picture: "",
              id: item.account,
            },
        ),
      };
    });
  }, [accountById, visibleItems]);

  const visibleIds = visibleItems.map((q) => q.id);
  const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selected.has(id));
  const selectedVisibleCount = visibleIds.filter((id) => selected.has(id)).length;
  const someSelected = selected.size > 0;

  function toggle(id: string) {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  function toggleIds(ids: string[]) {
    const everySelected = ids.every((id) => selected.has(id));
    setSelected((s) => {
      const n = new Set(s);
      for (const id of ids) {
        if (everySelected) n.delete(id);
        else n.add(id);
      }
      return n;
    });
  }

  function toggleAllVisible() {
    setSelected((s) => {
      const n = new Set(s);
      if (allSelected) visibleIds.forEach((id) => n.delete(id));
      else visibleIds.forEach((id) => n.add(id));
      return n;
    });
  }

  function toggleExpand(id: string) {
    setExpanded((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  async function runBulk(label: string, fn: (id: string) => Promise<void>, ids = [...selected]) {
    if (!ids.length) return;
    const t = toast.loading(`${label} ${ids.length} ${ids.length > 1 ? "itens" : "item"}…`);
    try {
      await Promise.all(ids.map(fn));
      toast.success(`${label} concluído`);
      setSelected((s) => {
        const n = new Set(s);
        ids.forEach((id) => n.delete(id));
        return n;
      });
      qc.invalidateQueries({ queryKey: ["queue"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha na operação");
    } finally {
      toast.dismiss(t);
    }
  }

  async function singleAction(label: string, fn: () => Promise<void>) {
    const t = toast.loading(`${label}…`);
    try {
      await fn();
      toast.success(`${label} concluído`);
      qc.invalidateQueries({ queryKey: ["queue"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha na operação");
    } finally {
      toast.dismiss(t);
    }
  }

  async function publishSelectedNow(ids = [...selected]) {
    if (!ids.length) return;
    const t = toast.loading(`Preparando ${ids.length} item(ns) para publicar…`);
    try {
      const nowIso = new Date().toISOString();
      await Promise.all(
        ids.map((id) =>
          api.updateQueueStatus(id, "scheduled", {
            scheduled_at: nowIso,
            reset_container: true,
          }),
        ),
      );
      await api.runScheduler();
      toast.success("Scheduler disparado");
      setSelected(new Set());
      qc.invalidateQueries({ queryKey: ["queue"] });
      qc.invalidateQueries({ queryKey: ["accounts"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao disparar scheduler");
    } finally {
      toast.dismiss(t);
    }
  }

  async function handleReconnect(account: { username: string; provider?: "facebook" | "instagram" }) {
    const provider = account.provider ?? "facebook";
    const t = toast.loading(
      `Reconectando @${account.username} via ${provider === "facebook" ? "Facebook" : "Instagram"}…`,
    );
    const res = await connect(provider);
    toast.dismiss(t);
    if (res.ok) {
      toast.success(
        `Reconectado: ${(res.saved ?? []).map((u) => `@${u}`).join(", ") || `@${account.username}`}`,
      );
      qc.invalidateQueries({ queryKey: ["accounts"] });
      qc.invalidateQueries({ queryKey: ["queue"] });
    } else {
      toast.error(res.error ?? "Falha na reconexão");
    }
  }

  const metrics: {
    label: string;
    value: number;
    accent: string;
    icon: React.ComponentType<{ className?: string }>;
    onClick?: () => void;
    danger?: boolean;
  }[] = [
    {
      label: "Total",
      value: counts.all,
      accent: "var(--text2)",
      icon: ListChecks,
      onClick: () => setFilter("all"),
    },
    {
      label: "Pendentes",
      value: counts.scheduled,
      accent: "var(--info)",
      icon: Clock3,
      onClick: () => setFilter("scheduled"),
    },
    {
      label: "Publicados",
      value: counts.published,
      accent: "var(--success)",
      icon: CheckCircle2,
      onClick: () => setFilter("published"),
    },
    {
      label: "Erros",
      value: counts.failed,
      accent: "var(--danger)",
      icon: AlertTriangle,
      onClick: () => setFilter("failed"),
      danger: counts.failed > 0,
    },
  ];

  return (
    <div className="mx-auto max-w-7xl px-3 py-4 sm:px-6 sm:py-7 md:px-10 md:py-8">
      <header className="mb-5 flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="inline-flex rounded-xl border border-border bg-bg2 p-1">
            <button className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-primary-foreground im-glow">
              <ListChecks className="h-4 w-4" /> Fila{" "}
              <span className="rounded-full bg-bg3/40 px-2 py-0.5 text-[11px]">{counts.all}</span>
            </button>
            <button className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm text-text2 hover:text-foreground">
              <BarChart3 className="h-4 w-4" /> Monitor
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setDensity(density === "expanded" ? "compact" : "expanded")}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border2 bg-bg3 px-3 py-2 text-sm hover:border-accent"
              title="Alternar densidade"
            >
              {density === "expanded" ? (
                <>
                  <Rows3 className="h-4 w-4" /> Compacto
                </>
              ) : (
                <>
                  <Layers className="h-4 w-4" /> Expandido
                </>
              )}
            </button>
            <button
              onClick={() => {
                setRefreshIn(30);
                singleAction("Atualizando scheduler", async () => {
                  await api.runScheduler();
                });
              }}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border2 bg-bg3 px-3 py-2 text-sm hover:border-accent"
              title="Atualizar agora (auto a cada 30s)"
            >
              <RefreshCw className="h-4 w-4" /> Atualizar
              <span className="ml-1 tabular-nums text-[11px] text-muted2">({refreshIn}s)</span>
            </button>
            <button
              onClick={toggleAllVisible}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border2 bg-bg3 px-3 py-2 text-sm hover:border-accent"
            >
              <CheckCircle2 className="h-4 w-4" /> {allSelected ? "Desmarcar" : "Selecionar"}
            </button>
            <button
              onClick={() => setConfirmCleanOld(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-danger/35 bg-danger/10 px-3 py-2 text-sm text-danger hover:border-danger"
              title="Remover posts publicados antes de hoje"
            >
              <Trash2 className="h-4 w-4" /> Limpar posts anteriores
            </button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="inline-flex items-center gap-1.5 rounded-lg border border-border2 bg-bg3 px-3 py-2 text-sm text-text2 hover:border-accent hover:text-foreground">
                  <Eraser className="h-4 w-4" /> Limpar
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64">
                <DropdownMenuItem
                  onSelect={() =>
                    setConfirmClear({
                      statuses: ["scheduled"],
                      label: "Remover agendados",
                      count: counts.scheduled,
                    })
                  }
                >
                  Remover agendados ({counts.scheduled})
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() =>
                    setConfirmClear({
                      statuses: ["failed"],
                      label: "Remover erros",
                      count: counts.failed,
                    })
                  }
                >
                  Remover erros ({counts.failed})
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() =>
                    setConfirmClear({
                      statuses: ["canceled"],
                      label: "Remover pausados",
                      count: counts.canceled,
                    })
                  }
                >
                  Remover pausados ({counts.canceled})
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() =>
                    setConfirmClear({
                      statuses: ["published"],
                      label: "Limpar publicados",
                      count: counts.published,
                    })
                  }
                >
                  Limpar publicados ({counts.published})
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onSelect={() =>
                    setConfirmClear({
                      statuses: ["scheduled", "processing", "failed", "canceled", "published"],
                      label: "Limpar tudo",
                      count: queue.length,
                    })
                  }
                  className="text-danger focus:text-danger"
                >
                  Limpar tudo ({queue.length})
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {metrics.map(({ label, value, accent, icon: Icon, onClick, danger }) => (
            <button
              key={label}
              onClick={onClick}
              className="im-card im-card-hover group relative cursor-pointer overflow-hidden px-4 py-4 text-left transition-all"
              style={{
                borderTop: `2px solid ${accent}`,
                borderColor: danger ? "var(--danger)" : undefined,
                boxShadow: danger ? "inset 0 0 0 1px var(--danger)" : undefined,
              }}
            >
              <div className="flex items-center justify-between text-muted2">
                <span className="text-xs uppercase tracking-wider">{label}</span>
                <Icon className="h-4 w-4" />
              </div>
              <div
                className="mt-2 text-2xl font-bold tabular-nums"
                style={{ color: danger ? "var(--danger)" : accent }}
              >
                {value}
              </div>
            </button>
          ))}
        </div>
      </header>

      <section className="mb-4 space-y-3">
        <div className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_auto]">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted2" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar conta, tipo, legenda ou status..."
              className="h-10 w-full rounded-lg border border-border bg-bg3 pl-9 pr-9 text-sm outline-none transition focus:border-accent"
            />
            {query && (
              <button
                onClick={() => setQuery("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted2 hover:text-foreground"
                aria-label="Limpar busca"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </label>
          <button
            onClick={() => setSort((s) => (s === "asc" ? "desc" : "asc"))}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-border2 bg-bg2 px-4 text-sm text-text2 hover:text-foreground"
          >
            <CalendarDays className="h-4 w-4" />{" "}
            {sort === "asc" ? "Mais cedo primeiro" : "Mais tarde primeiro"}
          </button>
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              title={`Atalho: ${f.key}`}
              className={[
                "shrink-0 rounded-lg border px-3 py-2 text-xs font-semibold transition",
                filter === f.id
                  ? "border-accent bg-accent text-primary-foreground"
                  : "border-border2 bg-bg2 text-text2 hover:text-foreground",
              ].join(" ")}
            >
              {f.label} <span className="opacity-80">({counts[f.id]})</span>
              <span className="ml-1.5 hidden rounded bg-bg3/60 px-1 py-0.5 text-[9px] text-muted2 sm:inline">
                {f.key}
              </span>
            </button>
          ))}
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {dateFilters.map((f) => {
            const count =
              f === "all"
                ? visibleItems.length
                : f === "this-week"
                  ? queue.filter((q) => isInThisWeek(q.scheduled_at)).length
                  : (dayCounts.get(
                      f === "today"
                        ? localDateKey(new Date())
                        : f === "tomorrow"
                          ? localDateKey(addDays(new Date(), 1))
                          : f === "after-tomorrow"
                            ? localDateKey(addDays(new Date(), 2))
                            : (f as string),
                    ) ?? 0);
            return (
              <button
                key={f}
                onClick={() => setDateFilter(f)}
                className={[
                  "shrink-0 rounded-lg border px-3 py-2 text-xs font-semibold transition",
                  dateFilter === f
                    ? "border-accent bg-accent text-primary-foreground"
                    : "border-border2 bg-bg2 text-text2 hover:text-foreground",
                ].join(" ")}
              >
                {dateChipLabel(f)} <span className="opacity-80">({count})</span>
              </button>
            );
          })}
        </div>
      </section>

      {someSelected && (
        <div className="sticky top-3 z-20 mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-accent/40 bg-bg3 px-3 py-2 text-sm shadow-lg shadow-bg/40">
          <span className="font-semibold">{selected.size} selecionado(s)</span>
          <span className="text-xs text-muted2">{selectedVisibleCount} visível(is)</span>
          <button
            onClick={() => runBulk("Pausando", (id) => api.updateQueueStatus(id, "canceled"))}
            className="inline-flex items-center gap-1.5 rounded-md border border-border2 bg-bg2 px-2.5 py-1.5 text-xs hover:border-accent"
          >
            <Pause className="h-3.5 w-3.5" /> Pausar
          </button>
          <button
            onClick={() => runBulk("Retomando", (id) => api.updateQueueStatus(id, "scheduled"))}
            className="inline-flex items-center gap-1.5 rounded-md border border-border2 bg-bg2 px-2.5 py-1.5 text-xs hover:border-accent"
          >
            <Play className="h-3.5 w-3.5" /> Retomar
          </button>
          <button
            onClick={() => publishSelectedNow()}
            className="inline-flex items-center gap-1.5 rounded-md border border-warning/40 bg-warning/10 px-2.5 py-1.5 text-xs text-warning hover:border-warning"
          >
            <Zap className="h-3.5 w-3.5" /> Tentar agora
          </button>
          <button
            onClick={() => setSelected(new Set())}
            className="ml-auto inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs text-text2 hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" /> Limpar seleção
          </button>
          <button
            onClick={() => runBulk("Removendo", (id) => api.deleteQueue(id))}
            className="inline-flex items-center gap-1.5 rounded-md border border-danger/35 bg-danger/10 px-2.5 py-1.5 text-xs text-danger hover:border-danger"
          >
            <Trash2 className="h-3.5 w-3.5" /> Remover
          </button>
        </div>
      )}

      <div className={density === "compact" ? "space-y-2" : "space-y-4"}>
        {groups.length === 0 ? (
          <div className="flex min-h-[240px] flex-col items-center justify-center rounded-xl border border-border bg-bg2 p-10 text-center text-sm text-text2">
            <CheckCircle2 className="mb-2 h-7 w-7 text-muted2" />
            Nada por aqui.
          </div>
        ) : (
          groups.map((group, groupIndex) => {
            const groupIds = group.items.map((item) => item.id);
            const selectedInGroup = groupIds.filter((id) => selected.has(id)).length;
            const isGroupSelected = selectedInGroup === groupIds.length;
            const overdue = group.items.some(
              (item) =>
                item.status === "scheduled" && new Date(item.scheduled_at).getTime() < now,
            );
            const dayLabel =
              groupIndex === 0 ||
              localDateKey(groups[groupIndex - 1].scheduledAt) !== localDateKey(group.scheduledAt)
                ? dateChipLabel(localDateKey(group.scheduledAt))
                : null;
            const isOpen = expanded.has(group.id) || query.trim().length > 0;
            const isCompact = density === "compact";

            return (
              <div key={group.id}>
                {dayLabel && (
                  <div className="sticky top-0 z-10 -mx-3 mb-3 flex items-center gap-3 bg-bg/85 px-3 py-2 backdrop-blur sm:-mx-6 sm:px-6 md:-mx-10 md:px-10">
                    <div className="h-px flex-1 bg-border" />
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-bg2 px-3 py-1 text-xs text-text2">
                      <CalendarDays className="h-3.5 w-3.5" /> {dayLabel} —{" "}
                      {dayCounts.get(localDateKey(group.scheduledAt)) ?? group.items.length} posts
                    </span>
                    <div className="h-px flex-1 bg-border" />
                  </div>
                )}

                <article
                  className={[
                    "overflow-hidden rounded-xl border bg-bg2 transition-colors",
                    overdue
                      ? "border-warning"
                      : group.status === "failed"
                        ? "border-danger/60"
                        : "border-border hover:border-border2",
                  ].join(" ")}
                >
                  {isCompact ? (
                    /* ============= COMPACT MODE ============= */
                    <button
                      type="button"
                      onClick={() => toggleExpand(group.id)}
                      className="flex w-full cursor-pointer items-center gap-3 px-3 py-2 text-left"
                    >
                      <ChevronRight
                        className={`h-4 w-4 shrink-0 text-muted2 transition-transform duration-200 ${
                          isOpen ? "rotate-90" : ""
                        }`}
                      />
                      <Thumb src={group.thumb} type={group.mediaType} size="sm" />
                      <TypeBadge type={group.mediaType} />
                      <span className="min-w-0 flex-1 truncate text-sm">
                        {group.caption || "Sem legenda"}
                      </span>
                      <CountPill done={group.counts.published} total={group.items.length} />
                      <StatusBadge
                        status={group.status}
                        scheduledAt={group.scheduledAt}
                        now={now}
                      />
                      <span className="hidden whitespace-nowrap text-xs text-muted2 sm:inline tabular-nums">
                        {timeHHmm(group.scheduledAt)}
                      </span>
                    </button>
                  ) : (
                    /* ============= EXPANDED MODE ============= */
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => toggleExpand(group.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          toggleExpand(group.id);
                        }
                      }}
                      className="flex cursor-pointer flex-col gap-3 p-3 lg:flex-row lg:items-start"
                    >
                      <div className="flex items-start gap-3 lg:min-w-0 lg:flex-1">
                        <ChevronRight
                          className={`mt-1 h-4 w-4 shrink-0 text-muted2 transition-transform duration-200 ${
                            isOpen ? "rotate-90" : ""
                          }`}
                        />
                        <input
                          type="checkbox"
                          checked={isGroupSelected}
                          onChange={() => toggleIds(groupIds)}
                          onClick={(e) => e.stopPropagation()}
                          className="mt-1 accent-accent"
                          aria-label="Selecionar grupo"
                        />
                        <Thumb src={group.thumb} type={group.mediaType} />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <TypeBadge type={group.mediaType} />
                            <StatusBadge
                              status={group.status}
                              scheduledAt={group.scheduledAt}
                              now={now}
                            />
                            {overdue && (
                              <span className="rounded-full border border-warning/40 bg-warning/10 px-2 py-1 text-[11px] font-semibold text-warning">
                                <AlertTriangle className="mr-1 inline h-3 w-3" />
                                Atrasado
                              </span>
                            )}
                            {group.items.some((item) => (item.attempts ?? 0) > 0) && (
                              <span className="rounded-full border border-accent/35 bg-accent/10 px-2 py-1 text-[11px] font-semibold text-accent2">
                                +{Math.max(...group.items.map((item) => item.attempts ?? 0))}{" "}
                                tentativa(s)
                              </span>
                            )}
                            <VariantGroupBadge items={group.items} />
                            <div className="ml-auto">
                              <CountPill
                                done={group.counts.published}
                                total={group.items.length}
                              />
                            </div>
                          </div>
                          <p className="mt-2 line-clamp-2 text-sm font-medium">
                            {group.caption || "Sem legenda"}
                          </p>
                          {group.items.some((item) => item.last_error) && (
                            <p className="mt-1 line-clamp-2 text-xs text-danger">
                              {group.items.find((item) => item.last_error)?.last_error}
                            </p>
                          )}
                          <div className="mt-2 flex items-center gap-2">
                            <AvatarStack accounts={group.accounts} />
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center justify-between gap-3 border-t border-border pt-3 lg:w-56 lg:border-t-0 lg:pt-0">
                        <div className="text-left lg:text-right">
                          <div className="text-sm font-bold text-warning tabular-nums">
                            <Clock3 className="mr-1 inline h-3.5 w-3.5" />
                            {fmtDateTime(group.scheduledAt)}
                          </div>
                        </div>
                        <div onClick={(e) => e.stopPropagation()}>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button
                                className="rounded-lg p-2 text-muted2 hover:bg-bg3 hover:text-foreground"
                                aria-label="Ações"
                              >
                                <MoreHorizontal className="h-4 w-4" />
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-52">
                              <DropdownMenuItem onSelect={() => toggleIds(groupIds)}>
                                <CheckCircle2 className="mr-2 h-4 w-4" />{" "}
                                {isGroupSelected ? "Desmarcar grupo" : "Selecionar grupo"}
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onSelect={() =>
                                  runBulk(
                                    "Pausando",
                                    (id) => api.updateQueueStatus(id, "canceled"),
                                    groupIds,
                                  )
                                }
                              >
                                <Pause className="mr-2 h-4 w-4" /> Pausar grupo
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onSelect={() =>
                                  runBulk(
                                    "Retomando",
                                    (id) => api.updateQueueStatus(id, "scheduled"),
                                    groupIds,
                                  )
                                }
                              >
                                <Play className="mr-2 h-4 w-4" /> Retomar grupo
                              </DropdownMenuItem>
                              <DropdownMenuItem onSelect={() => publishSelectedNow(groupIds)}>
                                <Zap className="mr-2 h-4 w-4" /> Tentar agora
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                className="text-danger focus:text-danger"
                                onSelect={() => {
                                  if (!confirm("Remover este grupo da fila?")) return;
                                  runBulk("Removendo", (id) => api.deleteQueue(id), groupIds);
                                }}
                              >
                                <Trash2 className="mr-2 h-4 w-4" /> Remover grupo
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Sub-list of accounts — animated expand/collapse */}
                  <div
                    className={`grid transition-[grid-template-rows] duration-200 ease-out ${
                      isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
                    }`}
                  >
                    <div className="overflow-hidden">
                    <div className="space-y-0 border-t border-border bg-bg3/20 p-2">

                      {group.items.map((item, idx) => {
                        const account = accountById.get(item.account) ?? {
                          id: item.account,
                          username: item.account.slice(0, 16),
                          name: item.account,
                          profile_picture: "",
                        };
                        const tokenExpired = isTokenExpired(account);
                        const timeLabel =
                          item.status === "published"
                            ? `Publicado ${timeHHmm(item.scheduled_at)}`
                            : item.status === "processing"
                              ? `Rodando há ${Math.max(0, Math.round((now - new Date(item.scheduled_at).getTime()) / 60000))}min`
                              : item.status === "scheduled"
                                ? `Previsto ${timeHHmm(item.scheduled_at)}`
                                : item.status === "failed"
                                  ? "Falhou"
                                  : "Pausado";
                        return (
                          <div
                            key={item.id}
                            className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-bg3"
                            style={{
                              background: idx % 2 === 1 ? "rgba(255,255,255,0.03)" : undefined,
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={selected.has(item.id)}
                              onChange={() => toggle(item.id)}
                              className="accent-accent"
                            />
                            {account.profile_picture ? (
                              <img
                                src={account.profile_picture}
                                alt=""
                                className="h-6 w-6 rounded-full"
                              />
                            ) : (
                              <Users className="h-4 w-4 text-muted2" />
                            )}
                            <span className="min-w-0 flex-1 truncate font-semibold">
                              @{account.username}
                            </span>
                            <span className="hidden text-[11px] text-muted2 sm:inline tabular-nums">
                              {timeLabel}
                            </span>
                            {tokenExpired && (
                              <span className="shrink-0 rounded-md border border-danger/40 bg-danger/10 px-2 py-0.5 text-[11px] font-semibold text-danger">
                                Token expirado
                              </span>
                            )}
                            {tokenExpired && (
                              <button
                                type="button"
                                disabled={loading !== null}
                                onClick={(e) => {
                                  e.preventDefault();
                                  void handleReconnect(account);
                                }}
                                className="shrink-0 rounded-md border border-border2 bg-bg2 px-2 py-0.5 text-[11px] font-semibold text-text2 hover:border-accent hover:text-foreground disabled:opacity-60"
                              >
                                Reconectar
                              </button>
                            )}
                            <StatusBadge
                              status={item.status}
                              scheduledAt={item.scheduled_at}
                              lastError={item.last_error}
                              now={now}
                              retryCount={item.retry_count}
                            />
                            <VariantBadge item={item} />
                            {item.status === "published" && (
                              <ExternalLink className="h-3 w-3 shrink-0 text-muted2" />
                            )}
                          </div>
                        );
                      })}
                    </div>
                    </div>
                  </div>


                  {/* Progress bar (bottom edge) */}
                  <ProgressBar counts={group.counts} total={group.items.length} />
                </article>
              </div>
            );
          })
        )}
      </div>

      <AlertDialog open={!!confirmClear} onOpenChange={(o) => !o && setConfirmClear(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmClear?.label}?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação irá remover {confirmClear?.count ?? 0}{" "}
              {(confirmClear?.count ?? 0) === 1 ? "item" : "itens"} da fila e não pode ser
              desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-danger text-white hover:bg-danger/90"
              onClick={async () => {
                if (!confirmClear) return;
                const c = confirmClear;
                setConfirmClear(null);
                await singleAction(c.label, () => api.clearQueue(c.statuses));
                setSelected(new Set());
              }}
            >
              Confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
