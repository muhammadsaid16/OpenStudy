import Link from "next/link";

export const metadata = { title: "Offline — OpenStudy" };

/* Static offline fallback served by the service worker when a page
   isn't cached yet. Themed via data-theme tokens, no JS needed. */
export default function OfflinePage() {
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center p-8 text-center">
      <div className="mb-6 rounded-2xl border border-border bg-bg px-6 py-3">
        <span className="text-4xl lg:text-6xl font-black tracking-tighter text-fg">
          OFFLINE
        </span>
      </div>
      <p className="max-w-md text-sm uppercase tracking-widest text-muted-fg">
        You&apos;re offline and this page isn&apos;t cached yet. Your saved
        cards &amp; notes are safe in this device&apos;s local storage —
        previously visited pages still work.
      </p>
      <Link
        href="/"
        className="mt-8 inline-block bg-accent px-6 py-3 text-sm font-bold uppercase tracking-widest text-accent-text transition-transform hover:scale-105"
      >
        GO HOME
      </Link>
    </div>
  );
}
