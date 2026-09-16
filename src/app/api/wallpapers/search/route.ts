import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type WallpaperItem = {
  id: string;
  thumbUrl: string;
  fullUrl: string;
  title: string;
  source: "wallhaven" | "unsplash";
};

// Real Unsplash NAPI pagination — different photos per page, keyed by real photo ID
async function searchUnsplash(q: string, page: number): Promise<WallpaperItem[]> {
  try {
    const url = `https://unsplash.com/napi/search/photos?query=${encodeURIComponent(q)}&page=${page}&per_page=20`;
    const r = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36",
        Accept: "application/json",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(6000),
    });
    if (!r.ok) return [];
    const j = (await r.json()) as {
      results?: Array<{
        id: string;
        alt_description?: string;
        urls?: { small?: string; regular?: string; full?: string };
        user?: { name?: string };
      }>;
    };
    if (!Array.isArray(j.results) || j.results.length === 0) return [];
    return j.results.map((p) => ({
      id: `us-${p.id}`,
      thumbUrl: p.urls?.small ?? p.urls?.regular ?? "",
      fullUrl: p.urls?.full ?? p.urls?.regular ?? "",
      title: p.alt_description ?? p.user?.name ?? "Wallpaper",
      source: "unsplash" as const,
    }));
  } catch {
    return [];
  }
}

// Wallhaven public API — sorted by date_added so different pages = different photos
async function searchWallhaven(q: string, page: number): Promise<WallpaperItem[]> {
  try {
    const url = `https://wallhaven.cc/api/v1/search?q=${encodeURIComponent(q)}&page=${page}&purity=100&sorting=date_added&categories=111`;
    const r = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
      cache: "no-store",
      signal: AbortSignal.timeout(6000),
    });
    if (!r.ok) return [];
    const j = (await r.json()) as {
      data?: Array<{
        id: string;
        path: string;
        thumbs?: { large?: string; small?: string; original?: string };
        category?: string;
      }>;
    };
    if (!Array.isArray(j.data) || j.data.length === 0) return [];
    return j.data.map((w) => ({
      id: `wh-${w.id}`,
      thumbUrl: w.thumbs?.large ?? w.thumbs?.original ?? w.thumbs?.small ?? w.path,
      fullUrl: w.path,
      title: `${w.category ?? "Wallpaper"} #${w.id}`,
      source: "wallhaven" as const,
    }));
  } catch {
    return [];
  }
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim() || "space";
  const page = Math.max(1, parseInt(req.nextUrl.searchParams.get("page") || "1", 10));

  // Try Unsplash first (real pagination, always unique results per page)
  let wallpapers = await searchUnsplash(q, page);

  // If Unsplash fails, fall back to Wallhaven
  if (wallpapers.length === 0) {
    wallpapers = await searchWallhaven(q, page);
  }

  const hasMore = wallpapers.length > 0;
  return NextResponse.json({
    wallpapers,
    count: wallpapers.length,
    page,
    hasMore,
    source: wallpapers[0]?.source ?? "none",
  });
}

