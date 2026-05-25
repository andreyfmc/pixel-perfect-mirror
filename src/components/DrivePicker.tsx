import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ChevronRight, Folder, Loader2, Play, X, RefreshCw } from "lucide-react";
import { listDriveEntries, type DriveListing, type DriveVideo } from "@/lib/drive.functions";

export function DrivePicker({
  open,
  onClose,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  onPick?: (video: DriveVideo) => void;
}) {
  const list = useServerFn(listDriveEntries);
  const [folderId, setFolderId] = useState<string>("root");
  const [data, setData] = useState<DriveListing | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load(id: string) {
    setLoading(true);
    setError(null);
    try {
      const r = await list({ data: { folderId: id } });
      setData(r);
      if (r.error) setError(r.error);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (open) load(folderId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, folderId]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="im-card flex h-[80vh] w-full max-w-3xl flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal
      >
        <header className="flex items-center justify-between border-b border-border bg-bg2 px-5 py-3">
          <div className="flex flex-wrap items-center gap-1 text-sm">
            <button
              onClick={() => setFolderId("root")}
              className="text-text2 hover:text-foreground"
            >
              Meu Drive
            </button>
            {(data?.breadcrumbs ?? []).map((c) => (
              <span key={c.id} className="flex items-center gap-1">
                <ChevronRight className="h-3 w-3 text-muted2" />
                <button
                  onClick={() => setFolderId(c.id)}
                  className="text-text2 hover:text-foreground"
                >
                  {c.name}
                </button>
              </span>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => load(folderId)}
              className="rounded-md p-1.5 text-text2 hover:bg-bg3 hover:text-foreground"
              aria-label="Atualizar"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </button>
            <button onClick={onClose} className="text-text2 hover:text-foreground" aria-label="Fechar">
              <X className="h-5 w-5" />
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-4">
          {loading && !data && (
            <div className="grid place-items-center py-16 text-text2">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          )}
          {error && (
            <div className="mb-4 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
              {error}
            </div>
          )}

          {data && (
            <>
              {data.folders.length > 0 && (
                <>
                  <h3 className="mb-2 text-[11px] uppercase tracking-wider text-muted2">Pastas</h3>
                  <ul className="mb-5 grid gap-2 sm:grid-cols-2">
                    {data.folders.map((f) => (
                      <li key={f.id}>
                        <button
                          onClick={() => setFolderId(f.id)}
                          className="flex w-full items-center gap-2 rounded-lg border border-border2 bg-bg3 px-3 py-2 text-left text-sm hover:border-accent"
                        >
                          <Folder className="h-4 w-4 text-accent" />
                          <span className="truncate">{f.name}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              )}

              <h3 className="mb-2 text-[11px] uppercase tracking-wider text-muted2">Vídeos</h3>
              {data.videos.length === 0 ? (
                <p className="rounded-lg border border-dashed border-border2 px-3 py-6 text-center text-sm text-text2">
                  Nenhum vídeo nesta pasta.
                </p>
              ) : (
                <ul className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
                  {data.videos.map((v) => (
                    <li key={v.id}>
                      <button
                        onClick={() => {
                          onPick?.(v);
                          onClose();
                        }}
                        className="group flex w-full flex-col overflow-hidden rounded-lg border border-border2 bg-bg3 text-left hover:border-accent"
                      >
                        <span className="relative grid aspect-video place-items-center bg-bg4">
                          {v.thumbnailLink ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={v.thumbnailLink} alt="" className="h-full w-full object-cover" />
                          ) : (
                            <Play className="h-6 w-6 text-text2" />
                          )}
                        </span>
                        <span className="block truncate p-2 text-xs">{v.name}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
