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
  ListMusic,
  ArrowLeft,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toSpotifyEmbedUrl, toSpotifyWebUrl } from "@/lib/spotify-embed";
import { useSpotify } from "@/lib/spotify-store";

const FRAME_ID = "spotify-audio-frame";
const VISIBLE_FRAME_ID = "spotify-visible-frame";

function spotifyCommand(command: "play" | "pause" | "toggle" | "volume", volume?: number) {
  if (typeof document === "undefined") return;
  // Try both frames (hidden + visible) — only one is mounted at a time
  for (const id of [FRAME_ID, VISIBLE_FRAME_ID]) {
    const frame = document.getElementById(id) as HTMLIFrameElement | null;
    if (!frame?.contentWindow) continue;
    if (command === "volume" && typeof volume === "number") {
      frame.contentWindow.postMessage({ command: "volume", volume }, "*");
    } else {
      frame.contentWindow.postMessage({ command }, "*");
    }
  }
}

// ─── Hidden background source (only when mini-player is collapsed) ──
export function SpotifyAudioSource() {
  const url = useSpotify((s) => s.url);
  const previewUrl = useSpotify((s) => s.previewUrl);
  const expanded = useSpotify((s) => s.expanded);
  const volume = useSpotify((s) => s.volume);
  const isPlaying = useSpotify((s) => s.isPlaying);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const a = audioRef.current;
    if (!a || !previewUrl) return;
    if (isPlaying) a.play().catch(() => {});
    else a.pause();
  }, [isPlaying, previewUrl]);

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume;
  }, [volume]);

  if (expanded) return null;
  if (previewUrl) {
    return <audio ref={audioRef} src={previewUrl} autoPlay={isPlaying} onEnded={() => useSpotify.getState().setPlaying(false)} crossOrigin="anonymous" style={{ position: "absolute", left: "-9999px" }} />;
  }
  if (!url) return null; // visible frame owns playback when expanded
  const sep = url.includes("?") ? "&" : "?";
  const src = `${url}${sep}autoplay=1`;
  return (
    <iframe
      id={FRAME_ID}
      title="Spotify audio"
      src={src}
      onLoad={() => setTimeout(() => spotifyCommand("volume", volume), 600)}
      style={{ position: "absolute", left: "-9999px", top: 0, width: "300px", height: "80px", border: 0, pointerEvents: "none" }}
      allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
    />
  );
}

