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
  Clock,
  ChevronLeft,
  ChevronRight,
  Sun,
  Moon,
  Headphones,
  FileQuestion,
  CalendarRange,
} from "lucide-react";
import { useAppStore } from "@/lib/store";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const navGroups: { headingKey: string; items: { href: string; labelKey: string; icon: typeof Library }[] }[] = [
  {
    headingKey: "nav.learn",
    items: [
      { href: "/subjects", labelKey: "nav.library", icon: Library },
      { href: "/notes", labelKey: "nav.notes", icon: StickyNote },
    ],
  },
  {
    headingKey: "nav.practice",
    items: [
      { href: "/review", labelKey: "nav.review", icon: Clock },
      { href: "/exam", labelKey: "nav.exam", icon: FileQuestion },
    ],
  },
  {
    headingKey: "nav.focus",
    items: [
      { href: "/plan", labelKey: "nav.plan", icon: CalendarRange },
      { href: "/sessions", labelKey: "nav.sessions", icon: Timer },
      { href: "/goals", labelKey: "nav.goals", icon: Target },
    ],
  },
  {
    headingKey: "nav.insights",
    items: [
      { href: "/", labelKey: "nav.dashboard", icon: LayoutDashboard },
      { href: "/stats", labelKey: "nav.stats", icon: BarChart3 },
    ],
  },
  {
    headingKey: "nav.music",
    items: [{ href: "/spotify", labelKey: "nav.spotify", icon: Headphones }],
  },
  {
    headingKey: "nav.system",
    items: [{ href: "/settings", labelKey: "nav.settings", icon: Settings }],
  },
];

function isLibraryActive(pathname: string, href: string) {
  if (href !== "/subjects") return pathname === href || (href !== "/" && pathname.startsWith(href));
  return pathname === "/subjects" || pathname.startsWith("/subjects") || pathname.startsWith("/flashcards") || pathname.startsWith("/bundles");
}

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
        "relative hidden h-screen shrink-0 flex-col border-e border-border bg-bg transition-[width] duration-200 ease-out md:flex",
        sidebarOpen ? "w-60" : "w-[68px]"
      )}
    >
      {/* Wordmark + collapse */}
      <div className="flex h-16 items-center justify-between border-b border-border px-4">
        {sidebarOpen && (
          <Link href="/" aria-label={t("ui.openstudy_home")} className="flex items-center gap-2.5">
            <img src="/brand/ruvren-mark.png" alt="" className="h-7 w-7 object-contain" />
            <span className="leading-none">
              <span className="block text-[15px] font-bold tracking-[0.18em] text-fg">
                RUV<span className="text-primary">REN</span>
              </span>
              <span className="mt-0.5 block text-[8px] font-semibold uppercase tracking-[0.22em] text-muted-fg">
                Your Knowledge OS
              </span>
            </span>
          </Link>
        )}
        <button
          onClick={toggleSidebar}
          aria-label={sidebarOpen ? t("ui.collapse_sidebar") : "Expand sidebar"}
          className="rounded-lg p-2 text-muted-fg transition-colors hover:bg-surface-hover hover:text-fg"
        >
          {sidebarOpen ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-6 overflow-y-auto p-3" aria-label="Main">
        {navGroups.map((group) => (
          <div key={t(group.headingKey)}>
            {sidebarOpen && (
              <p className="mb-2 px-3 text-[10px] font-bold uppercase tracking-[0.14em] text-muted-fg/60">
                {t(group.headingKey)}
              </p>
            )}
            <div className="space-y-1">
              {group.items.map(({ href, labelKey, icon: Icon }) => {
                const isActive = isLibraryActive(pathname, href);
                return (
                  <Link
                    key={href}
                    href={href}
                    aria-current={isActive ? "page" : undefined}
                    className={cn(
                      "group relative flex h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium tracking-tight transition-colors duration-150",
                      isActive
                        ? "bg-primary/15 text-primary"
                        : "text-muted-fg hover:bg-surface-hover hover:text-fg",
                      !sidebarOpen && "justify-center px-0"
                    )}
                  >
                    {isActive && (
                      <motion.span
                        layoutId="sidebar-pill"
                        transition={{ type: "spring", stiffness: 500, damping: 40 }}
                        className="absolute inset-y-1.5 start-0 w-0.5 rounded-full bg-primary"
                      />
                    )}
                    <Icon size={18} aria-hidden className="shrink-0" />
                    {sidebarOpen && <span className="truncate">{t(labelKey)}</span>}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Bottom: theme switcher + version */}
      <div className="border-t border-border p-3">
        {sidebarOpen ? (
          <>
            <div className="mb-3 flex items-center justify-between px-1">
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-fg/60">
                {t("nav.appearance")}
              </p>
              <Link
                href="/settings"
                aria-label={t("ui.all_themes_in_settings")}
                className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-fg transition-colors hover:text-primary"
              >
                {t("nav.all")}
              </Link>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setTheme("light")}
                aria-pressed={isLight}
                className={cn(
                  "flex h-9 items-center justify-center gap-1.5 rounded-lg border text-xs font-semibold transition-colors",
                  isLight
                    ? "border-primary bg-primary/15 text-primary"
                    : "border-border text-muted-fg hover:bg-surface-hover hover:text-fg"
                )}
              >
                <Sun size={13} aria-hidden /> {t("nav.light")}
              </button>
              <button
                onClick={() => setTheme("aurora")}
                aria-pressed={isDark}
                className={cn(
                  "flex h-9 items-center justify-center gap-1.5 rounded-lg border text-xs font-semibold transition-colors",
                  isDark
                    ? "border-primary bg-primary/15 text-primary"
                    : "border-border text-muted-fg hover:bg-surface-hover hover:text-fg"
                )}
              >
                <Moon size={13} aria-hidden /> {t("nav.dark")}
              </button>
            </div>
            <p className="mt-3 px-1 text-[10px] font-bold uppercase tracking-[0.14em] text-muted-fg/50">
              v2.0 · Ruvren
            </p>
          </>
        ) : (
          <button
            onClick={() => setTheme(isLight ? "aurora" : "light")}
            aria-label={isLight ? t("ui.switch_to_dark_mode") : t("ui.switch_to_light_mode")}
            className="mx-auto flex h-9 w-9 items-center justify-center rounded-lg border border-border text-muted-fg transition-colors hover:bg-surface-hover hover:text-fg"
          >
            {isLight ? <Sun size={16} aria-hidden /> : <Moon size={16} aria-hidden />}
          </button>
        )}
      </div>
    </aside>
  );
}
