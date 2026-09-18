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
  { id: "aurora", name: "Aurora", bg: "#0B1220", accent: "#7cbcff", fg: "#F8FAFC" },
  { id: "midnight", name: "Midnight", bg: "#111316", accent: "#adc6ff", fg: "#e2e2e6" },
  { id: "nebula", name: "Nebula", bg: "#111316", accent: "#d4bfff", fg: "#e2e2e6" },
  { id: "matrix", name: "Matrix", bg: "#111316", accent: "#6EE7B7", fg: "#e2e2e6" },
  { id: "ember", name: "Ember", bg: "#111316", accent: "#fdba74", fg: "#e2e2e6" },
  { id: "rosewood", name: "Rosewood", bg: "#111316", accent: "#fda4af", fg: "#e2e2e6" },
  { id: "cyberpunk", name: "Cyberpunk", bg: "#111316", accent: "#FCEE0A", fg: "#e2e2e6" },
  { id: "arctic", name: "Arctic", bg: "#111316", accent: "#7dd3fc", fg: "#e2e2e6" },
  { id: "sandstone", name: "Sandstone", bg: "#111316", accent: "#E8B45C", fg: "#e2e2e6" },
  { id: "mono", name: "Mono", bg: "#09090B", accent: "#FFFFFF", fg: "#FAFAFA" },
  { id: "light", name: "Light", nameKey: "nav.light", bg: "#F6F7F9", accent: "#0b6ed6", fg: "#0F172A" },
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
