"use client";

import { useEffect } from "react";
import { useAppStore } from "@/lib/store";

// Applies persisted UI prefs to <html> so they affect global CSS.
// Also hydrates the store from localStorage post-mount — reading storage at
// module scope would make the first client render differ from SSR and break
// hydration (which in turn re-triggered the script-tag warning in RootLayout).
export function ThemeEffects() {
  const reducedMotion = useAppStore((s) => s.reducedMotion);
  const uiOpacity = useAppStore((s) => s.uiOpacity);
  const hydrateFromStorage = useAppStore((s) => s.hydrateFromStorage);

  useEffect(() => {
    hydrateFromStorage();
  }, [hydrateFromStorage]);

  useEffect(() => {
    const root = document.documentElement;
    if (reducedMotion) root.setAttribute("data-reduced-motion", "true");
    else root.removeAttribute("data-reduced-motion");
  }, [reducedMotion]);

  // Interface opacity → the --ui-alpha custom property that globals.css feeds
  // into color-mix for the app background and card surfaces.
  useEffect(() => {
    document.documentElement.style.setProperty("--ui-alpha", String(uiOpacity));
  }, [uiOpacity]);

  return null;
}
