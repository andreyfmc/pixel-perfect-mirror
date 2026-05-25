import { createFileRoute } from "@tanstack/react-router";
import { mockHistory } from "@/lib/mock";
import { Eye, Heart, MessageCircle } from "lucide-react";

export const Route = createFileRoute("/_app/history")({
  component: HistoryPage,
  head: () => ({ meta: [{ title: "Histórico · Insta Manager" }] }),
});

function HistoryPage() {
  return (
    <div className="mx-auto max-w-7xl px-5 py-8 md:px-10">
      <header className="mb-8">
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted2">Histórico</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Tudo que foi publicado</h1>
      </header>

      <div className="im-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-bg3 text-xs uppercase tracking-wider text-muted2">
            <tr>
              <th className="px-4 py-3 text-left font-medium">Post</th>
              <th className="px-4 py-3 text-left font-medium">Conta</th>
              <th className="px-4 py-3 text-left font-medium">Publicado</th>
              <th className="px-4 py-3 text-right font-medium">Alcance</th>
              <th className="px-4 py-3 text-right font-medium">Likes</th>
              <th className="px-4 py-3 text-right font-medium">Comentários</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {mockHistory.map((h) => (
              <tr key={h.id} className="hover:bg-bg3/40">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <img src={h.thumb} alt="" className="h-10 w-10 rounded-md object-cover" />
                    <span className="line-clamp-1 max-w-xs">{h.caption}</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-text2">@{h.account}</td>
                <td className="px-4 py-3 text-text2">
                  {new Date(h.published_at).toLocaleString("pt-BR", {
                    day: "2-digit",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </td>
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
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
