"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import {
  LayoutDashboard,
  BookOpen,
  Brain,
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
import { cn } from "@/lib/utils";

// Flat list kept for typing; navGroups above drives the render.
const navItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/subjects", label: "Subjects", icon: BookOpen },
  { href: "/flashcards", label: "Flashcards", icon: Brain },
  { href: "/notes", label: "Notes", icon: StickyNote },
  { href: "/sessions", label: "Sessions", icon: Timer },
  { href: "/goals", label: "Goals", icon: Target },
  { href: "/stats", label: "Stats", icon: BarChart3 },
  { href: "/settings", label: "Settings", icon: Settings },
];

// Nav groups — spec mental model: LEARN (content) / FOCUS (time) /
// INSIGHTS (reflection) / SYSTEM. Replaces the previous flat list;
// scannable sections instead of 8 undifferentiated items.
const navGroups: { heading: string; items: typeof navItems }[] = [
  {
    heading: "Learn",
    items: [
      { href: "/subjects", label: "Subjects", icon: BookOpen },
      { href: "/flashcards", label: "Flashcards", icon: Brain },
      { href: "/notes", label: "Notes", icon: StickyNote },
    ],
  },
  {
    heading: "Focus",
    items: [
      { href: "/sessions", label: "Sessions", icon: Timer },
      { href: "/goals", label: "Goals", icon: Target },
    ],
  },
  {
    heading: "Insights",
    items: [
      { href: "/", label: "Dashboard", icon: LayoutDashboard },
      { href: "/stats", label: "Stats", icon: BarChart3 },
    ],
  },
  {
    heading: "System",
    items: [{ href: "/settings", label: "Settings", icon: Settings }],
  },
];

// Full theme picker lives in Settings (src/app/settings/page.tsx) — the
// sidebar exposes only Dark/Light + an "All →" link (audit §6).

export function Sidebar() {
  const pathname = usePathname();
  const theme = useAppStore((s) => s.theme);
  const setTheme = useAppStore((s) => s.setTheme);
  const { sidebarOpen, toggleSidebar } = useAppStore();

  return (
    <aside
      className={cn(
        "relative hidden h-screen shrink-0 flex-col border-r border-border bg-bg-raised/80 backdrop-blur-xl transition-all duration-300 md:flex",
        sidebarOpen ? "w-60" : "w-[68px]"
      )}
    >
      {/* Wordmark */}
      <div className="flex h-16 items-center justify-between border-b border-border px-4">
        {sidebarOpen && (
          <Link href="/" aria-label="OpenStudy home">
            <span className="font-display text-xl font-bold tracking-tight text-fg">
              Open<span className="text-accent">Study</span>
            </span>
          </Link>
        )}
        <button
          onClick={toggleSidebar}
          aria-label={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
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
                {group.heading}
              </p>
            )}
            <div className="space-y-1">
              {group.items.map(({ href, label, icon: Icon }) => {
                const isActive = pathname === href || (href !== "/" && pathname.startsWith(href));
                return (
                  <Link
                    key={href}
                    href={href}
                    aria-current={isActive ? "page" : undefined}
                    className={cn(
                      "group relative flex h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium tracking-tight transition-colors duration-200",
                      isActive
                        ? "bg-accent-soft text-accent"
                        : "text-muted-fg hover:bg-glass hover:text-fg",
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
                      {sidebarOpen && <span>{label}</span>}
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
                Appearance
              </p>
              <Link
                href="/settings"
                aria-label="All themes in Settings"
                className="text-[10px] font-bold uppercase tracking-widest text-muted-fg transition-colors hover:text-accent"
              >
                All →
              </Link>
            </div>
            <div className="flex gap-2" role="group" aria-label="Appearance">
              <button
                onClick={() => setTheme(theme === "aurora" ? "light" : "aurora")}
                aria-pressed={theme === "light"}
                className="hit-target flex flex-1 items-center justify-center gap-2 rounded-xl border border-glass-border bg-glass px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-muted-fg transition-colors hover:text-fg"
              >
                <span
                  className="h-3.5 w-3.5 rounded-full border border-border"
                  style={{ backgroundColor: theme === "light" ? "#F1F5F9" : "#0B0F17" }}
                  aria-hidden
                />
                {theme === "light" ? "Light" : "Dark"}
              </button>
            </div>
            <p className="mt-3 text-[10px] font-bold uppercase tracking-widest text-muted-fg">
              v2.0 · Aurora Glass
            </p>
          </>
        ) : (
          /* collapsed rail: toggle dark/light */
          <button
            onClick={() => setTheme(theme === "aurora" ? "light" : "aurora")}
            aria-label={theme === "light" ? "Switch to dark mode" : "Switch to light mode"}
            className="mx-auto flex h-9 w-9 items-center justify-center rounded-xl border border-glass-border text-muted-fg transition-colors hover:text-accent"
          >
            {theme === "light" ? <Sun size={16} aria-hidden /> : <Moon size={16} aria-hidden />}
          </button>
        )}
      </div>
    </aside>
  );
}
