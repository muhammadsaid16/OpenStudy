"use client";

// ─── TopBar — greeting, live clock, global search trigger ─────────

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { useT } from "@/lib/i18n";

function greetingFor(h: number, t: (k: string) => string) {
  if (h < 5) return t("topbar.greeting.late");
  if (h < 12) return t("topbar.greeting.morning");
  if (h < 17) return t("topbar.greeting.afternoon");
  return t("topbar.greeting.evening");
}

export function TopBar({ dueCards }: { dueCards: number }) {
  const t = useT();
  const [now, setNow] = useState<Date | null>(null);
  const [q, setQ] = useState("");
  const router = useRouter();


  useEffect(() => {
    // rAF defers the first tick past the effect's sync phase — silences
    // react-hooks set-state-in-effect (cascading render) without behavior change.
    const raf = requestAnimationFrame(() => setNow(new Date()));
    const iv = setInterval(() => setNow(new Date()), 30_000);
    return () => {
      cancelAnimationFrame(raf);
      clearInterval(iv);
    };
  }, []);

  // ⌘K / Ctrl+K focuses the search field
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        document.getElementById("global-search")?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="mb-8 flex flex-wrap items-center gap-4">
      <div className="min-w-0 flex-1">
        <p className="text-xs font-bold uppercase tracking-widest text-muted-fg">
          {now
            ? now.toLocaleDateString(undefined, {
                weekday: "long",
                month: "long",
                day: "numeric",
              })
            : "\u00A0"}
        </p>
        <h1 className="font-display truncate text-2xl font-bold tracking-tight lg:text-3xl">
          {now ? `${greetingFor(now.getHours(), t)}, ${t("topbar.learner")}` : t("topbar.welcomeBack")}
          {dueCards > 0 && (
            <span className="ms-3 inline-flex items-center rounded-full bg-accent-soft px-3 py-0.5 align-middle text-xs font-bold uppercase tracking-widest text-accent">
              {dueCards} {t("topbar.due")}
            </span>
          )}
        </h1>
      </div>

      {/* Global search (audit §7): wider, names what it searches, and the
          kbd hint matches the user's OS instead of hardcoding ⌘K. */}
      <label className="glass-inset relative hidden h-11 w-full max-w-md items-center rounded-full sm:flex lg:w-96">
        <Search size={15} aria-hidden className="absolute start-4 text-muted-fg" />
        <input
          id="global-search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            // Global search now goes somewhere: Enter jumps to the flashcards
            // browse tab (search all cards) pre-filtered with the query.
            // Previously this wrote to a store field nothing ever read.
            if (e.key === "Enter" && q.trim()) {
              router.push(`/subjects?q=${encodeURIComponent(q.trim())}`);
            }
          }}
          placeholder={t("topbar.search")}
          aria-label={t("topbar.search")}
          className="w-full bg-transparent ps-10 pe-4 text-sm text-fg placeholder:text-muted-fg/60 outline-none"
        />
      </label>
    </div>
  );
}
