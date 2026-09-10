import { Skeleton } from "@/components/ui";
import { cn } from "@/lib/utils";

/* ─── Full-page themed loader ─────────────────────────────────────
   Rendered by every route's loading.tsx. Pure server component —
   theming comes from CSS variables on [data-theme], which the
   no-flash <head> script sets before hydration, so the loader is
   already in the right theme the instant it paints. */

export type LoaderVariant =
  | "generic"   // root fallback — branded full-page loader, route-agnostic
  | "dashboard"
  | "grid"      // subjects, notes
  | "grid4"     // bundles
  | "flashcards"
  | "sessions"
  | "settings"
  | "kanban"    // goals
  | "cards"     // bundles/[id]/cards
  | "stats";    // stats

function LoaderBar({ label }: { label: string }) {
  // Spec (global): loading labels are implementation-style text —
  // "LOADING DASHBOARD_" exposed internals. Skeletons stay visual only;
  // a visually-hidden status keeps screen readers informed.
  return (
    <div className="mb-10" role="status" aria-label={`Loading ${label}`}>
      <span className="sr-only" aria-hidden={false}>
        Loading {label}…
      </span>
      <div className="mb-3 flex items-center justify-between">
        <p className="font-mono text-xs font-bold uppercase tracking-widest text-accent">
          {label.toUpperCase()}
        </p>
        <p className="font-mono text-xs uppercase tracking-widest text-muted-fg">
          OPENSTUDY
        </p>
      </div>
      <div className="relative h-0.5 w-full overflow-hidden bg-border">
        <div className="animate-loader absolute inset-y-0 w-1/4 bg-accent" />
      </div>
    </div>
  );
}

function HeaderRow({ titleW = "w-48" }: { titleW?: string }) {
  return (
    <div className="mb-10 flex flex-wrap items-center justify-between gap-4">
      <div>
        <Skeleton className={cn("h-10", titleW)} />
        <Skeleton className="mt-3 h-3 w-64" />
      </div>
      <Skeleton className="h-10 w-36" />
    </div>
  );
}

/* ─── Variant bodies (mirror each page's real layout) ──────────── */

function GenericBody() {
  /* Route-agnostic full-page loader: big wordmark + subtitle +
     generic content blocks. Used by the ROOT loading.tsx, which is
     the outermost Suspense boundary and therefore streams as the
     fallback for EVERY cold load — it must not claim to be any
     specific page. */
  return (
    <>
      <div className="mb-12">
        <Skeleton className="h-14 w-72 lg:h-20 lg:w-[28rem]" />
        <Skeleton className="mt-4 h-3 w-64" />
      </div>
      <div className="mb-12 grid grid-cols-2 gap-px bg-border lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-border bg-bg py-12"
          >
            <Skeleton className="h-8 w-8" />
            <Skeleton className="h-10 w-20" />
            <Skeleton className="h-3 w-24" />
          </div>
        ))}
      </div>
      <div className="divide-y divide-border rounded-2xl border border-border">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex items-center justify-between p-6">
            <div className="space-y-2">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-3 w-24" />
            </div>
            <Skeleton className="h-6 w-20" />
          </div>
        ))}
      </div>
    </>
  );
}

function DashboardBody() {
  return (
    <>
      {/* stats marquee strip */}
      <div className="mb-12 flex items-center gap-8 overflow-hidden border-y-2 border-border py-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex shrink-0 items-center gap-4">
            <Skeleton className="h-6 w-6" />
            <Skeleton className="h-10 w-16" />
            <Skeleton className="h-3 w-20" />
          </div>
        ))}
      </div>
      {/* stats grid */}
      <div className="mb-12 grid grid-cols-2 gap-px bg-border lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="flex flex-col items-center justify-center rounded-2xl border border-border bg-bg py-12"
          >
            <Skeleton className="mb-4 h-6 w-6" />
            <Skeleton className="h-12 w-20" />
            <Skeleton className="mt-3 h-3 w-24" />
          </div>
        ))}
      </div>
      {/* quick access shelf */}
      <Skeleton className="mb-6 h-7 w-40" />
      <div className="mb-12 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-40 w-full" />
        ))}
      </div>
      {/* recent sessions */}
      <Skeleton className="mb-6 h-7 w-48" />
      <div className="divide-y divide-border rounded-2xl border border-border">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex items-center justify-between p-6">
            <div className="flex items-center gap-4">
              <Skeleton className="h-3 w-3" />
              <div className="space-y-2">
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-3 w-24" />
              </div>
            </div>
            <Skeleton className="h-6 w-20" />
          </div>
        ))}
      </div>
    </>
  );
}

