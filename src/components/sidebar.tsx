"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import {
  LayoutDashboard,
  Library,
  StickyNote,
  Timer,
  Target,
  Settings,
  BarChart3,
  ChevronLeft,
  ChevronRight,
  Sun,
  Moon,
} from "lucide-react";
import { useAppStore } from "@/lib/store";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

// Flat list kept for typing; navGroups above drives the render.
const navItems = [
  { href: "/", label: t("ui.dashboard"), icon: LayoutDashboard },
  { href: "/subjects", label: t("ui.library"), icon: Library },
  { href: "/notes", label: t("ui.notes"), icon: StickyNote },
  { href: "/sessions", label: t("ui.sessions"), icon: Timer },
  { href: "/goals", label: t("ui.goals"), icon: Target },
  { href: "/stats", label: t("ui.stats"), icon: BarChart3 },
  { href: "/settings", label: t("ui.settings"), icon: Settings },
];

// Nav groups — spec mental model: LEARN (content) / FOCUS (time) /
// INSIGHTS (reflection) / SYSTEM. Library merges Subjects + Flashcards +
// Bundles (one hierarchy: Subject → Topic → Deck → Cards). This fixes the
// duplicate "two pages for same purpose" reported on /subjects vs /flashcards.
// Labels are i18n keys rendered through useT() (src/lib/i18n.ts).
const navGroups: { heading: string; items: typeof navItems }[] = [
  {
    heading: "nav.learn",
    items: [
      { href: "/subjects", label: "nav.library", icon: Library },
      { href: "/notes", label: "nav.notes", icon: StickyNote },
    ],
  },
  {
    heading: "nav.focus",
    items: [
      { href: "/sessions", label: "nav.sessions", icon: Timer },
      { href: "/goals", label: "nav.goals", icon: Target },
    ],
  },
  {
    heading: "nav.insights",
    items: [
      { href: "/", label: "nav.dashboard", icon: LayoutDashboard },
      { href: "/stats", label: "nav.stats", icon: BarChart3 },
    ],
  },
  {
    heading: "nav.system",
    items: [{ href: "/settings", label: "nav.settings", icon: Settings }],
  },
];

function isLibraryActive(pathname: string, href: string) {
  if (href !== "/subjects") return pathname === href || (href !== "/" && pathname.startsWith(href));
  // Library is active for its canonical route + legacy deck routes that now redirect to it
  return pathname === "/subjects" || pathname.startsWith("/subjects") || pathname.startsWith("/flashcards") || pathname.startsWith("/bundles");
}

// Full theme picker lives in Settings (src/app/settings/page.tsx) — the
// sidebar exposes only Dark/Light + an "All →" link (audit §6).

