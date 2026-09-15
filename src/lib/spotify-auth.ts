"use client";

// ─── Spotify OAuth 2.0 (PKCE, public client) ────────────────────────
// Local-first: no server, no client_secret. The auth code is exchanged
// for tokens directly from the browser; tokens live ONLY in IndexedDB
// (see settings table in db.ts). Refresh is transparent + lock-guarded.
import {
  getSpotifyTokens,
  saveSpotifyTokens,
  clearSpotifyTokens,
  type SpotifyTokens,
} from "@/lib/db";

const CLIENT_ID = process.env.NEXT_PUBLIC_SPOTIFY_CLIENT_ID ?? "";
const SPOTIFY_AUTH_ENDPOINT = "https://accounts.spotify.com/authorize";
const SPOTIFY_TOKEN_ENDPOINT = "https://accounts.spotify.com/api/token";
const SPOTIFY_API = "https://api.spotify.com/v1";

// Scopes required for the Web Playback SDK (in-app playback) + reading the
// current track. Trim these if you only need the embed fallback.
const SCOPES = [
  "streaming",
  "user-read-playback-state",
  "user-modify-playback-state",
  "user-read-currently-playing",
  "app-remote-control",
].join(" ");

// Ephemeral PKCE/state material — kept in localStorage ONLY for the
// code→token round-trip. NOT a long-lived secret; cleared on completion.
const VERIFIER_KEY = "spotify_pkce_verifier";
const STATE_KEY = "spotify_oauth_state";
const RETURN_PATH_KEY = "spotify_return_to";

function randomUrlSafe(n: number): string {
  const arr = new Uint8Array(n);
  crypto.getRandomValues(arr);
  let str = "";
  for (const b of arr) str += String.fromCharCode(b);
  return btoa(str)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function sha256UrlSafe(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  return crypto.subtle.digest("SHA-256", data).then((digest) =>
    randomUrlSafeFromBytes(new Uint8Array(digest))
  );
}

function randomUrlSafeFromBytes(bytes: Uint8Array): string {
  let str = "";
  for (const b of bytes) str += String.fromCharCode(b);
  return btoa(str)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

// Generates a fresh PKCE verifier + S256 challenge.
export async function createPkcePair(): Promise<{ verifier: string; challenge: string }> {
  const verifier = randomUrlSafe(64);
  const challenge = await sha256UrlSafe(verifier);
  return { verifier, challenge };
}

// Redirect URI = current origin + /callback. It MUST match the origin the
// user is browsing, because the PKCE verifier lives in that origin's
// localStorage and is read back on the callback. Deriving it from the live
// origin (instead of a hardcoded override) keeps localStorage + redirect on
// the same domain after Spotify bounces the user back.
export function getRedirectUri(): string {
  if (typeof window === "undefined") return "";
  return `${window.location.origin}/callback`;
}

// Builds the Spotify authorize URL and stashes PKCE verifier + state +
// return path in localStorage. `returnTo` is where the callback bounces
// the user back (default "/" — the FocusZone lives on the dashboard).
export async function beginSpotifyAuth(returnTo = "/"): Promise<string> {
  if (!CLIENT_ID) {
    throw new Error("NEXT_PUBLIC_SPOTIFY_CLIENT_ID is not set");
  }
  const { verifier, challenge } = await createPkcePair();
  const state = randomUrlSafe(16);
  if (typeof window !== "undefined") {
    localStorage.setItem(VERIFIER_KEY, verifier);
    localStorage.setItem(STATE_KEY, state);
    localStorage.setItem(RETURN_PATH_KEY, returnTo);
  }
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: "code",
    redirect_uri: getRedirectUri(),
    code_challenge_method: "S256",
    code_challenge: challenge,
    state,
    scope: SCOPES,
  });
  return `${SPOTIFY_AUTH_ENDPOINT}?${params.toString()}`;
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope?: string;
}

// Public-client token exchange (no client_secret) — auth code → tokens.
export async function exchangeCodeForTokens(code: string, verifier: string): Promise<SpotifyTokens> {
  const body = new URLSearchParams({
    client_id: CLIENT_ID,
    grant_type: "authorization_code",
    code,
    redirect_uri: getRedirectUri(),
    code_verifier: verifier,
  });
  const res = await fetch(SPOTIFY_TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Spotify token exchange failed (${res.status}): ${text}`);
  }
  const data = (await res.json()) as TokenResponse;
  return finalizeTokens(data);
}

// Refresh an expired access token. Spotify may omit refresh_token on
// refresh, in which case we keep the previously stored one.
export async function refreshAccessToken(refreshToken: string): Promise<SpotifyTokens> {
  const body = new URLSearchParams({
    client_id: CLIENT_ID,
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });
  const res = await fetch(SPOTIFY_TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Spotify refresh failed (${res.status}): ${text}`);
  }
  const data = (await res.json()) as TokenResponse;
  return finalizeTokens(data, refreshToken);
}

function finalizeTokens(data: TokenResponse, prevRefresh?: string): SpotifyTokens {
  return {
    id: "spotify",
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? prevRefresh ?? null,
    expiresAt: Date.now() + data.expires_in * 1000,
    scope: data.scope ?? null,
    product: null,
    updatedAt: Date.now(),
  };
}

// Serializes refreshes so concurrent SDK token requests don't each
// trigger a refresh (which would burn through refresh tokens).
let refreshLock: Promise<SpotifyTokens> | null = null;

