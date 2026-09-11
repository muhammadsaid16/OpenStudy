"use client";

// Offline fallback (served by the SW when a page isn't cached).
// Client component so it localizes; the SW serves the cached shell so
// the store/hook are available.

import Link from "next/link";
import { WifiOff } from "lucide-react";
import { useT } from "@/lib/i18n";

export default function OfflinePage() {
  const t = useT();
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center p-8 text-center">
      <div className="mb-6 rounded-2xl border border-border bg-bg px-6 py-3">
        <span className="text-4xl lg:text-6xl font-black tracking-tighter text-fg">
          {t("offline.badge")}
        </span>
      </div>
      <p className="max-w-md text-sm uppercase tracking-widest text-muted-fg">
        {t("offline.body")}
      </p>
      <Link
        href="/"
        className="mt-8 inline-block bg-accent px-6 py-3 text-sm font-bold uppercase tracking-widest text-accent-fg transition-transform hover:scale-105"
      >
        {t("offline.goHome")}
      </Link>
    </div>
  );
}
