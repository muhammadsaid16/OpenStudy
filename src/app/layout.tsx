import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Sidebar } from "@/components/sidebar";
import { BottomNav } from "@/components/bottom-nav";
import { UndoToastHost } from "@/components/undo-toast";
import { ToastHost } from "@/components/toast";
import { ThemeEffects } from "@/components/theme-effects";
import { SwRegister } from "@/components/sw-register";
import { PageTransition } from "@/components/page-transition";
import { CommandPalette } from "@/components/command-palette";
import { GlobalFocusChip } from "@/components/global-focus-chip";
import { StorageGuard } from "@/components/storage-guard";
import { VitalsGuard } from "@/components/vitals-guard";
import { SpotifyAudioSource, SpotifyMiniPlayer } from "@/components/spotify-embed";
import { WallpaperHost } from "@/components/wallpaper-host";
import { DEFAULT_THEME, LEGACY_THEME_MAP, THEME_IDS } from "@/lib/themes";
import { UI_OPACITY_DEFAULT, UI_OPACITY_MAX, UI_OPACITY_MIN } from "@/lib/ui-opacity";

// No-flash init: runs before hydration and puts the persisted theme, language
// and interface opacity on <html>, so the first paint is already correct.
// Generated from the shared theme catalogue — the legacy v1 name map and the
// valid-id list used to be re-typed here by hand and had already drifted from
// globals.css.
const THEME_INIT_SCRIPT = `(function(){try{
var raw=localStorage.getItem('study-prefs');
var prefs=raw?JSON.parse(raw):{};
if(!prefs||typeof prefs!=='object')prefs={};
var root=document.documentElement;
var theme=prefs.theme||${JSON.stringify(DEFAULT_THEME)};
var legacy=${JSON.stringify(LEGACY_THEME_MAP)};
if(legacy[theme]){theme=legacy[theme];try{prefs.theme=theme;localStorage.setItem('study-prefs',JSON.stringify(prefs));}catch(e){}}
if(${JSON.stringify(THEME_IDS)}.indexOf(theme)===-1)theme=${JSON.stringify(DEFAULT_THEME)};
root.setAttribute('data-theme',theme);
var lang=prefs.lang==='ar'?'ar':'en';
root.setAttribute('lang',lang);
root.setAttribute('dir',lang==='ar'?'rtl':'ltr');
var alpha=parseFloat(prefs.uiOpacity);
if(!isFinite(alpha))alpha=${UI_OPACITY_DEFAULT};
if(alpha<${UI_OPACITY_MIN})alpha=${UI_OPACITY_MIN};
if(alpha>${UI_OPACITY_MAX})alpha=${UI_OPACITY_MAX};
root.style.setProperty('--ui-alpha',String(alpha));
}catch(e){document.documentElement.setAttribute('data-theme',${JSON.stringify(DEFAULT_THEME)});}})();`;

export const metadata: Metadata = {
  title: "Ruvren — Learn Smarter",
  description: "Full-stack study management with spaced repetition, notes, and progress tracking.",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/icon-192.png",
    apple: "/icon-192.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#0B1220",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script id="theme-init" dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="bg-bg text-fg antialiased">
        <WallpaperHost />
        <div className="ui-layer">
          <div className="relative z-10 flex h-screen overflow-hidden">
            <Sidebar />
            <main className="flex-1 overflow-y-auto pb-[calc(4rem+env(safe-area-inset-bottom))] md:pb-0">
              <StorageGuard />
              <PageTransition>{children}</PageTransition>
            </main>
          </div>
          <BottomNav />
          <SpotifyMiniPlayer />
          <SpotifyAudioSource />
          <UndoToastHost />
          <ToastHost />
          <CommandPalette />
        </div>
        <ThemeEffects />
        <VitalsGuard />
        <SwRegister />
      </body>
    </html>
  );
}
