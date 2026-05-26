import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { listDriveEntries, type DriveVideo, type DriveFolder, type DriveCrumb } from "@/lib/drive.functions";
import { Folder, ChevronRight, Home } from "lucide-react";
import {
  UploadCloud,
  Type,
  Settings2,
  ListChecks,
  Activity,
  Image as ImageIcon,
  Link2,
  HardDrive,
  CheckCircle2,
  Loader2,
  AlertCircle,
  Wand2,
  Copy,
  Check,
} from "lucide-react";

export const Route = createFileRoute("/_app/warmup")({
  component: WarmupPage,
  head: () => ({ meta: [{ title: "Warmup · Insta Manager" }] }),
});

const tabs = [
  { id: "upload", label: "Upload", icon: UploadCloud },
  { id: "distribute", label: "Distribuir", icon: Wand2 },
  { id: "captions", label: "Legendas", icon: Type },
  { id: "config", label: "Configurações", icon: Settings2 },
  { id: "preview", label: "Preview da Fila", icon: ListChecks },
  { id: "monitor", label: "Monitor", icon: Activity },
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
  const [coverTab, setCoverTab] = useState<"url" | "drive" | "local">("url");
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const { data: accounts = [] } = useQuery({
    queryKey: ["accounts"],
    queryFn: () => api.listAccounts(),
  });


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
                {active && (
                  <span
                    className="absolute inset-x-3 -bottom-px h-[2px] rounded-full"
                    style={{ background: "var(--accent2)" }}
                  />
                )}
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
                </div>
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
                          <div className="truncate text-sm font-medium">{u.name}</div>
                          <div className="truncate text-xs text-muted2">
                            {(u.size / 1024 / 1024).toFixed(2)} MB ·{" "}
                            {u.status === "uploading" && "enviando para R2…"}
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
                </>
              )}
            </div>
          )}

          {tab === "distribute" && <DistributeTab />}

          {tab === "captions" && (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2">
                {["aleatório", "fixo", "por arquivo"].map((m, i) => (
                  <button
                    key={m}
                    className={[
                      "rounded-lg border px-3 py-1.5 text-sm",
                      i === 0
                        ? "border-accent text-foreground bg-bg3"
                        : "border-border2 text-text2 hover:text-foreground",
                    ].join(" ")}
                  >
                    {m}
                  </button>
                ))}
              </div>
              <textarea
                rows={10}
                placeholder="Uma legenda por linha. Use #hashtags livremente."
                className="w-full resize-y rounded-lg border border-border2 bg-bg3 p-3 text-sm outline-none focus:border-accent"
              />
              <p className="text-xs text-muted2">12 legendas detectadas · sorteio uniforme</p>
            </div>
          )}

          {tab === "config" && (
            <div className="grid gap-6 lg:grid-cols-2">
              <div>
                <h3 className="mb-3 text-sm font-semibold">Contas no aquecimento</h3>
                <ul className="space-y-2">
                  {accounts.map((a, i) => (
                    <li
                      key={a.id}
                      className="flex items-center gap-3 rounded-lg border border-border bg-bg3 p-3"
                    >
                      <input type="checkbox" defaultChecked={i < 2} className="accent-accent" />
                      <img src={a.profile_picture} alt="" className="h-8 w-8 rounded-full" />
                      <span className="flex-1 text-sm">@{a.username}</span>
                      <span className="text-xs text-muted2">saúde {a.health_score}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="mb-1.5 block text-xs uppercase tracking-wider text-muted2">
                    Data de início
                  </label>
                  <input
                    type="datetime-local"
                    className="w-full rounded-lg border border-border2 bg-bg3 px-3 py-2 text-sm outline-none focus:border-accent"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1.5 block text-xs uppercase tracking-wider text-muted2">
                      Intervalo (h)
                    </label>
                    <input
                      type="number"
                      defaultValue={6}
                      className="w-full rounded-lg border border-border2 bg-bg3 px-3 py-2 text-sm outline-none focus:border-accent"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs uppercase tracking-wider text-muted2">
                      Distribuição
                    </label>
                    <select className="w-full rounded-lg border border-border2 bg-bg3 px-3 py-2 text-sm outline-none focus:border-accent">
                      <option>Uniforme</option>
                      <option>Horário comercial</option>
                      <option>Aleatório suave</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="mb-1.5 block text-xs uppercase tracking-wider text-muted2">
                    <ImageIcon className="mr-1 inline h-3.5 w-3.5" /> Capa dos Reels
                  </label>
                  <div className="rounded-lg border border-border2 bg-bg3 p-1">
                    <div className="flex gap-1">
                      {(
                        [
                          { id: "url", label: "URL", icon: Link2 },
                          { id: "drive", label: "Google Drive", icon: HardDrive },
                          { id: "local", label: "Arquivo local", icon: UploadCloud },
                        ] as const
                      ).map(({ id, label, icon: Icon }) => (
                        <button
                          key={id}
                          onClick={() => setCoverTab(id)}
                          className={[
                            "flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs",
                            coverTab === id
                              ? "bg-bg4 text-foreground"
                              : "text-text2 hover:text-foreground",
                          ].join(" ")}
                        >
                          <Icon className="h-3.5 w-3.5" />
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="mt-3">
                    {coverTab === "url" && (
                      <input
                        type="url"
                        placeholder="https://..."
                        className="w-full rounded-lg border border-border2 bg-bg3 px-3 py-2 text-sm outline-none focus:border-accent"
                      />
                    )}
                    {coverTab === "drive" && (
                      <button className="w-full rounded-lg border border-border2 bg-bg3 px-3 py-2 text-sm text-text2 hover:text-foreground">
                        Abrir Drive Picker (imagens)
                      </button>
                    )}
                    {coverTab === "local" && (
                      <input
                        type="file"
                        accept="image/*"
                        className="w-full rounded-lg border border-border2 bg-bg3 px-3 py-2 text-sm text-text2 file:mr-3 file:rounded-md file:border-0 file:bg-bg4 file:px-2 file:py-1 file:text-foreground"
                      />
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {tab === "preview" && (
            <div className="rounded-xl border border-border bg-bg3/40 p-10 text-center text-sm text-text2">
              Pré-visualização da fila será gerada após configurar a aba <b>Configurações</b>.
            </div>
          )}

          {tab === "monitor" && (
            <ul className="space-y-3">
              {accounts.slice(0, 3).map((a, i) => {
                const pct = [62, 28, 8][i];
                return (
                  <li key={a.id} className="rounded-lg border border-border bg-bg3 p-4">
                    <div className="flex items-center gap-3">
                      <img src={a.profile_picture} alt="" className="h-9 w-9 rounded-full" />
                      <div className="flex-1">
                        <div className="text-sm font-medium">@{a.username}</div>
                        <div className="text-xs text-muted2">{pct}% concluído</div>
                      </div>
                      <span className="text-xs text-text2 tabular-nums">{Math.round(pct / 10)}/10 posts</span>
                    </div>
                    <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-bg4">
                      <div className="h-full im-grad-accent" style={{ width: `${pct}%` }} />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function DistributeTab() {
  const fetchEntries = useServerFn(listDriveEntries);
  const [loading, setLoading] = useState(true);
  const [folderId, setFolderId] = useState<string>("root");
  const [folders, setFolders] = useState<DriveFolder[]>([]);
  const [videos, setVideos] = useState<DriveVideo[]>([]);
  const [breadcrumbs, setBreadcrumbs] = useState<DriveCrumb[]>([]);
  const [error, setError] = useState<string | null>(null);
  // Multi-seleção persistente: id -> vídeo (preserva entre navegações de pasta)
  const [selectedVideos, setSelectedVideos] = useState<Map<string, DriveVideo>>(new Map());
  const [loadingFolder, setLoadingFolder] = useState<string | null>(null);
  const [selectedAccounts, setSelectedAccounts] = useState<string[]>([]);
  const { data: accounts = [] } = useQuery({
    queryKey: ["accounts"],
    queryFn: () => api.listAccounts(),
  });
  // Por padrão, seleciona todas as contas assim que carregarem
  useEffect(() => {
    if (accounts.length && selectedAccounts.length === 0) {
      setSelectedAccounts(accounts.map((a) => a.id));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accounts.length]);
  const [caption, setCaption] = useState("");
  // Default: agora (hora local do dispositivo)
  const localNow = () => {
    const d = new Date();
    d.setSeconds(0, 0);
    const tz = d.getTimezoneOffset() * 60_000;
    return new Date(d.getTime() - tz).toISOString().slice(0, 16);
  };
  const [start, setStart] = useState(localNow);
  // Intervalo entre CICLOS (cada vídeo é um ciclo, postado por todas as contas).
  const [gap, setGap] = useState(60);
  // Jitter aplicado entre contas dentro do mesmo ciclo (±N minutos).
  const [jitter, setJitter] = useState(20);
  const [order, setOrder] = useState<"sequential" | "random">("sequential");
  const [copied, setCopied] = useState(false);
  const [enqueueing, setEnqueueing] = useState(false);
  const [enqueueMsg, setEnqueueMsg] = useState<string | null>(null);
  const navigate = useNavigate();

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
  const allAccountsSelected = accounts.length > 0 && selectedAccounts.length === accounts.length;
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

  // Recursivo: anda pela pasta + subpastas e adiciona todo vídeo encontrado
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

  const clearSelection = () => setSelectedVideos(new Map());

  const selectedList = Array.from(selectedVideos.values());

  const command = selectedList.length && selectedAccounts.length
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
    if (!selectedList.length || !selectedAccounts.length) return;
    setEnqueueing(true);
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
      // Cada vídeo = um ciclo. Em cada ciclo, todas as contas selecionadas
      // postam aquele vídeo, com jitter ±N minutos entre elas para evitar
      // chamadas simultâneas à API. Próximo ciclo começa após `gap` minutos.
      const jitterMs = Math.max(0, jitter) * 60_000;
      for (let cycle = 0; cycle < selectedList.length; cycle++) {
        const cycleStartMs = startMs + cycle * gap * 60_000;
        const accountsForCycle =
          order === "random" ? shuffle(selectedAccounts) : selectedAccounts;
        for (const accId of accountsForCycle) {
          const v = selectedList[cycle];
          const jitterOffset = jitterMs
            ? Math.round((Math.random() * 2 - 1) * jitterMs)
            : 0;
          const scheduledAt = new Date(cycleStartMs + jitterOffset).toISOString();
          const res = await api.enqueue({
            account_id: accId,
            caption,
            media_type: "REEL",
            media_key: `drive:${v.id}`,
            scheduled_at: scheduledAt,
          });
          if (res) ok++;
          else fail++;
        }
      }
      setEnqueueMsg(
        `✓ ${ok} agendado(s)${fail ? ` · ${fail} falha(s)` : ""} · ${selectedList.length} ciclo(s) de ${gap}min · jitter ±${jitter}min`,
      );
      if (ok > 0 && fail === 0) {
        setTimeout(() => navigate({ to: "/queue" }), 600);
      }
    } catch (e) {
      setEnqueueMsg(`Erro: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setEnqueueing(false);
    }
  };


  return (
    <div className="grid gap-6 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
      <div className="min-w-0">

        <h3 className="mb-3 text-sm font-semibold flex items-center gap-2">
          <HardDrive className="h-4 w-4" /> Google Drive
        </h3>

        <div className="mb-3 flex flex-wrap items-center gap-1 rounded-lg border border-border bg-bg3/60 px-2 py-1.5 text-xs">
          <button
            onClick={() => setFolderId("root")}
            className="inline-flex items-center gap-1 rounded px-1.5 py-1 text-text2 hover:bg-bg4 hover:text-foreground"
          >
            <Home className="h-3.5 w-3.5" /> Meu Drive
          </button>
          {breadcrumbs.map((c) => (
            <span key={c.id} className="flex items-center gap-1">
              <ChevronRight className="h-3 w-3 text-muted2" />
              <button
                onClick={() => setFolderId(c.id)}
                className="rounded px-1.5 py-1 text-text2 hover:bg-bg4 hover:text-foreground"
              >
                {c.name}
              </button>
            </span>
          ))}
        </div>

        {loading && (
          <div className="rounded-xl border border-border bg-bg3/40 p-10 text-center text-sm text-text2">
            <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" /> carregando…
          </div>
        )}
        {!loading && error && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-4 text-sm text-red-300">
            <AlertCircle className="mr-1 inline h-4 w-4" /> {error}
          </div>
        )}
        {!loading && !error && folders.length === 0 && videos.length === 0 && (
          <div className="rounded-xl border border-border bg-bg3/40 p-10 text-center text-sm text-text2">
            Pasta vazia.
          </div>
        )}
        {!loading && (folders.length > 0 || videos.length > 0) && (
          <>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="text-muted2">
                {selectedVideos.size > 0
                  ? `${selectedVideos.size} vídeo${selectedVideos.size > 1 ? "s" : ""} selecionado${selectedVideos.size > 1 ? "s" : ""}`
                  : "Nada selecionado"}
              </span>
              <div className="flex items-center gap-2">
                {videos.length > 0 && (
                  <button
                    onClick={toggleSelectAllHere}
                    className="rounded-md border border-border2 bg-bg3 px-2 py-1 text-text2 hover:text-foreground"
                  >
                    {allCurrentSelected ? "Desmarcar pasta atual" : "Selecionar todos aqui"}
                  </button>
                )}
                {selectedVideos.size > 0 && (
                  <button
                    onClick={clearSelection}
                    className="rounded-md px-2 py-1 text-text2 hover:text-foreground"
                  >
                    Limpar
                  </button>
                )}
              </div>
            </div>
            <ul className="grid max-h-[460px] gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
              {folders.map((f) => (
                <li key={f.id}>
                  <div className="group flex items-center gap-2 rounded-lg border border-border bg-bg3/60 p-2 transition hover:border-border2">
                    <button
                      onClick={() => setFolderId(f.id)}
                      className="flex min-w-0 flex-1 items-center gap-3 text-left"
                    >
                      <div className="flex h-14 w-20 flex-shrink-0 items-center justify-center rounded-md bg-bg4">
                        <Folder className="h-5 w-5 text-text2" />
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
                      className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md border border-border2 text-text2 hover:bg-bg4 hover:text-foreground disabled:opacity-50"
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
                        "group flex w-full items-center gap-3 rounded-lg border p-2 text-left transition",
                        active
                          ? "border-accent bg-bg3"
                          : "border-border bg-bg3/60 hover:border-border2",
                      ].join(" ")}
                    >
                      <div className="h-14 w-20 flex-shrink-0 overflow-hidden rounded-md bg-bg4">
                        {v.thumbnailLink ? (
                          <img src={v.thumbnailLink} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-muted2">
                            <ImageIcon className="h-4 w-4" />
                          </div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">{v.name}</div>
                        <div className="text-xs text-muted2">
                          {v.size ? `${(Number(v.size) / 1024 / 1024).toFixed(1)} MB` : ""}
                          {v.durationMillis ? ` · ${Math.round(Number(v.durationMillis) / 1000)}s` : ""}
                        </div>
                      </div>
                      <div
                        className={[
                          "flex h-5 w-5 flex-shrink-0 items-center justify-center rounded border",
                          active ? "border-accent bg-accent text-white" : "border-border2",
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

      <div className="space-y-4 min-w-0 rounded-xl border border-border bg-bg3/30 p-4">

        <div>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold">Contas que recebem</h3>
            <button
              onClick={toggleAllAccounts}
              className="rounded-md border border-border2 bg-bg3 px-2 py-1 text-xs text-text2 hover:text-foreground"
            >
              {allAccountsSelected ? "Desmarcar todas" : "Selecionar todas"}
            </button>
          </div>
          <div className="mb-2 text-xs text-muted2">
            {selectedAccounts.length} de {accounts.length} selecionada(s)
          </div>
          <ul className="space-y-1.5 max-h-[260px] overflow-y-auto pr-1">
            {accounts.map((a) => (
              <li key={a.id}>
                <label className="flex items-center gap-2 rounded-md border border-border bg-bg3 p-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedAccounts.includes(a.id)}
                    onChange={() => toggleAccount(a.id)}
                    className="accent-accent"
                  />
                  <img src={a.profile_picture} alt="" className="h-6 w-6 rounded-full" />
                  <span className="flex-1">@{a.username}</span>
                </label>
              </li>
            ))}
          </ul>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <div>
            <label className="mb-1 block text-xs uppercase tracking-wider text-muted2">Início</label>
            <input
              type="datetime-local"
              value={start}
              onChange={(e) => setStart(e.target.value)}
              className="w-full rounded-lg border border-border2 bg-bg3 px-2 py-1.5 text-sm outline-none focus:border-accent"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs uppercase tracking-wider text-muted2" title="Intervalo entre ciclos (cada vídeo)">
              Ciclo (min)
            </label>
            <input
              type="number"
              min={1}
              value={gap}
              onChange={(e) => setGap(Number(e.target.value))}
              className="w-full rounded-lg border border-border2 bg-bg3 px-2 py-1.5 text-sm outline-none focus:border-accent"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs uppercase tracking-wider text-muted2" title="Variação ± aplicada entre contas dentro do mesmo ciclo">
              Jitter (±min)
            </label>
            <input
              type="number"
              min={0}
              value={jitter}
              onChange={(e) => setJitter(Number(e.target.value))}
              className="w-full rounded-lg border border-border2 bg-bg3 px-2 py-1.5 text-sm outline-none focus:border-accent"
            />
        </div>

        <div>
          <label className="mb-1.5 block text-xs uppercase tracking-wider text-muted2">
            Ordem dos vídeos
          </label>
          <div className="grid grid-cols-2 gap-1 rounded-lg border border-border2 bg-bg3 p-1">
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
                    "rounded-md px-3 py-1.5 text-xs font-medium transition",
                    active
                      ? "bg-accent text-white shadow"
                      : "text-text2 hover:text-foreground",
                  ].join(" ")}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
          <p className="mt-1 text-[11px] text-muted2">
            {order === "random"
              ? "Cada conta recebe os vídeos em ordem embaralhada."
              : "Todas as contas seguem a mesma ordem de seleção."}
          </p>
        </div>

        </div>

        <div>
          <label className="mb-1 block text-xs uppercase tracking-wider text-muted2">Legenda base</label>
          <textarea
            rows={3}
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            placeholder="novo drop ✦"
            className="w-full resize-y rounded-lg border border-border2 bg-bg3 p-2 text-sm outline-none focus:border-accent"
          />
        </div>

        <div className="space-y-2">
          <button
            onClick={enqueueAll}
            disabled={enqueueing || !selectedList.length || !selectedAccounts.length}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white shadow hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {enqueueing ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Agendando…
              </>
            ) : (
              <>
                <Wand2 className="h-4 w-4" /> Agendar nas contas selecionadas
              </>
            )}
          </button>
          {enqueueMsg && (
            <div className="rounded-md border border-border bg-bg3 px-3 py-2 text-xs text-text2">
              {enqueueMsg}
            </div>
          )}
          <p className="text-[11px] text-muted2">
            Cada vídeo vira um ciclo: todas as contas selecionadas postam o mesmo vídeo dentro
            de uma janela de ±{jitter}min, e o próximo ciclo começa {gap}min depois. Após o
            agendamento, você é levado direto para a Fila.
          </p>
        </div>

        <div>
          <div className="mb-1 flex items-center justify-between">
            <label className="text-xs uppercase tracking-wider text-muted2">
              Comando local (avançado · gera variantes únicas com ffmpeg)
            </label>
            {command && (
              <button
                onClick={copy}
                className="inline-flex items-center gap-1 text-xs text-text2 hover:text-foreground"
              >
                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? "copiado" : "copiar"}
              </button>
            )}
          </div>
          <pre className="overflow-x-auto rounded-lg border border-border bg-bg4 p-3 text-[11px] leading-relaxed text-text2">
{command || "Selecione ao menos um vídeo do Drive e uma conta."}
          </pre>
          <p className="mt-2 text-xs text-muted2">
            Rode esse comando no seu PC (precisa de <code className="rounded bg-bg4 px-1">ffmpeg</code> +{" "}
            <code className="rounded bg-bg4 px-1">bun</code>). Gera 1 variante única por conta — metadados
            zerados, re-encode + micro-ajustes visuais — sobe ao R2 e enfileira.
          </p>
        </div>
      </div>
    </div>
  );
}
