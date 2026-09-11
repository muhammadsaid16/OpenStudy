"use client";

import { useState, useEffect, useCallback, useRef, useMemo, Suspense } from "react";
import { useT } from "@/lib/i18n";
import { Brain, Plus, Pencil, Layers, BarChart3, AlertTriangle, Download, Upload, Wifi, WifiOff, Search } from "lucide-react";
import { useSearchParams, useRouter } from "next/navigation";
import { Button, EmptyState, Modal, Input, Skeleton } from "@/components/ui";
import { RevealHeading } from "@/components/reveal-heading";
import { ScrambleSubtitle } from "@/components/scramble-subtitle";
import { showUndo } from "@/components/undo-toast";
import { showToast } from "@/components/toast";
import {
  getDueFlashcards,
  getSubjects,
  getFlashcards,
  getAllFlashcards,
  getAllDueFlashcards,
  createFlashcard,
  updateFlashcard,
  deleteFlashcard,
  getBundles,
  getBundleCards,
  getLeechCards,
  unLeechCard,
  getHeatmapData,
  getStreak,
  logReviewOnly,
  getAllReviewLogs,
  createBundleFlashcard,
  createBundle,
  exportBundle,
  importBundleCards,
  editBundleFromFlashcards,
  createStudySession,
  batchDeleteCards,
  batchTagCards,
  batchMoveCards,
  restoreFlashcard,
  getFlashcardSnapshot, getCardTagLinks,
} from "@/app/actions";
import { ReviewMode } from "./_review-mode";
import { BrowseMode, LeechesMode, StatsMode } from "./_browse-leech-stats";
import { SubjectTopicSelect } from "@/components/subject-topic-select";
import { SubjectTopicMenu } from "@/components/subject-topic-menu";
import { cn } from "@/lib/utils";
import { filterDueCards } from "@/lib/review-queue";
import { cardKind, cleanChoices, maskCloze, shuffled, type CardKind } from "@/lib/card-kinds";
import { motion } from "framer-motion";
import { parseCardsFile } from "@/lib/parsers/cards";
import { db as offlineDb, cacheBundles, cacheFlashcards, getCachedBundleCards } from "@/lib/db";
import { useOfflineSync } from "@/hooks/useOfflineSync";
import { useTts } from "@/hooks/use-tts";
import { BundleColorPicker } from "@/components/bundle-color-picker";
import { themeAccent } from "@/lib/bundle-colors";
import { useAppStore } from "@/lib/store";
import { TagInput } from "@/components/tag-input";
import { ImageUploadButton } from "@/components/image-upload-button";
import { AiImportButton } from "@/components/ai-import-button";
import { AiGenerateButton } from "@/components/ai-generate-button";
import { CardKindFields } from "@/components/card-kind-fields";
import { RATING_BUTTONS } from "@/lib/card-status";
import { useLiveData } from "@/lib/use-live-data";

type Flashcard = Awaited<ReturnType<typeof getDueFlashcards>>[number];
type ManagedFlashcard = Awaited<ReturnType<typeof getAllFlashcards>>[number];
type Bundle = Awaited<ReturnType<typeof getBundles>>[number];
type Subject = { id: string; name: string; color: string };

