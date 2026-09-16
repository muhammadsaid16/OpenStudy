import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type VideoItem = {
  id: string;
  thumbUrl: string;
  videoUrl: string;
  title: string;
};

// Shared NSFW term blocklist — same list as wallpaper search route
const BLOCKED_TERMS = [
  "nude", "naked", "porn", "sex", "nsfw", "hentai", "erotic", "adult",
  "xxx", "lewd", "ecchi", "boob", "ass", "butt", "lingerie", "bikini model",
  "topless", "uncensored", "rule34",
];

function sanitizeQuery(q: string): string {
  const lower = q.toLowerCase();
  if (BLOCKED_TERMS.some((t) => lower.includes(t))) return "nature";
  return q;
}

function isSafeTitle(title: string): boolean {
  const lower = title.toLowerCase();
  return !BLOCKED_TERMS.some((t) => lower.includes(t));
}

async function searchCoverr(q: string, page: number): Promise<VideoItem[]> {
  try {
    const url = `https://coverr.co/api/videos?keywords=${encodeURIComponent(q)}&page=${page}&per_page=16`;
    const r = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36" },
      cache: "no-store",
      signal: AbortSignal.timeout(7000),
    });
    if (!r.ok) return [];
    const j = (await r.json()) as {
      hits?: Array<{
        id: string;
        objectID: string;
        title?: string;
        base_filename: string;
        thumbnail?: string;
        is_premium?: boolean;
      }>;
    };
    if (!Array.isArray(j.hits) || j.hits.length === 0) return [];
    return j.hits
      .filter((h) => !h.is_premium && isSafeTitle(h.title ?? ""))
      .map((h) => ({
        id: `cv-${h.objectID ?? h.id}`,
        thumbUrl: h.thumbnail ?? `https://cdn.coverr.co/videos/${h.base_filename}/thumbnail?width=640`,
        videoUrl: `https://cdn.coverr.co/videos/${h.base_filename}/1080p.mp4`,
        title: h.title ?? "Live Wallpaper",
      }));
  } catch {
    return [];
  }
}

export async function GET(req: NextRequest) {
  const rawQ = req.nextUrl.searchParams.get("q")?.trim() || "nature";
  const q = sanitizeQuery(rawQ);
  const page = Math.max(1, parseInt(req.nextUrl.searchParams.get("page") || "1", 10));

  const videos = await searchCoverr(q, page);
  const hasMore = videos.length > 0;

  return NextResponse.json({ videos, count: videos.length, page, hasMore });
}
