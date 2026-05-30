import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import {
  UploadCloud,
  CalendarPlus,
  Gauge,
  Activity,
  Folder,
  Image as ImageIcon,
  CheckCircle2,
  Loader2,
  AlertCircle,
  Wand2,
} from "lucide-react";
import { DistributeTab } from "@/components/warmup/DistributeTab";
import { RateLimitTab } from "@/components/warmup/RateLimitTab";
import { MonitorTab } from "@/components/warmup/MonitorTab";

// ---------------------------------------------------------------------------
// Google badge SVG (inline — pequeno demais para ser um arquivo separado)
// ---------------------------------------------------------------------------
function GoogleBadge({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.6-6 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.6 16 18.9 13 24 13c3.1 0 5.8 1.2 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2c-2 1.5-4.6 2.4-7.2 2.4-5.3 0-9.7-3.4-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.1-4.1 5.5l6.2 5.2C41.5 35.6 44 30.2 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------
export const Route = createFileRoute("/_app/warmup")({
  component: WarmupPage,
  head: () => ({ meta: [{ title: "Warmup · Insta Manager" }] }),
});

const TABS = [
  { id: "upload",  label: "Upload",     icon: UploadCloud,  emoji: "📤" },
  { id: "post",    label: "Postagem",   icon: CalendarPlus, emoji: "✨" },
  { id: "config",  label: "Rate Limit", icon: Gauge,        emoji: "⚙️" },
  { id: "monitor", label: "Monitor",    icon: Activity,     emoji: "📡" },
] as const;

type TabId = (typeof TABS)[number]["id"];

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

// ---------------------------------------------------------------------------
// File helpers (drag-and-drop recursivo com FileSystem API)
// ---------------------------------------------------------------------------
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
    // eslint-disable-next-line no-constant-condition
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
  if (items?.length && typeof items[0].webkitGetAsEntry === "function") {
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

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
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

  const pendingCount = queue.filter(
    (q: { status: string }) => q.status === "scheduled",
  ).length;

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
            : {
                ...copy[idx],
                status: "error",
                error: "Falha no upload — bindings R2 indisponíveis?",
              };
          return copy;
        });
      }),
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6 sm:py-7 md:px-10 md:py-8">
      <header className="mb-6">
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted2">
          Warmup
        </p>
        <h1 className="mt-2 text-2xl sm:text-3xl font-semibold tracking-tight">
          Aquecimento de contas
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-text2">
          Programe uma série de posts gradual para esquentar contas novas e simular
          comportamento orgânico.
        </p>
      </header>

      <div className="im-card overflow-hidden">
        {/* Tab bar */}
        <nav className="flex overflow-x-auto border-b border-border bg-bg2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {TABS.map(({ id, label, icon: Icon }) => {
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

        {/* Tab content */}
        <div className="p-4 sm:p-6">
          {tab === "upload" && (
            <UploadTab
              uploads={uploads}
              dragOver={dragOver}
              inputRef={inputRef}
              folderInputRef={folderInputRef}
              onDragOver={() => setDragOver(true)}
              onDragLeave={() => setDragOver(false)}
              onDrop={async (dt) => {
                setDragOver(false);
                await handleFiles(await filesFromDataTransfer(dt));
              }}
              onFiles={handleFiles}
              onClear={() => {
                uploads.forEach((u) => u.preview && URL.revokeObjectURL(u.preview));
                setUploads([]);
              }}
              onContinue={() => setTab("post")}
            />
          )}
          {tab === "post"    && <DistributeTab />}
          {tab === "config"  && <RateLimitTab accounts={accounts} />}
          {tab === "monitor" && <MonitorTab accounts={accounts} />}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// UploadTab — zona de drag-and-drop + lista de uploads
// Mantido inline porque é pequeno e específico desta rota
// ---------------------------------------------------------------------------
type UploadTabProps = {
  uploads: Upload[];
  dragOver: boolean;
  inputRef: React.RefObject<HTMLInputElement>;
  folderInputRef: React.RefObject<HTMLInputElement>;
  onDragOver: () => void;
  onDragLeave: () => void;
  onDrop: (dt: DataTransfer) => Promise<void>;
  onFiles: (files: File[] | FileList | null) => void;
  onClear: () => void;
  onContinue: () => void;
};

function UploadTab({
  uploads,
  dragOver,
  inputRef,
  folderInputRef,
  onDragOver,
  onDragLeave,
  onDrop,
  onFiles,
  onClear,
  onContinue,
}: UploadTabProps) {
  return (
    <div className="space-y-5">
      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; onDragOver(); }}
        onDragEnter={(e) => { e.preventDefault(); onDragOver(); }}
        onDragLeave={(e) => { e.preventDefault(); if (e.currentTarget === e.target) onDragLeave(); }}
        onDrop={async (e) => { e.preventDefault(); await onDrop(e.dataTransfer); }}
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
          Reels (mp4, mov) e Feed/Stories (jpg, png, webp). Enviados direto para o
          bucket R2{" "}
          <code className="rounded bg-bg4 px-1.5 py-0.5 text-[11px]">insta-media</code>.
        </p>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept="image/*,video/*"
          className="hidden"
          onChange={(e) => { onFiles(e.target.files); e.target.value = ""; }}
        />
        <input
          ref={folderInputRef}
          type="file"
          multiple
          // @ts-expect-error — atributos não-padrão para upload de pasta
          webkitdirectory=""
          directory=""
          className="hidden"
          onChange={(e) => { onFiles(e.target.files); e.target.value = ""; }}
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
            <Folder className="h-4 w-4" /> Selecionar pasta
          </button>
          <button
            onClick={onContinue}
            className="inline-flex items-center gap-2 rounded-lg border border-border2 bg-white px-4 py-2 text-sm font-medium text-neutral-800 shadow-sm hover:bg-neutral-50"
            title="Importar do Google Drive (vai para Postagem)"
          >
            <GoogleBadge className="h-4 w-4" /> Importar do Google Drive
          </button>
        </div>
        <p className="mt-3 text-[11px] text-muted2">
          Arquivos locais são apenas armazenados no R2. Os metadados são limpos
          automaticamente no momento de publicar (re-encode + jitter visual por conta).
        </p>
      </div>

      {/* Upload list */}
      {uploads.length > 0 && (
        <>
          <div className="flex items-center justify-between text-xs text-muted2">
            <span>
              {uploads.length} arquivo{uploads.length === 1 ? "" : "s"} ·{" "}
              {uploads.filter((u) => u.status === "done").length} concluído(s) ·{" "}
              {uploads.filter((u) => u.status === "uploading").length} enviando ·{" "}
              {uploads.filter((u) => u.status === "error").length} erro(s)
            </span>
            <button onClick={onClear} className="hover:text-foreground">
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
                      <span className="rounded-full bg-red-500/15 px-2 py-0.5 text-[10px] font-medium text-red-300">
                        erro
                      </span>
                    )}
                  </div>
                  <div className="truncate text-xs text-muted2">
                    {(u.size / 1024 / 1024).toFixed(2)} MB ·{" "}
                    {u.status === "done" && (
                      <>
                        <span className="text-emerald-400">no R2</span> ·{" "}
                        <a href={u.url} target="_blank" rel="noreferrer" className="underline hover:text-foreground">
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

          {uploads.every((u) => u.status === "done") && (
            <button
              onClick={onContinue}
              className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-lg im-grad-accent px-4 py-2.5 text-sm font-semibold text-white"
            >
              <Wand2 className="h-4 w-4" /> Continuar para Postagem →
            </button>
          )}
        </>
      )}
    </div>
  );
}
