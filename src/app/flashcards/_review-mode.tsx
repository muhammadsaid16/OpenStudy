"use client";

// ─── Flashcards — REVIEW mode ────────────────────────────────────
// Extracted from the 1,683-line monolith (lines ~847-1169). Renders:
// bundle overview, session run (flip card, MCQ, sprint, ratings),
// completion screen. All state stays in the parent; this is pure view.

import { Layers, Plus, Brain, Zap, Timer, BadgeCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button, EmptyState, Badge, Skeleton } from "@/components/ui";
import { cn } from "@/lib/utils";
import { spotlightProps } from "@/lib/interactions";
import { Markdown } from "@/components/markdown";
import { Volume2, VolumeX } from "lucide-react";
import { getCardStatus, RATING_BUTTONS, type CardStatusLike } from "@/lib/card-status";

export interface ReviewCard {
  id: string;
  front: string;
  back: string;
  description?: string | null;
  choices?: string[] | null;
  topic?: { name: string; subject?: { name?: string } | null } | null;
  reviewCount: number;
  nextReview: Date | string;
}

export interface ReviewModeProps<C extends ReviewCard> {
  // context
  selectedBundle: string;
  allDue: boolean;
  topicParam: string | null;
  bundles: { id: string; name: string; description?: string | null; color?: string | null; _count: { flashcards: number } }[];
  loaded: boolean;
  // queue state
  totalDue: number;
  completedCount: number;
  totalReviewed: number;
  learningQueueLength: number;
  activeCard: C | null;
  isFlipped: boolean;
  pickedChoice: string | null;
  sprintMode: boolean;
  sprintTimer: number;
  reviewing: boolean;
  nowMs: number;
  ttsSupported: boolean;
  speaking: boolean;
  // derived card helpers (kind logic lives in parent)
  cardKindOf: (c: C) => string;
  maskCloze: (s: string) => string;
  choiceOptions: string[];
  // callbacks
  onSelectBundle: (id: string) => void;
  onOpenCreate: () => void;
  onFlip: () => void;
  onFlipTo: (v: boolean) => void;
  onPickChoice: (opt: string) => void;
  onRate: (value: number) => void;
  onToggleSprint: () => void;
  onStudyAgain: () => void;
  onBackToBundles: () => void;
  onSpeak: (text: string) => void;
  onStopTts: () => void;
}

