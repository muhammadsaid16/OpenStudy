import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

let cachedToken: string | null = null;
let cachedExp = 0;

async function getSpotifyToken(): Promise<string | null> {
  const now = Date.now();
  if (cachedToken && now < cachedExp - 60_000) return cachedToken;

  // 1) Preferred: Client Credentials (needs SPOTIFY_CLIENT_SECRET in Vercel env)
  const id = process.env.SPOTIFY_CLIENT_ID ?? process.env.NEXT_PUBLIC_SPOTIFY_CLIENT_ID;
  const secret = process.env.SPOTIFY_CLIENT_SECRET;
  if (id && secret) {
    try {
      const r = await fetch("https://accounts.spotify.com/api/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`,
        },
        body: "grant_type=client_credentials",
        cache: "no-store",
      });
      if (r.ok) {
        const j = (await r.json()) as { access_token: string; expires_in: number };
        if (j.access_token) {
          cachedToken = j.access_token;
          cachedExp = now + j.expires_in * 1000;
          return cachedToken;
        }
      }
    } catch {}
  }

  // 2) Anonymous web-player token (blocked on some networks — try anyway)
  try {
    const r = await fetch("https://open.spotify.com/get_access_token?reason=transport&productType=web_player", {
      headers: { "User-Agent": "Mozilla/5.0" },
      cache: "no-store",
    });
    if (r.ok) {
      const j = (await r.json()) as { accessToken?: string; accessTokenExpirationTimestampMs?: number };
      if (j.accessToken) {
        cachedToken = j.accessToken;
        cachedExp = j.accessTokenExpirationTimestampMs ?? now + 3_500_000;
        return cachedToken;
      }
    }
  } catch {}
  return null;
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
  if (!q || q.length < 2) return NextResponse.json({ results: [] as Result[] });

  const token = await getSpotifyToken();
  if (token) {
    try {
      const url = `https://api.spotify.com/v1/search?q=${encodeURIComponent(q)}&type=track,playlist&limit=12&market=US`;
      const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
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
    } catch {}
  }

  // Fallback: scrape public Spotify search page (works without token — blocked get_access_token)
  // Extract track/playlist IDs directly from the HTML, then enrich via oembed.
  try {
    const html = await fetch(`https://open.spotify.com/search/${encodeURIComponent(q)}`, {
      headers: { "User-Agent": "Mozilla/5.0" },
      cache: "no-store",
    }).then((r) => (r.ok ? r.text() : ""));
    if (html) {
      const trackIds = [...new Set([...html.matchAll(/spotify:track:([A-Za-z0-9]{22})/g)].map((m) => m[1]))].slice(0, 8);
      const playlistIds = [...new Set([...html.matchAll(/spotify:playlist:([A-Za-z0-9]{22})/g)].map((m) => m[1]))].slice(0, 4);
      if (trackIds.length || playlistIds.length) {
        const results: Result[] = [];
        // Enrich via oembed in parallel (fast, public, no auth)
        const enrich = async (id: string, type: "track" | "playlist"): Promise<Result> => {
          try {
            const o = (await fetch(`https://open.spotify.com/oembed?url=https://open.spotify.com/${type}/${id}`, { cache: "no-store" }).then((r) => r.json())) as { title?: string; thumbnail_url?: string };
            const rawTitle = o.title ?? id;
            // oembed title for track is "Song — Artist", for playlist is playlist name
            if (type === "track" && rawTitle.includes(" — ")) {
              const [name, ...rest] = rawTitle.split(" — ");
              return { id, name: name.trim(), artist: rest.join(" — ").trim() || "Spotify", type, image: o.thumbnail_url ?? null, embedUrl: `https://open.spotify.com/embed/${type}/${id}?theme=0`, webUrl: `https://open.spotify.com/${type}/${id}` };
            }
            return { id, name: rawTitle, artist: type === "playlist" ? "Playlist" : "Spotify", type, image: o.thumbnail_url ?? null, embedUrl: `https://open.spotify.com/embed/${type}/${id}?theme=0`, webUrl: `https://open.spotify.com/${type}/${id}` };
          } catch {
            return { id, name: id, artist: type === "playlist" ? "Playlist" : "Spotify", type, image: null, embedUrl: `https://open.spotify.com/embed/${type}/${id}?theme=0`, webUrl: `https://open.spotify.com/${type}/${id}` };
          }
        };
        const trackResults = await Promise.all(trackIds.map((id) => enrich(id, "track")));
        const playlistResults = await Promise.all(playlistIds.map((id) => enrich(id, "playlist")));
        results.push(...trackResults, ...playlistResults);
        if (results.length) return NextResponse.json({ results, source: "scrape" });
      }
    }
  } catch {}

  // Final fallback: iTunes (keeps search working when token absent — no playlists)
  try {
    const r = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(q)}&entity=song&limit=12`, { cache: "no-store" });
    if (!r.ok) return NextResponse.json({ results: [] as Result[] });
    const j = (await r.json()) as { results: Array<{ trackId: number; trackName: string; artistName: string; artworkUrl100: string }> };
    const results: Result[] = (j.results ?? []).map((t) => ({
      id: String(t.trackId),
      name: t.trackName,
      artist: t.artistName,
      type: "track" as const,
      image: t.artworkUrl100 ?? null,
      embedUrl: "",
      webUrl: `https://open.spotify.com/search/${encodeURIComponent(`${t.trackName} ${t.artistName}`)}`,
    }));
    return NextResponse.json({ results, source: "itunes", note: "Add SPOTIFY_CLIENT_SECRET in Vercel env for full Spotify playlists" });
  } catch {
    return NextResponse.json({ results: [] as Result[] });
  }
}
