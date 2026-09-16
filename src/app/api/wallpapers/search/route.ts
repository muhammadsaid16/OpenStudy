import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type WallpaperItem = {
  id: string;
  thumbUrl: string;
  fullUrl: string;
  title: string;
  source: "wallhaven" | "unsplash";
};

// Search Wallhaven API (public, no key required, high quality 4K/HD wallpapers)
async function searchWallhaven(q: string): Promise<WallpaperItem[]> {
  try {
    const query = q.toLowerCase().includes("wallpaper") ? q : `${q} wallpaper`;
    const url = `https://wallhaven.cc/api/v1/search?q=${encodeURIComponent(query)}&purity=100&sorting=relevance&categories=111`;
    const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" }, cache: "no-store", signal: AbortSignal.timeout(5000) });
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
    return j.data.slice(0, 16).map((w) => ({
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

// Fallback Unsplash public collection search
async function searchUnsplash(q: string): Promise<WallpaperItem[]> {
  try {
    const topicMap: Record<string, string> = {
      space: "https://images.unsplash.com/photo-1506703719100-a0f3a48c0f86",
      nature: "https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05",
      cyberpunk: "https://images.unsplash.com/photo-1508739773434-c26b3d09e071",
      minimal: "https://images.unsplash.com/photo-1518770660439-4636190af475",
      anime: "https://images.unsplash.com/photo-1534447677768-be436bb09401",
      dark: "https://images.unsplash.com/photo-1518709268805-4e9042af9f23",
    };
    const key = q.toLowerCase().trim();
    const base = topicMap[key] ?? "https://images.unsplash.com/photo-1506703719100-a0f3a48c0f86";
    const items: WallpaperItem[] = [
      { id: "us-1", thumbUrl: `${base}?w=600&auto=format&fit=crop`, fullUrl: `${base}?w=2400&auto=format&fit=crop`, title: `${q} 1`, source: "unsplash" },
      { id: "us-2", thumbUrl: "https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=600&auto=format&fit=crop", fullUrl: "https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=2400&auto=format&fit=crop", title: "Dark Cosmic", source: "unsplash" },
      { id: "us-3", thumbUrl: "https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=600&auto=format&fit=crop", fullUrl: "https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=2400&auto=format&fit=crop", title: "Space Nebula", source: "unsplash" },
      { id: "us-4", thumbUrl: "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=600&auto=format&fit=crop", fullUrl: "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=2400&auto=format&fit=crop", title: "Ocean Dusk", source: "unsplash" },
    ];
    return items;
  } catch {
    return [];
  }
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim() || "dark space";
  let wallpapers = await searchWallhaven(q);
  if (wallpapers.length === 0) {
    wallpapers = await searchUnsplash(q);
  }
  return NextResponse.json({ wallpapers, source: wallpapers[0]?.source ?? "none" });
}