export function ReviewMode<C extends ReviewCard>(p: ReviewModeProps<C>) {
  // No bundle selected → overview grid
  if (!p.selectedBundle && !p.allDue && !p.topicParam) {
    return (
      <div className="space-y-8">
        <p className="text-sm text-muted-fg uppercase tracking-widest">
          SELECT A BUNDLE TO START REVIEWING
        </p>
        {p.bundles.length === 0 ? (
          <EmptyState
            icon={<Layers size={48} />}
            title="NO BUNDLES YET"
            description="CREATE YOUR FIRST BUNDLE TO ORGANIZE FLASHCARDS."
            action={
              <Button onClick={() => p.onOpenCreate()}>
                <Plus size={16} />
                CREATE BUNDLE
              </Button>
            }
          />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {p.bundles.map((bundle) => (
              <button
                key={bundle.id}
                onClick={() => p.onSelectBundle(bundle.id)}
                {...spotlightProps()}
                className="spotlight-card group relative flex h-48 w-full flex-col justify-between rounded-2xl border border-zinc-800 bg-zinc-900/80 p-5 transition-all duration-200 hover:-translate-y-0.5 hover:border-yellow-400/50 hover:bg-zinc-900 hover:shadow-[0_14px_35px_-15px_rgba(0,0,0,0.7)] text-left"
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
                  <h3 className="truncate text-lg font-bold text-white transition-colors group-hover:text-yellow-400">
                    {bundle.name}
                  </h3>
                  {bundle.description && (
                    <p className="mt-1 line-clamp-2 text-xs text-zinc-400">{bundle.description}</p>
                  )}
                </div>
                <div className="flex items-center justify-between">
                  <span
                    className="rounded-full px-2.5 py-1 font-mono text-xs"
                    style={{ backgroundColor: `${bundle.color || "#DFE104"}14`, color: bundle.color || "#DFE104" }}
                  >
                    {bundle._count.flashcards} CARD{bundle._count.flashcards !== 1 ? "S" : ""}
                  </span>
                  <span className="text-xs font-bold text-yellow-400 group-hover:underline">Open →</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (!p.loaded) {
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <Skeleton className="h-1 w-full" />
        <Skeleton className="h-[300px] w-full" />
      </div>
    );
  }

  if (p.totalDue === 0 && p.completedCount === 0) {
    return (
      <EmptyState
        icon={<Brain size={48} />}
        title="NO CARDS YET"
        description="CREATE YOUR FIRST FLASHCARD TO START STUDYING."
        action={
          <Button onClick={() => p.onOpenCreate()}>
            <Plus size={16} />
            CREATE FIRST CARD
          </Button>
        }
      />
    );
  }

  if (p.totalDue === 0 && p.completedCount > 0) {
    return (
      <div className="mx-auto max-w-2xl space-y-6 text-center">
        <div className="border-2 border-success bg-success/5 p-8">
          <Zap size={48} className="mx-auto mb-4 text-success" />
          <p className="text-2xl font-bold uppercase tracking-tight">SESSION COMPLETE!</p>
          <p className="mt-2 text-sm text-muted-fg uppercase tracking-widest">
            YOU REVIEWED {p.totalReviewed} CARD{p.totalReviewed !== 1 ? "S" : ""} THIS SESSION
          </p>
        </div>
        <div className="flex justify-center gap-4">
          <Button onClick={p.onStudyAgain}>STUDY AGAIN</Button>
          <Button variant="secondary" onClick={p.onBackToBundles}>
            BACK TO BUNDLES
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {/* Session stats bar */}
      <div className="flex items-center justify-between text-xs font-bold uppercase tracking-widest text-muted-fg">
        <span>{p.completedCount} REVIEWED • {p.totalReviewed} TOTAL</span>
        <div className="flex gap-3">
          {p.learningQueueLength > 0 && (
            <Badge variant="warning">RELEARNING × {p.learningQueueLength}</Badge>
          )}
          <Badge variant="success"><Zap size={12} className="mr-1" />{p.totalDue} IN QUEUE</Badge>
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-1 bg-muted">
        <div
          className="h-full bg-accent transition-all duration-500"
          style={{ width: `${(p.completedCount / Math.max(p.totalDue + p.completedCount, 1)) * 100}%` }}
        />
      </div>

      {/* Speed Sprint toggle */}
      <div className="flex items-center gap-4">
        <button
          onClick={p.onToggleSprint}
          className={cn(
            "flex items-center gap-2 border-2 px-3 py-1.5 text-xs font-bold uppercase tracking-widest transition-colors",
            p.sprintMode ? "border-accent bg-accent text-accent-fg" : "border-border text-muted-fg hover:border-fg"
          )}
        >
          <Timer size={14} />
          SPEED SPRINT
        </button>
        {p.sprintMode && p.isFlipped && (
          <div className="flex items-center gap-2">
            <div className="h-2 w-24 bg-muted">
              <div
                className="h-full bg-danger transition-all duration-1000"
                style={{ width: `${(p.sprintTimer / 5) * 100}%` }}
              />
            </div>
            <span className="text-xs font-bold text-danger">{p.sprintTimer}s</span>
          </div>
        )}
      </div>

      {/* 3D flip card */}
      {p.activeCard && (
        <div
          className="flip-scene w-full cursor-pointer select-none"
          onClick={() => !p.sprintMode && p.onFlip()}
          role="button"
          aria-label={p.isFlipped ? "Show question" : "Reveal answer"}
        >
          <div className="flip-card relative min-h-[440px] sm:min-h-[500px]" data-flipped={p.isFlipped}>
            {/* FRONT — QUESTION */}
            <div className="flip-face absolute inset-0 flex flex-col overflow-hidden rounded-2xl border-2 border-border bg-zinc-900/60 shadow-[0_18px_50px_-12px_rgba(0,0,0,0.8)]">
              <span className="absolute inset-x-6 top-0 h-0.5 bg-gradient-to-r from-transparent via-accent to-transparent" />
              <div className="flex items-center justify-between px-7 pt-5">
                <div className="flex items-center gap-2">
                  <Badge>QUESTION</Badge>
                  {p.activeCard && p.cardKindOf(p.activeCard) !== "basic" && p.activeCard && (
                    <Badge className="border-accent/50 bg-accent/10 text-accent">
                      {p.cardKindOf(p.activeCard).toUpperCase()}
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  {p.ttsSupported && p.activeCard && (
                    <button
                      type="button"
                      aria-label="Read question aloud"
                      onClick={(e) => {
                        e.stopPropagation();
                        e.currentTarget.blur();
                        const card = p.activeCard;
                        if (!card) return;
                        if (p.speaking) p.onStopTts();
                        else
                          p.onSpeak(
                            p.cardKindOf(card) === "cloze"
                              ? p.maskCloze(card.front)
                              : card.front
                          );
                      }}
                      className="flex h-7 w-7 items-center justify-center rounded-full border border-border/70 text-muted-fg transition-colors hover:border-accent/50 hover:text-accent"
                    >
                      {p.speaking ? <VolumeX size={13} /> : <Volume2 size={13} />}
                    </button>
                  )}
                  {(() => {
                    const st = p.activeCard ? getCardStatus(p.activeCard, p.nowMs) : null;
                    if (!st) return null;
                    return (
                      <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-muted-fg">
                        <span className={cn("h-2 w-2 rounded-full", st.dot)} />
                        {st.label}
                      </span>
                    );
                  })()}
                </div>
              </div>
              <div className="flex flex-1 flex-col items-center justify-center px-10 pb-4 text-center">
                {p.activeCard?.topic && (
                  <p className="mb-4 text-[10px] font-bold uppercase tracking-widest text-muted-fg/70">
                    {p.activeCard.topic.subject?.name ?? "GENERAL"} › {p.activeCard.topic.name}
                  </p>
                )}
                <div className="text-3xl font-bold uppercase leading-relaxed tracking-tight sm:text-4xl">
                  {p.activeCard &&
                    (p.cardKindOf(p.activeCard) === "cloze"
                      ? p.maskCloze(p.activeCard.front)
                      : p.activeCard.front)}
                </div>
                {p.activeCard && p.cardKindOf(p.activeCard) === "choice" && (
                  <div className="mt-6 grid w-full max-w-[28rem] gap-2" onClick={(e) => e.stopPropagation()}>
                    {p.choiceOptions.map((opt) => (
                      <button
                        key={opt}
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          p.onPickChoice(opt);
                        }}
                        className="border-2 border-border bg-bg/60 px-4 py-2.5 text-sm font-bold uppercase tracking-tight text-fg transition-colors hover:border-accent hover:text-accent"
                      >
                        {opt}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex items-center justify-between border-t border-border/60 px-7 py-3.5 text-[10px] font-bold uppercase tracking-widest text-muted-fg">
                <span className="font-mono">#{p.activeCard.id.slice(-4)}</span>
                <span className="flex animate-pulse items-center gap-1.5">
                  CLICK OR PRESS SPACE TO REVEAL
                  <Zap size={11} />
                </span>
              </div>
            </div>

            {/* BACK — ANSWER */}
            <div className="flip-face flip-back absolute inset-0 flex flex-col overflow-hidden rounded-2xl border-2 border-accent bg-accent shadow-[0_18px_50px_-12px_rgba(250,204,21,0.25)]">
              <span className="absolute inset-x-6 top-0 h-0.5 bg-gradient-to-r from-transparent via-accent-fg/60 to-transparent" />
              <div className="flex items-center justify-between px-7 pt-5">
                <Badge className="bg-accent-fg/15 text-accent-fg">ANSWER</Badge>
                {p.ttsSupported && (
                  <button
                    type="button"
                    aria-label="Read answer aloud"
                    onClick={(e) => {
                      e.stopPropagation();
                      e.currentTarget.blur();
                      if (p.speaking) p.onStopTts();
                      else
                        p.onSpeak(
                          p.activeCard!.description
                            ? `${p.activeCard!.back}\n${p.activeCard!.description}`
                            : p.activeCard!.back
                        );
                    }}
                    className="flex h-7 w-7 items-center justify-center rounded-full border border-accent-fg/25 text-accent-fg/70 transition-colors hover:border-accent-fg/60 hover:text-accent-fg"
                  >
                    {p.speaking ? <VolumeX size={13} /> : <Volume2 size={13} />}
                  </button>
                )}
              </div>
              <div className="flex flex-1 flex-col items-center justify-center px-10 pb-4 text-center">
                {p.pickedChoice !== null && p.cardKindOf(p.activeCard) === "choice" && (
                  <p
                    className={cn(
                      "mb-4 border-2 px-3 py-1.5 text-xs font-bold uppercase tracking-widest",
                      p.pickedChoice === p.activeCard.back
                        ? "border-success/60 bg-success/10 text-success"
                        : "border-danger/60 bg-danger/10 text-danger"
                    )}
                  >
                    {p.pickedChoice === p.activeCard.back
                      ? "✓ CORRECT"
                      : `✗ YOU PICKED: ${p.pickedChoice.toUpperCase().slice(0, 60)}`}
                  </p>
                )}
                <div className="[&_p]:text-accent-fg [&_li]:text-accent-fg text-3xl font-bold uppercase leading-relaxed tracking-tight text-accent-fg sm:text-4xl [&_.md-p]:text-accent-fg">
                  <Markdown content={p.activeCard.back} align="center" />
                </div>
                {p.activeCard.description && (
                  <p className="mt-4 max-w-[28rem] text-sm font-normal normal-case tracking-normal leading-relaxed text-accent-fg/70">
                    {p.activeCard.description}
                  </p>
                )}
              </div>
              <div className="flex items-center justify-between border-t border-accent-fg/15 px-7 py-3.5 text-[10px] font-bold uppercase tracking-widest text-accent-fg/70">
                <span className="font-mono">#{p.activeCard.id.slice(-4)}</span>
                <span>RATE IT BELOW</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Show Answer button */}
      {!p.isFlipped && p.activeCard && (
        <Button className="w-full" onClick={() => p.onFlipTo(true)}>
          SHOW ANSWER
        </Button>
      )}

      {/* Rating buttons */}
      {p.isFlipped && (
        <div className="grid grid-cols-3 gap-px bg-border">
          {RATING_BUTTONS.map((q, idx) => (
            <button
              key={q.value}
              className={cn("bg-bg p-5 text-center transition-all duration-200 active:scale-95", q.color)}
              onClick={() => p.onRate(q.value)}
              disabled={p.reviewing}
            >
              <p className="text-sm font-bold uppercase tracking-tighter">{q.label}</p>
              <p className="mt-1 text-[10px] text-muted-fg/50">[{idx + 1}]</p>
            </button>
          ))}
        </div>
      )}

      <p className="text-center text-xs text-muted-fg uppercase tracking-widest">
        SPACE: FLIP • 1-3: RATE
      </p>
    </div>
  );
}
