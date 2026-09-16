"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  Music2,
  Link2,
  Play,
  Pause,
  ExternalLink,
  X,
  ChevronDown,
  ChevronUp,
  Search,
  Loader2,
  Volume2,
  VolumeX,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toSpotifyEmbedUrl, toSpotifyWebUrl } from "@/lib/spotify-embed";
import { useSpotify } from "@/lib/spotify-store";

const FRAME_ID = "spotify-audio-frame";

function spotifyCommand(command: "play" | "pause" | "toggle" | "volume", volume?: number) {
  if (typeof document === "undefined") return;
  const frame = document.getElementById(FRAME_ID) as HTMLIFrameElement | null;
  if (!frame?.contentWindow) return;
  if (command === "volume" && typeof volume === "number") {
    frame.contentWindow.postMessage({ command: "volume", volume }, "*");
  } else {
    frame.contentWindow.postMessage({ command }, "*");
  }
}

// ─── Global audio source (mounted once in the root layout) ──────────
export function SpotifyAudioSource() {
  const url = useSpotify((s) => s.url);
  const volume = useSpotify((s) => s.volume);
  if (!url) return null;
  const sep = url.includes("?") ? "&" : "?";
  const src = `${url}${sep}autoplay=1`;
  return (
    <iframe
      id={FRAME_ID}
      title="Spotify audio"
      src={src}
      onLoad={() => {
        // Apply persisted volume once the frame is ready
        setTimeout(() => spotifyCommand("volume", volume), 600);
      }}
      style={{ position: "absolute", left: "-9999px", top: 0, width: "300px", height: "380px", border: 0, pointerEvents: "none" }}
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
  const volume = useSpotify((s) => s.volume);
  const setPlaying = useSpotify((s) => s.setPlaying);
  const setExpanded = useSpotify((s) => s.setExpanded);
  const setVolume = useSpotify((s) => s.setVolume);
  const clear = useSpotify((s) => s.clear);

  if (!url) return null;

  const toggle = () => {
    // Explicit play/pause avoids desync; toggle is fallback.
    spotifyCommand(isPlaying ? "pause" : "play");
    // Fallback to toggle if embed ignores play/pause (older embeds)
    setTimeout(() => spotifyCommand("toggle"), 80);
    setPlaying(!isPlaying);
  };

  const onVolume = (v: number) => {
    setVolume(v);
    spotifyCommand("volume", v);
  };

  return (
    <div className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-40 md:bottom-4 md:inset-x-auto md:right-4 md:w-80">
      <div className="glass-inset mx-3 rounded-2xl border border-glass-border p-3 md:mx-0">
        <div className="flex items-center gap-3">
          <Vinyl spinning={isPlaying} />
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-fg">{isPlaying ? "Now Spinning" : "Paused"}</p>
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
        {expanded && (
          <div className="mt-3 space-y-2">
            <div className="flex items-center gap-2">
              <button
                onClick={() => onVolume(volume === 0 ? 0.8 : 0)}
                aria-label={volume === 0 ? "Unmute" : "Mute"}
                className="text-muted-fg hover:text-fg"
              >
                {volume === 0 ? <VolumeX size={16} /> : <Volume2 size={16} />}
              </button>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={volume}
                onChange={(e) => onVolume(parseFloat(e.target.value))}
                className="h-1 flex-1 accent-[var(--color-accent)]"
                aria-label="Volume"
              />
              {webUrl && (
                <a
                  href={webUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-xs font-semibold text-accent hover:underline"
                >
                  <ExternalLink size={13} aria-hidden /> Open
                </a>
              )}
            </div>
            <p className="text-[11px] leading-relaxed text-muted-fg">
              Private playlists show &quot;Page not found&quot; — make the playlist Public and Share → Copy link again.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Picker (used inside /spotify tab) — Search + Paste Link ─────────
type SearchResult = {
  id: string;
  name: string;
  artist: string;
  type: "track" | "playlist";
  image: string | null;
  embedUrl: string;
  webUrl: string;
};

export function SpotifyEmbedPicker({ className }: { className?: string }) {
  const [tab, setTab] = useState<"search" | "paste">("search");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [input, setInput] = useState("");
  const [valid, setValid] = useState(true);
  const setTrack = useSpotify((s) => s.setTrack);
  const debounceRef = useRef<number | null>(null);

  // Debounced search
  useEffect(() => {
    const q = query.trim();
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    if (q.length < 2) {
      setResults([]);
      setSearched(false);
      setLoading(false);
      return;
    }
    setLoading(true);
    debounceRef.current = window.setTimeout(async () => {
      try {
        const r = await fetch(`/api/spotify/search?q=${encodeURIComponent(q)}`);
        const j = (await r.json()) as { results: SearchResult[] };
        setResults(j.results ?? []);
        setSearched(true);
      } catch {
        setResults([]);
        setSearched(true);
      } finally {
        setLoading(false);
      }
    }, 400);
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [query]);

  const onUse = useCallback(() => {
    const embed = toSpotifyEmbedUrl(input);
    if (!embed) {
      setValid(false);
      return;
    }
    const web = toSpotifyWebUrl(embed);
    const pretty = input.includes("playlist") ? "Playlist" : input.includes("track") ? "Track" : "Spotify";
    setTrack(embed, web, pretty);
    setValid(true);
  }, [input, setTrack]);

  const playResult = (r: SearchResult) => {
    setTrack(r.embedUrl, r.webUrl, `${r.name} — ${r.artist}`);
  };

  return (
    <div className={cn("rounded-2xl border border-glass-border bg-surface p-4", className)}>
      {/* Tabs */}
      <div className="mb-4 flex gap-1.5 rounded-full bg-muted p-1">
        <button
          onClick={() => setTab("search")}
          className={cn(
            "flex flex-1 items-center justify-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold transition",
            tab === "search" ? "bg-accent text-accent-fg shadow" : "text-muted-fg hover:text-fg"
          )}
        >
          <Search size={14} /> Search
        </button>
        <button
          onClick={() => setTab("paste")}
          className={cn(
            "flex flex-1 items-center justify-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold transition",
            tab === "paste" ? "bg-accent text-accent-fg shadow" : "text-muted-fg hover:text-fg"
          )}
        >
          <Link2 size={14} /> Paste Link
        </button>
      </div>

      {tab === "search" ? (
        <div className="space-y-3">
          <div className="relative">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-fg" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search songs, artists, playlists…"
              className="h-10 w-full rounded-xl border border-border bg-bg pl-9 pr-9 text-sm text-fg placeholder:text-muted-fg focus:border-accent focus:outline-none"
              aria-label="Search Spotify"
            />
            {loading && <Loader2 size={16} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-muted-fg" />}
          </div>

          {!searched && !loading && query.trim().length < 2 && (
            <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border bg-bg/50 px-4 py-8 text-center">
              <Music2 size={20} className="text-muted-fg" />
              <p className="text-sm font-semibold text-fg">Search Spotify without leaving OpenStudy</p>
              <p className="max-w-xs text-xs text-muted-fg">Type a song, artist, or playlist — tap any result to play it in the background while you study. No Premium or login needed.</p>
            </div>
          )}

          {searched && results.length === 0 && !loading && (
            <p className="rounded-xl border border-border bg-bg px-4 py-6 text-center text-sm text-muted-fg">No results — try another search.</p>
          )}

          {results.length > 0 && (
            <ul className="max-h-[50vh] space-y-1.5 overflow-y-auto pr-1">
              {results.map((r) => (
                <li
                  key={`${r.type}:${r.id}`}
                  className="flex items-center gap-3 rounded-xl border border-transparent bg-bg px-2 py-2 transition hover:border-border hover:bg-surface"
                >
                  {r.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={r.image} alt="" className="h-10 w-10 shrink-0 rounded-lg object-cover" />
                  ) : (
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-fg">
                      <Music2 size={16} />
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-fg">{r.name}</p>
                    <p className="truncate text-xs text-muted-fg">
                      <span className="mr-1 inline-flex rounded bg-muted px-1 py-0.5 text-[10px] font-bold uppercase tracking-wide text-muted-fg">{r.type}</span>
                      {r.artist}
                    </p>
                  </div>
                  <button
                    onClick={() => playResult(r)}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent text-accent-fg hover:scale-105 active:scale-95"
                    aria-label={`Play ${r.name}`}
                  >
                    <Play size={14} className="ml-0.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Link2 size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-fg" />
              <input
                value={input}
                onChange={(e) => {
                  setInput(e.target.value);
                  setValid(true);
                }}
                onKeyDown={(e) => e.key === "Enter" && onUse()}
                placeholder="Paste a Spotify playlist or track link…"
                className={cn(
                  "h-10 w-full rounded-xl border bg-bg pl-9 pr-3 text-sm text-fg placeholder:text-muted-fg focus:outline-none",
                  valid ? "border-border focus:border-accent" : "border-danger focus:border-danger"
                )}
                aria-label="Paste Spotify link"
              />
            </div>
            <button
              onClick={onUse}
              className="shrink-0 rounded-xl bg-accent px-4 text-sm font-bold text-accent-fg hover:opacity-90 active:scale-[0.98]"
            >
              Load
            </button>
          </div>
          {!valid && <p className="text-xs text-danger">That doesn&apos;t look like a Spotify link. Paste a playlist or track URL/URI.</p>}
          <p className="text-xs leading-relaxed text-muted-fg">
            Only <b className="text-fg">public</b> playlists &amp; tracks can be embedded. If it shows &quot;Page not found&quot;, make the playlist Public and Share → Copy link again.
          </p>
        </div>
      )}
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
          background: "repeating-radial-gradient(circle at center, #0b0f17 0 3px, #10151f 3px 6px)",
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
