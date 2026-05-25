import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { mockAccounts } from "@/lib/mock";
import {
  UploadCloud,
  Type,
  Settings2,
  ListChecks,
  Activity,
  Image as ImageIcon,
  Link2,
  HardDrive,
} from "lucide-react";

export const Route = createFileRoute("/_app/warmup")({
  component: WarmupPage,
  head: () => ({ meta: [{ title: "Warmup · Insta Manager" }] }),
});

const tabs = [
  { id: "upload", label: "Upload", icon: UploadCloud },
  { id: "captions", label: "Legendas", icon: Type },
  { id: "config", label: "Configurações", icon: Settings2 },
  { id: "preview", label: "Preview da Fila", icon: ListChecks },
  { id: "monitor", label: "Monitor", icon: Activity },
] as const;

type TabId = (typeof tabs)[number]["id"];

function WarmupPage() {
  const [tab, setTab] = useState<TabId>("upload");
  const [coverTab, setCoverTab] = useState<"url" | "drive" | "local">("url");

  return (
    <div className="mx-auto max-w-7xl px-5 py-8 md:px-10">
      <header className="mb-6">
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted2">Warmup</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Aquecimento de contas</h1>
        <p className="mt-2 max-w-2xl text-sm text-text2">
          Programe uma série de posts gradual para esquentar contas novas e simular comportamento orgânico.
        </p>
      </header>

      <div className="im-card overflow-hidden">
        <nav className="flex overflow-x-auto border-b border-border bg-bg2">
          {tabs.map(({ id, label, icon: Icon }) => {
            const active = tab === id;
            return (
              <button
                key={id}
                onClick={() => setTab(id)}
                className={[
                  "relative inline-flex items-center gap-2 whitespace-nowrap px-5 py-3.5 text-sm transition-colors",
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

        <div className="p-6">
          {tab === "upload" && (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border2 bg-bg3/40 px-6 py-16 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-bg3">
                <UploadCloud className="h-5 w-5 text-text2" />
              </div>
              <h3 className="mt-4 text-base font-semibold">Solte vídeos e imagens aqui</h3>
              <p className="mt-1 max-w-md text-sm text-text2">
                Reels (mp4, mov) e Feed/Stories (jpg, png, webp). Você verá preview, tamanho e status de upload de cada item.
              </p>
              <button className="mt-5 rounded-lg im-grad-accent px-4 py-2 text-sm font-medium text-white">
                Selecionar arquivos
              </button>
            </div>
          )}

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
                  {mockAccounts.map((a, i) => (
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
              {mockAccounts.slice(0, 3).map((a, i) => {
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