// Returns a valid access token, refreshing transparently when near expiry.
export async function getValidToken(): Promise<string> {
  const tokens = await getSpotifyTokens();
  if (!tokens) throw new Error("Not connected to Spotify");
  const skewMs = 60_000;
  if (tokens.expiresAt - skewMs > Date.now()) return tokens.accessToken;
  if (!tokens.refreshToken) {
    throw new Error("Spotify session expired — please reconnect");
  }
  if (!refreshLock) {
    refreshLock = (async () => {
      try {
        const next = await refreshAccessToken(tokens.refreshToken as string);
        next.product = tokens.product ?? next.product;
        await saveSpotifyTokens(next);
        return next;
      } finally {
        refreshLock = null;
      }
    })();
  }
  const refreshed = await refreshLock;
  return refreshed.accessToken;
}

// Account product drives player mode: Premium → Web Playback SDK,
// anything else → embed fallback.
export async function fetchSpotifyProfile(): Promise<{ product: "premium" | "free" | "open"; id: string }> {
  const token = await getValidToken();
  const res = await fetch(`${SPOTIFY_API}/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Spotify /me failed (${res.status})`);
  const data = (await res.json()) as { product: "premium" | "free" | "open"; id: string };
  return data;
}

export async function persistProduct(product: SpotifyTokens["product"]): Promise<void> {
  const tokens = await getSpotifyTokens();
  if (!tokens) return;
  tokens.product = product;
  await saveSpotifyTokens(tokens);
}

// Make the OpenStudy Web Playback device the active output so the in-app
// play/pause buttons actually control playback. Non-fatal.
export async function transferPlayback(deviceId: string): Promise<void> {
  try {
    const token = await getValidToken();
    await fetch(`${SPOTIFY_API}/me/player`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ device_ids: [deviceId], play: false }),
    });
  } catch {
    /* best effort */
  }
}

export async function disconnectSpotify(): Promise<void> {
  refreshLock = null;
  await clearSpotifyTokens();
}

// Consumed by /callback — verifies state (CSRF), exchanges the code,
// persists tokens, and returns the path to bounce the user back to.
export async function finishSpotifyAuth(code: string, state: string | null): Promise<string> {
  const savedState =
    typeof window !== "undefined" ? localStorage.getItem(STATE_KEY) : null;
  const verifier =
    typeof window !== "undefined" ? localStorage.getItem(VERIFIER_KEY) : null;
  const returnTo =
    (typeof window !== "undefined" ? localStorage.getItem(RETURN_PATH_KEY) : null) || "/";

  if (!verifier) throw new Error("Missing PKCE verifier — restart the Spotify connection");
  if (state !== savedState) {
    throw new Error("OAuth state mismatch — possible CSRF, connection aborted");
  }

  const tokens = await exchangeCodeForTokens(code, verifier);
  await saveSpotifyTokens(tokens);

  if (typeof window !== "undefined") {
    localStorage.removeItem(VERIFIER_KEY);
    localStorage.removeItem(STATE_KEY);
    localStorage.removeItem(RETURN_PATH_KEY);
  }
  return returnTo;
}


// ─── Web API: browse + play (used by the dedicated Spotify tab) ──────
export interface SpotifyTrack {
  id: string;
  name: string;
  artist: string;
  album: string;
  albumArt: string | null;
  uri: string;
}

export interface SpotifyPlaylist {
  id: string;
  name: string;
  trackCount: number;
  cover: string | null;
}

async function spotifyGet<T>(path: string, params?: Record<string, string>): Promise<T> {
  const token = await getValidToken();
  const url = new URL(`${SPOTIFY_API}${path}`);
  if (params) for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Spotify request failed (${res.status})`);
  return res.json() as Promise<T>;
}

function trackFromItem(item: {
  id: string;
  name: string;
  artists: { name: string }[];
  album: { name: string; images: { url: string }[] };
  uri: string;
}): SpotifyTrack {
  return {
    id: item.id,
    name: item.name,
    artist: item.artists.map((a) => a.name).join(", "),
    album: item.album.name,
    albumArt: item.album.images?.[0]?.url ?? null,
    uri: item.uri,
  };
}

export async function searchSpotify(query: string, limit = 20): Promise<SpotifyTrack[]> {
  if (!query.trim()) return [];
  const data = await spotifyGet<{ tracks: { items: Parameters<typeof trackFromItem>[0][] } }>(
    "/search",
    { q: query, type: "track", limit: String(limit) }
  );
  return (data.tracks?.items ?? []).map(trackFromItem);
}

export async function getSavedTracks(limit = 20): Promise<SpotifyTrack[]> {
  const data = await spotifyGet<{ items: { track: Parameters<typeof trackFromItem>[0] }[] }>(
    "/me/tracks",
    { limit: String(limit) }
  );
  return (data.items ?? []).map((i) => trackFromItem(i.track));
}

export async function getPlaylists(limit = 20): Promise<SpotifyPlaylist[]> {
  const data = await spotifyGet<{ items: { id: string; name: string; tracks: { total: number }; images: { url: string }[] }[] }>(
    "/me/playlists",
    { limit: String(limit) }
  );
  return (data.items ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    trackCount: p.tracks?.total ?? 0,
    cover: p.images?.[0]?.url ?? null,
  }));
}

export async function getRecentlyPlayed(limit = 20): Promise<SpotifyTrack[]> {
  const data = await spotifyGet<{ items: { track: Parameters<typeof trackFromItem>[0] }[] }>(
    "/me/player/recently-played",
    { limit: String(limit) }
  );
  return (data.items ?? []).map((i) => trackFromItem(i.track));
}

// Play a track URI on the active device. Premium uses the in-app SDK device;
// Free routes to the user's last Spotify app device (or fails gracefully).
export async function playTrack(uri: string): Promise<void> {
  const token = await getValidToken();
  const res = await fetch(`${SPOTIFY_API}/me/player/play`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ uris: [uri] }),
  });
  if (!res.ok && res.status !== 204) throw new Error(`Spotify play failed (${res.status})`);
}
