import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  Folder,
  ChevronRight,
  Home,
  Loader2,
  AlertCircle,
  Check,
  Trash2,
  Film,
  HardDrive,
} from "lucide-react";
import {
  listDriveEntries,
  type DriveVideo,
  type DriveFolder,
  type DriveCrumb,
} from "@/lib/drive.functions";
import { VideoThumb } from "./VideoThumb";

type Props = {
  selectedVideos: Map<string, DriveVideo>;
  onSelectionChange: (videos: Map<string, DriveVideo>, folder: DriveCrumb | null) => void;
  onFolderChange?: (folderId: string, breadcrumbs: DriveCrumb[]) => void;
};

export function DriveBrowser({
  selectedVideos,
  onSelectionChange,
  onFolderChange,
}: Props) {
  const fetchEntries = useServerFn(listDriveEntries);
  const [loading, setLoading] = useState(true);
  const [folderId, setFolderId] = useState<string>("root");
  const [folders, setFolders] = useState<DriveFolder[]>([]);
  const [videos, setVideos] = useState<DriveVideo[]>([]);
  const [breadcrumbs, setBreadcrumbs] = useState<DriveCrumb[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loadingFolder, setLoadingFolder] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetchEntries({ data: { folderId } })
      .then((r) => {
        setFolders(r.folders);
        setVideos(r.videos);
        setBreadcrumbs(r.breadcrumbs);
        setError(r.error);
        onFolderChange?.(folderId, r.breadcrumbs);
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [fetchEntries, folderId]);

  const currentCrumb = breadcrumbs[breadcrumbs.length - 1] ?? null;

  const toggleVideo = (v: DriveVideo) =>
    onSelectionChange(
      (() => {
        const n = new Map(selectedVideos);
        if (n.has(v.id)) n.delete(v.id);
        else n.set(v.id, v);
        return n;
      })(),
      currentCrumb,
    );

  const allCurrentSelected =
    videos.length > 0 && videos.every((v) => selectedVideos.has(v.id));

  const toggleSelectAllHere = () =>
    onSelectionChange(
      (() => {
        const n = new Map(selectedVideos);
        if (allCurrentSelected) videos.forEach((v) => n.delete(v.id));
        else videos.forEach((v) => n.set(v.id, v));
        return n;
      })(),
      currentCrumb,
    );

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
      const n = new Map(selectedVideos);
      collected.forEach((v) => n.set(v.id, v));
      onSelectionChange(n, { id: f.id, name: f.name });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoadingFolder(null);
    }
  }

  const clearSelection = () => {
    onSelectionChange(new Map(), null);
    setConfirmClear(false);
  };

  const navigateTo = (id: string) => setFolderId(id);

  return (
    <section className="min-w-0">
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
            {selectedVideos.size} vídeo{selectedVideos.size > 1 ? "s" : ""}{" "}
            selecionado{selectedVideos.size > 1 ? "s" : ""}
          </span>
        )}
      </div>

      {/* Breadcrumb */}
      <div className="mb-3 flex flex-wrap items-center gap-1 rounded-[10px] border border-border bg-bg3/60 px-2 py-1.5 text-xs">
        <button
          onClick={() => navigateTo("root")}
          className="inline-flex items-center gap-1 rounded px-1.5 py-1 text-text2 transition hover:bg-bg4 hover:text-foreground"
        >
          <Home className="h-3.5 w-3.5" /> Meu Drive
        </button>
        {breadcrumbs.map((c) => (
          <span key={c.id} className="flex items-center gap-1">
            <ChevronRight className="h-3 w-3 text-muted2" />
            <button
              onClick={() => navigateTo(c.id)}
              className="inline-flex items-center gap-1 rounded px-1.5 py-1 text-text2 transition hover:bg-bg4 hover:text-foreground"
            >
              <Folder className="h-3 w-3" /> {c.name}
            </button>
          </span>
        ))}
      </div>

      {/* Loading skeleton */}
      {loading && (
        <ul className="grid grid-cols-2 gap-2 md:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <li
              key={i}
              className="h-[52px] animate-pulse rounded-[10px] border border-border bg-bg3/40"
            />
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
                {allCurrentSelected
                  ? "Desmarcar pasta atual"
                  : "Selecionar todos aqui"}
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

          <ul className="grid grid-cols-2 gap-2 md:grid-cols-3">
            {folders.map((f) => (
              <li key={f.id}>
                <div className="group flex h-[52px] items-center gap-2 rounded-[10px] border border-border bg-bg3/60 px-2 transition hover:-translate-y-[1px] hover:border-[var(--accent2)] hover:shadow-md">
                  <button
                    onClick={() => navigateTo(f.id)}
                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                  >
                    <div
                      className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-md"
                      style={{
                        background:
                          "linear-gradient(135deg, color-mix(in oklch, var(--accent2) 20%, #1a1a1a), #111)",
                      }}
                    >
                      <Folder className="h-4 w-4 text-white/80" />
                    </div>
                    <div className="truncate text-sm font-medium">{f.name}</div>
                  </button>
                  <button
                    onClick={() => selectEntireFolder(f)}
                    disabled={loadingFolder === f.id}
                    title="Selecionar todos os vídeos desta pasta (recursivo)"
                    className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md border border-border2 text-text2 transition hover:bg-bg4 hover:text-foreground disabled:opacity-50"
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
                      "group flex h-[52px] w-full items-center gap-2 rounded-[10px] border px-2 text-left transition hover:-translate-y-[1px]",
                      active
                        ? "border-[var(--accent2)] bg-bg3 shadow-md"
                        : "border-border bg-bg3/60 hover:border-border2",
                    ].join(" ")}
                  >
                    <div className="h-9 w-12 flex-shrink-0 overflow-hidden rounded-md bg-bg4">
                      <VideoThumb v={v} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{v.name}</div>
                      <div className="truncate text-[10px] text-muted2">
                        {v.size
                          ? `${(Number(v.size) / 1024 / 1024).toFixed(1)} MB`
                          : ""}
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
    </section>
  );
}
