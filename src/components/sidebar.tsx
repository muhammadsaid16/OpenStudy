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
} from "lucide-react";
import { useAppStore, type ThemeName } from "@/lib/store";
import { cn } from "@/lib/utils";

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

const THEME_DOTS: { id: ThemeName; color: string; title: string }[] = [
  { id: "aurora", color: "#FF5E57", title: "Aurora" },
  { id: "midnight", color: "#60A5FA", title: "Midnight" },
  { id: "nebula", color: "#C084FC", title: "Nebula" },
  { id: "matrix", color: "#34D399", title: "Matrix" },
  { id: "ember", color: "#FB923C", title: "Ember" },
  { id: "rosewood", color: "#FB7185", title: "Rosewood" },
  { id: "cyberpunk", color: "#FCEE0A", title: "Cyberpunk" },
  { id: "arctic", color: "#38BDF8", title: "Arctic" },
  { id: "sandstone", color: "#E8B45C", title: "Sandstone" },
  { id: "mono", color: "#FFFFFF", title: "Mono" },
  { id: "light", color: "#B91C1C", title: "Light" },
  { id: "paper", color: "#9A3412", title: "Paper" },
];

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
      <nav className="flex-1 space-y-1 overflow-y-auto p-3">
        {navItems.map(({ href, label, icon: Icon }) => {
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
      </nav>

      {/* Theme dots + footer */}
      <div className="border-t border-border p-4">
        {sidebarOpen ? (
          <>
            <p className="mb-2.5 text-[10px] font-bold uppercase tracking-widest text-muted-fg">
              Theme
            </p>
            <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="Theme picker">
              {THEME_DOTS.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTheme(t.id)}
                  title={t.title}
                  aria-label={`Use ${t.title} theme`}
                  aria-pressed={theme === t.id}
                  // 20px visual, 44px hit area (WCAG 2.5.8 + HIG): padding
                  // expands the target while negative margin keeps the dots
                  // visually spaced as before.
                  className="hit-target h-5 w-5 rounded-full border-2 transition-transform hover:scale-110"
                  style={{ backgroundColor: t.color }}
                >
                  <span
                    className={cn(
                      "block h-full w-full rounded-full border-2 transition-transform",
                      theme === t.id
                        ? "border-accent ring-2 ring-accent/30"
                        : "border-transparent"
                    )}
                  />
                </button>
              ))}
            </div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-fg">
              v2.0 · Aurora Glass
            </p>
          </>
        ) : (
          /* collapsed rail: single dot cycles themes */
          <button
            onClick={() => {
              const idx = THEME_DOTS.findIndex((t) => t.id === theme);
              setTheme(THEME_DOTS[(idx + 1) % THEME_DOTS.length].id);
            }}
            aria-label={`Current theme ${theme} — click to cycle`}
            className="mx-auto block h-6 w-6 rounded-full border-2 border-border transition-transform hover:scale-110"
            style={{
              backgroundColor:
                THEME_DOTS.find((t) => t.id === theme)?.color ?? "var(--color-accent)",
            }}
          />
        )}
      </div>
    </aside>
  );
}
