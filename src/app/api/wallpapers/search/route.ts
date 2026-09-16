import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type WallpaperItem = {
  id: string;
  thumbUrl: string;
  fullUrl: string;
  title: string;
  source: "wallhaven" | "unsplash";
};

const UNSPLASH_SEEDS = [
  "https://images.unsplash.com/photo-1506703719100-a0f3a48c0f86",
  "https://images.unsplash.com/photo-1451187580459-43490279c0fa",
  "https://images.unsplash.com/photo-1518709268805-4e9042af9f23",
  "https://images.unsplash.com/photo-1446776811953-b23d57bd21aa",
  "https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05",
  "https://images.unsplash.com/photo-1426604966848-d7adac402bff",
  "https://images.unsplash.com/photo-1507525428034-b723cf961d3e",
  "https://images.unsplash.com/photo-1464822759023-fed622ff2c3b",
  "https://images.unsplash.com/photo-1508739773434-c26b3d09e071",
  "https://images.unsplash.com/photo-1519501025264-65ba15a82390",
  "https://images.unsplash.com/photo-1514565131-fce0801e5785",
  "https://images.unsplash.com/photo-1518770660439-4636190af475",
  "https://images.unsplash.com/photo-1494438639946-1ebd1d20bf85",
  "https://images.unsplash.com/photo-1507679799987-c73779587ccf",
  "https://images.unsplash.com/photo-1550684848-fac1c5b4e853",
  "https://images.unsplash.com/photo-1534447677768-be436bb09401",
  "https://images.unsplash.com/photo-1509198397868-475647b2a1e5",
  "https://images.unsplash.com/photo-1579783902614-a3fb3927b675",
  "https://images.unsplash.com/photo-1492691527719-9d1e07e534b4",
  "https://images.unsplash.com/photo-1439853949127-fa647821eba0",
  "https://images.unsplash.com/photo-1472214103451-9374bd1c798e",
  "https://images.unsplash.com/photo-1501785888041-af3ef285b470",
  "https://images.unsplash.com/photo-1470240731273-7821a6eeb6bd",
  "https://images.unsplash.com/photo-1511447333015-45b65e60f6d5",
  "https://images.unsplash.com/photo-1533134242443-d4fd215305ad",
  "https://images.unsplash.com/photo-1519681393784-d120267933ba",
  "https://images.unsplash.com/photo-1465146344425-f00d5f5c8f07",
  "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee",
  "https://images.unsplash.com/photo-1511556532299-8f662fc26c06",
  "https://images.unsplash.com/photo-1504384308090-c894fdcc538d",
  "https://images.unsplash.com/photo-1499002238440-d264edd596ec",
  "https://images.unsplash.com/photo-1493246507139-91e8fad9978e",
];

// Search Wallhaven API (public 4K wallpapers, page supported)
async function searchWallhaven(q: string, page: number): Promise<WallpaperItem[]> {
  try {
    const query = q.toLowerCase().includes("wallpaper") ? q : `${q} wallpaper`;
    const url = `https://wallhaven.cc/api/v1/search?q=${encodeURIComponent(query)}&page=${page}&purity=100&sorting=relevance&categories=111`;
    const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" }, cache: "no-store", signal: AbortSignal.timeout(6000) });
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

// Fallback Unsplash search (uses page offset + seeds)
function searchUnsplash(q: string, page: number): WallpaperItem[] {
  const pageSize = 24;
  const startIndex = ((page - 1) * pageSize) % UNSPLASH_SEEDS.length;
  const items: WallpaperItem[] = [];
  for (let i = 0; i < pageSize; i++) {
    const idx = (startIndex + i) % UNSPLASH_SEEDS.length;
    const url = UNSPLASH_SEEDS[idx];
    items.push({
      id: `us-p${page}-${i + 1}`,
      thumbUrl: `${url}?w=600&auto=format&fit=crop&q=80`,
      fullUrl: `${url}?w=2400&auto=format&fit=crop&q=80`,
      title: `${q} Wallpaper #${(page - 1) * pageSize + i + 1}`,
      source: "unsplash" as const,
    });
  }
  return items;
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim() || "space";
  const page = Math.max(1, parseInt(req.nextUrl.searchParams.get("page") || "1", 10));
  let wallpapers = await searchWallhaven(q, page);
  if (wallpapers.length === 0) {
    wallpapers = searchUnsplash(q, page);
  }
  return NextResponse.json({ wallpapers, count: wallpapers.length, page, hasMore: true, source: wallpapers[0]?.source ?? "none" });
}
