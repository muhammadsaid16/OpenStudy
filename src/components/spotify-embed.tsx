"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Music2, Link2, Play, Pause, ExternalLink, X, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { toSpotifyEmbedUrl, toSpotifyWebUrl } from "@/lib/spotify-embed";
import { useSpotify } from "@/lib/spotify-store";

const FRAME_ID = "spotify-audio-frame";

// Send a command to the persistent Spotify iframe (cross-origin postMessage).
// Spotify's embed listens for { command: "toggle" | "play" | "pause" }.
function spotifyCommand(command: "play" | "pause" | "toggle") {
  if (typeof document === "undefined") return;
  const frame = document.getElementById(FRAME_ID) as HTMLIFrameElement | null;
  frame?.contentWindow?.postMessage({ command }, "*");
}

// ─── Global audio source (mounted once in the root layout) ──────────
// Lives outside the router so it keeps playing across tab switches. A
// 0×0 hidden iframe is the actual player; the mini-player drives it.
export function SpotifyAudioSource() {
  const url = useSpotify((s) => s.url);
  if (!url) return null;
  const src = url.includes("?") ? `${url}&autoplay=1` : `${url}?autoplay=1`;
  return (
    <iframe
      id={FRAME_ID}
      title="Spotify audio"
      src={src}
      style={{ position: "absolute", width: 0, height: 0, border: 0, pointerEvents: "none" }}
      allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
    />
  );
}

