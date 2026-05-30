import { useState } from "react";
import { Film } from "lucide-react";
import type { DriveVideo } from "@/lib/drive.functions";

export function VideoThumb({ v }: { v: DriveVideo }) {
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
