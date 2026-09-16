// ─── Interface opacity bounds ─────────────────────────────────────
// Client-free on purpose: the pre-hydration script in app/layout.tsx is a
// server component, and a server component cannot read values out of a
// "use client" module. The store and that script must clamp identically.

export const UI_OPACITY_MIN = 0.55;
export const UI_OPACITY_MAX = 1;
export const UI_OPACITY_DEFAULT = 1;

/**
 * Clamp a requested interface opacity into the supported range.
 *
 * The floor is not arbitrary: below roughly 0.55 the primary text over a
 * bright wallpaper stops clearing AA contrast — the same reason the light
 * themes override the neutral surface ramp.
 */
export function clampUiOpacity(v: number): number {
  if (!Number.isFinite(v)) return UI_OPACITY_DEFAULT;
  return Math.min(UI_OPACITY_MAX, Math.max(UI_OPACITY_MIN, v));
}
