"use client";

// ─── Spotify tab ─────────────────────────────────────────────────────
// A dedicated place to connect Spotify, search your music, browse your
// library, and play. Premium accounts use the Web Playback SDK so playback
// happens in-app (bottom mini-player). Free accounts get per-track
// "Open in Spotify" links + the embed fallback.
import { useCallback, useEffect, useRef, useState } from "react";
import { useT } from "@/lib/i18n";
import {
  Search,
  Play,
  Pause,
  Music2,
  ExternalLink,
  LogOut,
  Loader2,
  Library,
  History,
  Heart,
  ListMusic,
  AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  beginSpotifyAuth,
  disconnectSpotify,
  getValidToken,
  transferPlayback,
  searchSpotify,
  getSavedTracks,
  getPlaylists,
  getRecentlyPlayed,
  playTrack,
  type SpotifyTrack,
  type SpotifyPlaylist,
} from "@/lib/spotify-auth";
import { getSpotifyTokens } from "@/lib/db";

type Mode = "loading" | "disconnected" | "premium" | "free" | "error";

interface SDKPlayer {
  connect(): Promise<boolean>;
  disconnect(): void;
  addListener(e: string, cb: (a: unknown) => void): void;
  removeListener(e: string, cb?: (a: unknown) => void): void;
  getCurrentState(): Promise<SDKState | null>;
  setVolume(v: number): Promise<void>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  togglePlay(): Promise<void>;
}

interface SDKState {
  track_window: { current_track: { name: string; artists: { name: string }[]; album: { images: { url: string }[] }; uri: string } | null };
  paused: boolean;
}

declare global {
  interface Window {
    Spotify?: { Player: new (c: Record<string, unknown>) => SDKPlayer };
    onSpotifyWebPlaybackSDKReady?: () => void;
    __spotifySdkLoading?: boolean;
  }
}

const SDK_URL = "https://sdk.scdn.co/spotify-player.js";
const PLAYER_NAME = "OpenStudy";

function loadSdk(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.Spotify) return Promise.resolve();
  if (window.__spotifySdkLoading) {
    return new Promise((resolve) => {
      const tick = () => (window.Spotify ? resolve() : setTimeout(tick, 50));
      tick();
    });
  }
  window.__spotifySdkLoading = true;
  return new Promise((resolve) => {
    window.onSpotifyWebPlaybackSDKReady = () => resolve();
    const s = document.createElement("script");
    s.src = SDK_URL;
    s.async = true;
    document.body.appendChild(s);
  });
}

function trackFromState(s: SDKState | null): SpotifyTrack | null {
  const t = s?.track_window?.current_track;
  if (!t) return null;
  return {
    id: t.uri,
    name: t.name,
    artist: t.artists.map((a) => a.name).join(", "),
    album: "",
    albumArt: t.album.images?.[0]?.url ?? null,
    uri: t.uri,
  };
}