// ─── Persistent mini-player / vinyl bar (also in the layout) ─────────
export function SpotifyMiniPlayer() {
  const url = useSpotify((s) => s.url);
  const webUrl = useSpotify((s) => s.webUrl);
  const title = useSpotify((s) => s.title);
  const isPlaying = useSpotify((s) => s.isPlaying);
  const expanded = useSpotify((s) => s.expanded);
  const setPlaying = useSpotify((s) => s.setPlaying);
  const setExpanded = useSpotify((s) => s.setExpanded);
  const clear = useSpotify((s) => s.clear);

  // Keep our visual state in sync with the real iframe playback.
  useEffect(() => {
    function onMsg(e: MessageEvent) {
      try {
        const d = e.data as { type?: string; isPlaying?: boolean };
        if (d?.type === "player_update" && typeof d.isPlaying === "boolean") {
          setPlaying(d.isPlaying);
        }
      } catch {
        /* ignore */
      }
    }
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [setPlaying]);

  if (!url) return null;

  const toggle = () => {
    spotifyCommand("toggle");
    setPlaying(!isPlaying); // optimistic; corrected by the message listener
  };

  return (
    <div className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-40 md:bottom-4 md:inset-x-auto md:right-4 md:w-80">
      <div className="glass-inset mx-3 rounded-2xl border border-glass-border p-3 md:mx-0">
        <div className="flex items-center gap-3">
          <Vinyl spinning={isPlaying} />
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-fg">
              {isPlaying ? "Now Spinning" : "Paused"}
            </p>
            <p className="truncate text-sm font-semibold text-fg">{title ?? "Spotify"}</p>
          </div>
          <button
            onClick={toggle}
            aria-label={isPlaying ? "Pause" : "Play"}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent text-accent-fg transition-transform hover:scale-105 active:scale-95"
          >
            {isPlaying ? <Pause size={16} /> : <Play size={16} className="ml-0.5" />}
          </button>
          <button
            onClick={() => setExpanded(!expanded)}
            aria-label={expanded ? "Collapse" : "Expand"}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted-fg hover:text-fg"
          >
            {expanded ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
          </button>
          <button
            onClick={clear}
            aria-label="Close player"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted-fg hover:text-danger"
          >
            <X size={16} />
          </button>
        </div>
        {expanded && webUrl && (
          <a
            href={webUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-accent hover:underline"
          >
            <ExternalLink size={13} aria-hidden /> Open in Spotify
          </a>
        )}
      </div>
    </div>
  );
}

// ─── The picker (used inside the /spotify tab) ──────────────────────
export function SpotifyEmbedPicker({ className }: { className?: string }) {
  const [input, setInput] = useState("");
  const [valid, setValid] = useState(true);
  const [hint, setHint] = useState(false);
  const setTrack = useSpotify((s) => s.setTrack);

  const onUse = useCallback(() => {
    const embed = toSpotifyEmbedUrl(input);
    if (!embed) {
      setValid(false);
      return;
    }
    const web = toSpotifyWebUrl(embed);
    const pretty = input.includes("playlist")
      ? "Playlist"
      : input.includes("track")
        ? "Track"
        : "Spotify";
    setTrack(embed, web, pretty);
    setValid(true);
    setHint(false);
  }, [input, setTrack]);

  return (
    <div className={cn("glass-inset rounded-3xl p-5", className)}>
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-accent-soft text-accent">
          <Music2 size={18} aria-hidden />
        </span>
        <div>
          <h2 className="text-sm font-bold text-fg">Background music</h2>
          <p className="text-xs text-muted-fg">
            Paste a public Spotify link — it keeps playing as you browse.
          </p>
        </div>
      </div>

      <div className="mt-4">
        <div className="relative">
          <Link2
            size={16}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-fg"
            aria-hidden
          />
          <input
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              if (!valid) setValid(true);
            }}
            onFocus={() => setHint(true)}
            onKeyDown={(e) => e.key === "Enter" && onUse()}
            placeholder="Paste a Spotify playlist or track link…"
            className="w-full rounded-2xl border border-glass-border bg-glass py-2.5 pl-10 pr-3 text-sm text-fg placeholder:text-muted-fg outline-none focus:border-accent/60"
          />
          <button
            onClick={onUse}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-xl bg-accent px-3 py-1 text-xs font-bold text-accent-fg transition-transform hover:scale-105 active:scale-95"
          >
            Play
          </button>
        </div>
        {!valid && (
          <p className="mt-1.5 text-xs text-danger">
            That doesn&apos;t look like a Spotify link. Paste a playlist or track URL/URI.
          </p>
        )}
        {hint && (
          <p className="mt-1.5 text-xs text-muted-fg">
            Only public playlists &amp; tracks can be embedded. If it shows “Page not found”, the
            link is private or invalid.
          </p>
        )}
      </div>
    </div>
  );
}

function Vinyl({ spinning }: { spinning: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useVinylSpin(ref, spinning);
  return (
    <div className="relative h-12 w-12 shrink-0">
      <div
        ref={ref}
        className="h-12 w-12 rounded-full"
        style={{
          background:
            "repeating-radial-gradient(circle at center, #0b0f17 0 3px, #10151f 3px 6px)",
          boxShadow: "inset 0 0 0 2px rgba(255,255,255,0.06), 0 4px 14px rgba(0,0,0,0.5)",
        }}
      >
        <div className="absolute inset-0 m-auto h-7 w-7 rounded-full border border-white/10 bg-[#0b0f17]" />
        <div className="absolute inset-0 m-auto h-2.5 w-2.5 rounded-full bg-white/70" />
      </div>
      {spinning && (
        <motion.span
          className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-accent"
          animate={{ opacity: [1, 0.3, 1] }}
          transition={{ duration: 1, repeat: Infinity }}
        />
      )}
    </div>
  );
}

// Shared spin logic so the vinyl keeps rotating smoothly across re-renders.
function useVinylSpin(ref: React.RefObject<HTMLDivElement | null>, spinning: boolean) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let raf = 0;
    let last = performance.now();
    let angle = parseFloat(el.dataset.angle || "0");
    if (spinning) {
      const tick = (now: number) => {
        angle += ((now - last) / 1000) * 220;
        last = now;
        el.style.transform = `rotate(${angle}deg)`;
        el.dataset.angle = String(angle % 360);
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    }
    return () => cancelAnimationFrame(raf);
  }, [ref, spinning]);
}
