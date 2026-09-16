import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Cached Spotify web-player token (no client_secret needed — same token
// open.spotify.com itself uses). Refreshed ~50min.
let cachedToken: string | null = null;
let cachedExp = 0;

async function getSpotifyToken(): Promise<string | null> {
  const now = Date.now();
  if (cachedToken && now < cachedExp - 60_000) return cachedToken;
  try {
    const r = await fetch(
      "https://open.spotify.com/get_access_token?reason=transport&productType=web_player",
      { headers: { "User-Agent": "Mozilla/5.0" }, cache: "no-store" }
    );
    if (!r.ok) return null;
    const j = (await r.json()) as {
      accessToken?: string;
      accessTokenExpirationTimestampMs?: number;
    };
    if (!j.accessToken) return null;
    cachedToken = j.accessToken;
    cachedExp = j.accessTokenExpirationTimestampMs ?? now + 3_500_000;
    return cachedToken;
  } catch {
    return null;
  }
}

type Result = {
  id: string;
  name: string;
  artist: string;
  type: "track" | "playlist";
  image: string | null;
  embedUrl: string;
  webUrl: string;
};

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim();
  if (!q || q.length < 2) {
    return NextResponse.json({ results: [] as Result[] });
  }

  // Try Spotify first
  const token = await getSpotifyToken();
  if (token) {
    try {
      const url =
        `https://api.spotify.com/v1/search?q=${encodeURIComponent(q)}&type=track,playlist&limit=12&market=US`;
      const r = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      if (r.ok) {
        const j = (await r.json()) as {
          tracks?: { items: Array<{ id: string; name: string; artists: { name: string }[]; album: { images: { url: string }[] } }> };
          playlists?: { items: Array<{ id: string | null; name: string; owner: { display_name: string }; images: { url: string }[] | null }> };
        };
        const results: Result[] = [];
        for (const t of j.tracks?.items ?? []) {
          results.push({
            id: t.id,
            name: t.name,
            artist: t.artists.map((a) => a.name).join(", "),
            type: "track",
            image: t.album.images[0]?.url ?? null,
            embedUrl: `https://open.spotify.com/embed/track/${t.id}?theme=0`,
            webUrl: `https://open.spotify.com/track/${t.id}`,
          });
        }
        for (const p of j.playlists?.items ?? []) {
          if (!p?.id) continue;
          results.push({
            id: p.id,
            name: p.name,
            artist: p.owner.display_name ?? "Playlist",
            type: "playlist",
            image: p.images?.[0]?.url ?? null,
            embedUrl: `https://open.spotify.com/embed/playlist/${p.id}?theme=0`,
            webUrl: `https://open.spotify.com/playlist/${p.id}`,
          });
        }
        if (results.length) return NextResponse.json({ results, source: "spotify" });
      }
    } catch {
      /* fall through to iTunes */
    }
  }

  // Fallback: iTunes Search (no key, public) — keeps search working even
  // when Spotify token is rate-limited. Maps to Spotify search links so
  // user can still play via embed.
  try {
    const r = await fetch(
      `https://itunes.apple.com/search?term=${encodeURIComponent(q)}&entity=song&limit=12`,
      { cache: "no-store" }
    );
    if (!r.ok) return NextResponse.json({ results: [] as Result[] });
    const j = (await r.json()) as {
      results: Array<{ trackId: number; trackName: string; artistName: string; artworkUrl100: string }>;
    };
    const results: Result[] = (j.results ?? []).map((t) => {
      const query = encodeURIComponent(`${t.trackName} ${t.artistName}`);
      return {
        id: String(t.trackId),
        name: t.trackName,
        artist: t.artistName,
        type: "track" as const,
        image: t.artworkUrl100 ?? null,
        // iTunes has no Spotify embed — link to Spotify search for that track
        embedUrl: `https://open.spotify.com/embed/search/${query}?theme=0`,
        webUrl: `https://open.spotify.com/search/${query}`,
      };
    });
    return NextResponse.json({ results, source: "itunes" });
  } catch {
    return NextResponse.json({ results: [] as Result[] });
  }
}
