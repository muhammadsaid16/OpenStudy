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
  BarChart3,
  Settings,
} from "lucide-react";
import { cn } from "@/lib/utils";

// All 8 primary routes — parity with the desktop Sidebar. Inactive tabs
// are icon-only (with aria-labels) so 8 destinations fit a 360px viewport;
// the active tab grows to reveal its label.
const navItems = [
  { href: "/", label: "Home", icon: LayoutDashboard },
  { href: "/subjects", label: "Subjects", icon: BookOpen },
  { href: "/flashcards", label: "Cards", icon: Brain },
  { href: "/notes", label: "Notes", icon: StickyNote },
  { href: "/sessions", label: "Sessions", icon: Timer },
  { href: "/goals", label: "Goals", icon: Target },
  { href: "/stats", label: "Stats", icon: BarChart3 },
  { href: "/settings", label: "Settings", icon: Settings },
];

// Mobile-only bottom navigation. Hidden on md+ (desktop uses Sidebar).
// Active indicator is a framer-motion shared-layout pill: it physically
// slides between tabs on navigation (spring, reduced-motion safe via the
// app-wide prefers-reduced-motion CSS override).
export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 flex h-16 border-t border-border bg-bg md:hidden pb-[env(safe-area-inset-bottom)]">
      {navItems.map(({ href, label, icon: Icon }) => {
        const isActive =
          pathname === href || (href !== "/" && pathname.startsWith(href));
        return (
          <Link
            key={href}
            href={href}
            aria-label={label}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "relative flex min-w-0 flex-col items-center justify-center gap-1 transition-all duration-200",
              isActive ? "flex-[1.8] text-accent" : "flex-1 text-muted-fg"
            )}
          >
            {isActive && (
              <motion.span
                layoutId="bottom-nav-pill"
                transition={{ type: "spring", stiffness: 500, damping: 40 }}
                className="absolute inset-x-3 top-[-2px] h-0.5 rounded-full bg-accent shadow-[0_0_10px_currentColor]"
              />
            )}
            <Icon size={20} aria-hidden />
            {isActive && (
              <span className="whitespace-nowrap text-[10px] font-bold uppercase tracking-widest">
                {label}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
