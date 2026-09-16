import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

let cachedToken: string | null = null;
let cachedExp = 0;

async function getSpotifyToken(): Promise<string | null> {
  const now = Date.now();
  if (cachedToken && now < cachedExp - 60_000) return cachedToken;
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

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id")?.trim();
  if (!id) return NextResponse.json({ tracks: [] });
  const token = await getSpotifyToken();

  // Try Spotify API first (needs token)
  if (token) {
    try {
      const url = `https://api.spotify.com/v1/playlists/${encodeURIComponent(id)}/tracks?limit=25&market=US`;
      const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
      if (r.ok) {
        const j = (await r.json()) as {
          items: Array<{ track: { id: string | null; name: string; artists: { name: string }[]; album: { images: { url: string }[] } } | null }>;
        };
        const tracks = (j.items ?? [])
          .map((it) => it.track)
          .filter((t): t is NonNullable<typeof t> => !!t && !!t.id)
          .map((t) => ({
            id: t.id!,
            name: t.name,
            artist: t.artists.map((a) => a.name).join(", "),
            image: t.album.images[0]?.url ?? null,
            embedUrl: `https://open.spotify.com/embed/track/${t.id}?theme=0`,
            webUrl: `https://open.spotify.com/track/${t.id}`,
          }));
        return NextResponse.json({ tracks, source: "spotify" });
      }
    } catch {}
  }

  // Fallback: scrape public playlist page for track list (works without secret)
  try {
    const html = await fetch(`https://open.spotify.com/playlist/${encodeURIComponent(id)}`, {
      headers: { "User-Agent": "Mozilla/5.0" },
      cache: "no-store",
    }).then((r) => r.text());
    // Spotify inlines playlist data as JSON in the HTML — extract track URIs
    const matches = [...html.matchAll(/spotify:track:([A-Za-z0-9]{22})/g)].map((m) => m[1]);
    const unique = [...new Set(matches)].slice(0, 25);
    if (unique.length) {
      // Build minimal tracks from IDs (names unknown without API — fetch via oembed per track)
      const tracks = await Promise.all(
        unique.map(async (tid) => {
          try {
            const o = await fetch(`https://open.spotify.com/oembed?url=https://open.spotify.com/track/${tid}`, { cache: "no-store" }).then((r) => r.json()) as { title?: string; thumbnail_url?: string };
            const title = o.title ?? tid;
            // oembed title is "Song — Artist"
            const [name, ...rest] = title.split(" — ");
            return {
              id: tid,
              name: name || title,
              artist: rest.join(" — ") || "Spotify",
              image: o.thumbnail_url ?? null,
              embedUrl: `https://open.spotify.com/embed/track/${tid}?theme=0`,
              webUrl: `https://open.spotify.com/track/${tid}`,
            };
          } catch {
            return { id: tid, name: tid, artist: "Spotify", image: null, embedUrl: `https://open.spotify.com/embed/track/${tid}?theme=0`, webUrl: `https://open.spotify.com/track/${tid}` };
          }
        })
      );
      return NextResponse.json({ tracks, source: "scrape" });
    }
  } catch {}

  return NextResponse.json({ tracks: [], error: "Add SPOTIFY_CLIENT_SECRET in Vercel → Settings → Environment Variables to enable full playlist inspection, or make the playlist public." });
}
