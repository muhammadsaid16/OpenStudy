import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type WallpaperItem = {
  id: string;
  thumbUrl: string;
  fullUrl: string;
  title: string;
  source: "wallhaven" | "unsplash";
};

const UNSPLASH_CURATED = [
  { id: "us-1", category: "space", url: "https://images.unsplash.com/photo-1506703719100-a0f3a48c0f86", title: "Milky Way Galaxy" },
  { id: "us-2", category: "space", url: "https://images.unsplash.com/photo-1451187580459-43490279c0fa", title: "Cosmic Nebula" },
  { id: "us-3", category: "space", url: "https://images.unsplash.com/photo-1518709268805-4e9042af9f23", title: "Deep Space Void" },
  { id: "us-4", category: "space", url: "https://images.unsplash.com/photo-1446776811953-b23d57bd21aa", title: "Earth Orbit View" },
  { id: "us-5", category: "nature", url: "https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05", title: "Mist Forest" },
  { id: "us-6", category: "nature", url: "https://images.unsplash.com/photo-1426604966848-d7adac402bff", title: "Yosemite Valley" },
  { id: "us-7", category: "nature", url: "https://images.unsplash.com/photo-1507525428034-b723cf961d3e", title: "Ocean Sunset" },
  { id: "us-8", category: "nature", url: "https://images.unsplash.com/photo-1464822759023-fed622ff2c3b", title: "Alpine Mountains" },
  { id: "us-9", category: "cyberpunk", url: "https://images.unsplash.com/photo-1508739773434-c26b3d09e071", title: "Neon City Alley" },
  { id: "us-10", category: "cyberpunk", url: "https://images.unsplash.com/photo-1519501025264-65ba15a82390", title: "Tokyo Night Lights" },
  { id: "us-11", category: "cyberpunk", url: "https://images.unsplash.com/photo-1514565131-fce0801e5785", title: "Cyber Metropolis" },
  { id: "us-12", category: "cyberpunk", url: "https://images.unsplash.com/photo-1518709268805-4e9042af9f23", title: "Neon Grid Sky" },
  { id: "us-13", category: "minimalist", url: "https://images.unsplash.com/photo-1518770660439-4636190af475", title: "Minimal Abstract" },
  { id: "us-14", category: "minimalist", url: "https://images.unsplash.com/photo-1494438639946-1ebd1d20bf85", title: "Golden Horizon" },
  { id: "us-15", category: "minimalist", url: "https://images.unsplash.com/photo-1507679799987-c73779587ccf", title: "Minimal Dark" },
  { id: "us-16", category: "minimalist", url: "https://images.unsplash.com/photo-1550684848-fac1c5b4e853", title: "Dark Geometry" },
  { id: "us-17", category: "anime", url: "https://images.unsplash.com/photo-1534447677768-be436bb09401", title: "Fantasy Aurora Sky" },
  { id: "us-18", category: "anime", url: "https://images.unsplash.com/photo-1509198397868-475647b2a1e5", title: "Lo-Fi Dusk City" },
  { id: "us-19", category: "anime", url: "https://images.unsplash.com/photo-1518709268805-4e9042af9f23", title: "Starry Night Lake" },
  { id: "us-20", category: "anime", url: "https://images.unsplash.com/photo-1579783902614-a3fb3927b675", title: "Dreamy Clouds" },
  { id: "us-21", category: "dark", url: "https://images.unsplash.com/photo-1518709268805-4e9042af9f23", title: "Midnight Charcoal" },
  { id: "us-22", category: "dark", url: "https://images.unsplash.com/photo-1509198397868-475647b2a1e5", title: "Nocturne City" },
  { id: "us-23", category: "dark", url: "https://images.unsplash.com/photo-1519501025264-65ba15a82390", title: "Dark Neon Glow" },
  { id: "us-24", category: "dark", url: "https://images.unsplash.com/photo-1451187580459-43490279c0fa", title: "Black Hole Void" },
];

// Search Wallhaven API (public 4K wallpapers)
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
    return j.data.slice(0, 24).map((w) => ({
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

// Fallback Unsplash curated search
function searchUnsplash(q: string): WallpaperItem[] {
  const query = q.toLowerCase().trim();
  const filtered = UNSPLASH_CURATED.filter((item) => item.category.includes(query) || item.title.toLowerCase().includes(query));
  const list = filtered.length >= 4 ? filtered : UNSPLASH_CURATED;
  return list.map((item) => ({
    id: item.id,
    thumbUrl: `${item.url}?w=600&auto=format&fit=crop`,
    fullUrl: `${item.url}?w=2400&auto=format&fit=crop`,
    title: item.title,
    source: "unsplash" as const,
  }));
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim() || "space";
  let wallpapers = await searchWallhaven(q);
  if (wallpapers.length === 0) {
    wallpapers = searchUnsplash(q);
  }
  return NextResponse.json({ wallpapers, count: wallpapers.length, source: wallpapers[0]?.source ?? "none" });
}
