// ─── Single source of truth for the theme system ──────────────────
// Consumed by the Zustand store, the settings picker, bundle-colors, and the
// no-flash init script in app/layout.tsx. That script runs before hydration,
// so it needs these as plain data — which is why they live here instead of in
// the "use client" store. Adding a theme means editing this file only.
//
// Kept free of "use client" on purpose: a server component cannot read a
// plain array out of a client module (the import becomes a client reference).

export type ThemeName =
  | "aurora" | "midnight" | "nebula" | "matrix" | "ember" | "rosewood"
  | "cyberpunk" | "arctic" | "sandstone" | "mono" | "light" | "paper";

export interface ThemeDef {
  id: ThemeName;
  /** Display name; ignored when nameKey is set. */
  name: string;
  /** i18n key, for themes whose label is localized. */
  nameKey?: string;
  /** Preview swatch colors for the settings picker. */
  bg: string;
  accent: string;
  fg: string;
}

export const THEMES: ThemeDef[] = [
  { id: "aurora", name: "Aurora", bg: "#0B0F17", accent: "#FF7A72", fg: "#E7EDF7" },
  { id: "midnight", name: "Midnight", bg: "#030712", accent: "#60A5FA", fg: "#E4EDFF" },
  { id: "nebula", name: "Nebula", bg: "#0D0716", accent: "#C084FC", fg: "#F2E9FF" },
  { id: "matrix", name: "Matrix", bg: "#02100B", accent: "#34D399", fg: "#E4FFF1" },
  { id: "ember", name: "Ember", bg: "#140808", accent: "#FB923C", fg: "#FFF0E7" },
  { id: "rosewood", name: "Rosewood", bg: "#12070C", accent: "#FB7185", fg: "#FFEAF1" },
  { id: "cyberpunk", name: "Cyberpunk", bg: "#0A0A12", accent: "#FCEE0A", fg: "#F2F2FF" },
  { id: "arctic", name: "Arctic", bg: "#07111E", accent: "#38BDF8", fg: "#E8F6FF" },
  { id: "sandstone", name: "Sandstone", bg: "#151210", accent: "#E8B45C", fg: "#F7EFE3" },
  { id: "mono", name: "Mono", bg: "#09090B", accent: "#FFFFFF", fg: "#FAFAFA" },
  { id: "light", name: "Light", nameKey: "nav.light", bg: "#F1F5F9", accent: "#B91C1C", fg: "#0F172A" },
  { id: "paper", name: "Paper", bg: "#FAF7F2", accent: "#9A3412", fg: "#292018" },
];

export const THEME_IDS: ThemeName[] = THEMES.map((t) => t.id);

export const DEFAULT_THEME: ThemeName = "aurora";

/** v1 theme names → their v2 equivalents, so old localStorage prefs keep working. */
export const LEGACY_THEME_MAP: Record<string, ThemeName> = {
  onyx: "mono",
  void: "midnight",
  emerald: "matrix",
  magma: "ember",
  grape: "nebula",
};

/** Map a stored (possibly legacy v1) theme name to a valid v2 theme. */
export function normalizeTheme(t: string | undefined | null): ThemeName {
  if (!t) return DEFAULT_THEME;
  if (LEGACY_THEME_MAP[t]) return LEGACY_THEME_MAP[t];
  return (THEME_IDS as string[]).includes(t) ? (t as ThemeName) : DEFAULT_THEME;
}
