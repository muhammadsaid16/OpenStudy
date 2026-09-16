"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Music2, Link2, Check, Play, Pause, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  STUDY_PRESETS,
  toSpotifyEmbedUrl,
  toSpotifyWebUrl,
  type StudyPreset,
} from "@/lib/spotify-embed";

interface SpotifyEmbedPlayerProps {
  className?: string;
}

const DEFAULT_URI = STUDY_PRESETS[0].uri;

export function SpotifyEmbedPlayer({ className }: SpotifyEmbedPlayerProps) {
  const [selected, setSelected] = useState<StudyPreset | null>(STUDY_PRESETS[0]);
  const [custom, setCustom] = useState("");
  const [input, setInput] = useState("");
  const [playing, setPlaying] = useState(false);
  const [valid, setValid] = useState(true);

  const embedUrl = toSpotifyEmbedUrl(selected?.uri ?? custom) ?? "";
  const activeUri = custom || selected?.uri || DEFAULT_URI;

  const onSelectPreset = useCallback((p: StudyPreset) => {
    setSelected(p);
    setCustom("");
    setValid(true);
  }, []);

  const onUseCustom = useCallback(() => {
    const url = toSpotifyEmbedUrl(input);
    if (!url) {
      setValid(false);
      return;
    }
    setCustom(input.trim());
    setSelected(null);
    setValid(true);
  }, [input]);

  const webUrl = embedUrl ? toSpotifyWebUrl(embedUrl) : "";

  return (
    <div className={cn("glass-inset rounded-3xl p-5", className)}>
      {/* Vinyl + now playing */}
      <div className="flex items-center gap-4">
        <Vinyl spinning={playing} />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold uppercase tracking-widest text-muted-fg">
            {playing ? "Now Spinning" : "Focus Mix"}
          </p>
          <p className="truncate text-sm font-semibold text-fg">
            {selected?.label ?? (custom ? "Custom playlist" : "Pick a preset")}
          </p>
        </div>
        <button
          onClick={() => setPlaying((p) => !p)}
          aria-label={playing ? "Pause visual" : "Play visual"}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent text-accent-fg transition-transform hover:scale-105 active:scale-95"
        >
          {playing ? <Pause size={18} /> : <Play size={18} className="ml-0.5" />}
        </button>
      </div>

      {/* Preset switcher */}
      <div className="mt-5 flex flex-wrap gap-2">
        {STUDY_PRESETS.map((p) => {
          const active = selected?.id === p.id;
          return (
            <button
              key={p.id}
              onClick={() => onSelectPreset(p)}
              className={cn(
                "rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors",
                active
                  ? "border-accent bg-accent-soft text-accent"
                  : "border-glass-border text-muted-fg hover:text-fg",
              )}
            >
              {p.label}
            </button>
          );
        })}
      </div>

      {/* Custom URL input */}
      <div className="mt-4">
        <div className="relative">
          <Link2 size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-fg" aria-hidden />
          <input
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              if (!valid) setValid(true);
            }}
            onKeyDown={(e) => e.key === "Enter" && onUseCustom()}
            placeholder="Paste a Spotify playlist or track link…"
            className="w-full rounded-2xl border border-glass-border bg-glass py-2.5 pl-10 pr-3 text-sm text-fg placeholder:text-muted-fg outline-none focus:border-accent/60"
          />
          <button
            onClick={onUseCustom}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-xl bg-accent px-3 py-1 text-xs font-bold text-accent-fg transition-transform hover:scale-105 active:scale-95"
          >
            Load
          </button>
        </div>
        {!valid && (
          <p className="mt-1.5 text-xs text-danger">
            That doesn&apos;t look like a Spotify link. Paste a playlist or track URL/URI.
          </p>
        )}
      </div>

      {/* Embed iframe */}
      {embedUrl ? (
        <div className="mt-5 overflow-hidden rounded-2xl border border-glass-border">
          <iframe
            title="Spotify player"
            src={embedUrl}
            width="100%"
            height="352"
            style={{ border: 0 }}
            loading="lazy"
            allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
          />
        </div>
      ) : (
        <div className="mt-5 flex items-center justify-center gap-2 rounded-2xl border border-glass-border bg-glass py-10 text-sm text-muted-fg">
          <Music2 size={16} aria-hidden /> Paste a Spotify link to start.
        </div>
      )}

      {webUrl && (
        <a
          href={webUrl}
          target="_blank"
          rel="noreferrer"
          className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-accent hover:underline"
        >
          <ExternalLink size={13} aria-hidden /> Open in Spotify
        </a>
      )}
    </div>
  );
}

function Vinyl({ spinning }: { spinning: boolean }) {
  const ref = useRef<HTMLDivElement>(null);

  // Persist rotation angle across play/pause so the disc never snaps back.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let raf = 0;
    let last = performance.now();
    let angle = parseFloat(el.dataset.angle || "0");
    if (spinning) {
      const tick = (now: number) => {
        angle += ((now - last) / 1000) * 220; // deg/sec
        last = now;
        el.style.transform = `rotate(${angle}deg)`;
        el.dataset.angle = String(angle % 360);
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    }
    return () => cancelAnimationFrame(raf);
  }, [spinning]);

  return (
    <div className="relative h-16 w-16 shrink-0">
      <div
        ref={ref}
        className="h-16 w-16 rounded-full"
        style={{
          background:
            "repeating-radial-gradient(circle at center, #0b0f17 0 3px, #10151f 3px 6px)",
          boxShadow: "inset 0 0 0 2px rgba(255,255,255,0.06), 0 4px 14px rgba(0,0,0,0.5)",
        }}
      >
        <div className="absolute inset-0 m-auto h-9 w-9 rounded-full border border-white/10 bg-[#0b0f17]" />
        <div className="absolute inset-0 m-auto h-3 w-3 rounded-full bg-white/70" />
      </div>
      {spinning && (
        <motion.span
          className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-accent"
          animate={{ opacity: [1, 0.3, 1] }}
          transition={{ duration: 1, repeat: Infinity }}
        />
      )}
    </div>
  );
}
