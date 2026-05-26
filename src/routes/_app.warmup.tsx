import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { listDriveEntries, type DriveVideo, type DriveFolder, type DriveCrumb } from "@/lib/drive.functions";
import {
  Folder,
  ChevronRight,
  Home,
  UploadCloud,
  Activity,
  Image as ImageIcon,
  HardDrive,
  CheckCircle2,
  Loader2,
  AlertCircle,
  Wand2,
  Copy,
  Check,
  RefreshCw,
  Clock,
  Heart,
  CalendarPlus,
  Gauge,
  CalendarDays,
  Shuffle,
  Trash2,
  Search,
  X,
  Film,
  AlertTriangle,
  Users,
  Settings2,
} from "lucide-react";
import { fmtDateTime } from "@/lib/format";

function GoogleBadge({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.6-6 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/>
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.6 16 18.9 13 24 13c3.1 0 5.8 1.2 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/>
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2c-2 1.5-4.6 2.4-7.2 2.4-5.3 0-9.7-3.4-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/>
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.1-4.1 5.5l6.2 5.2C41.5 35.6 44 30.2 44 24c0-1.3-.1-2.4-.4-3.5z"/>
    </svg>
  );
}

export const Route = createFileRoute("/_app/warmup")({
  component: WarmupPage,
  head: () => ({ meta: [{ title: "Warmup · Insta Manager" }] }),
});

const tabs = [
  { id: "upload", label: "Upload", icon: UploadCloud, emoji: "📤" },
  { id: "post", label: "Postagem", icon: CalendarPlus, emoji: "✨" },
  { id: "config", label: "Rate Limit", icon: Gauge, emoji: "⚙️" },
  { id: "monitor", label: "Monitor", icon: Activity, emoji: "📡" },
] as const;

type TabId = (typeof tabs)[number]["id"];

type Upload = {
  name: string;
  size: number;
  type: string;
  preview?: string;
  status: "uploading" | "done" | "error";
  key?: string;
  url?: string;
  error?: string;
};

async function readEntry(entry: FileSystemEntry): Promise<File[]> {
  if (entry.isFile) {
    return new Promise<File[]>((resolve) => {
      (entry as FileSystemFileEntry).file(
        (f) => resolve([f]),
        () => resolve([]),
      );
    });
  }
  if (entry.isDirectory) {
    const reader = (entry as FileSystemDirectoryEntry).createReader();
    const all: File[] = [];
    const readBatch = (): Promise<FileSystemEntry[]> =>
      new Promise((resolve) => reader.readEntries(resolve, () => resolve([])));
    while (true) {
      const batch = await readBatch();
      if (!batch.length) break;
      for (const e of batch) all.push(...(await readEntry(e)));
    }
    return all;
  }
  return [];
}

async function filesFromDataTransfer(dt: DataTransfer): Promise<File[]> {
  const items = dt.items;
  if (items && items.length && typeof items[0].webkitGetAsEntry === "function") {
    const out: File[] = [];
    const entries: FileSystemEntry[] = [];
    for (let i = 0; i < items.length; i++) {
      const e = items[i].webkitGetAsEntry();
      if (e) entries.push(e);
    }
    for (const e of entries) out.push(...(await readEntry(e)));
    return out;
  }
  return Array.from(dt.files ?? []);
}

