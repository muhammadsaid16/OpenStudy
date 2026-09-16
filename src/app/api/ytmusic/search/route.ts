import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type YTResult = {
  id: string;
  name: string;
  artist: string;
  type: "track";
  image: string | null;
  embedUrl: string;
  webUrl: string;
  videoId: string;
};

// Public Invidious instances (no key, free). Try in order.
const INVIDIOUS = [
  "https://vid.puffyan.us",
  "https://yewtu.be",
  "https://inv.tux.pizza",
  "https://invidious.privacydev.net",
];

async function searchInvidious(q: string): Promise<YTResult[]> {
  for (const base of INVIDIOUS) {
    try {
      const musicQ = q.toLowerCase().includes("music") || q.toLowerCase().includes("song") ? q : `${q} music`;
      const url = `${base}/api/v1/search?q=${encodeURIComponent(musicQ)}&type=video&sort_by=relevance`;
      const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" }, cache: "no-store", signal: AbortSignal.timeout(4000) });
      if (!r.ok) continue;
      const j = (await r.json()) as Array<{
        videoId: string;
        title: string;
        author: string;
        videoThumbnails?: Array<{ url: string; width: number }>;
      }>;
      if (!Array.isArray(j) || j.length === 0) continue;
      return j.slice(0, 12).map((v) => {
        const thumb = v.videoThumbnails?.find((t) => t.width === 720)?.url ?? v.videoThumbnails?.[0]?.url ?? null;
        return {
          id: v.videoId,
          name: v.title,
          artist: v.author,
          type: "track" as const,
          image: thumb,
          embedUrl: `https://www.youtube.com/embed/${v.videoId}?enablejsapi=1&modestbranding=1&autoplay=1`,
          webUrl: `https://music.youtube.com/watch?v=${v.videoId}`,
          videoId: v.videoId,
        };
      });
    } catch {}
  }
  return [];
}

async function searchYoutubeScrape(q: string): Promise<YTResult[]> {
  try {
    const musicQ2 = q.toLowerCase().includes("music") || q.toLowerCase().includes("song") ? q : `${q} music`;
    const html = await fetch(`https://www.youtube.com/results?search_query=${encodeURIComponent(musicQ2)}`, {
      headers: { "User-Agent": "Mozilla/5.0" },
      cache: "no-store",
    }).then((r) => (r.ok ? r.text() : ""));
    if (!html) return [];
    const ids = [...new Set([...html.matchAll(/watch\?v=([a-zA-Z0-9_-]{11})/g)].map((m) => m[1]))].slice(0, 12);
    if (ids.length === 0) return [];
    // Enrich via oembed for title/author
    const results: YTResult[] = [];
    for (const vid of ids) {
      try {
        const o = (await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${vid}&format=json`, { cache: "no-store" }).then((r) => r.json())) as { title?: string; author_name?: string; thumbnail_url?: string };
        results.push({
          id: vid,
          name: o.title ?? vid,
          artist: o.author_name ?? "YouTube",
          type: "track",
          image: o.thumbnail_url ?? `https://i.ytimg.com/vi/${vid}/hqdefault.jpg`,
          embedUrl: `https://www.youtube.com/embed/${vid}?enablejsapi=1&modestbranding=1&autoplay=1`,
          webUrl: `https://music.youtube.com/watch?v=${vid}`,
          videoId: vid,
        });
      } catch {
        results.push({ id: vid, name: vid, artist: "YouTube", type: "track", image: `https://i.ytimg.com/vi/${vid}/hqdefault.jpg`, embedUrl: `https://www.youtube.com/embed/${vid}?enablejsapi=1&modestbranding=1&autoplay=1`, webUrl: `https://music.youtube.com/watch?v=${vid}`, videoId: vid });
      }
    }
    return results;
  } catch {
    return [];
  }
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim();
  if (!q || q.length < 2) return NextResponse.json({ results: [] as YTResult[] });
  let results = await searchInvidious(q);
  if (results.length === 0) results = await searchYoutubeScrape(q);
  return NextResponse.json({ results, source: results.length ? "ytmusic" : "none" });
}
