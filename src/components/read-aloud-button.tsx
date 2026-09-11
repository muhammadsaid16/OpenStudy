"use client";

import { Volume2, Square, Loader2 } from "lucide-react";
import { useReadAloud } from "@/hooks/use-read-aloud";

export function ReadAloudButton({
  text,
  lang,
  size = 16,
  className = "",
  label,
}: {
  text: string;
  lang?: string;
  size?: number;
  className?: string;
  label?: string;
}) {
  const { status, speak, stop } = useReadAloud();
  const playing = status === "playing";
  const loading = status === "loading";
  return (
    <button
      type="button"
      onClick={() => (playing || loading ? stop() : speak(text, lang))}
      aria-label={label ?? (playing ? "Stop" : "Read aloud")}
      title={playing ? "Stop" : "Read aloud"}
      className={`inline-flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card text-muted-foreground hover:bg-accent-soft hover:text-foreground transition-colors tap-target ${className}`}
      style={{ minWidth: 36, minHeight: 36 }}
    >
      {loading ? <Loader2 size={size} className="animate-spin" /> : playing ? <Square size={size - 2} /> : <Volume2 size={size} />}
    </button>
  );
}