export function Sidebar() {
  const pathname = usePathname();
  const theme = useAppStore((s) => s.theme);
  const setTheme = useAppStore((s) => s.setTheme);
  const { sidebarOpen, toggleSidebar } = useAppStore();
  const t = useT();
  const isLight = theme === "light" || theme === "paper";
  const isDark = !isLight;

  return (
    <aside
      className={cn(
        "relative hidden h-screen shrink-0 flex-col border-e border-border bg-bg-raised/80 backdrop-blur-xl transition-all duration-300 md:flex",
        sidebarOpen ? "w-60" : "w-[68px]"
      )}
    >
      {/* Wordmark */}
      <div className="flex h-16 items-center justify-between border-b border-border px-4">
        {sidebarOpen && (
          <Link href="/" aria-label={t("ui.openstudy_home")}>
            <span className="font-display text-xl font-bold tracking-tight text-fg">{t("ui.open")}<span className="text-accent">{t("ui.study")}</span>
            </span>
          </Link>
        )}
        <button
          onClick={toggleSidebar}
          aria-label={sidebarOpen ? t("ui.collapse_sidebar") : "Expand sidebar"}
          className="rounded-full p-2 text-muted-fg transition-colors hover:bg-accent-soft hover:text-accent"
        >
          {sidebarOpen ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-5 overflow-y-auto p-3" aria-label="Main">
        {navGroups.map((group) => (
          <div key={group.heading}>
            {sidebarOpen && (
              <p className="mb-1.5 px-3 text-[10px] font-bold uppercase tracking-widest text-muted-fg/70">
                {t(group.heading)}
              </p>
            )}
            <div className="space-y-1">
              {group.items.map(({ href, label, icon: Icon }) => {
                const isActive = isLibraryActive(pathname, href);
                return (
                  <Link
                    key={href}
                    href={href}
                    aria-current={isActive ? "page" : undefined}
                    className={cn(
                      "group relative flex h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium tracking-tight transition-colors duration-200",
                      isActive
                        ? "bg-accent-soft text-accent"
                        : "text-muted-fg hover:bg-accent-soft hover:text-accent",
                      !sidebarOpen && "justify-center px-0"
                    )}
                  >
                    {isActive && (
                      <motion.span
                        layoutId="sidebar-pill"
                        transition={{ type: "spring", stiffness: 500, damping: 40 }}
                        className="absolute inset-0 rounded-xl bg-accent-soft"
                      />
                    )}
                    <span className="relative z-10 flex items-center gap-3">
                      <Icon size={18} aria-hidden />
                      {sidebarOpen && <span>{t(label)}</span>}
                    </span>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Appearance (audit §6): 2 quick modes + link to full picker in
          Settings. The 12-dot showcase read as a design-system demo, not
          an app control; full picker stays in Settings for power users. */}
      <div className="border-t border-border p-4">
        {sidebarOpen ? (
          <>
            <div className="mb-1.5 flex items-center justify-between">
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-fg">
                {t("nav.appearance")}
              </p>
              <Link
                href="/settings"
                aria-label={t("ui.all_themes_in_settings")}
                className="text-[10px] font-bold uppercase tracking-widest text-muted-fg transition-colors hover:text-accent"
              >
                {t("nav.all")}
              </Link>
            </div>
            <div className="inline-flex w-full rounded-full border border-glass-border bg-glass p-1" role="group" aria-label="Theme">
              <button
                onClick={() => setTheme("light")}
                aria-pressed={isLight}
                className={`relative flex flex-1 items-center justify-center gap-1.5 rounded-full px-3 py-2 text-xs font-bold transition-colors ${isLight ? "text-accent-fg" : "text-muted-fg hover:text-accent"}`}
              >
                {isLight && <span className="absolute inset-0 rounded-full bg-accent" aria-hidden />}
                <span className="relative flex items-center gap-1.5"><Sun size={13} aria-hidden /> {t("nav.light")}</span>
              </button>
              <button
                onClick={() => setTheme("aurora")}
                aria-pressed={isDark}
                className={`relative flex flex-1 items-center justify-center gap-1.5 rounded-full px-3 py-2 text-xs font-bold transition-colors ${isDark ? "text-accent-fg" : "text-muted-fg hover:text-accent"}`}
              >
                {isDark && <span className="absolute inset-0 rounded-full bg-accent" aria-hidden />}
                <span className="relative flex items-center gap-1.5"><Moon size={13} aria-hidden /> {t("nav.dark")}</span>
              </button>
            </div>
            <p className="mt-3 text-[10px] font-bold uppercase tracking-widest text-muted-fg">
              v2.0 · Aurora Glass
            </p>
          </>
        ) : (
          /* collapsed rail: toggle dark/light */
          <button
            onClick={() => setTheme(isLight ? "aurora" : "light")}
            aria-label={isLight ? t("ui.switch_to_dark_mode") : t("ui.switch_to_light_mode")}
            className="mx-auto flex h-9 w-9 items-center justify-center rounded-xl border border-glass-border text-muted-fg transition-colors hover:text-accent"
          >
            {isLight ? <Sun size={16} aria-hidden /> : <Moon size={16} aria-hidden />}
          </button>
        )}
      </div>
    </aside>
  );
}