function GridBody({ cols4 = false }: { cols4?: boolean }) {
  return (
    <div
      className={cn(
        "grid gap-px bg-border",
        cols4
          ? "grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4"
          : "md:grid-cols-2 lg:grid-cols-3"
      )}
    >
      {Array.from({ length: cols4 ? 8 : 6 }).map((_, i) => (
        <div
          key={i}
          className={cn(
            cols4
              ? "flex h-48 flex-col justify-between border border-border bg-muted p-5"
              : "rounded-2xl border border-border bg-bg p-6"
          )}
        >
          {cols4 ? (
            <>
              <Skeleton className="h-10 w-10" />
              <div className="space-y-2">
                <Skeleton className="h-5 w-32" />
                <Skeleton className="h-3 w-20" />
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center gap-4">
                <Skeleton className="h-16 w-16" />
                <div className="space-y-2">
                  <Skeleton className="h-5 w-32" />
                  <Skeleton className="h-3 w-20" />
                </div>
              </div>
              <div className="mt-6 flex gap-6">
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-3 w-16" />
              </div>
            </>
          )}
        </div>
      ))}
    </div>
  );
}

function FlashcardsBody() {
  return (
    <>
      {/* toolbar: bundle selector + add card */}
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Skeleton className="h-10 w-56" />
        <Skeleton className="h-10 w-28" />
      </div>
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Skeleton className="h-9 w-24" />
        <Skeleton className="h-9 w-24" />
        <Skeleton className="h-9 w-24" />
        <Skeleton className="h-9 w-24" />
      </div>
      {/* review card */}
      <Skeleton className="mb-4 h-1 w-full" />
      <Skeleton className="h-[300px] w-full" />
    </>
  );
}

function SessionsBody() {
  return (
    <>
      <div className="mb-12 grid grid-cols-1 gap-6 lg:grid-cols-5">
        {/* form panel */}
        <div className="space-y-4 rounded-2xl border border-border bg-bg p-6 lg:col-span-3">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-40" />
          <Skeleton className="h-12 w-full" />
        </div>
        {/* timer panel */}
        <div className="flex flex-col items-center justify-center gap-6 rounded-2xl border border-border bg-bg p-6 lg:col-span-2">
          <Skeleton className="h-16 w-40" />
          <Skeleton className="h-12 w-full" />
        </div>
      </div>
      {/* history */}
      <div className="divide-y divide-border rounded-2xl border border-border">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex items-center justify-between p-6">
            <div className="space-y-2">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-3 w-32" />
            </div>
            <Skeleton className="h-6 w-20" />
          </div>
        ))}
      </div>
    </>
  );
}

function SettingsBody() {
  return (
    <>
      {/* theme swatches */}
      <Skeleton className="mb-4 h-5 w-24" />
      <div className="mb-12 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
      {/* toggles */}
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center justify-between rounded-2xl border border-border bg-bg p-5"
          >
            <div className="space-y-2">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-64" />
            </div>
            <Skeleton className="h-6 w-11" />
          </div>
        ))}
      </div>
    </>
  );
}

