"use client";

import Link from "next/link";
import { useT } from "@/lib/i18n";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import {
  LayoutDashboard,
  Library,
  StickyNote,
  Timer,
  Target,
  BarChart3,
  Clock,
  Settings,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";

// Mobile bottom-nav: 4 primary destinations (Home / Learn / Focus / Insights)
// per spec §5 — secondary pages reachable via the top menu / Settings.
const primary = [
  { href: "/", label: "nav.dashboard", icon: LayoutDashboard },
  { href: "/subjects", label: "nav.library", icon: Library },
  { href: "/sessions", label: "nav.sessions", icon: Timer },
  { href: "/review", label: "nav.review", icon: Clock },
];
const secondary = [
  { href: "/notes", label: "nav.notes", icon: StickyNote },
  { href: "/goals", label: "nav.goals", icon: Target },
  { href: "/stats", label: "nav.stats", icon: BarChart3 },
  { href: "/settings", label: "nav.settings", icon: Settings },
];

function isActive(pathname: string, href: string) {
  if (href !== "/subjects") return pathname === href || (href !== "/" && pathname.startsWith(href));
  return pathname === "/subjects" || pathname.startsWith("/subjects") || pathname.startsWith("/flashcards") || pathname.startsWith("/bundles");
}

export function BottomNav() {
  const pathname = usePathname();
  const t = useT();
  const items = [...primary, ...secondary];

  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 flex h-16 items-stretch border-t border-border bg-bg pb-[env(safe-area-inset-bottom)] md:hidden">
      {items.map(({ href, label, icon: Icon }) => {
        const active = isActive(pathname, href);
        return (
          <Link
            key={href}
            href={href}
            aria-label={t(label)}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative flex min-w-0 flex-1 flex-col items-center justify-center gap-1 transition-colors duration-150",
              active ? "text-accent" : "text-muted-fg"
            )}
          >
            {active && (
              <motion.span
                layoutId="bottom-nav-pill"
                transition={{ type: "spring", stiffness: 500, damping: 40 }}
                className="absolute inset-x-4 top-1 h-0.5 rounded-full bg-accent"
              />
            )}
            <Icon size={20} aria-hidden />
            <span className="text-[10px] font-semibold tracking-tight">{t(label)}</span>
          </Link>
        );
      })}
      <Link
        href="/settings"
        aria-label="OpenStudy"
        className="flex w-12 items-center justify-center text-muted-fg"
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent text-accent-fg">
          <Sparkles size={14} aria-hidden />
        </span>
      </Link>
    </nav>
  );
}
