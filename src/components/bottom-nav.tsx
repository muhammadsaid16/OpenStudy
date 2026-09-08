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
  BarChart3,
  Settings,
} from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/", label: "HOME", icon: LayoutDashboard },
  { href: "/subjects", label: "SUBJECTS", icon: BookOpen },
  { href: "/flashcards", label: "CARDS", icon: Brain },
  { href: "/notes", label: "NOTES", icon: StickyNote },
  { href: "/sessions", label: "SESSIONS", icon: Timer },
  { href: "/stats", label: "STATS", icon: BarChart3 },
  { href: "/settings", label: "MORE", icon: Settings },
];

// Mobile-only bottom navigation. Hidden on md+ (desktop uses Sidebar).
// Active indicator is a framer-motion shared-layout pill: it physically
// slides between tabs on navigation (spring, reduced-motion safe via the
// app-wide prefers-reduced-motion CSS override).
export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 flex h-16 border-t-2 border-border bg-bg md:hidden pb-[env(safe-area-inset-bottom)]">
      {navItems.map(({ href, label, icon: Icon }) => {
        const isActive =
          pathname === href || (href !== "/" && pathname.startsWith(href));
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              "relative flex flex-1 flex-col items-center justify-center gap-1 transition-colors duration-200",
              isActive ? "text-accent" : "text-muted-fg"
            )}
          >
            {isActive && (
              <motion.span
                layoutId="bottom-nav-pill"
                transition={{ type: "spring", stiffness: 500, damping: 40 }}
                className="absolute inset-x-3 top-[-2px] h-0.5 rounded-full bg-accent shadow-[0_0_10px_currentColor]"
              />
            )}
            <Icon size={20} />
            <span className="text-[10px] font-bold uppercase tracking-widest">
              {label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
