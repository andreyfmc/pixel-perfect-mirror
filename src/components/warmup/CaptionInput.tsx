import { Wand2 } from "lucide-react";

const CAPTION_MAX = 2200;
const EMOJI_SHORTCUTS = ["✨", "🔥", "💫", "🎯", "🚀", "❤️", "👀", "✦"];

type Props = {
  value: string;
  onChange: (v: string) => void;
};

export function CaptionInput({ value, onChange }: Props) {
  const addEmoji = (e: string) =>
    onChange((value + " " + e).trim().slice(0, CAPTION_MAX));

  return (
    <section className="space-y-2 rounded-[10px] border border-border bg-bg3/30 p-4">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-text2">
          <Wand2 className="h-3.5 w-3.5" /> Legenda base
        </h3>
        <span
          className={[
            "text-[10px] tabular-nums",
            value.length > CAPTION_MAX ? "text-red-400" : "text-muted2",
          ].join(" ")}
        >
          {value.length}/{CAPTION_MAX}
        </span>
      </div>

      <textarea
        rows={3}
        value={value}
        maxLength={CAPTION_MAX}
        onChange={(e) => onChange(e.target.value)}
        placeholder="novo drop ✦ #reels"
        className="w-full resize-y rounded-[8px] border border-border2 bg-bg3 p-2 text-sm outline-none focus:border-[var(--accent2)]"
      />

      <div className="flex flex-wrap gap-1">
        {EMOJI_SHORTCUTS.map((e) => (
          <button
            key={e}
            type="button"
            onClick={() => addEmoji(e)}
            className="rounded-md border border-border2 bg-bg3 px-2 py-0.5 text-sm transition hover:-translate-y-[1px] hover:border-[var(--accent2)]"
          >
            {e}
          </button>
        ))}
      </div>
    </section>
  );
}
