import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

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

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id")?.trim();
  if (!id) return NextResponse.json({ tracks: [] });
  const token = await getSpotifyToken();
  if (!token) return NextResponse.json({ tracks: [], error: "no token" });

  try {
    const url = `https://api.spotify.com/v1/playlists/${encodeURIComponent(id)}/tracks?limit=25&market=US`;
    const r = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (!r.ok) {
      const txt = await r.text();
      return NextResponse.json({ tracks: [], error: txt.slice(0, 300) }, { status: r.status });
    }
    const j = (await r.json()) as {
      items: Array<{
        track: { id: string | null; name: string; artists: { name: string }[]; album: { images: { url: string }[] }; preview_url: string | null } | null;
      }>;
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
    return NextResponse.json({ tracks });
  } catch (e) {
    return NextResponse.json({ tracks: [], error: String(e).slice(0, 300) }, { status: 500 });
  }
}