function FlashcardsContent() {
  const t = useT();
  const searchParams = useSearchParams();
  const router = useRouter();
  const bundleParam = searchParams.get("bundle");
  const topicParam = searchParams.get("topic");
  const modeParam = searchParams.get("mode");
  const qParam = searchParams.get("q");

  // ─── Core state ─────────────────────────────────────────────
  const [mode, setMode] = useState<"review" | "browse" | "leeches" | "stats">(() =>
    modeParam === "gallery" || modeParam === "browse" ? "browse" : "review"
  );
  const [bundles, setBundles] = useState<Bundle[]>([]);
  const [selectedBundle, setSelectedBundle] = useState(bundleParam || "");
  const allDueParam = searchParams.get("all") === "1";
  // Prefill browse search from ?q= (global TopBar search lands here)
  const [browseQuery, setBrowseQuery] = useState(qParam ?? "");
  // Derived from the URL (?all=1) — the old setAllDue was never called, which
  // froze Study All Due at its mount-time value.
  const allDue = allDueParam;
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loaded, setLoaded] = useState(false);
  // wall clock — captured once in the mount effect (react-hooks/purity bans Date.now() in render)
  const [nowMs, setNowMs] = useState(0);

  // ─── Review state ───────────────────────────────────────────
  const [dueCards, setDueCards] = useState<Flashcard[]>([]);
  const [practiceMode, setPracticeMode] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [completedCount, setCompletedCount] = useState(0);
  const [totalReviewed, setTotalReviewed] = useState(0);
  const totalReviewedRef = useRef(0);
  const [learningQueue, setLearningQueue] = useState<Flashcard[]>([]);
  const [sprintMode, setSprintMode] = useState(false);
  const [sprintTimer, setSprintTimer] = useState(5);
  const sprintRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ─── Auto study-session logging ────────────────────────────
  // Accumulates reviews for the current run; logged as a StudySession
  // when the review queue is exhausted (run complete).
  const sessionRef = useRef<{ reviewed: number; correct: number; startedAt: number }>({
    reviewed: 0,
    correct: 0,
    startedAt: 0,
  });
  const sessionLoggedRef = useRef(false);

  // ─── Leech state ────────────────────────────────────────────
  const [leechCards, setLeechCards] = useState<(Flashcard & { bundle: { id: string; name: string } | null })[]>([]);
  const [leechLoaded, setLeechLoaded] = useState(false);

  // ─── Browse-all (search across all bundles) ───────────────
  const [browseCards, setBrowseCards] = useState<ManagedFlashcard[]>([]);
  const [browseBundles, setBrowseBundles] = useState<Bundle[]>([]);
  const [browseLoaded, setBrowseLoaded] = useState(false);
  const [browseScope, setBrowseScope] = useState<"cards" | "bundles">("cards");
  const [browseFlipped, setBrowseFlipped] = useState<Set<string>>(new Set());
  const [browseSelected, setBrowseSelected] = useState<Set<string>>(new Set());
  const [batchTagModalOpen, setBatchTagModalOpen] = useState(false);
  const [batchTagInput, setBatchTagInput] = useState("");
  const [batchMoveModalOpen, setBatchMoveModalOpen] = useState(false);
  const [batchMoveTarget, setBatchMoveTarget] = useState("");

  const loadBrowseAll = useCallback(async () => {
    const [cards, bundles] = await Promise.all([
      getAllFlashcards() as Promise<ManagedFlashcard[]>,
      getBundles(),
    ]);
    setBrowseCards(cards);
    setBrowseBundles(bundles);
    setBrowseLoaded(true);
  }, []);

  const browseFilteredCards = useMemo(() => {
    const q = browseQuery.toLowerCase();
    return browseCards.filter((card: ManagedFlashcard) => {
      const matchesSearch =
        !q ||
        card.front.toLowerCase().includes(q) ||
        card.back.toLowerCase().includes(q) ||
        ((card as any).frontDescription ?? "").toLowerCase().includes(q) ||
        ((card as any).backDescription ?? "").toLowerCase().includes(q) ||
        (card.description ?? "").toLowerCase().includes(q);
      return matchesSearch;
    });
  }, [browseCards, browseQuery]);

  const browseFilteredBundles = useMemo(() => {
    const q = browseQuery.toLowerCase();
    return browseBundles.filter(
      (b) => !q || b.name.toLowerCase().includes(q) || (b.description ?? "").toLowerCase().includes(q)
    );
  }, [browseBundles, browseQuery]);

  // ─── Stats state ────────────────────────────────────────────
  const [heatmap, setHeatmap] = useState<{ date: string; count: number }[]>([]);
  const [streak, setStreak] = useState(0);
  const [statsLoaded, setStatsLoaded] = useState(false);
  const [reviewsToday, setReviewsToday] = useState(0);
  const [statsLeechCount, setStatsLeechCount] = useState(0);

  // ─── Create modal ───────────────────────────────────────────
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedTopicId, setSelectedTopicId] = useState("");
  const [front, setFront] = useState("");
  const [back, setBack] = useState("");
  const [frontDesc, setFrontDesc] = useState("");
  const [backDesc, setBackDesc] = useState("");
  const [kind, setKind] = useState<CardKind>("basic");
  const [choicesText, setChoicesText] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");

  // ─── Create Bundle modal ────────────────────────────────────
  const [bundleCreateOpen, setBundleCreateOpen] = useState(false);
  const [newBundleName, setNewBundleName] = useState("");
  const [newBundleDesc, setNewBundleDesc] = useState("");
  const [newBundleColor, setNewBundleColor] = useState(() => themeAccent(typeof window !== "undefined" ? (document.documentElement.getAttribute("data-theme") as string) : "aurora"));
  const theme = useAppStore((s: { theme: string }) => s.theme);
  useEffect(() => { if (bundleCreateOpen) setNewBundleColor(themeAccent(theme)); }, [bundleCreateOpen, theme]);
  const [newBundleSubjectId, setNewBundleSubjectId] = useState("");
  const [newBundleTopicId, setNewBundleTopicId] = useState("");
  const [creatingBundle, setCreatingBundle] = useState(false);

  const handleCreateBundle = async () => {
    const name = newBundleName.trim();
    if (!name || creatingBundle) return;
    setCreatingBundle(true);
    try {
      const b = await createBundle({ name, description: newBundleDesc.trim() || undefined, color: newBundleColor, topicId: newBundleTopicId || null });
      setBundleCreateOpen(false);
      setNewBundleName("");
      setNewBundleDesc("");
      setNewBundleColor(themeAccent(useAppStore.getState().theme));
      setNewBundleSubjectId("");
      setNewBundleTopicId("");
      const fresh = await getBundles();
      setBundles(fresh);
      if (b?.id) setSelectedBundle(b.id);
    } catch (e) {
      console.error("Failed to create bundle", e);
      showToast(t("fc.createBundleFailed"), "danger");
    } finally {
      setCreatingBundle(false);
    }
  };

  // ─── Edit/Delete modal ──────────────────────────────────────
  const [editCard, setEditCard] = useState<ManagedFlashcard | null>(null);
  const [editFront, setEditFront] = useState("");
  const [editBack, setEditBack] = useState("");
  const [editFrontDesc, setEditFrontDesc] = useState("");
  const [editBackDesc, setEditBackDesc] = useState("");
  const [editKind, setEditKind] = useState<CardKind>("basic");
  const [editChoicesText, setEditChoicesText] = useState("");
  const [editTags, setEditTags] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<ManagedFlashcard | null>(null);
  const [deleting, setDeleting] = useState(false);

  // ─── Edit Bundle (from flashcards page) ────────────────────
  const [editBundleOpen, setEditBundleOpen] = useState(false);
  const [editBundleName, setEditBundleName] = useState("");
  const [editBundleDesc, setEditBundleDesc] = useState("");
  const [editBundleColor, setEditBundleColor] = useState("#DFE104");
  const [savingBundle, setSavingBundle] = useState(false);

  // ─── Offline sync ───────────────────────────────────────────
  const { online, pending, reviewCard } = useOfflineSync();

  // ─── TTS (free browser speechSynthesis) ──────────────────────
  // Button-triggered only — no auto-read: each card face has a speaker
  // button; the answer speaker reads back + description together.
  const { speaking, speak, stop: stopTts, supported: ttsSupported } = useTts();

  // ─── Confetti ───────────────────────────────────────────────
  const triggerConfetti = useCallback(() => {
    const colors = ["#DFE104", "#22C55E", "#3B82F6", "#EF4444", "#EC4899"];
    const container = document.createElement("div");
    container.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:9999;overflow:hidden";
    document.body.appendChild(container);
    for (let i = 0; i < 30; i++) {
      const p = document.createElement("div");
      p.style.cssText = `position:absolute;width:8px;height:8px;background:${colors[i % colors.length]};left:${Math.random() * 100}%;top:-10px;opacity:1;transition:all 2s ease-out`;
      container.appendChild(p);
      requestAnimationFrame(() => {
        p.style.top = `${100 + Math.random() * 20}%`;
        p.style.opacity = "0";
        p.style.transform = `rotate(${Math.random() * 360}deg)`;
      });
    }
    setTimeout(() => container.remove(), 2500);
  }, []);

  // ─── Data loading (realtime: bundles + subjects re-fetch on ANY change) ──
  const liveLists = useLiveData(() => Promise.all([getBundles(), getSubjects()]), [bundleParam]);
  useEffect(() => {
    if (!liveLists) return;
    const [b, s] = liveLists;
    setBundles(b);
    setSubjects(s);
    // Cache for offline
    cacheBundles(b.map((x) => ({ id: x.id, name: x.name, description: x.description, color: x.color, cardCount: x._count.flashcards, synced: true })));
    if (bundleParam) setSelectedBundle(bundleParam);
    setLoaded(true);
  }, [liveLists, bundleParam]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNowMs(Date.now());
  }, []);

  // ─── Review queue loader — runs on mount AND whenever the bundle context
  // changes (dropdown select, ?bundle=, ?all=1). Resets run state so switching
  // bundles can no longer keep serving the previous bundle's cards while the
  // header/ADD CARD/export point at the new one.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      let cards: Flashcard[] = [];
      let practiceFlag = false; // true only when serving not-yet-due cards
      if (!selectedBundle && !allDue) {
        cards = []; // bundle-overview view — nothing to serve
      } else if (allDue) {
        // Study All Due: due queue across every bundle
        cards = (await getAllDueFlashcards()) as Flashcard[];
      } else if (topicParam) {
        // Topic context (subjects → STUDY ALL): only DUE cards for that topic
        const now = Date.now();
        const topicCards = await getFlashcards(topicParam);
        cards = (topicCards as Flashcard[]).filter((c) => new Date(c.nextReview).getTime() <= now);
      } else {
        try {
          const now = Date.now();
          // Bundle review: serve ONLY cards whose nextReview has arrived —
          // serving every card broke SM-2 (a +30d card was shown today).
          const all: Flashcard[] = (await getBundleCards(selectedBundle)) as Flashcard[];
          const due = all.filter((c) => new Date(c.nextReview).getTime() <= now);
          if (due.length === 0 && all.length > 0) {
            cards = shuffled(all);
            practiceFlag = true;
          } else {
            cards = due;
          }
        } catch {
          // offline fallback
          const cached = await getCachedBundleCards(selectedBundle);
          const now = Date.now();
          const due = (cached as unknown as Flashcard[]).filter((c) => new Date(c.nextReview).getTime() <= now);
          if (due.length === 0 && (cached as unknown as Flashcard[]).length > 0) {
            cards = shuffled(cached as unknown as Flashcard[]);
            practiceFlag = true;
          } else {
            cards = due;
          }
        }
        if (practiceFlag && cards.length > 0) showToast(t("fc.practiceMode"), "info");
      }
      if (cancelled) return;
      setPracticeMode(practiceFlag);
      setDueCards(cards);
      setCurrentIndex(0);
      setIsFlipped(false);
      setLearningQueue([]);
      setCompletedCount(0);
      setTotalReviewed(0);
      totalReviewedRef.current = 0;
      sessionLoggedRef.current = false;
      sessionRef.current = { reviewed: 0, correct: 0, startedAt: 0 };
      setPracticeMode(false); // set right after from practiceFlag
    })();
    return () => { cancelled = true; };
  }, [selectedBundle, allDue, topicParam]);

  const loadDueCards = useCallback(async () => {
    let cards: Flashcard[];
    if (allDue) {
      cards = (await getAllDueFlashcards()) as Flashcard[];
    } else if (topicParam) {
      cards = filterDueCards((await getFlashcards(topicParam)) as Flashcard[]);
    } else {
      if (selectedBundle) {
        const all = (await getBundleCards(selectedBundle)) as Flashcard[];
        const due = filterDueCards(all);
        if (due.length === 0 && all.length > 0) {
          cards = shuffled(all);
          showToast(t("fc.practiceMode"), "info");
        } else {
          cards = due;
        }
      } else {
        cards = (await getAllDueFlashcards()) as unknown as Flashcard[];
      }
    }
    setDueCards(cards);
    setCurrentIndex(0);
    setIsFlipped(false);
  }, [selectedBundle, allDue, topicParam]);

  const fetchMoreDue = useCallback(async () => {
    let more: Flashcard[];
    if (allDue) {
      more = (await getAllDueFlashcards()) as Flashcard[];
    } else if (topicParam) {
      more = filterDueCards((await getFlashcards(topicParam)) as Flashcard[]);
    } else {
      more = selectedBundle
        ? filterDueCards((await getBundleCards(selectedBundle)) as Flashcard[])
        : ((await getAllDueFlashcards()) as unknown as Flashcard[]);
    }
    setDueCards((prev) => [...prev, ...(more as Flashcard[]).filter((c) => !prev.some((p) => p.id === c.id))]);
  }, [selectedBundle, allDue, topicParam]);

  // Full reload of bundle list + card lists (used after import).
  const reloadCards = useCallback(async () => {
    const b = await getBundles();
    setBundles(b);
    cacheBundles(b.map((x) => ({ id: x.id, name: x.name, description: x.description, color: x.color, cardCount: x._count.flashcards, synced: true })));
    if (selectedBundle) {
      try {
        const cards = await getBundleCards(selectedBundle);
        setDueCards(filterDueCards(cards as Flashcard[]));
        cacheFlashcards(cards.map((c) => ({ id: c.id, bundleId: c.bundleId, front: c.front, back: c.back, reviewCount: c.reviewCount, nextReview: new Date(c.nextReview).getTime(), isLeech: c.isLeech, synced: true })));
      } catch {
        // keep current list on transient failure
      }
    } else {
      const cards = await getAllDueFlashcards();
      setDueCards(cards as Flashcard[]);
    }
    if (browseLoaded) await loadBrowseAll();
  }, [selectedBundle, browseLoaded, loadBrowseAll]);

  // ─── Review handlers ────────────────────────────────────────
  // Serve the main due queue first; once it's exhausted, serve the
  // same-session relearning queue (cards rated AGAIN / HARD).
  const activeCard = dueCards[currentIndex] ?? learningQueue[0] ?? null;

  // ─── Multiple-choice answering ──────────────────────────────
  // The tapped option flips the card; correctness is revealed on the
  // answer face. Reset on every rating (card advance happens only there).
  const [pickedChoice, setPickedChoice] = useState<string | null>(null);
  const choiceOptions = useMemo(
    () =>
      activeCard && cardKind(activeCard) === "choice"
        ? shuffled([activeCard.back, ...(activeCard.choices ?? [])])
        : [],
    [activeCard]
  );

  const handleReview = useCallback(
    async (quality: number) => {
      if (!activeCard || reviewing) return;
      const servingFromQueue = dueCards[currentIndex] == null;
      setReviewing(true);
      try {
        // Practice mode serves not-yet-due cards — log activity only,
        // never advance real SM-2 schedules (a +30d card practiced early
        // used to get rescheduled as if reviewed on time).
        if (practiceMode) {
          await logReviewOnly(activeCard.id, quality);
        } else {
          await reviewCard(activeCard.id, quality);
        }
        // Track run stats for auto session logging
        if (sessionRef.current.reviewed === 0) sessionRef.current.startedAt = Date.now();
        sessionRef.current.reviewed += 1;
        if (quality >= 3) sessionRef.current.correct += 1;
        setTotalReviewed((t) => t + 1);
        totalReviewedRef.current += 1;
        if (
          totalReviewedRef.current === 25 ||
          totalReviewedRef.current === 50 ||
          totalReviewedRef.current === 100
        ) {
          setTimeout(() => triggerConfetti(), 0);
        }
        setCompletedCount((c) => c + 1);

        if (quality < 3 && !servingFromQueue) {
          // AGAIN / HARD on the MAIN queue: requeue for later in THIS session.
          // (When serving FROM the relearn queue the rotate branch below already
          // handles it — appending here too duplicated the card every lapse.)
          setLearningQueue((prev) => [...prev, activeCard]);
        }

        if (!servingFromQueue) {
          // Main queue: advance; finishing it hands control to the relearn queue
          if (currentIndex < dueCards.length - 1) {
            setCurrentIndex((i) => i + 1);
          } else {
            setDueCards([]);
          }
        } else if (quality >= 3) {
          // Relearn queue: remembered → clear the card
          setLearningQueue((prev) => prev.slice(1));
        } else {
          // Relearn queue: lapsed again → send it to the back
          setLearningQueue((prev) => [...prev.slice(1), prev[0]]);
        }
        setIsFlipped(false);
        setPickedChoice(null);

        // Dynamic queue replenishment (only while the main queue is live)
        if (currentIndex < dueCards.length - 5) {
          fetchMoreDue();
        }
      } finally {
        setReviewing(false);
      }
    },
    [activeCard, reviewing, currentIndex, dueCards, reviewCard, fetchMoreDue, triggerConfetti, practiceMode]
  );

  // ─── Speed Sprint timer ─────────────────────────────────────
  useEffect(() => {
    if (sprintMode && isFlipped && activeCard) {
      setSprintTimer(5); // eslint-disable-line react-hooks/set-state-in-effect
      sprintRef.current = setInterval(() => {
        setSprintTimer((t) => {
          if (t <= 1) {
            if (sprintRef.current) clearInterval(sprintRef.current);
            // Fire outside the state updater: React 19 StrictMode
            // double-invokes updaters, which could submit the review twice.
            setTimeout(() => handleReview(0), 0);
            return 0;
          }
          return t - 1;
        });
      }, 1000);
      return () => { if (sprintRef.current) clearInterval(sprintRef.current); };
    }
  }, [sprintMode, isFlipped, activeCard, handleReview]);

  // ─── Keyboard handler ─────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target?.isContentEditable) return;

      // Review keys only apply in review mode — in browse/leeches/stats they
      // used to silently submit SRS ratings for an off-screen card and
      // preventDefault() Space/Enter (breaking scroll and UI shortcuts).
      if (mode !== "review") return;

      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        setIsFlipped((f) => !f);
      }
      if (isFlipped) {
        const idx = Number(e.key) - 1;
        if (idx >= 0 && idx < RATING_BUTTONS.length) {
          handleReview(RATING_BUTTONS[idx].value);
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [mode, isFlipped, handleReview]);

  useEffect(() => {
    if (mode === "browse" && !browseLoaded) loadBrowseAll(); // eslint-disable-line react-hooks/set-state-in-effect
  }, [mode, browseLoaded, loadBrowseAll]);

  // ─── Leech data ─────────────────────────────────────────────
  const loadLeeches = useCallback(async () => {
    const cards = await getLeechCards(selectedBundle || undefined);
    setLeechCards(cards);
    setLeechLoaded(true);
  }, [selectedBundle]);

  useEffect(() => {
    if (mode === "leeches" && !leechLoaded) loadLeeches(); // eslint-disable-line react-hooks/set-state-in-effect
  }, [mode, leechLoaded, loadLeeches]);

  // ─── Stats data ─────────────────────────────────────────────
  const loadStats = useCallback(async () => {
    const [h, s, logs, leeches] = await Promise.all([
      getHeatmapData(),
      getStreak(),
      getAllReviewLogs(),
      // Fresh leech count from DB — leechCards state is only populated when the
      // LEECHES tab is visited, so it always showed 0 on a direct stats visit.
      getLeechCards(),
    ]);
    setHeatmap(h);
    setStreak(s);
    // Reviews TODAY from the review log, not the current-run counter
    // (totalReviewed resets on reload and is per-run, not per-day).
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    setReviewsToday(logs.filter((r) => new Date(r.reviewedAt).getTime() >= startOfDay.getTime()).length);
    setStatsLeechCount(leeches.length);
    setStatsLoaded(true);
  }, []);

  useEffect(() => {
    if (mode === "stats" && !statsLoaded) loadStats(); // eslint-disable-line react-hooks/set-state-in-effect
  }, [mode, statsLoaded, loadStats]);

  // ─── Create/Save handlers ──────────────────────────────────
  const handleCreate = async () => {
    if (!front.trim() || !back.trim()) return;
    if (!selectedBundle && !selectedTopicId) {
      setCreateError(t("fc.selectTopicFirst"));
      return;
    }
    setCreateError("");
    setCreating(true);
    // Choices are one-per-line; validation errors (cloze without {{}},
    // choice with <2 options) surface in the modal, not silently.
    const choices = kind === "choice" ? cleanChoices(choicesText.split("\n")) : undefined;
    try {
      if (selectedBundle) {
        await createBundleFlashcard({ bundleId: selectedBundle, front: front.trim(), back: back.trim(), frontDescription: frontDesc.trim() || undefined, backDescription: backDesc.trim() || undefined, kind, choices });
      } else if (selectedTopicId) {
        await createFlashcard({ topicId: selectedTopicId, front: front.trim(), back: back.trim(), frontDescription: frontDesc.trim() || undefined, backDescription: backDesc.trim() || undefined, kind, choices });
      }
      setModalOpen(false);
      setFront("");
      setBack("");
      setFrontDesc("");
      setBackDesc("");
      setKind("basic");
      setChoicesText("");
      setSelectedTopicId("");
      await loadDueCards();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message.slice(0, 140) : t("fc.createCardFailed"));
    } finally {
      setCreating(false);
    }
  };

  const handleEditSave = async () => {
    if (!editCard || !editFront.trim() || !editBack.trim()) return;
    setEditError("");
    setSaving(true);
    try {
      await updateFlashcard(editCard.id, {
        front: editFront.trim(),
        back: editBack.trim(),
        frontDescription: editFrontDesc.trim() || null,
        backDescription: editBackDesc.trim() || null,
        description: editBackDesc.trim() || null,
        tags: editTags,
        kind: editKind,
        choices: editKind === "choice" ? cleanChoices(editChoicesText.split("\n")) : undefined,
      });
      setEditCard(null);
      // Refresh browse list so the edited card shows new text immediately
      if (browseLoaded) await loadBrowseAll();
    } catch (err) {
      setEditError(err instanceof Error ? err.message.slice(0, 140) : t("fc.saveCardFailed"));
    } finally {
      setSaving(false);
    }
  };

  // Edit fields are prefilled at the EDIT click site (event handler),
  // never in an effect.

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const snapshot = deleteTarget;
    setDeleting(true);
    try {
      // Snapshot everything needed for a faithful undo BEFORE deletion
      const [cardSnapshot, tagLinks] = await Promise.all([
        getFlashcardSnapshot(snapshot.id),
        getCardTagLinks(snapshot.id),
      ]);
      await deleteFlashcard(snapshot.id);
      setDeleteTarget(null);
      await loadDueCards();
      if (browseLoaded) await loadBrowseAll();
      showUndo({
        message: t("fc.cardDeleted"),
        undo: async () => {
          // Restore the exact card (same id, SM-2 state, tags, links) —
          // recreating it fresh would silently reset its scheduling.
          if (cardSnapshot) await restoreFlashcard(cardSnapshot, tagLinks);
          await loadDueCards();
        },
      });
    } finally {
      setDeleting(false);
    }
  };

  // ─── Batch operations ─────────────────────────────────────
  const allBrowseSelected = browseFilteredCards.length > 0 && browseFilteredCards.every((c) => browseSelected.has(c.id));
  const toggleBrowseSelectAll = () => {
    if (allBrowseSelected) {
      setBrowseSelected(new Set());
    } else {
      setBrowseSelected(new Set(browseFilteredCards.map((c) => c.id)));
    }
  };
  const toggleBrowseSelect = (id: string) => {
    setBrowseSelected((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };
  const handleBatchDelete = async () => {
    const ids = Array.from(browseSelected);
    if (!ids.length) return;
    await batchDeleteCards(ids);
    setBrowseSelected(new Set());
    await loadBrowseAll();
  };
  const handleBatchTag = async () => {
    const ids = Array.from(browseSelected);
    const tags = batchTagInput.split(",").map((t) => t.trim()).filter(Boolean);
    if (!ids.length || !tags.length) return;
    await batchTagCards(ids, tags);
    setBatchTagModalOpen(false);
    setBatchTagInput("");
    setBrowseSelected(new Set());
    await loadBrowseAll();
  };
  const handleBatchMove = async () => {
    const ids = Array.from(browseSelected);
    if (!ids.length) return;
    await batchMoveCards(ids, batchMoveTarget || null);
    setBatchMoveModalOpen(false);
    setBatchMoveTarget("");
    setBrowseSelected(new Set());
    await loadBrowseAll();
  };

  const totalDue = dueCards.length + learningQueue.length;

  // ─── Auto-log study session when the review run is finished ──
  // Fires once when the run completes: the SESSION COMPLETE screen is
  // shown (totalDue === 0 && completedCount > 0). Stats were accumulated
  // in sessionRef during the run.
  useEffect(() => {
    if (
      !sessionLoggedRef.current &&
      sessionRef.current.reviewed > 0 &&
      totalDue === 0 &&
      completedCount > 0
    ) {
      sessionLoggedRef.current = true;
      const mins = Math.max(1, Math.round((Date.now() - sessionRef.current.startedAt) / 60000));
      const acc = sessionRef.current.reviewed
        ? Math.round((sessionRef.current.correct / sessionRef.current.reviewed) * 100)
        : 0;
      createStudySession({
        title: t("fc.sessionRunTitle").replace("{n}", String(sessionRef.current.reviewed)),
        durationMin: mins,
        notes: t("fc.sessionAccuracy").replace("{n}", String(acc)),
        completed: true,
        startedAt: new Date(sessionRef.current.startedAt),
      }).catch((e) => console.error(t("ui.session_log_failed"), e));
    }
  }, [totalDue, completedCount, t]);

  return (
    <div className="page-gutter cq">
      {/* Header */}
      <div className="mb-6">
        <RevealHeading text={t("page.flashcards")} className="text-4xl lg:text-6xl" />
        <ScrambleSubtitle
          text={t("page.flashcards.subtitle")}
          className="mt-2 text-sm text-muted-fg uppercase tracking-widest"
        />
      </div>

      {/* Toolbar */}
      <div className="mb-8 space-y-4 border-b border-border pb-4">
        {/* Row 1 — Primary: bundle context + main action */}
        <div className="flex flex-wrap items-center gap-3">
          <select
            value={selectedBundle}
            onChange={(e) => {
              setSelectedBundle(e.target.value);
              setLeechLoaded(false);
              setStatsLoaded(false);
            }}
            aria-label={t("fc.selectBundleToStudy")}
            className="flex h-10 items-center gap-2 rounded-xl border border-glass-border bg-glass px-3 text-sm font-bold uppercase tracking-tight text-fg backdrop-blur-md focus:outline-none"
          >
            <option value="" className="bg-bg text-fg">{t("fc.allBundles")}</option>
            {bundles.map((b) => (
              <option key={b.id} value={b.id} className="bg-bg text-fg">{b.name} ({b._count.flashcards})</option>
            ))}
          </select>
          {selectedBundle && (
            <Button onClick={() => setModalOpen(true)}>
              <Plus size={16} />
              {t("fc.addCard")}
            </Button>
          )}
          {selectedBundle && (() => {
            const b = bundles.find((x) => x.id === selectedBundle);
            return b ? (
              <AiImportButton
                bundleId={b.id}
                bundleName={b.name}
                onImported={reloadCards}
              />
            ) : null;
          })()}
          <AiGenerateButton
            bundles={bundles}
            defaultBundleId={selectedBundle || undefined}
            onCreated={reloadCards}
          />
          <button
            onClick={() => router.push("/subjects")}
            className="ms-auto py-2 text-xs font-bold uppercase tracking-widest text-muted-fg hover:text-accent"
          >
            {t("fc.manageBundles")}
          </button>
        </div>

        {/* Row 2 — Secondary: edit/import/export + mode tabs + status */}
        <div className="flex flex-wrap items-center gap-4">
          {selectedBundle && (
            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={() => {
                  const b = bundles.find((x) => x.id === selectedBundle);
                  if (!b) return;
                  setEditBundleName(b.name);
                  setEditBundleDesc(b.description ?? "");
                  setEditBundleColor(b.color || "#DFE104");
                  setEditBundleOpen(true);
                }}
                className="text-xs font-bold uppercase tracking-widest text-muted-fg hover:text-accent"
                title={t("fc.editBundle")}
              >
                <Pencil size={14} className="inline" /> {t("common.edit")}
              </button>
              <button
                onClick={async () => {
                  try {
                    const json = await exportBundle(selectedBundle);
                    const blob = new Blob([json], { type: "application/json" });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    const rawName = bundles.find((x) => x.id === selectedBundle)?.name ?? "bundle";
                    const safeName = rawName.replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-") || "bundle";
                    a.href = url;
                    a.download = `${safeName}.json`;
                    document.body.appendChild(a);
                    a.click();
                    a.remove();
                    setTimeout(() => URL.revokeObjectURL(url), 1000);
                  } catch (e) {
                    console.error("Export failed", e);
                    showToast(t("fc.exportFailed"), "danger");
                  }
                }}
                className="text-xs font-bold uppercase tracking-widest text-muted-fg hover:text-accent"
                title={t("fc.exportBundleJson")}
              >
                <Download size={14} className="inline" /> {t("notes.export")}
              </button>
              <button
                onClick={() => document.getElementById("import-file")?.click()}
                className="text-xs font-bold uppercase tracking-widest text-muted-fg hover:text-accent"
                title={t("fc.importCardsFile")}
              >
                <Upload size={14} className="inline" /> {t("fc.import")}
              </button>
              <input
                id="import-file"
                type="file"
                accept=".json,.csv,.tsv,.txt,application/json,text/csv"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  try {
                    const text = await file.text();
                    // parseCardsFile handles JSON arrays ({front,back} or
                    // {question,answer}), CSV, and Anki TSV exports.
                    const cards = parseCardsFile(text);
                    if (!cards.length) throw new Error("No valid cards found");
                    const res = await importBundleCards(selectedBundle, cards);
                    if (res.count === 0) throw new Error("No valid cards found");
                    showToast(t("fc.importedNCards").replace("{n}", String(res.count)), "success");
                    await reloadCards();
                  } catch (err) {
                    console.error("Import failed", err);
                    showToast(t("fc.importFailed"), "danger");
                  }
                  e.target.value = "";
                }}
              />
            </div>
          )}

          <div
            className={cn(
              "ms-auto flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-widest",
              online ? "border-success/30 bg-success/10 text-success" : "border-danger/30 bg-danger/10 text-danger"
            )}
          >
            {online ? <Wifi size={11} className={pending > 0 ? "animate-pulse" : ""} /> : <WifiOff size={11} />}
            {online ? (pending > 0 ? t("fc.syncing").replace("{n}", String(pending)) : t("fc.online")) : t("fc.offlineQueued").replace("{n}", String(pending))}
          </div>

          {/* Mode tabs — sliding accent underline */}
          <div className="flex gap-1 overflow-x-auto rounded-xl border border-border bg-muted/40 p-1">
            {(["review", "browse", "leeches", "stats"] as const).map((m) => (
              <button
                key={m}
                onClick={() => { setMode(m); setIsFlipped(false); }}
                className={cn(
                  "relative shrink-0 rounded-lg px-4 py-2 text-xs font-bold uppercase tracking-widest transition-colors",
                  mode === m ? "text-accent-fg" : "text-muted-fg hover:text-accent"
                )}
              >
                {mode === m && (
                  <motion.span
                    layoutId="fc-tab-pill"
                    transition={{ type: "spring", stiffness: 500, damping: 40 }}
                    className="absolute inset-0 rounded-lg bg-accent"
                  />
                )}
                <span className="relative z-10">
                  {m === "review" && <Brain size={14} className="me-1 inline" />}
                  {m === "browse" && <Search size={14} className="me-1 inline" />}
                  {m === "leeches" && <AlertTriangle size={14} className="me-1 inline" />}
                  {m === "stats" && <BarChart3 size={14} className="me-1 inline" />}
                  {t(`fc.tab.${m}`)}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ═══════════════ REVIEW MODE ═══════════════ */}
      {/* ═══════════════ MODE ROUTER (spec §3 refactor) ═══════════════ */}
      {mode === "review" && (
        <ReviewMode
          selectedBundle={selectedBundle}
          allDue={allDueParam}
          topicParam={topicParam}
          bundles={bundles}
          loaded={loaded}
          totalDue={totalDue}
          completedCount={completedCount}
          totalReviewed={totalReviewed}
          learningQueueLength={learningQueue.length}
          activeCard={activeCard}
          isFlipped={isFlipped}
          pickedChoice={pickedChoice}
          sprintMode={sprintMode}
          sprintTimer={sprintTimer}
          reviewing={reviewing}
          nowMs={nowMs}
          ttsSupported={ttsSupported}
          speaking={speaking}
          cardKindOf={cardKind}
          maskCloze={maskCloze}
          choiceOptions={choiceOptions}
          onSelectBundle={(id) => setSelectedBundle(id)}
          onOpenCreate={() => setModalOpen(true)}
          onOpenBundleCreate={() => setBundleCreateOpen(true)}
          onFlip={() => setIsFlipped((f) => !f)}
          onFlipTo={(v) => setIsFlipped(v)}
          onPickChoice={(opt) => {
            setPickedChoice(opt);
            setIsFlipped(true);
          }}
          onRate={handleReview}
          onToggleSprint={() => setSprintMode((s) => !s)}
          onStudyAgain={() => {
            setCompletedCount(0);
            setTotalReviewed(0);
            totalReviewedRef.current = 0;
            // Allow the next run to auto-log its own study session —
            // this ref previously stayed true forever, so only the
            // first run per page load was ever logged.
            sessionLoggedRef.current = false;
            sessionRef.current = { reviewed: 0, correct: 0, startedAt: 0 };
            loadDueCards();
          }}
          onBackToBundles={() => setSelectedBundle("")}
          onSpeak={speak}
          onStopTts={stopTts}
        />
      )}

      {mode === "browse" && (
        <BrowseMode
          browseScope={browseScope}
          onScopeChange={setBrowseScope}
          browseQuery={browseQuery}
          onQueryChange={setBrowseQuery}
          browseLoaded={browseLoaded}
          browseFilteredCards={browseFilteredCards}
          bundles={bundles}
          browseSelected={browseSelected}
          browseFlipped={browseFlipped}
          allBrowseSelected={allBrowseSelected}
          nowMs={nowMs}
          onSelectToggle={toggleBrowseSelect}
          onSelectAllToggle={toggleBrowseSelectAll}
          onFlipToggle={(id) =>
            setBrowseFlipped((prev) => {
              const n = new Set(prev);
              if (n.has(id)) n.delete(id);
              else n.add(id);
              return n;
            })
          }
          onOpenBundle={(id) => router.push(`/bundles/${id}/cards`)}
          onEditCard={(card) => {
            setEditCard(card);
            setEditFront(card.front);
            setEditBack(card.back);
            setEditFrontDesc((card as any).frontDescription ?? "");
            setEditBackDesc((card as any).backDescription ?? card.description ?? "");
            setEditTags(card.tags?.map((t) => t.tag.name) ?? []);
            setEditKind(cardKind(card));
            setEditChoicesText((card.choices ?? []).join("\n"));
            setEditError("");
          }}
          onDeleteCard={(card) => setDeleteTarget(card)}
          onBatchDelete={handleBatchDelete}
          onBatchTag={() => setBatchTagModalOpen(true)}
          onBatchMove={() => setBatchMoveModalOpen(true)}
          cardKindOf={cardKind}
        />
      )}

      {mode === "leeches" && (
        <LeechesMode
          leechLoaded={leechLoaded}
          leechCards={leechCards}
          onUnleech={async (id) => {
            await unLeechCard(id);
            setLeechCards((prev) => prev.filter((c) => c.id !== id));
          }}
        />
      )}

      {mode === "stats" && (
        <StatsMode
          streak={streak}
          reviewsToday={reviewsToday}
          leechCount={statsLeechCount}
          heatmap={heatmap}
        />
      )}

      {/* ═══════════════ CREATE MODAL ═══════════════ */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={t("fc.newFlashcard")}>
        <div className="space-y-6">
          {!selectedBundle && (
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-widest text-muted-fg">{t("notes.topic")}</label>
              <SubjectTopicSelect subjects={subjects} value={selectedTopicId} onChange={setSelectedTopicId} onSubjectsChange={setSubjects} />
            </div>
          )}
          {selectedBundle && (
            <div className="inline-flex items-center gap-2 rounded-full border border-accent/50 bg-accent/5 px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-widest text-accent">
              <Layers size={12} />
              <span>{t("fc.bundle")}</span>
              <span className="h-3 w-px bg-accent/40" />
              <span>{bundles.find((b) => b.id === selectedBundle)?.name}</span>
            </div>
          )}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold uppercase tracking-widest text-muted-fg">{t("fc.frontQuestion")}</label>
              <ImageUploadButton onImage={(md) => setFront((prev) => prev ? `${prev} ${md}` : md)} label={t("fc.image")} />
            </div>
            <Input placeholder={t("fc.frontExample")} value={front} onChange={(e) => setFront(e.target.value)}
              onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") handleCreate(); }}
            />
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold uppercase tracking-widest text-muted-fg">{t("fc.backAnswer")}</label>
              <ImageUploadButton onImage={(md) => setBack((prev) => prev ? `${prev} ${md}` : md)} label={t("fc.image")} />
            </div>
            <Input placeholder={t("fc.backExample")} value={back} onChange={(e) => setBack(e.target.value)}
              onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") handleCreate(); }}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-widest text-muted-fg">{t("fc.frontDesc")}</label>
            <Input placeholder={t("fc.hintQuestion")} value={frontDesc} onChange={(e) => setFrontDesc(e.target.value)}
              onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") handleCreate(); }}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-widest text-muted-fg">{t("fc.backDesc")}</label>
            <Input placeholder={t("fc.hintAnswer")} value={backDesc} onChange={(e) => setBackDesc(e.target.value)}
              onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") handleCreate(); }}
            />
          </div>
          <CardKindFields kind={kind} onKindChange={setKind} choicesText={choicesText} onChoicesTextChange={setChoicesText} />
          <p className="text-[10px] text-muted-fg uppercase tracking-widest">{t("fc.cmdEnterToSave")}</p>
          {createError && <p className="text-[10px] font-bold uppercase tracking-widest text-danger">{createError}</p>}
          <div className="flex justify-end gap-4 pt-4">
            <Button variant="ghost" onClick={() => setModalOpen(false)}>{t("common.cancel")}</Button>
            <Button onClick={handleCreate} disabled={creating || !front.trim() || !back.trim()}>
              {creating ? t("fc.creating") : t("common.create")}
            </Button>
          </div>
        </div>
      </Modal>

      {/* ═══════════════ EDIT MODAL ═══════════════ */}
      <Modal open={!!editCard} onClose={() => setEditCard(null)} title={t("fc.editFlashcard")}>
        {editCard && (
          <div className="space-y-6">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold uppercase tracking-widest text-muted-fg">{t("fc.frontQuestion")}</label>
                <ImageUploadButton onImage={(md) => setEditFront((prev) => prev ? `${prev} ${md}` : md)} label={t("fc.image")} />
              </div>
              <Input value={editFront} onChange={(e) => setEditFront(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold uppercase tracking-widest text-muted-fg">{t("fc.backAnswer")}</label>
                <ImageUploadButton onImage={(md) => setEditBack((prev) => prev ? `${prev} ${md}` : md)} label={t("fc.image")} />
              </div>
              <Input value={editBack} onChange={(e) => setEditBack(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-widest text-muted-fg">{t("fc.frontDesc")}</label>
              <Input placeholder={t("fc.hintQuestion")} value={editFrontDesc} onChange={(e) => setEditFrontDesc(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-widest text-muted-fg">{t("fc.backDesc")}</label>
              <Input placeholder={t("fc.hintAnswer")} value={editBackDesc} onChange={(e) => setEditBackDesc(e.target.value)} />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-widest text-muted-fg">{t("notes.tags")}</label>
              <TagInput tags={editTags} onChange={setEditTags} />
            </div>
            <CardKindFields kind={editKind} onKindChange={setEditKind} choicesText={editChoicesText} onChoicesTextChange={setEditChoicesText} />
            {editError && <p className="text-[10px] font-bold uppercase tracking-widest text-danger">{editError}</p>}
            <div className="flex justify-end gap-4 pt-4">
              <Button variant="ghost" onClick={() => setEditCard(null)}>{t("common.cancel")}</Button>
              <Button onClick={handleEditSave} disabled={saving || !editFront.trim() || !editBack.trim()}>
                {saving ? t("fc.saving") : t("common.save")}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* ═══════════════ DELETE MODAL ═══════════════ */}
      <Modal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} title={t("fc.deleteFlashcard")}>
        {deleteTarget && (
          <div className="space-y-6">
            <p className="text-sm text-muted-fg">{t("fc.deleteConfirm")}</p>
            <div className="rounded-2xl border border-border bg-muted/20 p-4">
              <p className="text-sm font-bold tracking-tight">{deleteTarget.front}</p>
              <p className="mt-1 text-xs text-muted-fg">{deleteTarget.back}</p>
            </div>
            <div className="flex justify-end gap-4 pt-2">
              <Button variant="ghost" onClick={() => setDeleteTarget(null)}>{t("common.cancel")}</Button>
              <Button variant="danger" onClick={handleDelete} disabled={deleting}>
                {deleting ? t("fc.deleting") : t("common.delete")}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* ═══════════════ EDIT BUNDLE MODAL ═══════════════ */}
      <Modal open={editBundleOpen} onClose={() => setEditBundleOpen(false)} title={t("fc.editBundle")}>
        <div className="space-y-6">
          <Input
            label={t("fc.name")}
            value={editBundleName}
            onChange={(e) => setEditBundleName(e.target.value)}
          />
          <Input
            label={t("fc.descriptionOptional")}
            value={editBundleDesc}
            onChange={(e) => setEditBundleDesc(e.target.value)}
          />
          <BundleColorPicker value={editBundleColor} onChange={setEditBundleColor} />
          <div className="flex justify-end gap-4 pt-4">
            <Button variant="ghost" onClick={() => setEditBundleOpen(false)}>{t("common.cancel")}</Button>
            <Button
              onClick={async () => {
                if (!selectedBundle || !editBundleName.trim()) return;
                setSavingBundle(true);
                try {
                  await editBundleFromFlashcards(selectedBundle, {
                    name: editBundleName.trim(),
                    description: editBundleDesc.trim() || undefined,
                    color: editBundleColor,
                  });
                  setBundles((prev) => prev.map((b) => b.id === selectedBundle ? { ...b, name: editBundleName.trim(), description: editBundleDesc.trim() || undefined, color: editBundleColor } : b) as typeof prev);
                  setEditBundleOpen(false);
                } catch (e) {
                  console.error(t("ui.failed_to_edit_bundle"), e);
                } finally {
                  setSavingBundle(false);
                }
              }}
              disabled={savingBundle}
            >
              {savingBundle ? t("fc.saving") : t("common.save")}
            </Button>
          </div>
        </div>
      </Modal>

      {/* ═══════════════ CREATE BUNDLE MODAL ═══════════════ */}
      <Modal open={bundleCreateOpen} onClose={() => setBundleCreateOpen(false)} title={t("fc.newBundle")}>
        <div className="space-y-5">
          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-widest text-muted-fg">{t("fc.name")}</label>
            <Input
              autoFocus
              placeholder={t("fc.bundleNameExample")}
              value={newBundleName}
              onChange={(e) => setNewBundleName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleCreateBundle(); }}
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-widest text-muted-fg">{t("fc.descriptionOptional")}</label>
            <Input
              placeholder={t("fc.deckContentsExample")}
              value={newBundleDesc}
              onChange={(e) => setNewBundleDesc(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-widest text-muted-fg">{t("fc.color")}</label>
            <BundleColorPicker value={newBundleColor} onChange={setNewBundleColor} />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-widest text-muted-fg">{t("fc.subjectTopicOptional")}</label>
            <SubjectTopicMenu
              subjects={subjects}
              subjectId={newBundleSubjectId}
              topicId={newBundleTopicId}
              onSubjectChange={setNewBundleSubjectId}
              onTopicChange={setNewBundleTopicId}
              subjectOptional
            />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="secondary" onClick={() => setBundleCreateOpen(false)}>{t("common.cancel")}</Button>
            <Button onClick={handleCreateBundle} disabled={!newBundleName.trim() || creatingBundle}>
              <Plus size={16} />
              {creatingBundle ? t("fc.creating") : t("fc.createBundle")}
            </Button>
          </div>
        </div>
      </Modal>

      {/* ═══════════════ BATCH TAG MODAL ═══════════════ */}
      <Modal open={batchTagModalOpen} onClose={() => setBatchTagModalOpen(false)} title={t("fc.batchTagTitle")}>
        <div className="space-y-6">
          <p className="text-sm text-muted-fg">{t("fc.batchTagHint").replace("{n}", String(browseSelected.size))}</p>
          <Input
            label={t("fc.tagsCommaSeparated")}
            placeholder={t("fc.tagsExample")}
            value={batchTagInput}
            onChange={(e) => setBatchTagInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleBatchTag(); }}
          />
          <div className="flex justify-end gap-4 pt-4">
            <Button variant="ghost" onClick={() => setBatchTagModalOpen(false)}>{t("common.cancel")}</Button>
            <Button onClick={handleBatchTag} disabled={!batchTagInput.trim()}>{t("fc.applyTags")}</Button>
          </div>
        </div>
      </Modal>

      {/* ═══════════════ BATCH MOVE MODAL ═══════════════ */}
      <Modal open={batchMoveModalOpen} onClose={() => setBatchMoveModalOpen(false)} title={t("fc.batchMoveTitle")}>
        <div className="space-y-6">
          <p className="text-sm text-muted-fg">{t("fc.batchMoveHint").replace("{n}", String(browseSelected.size))}</p>
          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-widest text-muted-fg">{t("fc.targetBundle")}</label>
            <select
              value={batchMoveTarget}
              onChange={(e) => setBatchMoveTarget(e.target.value)}
              className="h-10 w-full rounded-xl border border-border bg-bg px-3 text-sm text-fg focus:outline-none"
            >
              <option value="" className="bg-bg text-fg">{t("fc.noBundleUnassigned")}</option>
              {bundles.map((b) => (
                <option key={b.id} value={b.id} className="bg-bg text-fg">{b.name}</option>
              ))}
            </select>
          </div>
          <div className="flex justify-end gap-4 pt-4">
            <Button variant="ghost" onClick={() => setBatchMoveModalOpen(false)}>{t("common.cancel")}</Button>
            <Button onClick={handleBatchMove}>{t("fc.moveCards")}</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

export default function FlashcardsPage() {
  return (
    <Suspense fallback={<div className="page-gutter cq"><Skeleton className="h-[400px] w-full" /></div>}>
      <FlashcardsContent />
    </Suspense>
  );
}