export default function SpotifyPage() {
  const t = useT();
  const [mode, setMode] = useState<Mode>("loading");
  const [error, setError] = useState("");
  const [activeTrack, setActiveTrack] = useState<SpotifyTrack | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(0.7);

  // search + library
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SpotifyTrack[]>([]);
  const [saved, setSaved] = useState<SpotifyTrack[]>([]);
  const [playlists, setPlaylists] = useState<SpotifyPlaylist[]>([]);
  const [recent, setRecent] = useState<SpotifyTrack[]>([]);
  const [loadingData, setLoadingData] = useState(false);

  const playerRef = useRef<SDKPlayer | null>(null);
  const deviceIdRef = useRef<string | null>(null);
  const tokenRef = useRef<string | null>(null);

  // ─── bootstrap connection ────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const tokens = await getSpotifyTokens();
        if (!tokens || !tokens.accessToken) {
          if (!cancelled) setMode("disconnected");
          return;
        }
        tokenRef.current = tokens.accessToken;
        if (cancelled) return;
        if (tokens.product === "premium") {
          setMode("loading");
          await initSdk();
        } else {
          setMode("free");
          await loadLibrary();
        }
      } catch {
        if (!cancelled) setMode("error");
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const initSdk = useCallback(async () => {
    await loadSdk();
    if (!window.Spotify) {
      setMode("free");
      await loadLibrary();
      return;
    }
    const player = new window.Spotify.Player({
      name: PLAYER_NAME,
      getOAuthToken: async (cb: (tok: string) => void) => {
        try {
          const tok = await getValidToken();
          tokenRef.current = tok;
          cb(tok);
        } catch {
          setMode("error");
        }
      },
      volume,
    });
    playerRef.current = player;

    player.addListener("ready", (arg: unknown) => {
      const { device_id } = arg as { device_id: string };
      deviceIdRef.current = device_id;
      transferPlayback(device_id);
    });
    player.addListener("not_ready", () => {
      deviceIdRef.current = null;
    });
    player.addListener("player_state_changed", (arg: unknown) => {
      const state = arg as SDKState | null;
      setActiveTrack(trackFromState(state));
      setIsPlaying(state ? !state.paused : false);
      setMode("premium");
    });
    player.addListener("authentication_error", async () => {
      try {
        tokenRef.current = await getValidToken();
        player.connect();
      } catch {
        setMode("error");
      }
    });
    player.addListener("initialization_error", () => setMode("free"));
    player.addListener("account_error", () => {
      setMode("free");
      loadLibrary();
    });

    const ok = await player.connect();
    if (!ok) setMode("free");
  }, [volume]);

  const loadLibrary = useCallback(async () => {
    setLoadingData(true);
    try {
      const [s, p, r] = await Promise.all([
        getSavedTracks(12),
        getPlaylists(12),
        getRecentlyPlayed(12),
      ]);
      setSaved(s);
      setPlaylists(p);
      setRecent(r);
    } catch {
      /* leave lists empty */
    } finally {
      setLoadingData(false);
    }
  }, []);

  // refresh library once connected (free mode awaits this too)
  useEffect(() => {
    if (mode === "free" || mode === "premium") {
      loadLibrary();
      if (mode === "premium" && playerRef.current) {
        playerRef.current.getCurrentState().then((st) => {
          setActiveTrack(trackFromState(st));
          setIsPlaying(st ? !st.paused : false);
        });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  const runSearch = useCallback(async (q: string) => {
    if (!q.trim()) {
      setResults([]);
      return;
    }
    setLoadingData(true);
    try {
      setResults(await searchSpotify(q, 24));
    } catch {
      setResults([]);
    } finally {
      setLoadingData(false);
    }
  }, []);

  const connect = useCallback(async () => {
    try {
      const url = await beginSpotifyAuth("/spotify");
      window.location.href = url;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Spotify Client ID missing");
      setMode("error");
    }
  }, []);

  const disconnect = useCallback(async () => {
    playerRef.current?.disconnect();
    playerRef.current = null;
    deviceIdRef.current = null;
    await disconnectSpotify();
    setActiveTrack(null);
    setIsPlaying(false);
    setSaved([]);
    setPlaylists([]);
    setRecent([]);
    setResults([]);
    setMode("disconnected");
  }, []);

  const onPlay = useCallback(
    async (track: SpotifyTrack) => {
      setActiveTrack(track);
      setIsPlaying(true);
      try {
        await playTrack(track.uri);
      } catch {
        // free user or no active device — open in Spotify instead
        window.open(track.uri, "_blank", "noreferrer");
      }
    },
    []
  );

  const togglePlay = useCallback(() => {
    playerRef.current?.togglePlay().catch(() => {});
  }, []);

  const onVolume = useCallback((v: number) => {
    setVolume(v);
    playerRef.current?.setVolume(v).catch(() => {});
  }, []);

  return (
    <main className="mx-auto w-full max-w-5xl px-5 py-8 pb-28">
      <header className="mb-6 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-accent-soft text-accent">
            <Music2 size={20} aria-hidden />
          </span>
          <div>
            <h1 className="text-lg font-bold text-fg">{t("nav.spotify")}</h1>
            <p className="text-xs text-muted-fg">
              {mode === "premium"
                ? t("spotify.premiumOnly") === t("spotify.premiumOnly")
                  ? "In-app playback ready"
                  : ""
                : t("spotify.freeHint")}
            </p>
          </div>
        </div>
        {mode !== "disconnected" && mode !== "loading" && (
          <button
            onClick={disconnect}
            className="flex items-center gap-1.5 rounded-full border border-glass-border px-3 py-1.5 text-xs font-semibold text-muted-fg transition-colors hover:text-danger"
          >
            <LogOut size={14} /> {t("spotify.disconnect")}
          </button>
        )}
      </header>

      {mode === "disconnected" && (
        <div className="glass-inset flex flex-col items-center justify-center gap-4 rounded-3xl px-6 py-16 text-center">
          <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-accent-soft text-accent">
            <Music2 size={28} aria-hidden />
          </span>
          <p className="max-w-sm text-sm text-muted-fg">{t("spotify.connectToBrowse")}</p>
          <button
            onClick={connect}
            className="rounded-full bg-accent px-6 py-2.5 text-sm font-bold text-accent-fg transition-transform hover:scale-105 active:scale-95"
          >
            {t("spotify.connect")}
          </button>
        </div>
      )}

      {(mode === "loading" || (mode === "error" && !error)) && (
        <div className="glass-inset flex items-center gap-3 rounded-3xl px-6 py-16 text-muted-fg">
          <Loader2 size={18} className="animate-spin text-accent" aria-hidden />
          <span className="text-sm">{t("spotify.connectingTitle")}</span>
        </div>
      )}

      {mode === "error" && error && (
        <div className="glass-inset flex items-center gap-3 rounded-3xl px-6 py-10 text-danger">
          <AlertTriangle size={18} aria-hidden />
          <span className="text-sm">{error}</span>
          <button
            onClick={connect}
            className="ml-auto rounded-full border border-glass-border px-4 py-1.5 text-xs font-bold text-fg hover:text-accent"
          >
            {t("spotify.connect")}
          </button>
        </div>
      )}

      {(mode === "free" || mode === "premium") && (
        <div className="space-y-8">
          {/* Search */}
          <div className="relative">
            <Search
              size={16}
              className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted-fg"
              aria-hidden
            />
            <input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                runSearch(e.target.value);
              }}
              placeholder={t("spotify.search")}
              className="w-full rounded-2xl border border-glass-border bg-glass px-11 py-3 text-sm text-fg placeholder:text-muted-fg outline-none focus:border-accent/60"
            />
          </div>

          {loadingData && (
            <div className="flex items-center gap-2 text-muted-fg">
              <Loader2 size={14} className="animate-spin" aria-hidden /> {t("spotify.connectingTitle")}
            </div>
          )}

          {results.length > 0 && (
            <Section title={t("spotify.searchResults")} icon={<Search size={14} />}>
              <TrackList tracks={results} onPlay={onPlay} isPremium={mode === "premium"} activeUri={activeTrack?.uri ?? null} />
            </Section>
          )}

          {query.trim() === "" && (
            <>
              {saved.length > 0 && (
                <Section title={t("spotify.savedTracks")} icon={<Heart size={14} />}>
                  <TrackList tracks={saved} onPlay={onPlay} isPremium={mode === "premium"} activeUri={activeTrack?.uri ?? null} />
                </Section>
              )}

              {playlists.length > 0 && (
                <Section title={t("spotify.playlists")} icon={<ListMusic size={14} />}>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                    {playlists.map((p) => (
                      <a
                        key={p.id}
                        href={`https://open.spotify.com/playlist/${p.id}`}
                        target="_blank"
                        rel="noreferrer"
                        className="group rounded-2xl border border-glass-border bg-glass p-3 transition-colors hover:border-accent/50"
                      >
                        {p.cover ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={p.cover} alt="" aria-hidden className="mb-2 aspect-square w-full rounded-xl object-cover" />
                        ) : (
                          <div className="mb-2 flex aspect-square w-full items-center justify-center rounded-xl bg-muted/40 text-muted-fg">
                            <ListMusic size={22} />
                          </div>
                        )}
                        <p className="truncate text-sm font-semibold text-fg">{p.name}</p>
                        <p className="truncate text-xs text-muted-fg">
                          {p.trackCount} {t("nav.stats")}
                        </p>
                      </a>
                    ))}
                  </div>
                </Section>
              )}

              {recent.length > 0 && (
                <Section title={t("spotify.recentlyPlayed")} icon={<History size={14} />}>
                  <TrackList tracks={recent} onPlay={onPlay} isPremium={mode === "premium"} activeUri={activeTrack?.uri ?? null} />
                </Section>
              )}

              {saved.length === 0 && playlists.length === 0 && recent.length === 0 && !loadingData && (
                <p className="px-1 text-sm text-muted-fg">{t("spotify.emptyLibrary")}</p>
              )}
            </>
          )}
        </div>
      )}

      {/* Bottom mini-player (Premium in-app playback) */}
      {mode === "premium" && activeTrack && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-glass-border bg-bg/95 backdrop-blur">
          <div className="mx-auto flex max-w-5xl items-center gap-3 px-5 py-3">
            {activeTrack.albumArt ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={activeTrack.albumArt} alt="" aria-hidden className="h-12 w-12 shrink-0 rounded-lg border border-glass-border object-cover" />
            ) : (
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-glass-border bg-muted/40 text-muted-fg">
                <Music2 size={18} />
              </span>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-fg">{activeTrack.name}</p>
              <p className="truncate text-xs text-muted-fg">{activeTrack.artist}</p>
            </div>
            <button
              onClick={togglePlay}
              aria-label={isPlaying ? t("ui.pause") : t("ui.play")}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent text-accent-fg transition-transform hover:scale-105 active:scale-95"
            >
              {isPlaying ? <Pause size={18} /> : <Play size={18} className="ml-0.5" />}
            </button>
            <div className="hidden items-center gap-2 sm:flex">
              <span className="text-[10px] font-bold uppercase tracking-widest text-muted-fg">{t("spotify.volume")}</span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={volume}
                onChange={(e) => onVolume(Number(e.target.value))}
                aria-label={t("spotify.volume")}
                className="h-1.5 w-24 cursor-pointer appearance-none rounded-full bg-muted accent-accent"
              />
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-muted-fg">
        <span className="text-accent">{icon}</span>
        {title}
      </h2>
      {children}
    </section>
  );
}

function TrackList({
  tracks,
  onPlay,
  isPremium,
  activeUri,
}: {
  tracks: SpotifyTrack[];
  onPlay: (t: SpotifyTrack) => void;
  isPremium: boolean;
  activeUri: string | null;
}) {
  if (tracks.length === 0) return null;
  return (
    <ul className="space-y-1">
      {tracks.map((tr) => {
        const isActive = activeUri && tr.uri === activeUri;
        return (
          <li
            key={tr.id}
            className={cn(
              "group flex items-center gap-3 rounded-xl border border-transparent px-3 py-2 transition-colors hover:border-glass-border hover:bg-glass",
              isActive && "border-glass-border bg-glass"
            )}
          >
            {tr.albumArt ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={tr.albumArt} alt="" aria-hidden className="h-10 w-10 shrink-0 rounded-lg object-cover" />
            ) : (
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted/40 text-muted-fg">
                <Music2 size={16} />
              </span>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-fg">{tr.name}</p>
              <p className="truncate text-xs text-muted-fg">{tr.artist}</p>
            </div>
            <button
              onClick={() => onPlay(tr)}
              aria-label="Play"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent/90 text-accent-fg opacity-0 transition-opacity hover:scale-105 group-hover:opacity-100"
            >
              <Play size={15} className="ml-0.5" />
            </button>
            {!isPremium && (
              <a
                href={tr.uri}
                target="_blank"
                rel="noreferrer"
                aria-label="Open in Spotify"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-glass-border text-muted-fg transition-colors hover:text-accent"
              >
                <ExternalLink size={14} />
              </a>
            )}
          </li>
        );
      })}
    </ul>
  );
}
