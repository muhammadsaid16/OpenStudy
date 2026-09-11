"use client";

import { useT } from "@/lib/i18n";

// ─── Flashcards — BROWSE / LEECHES / STATS modes ─────────────────
// Extracted from the monolith (browse ~1172-1380, leeches ~1383-1418,
// stats ~1421-1472). Pure view components; state stays in the parent.

import {
  Search, CheckSquare, Square, Trash2, Tag, ArrowRight, Pencil,
  AlertTriangle,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { Button, EmptyState, Skeleton } from "@/components/ui";
import { cn } from "@/lib/utils";
import { spotlightProps } from "@/lib/interactions";
import { Markdown } from "@/components/markdown";

export interface BrowseCard {
  id: string;
  front: string;
  back: string;
  frontDescription?: string | null;
  backDescription?: string | null;
  description?: string | null;
  choices?: string[] | null;
  tags?: { tag: { id: string; name: string } }[] | null;
  bundle?: { id: string; name: string; color?: string | null } | null;
  topic?: { name: string; subject?: { name?: string } | null } | null;
  reviewCount: number;
  nextReview: Date | string;
}

export interface BundleLike {
  id: string;
  name: string;
  description?: string | null;
  color?: string | null;
  _count: { flashcards: number };
}

// ─── BROWSE ────────────────────────────────────────────────────────
export interface BrowseModeProps<C extends BrowseCard> {
  browseScope: "cards" | "bundles";
  onScopeChange: (s: "cards" | "bundles") => void;
  browseQuery: string;
  onQueryChange: (q: string) => void;
  browseLoaded: boolean;
  browseFilteredCards: C[];
  bundles: BundleLike[];
  browseSelected: Set<string>;
  browseFlipped: Set<string>;
  allBrowseSelected: boolean;
  nowMs: number;
  onSelectToggle: (id: string) => void;
  onSelectAllToggle: () => void;
  onFlipToggle: (id: string) => void;
  onOpenBundle: (id: string) => void;
  onEditCard: (card: C) => void;
  onDeleteCard: (card: C) => void;
  onBatchDelete: () => void;
  onBatchTag: () => void;
  onBatchMove: () => void;
  cardKindOf: (c: C) => string;
}

export function BrowseMode<C extends BrowseCard>(p: BrowseModeProps<C>) {
  const t = useT();
  const router = useRouter();
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search size={16} className="absolute start-3 top-1/2 -translate-y-1/2 text-muted-fg" />
          <input
            placeholder={p.browseScope === "bundles" ? "Search bundles..." : "Search all cards..."}
            value={p.browseQuery}
            onChange={(e) => p.onQueryChange(e.target.value)}
            className="h-10 w-full rounded-xl border border-border bg-bg ps-10 pe-3 text-sm font-medium tracking-tight text-fg placeholder:text-muted-fg/60 focus:outline-none"
          />
        </div>
        <select
          value={p.browseScope}
          onChange={(e) => p.onScopeChange(e.target.value as "cards" | "bundles")}
          aria-label="Search scope: cards or bundles"
          className="h-10 rounded-xl border border-border bg-bg px-3 text-xs text-fg focus:outline-none"
        >
          <option value="cards" className="bg-bg text-fg">{t("browse.searchCards")}</option>
          <option value="bundles" className="bg-bg text-fg">{t("browse.searchBundles")}</option>
        </select>
      </div>

      {/* Batch toolbar */}
      {p.browseScope === "cards" && p.browseLoaded && p.browseFilteredCards.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-bg p-3">
          <button
            onClick={p.onSelectAllToggle}
            className="flex items-center gap-2 rounded-full border border-border px-3 py-1.5 text-xs font-bold uppercase tracking-widest transition-colors hover:border-accent"
          >
            {p.allBrowseSelected ? <CheckSquare size={14} /> : <Square size={14} />}
            {p.allBrowseSelected ? "Deselect all" : "Select all"}
          </button>
          {p.browseSelected.size > 0 && (
            <>
              <span className="text-xs font-bold uppercase tracking-widest text-accent">
                {p.browseSelected.size} selected
              </span>
              <button
                onClick={p.onBatchDelete}
                className="flex items-center gap-2 rounded-full border border-danger px-3 py-1.5 text-xs font-bold uppercase tracking-widest text-danger transition-colors hover:bg-danger hover:text-on-color"
              >
                <Trash2 size={14} /> Delete
              </button>
              <button
                onClick={p.onBatchTag}
                className="flex items-center gap-2 rounded-full border border-border px-3 py-1.5 text-xs font-bold uppercase tracking-widest transition-colors hover:border-accent hover:text-accent hover:bg-accent-soft"
              >
                <Tag size={14} /> Tag
              </button>
              <button
                onClick={p.onBatchMove}
                className="flex items-center gap-2 rounded-full border border-border px-3 py-1.5 text-xs font-bold uppercase tracking-widest transition-colors hover:border-accent hover:text-accent hover:bg-accent-soft"
              >
                <ArrowRight size={14} /> Move
              </button>
            </>
          )}
        </div>
      )}

      {!p.browseLoaded ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-48 w-full" />
          ))}
        </div>
      ) : p.browseScope === "bundles" ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {p.bundles.map((bundle) => (
            <button
              key={bundle.id}
              onClick={() => p.onOpenBundle(bundle.id)}
              {...spotlightProps()}
              className="spotlight-card group relative flex h-48 w-full flex-col justify-between rounded-2xl glass p-5 text-start transition-all duration-200 hover:-translate-y-0.5"
              style={{ backgroundImage: `radial-gradient(140% 120% at 0% 0%, ${(bundle.color || "#DFE104")}14, transparent 55%)` }}
            >
              <div
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-lg font-black transition-transform duration-200 group-hover:scale-110"
                style={{
                  backgroundColor: `${bundle.color || "#DFE104"}1f`,
                  color: bundle.color || "#DFE104",
                  boxShadow: `inset 0 0 0 1px ${(bundle.color || "#DFE104")}3d`,
                }}
              >
                {bundle.name.charAt(0)}
              </div>
              <div className="mt-3 min-w-0">
                <h3 className="truncate text-lg font-bold text-fg transition-colors group-hover:text-accent">
                  {bundle.name}
                </h3>
                {bundle.description && (
                  <p className="mt-1 line-clamp-2 text-xs text-muted-fg">{bundle.description}</p>
                )}
              </div>
              <div className="flex items-center justify-between">
                <span
                  className="rounded-full px-2.5 py-1 font-mono text-xs"
                  style={{ backgroundColor: `${bundle.color || "#DFE104"}14`, color: bundle.color || "#DFE104" }}
                >
                  {bundle._count.flashcards} card{bundle._count.flashcards !== 1 ? "s" : ""}
                </span>
                <span className="text-xs font-bold text-accent group-hover:underline">Open →</span>
              </div>
            </button>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {p.browseFilteredCards.map((card) => {
            const flipped = p.browseFlipped.has(card.id);
            const selected = p.browseSelected.has(card.id);
            return (
              <div
                key={card.id}
                className={cn(
                  "group relative flex min-h-[200px] flex-col overflow-hidden rounded-2xl border p-5 transition-all duration-200",
                  selected
                    ? "border-accent bg-accent/5"
                    : flipped
                      ? "border-accent bg-accent text-accent-fg shadow-[0_14px_40px_-12px_var(--color-accent-soft)] -translate-y-0.5"
                      : "border-border bg-bg shadow-sm hover:-translate-y-1 hover:border-accent hover:shadow-lg"
                )}
              >
                <div className="mb-3 flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={(e) => { e.stopPropagation(); p.onSelectToggle(card.id); }}
                      className="rounded-full text-muted-fg transition-colors hover:text-accent"
                      aria-label={selected ? "Deselect card" : "Select card"}
                    >
                      {selected ? <CheckSquare size={14} className="text-accent" /> : <Square size={14} />}
                    </button>

                  </div>
                  <div className="flex gap-1">
                    <button
                      onClick={(e) => { e.stopPropagation(); p.onEditCard(card); }}
                      aria-label={t("browse.editCard")}
                      title="Edit"
                      className={cn("rounded-full p-1.5 transition-colors", flipped ? "text-accent-fg/70 hover:bg-accent-fg/15 hover:text-accent-fg" : "text-muted-fg hover:bg-accent-soft hover:text-accent")}
                    >
                      <Pencil size={13} />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); p.onDeleteCard(card); }}
                      aria-label={t("browse.deleteCard")}
                      title="Delete"
                      className={cn("rounded-full p-1.5 transition-colors", flipped ? "text-accent-fg/70 hover:bg-accent-fg/15 hover:text-accent-fg" : "text-muted-fg hover:bg-danger/10 hover:text-danger")}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
                <div
                  className="flex flex-1 cursor-pointer items-center justify-center text-center"
                  onClick={() => p.onFlipToggle(card.id)}
                >
                  <div>
                    <span className={cn("mb-2 inline-block text-[10px] font-bold uppercase tracking-widest", flipped ? "text-accent-fg/70" : "text-muted-fg")}>
                      {flipped ? "Answer" : "Question"}
                    </span>
                    <div className="text-center text-lg font-bold tracking-tight leading-relaxed">
                      {flipped ? <Markdown content={card.back} align="center" /> : card.front}
                    </div>
                  </div>
                </div>
                {((flipped ? ((card as any).backDescription ?? card.description) : (card as any).frontDescription) && (
                  <p className={cn("mt-2 text-xs leading-relaxed tracking-tight", flipped ? "text-accent-fg/70" : "text-muted-fg")}>
                    {flipped ? ((card as any).backDescription ?? card.description) : (card as any).frontDescription}
                  </p>
                ))}
                {card.tags && card.tags.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {card.tags.map(({ tag }) => (
                      <span key={tag.id} className={cn("px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-widest", flipped ? "bg-accent-fg/15 text-accent-fg" : "bg-muted text-muted-fg")}>
                        {tag.name}
                      </span>
                    ))}
                  </div>
                )}
                <div className={cn("mt-2 flex items-center justify-between text-[10px] uppercase tracking-widest", flipped ? "text-accent-fg/60" : "text-muted-fg")}>
                  {card.bundle ? (
                    <span className="flex items-center gap-1">
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: card.bundle.color ?? undefined }} />
                      {card.bundle.name}
                    </span>
                  ) : card.topic ? (
                    <span>{card.topic.subject?.name ?? "General"} › {card.topic.name}</span>
                  ) : <span />}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── LEECHES ───────────────────────────────────────────────────────
export interface LeechCard {
  id: string;
  front: string;
  consecutiveAgain?: number;
  bundle?: { name?: string } | null;
}

export interface LeechesModeProps {
  leechLoaded: boolean;
  leechCards: LeechCard[];
  onUnleech: (id: string) => void;
}

export function LeechesMode(p: LeechesModeProps) {
  const t = useT();
  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-danger/40 bg-danger/5 p-4">
        <p className="text-sm font-bold uppercase tracking-widest text-danger">
          <AlertTriangle size={14} className="me-2 inline" />
          Leech protection
        </p>
        <p className="mt-1 text-xs text-muted-fg uppercase tracking-widest">
          Cards with 5+ consecutive &quot;again&quot; answers are flagged here. Consider rewriting, splitting, or adding hints.
        </p>
      </div>
      {!p.leechLoaded ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
        </div>
      ) : p.leechCards.length === 0 ? (
        <EmptyState icon={<AlertTriangle size={48} />} title="No leeches" description="No cards have been flagged yet. Keep studying!" />
      ) : (
        <div className="space-y-3">
          {p.leechCards.map((card) => (
            <div key={card.id} className="glass flex items-center justify-between gap-3 rounded-2xl p-4">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold tracking-tight">{card.front}</p>
                <p className="mt-0.5 text-xs text-muted-fg uppercase tracking-widest">
                  {card.bundle?.name ?? "No bundle"} • {card.consecutiveAgain}× again
                </p>
              </div>
              <Button size="sm" variant="secondary" onClick={() => p.onUnleech(card.id)}>
                Un-leech
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── STATS ─────────────────────────────────────────────────────────
export interface HeatEntry { date: string; count: number }

export interface StatsModeProps {
  streak: number;
  reviewsToday: number;
  leechCount: number;
  heatmap: HeatEntry[];
}

export function StatsMode(p: StatsModeProps) {
  return (
    <div className="space-y-8">
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-2xl border border-border bg-bg p-6 text-center">
          <p className="text-4xl font-bold tracking-tighter text-accent">{p.streak}</p>
          <p className="mt-2 text-xs font-bold uppercase tracking-widest text-muted-fg">Day streak</p>
        </div>
        <div className="rounded-2xl border border-border bg-bg p-6 text-center">
          <p className="text-4xl font-bold tracking-tighter">{p.reviewsToday}</p>
          <p className="mt-2 text-xs font-bold uppercase tracking-widest text-muted-fg">Reviews today</p>
        </div>
        <div className="rounded-2xl border border-border bg-bg p-6 text-center">
          <p className="text-4xl font-bold tracking-tighter text-success">{p.leechCount}</p>
          <p className="mt-2 text-xs font-bold uppercase tracking-widest text-muted-fg">{t("common.leeches")}</p>
        </div>
      </div>

      <div>
        <h3 className="mb-4 text-lg font-bold tracking-tighter">Activity (last 90 days)</h3>
        <div className="flex flex-wrap gap-1">
          {Array.from({ length: 90 }).map((_, i) => {
            const d = new Date();
            d.setDate(d.getDate() - (89 - i));
            const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
            const entry = p.heatmap.find((h) => h.date === dateStr);
            const count = entry?.count ?? 0;
            const intensity = count === 0 ? "bg-muted" : count < 5 ? "bg-accent/30" : count < 15 ? "bg-accent/60" : "bg-accent";
            return (
              <div key={i} className={`h-3 w-3 ${intensity}`} title={`${dateStr}: ${count} reviews`} />
            );
          })}
        </div>
        <div className="mt-2 flex items-center gap-2 text-[10px] text-muted-fg">
          <span>LESS</span>
          <div className="h-3 w-3 bg-muted" />
          <div className="h-3 w-3 bg-accent/30" />
          <div className="h-3 w-3 bg-accent/60" />
          <div className="h-3 w-3 bg-accent" />
          <span>MORE</span>
        </div>
      </div>
    </div>
  );
}