function StatsBody() {
  return (
    <>
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="glass rounded-2xl p-4">
            <Skeleton className="h-2.5 w-16" />
            <Skeleton className="mt-2 h-8 w-12" />
            <Skeleton className="mt-1 h-3 w-20" />
          </div>
        ))}
      </div>
      <div className="mb-6 flex gap-2">
        <Skeleton className="h-8 w-24 rounded-full" />
        <Skeleton className="h-8 w-24 rounded-full" />
        <Skeleton className="h-8 w-24 rounded-full" />
      </div>
      <div className="glass rounded-2xl p-6">
        <Skeleton className="mb-4 h-4 w-32" />
        <div className="grid grid-cols-7 gap-1">
          {Array.from({ length: 35 }).map((_, i) => (
            <Skeleton key={i} className="h-6 w-full rounded-md" />
          ))}
        </div>
      </div>
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <div className="glass rounded-2xl p-6">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="mt-4 h-40 w-full" />
        </div>
        <div className="glass rounded-2xl p-6">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="mt-4 h-40 w-full" />
        </div>
      </div>
    </>
  );
}

function CardsBody() {
  return (
    <>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Skeleton className="h-10 w-10" />
          <Skeleton className="h-6 w-48" />
        </div>
        <Skeleton className="h-10 w-28" />
      </div>
      <div className="divide-y divide-border rounded-2xl border border-border">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center justify-between p-5">
            <div className="space-y-2">
              <Skeleton className="h-4 w-64" />
              <Skeleton className="h-3 w-40" />
            </div>
            <div className="flex gap-2">
              <Skeleton className="h-9 w-9" />
              <Skeleton className="h-9 w-9" />
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

/* ─── Public component ─────────────────────────────────────────── */

function KanbanBody() {
  /* Mirrors /goals: stats row + 3 kanban columns with card blocks. */
  const colHeights = [3, 2, 1];
  return (
    <>
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="glass rounded-2xl p-4">
            <Skeleton className="h-2.5 w-12" />
            <Skeleton className="mt-2 h-8 w-10" />
          </div>
        ))}
      </div>
      <div className="mb-6 flex items-center justify-between">
        <Skeleton className="h-9 w-56 rounded-full" />
        <Skeleton className="h-3 w-20" />
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {colHeights.map((n, ci) => (
          <div key={ci} className="glass min-h-[200px] rounded-2xl p-3">
            <div className="mb-3 flex items-center gap-2 px-1">
              <Skeleton className="h-2 w-2 rounded-full" />
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-4 w-6 rounded-full" />
            </div>
            <div className="space-y-2">
              {Array.from({ length: n }).map((_, i) => (
                <div key={i} className="rounded-2xl border border-border p-4">
                  <Skeleton className="h-3 w-16 rounded-full" />
                  <Skeleton className="mt-2 h-4 w-3/4" />
                  <Skeleton className="mt-2 h-3 w-1/2" />
                  <Skeleton className="mt-3 h-1 w-full rounded-full" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

const LABELS: Record<LoaderVariant, string> = {
  generic: "OpenStudy",
  dashboard: "Dashboard",
  grid: "Page",
  grid4: "Bundles",
  flashcards: "Flashcards",
  sessions: "Sessions",
  settings: "Settings",
  kanban: "Goals",
  cards: "Cards",
  stats: "Stats",
};

export function PageLoader({
  variant,
  titleW,
  testId,
}: {
  variant: LoaderVariant;
  titleW?: string;
  testId?: string;
}) {
  return (
    <div className="rise-in p-8 lg:p-12" data-loader={testId}>
      <LoaderBar label={LABELS[variant]} />
      {variant !== "generic" && <HeaderRow titleW={titleW} />}
      {variant === "generic" && <GenericBody />}
      {variant === "dashboard" && <DashboardBody />}
      {variant === "grid" && <GridBody />}
      {variant === "grid4" && <GridBody cols4 />}
      {variant === "flashcards" && <FlashcardsBody />}
      {variant === "sessions" && <SessionsBody />}
      {variant === "settings" && <SettingsBody />}
      {variant === "kanban" && <KanbanBody />}
      {variant === "cards" && <CardsBody />}
      {variant === "stats" && <StatsBody />}
    </div>
  );
}
