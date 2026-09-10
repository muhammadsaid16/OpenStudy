// Curated bundle/subject color palette — 16 well-spaced hues.
// Acid yellow (#DFE104) kept first as the default brand accent.
// Values stay hex (not CSS vars): they're consumed with hex-alpha
// suffixes (`${color}1f`) and readableOn() luminance math app-wide.
export const BUNDLE_COLORS: string[] = [
  "#DFE104", // acid yellow (brand default)
  "#FACC15", // amber
  "#FB923C", // orange
  "#EF4444", // red
  "#F43F5E", // rose
  "#EC4899", // pink
  "#D946EF", // fuchsia
  "#A855F7", // purple
  "#6366F1", // indigo
  "#3B82F6", // blue
  "#0EA5E9", // sky
  "#06B6D4", // cyan
  "#14B8A6", // teal
  "#22C55E", // green
  "#84CC16", // lime
  "#78716C", // stone (neutral)
];

// Theme accent — must stay in sync with globals.css [data-theme] --color-accent
// and settings/page.tsx THEMES[]. Used for auto-fitting new deck/subject colors.
export const THEME_ACCENTS: Record<string, string> = {
  aurora: "#FF7A72",
  midnight: "#60A5FA",
  nebula: "#C084FC",
  matrix: "#34D399",
  ember: "#FB923C",
  rosewood: "#FB7185",
  cyberpunk: "#FCEE0A",
  arctic: "#38BDF8",
  sandstone: "#E8B45C",
  mono: "#FFFFFF",
  light: "#B91C1C",
  paper: "#9A3412",
};

export function themeAccent(theme: string | undefined | null): string {
  return THEME_ACCENTS[theme ?? ""] ?? THEME_ACCENTS.aurora;
}

// Runtime fallback: read the live CSS var (covers data-theme overrides).
export function currentAccent(): string {
  if (typeof document === "undefined") return THEME_ACCENTS.aurora;
  const v = getComputedStyle(document.documentElement).getPropertyValue("--color-accent").trim();
  // computed may be rgb() — keep as-is for swatches that accept rgb, but normalize to hex when possible
  if (!v) return THEME_ACCENTS.aurora;
  if (v.startsWith("#")) return v.toUpperCase();
  return v;
}