function WarmupPage() {
  const [tab, setTab] = useState<TabId>("upload");
  
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const { data: accounts = [] } = useQuery({
    queryKey: ["accounts"],
    queryFn: () => api.listAccounts(),
  });
  const { data: queue = [] } = useQuery({
    queryKey: ["queue"],
    queryFn: () => api.listQueue(),
    refetchInterval: 15_000,
  });
  const pendingCount = queue.filter((q: { status: string }) => q.status === "scheduled").length;


  async function handleFiles(files: File[] | FileList | null) {
    if (!files) return;
    const list = Array.from(files).filter(
      (f) => f.type.startsWith("image/") || f.type.startsWith("video/"),
    );
    if (!list.length) return;
    const baseIdx = uploads.length;
    setUploads((u) => [
      ...u,
      ...list.map((f) => ({
        name: f.name,
        size: f.size,
        type: f.type,
        preview: f.type.startsWith("image/") ? URL.createObjectURL(f) : undefined,
        status: "uploading" as const,
      })),
    ]);
    await Promise.all(
      list.map(async (file, i) => {
        const result = await api.uploadMedia(file);
        setUploads((u) => {
          const copy = [...u];
          const idx = baseIdx + i;
          copy[idx] = result
            ? { ...copy[idx], status: "done", key: result.key, url: result.url }
            : { ...copy[idx], status: "error", error: "Falha no upload — bindings R2 indisponíveis?" };
          return copy;
        });
      }),
    );
  }


  return (
    <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6 sm:py-7 md:px-10 md:py-8">
      <header className="mb-6">
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted2">Warmup</p>
        <h1 className="mt-2 text-2xl sm:text-3xl font-semibold tracking-tight">Aquecimento de contas</h1>
        <p className="mt-2 max-w-2xl text-sm text-text2">
          Programe uma série de posts gradual para esquentar contas novas e simular comportamento orgânico.
        </p>
      </header>

      <div className="im-card overflow-hidden">
        <nav className="flex overflow-x-auto border-b border-border bg-bg2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {tabs.map(({ id, label, icon: Icon }) => {
            const active = tab === id;
            const badge = id === "post" && pendingCount > 0 ? pendingCount : null;
            return (
              <button
                key={id}
                onClick={() => setTab(id)}
                className={[
                  "relative inline-flex shrink-0 items-center gap-2 whitespace-nowrap px-3.5 py-3 text-xs sm:px-5 sm:py-3.5 sm:text-sm transition-colors",
                  active ? "text-foreground" : "text-text2 hover:text-foreground",
                ].join(" ")}
              >
                <Icon className="h-4 w-4" />
                {label}
                {badge !== null && (
                  <span
                    className="ml-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-semibold text-white tabular-nums"
                    style={{ background: "var(--accent2)" }}
                  >
                    {badge}
                  </span>
                )}
                <span
                  className="pointer-events-none absolute inset-x-3 -bottom-px h-[2px] rounded-full transition-all duration-300"
                  style={{
                    background: "var(--accent2)",
                    transform: active ? "scaleX(1)" : "scaleX(0)",
                    transformOrigin: "left",
                    opacity: active ? 1 : 0,
                  }}
                />
              </button>
            );
          })}
        </nav>


        <div className="p-4 sm:p-6">
          {tab === "upload" && (
            <div className="space-y-5">
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "copy";
                  setDragOver(true);
                }}
                onDragEnter={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={(e) => {
                  e.preventDefault();
                  if (e.currentTarget === e.target) setDragOver(false);
                }}
                onDrop={async (e) => {
                  e.preventDefault();
                  setDragOver(false);
                  const files = await filesFromDataTransfer(e.dataTransfer);
                  await handleFiles(files);
                }}
                className={[
                  "flex flex-col items-center justify-center rounded-xl border border-dashed px-6 py-12 text-center transition-colors",
                  dragOver ? "border-accent bg-bg3" : "border-border2 bg-bg3/40",
                ].join(" ")}
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-bg3">
                  <UploadCloud className="h-5 w-5 text-text2" />
                </div>
                <h3 className="mt-4 text-base font-semibold">
                  Solte vídeos, imagens ou pastas inteiras aqui
                </h3>
                <p className="mt-1 max-w-md text-sm text-text2">
                  Reels (mp4, mov) e Feed/Stories (jpg, png, webp). Enviados direto para o bucket R2{" "}
                  <code className="rounded bg-bg4 px-1.5 py-0.5 text-[11px]">insta-media</code>.
                </p>
                <input
                  ref={inputRef}
                  type="file"
                  multiple
                  accept="image/*,video/*"
                  className="hidden"
                  onChange={(e) => {
                    handleFiles(e.target.files);
                    e.target.value = "";
                  }}
                />
                <input
                  ref={folderInputRef}
                  type="file"
                  multiple
                  // @ts-expect-error — atributos não-padrão para upload de pasta
                  webkitdirectory=""
                  directory=""
                  className="hidden"
                  onChange={(e) => {
                    handleFiles(e.target.files);
                    e.target.value = "";
                  }}
                />
                <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
                  <button
                    onClick={() => inputRef.current?.click()}
                    className="rounded-lg im-grad-accent px-4 py-2 text-sm font-medium text-white"
                  >
                    Selecionar arquivos
                  </button>
                  <button
                    onClick={() => folderInputRef.current?.click()}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border2 bg-bg3 px-4 py-2 text-sm text-text2 hover:text-foreground"
                  >
                    <Folder className="h-4 w-4" />
                    Selecionar pasta
                  </button>
                  <button
                    onClick={() => setTab("post")}
                    className="inline-flex items-center gap-2 rounded-lg border border-border2 bg-white px-4 py-2 text-sm font-medium text-neutral-800 shadow-sm hover:bg-neutral-50"
                    title="Importar do Google Drive (vai para Postagem)"
                  >
                    <GoogleBadge className="h-4 w-4" />
                    Importar do Google Drive
                  </button>
                </div>
                <p className="mt-3 text-[11px] text-muted2">
                  Arquivos locais são apenas armazenados no R2. Os metadados são limpos automaticamente no momento de publicar (re-encode + jitter visual por conta).
                </p>
              </div>

              {uploads.length > 0 && (
                <>
                  <div className="flex items-center justify-between text-xs text-muted2">
                    <span>
                      {uploads.length} arquivo{uploads.length === 1 ? "" : "s"} ·{" "}
                      {uploads.filter((u) => u.status === "done").length} concluído(s) ·{" "}
                      {uploads.filter((u) => u.status === "uploading").length} enviando ·{" "}
                      {uploads.filter((u) => u.status === "error").length} erro(s)
                    </span>
                    <button
                      onClick={() => {
                        uploads.forEach((u) => u.preview && URL.revokeObjectURL(u.preview));
                        setUploads([]);
                      }}
                      className="hover:text-foreground"
                    >
                      Limpar lista
                    </button>
                  </div>
                  <ul className="space-y-2">
                    {uploads.map((u, i) => (
                      <li
                        key={i}
                        className="flex items-center gap-3 rounded-lg border border-border bg-bg3 p-3"
                      >
                        <div className="relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-md bg-bg4">
                          {u.preview ? (
                            <img src={u.preview} alt="" className="h-full w-full object-cover" />
                          ) : u.type.startsWith("video/") ? (
                            <UploadCloud className="h-5 w-5 text-text2" />
                          ) : (
                            <ImageIcon className="h-5 w-5 text-text2" />
                          )}
                          {u.status === "uploading" && (
                            <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                              <Loader2 className="h-4 w-4 animate-spin text-white" />
                            </div>
                          )}
                          {u.status === "done" && (
                            <div className="absolute right-0.5 bottom-0.5 rounded-full bg-emerald-500/90 p-0.5">
                              <CheckCircle2 className="h-3 w-3 text-white" />
                            </div>
                          )}
                          {u.status === "error" && (
                            <div className="absolute inset-0 flex items-center justify-center bg-red-500/30">
                              <AlertCircle className="h-4 w-4 text-red-300" />
                            </div>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="truncate text-sm font-medium">{u.name}</span>
                            {u.status === "uploading" && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium text-amber-300">
                                <Loader2 className="h-2.5 w-2.5 animate-spin" /> enviando
                              </span>
                            )}
                            {u.status === "done" && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-sky-500/15 px-2 py-0.5 text-[10px] font-medium text-sky-300">
                                a processar metadados
                              </span>
                            )}
                            {u.status === "error" && (
                              <span className="rounded-full bg-red-500/15 px-2 py-0.5 text-[10px] font-medium text-red-300">erro</span>
                            )}
                          </div>
                          <div className="truncate text-xs text-muted2">
                            {(u.size / 1024 / 1024).toFixed(2)} MB ·{" "}
                            {u.status === "done" && (
                              <>
                                <span className="text-emerald-400">no R2</span> ·{" "}
                                <a
                                  href={u.url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="underline hover:text-foreground"
                                >
                                  {u.key}
                                </a>
                              </>
                            )}
                            {u.status === "error" && (
                              <span className="text-red-400">{u.error}</span>
                            )}
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                  {uploads.length > 0 &&
                    uploads.every((u) => u.status === "done") && (
                      <button
                        onClick={() => setTab("post")}
                        className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-lg im-grad-accent px-4 py-2.5 text-sm font-semibold text-white"
                      >
                        <Wand2 className="h-4 w-4" /> Continuar para Postagem →
                      </button>
                    )}
                </>
              )}
            </div>
          )}

          {tab === "post" && <DistributeTab />}

          {tab === "config" && <RateLimitTab accounts={accounts} />}

          {tab === "monitor" && <MonitorTab accounts={accounts} />}
        </div>
      </div>
    </div>
  );
}

const POST_STORAGE_KEY = "warmup.post.v1";
const CAPTION_MAX = 2200;

type PostPersist = {
  selectedAccounts?: string[];
  caption?: string;
  gap?: number;
  jitter?: number;
  order?: "sequential" | "random";
};

function loadPost(): PostPersist {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(window.localStorage.getItem(POST_STORAGE_KEY) ?? "{}");
  } catch {
    return {};
  }
}

