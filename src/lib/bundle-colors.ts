import { DEFAULT_THEME, THEMES } from "@/lib/themes";

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

// Theme accent — derived from the theme catalogue so it cannot drift from
// globals.css [data-theme] --color-accent. Used for auto-fitting new
// deck/subject colors.
export const THEME_ACCENTS: Record<string, string> = Object.fromEntries(
  THEMES.map((t) => [t.id, t.accent])
);

export function themeAccent(theme: string | undefined | null): string {
  return THEME_ACCENTS[theme ?? ""] ?? THEME_ACCENTS[DEFAULT_THEME];
}