// ─── Persistent mini-player (in the layout) ─────────────────────────
export function SpotifyMiniPlayer() {
  const url = useSpotify((s) => s.url);
  const previewUrl = useSpotify((s) => s.previewUrl);
  const webUrl = useSpotify((s) => s.webUrl);
  const title = useSpotify((s) => s.title);
  const isPlaying = useSpotify((s) => s.isPlaying);
  const expanded = useSpotify((s) => s.expanded);
  const volume = useSpotify((s) => s.volume);
  const setPlaying = useSpotify((s) => s.setPlaying);
  const setExpanded = useSpotify((s) => s.setExpanded);
  const setVolume = useSpotify((s) => s.setVolume);
  const clear = useSpotify((s) => s.clear);
  const previewRef = useRef<HTMLAudioElement | null>(null);

  if (!url && !previewUrl) return null;

  const isPlaylist = !!url && url.includes("/playlist/");
  const isPreview = !!previewUrl && !url;

  useEffect(() => {
    const a = previewRef.current;
    if (!a || !previewUrl) return;
    if (isPlaying) a.play().catch(() => {});
    else a.pause();
  }, [isPlaying, previewUrl]);

  useEffect(() => {
    if (previewRef.current) previewRef.current.volume = volume;
  }, [volume, previewUrl]);

  const toggle = () => {
    if (isPreview) {
      setPlaying(!isPlaying);
      return;
    }
    spotifyCommand(isPlaying ? "pause" : "play");
    setTimeout(() => spotifyCommand("toggle"), 80);
    setPlaying(!isPlaying);
  };
  const onVolume = (v: number) => {
    setVolume(v);
    if (!isPreview) spotifyCommand("volume", v);
    if (previewRef.current) previewRef.current.volume = v;
  };
  const visibleSrc = url ? `${url}${url.includes("?") ? "&" : "?"}autoplay=1` : "";

  return (
    <div className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-40 md:bottom-4 md:inset-x-auto md:right-4 md:w-[360px]">
      <div className="glass-inset mx-3 overflow-hidden rounded-2xl border border-glass-border md:mx-0">
        {/* Compact bar — always visible */}
        <div className="flex items-center gap-3 p-3">
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

        {/* Expanded: visible Spotify embed or preview audio */}
        {expanded && (
          <div className="space-y-2 border-t border-glass-border p-3">
            {isPreview && previewUrl ? (
              <div className="rounded-xl bg-bg p-3">
                <div className="mb-2 flex items-center gap-2">
                  <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-500">30s Preview</span>
                  <span className="text-xs text-muted-fg">iTunes preview — open in Spotify for full song</span>
                </div>
                <audio ref={previewRef} src={previewUrl} controls autoPlay={isPlaying} onEnded={() => setPlaying(false)} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} className="w-full" />
              </div>
            ) : (
              <iframe
                id={VISIBLE_FRAME_ID}
                title="Spotify player"
                src={visibleSrc}
                onLoad={() => setTimeout(() => spotifyCommand("volume", volume), 600)}
                className="w-full rounded-xl border-0"
                style={{ height: isPlaylist ? 352 : 80 }}
                allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
                loading="lazy"
              />
            )}
            <div className="flex items-center gap-2">
              <button onClick={() => onVolume(volume === 0 ? 0.8 : 0)} aria-label={volume === 0 ? "Unmute" : "Mute"} className="text-muted-fg hover:text-fg">
                {volume === 0 ? <VolumeX size={16} /> : <Volume2 size={16} />}
              </button>
              <input type="range" min={0} max={1} step={0.05} value={volume} onChange={(e) => onVolume(parseFloat(e.target.value))} className="h-1 flex-1 accent-[var(--color-accent)]" aria-label="Volume" />
              {webUrl && (
                <a href={webUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold text-accent hover:underline">
                  <ExternalLink size={13} aria-hidden /> Open
                </a>
              )}
            </div>
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
  type: "track" | "playlist" | "album" | "episode" | "show" | "artist";
  image: string | null;
  embedUrl: string;
  webUrl: string;
  previewUrl?: string | null;
};

type PlaylistTrack = {
  id: string;
  name: string;
  artist: string;
  image: string | null;
  embedUrl: string;
  webUrl: string;
};

function typeMeta(type: SearchResult["type"]) {
  switch (type) {
    case "playlist":
      return { label: "PLAYLIST", icon: ListMusic, color: "bg-emerald-500/15 text-emerald-500 border-emerald-500/20" };
    case "album":
      return { label: "ALBUM", icon: Music2, color: "bg-orange-500/15 text-orange-500 border-orange-500/20" };
    case "episode":
      return { label: "EPISODE", icon: Music2, color: "bg-purple-500/15 text-purple-500 border-purple-500/20" };
    case "show":
      return { label: "SHOW", icon: Music2, color: "bg-pink-500/15 text-pink-500 border-pink-500/20" };
    case "artist":
      return { label: "ARTIST", icon: Music2, color: "bg-zinc-500/15 text-zinc-400 border-zinc-500/20" };
    default:
      return { label: "TRACK", icon: Music2, color: "bg-sky-500/15 text-sky-500 border-sky-500/20" };
  }
}

export function SpotifyEmbedPicker({ className }: { className?: string }) {
  const [tab, setTab] = useState<"search" | "paste">("search");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [input, setInput] = useState("");
  const [valid, setValid] = useState(true);
  // Playlist drill-down
  const [activePlaylist, setActivePlaylist] = useState<SearchResult | null>(null);
  const [tracks, setTracks] = useState<PlaylistTrack[]>([]);
  const [tracksLoading, setTracksLoading] = useState(false);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const setTrack = useSpotify((s) => s.setTrack);
  const debounceRef = useRef<number | null>(null);

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

  const [pasteTracks, setPasteTracks] = useState<PlaylistTrack[]>([]);
  const [pasteLoading, setPasteLoading] = useState(false);
  const [pasteInspected, setPasteInspected] = useState(false);
  const inspectPasted = useCallback(async () => {
    const embed = toSpotifyEmbedUrl(input);
    if (!embed || !input.includes("playlist")) {
      setValid(false);
      return;
    }
    const m = input.match(/playlist\/([A-Za-z0-9]{22})/);
    const pid = m?.[1];
    if (!pid) {
      setValid(false);
      return;
    }
    setPasteLoading(true);
    setPasteInspected(true);
    try {
      const r = await fetch(`/api/spotify/playlist?id=${encodeURIComponent(pid)}`);
      const j = (await r.json()) as { tracks: PlaylistTrack[] };
      setPasteTracks(j.tracks ?? []);
    } catch {
      setPasteTracks([]);
    } finally {
      setPasteLoading(false);
    }
  }, [input]);

  const [previewId, setPreviewId] = useState<string | null>(null);
  const setPreview = useSpotify((s) => s.setPreview);
  const storePreviewUrl = useSpotify((s) => s.previewUrl);
  const isPreviewPlayingGlobal = useSpotify((s) => s.isPlaying && !!s.previewUrl);
  useEffect(() => { if (!storePreviewUrl) setPreviewId(null); }, [storePreviewUrl]);

  const playResult = (r: SearchResult) => {
    // Spotify native embed -> mini-player + background iframe
    if (r.embedUrl) {
      setTrack(r.embedUrl, r.webUrl, `${r.name} — ${r.artist}`);
      setPreviewId(null);
      return;
    }
    // iTunes 30s preview fallback — global preview audio (no blank iframe)
    if (r.previewUrl) {
      if (previewId === r.id) {
        // Toggle pause for same track
        useSpotify.getState().setPlaying(!useSpotify.getState().isPlaying);
        return;
      }
      setPreview(r.previewUrl, `${r.name} — ${r.artist} (Preview)`, r.webUrl);
      setPreviewId(r.id);
      return;
    }
    window.open(r.webUrl, "_blank");
  };

  const openPlaylist = async (r: SearchResult) => {
    setActivePlaylist(r);
    setTracks([]);
    setTracksLoading(true);
    try {
      const res = await fetch(`/api/spotify/playlist?id=${encodeURIComponent(r.id)}`);
      const j = (await res.json()) as { tracks: PlaylistTrack[] };
      setTracks(j.tracks ?? []);
    } catch {
      setTracks([]);
    } finally {
      setTracksLoading(false);
    }
  };

  return (
    <div className={cn("rounded-2xl border border-glass-border bg-surface p-4", className)}>
      <div className="mb-4 flex gap-1.5 rounded-full bg-muted p-1">
        <button
          onClick={() => {
            setTab("search");
            setActivePlaylist(null);
          }}
          className={cn("flex flex-1 items-center justify-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold transition", tab === "search" ? "bg-accent text-accent-fg shadow" : "text-muted-fg hover:text-fg")}
        >
          <Search size={14} /> Search
        </button>
        <button onClick={() => setTab("paste")} className={cn("flex flex-1 items-center justify-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold transition", tab === "paste" ? "bg-accent text-accent-fg shadow" : "text-muted-fg hover:text-fg")}>
          <Link2 size={14} /> Paste Link
        </button>
      </div>

      {tab === "search" ? (
        activePlaylist ? (
          <div className="space-y-3">
            <button onClick={() => setActivePlaylist(null)} className="inline-flex items-center gap-1.5 text-xs font-semibold text-accent hover:underline">
              <ArrowLeft size={14} /> Back to results
            </button>
            <div className="flex items-center gap-3 rounded-xl border border-border bg-bg p-3">
              {activePlaylist.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={activePlaylist.image} alt="" onClick={() => setLightbox(activePlaylist.image!)} className="h-12 w-12 cursor-pointer rounded-lg object-cover hover:opacity-80" title="View full image" />
              ) : (
                <span className="flex h-12 w-12 items-center justify-center rounded-lg bg-muted text-muted-fg">
                  <ListMusic size={18} />
                </span>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-fg">{activePlaylist.name}</p>
                <p className="truncate text-xs text-muted-fg">{activePlaylist.artist}</p>
              </div>
              <button onClick={() => playResult(activePlaylist)} className="shrink-0 rounded-full bg-accent px-3 py-1.5 text-xs font-bold text-accent-fg hover:opacity-90">
                Play all
              </button>
            </div>
            {tracksLoading ? (
              <p className="flex items-center justify-center gap-2 py-6 text-sm text-muted-fg">
                <Loader2 size={16} className="animate-spin" /> Loading tracks…
              </p>
            ) : tracks.length === 0 ? (
              <p className="rounded-xl border border-border bg-bg px-4 py-6 text-center text-sm text-muted-fg">No tracks found or playlist is private.</p>
            ) : (
              <ul className="max-h-[50vh] space-y-1 overflow-y-auto pr-1">
                {tracks.map((t) => (
                  <li key={t.id} className="flex items-center gap-3 rounded-xl border border-transparent bg-bg px-2 py-2 hover:border-border hover:bg-surface">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {t.image ? <img src={t.image} alt="" onClick={() => setLightbox(t.image!)} className="h-9 w-9 cursor-pointer rounded-lg object-cover hover:opacity-80" title="View full image" /> : <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted text-muted-fg"><Music2 size={14} /></span>}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-fg">{t.name}</p>
                      <p className="truncate text-xs text-muted-fg">{t.artist}</p>
                    </div>
                    <button onClick={() => setTrack(t.embedUrl, t.webUrl, `${t.name} — ${t.artist}`)} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent text-accent-fg hover:scale-105 active:scale-95" aria-label={`Play ${t.name}`}>
                      <Play size={14} className="ml-0.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="relative">
              <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-fg" />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search songs, artists, playlists…" className="h-10 w-full rounded-xl border border-border bg-bg pl-9 pr-9 text-sm text-fg placeholder:text-muted-fg focus:border-accent focus:outline-none" aria-label="Search Spotify" />
              {loading && <Loader2 size={16} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-muted-fg" />}
            </div>

            {!searched && !loading && query.trim().length < 2 && (
              <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border bg-bg/50 px-4 py-8 text-center">
                <Music2 size={20} className="text-muted-fg" />
                <p className="text-sm font-semibold text-fg">Search Spotify without leaving OpenStudy</p>
                <p className="max-w-xs text-xs text-muted-fg">Type a song, artist, or playlist — tap a track to play it, or open a playlist to pick a specific song. No Premium or login needed.</p>
              </div>
            )}
            {searched && results.length === 0 && !loading && <p className="rounded-xl border border-border bg-bg px-4 py-6 text-center text-sm text-muted-fg">No results — try another search.</p>}
            {results.length > 0 && (
              <ul className="max-h-[50vh] space-y-1.5 overflow-y-auto pr-1">
                {results.map((r) => {
                  const meta = typeMeta(r.type);
                  const MetaIcon = meta.icon;
                  const isPlayable = !!(r.embedUrl || r.previewUrl);
                  const isPreviewPlaying = previewId === r.id && isPreviewPlayingGlobal;
                  const canInspect = r.type === "playlist" || r.type === "album" || r.type === "show";
                  return (
                  <li key={`${r.type}:${r.id}`} className="flex items-center gap-3 rounded-xl border border-transparent bg-bg px-2 py-2 transition hover:border-border hover:bg-surface">
                    {r.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={r.image} alt="" onClick={() => setLightbox(r.image!)} className="h-10 w-10 shrink-0 cursor-pointer rounded-lg object-cover hover:opacity-80" title="View full image" />
                    ) : (
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-fg">
                        <MetaIcon size={16} />
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-fg">{r.name}</p>
                      <p className="truncate text-xs text-muted-fg flex items-center gap-1">
                        <span className={cn("inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide", meta.color)}><MetaIcon size={10} />{meta.label}</span>
                        <span className="truncate">{r.artist}</span>
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      {canInspect && (
                        <button onClick={() => openPlaylist(r)} className="rounded-full border border-border bg-surface px-2.5 py-1.5 text-xs font-bold text-fg hover:bg-muted" aria-label={`View tracks in ${r.name}`}>
                          <ListMusic size={14} />
                        </button>
                      )}
                      <button
                        onClick={() => playResult(r)}
                        disabled={!isPlayable}
                        className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent text-accent-fg hover:scale-105 active:scale-95 disabled:opacity-40")}
                        aria-label={isPreviewPlaying ? `Pause ${r.name}` : `Play ${r.name}`}
                        title={!r.embedUrl && r.previewUrl ? "30s preview" : undefined}
                      >
                        {isPreviewPlaying ? <Pause size={14} /> : isPlayable ? <Play size={14} className="ml-0.5" /> : <ExternalLink size={14} />}
                      </button>
                    </div>
                  </li>
                  );
                })}
              </ul>
            )}
          </div>
        )
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
                  setPasteInspected(false);
                  setPasteTracks([]);
                }}
                onKeyDown={(e) => e.key === "Enter" && onUse()}
                placeholder="Paste a Spotify playlist or track link…"
                className={cn("h-10 w-full rounded-xl border bg-bg pl-9 pr-3 text-sm text-fg placeholder:text-muted-fg focus:outline-none", valid ? "border-border focus:border-accent" : "border-danger focus:border-danger")}
                aria-label="Paste Spotify link"
              />
            </div>
            <button onClick={onUse} className="shrink-0 rounded-xl bg-accent px-4 text-sm font-bold text-accent-fg hover:opacity-90 active:scale-[0.98]">
              Load
            </button>
            {input.includes("playlist") && (
              <button onClick={inspectPasted} className="shrink-0 rounded-xl border border-border bg-surface px-3 text-xs font-bold text-fg hover:bg-muted">
                <ListMusic size={14} className="inline -mt-0.5 mr-1" /> Inspect
              </button>
            )}
          </div>
          {!valid && <p className="text-xs text-danger">That doesn&apos;t look like a Spotify link. Paste a playlist or track URL/URI.</p>}
          {pasteLoading && (
            <p className="flex items-center justify-center gap-2 py-4 text-sm text-muted-fg">
              <Loader2 size={16} className="animate-spin" /> Loading tracks…
            </p>
          )}
          {pasteInspected && !pasteLoading && pasteTracks.length === 0 && <p className="rounded-xl border border-border bg-bg px-4 py-4 text-center text-sm text-muted-fg">No tracks found or playlist is private.</p>}
          {pasteTracks.length > 0 && (
            <ul className="max-h-[45vh] space-y-1 overflow-y-auto pr-1">
              {pasteTracks.map((t) => (
                <li key={t.id} className="flex items-center gap-3 rounded-xl border border-transparent bg-bg px-2 py-2 hover:border-border hover:bg-surface">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {t.image ? <img src={t.image} alt="" onClick={() => setLightbox(t.image!)} className="h-9 w-9 cursor-pointer rounded-lg object-cover hover:opacity-80" title="View full image" /> : <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted text-muted-fg"><Music2 size={14} /></span>}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-fg">{t.name}</p>
                    <p className="truncate text-xs text-muted-fg">{t.artist}</p>
                  </div>
                  <button onClick={() => setTrack(t.embedUrl, t.webUrl, `${t.name} — ${t.artist}`)} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent text-accent-fg hover:scale-105 active:scale-95" aria-label={`Play ${t.name}`}>
                    <Play size={14} className="ml-0.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <p className="text-xs leading-relaxed text-muted-fg">
            Only <b className="text-fg">public</b> playlists &amp; tracks can be embedded. Tip: paste a playlist → <b className="text-fg">Inspect</b> to see and play any song inside it. Search playlists need a Spotify Client Secret (see note below).
          </p>
        </div>
      )}
      {lightbox && (
        <div onClick={() => setLightbox(null)} className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={lightbox} alt="Full cover" className="max-h-[85vh] max-w-[85vw] rounded-2xl object-contain shadow-2xl" />
          <button onClick={() => setLightbox(null)} className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6 6 18M6 6l12 12"/></svg></button>
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
      {spinning && <motion.span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-accent" animate={{ opacity: [1, 0.3, 1] }} transition={{ duration: 1, repeat: Infinity }} />}
    </div>
  );
}

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
