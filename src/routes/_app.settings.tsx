import { createFileRoute } from "@tanstack/react-router";
import { HardDrive, Download, Upload, KeyRound } from "lucide-react";

export const Route = createFileRoute("/_app/settings")({
  component: SettingsPage,
  head: () => ({ meta: [{ title: "Configurações · Insta Manager" }] }),
});

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="im-card p-6">
      <header className="mb-4">
        <h2 className="text-base font-semibold tracking-tight">{title}</h2>
        <p className="mt-1 text-sm text-text2">{description}</p>
      </header>
      {children}
    </section>
  );
}

function SettingsPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-5 sm:px-6 sm:py-7 md:px-10 md:py-8">
      <header className="mb-8">
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted2">Sistema</p>
        <h1 className="mt-2 text-2xl sm:text-3xl font-semibold tracking-tight">Configurações</h1>
      </header>

      <div className="space-y-5">
        <Section
          title="Google Drive"
          description="Conecte para importar mídias direto do seu Drive ao agendar posts."
        >
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-bg3">
              <HardDrive className="h-4 w-4 text-text2" />
            </div>
            <div className="flex-1">
              <div className="text-sm font-medium">Não conectado</div>
              <div className="text-xs text-muted2">OAuth do Google</div>
            </div>
            <button className="rounded-lg im-grad-accent px-3.5 py-2 text-sm font-medium text-white">
              Conectar
            </button>
          </div>
        </Section>

        <Section title="Tokens" description="Verifique a validade e renove tokens das contas conectadas.">
          <button className="inline-flex items-center gap-1.5 rounded-lg border border-border2 bg-bg3 px-3.5 py-2 text-sm hover:border-accent">
            <KeyRound className="h-4 w-4" /> Verificar tokens agora
          </button>
        </Section>

        <Section title="Backup" description="Exporte ou importe contas, fila e histórico em JSON.">
          <div className="flex flex-wrap gap-2">
            <button className="inline-flex items-center gap-1.5 rounded-lg border border-border2 bg-bg3 px-3.5 py-2 text-sm hover:border-accent">
              <Download className="h-4 w-4" /> Exportar dados
            </button>
            <button className="inline-flex items-center gap-1.5 rounded-lg border border-border2 bg-bg3 px-3.5 py-2 text-sm hover:border-accent">
              <Upload className="h-4 w-4" /> Importar
            </button>
          </div>
        </Section>
      </div>
    </div>
  );
}