function VideoThumb({ v }: { v: DriveVideo }) {
  const [broken, setBroken] = useState(false);
  if (v.thumbnailLink && !broken) {
    return (
      <img
        src={v.thumbnailLink}
        alt=""
        className="h-full w-full object-cover"
        onError={() => setBroken(true)}
      />
    );
  }
  return (
    <div
      className="flex h-full w-full items-center justify-center"
      style={{
        background:
          "linear-gradient(135deg, color-mix(in oklch, var(--accent2) 35%, #1a1a1a), #111)",
      }}
    >
      <Film className="h-4 w-4 text-white/80" />
    </div>
  );
}

function DistributeTab() {
  const persisted = loadPost();
  const fetchEntries = useServerFn(listDriveEntries);
  const [loading, setLoading] = useState(true);
  const [folderId, setFolderId] = useState<string>("root");
  const [folders, setFolders] = useState<DriveFolder[]>([]);
  const [videos, setVideos] = useState<DriveVideo[]>([]);
  const [breadcrumbs, setBreadcrumbs] = useState<DriveCrumb[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [selectedVideos, setSelectedVideos] = useState<Map<string, DriveVideo>>(new Map());
  const [loadingFolder, setLoadingFolder] = useState<string | null>(null);
  const [selectedAccounts, setSelectedAccounts] = useState<string[]>(
    persisted.selectedAccounts ?? [],
  );
  const [accountFilter, setAccountFilter] = useState("");
  const [confirmClear, setConfirmClear] = useState(false);
  const { data: accounts = [] } = useQuery({
    queryKey: ["accounts"],
    queryFn: () => api.listAccounts(),
  });
  // Hidrata padrão se não havia persistido
  useEffect(() => {
    if (accounts.length && selectedAccounts.length === 0 && !persisted.selectedAccounts) {
      setSelectedAccounts(accounts.map((a) => a.id));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accounts.length]);
  const [caption, setCaption] = useState(persisted.caption ?? "");
  const localNow = () => {
    const d = new Date();
    d.setSeconds(0, 0);
    const tz = d.getTimezoneOffset() * 60_000;
    return new Date(d.getTime() - tz).toISOString().slice(0, 16);
  };
  const [start, setStart] = useState(localNow);
  const [gap, setGap] = useState(persisted.gap ?? 60);
  const [jitter, setJitter] = useState(persisted.jitter ?? 20);
  const [order, setOrder] = useState<"sequential" | "random">(persisted.order ?? "sequential");
  const [copied, setCopied] = useState(false);
  const [enqueueing, setEnqueueing] = useState(false);
  const [enqueueOk, setEnqueueOk] = useState(false);
  const [enqueueMsg, setEnqueueMsg] = useState<string | null>(null);
  const navigate = useNavigate();

  // Persistência
  useEffect(() => {
    try {
      window.localStorage.setItem(
        POST_STORAGE_KEY,
        JSON.stringify({ selectedAccounts, caption, gap, jitter, order }),
      );
    } catch {}
  }, [selectedAccounts, caption, gap, jitter, order]);

  useEffect(() => {
    setLoading(true);
    fetchEntries({ data: { folderId } })
      .then((r) => {
        setFolders(r.folders);
        setVideos(r.videos);
        setBreadcrumbs(r.breadcrumbs);
        setError(r.error);
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [fetchEntries, folderId]);

  const toggleAccount = (id: string) =>
    setSelectedAccounts((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const allAccountsSelected =
    accounts.length > 0 && selectedAccounts.length === accounts.length;
  const toggleAllAccounts = () =>
    setSelectedAccounts(allAccountsSelected ? [] : accounts.map((a) => a.id));

  const toggleVideo = (v: DriveVideo) =>
    setSelectedVideos((prev) => {
      const n = new Map(prev);
      if (n.has(v.id)) n.delete(v.id);
      else n.set(v.id, v);
      return n;
    });

  const allCurrentSelected =
    videos.length > 0 && videos.every((v) => selectedVideos.has(v.id));

  const toggleSelectAllHere = () =>
    setSelectedVideos((prev) => {
      const n = new Map(prev);
      if (allCurrentSelected) videos.forEach((v) => n.delete(v.id));
      else videos.forEach((v) => n.set(v.id, v));
      return n;
    });

  async function selectEntireFolder(f: DriveFolder) {
    setLoadingFolder(f.id);
    try {
      const collected: DriveVideo[] = [];
      const walk = async (id: string) => {
        const r = await fetchEntries({ data: { folderId: id } });
        if (r.error) throw new Error(r.error);
        collected.push(...r.videos);
        for (const sub of r.folders) await walk(sub.id);
      };
      await walk(f.id);
      setSelectedVideos((prev) => {
        const n = new Map(prev);
        collected.forEach((v) => n.set(v.id, v));
        return n;
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoadingFolder(null);
    }
  }

  const clearSelection = () => {
    setSelectedVideos(new Map());
    setConfirmClear(false);
  };

  const selectedList = Array.from(selectedVideos.values());
  const startMsNum = new Date(start).getTime();
  const startInPast = Number.isFinite(startMsNum) && startMsNum < Date.now() - 60_000;

  // Validação
  const missing: string[] = [];
  if (!selectedList.length) missing.push("selecione vídeos");
  if (!selectedAccounts.length) missing.push("selecione contas");
  if (startInPast) missing.push("data de início no passado");
  const canEnqueue = missing.length === 0 && !enqueueing;
  const disabledReason = missing.length ? `Faltando: ${missing.join(" · ")}` : "";

  const filteredAccounts = accounts.filter((a) =>
    accountFilter
      ? (a.username + " " + (a.name ?? "")).toLowerCase().includes(accountFilter.toLowerCase())
      : true,
  );

  const command =
    selectedList.length && selectedAccounts.length
      ? selectedList
          .map((v) =>
            [
              "bun scripts/distribute-reel.ts \\",
              `  --drive-id ${v.id} \\`,
              `  --accounts ${selectedAccounts.join(",")} \\`,
              `  --caption ${JSON.stringify(caption || "")} \\`,
              `  --start "${new Date(start).toISOString()}" \\`,
              `  --gap ${gap}`,
            ].join("\n"),
          )
          .join("\n\n")
      : "";

  const copy = async () => {
    await navigator.clipboard.writeText(command);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const enqueueAll = async () => {
    if (!canEnqueue) return;
    setEnqueueing(true);
    setEnqueueOk(false);
    setEnqueueMsg(null);
    try {
      const startMs = new Date(start).getTime();
      let ok = 0;
      let fail = 0;
      const shuffle = <T,>(arr: T[]): T[] => {
        const a = [...arr];
        for (let j = a.length - 1; j > 0; j--) {
          const k = Math.floor(Math.random() * (j + 1));
          [a[j], a[k]] = [a[k], a[j]];
        }
        return a;
      };
      const jitterMs = Math.max(0, jitter) * 60_000;
      for (let cycle = 0; cycle < selectedList.length; cycle++) {
        const cycleStartMs = startMs + cycle * gap * 60_000;
        const groupId = crypto.randomUUID();
        const groupScheduledAt = new Date(cycleStartMs).toISOString();
        const accountsForCycle =
          order === "random" ? shuffle(selectedAccounts) : selectedAccounts;
        for (const accId of accountsForCycle) {
          const v = selectedList[cycle];
          // Jitter apenas para cima: cada item recebe um offset individual
          // entre 0 e jitterMs, garantindo intervalo mínimo = gap.
          const jitterOffset = jitterMs ? Math.floor(Math.random() * (jitterMs + 1)) : 0;
          const scheduledAt = new Date(cycleStartMs + jitterOffset).toISOString();
          const res = await api.enqueue({
            account_id: accId,
            caption,
            media_type: "REEL",
            media_key: `drive:${v.id}`,
            scheduled_at: scheduledAt,
            group_id: groupId,
            group_scheduled_at: groupScheduledAt,
          });
          if (res) ok++;
          else fail++;
        }
      }
      setEnqueueOk(fail === 0 && ok > 0);
      setEnqueueMsg(
        `✓ ${ok} agendado(s)${fail ? ` · ${fail} falha(s)` : ""} · ${selectedList.length} ciclo(s) de ${gap}min · jitter +0–${jitter}min`,
      );
      if (ok > 0 && fail === 0) {
        setTimeout(() => navigate({ to: "/queue" }), 800);
      }
    } catch (e) {
      setEnqueueMsg(`Erro: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setEnqueueing(false);
    }
  };

  const previewAccounts = selectedAccounts.length;
  const previewVideos = selectedList.length;
  const fmtPreview = () => {
    try {
      const d = new Date(start);
      return d.toLocaleString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return start;
    }
  };

  return (
    <div className="grid gap-6 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
      {/* ===================== ESQUERDA: Drive ===================== */}
      <div className="min-w-0">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <HardDrive className="h-4 w-4" /> Google Drive
          </h3>
          {selectedVideos.size > 0 && (
            <span
              className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold text-white shadow-sm"
              style={{ background: "var(--accent2)" }}
            >
              <Film className="h-3 w-3" />
              {selectedVideos.size} vídeo{selectedVideos.size > 1 ? "s" : ""} selecionado{selectedVideos.size > 1 ? "s" : ""}
            </span>
          )}
        </div>

        {/* Breadcrumb */}
        <div className="mb-3 flex flex-wrap items-center gap-1 rounded-[10px] border border-border bg-bg3/60 px-2 py-1.5 text-xs">
          <button
            onClick={() => setFolderId("root")}
            className="inline-flex items-center gap-1 rounded px-1.5 py-1 text-text2 transition hover:bg-bg4 hover:text-foreground"
          >
            <Home className="h-3.5 w-3.5" /> Meu Drive
          </button>
          {breadcrumbs.map((c) => (
            <span key={c.id} className="flex items-center gap-1">
              <ChevronRight className="h-3 w-3 text-muted2" />
              <button
                onClick={() => setFolderId(c.id)}
                className="inline-flex items-center gap-1 rounded px-1.5 py-1 text-text2 transition hover:bg-bg4 hover:text-foreground"
              >
                <Folder className="h-3 w-3" /> {c.name}
              </button>
            </span>
          ))}
        </div>

        {/* Estado */}
        {loading && (
          <ul className="grid gap-2 sm:grid-cols-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <li
                key={i}
                className="flex items-center gap-3 rounded-[10px] border border-border bg-bg3/40 p-2"
              >
                <div className="h-14 w-20 flex-shrink-0 animate-pulse rounded-md bg-bg4" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 w-3/4 animate-pulse rounded bg-bg4" />
                  <div className="h-2.5 w-1/3 animate-pulse rounded bg-bg4" />
                </div>
              </li>
            ))}
          </ul>
        )}
        {!loading && error && (
          <div className="rounded-[10px] border border-red-500/30 bg-red-500/5 p-4 text-sm text-red-300">
            <AlertCircle className="mr-1 inline h-4 w-4" /> {error}
          </div>
        )}
        {!loading && !error && folders.length === 0 && videos.length === 0 && (
          <div className="rounded-[10px] border border-border bg-bg3/40 p-10 text-center text-sm text-text2">
            Pasta vazia.
          </div>
        )}
        {!loading && !error && (folders.length > 0 || videos.length > 0) && (
          <>
            <div className="mb-2 flex flex-wrap items-center justify-end gap-2 text-xs">
              {videos.length > 0 && (
                <button
                  onClick={toggleSelectAllHere}
                  className="rounded-[8px] border border-border2 bg-bg3 px-2.5 py-1.5 text-text2 transition hover:text-foreground"
                >
                  {allCurrentSelected ? "Desmarcar pasta atual" : "Selecionar todos aqui"}
                </button>
              )}
              {selectedVideos.size > 0 &&
                (confirmClear ? (
                  <span className="inline-flex items-center gap-1.5 rounded-[8px] border border-red-500/30 bg-red-500/10 px-2 py-1 text-red-300">
                    Limpar tudo?
                    <button
                      onClick={clearSelection}
                      className="rounded bg-red-500 px-1.5 py-0.5 text-[10px] font-semibold text-white"
                    >
                      Sim
                    </button>
                    <button
                      onClick={() => setConfirmClear(false)}
                      className="rounded px-1.5 py-0.5 text-[10px] text-text2 hover:text-foreground"
                    >
                      Não
                    </button>
                  </span>
                ) : (
                  <button
                    onClick={() => setConfirmClear(true)}
                    className="inline-flex items-center gap-1 rounded-[8px] px-2 py-1 text-text2 transition hover:text-red-300"
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Limpar
                  </button>
                ))}
            </div>
            <ul className="grid max-h-[460px] gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
              {folders.map((f) => (
                <li key={f.id}>
                  <div className="group flex items-center gap-2 rounded-[10px] border border-border bg-bg3/60 p-2 transition hover:-translate-y-[1px] hover:border-[var(--accent2)] hover:shadow-md">
                    <button
                      onClick={() => setFolderId(f.id)}
                      className="flex min-w-0 flex-1 items-center gap-3 text-left"
                    >
                      <div
                        className="flex h-14 w-20 flex-shrink-0 items-center justify-center rounded-md"
                        style={{
                          background:
                            "linear-gradient(135deg, color-mix(in oklch, var(--accent2) 20%, #1a1a1a), #111)",
                        }}
                      >
                        <Folder className="h-5 w-5 text-white/80" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">{f.name}</div>
                        <div className="text-xs text-muted2">pasta</div>
                      </div>
                    </button>
                    <button
                      onClick={() => selectEntireFolder(f)}
                      disabled={loadingFolder === f.id}
                      title="Selecionar todos os vídeos desta pasta (recursivo)"
                      className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md border border-border2 text-text2 transition hover:bg-bg4 hover:text-foreground disabled:opacity-50"
                    >
                      {loadingFolder === f.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Check className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </div>
                </li>
              ))}
              {videos.map((v) => {
                const active = selectedVideos.has(v.id);
                return (
                  <li key={v.id}>
                    <button
                      onClick={() => toggleVideo(v)}
                      className={[
                        "group flex w-full items-center gap-3 rounded-[10px] border p-2 text-left transition hover:-translate-y-[1px]",
                        active
                          ? "border-[var(--accent2)] bg-bg3 shadow-md"
                          : "border-border bg-bg3/60 hover:border-border2",
                      ].join(" ")}
                    >
                      <div className="h-14 w-20 flex-shrink-0 overflow-hidden rounded-md bg-bg4">
                        <VideoThumb v={v} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">{v.name}</div>
                        <div className="text-xs text-muted2">
                          {v.size ? `${(Number(v.size) / 1024 / 1024).toFixed(1)} MB` : ""}
                          {v.durationMillis
                            ? ` · ${Math.round(Number(v.durationMillis) / 1000)}s`
                            : ""}
                        </div>
                      </div>
                      <div
                        className={[
                          "flex h-5 w-5 flex-shrink-0 items-center justify-center rounded border transition-transform",
                          active
                            ? "scale-110 border-[var(--accent2)] bg-[var(--accent2)] text-white"
                            : "border-border2",
                        ].join(" ")}
                      >
                        {active && <Check className="h-3.5 w-3.5" />}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>

      {/* ===================== DIREITA: Configurações ===================== */}
      <div className="min-w-0 space-y-6 rounded-[10px] border border-border bg-bg3/30 p-5">
        {/* --- Contas que recebem --- */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-text2">
              <Users className="h-3.5 w-3.5" /> Contas que recebem
            </h3>
            <span
              className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold text-white"
              style={{ background: "var(--accent2)" }}
            >
              {selectedAccounts.length} de {accounts.length} selecionada{accounts.length === 1 ? "" : "s"}
            </span>
          </div>

          {/* Chips de selecionadas */}
          {selectedAccounts.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {selectedAccounts.slice(0, 12).map((id) => {
                const a = accounts.find((x) => x.id === id);
                if (!a) return null;
                return (
                  <button
                    key={id}
                    onClick={() => toggleAccount(id)}
                    className="group inline-flex items-center gap-1.5 rounded-full border border-border2 bg-bg3 py-0.5 pl-0.5 pr-2 text-[11px] transition hover:border-[var(--accent2)]"
                  >
                    <img src={a.profile_picture} alt="" className="h-4 w-4 rounded-full" />
                    <span>@{a.username}</span>
                    <X className="h-3 w-3 text-muted2 group-hover:text-red-300" />
                  </button>
                );
              })}
              {selectedAccounts.length > 12 && (
                <span className="inline-flex items-center rounded-full bg-bg4 px-2 py-0.5 text-[11px] text-muted2">
                  +{selectedAccounts.length - 12}
                </span>
              )}
            </div>
          )}

          {/* Busca + toggle all */}
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted2" />
              <input
                value={accountFilter}
                onChange={(e) => setAccountFilter(e.target.value)}
                placeholder="Buscar conta…"
                className="w-full rounded-[8px] border border-border2 bg-bg3 py-1.5 pl-7 pr-2 text-xs outline-none focus:border-[var(--accent2)]"
              />
            </div>
            <button
              onClick={toggleAllAccounts}
              className="rounded-[8px] border border-border2 bg-bg3 px-2 py-1.5 text-[11px] text-text2 transition hover:text-foreground"
            >
              {allAccountsSelected ? "Desmarcar todas" : "Selecionar todas"}
            </button>
          </div>

          <ul className="max-h-[220px] space-y-1.5 overflow-y-auto pr-1">
            {filteredAccounts.map((a) => {
              const checked = selectedAccounts.includes(a.id);
              const lowHealth = (a.health_score ?? 100) < 60;
              return (
                <li key={a.id}>
                  <label
                    className={[
                      "flex items-center gap-2 rounded-[8px] border bg-bg3 p-2 text-sm transition cursor-pointer hover:-translate-y-[1px]",
                      checked ? "border-[var(--accent2)]" : "border-border hover:border-border2",
                    ].join(" ")}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleAccount(a.id)}
                      className="h-3.5 w-3.5 accent-[var(--accent2)] transition-transform checked:scale-110"
                    />
                    <div className="relative">
                      <img
                        src={a.profile_picture}
                        alt=""
                        className={[
                          "h-7 w-7 rounded-full ring-2",
                          lowHealth ? "ring-red-500/70" : "ring-transparent",
                        ].join(" ")}
                      />
                      {lowHealth && (
                        <span
                          title={`Saúde baixa: ${a.health_score}`}
                          className="absolute -bottom-1 -right-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-red-500 ring-2 ring-bg3"
                        >
                          <AlertTriangle className="h-2 w-2 text-white" />
                        </span>
                      )}
                    </div>
                    <span className="flex-1 truncate">@{a.username}</span>
                    <span className="text-[10px] tabular-nums text-muted2">{a.health_score}</span>
                  </label>
                </li>
              );
            })}
            {filteredAccounts.length === 0 && (
              <li className="rounded-[8px] border border-border bg-bg3 p-3 text-center text-xs text-muted2">
                Nenhuma conta corresponde a "{accountFilter}"
              </li>
            )}
          </ul>
        </section>

        <div className="border-t border-border/60" />

        {/* --- Configuração de tempo --- */}
        <section className="space-y-3">
          <h3 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-text2">
            <Clock className="h-3.5 w-3.5" /> Configuração de tempo
          </h3>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="mb-1 flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted2">
                <CalendarDays className="h-3 w-3" /> Início
              </label>
              <input
                type="datetime-local"
                value={start}
                onChange={(e) => setStart(e.target.value)}
                className={[
                  "w-full rounded-[8px] border bg-bg3 px-2 py-1.5 text-xs outline-none focus:border-[var(--accent2)]",
                  startInPast ? "border-red-500/60" : "border-border2",
                ].join(" ")}
              />
              {startInPast && (
                <p className="mt-1 text-[10px] text-red-400">data no passado</p>
              )}
            </div>
            <div>
              <label
                className="mb-1 flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted2"
                title="Intervalo entre ciclos (cada vídeo)"
              >
                <Clock className="h-3 w-3" /> Ciclo (min)
              </label>
              <input
                type="number"
                min={1}
                value={gap}
                onChange={(e) => setGap(Number(e.target.value))}
                className="w-full rounded-[8px] border border-border2 bg-bg3 px-2 py-1.5 text-xs outline-none focus:border-[var(--accent2)]"
              />
            </div>
            <div>
              <label
                className="mb-1 flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted2"
                title="Atraso aleatório (0 a N min) somado ao intervalo de cada conta"
              >
                <Shuffle className="h-3 w-3" /> Jitter (+min)
              </label>
              <input
                type="number"
                min={0}
                value={jitter}
                onChange={(e) => setJitter(Number(e.target.value))}
                className="w-full rounded-[8px] border border-border2 bg-bg3 px-2 py-1.5 text-xs outline-none focus:border-[var(--accent2)]"
              />
            </div>
          </div>
        </section>

        <div className="border-t border-border/60" />

        {/* --- Ordem dos vídeos --- */}
        <section className="space-y-2">
          <h3 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-text2">
            <Shuffle className="h-3.5 w-3.5" /> Ordem dos vídeos
          </h3>
          <div className="grid grid-cols-2 gap-1 rounded-full border border-border2 bg-bg3 p-1">
            {([
              { id: "sequential", label: "Sequencial" },
              { id: "random", label: "Aleatória" },
            ] as const).map((opt) => {
              const active = order === opt.id;
              return (
                <button
                  key={opt.id}
                  onClick={() => setOrder(opt.id)}
                  className={[
                    "rounded-full px-3 py-1.5 text-xs font-medium transition",
                    active ? "text-white shadow" : "text-text2 hover:text-foreground",
                  ].join(" ")}
                  style={active ? { background: "var(--accent2)" } : undefined}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
          <p className="text-[11px] text-muted2">
            {order === "random"
              ? "Cada conta recebe os vídeos em ordem embaralhada."
              : "Todas as contas seguem a mesma ordem de seleção."}
          </p>
        </section>

        <div className="border-t border-border/60" />

        {/* --- Legenda base --- */}
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-text2">
              <Wand2 className="h-3.5 w-3.5" /> Legenda base
            </h3>
            <span
              className={[
                "text-[10px] tabular-nums",
                caption.length > CAPTION_MAX ? "text-red-400" : "text-muted2",
              ].join(" ")}
            >
              {caption.length}/{CAPTION_MAX}
            </span>
          </div>
          <textarea
            rows={3}
            value={caption}
            maxLength={CAPTION_MAX}
            onChange={(e) => setCaption(e.target.value)}
            placeholder="novo drop ✦ #reels"
            className="w-full resize-y rounded-[8px] border border-border2 bg-bg3 p-2 text-sm outline-none focus:border-[var(--accent2)]"
          />
          <div className="flex flex-wrap gap-1">
            {["✨", "🔥", "💫", "🎯", "🚀", "❤️", "👀", "✦"].map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => setCaption((c) => (c + " " + e).trim().slice(0, CAPTION_MAX))}
                className="rounded-md border border-border2 bg-bg3 px-2 py-0.5 text-sm transition hover:-translate-y-[1px] hover:border-[var(--accent2)]"
              >
                {e}
              </button>
            ))}
          </div>
        </section>

        <div className="border-t border-border/60" />

        {/* --- Ação principal --- */}
        <section className="space-y-2">
          <button
            onClick={enqueueAll}
            disabled={!canEnqueue}
            title={disabledReason || undefined}
            className={[
              "inline-flex w-full items-center justify-center gap-2 rounded-[10px] px-4 py-2.5 text-sm font-semibold text-white shadow transition",
              enqueueOk
                ? "bg-emerald-500 hover:bg-emerald-500/90"
                : "bg-[var(--accent2)] hover:opacity-90",
              !canEnqueue ? "cursor-not-allowed opacity-50" : "",
            ].join(" ")}
          >
            {enqueueing ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Agendando…
              </>
            ) : enqueueOk ? (
              <>
                <CheckCircle2 className="h-4 w-4" /> Agendado com sucesso!
              </>
            ) : (
              <>
                <CalendarPlus className="h-4 w-4" /> Agendar nas contas selecionadas
              </>
            )}
          </button>

          {/* Preview inline */}
          {previewVideos > 0 && previewAccounts > 0 && (
            <div className="rounded-[8px] border border-dashed border-border bg-bg3/40 px-3 py-2 text-[11px] text-text2">
              <span className="font-semibold text-foreground">
                {previewAccounts} conta{previewAccounts === 1 ? "" : "s"} × {previewVideos} vídeo{previewVideos === 1 ? "" : "s"}
              </span>{" "}
              → próxima postagem em{" "}
              <span className="font-medium text-foreground">{fmtPreview()}</span>, ciclo de{" "}
              <span className="font-medium text-foreground">{gap}</span> +{" "}
              <span className="font-medium text-foreground">0–{jitter}</span> min
            </div>
          )}

          {enqueueMsg && (
            <div
              className={[
                "rounded-[8px] border px-3 py-2 text-xs",
                enqueueOk
                  ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                  : "border-border bg-bg3 text-text2",
              ].join(" ")}
            >
              {enqueueMsg}
            </div>
          )}

          {!canEnqueue && missing.length > 0 && (
            <p className="text-[11px] text-amber-400/80">{disabledReason}</p>
          )}

          <p className="text-[11px] text-muted2">
            Cada vídeo vira um ciclo: todas as contas selecionadas postam o mesmo vídeo com
            um atraso aleatório de 0 a {jitter}min, e o próximo ciclo começa {gap}min depois.
          </p>
        </section>

        <div className="border-t border-border/60" />

        {/* --- Comando local --- */}
        <section>
          <div className="mb-1 flex items-center justify-between">
            <label className="text-[10px] uppercase tracking-wider text-muted2">
              Comando local (avançado · ffmpeg)
            </label>
            {command && (
              <button
                onClick={copy}
                className={[
                  "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] transition",
                  copied
                    ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                    : "border-border2 bg-bg3 text-text2 hover:text-foreground",
                ].join(" ")}
              >
                {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                {copied ? "Copiado!" : "Copiar"}
              </button>
            )}
          </div>
          <pre className="overflow-x-auto rounded-[10px] border border-border bg-[#0a0a0a] p-3 text-[11px] leading-relaxed">
            <code className="text-text2">
              {command ? (
                command.split("\n").map((line, i) => {
                  // pseudo syntax-highlight
                  if (line.trim().startsWith("bun")) {
                    return (
                      <div key={i}>
                        <span className="text-[var(--accent2)]">bun</span>{" "}
                        <span className="text-sky-400">scripts/distribute-reel.ts</span>{" "}
                        <span className="text-muted2">\</span>
                      </div>
                    );
                  }
                  const flagMatch = line.match(/^(\s*--[\w-]+)(.*)$/);
                  if (flagMatch) {
                    return (
                      <div key={i}>
                        <span className="text-amber-300">{flagMatch[1]}</span>
                        <span>{flagMatch[2]}</span>
                      </div>
                    );
                  }
                  return <div key={i}>{line}</div>;
                })
              ) : (
                <span className="text-muted2">
                  Selecione ao menos um vídeo do Drive e uma conta.
                </span>
              )}
            </code>
          </pre>
        </section>
      </div>
    </div>
  );
}


// =====================================================================
// Rate Limit — defaults documentados da Meta + sliders globais (localStorage)
// =====================================================================

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

const RL_DEFAULTS: RateLimitConfig = { gapMinutes: 60, jitterMinutes: 20, maxPerDay: 25 };

function loadRL(): RateLimitConfig {
  if (typeof window === "undefined") return RL_DEFAULTS;
  try {
    const v = JSON.parse(window.localStorage.getItem(RL_STORAGE_KEY) ?? "");
    return { ...RL_DEFAULTS, ...v };
  } catch {
    return RL_DEFAULTS;
  }
}

function RateLimitTab({ accounts }: { accounts: AccountLite[] }) {
  const [cfg, setCfg] = useState<RateLimitConfig>(loadRL);
  const [checking, setChecking] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, { ok: boolean; msg: string }>>({});

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
              : "Falha — verificar"
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
      <div className="grid gap-4 md:grid-cols-3">
        {[
          { label: "Posts / 24h por conta IG", value: "25", hint: "Limite oficial Graph API (Instagram Content Publishing)" },
          { label: "Chamadas / hora por app", value: "200", hint: "Por usuário · X-App-Usage" },
          { label: "Reels por dia", value: "~50", hint: "Soft cap antishadowban observado" },
        ].map((c) => (
          <div key={c.label} className="rounded-xl border border-border bg-bg3 p-4">
            <div className="text-[10px] uppercase tracking-wider text-muted2">{c.label}</div>
            <div className="mt-1 text-2xl font-semibold tabular-nums">{c.value}</div>
            <div className="mt-1 text-[11px] text-muted2 leading-snug">{c.hint}</div>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-border bg-bg3/40 p-5 space-y-5">
        <div>
          <h3 className="text-sm font-semibold">Defaults globais</h3>
          <p className="text-xs text-muted2 mt-0.5">
            Aplicado como sugestão inicial na aba <b>Postagem</b>. Ajuste para respeitar os limites da Meta acima.
          </p>
        </div>
        {[
          { key: "gapMinutes", label: "Intervalo entre ciclos (min)", min: 5, max: 240, step: 5 },
          { key: "jitterMinutes", label: "Jitter ± entre contas (min)", min: 0, max: 60, step: 1 },
          { key: "maxPerDay", label: "Máx posts/dia por conta", min: 1, max: 50, step: 1 },
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
                onChange={(e) => setCfg((c) => ({ ...c, [s.key]: Number(e.target.value) }))}
                className="w-full accent-accent"
              />
            </div>
          );
        })}
      </div>

      <div className="rounded-xl border border-border bg-bg3/40 p-5">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold">Uso atual (live)</h3>
            <p className="text-xs text-muted2 mt-0.5">Faz uma chamada à Graph API e mostra o estado da credencial.</p>
          </div>
          <button
            onClick={checkAll}
            disabled={!!checking}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border2 bg-bg3 px-3 py-1.5 text-xs hover:text-foreground disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${checking ? "animate-spin" : ""}`} />
            Verificar todas
          </button>
        </div>
        <ul className="space-y-1.5">
          {accounts.map((a) => {
            const r = results[a.id];
            return (
              <li key={a.id} className="flex items-center gap-3 rounded-lg border border-border bg-bg3 p-2.5">
                <img src={a.profile_picture} alt="" className="h-7 w-7 rounded-full" />
                <span className="flex-1 truncate text-sm">@{a.username}</span>
                {r && (
                  <span className={`text-xs ${r.ok ? "text-emerald-400" : "text-red-400"}`}>
                    {r.msg}
                  </span>
                )}
                <button
                  onClick={() => checkUsage(a.id)}
                  disabled={checking === a.id}
                  className="rounded-md border border-border2 bg-bg3 px-2 py-1 text-[11px] text-text2 hover:text-foreground disabled:opacity-50"
                >
                  {checking === a.id ? <Loader2 className="h-3 w-3 animate-spin" /> : "verificar"}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

// =====================================================================
// Monitor — cards de TODAS as contas: saúde, último post, próximo agendado, erros
// =====================================================================

function MonitorTab({ accounts }: { accounts: AccountLite[] }) {
  const { data: queue = [], refetch, isFetching } = useQuery({
    queryKey: ["queue"],
    queryFn: () => api.listQueue(),
  });

  const byAccount = new Map<string, { next?: string; scheduled: number; published: number; failed: number; lastError?: string }>();
  for (const a of accounts) byAccount.set(a.id, { scheduled: 0, published: 0, failed: 0 });
  for (const q of queue) {
    const slot = byAccount.get(q.account);
    if (!slot) continue;
    if (q.status === "scheduled") {
      slot.scheduled++;
      if (!slot.next || q.scheduled_at < slot.next) slot.next = q.scheduled_at;
    } else if (q.status === "published") slot.published++;
    else if (q.status === "failed") {
      slot.failed++;
      if (q.last_error) slot.lastError = q.last_error;
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted2">{accounts.length} conta{accounts.length === 1 ? "" : "s"} monitorada{accounts.length === 1 ? "" : "s"}</p>
        <button
          onClick={() => refetch()}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border2 bg-bg3 px-3 py-1.5 text-xs hover:text-foreground"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} /> Atualizar
        </button>
      </div>
      <ul className="grid gap-3 sm:grid-cols-2">
        {accounts.map((a) => {
          const stats = byAccount.get(a.id) ?? { scheduled: 0, published: 0, failed: 0 };
          const total = stats.scheduled + stats.published;
          const pct = total ? Math.round((stats.published / total) * 100) : 0;
          const healthColor =
            a.health_score >= 80 ? "var(--success)" : a.health_score >= 60 ? "var(--warning)" : "var(--danger)";
          return (
            <li key={a.id} className="rounded-xl border border-border bg-bg3 p-4">
              <div className="flex items-center gap-3">
                <div className="relative">
                  <img src={a.profile_picture} alt="" className="h-10 w-10 rounded-full" />
                  <span
                    className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full ring-2 ring-bg3"
                    style={{ background: healthColor }}
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-semibold">@{a.username}</span>
                    {a.token_status === "expired" && (
                      <span className="rounded-full bg-red-500/15 px-2 py-0.5 text-[10px] font-medium text-red-300">token expirado</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-[11px] text-muted2">
                    <span className="inline-flex items-center gap-1"><Heart className="h-3 w-3" /> {a.health_score}</span>
                    {stats.failed > 0 && (
                      <span className="text-red-400">· {stats.failed} erro(s)</span>
                    )}
                  </div>
                </div>
              </div>

              <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                <div className="rounded-md bg-bg4 py-1.5">
                  <div className="text-[10px] uppercase tracking-wider text-muted2">Agendados</div>
                  <div className="text-sm font-semibold tabular-nums">{stats.scheduled}</div>
                </div>
                <div className="rounded-md bg-bg4 py-1.5">
                  <div className="text-[10px] uppercase tracking-wider text-muted2">Publicados</div>
                  <div className="text-sm font-semibold tabular-nums text-emerald-400">{stats.published}</div>
                </div>
                <div className="rounded-md bg-bg4 py-1.5">
                  <div className="text-[10px] uppercase tracking-wider text-muted2">Falhas</div>
                  <div className="text-sm font-semibold tabular-nums text-red-400">{stats.failed}</div>
                </div>
              </div>

              {total > 0 && (
                <div className="mt-3">
                  <div className="mb-1 flex items-center justify-between text-[10px] text-muted2">
                    <span>{pct}% concluído</span>
                    <span className="tabular-nums">{stats.published}/{total}</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-bg4">
                    <div className="h-full im-grad-accent" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              )}

              <div className="mt-3 space-y-1 text-[11px] text-muted2">
                {stats.next && (
                  <div className="flex items-center gap-1.5">
                    <Clock className="h-3 w-3" />
                    Próximo: <span className="text-text2">{fmtDateTime(stats.next)}</span>
                  </div>
                )}
                {a.last_post_at && (
                  <div className="flex items-center gap-1.5">
                    <CheckCircle2 className="h-3 w-3" />
                    Último post: <span className="text-text2">{fmtDateTime(a.last_post_at)}</span>
                  </div>
                )}
                {stats.lastError && (
                  <div className="truncate text-red-400" title={stats.lastError}>⚠ {stats.lastError}</div>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
