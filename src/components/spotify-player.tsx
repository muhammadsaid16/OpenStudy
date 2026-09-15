"use client";

// ─── Spotify player widget (Focus Zone) ─────────────────────────────
// Premium accounts drive the in-app Web Playback SDK (play/pause + volume).
// Free/Open accounts can't use the SDK, so we show a read-only now-playing
// bar plus a Spotify <iframe> embed with its own controls. Not connected?
// A "Connect Spotify" button kicks off the PKCE flow in lib/spotify-auth.
import { useCallback, useEffect, useRef, useState } from "react";
import { Play, Pause, Music2, ExternalLink, LogOut, Loader2, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import {
  beginSpotifyAuth,
  disconnectSpotify,
  getValidToken,
  transferPlayback,
} from "@/lib/spotify-auth";
import { getSpotifyTokens } from "@/lib/db";

type Mode = "loading" | "disconnected" | "premium" | "free" | "error";

interface TrackView {
  name: string;
  artist: string;
  albumArt: string | null;
  uri: string | null; // spotify:track:... or https://open.spotify.com/track/...
}

interface SpotifyPlayerInstance {
  connect(): Promise<boolean>;
  disconnect(): void;
  addListener(event: string, cb: (arg: unknown) => void): void;
  removeListener(event: string, cb?: (arg: unknown) => void): void;
  getCurrentState(): Promise<SpotifyState | null>;
  setVolume(v: number): Promise<void>;
  getVolume(): Promise<number>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  togglePlay(): Promise<void>;
}

interface SpotifyState {
  track_window: {
    current_track: {
      name: string;
      artists: { name: string }[];
      album: { images: { url: string }[] };
      uri: string;
    } | null;
  };
  paused: boolean;
}

declare global {
  interface Window {
    Spotify?: { Player: new (cfg: Record<string, unknown>) => SpotifyPlayerInstance };
    onSpotifyWebPlaybackSDKReady?: () => void;
    __spotifySdkLoading?: boolean;
  }
}

const SDK_URL = "https://sdk.scdn.co/spotify-player.js";
const PLAYER_NAME = "OpenStudy Focus Zone";

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

function trackFromState(state: SpotifyState | null): TrackView | null {
  const t = state?.track_window?.current_track;
  if (!t) return null;
  return {
    name: t.name,
    artist: t.artists.map((a) => a.name).join(", "),
    albumArt: t.album.images?.[0]?.url ?? null,
    uri: t.uri,
  };
}

export function SpotifyPlayer() {
  const t = useT();
  const [mode, setMode] = useState<Mode>("loading");
  const [track, setTrack] = useState<TrackView | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(0.7);
  const [error, setError] = useState("");

  const playerRef = useRef<SpotifyPlayerInstance | null>(null);
  const deviceIdRef = useRef<string | null>(null);
  const tokenRef = useRef<string | null>(null);

  // ─── bootstrap: are we connected? which mode? ───────────────────
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
        // Premium → SDK; otherwise read-only embed fallback.
        setMode(tokens.product === "premium" ? "loading" : "free");
        if (tokens.product === "premium") {
          await initSdk();
        } else {
          await refreshFreeTrack();
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

  // ─── Premium: Web Playback SDK ──────────────────────────────────
  const initSdk = useCallback(async () => {
    await loadSdk();
    if (!window.Spotify) {
      setMode("free"); // SDK unavailable (network/adblock) → fall back
      await refreshFreeTrack();
      return;
    }
    const player = new window.Spotify.Player({
      name: PLAYER_NAME,
      getOAuthToken: async (cb: (token: string) => void) => {
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
      transferPlayback(device_id); // make this widget the active output
    });
    player.addListener("not_ready", () => {
      deviceIdRef.current = null;
    });
    player.addListener("player_state_changed", (arg: unknown) => {
      const state = arg as SpotifyState | null;
      setTrack(trackFromState(state));
      setIsPlaying(state ? !state.paused : false);
      setMode("premium");
    });
    player.addListener("authentication_error", async () => {
      // Token likely expired — refresh and reconnect once.
      try {
        tokenRef.current = await getValidToken();
        player.connect();
      } catch {
        setMode("error");
      }
    });
    player.addListener("initialization_error", () => setMode("free"));
    player.addListener("account_error", () => {
      // Not a premium account after all.
      setMode("free");
      refreshFreeTrack();
    });

    const ok = await player.connect();
    if (!ok) setMode("free");
  }, [volume]);

  // ─── Free: poll currently-playing via REST, build embed URI ─────
  const refreshFreeTrack = useCallback(async () => {
    try {
      const token = await getValidToken();
      const res = await fetch("https://api.spotify.com/v1/me/player/currently-playing", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const data = (await res.json()) as {
        item?: { name: string; artists: { name: string }[]; album: { images: { url: string }[] }; uri: string; external_urls: { spotify: string } };
        is_playing?: boolean;
      };
      if (!data.item) return;
      setTrack({
        name: data.item.name,
        artist: data.item.artists.map((a) => a.name).join(", "),
        albumArt: data.item.album.images?.[0]?.url ?? null,
        uri: data.item.external_urls.spotify,
      });
      setIsPlaying(!!data.is_playing);
    } catch {
      /* best effort — leave previous track visible */
    }
  }, []);

  // Poll the free-mode track every 15s so the bar stays fresh.
  useEffect(() => {
    if (mode !== "free") return;
    const id = setInterval(refreshFreeTrack, 15_000);
    return () => clearInterval(id);
  }, [mode, refreshFreeTrack]);

  const connect = useCallback(async () => {
    try {
      const url = await beginSpotifyAuth("/");
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
    setTrack(null);
    setIsPlaying(false);
    setMode("disconnected");
  }, []);

  const togglePlay = useCallback(() => {
    playerRef.current?.togglePlay().catch(() => {});
  }, []);

  const onVolume = useCallback((v: number) => {
    setVolume(v);
    playerRef.current?.setVolume(v).catch(() => {});
  }, []);

  // ─── Render ─────────────────────────────────────────────────────
  if (mode === "disconnected") {
    return (
      <div className="glass-inset mt-6 flex items-center justify-between rounded-2xl px-4 py-3">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent-soft text-accent">
            <Music2 size={16} aria-hidden />
          </span>
          <div>
            <p className="text-sm font-semibold text-fg">{t("spotify.title")}</p>
            <p className="text-xs text-muted-fg">{t("spotify.notConnected")}</p>
          </div>
        </div>
        <button
          onClick={connect}
          className="rounded-full bg-accent px-4 py-1.5 text-xs font-bold text-accent-fg transition-transform hover:scale-105 active:scale-95"
        >
          {t("spotify.connect")}
        </button>
      </div>
    );
  }

  if (mode === "loading") {
    return (
      <div className="glass-inset mt-6 flex items-center gap-3 rounded-2xl px-4 py-3 text-muted-fg">
        <Loader2 size={16} className="animate-spin text-accent" aria-hidden />
        <span className="text-xs">{t("spotify.connectingTitle")}</span>
      </div>
    );
  }

  if (mode === "error") {
    return (
      <div className="glass-inset mt-6 flex items-center gap-3 rounded-2xl px-4 py-3 text-danger">
        <AlertTriangle size={16} aria-hidden />
        <span className="text-xs">{error || t("spotify.connectionFailed")}</span>
        <button
          onClick={connect}
          className="ml-auto rounded-full border border-glass-border px-3 py-1 text-xs font-bold text-fg hover:text-accent"
        >
          {t("spotify.connect")}
        </button>
      </div>
    );
  }

  // Premium in-app widget OR free now-playing bar share this shell.
  const isPremium = mode === "premium";
  const embedId = track?.uri?.split("/track/")?.[1]?.split("?")?.[0] ?? null;

  return (
    <div className="glass-inset mt-6 overflow-hidden rounded-2xl">
      <div className="flex items-center gap-3 px-4 py-3">
        {track?.albumArt ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={track.albumArt}
            alt=""
            aria-hidden
            className="h-11 w-11 shrink-0 rounded-lg border border-glass-border object-cover"
          />
        ) : (
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-glass-border bg-muted/40 text-muted-fg">
            <Music2 size={18} aria-hidden />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-fg">
            {track?.name || t("spotify.noTrack")}
          </p>
          <p className="truncate text-xs text-muted-fg">{track?.artist || "—"}</p>
        </div>

        {isPremium ? (
          <button
            onClick={togglePlay}
            aria-label={isPlaying ? t("ui.pause") : t("ui.play")}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent text-accent-fg transition-transform hover:scale-105 active:scale-95"
          >
            {isPlaying ? <Pause size={18} /> : <Play size={18} className="ml-0.5" />}
          </button>
        ) : track?.uri ? (
          <a
            href={track.uri}
            target="_blank"
            rel="noreferrer"
            aria-label={t("spotify.openInSpotify")}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-glass-border bg-glass text-muted-fg transition-transform hover:scale-105 hover:text-accent"
          >
            <ExternalLink size={16} />
          </a>
        ) : null}

        <button
          onClick={disconnect}
          aria-label={t("spotify.disconnect")}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted-fg transition-colors hover:text-danger"
        >
          <LogOut size={15} />
        </button>
      </div>

      {isPremium && (
        <div className="flex items-center gap-3 border-t border-glass-border px-4 py-2.5">
          <span className="text-[10px] font-bold uppercase tracking-widest text-muted-fg">
            {t("spotify.volume")}
          </span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={volume}
            onChange={(e) => onVolume(Number(e.target.value))}
            aria-label={t("spotify.volume")}
            className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-muted accent-accent"
          />
        </div>
      )}

      {!isPremium && embedId && (
        <iframe
          title={t("spotify.title")}
          src={`https://open.spotify.com/embed/track/${embedId}?utm_source=generator`}
          width="100%"
          height="152"
          frameBorder={0}
          allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
          loading="lazy"
          className="w-full border-t border-glass-border"
        />
      )}

      {!isPremium && !embedId && (
        <p className="border-t border-glass-border px-4 py-2 text-[10px] uppercase tracking-widest text-muted-fg">
          {t("spotify.freeHint")}
        </p>
      )}
    </div>
  );
}
