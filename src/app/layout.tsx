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

export const metadata: Metadata = {
  title: "OpenStudy — Learn Smarter",
  description: "Full-stack study management with spaced repetition, notes, and progress tracking.",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/icon-192.png",
    apple: "/icon-192.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#0B0F17",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* No-flash theme script. Runs before hydration; also maps legacy
            v1 theme names (onyx/void/emerald/magma/grape) to their v2
            equivalents so old localStorage prefs keep working. */}
        <script
          id="theme-init"
          dangerouslySetInnerHTML={{
            __html:
              "(function(){try{var p=localStorage.getItem('study-prefs');var t=p?JSON.parse(p).theme:'aurora';" +
              "var map={onyx:'mono',void:'midnight',emerald:'matrix',magma:'ember',grape:'nebula'};" +
              "if(map[t]){t=map[t];try{var o=JSON.parse(p);o.theme=t;localStorage.setItem('study-prefs',JSON.stringify(o));}catch(e){}}" +
              "if(!['aurora','midnight','nebula','matrix','ember','rosewood','cyberpunk','arctic','sandstone','mono','light','paper'].includes(t))t='aurora';" +
              "document.documentElement.setAttribute('data-theme',t||'aurora');}catch(e){document.documentElement.setAttribute('data-theme','aurora');}})();",
          }}
        />
      </head>
      <body className="bg-bg text-fg antialiased">
        <div className="flex h-screen overflow-hidden">
          <Sidebar />
          <main className="flex-1 overflow-y-auto pb-[calc(4rem+env(safe-area-inset-bottom))] md:pb-0">
            <PageTransition>{children}</PageTransition>
          </main>
        </div>
        <BottomNav />
        <UndoToastHost />
        <ToastHost />
        <CommandPalette />
        <ThemeEffects />
        <SwRegister />
      </body>
    </html>
  );
}
