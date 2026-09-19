import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Menu, Upload } from "lucide-react";
import { useT } from "@/lib/i18n";
import { useAppStore } from "@/lib/store";
import { db } from "@/lib/db";
import { UniversalImportModal } from "@/components/universal-import-modal";

function greetingFor(h: number, t: (k: string) => string) {
  if (h < 5) return t("topbar.greeting.late");
  if (h < 12) return t("topbar.greeting.morning");
  if (h < 17) return t("topbar.greeting.afternoon");
  return t("topbar.greeting.evening");
}

export function TopBar({ dueCards }: { dueCards: number }) {
  const t = useT();
  const toggleSidebar = useAppStore((s) => s.toggleSidebar);
  const [now, setNow] = useState<Date | null>(null);
  const [q, setQ] = useState("");
  const router = useRouter();

  const [importModalOpen, setImportModalOpen] = useState(false);
  const [bundles, setBundles] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setNow(new Date()));
    const iv = setInterval(() => setNow(new Date()), 30_000);
    return () => {
      cancelAnimationFrame(raf);
      clearInterval(iv);
    };
  }, []);

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

  const handleOpenImport = async () => {
    const bs = await db.bundles.toArray();
    setBundles(bs.map((b) => ({ id: b.id, name: b.name })));
    setImportModalOpen(true);
  };

  return (
    <div className="mb-8 flex flex-wrap items-center gap-4">
      <button
        onClick={toggleSidebar}
        aria-label={t("ui.open_sidebar")}
        className="flex h-9 w-9 items-center justify-center rounded-lg border border-border text-muted-fg transition-colors hover:bg-surface-hover hover:text-fg md:hidden"
      >
        <Menu size={16} />
      </button>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-fg/70">
          {now
            ? now.toLocaleDateString("en-US", {
                weekday: "long",
                month: "short",
                day: "numeric",
                year: "numeric",
              })
            : "\u00a0"}
        </p>
        <h1 className="truncate text-2xl font-bold tracking-tight text-fg lg:text-3xl">
          {now ? `${greetingFor(now.getHours(), t)}, ${t("topbar.learner")}` : t("topbar.welcomeBack")}
          {dueCards > 0 && (
            <span className="ms-3 inline-flex items-center rounded-full bg-primary-container/15 px-3 py-0.5 align-middle text-xs font-bold uppercase tracking-widest text-primary">
              {dueCards} {t("topbar.due")}
            </span>
          )}
        </h1>
      </div>

      <button
        onClick={handleOpenImport}
        title="Universal Importer & Vault Backup"
        className="flex h-10 items-center gap-2 rounded-full border border-border bg-bg px-3.5 text-xs font-bold uppercase tracking-widest text-muted-fg transition-colors hover:border-primary hover:text-primary hover:bg-primary-container/15"
      >
        <Upload size={14} />
        Import / Backup
      </button>

      <label className="glass-inset relative hidden h-10 w-full max-w-md items-center rounded-lg sm:flex lg:w-80">
        <Search size={15} aria-hidden className="absolute start-3.5 text-muted-fg" />
        <input
          id="global-search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && q.trim()) {
              router.push(`/subjects?q=${encodeURIComponent(q.trim())}`);
            }
          }}
          placeholder={t("topbar.search")}
          aria-label={t("topbar.search")}
          className="w-full bg-transparent ps-10 pe-4 text-sm text-fg placeholder:text-muted-fg/60 outline-none"
        />
      </label>

      {importModalOpen && (
        <UniversalImportModal
          bundles={bundles}
          onClose={() => setImportModalOpen(false)}
          onImportComplete={() => router.refresh()}
        />
      )}
    </div>
  );
}
