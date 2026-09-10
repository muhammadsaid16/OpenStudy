"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Plus,
  Pencil,
  Trash2,
  GalleryHorizontalEnd,
  Search,
  ArrowLeft,
  Upload,
  Download,
  Link2,
  Check,
} from "lucide-react";
import { Button, Modal, Input, EmptyState, Skeleton } from "@/components/ui";
import { RevealHeading } from "@/components/reveal-heading";
import { BulkActionBar } from "@/components/bulk-action-bar";
import { TagInput } from "@/components/tag-input";
import {
  getBundleCards,
  createBundleFlashcard,
  updateFlashcard,
  deleteFlashcard,
  getBundles,
  importCardsIntoBundle,
  exportBundle,
  getAllDueFlashcards,
  reviewFlashcardWithLog,
} from "@/app/actions";
import { parseCardsFile } from "@/lib/parsers/cards";
import { ShareBundleButton } from "@/components/share-bundle-button";
import { showToast } from "@/components/toast";
import { cn } from "@/lib/utils";
import type { BundleRec, CardKind } from "@/lib/db";
import { cardKind, cleanChoices, shuffled } from "@/lib/card-kinds";
import { CardKindFields } from "@/components/card-kind-fields";
import { RATING_BUTTONS } from "@/lib/card-status";

type CardTag = { tag: { id: string; name: string } };

type Card = {
  id: string;
  front: string;
  back: string;
  frontDescription?: string | null;
  backDescription?: string | null;
  description?: string | null;
  kind?: CardKind | null;
  choices?: string[] | null;
  reviewCount: number;
  nextReview: Date | string;
  tags: CardTag[];
};

export default function BundleCardsPage() {
  const params = useParams<{ id: string }>();
  const bundleId = params.id;
  const router = useRouter();

  const [bundleName, setBundleName] = useState<string>("");
  const [bundleColor, setBundleColor] = useState<string>("#DFE104");
  const [bundleTopicLabel, setBundleTopicLabel] = useState<string | null>(null);
  const [allBundles, setAllBundles] = useState<BundleRec[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [cards, setCards] = useState<Card[]>([]);
  const [loaded, setLoaded] = useState(false);
  // wall clock — captured once in the mount effect (react-hooks/purity bans Date.now() in render)
  const [nowMs, setNowMs] = useState(0);

  const [searchQuery, setSearchQuery] = useState("");
  const [filterTag, setFilterTag] = useState("all");
  const [flippedIds, setFlippedIds] = useState<Set<string>>(new Set());
  const [copied, setCopied] = useState(false);

  // Create modal
  const [createOpen, setCreateOpen] = useState(false);
  const [front, setFront] = useState("");
  const [back, setBack] = useState("");
  const [frontDesc, setFrontDesc] = useState("");
  const [backDesc, setBackDesc] = useState("");
  const [createKind, setCreateKind] = useState<CardKind>("basic");
  const [createChoicesText, setCreateChoicesText] = useState("");
  const [createTags, setCreateTags] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");

  // Edit/Delete
  const [editCard, setEditCard] = useState<Card | null>(null);
  const [editFront, setEditFront] = useState("");
  const [editBack, setEditBack] = useState("");
  const [editFrontDesc, setEditFrontDesc] = useState("");
  const [editBackDesc, setEditBackDesc] = useState("");
  const [editKind, setEditKind] = useState<CardKind>("basic");
  const [editChoicesText, setEditChoicesText] = useState("");
  const [editTags, setEditTags] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Card | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Import
  const [importing, setImporting] = useState(false);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [reviewQueue, setReviewQueue] = useState<Card[]>([]);
  const [reviewIndex, setReviewIndex] = useState(0);
  const [learningQueue, setLearningQueue] = useState<Card[]>([]);
  const [isFlipped, setIsFlipped] = useState(false);
  const [isReviewing, setIsReviewing] = useState(false);
  const [reviewing, setReviewing] = useState(false);

  const load = useCallback(async () => {
    const [bundleCards, bundles] = await Promise.all([
      getBundleCards(bundleId),
      getBundles(),
    ]);
    setCards(bundleCards as unknown as Card[]);
    setAllBundles(bundles);
    const b = bundles.find((x) => x.id === bundleId);
    if (b) {
      setBundleName(b.name);
      setBundleColor(b.color || "#DFE104");
      const t = (b as unknown as { topic?: { name: string; subject?: { name: string } | null } | null }).topic;
      if (t) setBundleTopicLabel(`${t.subject?.name ? `${t.subject.name} › ` : ""}${t.name}`);
      else setBundleTopicLabel(null);
    }
    setLoaded(true);
  }, [bundleId]);

  useEffect(() => {
    let active = true;
    (async () => {
      await load();
      if (!active) return;
    })();
    return () => {
      active = false;
    };
  }, [load]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNowMs(Date.now());
  }, []);

  // Distinct tag names across this bundle's cards
  const allTags = useMemo(() => {
    const set = new Set<string>();
    cards.forEach((c) => c.tags.forEach((t) => set.add(t.tag.name)));
    return Array.from(set).sort();
  }, [cards]);

  const filteredCards = useMemo(() => {
    return cards.filter((card) => {
      const q = searchQuery.toLowerCase();
      const matchesSearch =
        !q ||
        card.front.toLowerCase().includes(q) ||
        card.back.toLowerCase().includes(q) ||
        ((card as any).frontDescription ?? "").toLowerCase().includes(q) ||
        ((card as any).backDescription ?? "").toLowerCase().includes(q) ||
        (card.description ?? "").toLowerCase().includes(q);
      const matchesTag =
        filterTag === "all" || card.tags.some((t) => t.tag.name === filterTag);
      return matchesSearch && matchesTag;
    });
  }, [cards, searchQuery, filterTag]);

  const toggleFlip = (id: string) => {
    setFlippedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleCreate = async () => {
    if (!front.trim() || !back.trim()) return;
    setCreateError("");
    setCreating(true);
    try {
      await createBundleFlashcard({
        bundleId,
        front: front.trim(),
        back: back.trim(),
        frontDescription: frontDesc.trim() || undefined,
        backDescription: backDesc.trim() || undefined,
        tags: createTags.length ? createTags : undefined,
        kind: createKind,
        choices: createKind === "choice" ? cleanChoices(createChoicesText.split("\n")) : undefined,
      });
      setCreateOpen(false);
      setFront("");
      setBack("");
      setFrontDesc(""); setBackDesc("");
      setCreateKind("basic");
      setCreateChoicesText("");
      setCreateTags([]);
      setLoaded(false);
      await load();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message.slice(0, 140) : "Could not create card.");
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
        tags: editTags,
        kind: editKind,
        choices: editKind === "choice" ? cleanChoices(editChoicesText.split("\n")) : undefined,
      });
      setEditCard(null);
      setLoaded(false);
      await load();
    } catch (err) {
      setEditError(err instanceof Error ? err.message.slice(0, 140) : "Could not save card.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteFlashcard(deleteTarget.id);
      setDeleteTarget(null);
      setLoaded(false);
      await load();
    } finally {
      setDeleting(false);
    }
  };

  const handleImport = async (file: File) => {
    setImporting(true);
    try {
      const text = await file.text();
      const parsed = parseCardsFile(text);
      if (!parsed.length) {
        showToast("No valid cards found in file", "warning");
        return;
      }
      const res = await importCardsIntoBundle(bundleId, parsed);
      showToast(`Imported ${res.count} cards`, "success");
      setLoaded(false);
      await load();
    } catch (e) {
      console.error(e);
      showToast("Import failed: invalid file", "danger");
    } finally {
      setImporting(false);
    }
  };

  const startReview = async () => {
    try {
      const allDue = await getAllDueFlashcards();
      const list = (Array.isArray(allDue) ? allDue : []).filter((c: any) => c.bundleId === bundleId) as unknown as Card[];
      if (list.length > 0) {
        setReviewQueue(list);
        setReviewIndex(0);
        setLearningQueue([]);
        setIsFlipped(false);
        setIsReviewing(true);
        return;
      }
      // No due cards — practice fallback: show all bundle cards shuffled
      const allCards = (await getBundleCards(bundleId)) as unknown as Card[];
      if (!allCards || allCards.length === 0) { showToast("No cards in this deck", "info"); return; }
      setReviewQueue(shuffled(allCards));
      setReviewIndex(0);
      setLearningQueue([]);
      setIsFlipped(false);
      setIsReviewing(true);
      showToast("Practice mode — no cards due, showing all cards", "info");
    } catch { showToast("Failed to load cards", "danger"); }
  };

  const handleRate = async (quality: number) => {
    const activeCard: Card | null = (reviewQueue[reviewIndex] as Card | undefined) ?? (learningQueue[0] as Card | undefined) ?? null;
    const servingFromLearningQueue = reviewQueue[reviewIndex] == null;
    if (reviewing || !activeCard) return;
    setReviewing(true);
    try {
      await reviewFlashcardWithLog(activeCard.id, quality);
      if (quality < 3 && !servingFromLearningQueue) {
        setLearningQueue((prev) => [...prev, activeCard as Card]);
      }
      if (!servingFromLearningQueue) {
        if (reviewIndex < reviewQueue.length - 1) {
          setReviewIndex((i) => i + 1);
        } else {
          const hasLearning = quality < 3 ? true : learningQueue.length > 0;
          setReviewQueue([]);
          setReviewIndex(0);
          if (!hasLearning) {
            setIsReviewing(false);
            setLearningQueue([]);
            showToast(`Reviewed ${reviewQueue.length} cards`, "success");
            setLoaded(false);
            await load();
          }
        }
      } else if (quality >= 3) {
        setLearningQueue((prev) => {
          const next = prev.slice(1);
          if (next.length === 0) {
            setIsReviewing(false);
            showToast(`Reviewed ${reviewQueue.length + prev.length} cards`, "success");
            setLoaded(false);
            load();
          }
          return next;
        });
      } else {
        setLearningQueue((prev) => [...prev.slice(1), prev[0]]);
      }
      setIsFlipped(false);
    } catch (e) {
      console.error("review failed", e);
      showToast("Failed to save rating", "danger");
    } finally { setReviewing(false); }
  };

  const exportAsCsv = async () => {
    setExportMenuOpen(false);
    try {
      const all = await getBundleCards(bundleId);
      const header = ["front","back","frontDescription","backDescription","kind","choices","tags"];
      const rows = (all as any[]).map((c) => {
        const esc = (v: string) => `"${String(v ?? "").replace(/"/g, '""')}"`;
        return [
          esc(c.front),
          esc(c.back),
          esc((c as any).frontDescription ?? ""),
          esc((c as any).backDescription ?? c.description ?? ""),
          esc(c.kind ?? "basic"),
          esc((c.choices ?? []).join("|")),
          esc((c.tags ?? []).map((t: any) => t.tag?.name ?? t.name ?? "").join(",")),
        ].join(",");
      });
      const csv = [header.join(","), ...rows].join("\n");
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const safeName = (bundleName || "bundle").replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-") || "bundle";
      a.href = url; a.download = `${safeName}.csv`; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) { console.error("Export CSV failed", e); showToast("Export failed", "danger"); }
  };

  const exportAsJson = async () => {
    setExportMenuOpen(false);
    try {
      const json = await exportBundle(bundleId);
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const rawName = bundleName || "bundle";
      const safeName = rawName.replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-") || "bundle";
      a.href = url; a.download = `${safeName}.json`; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) { console.error("Export failed", e); showToast("Export failed — see console", "danger"); }
  };

  return (
    <div className="min-h-screen bg-bg px-4 py-10 sm:px-8">
      <div className="mx-auto max-w-6xl">
        {/* Header */}
        <div className="mb-8 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push("/bundles")}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border text-muted-fg transition-colors hover:border-accent hover:text-accent hover:bg-accent-soft"
              aria-label="Back to bundles"
            >
              <ArrowLeft size={18} />
            </button>
            <div>
              <div className="flex items-center gap-2">
                <span
                  className="h-3 w-3 rounded-sm"
                  style={{ backgroundColor: bundleColor }}
                />
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-fg">
                  {bundleTopicLabel ? bundleTopicLabel : "Manage cards"}
                </p>
              </div>
              <RevealHeading
                text={bundleName || "Bundle"}
                className="text-2xl font-bold uppercase tracking-tight text-fg"
              />
              {bundleTopicLabel && (
                <p className="mt-1 text-[11px] font-bold uppercase tracking-widest text-muted-fg">
                  Topic: {bundleTopicLabel}
                </p>
              )}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <button
                onClick={() => setExportMenuOpen((o) => !o)}
                className="flex h-10 items-center gap-2 rounded-full border border-border px-3 text-xs font-bold uppercase tracking-widest text-muted-fg transition-colors hover:border-accent hover:text-accent hover:bg-accent-soft"
              >
                <Download size={14} />
                Export
              </button>
              {exportMenuOpen && (
                <>
                  <button className="fixed inset-0 z-10" onClick={() => setExportMenuOpen(false)} aria-label="Close export menu" />
                  <div className="absolute right-0 mt-2 w-44 overflow-hidden rounded-2xl border border-border bg-bg shadow-2xl z-20">
                  <button onClick={exportAsJson} className="flex w-full items-center gap-2 px-4 py-2.5 text-xs font-bold tracking-wide text-fg hover:bg-accent-soft hover:text-accent text-left">
                    <Download size={14} /> JSON
                  </button>
                  <button onClick={exportAsCsv} className="flex w-full items-center gap-2 px-4 py-2.5 text-xs font-bold tracking-wide text-fg hover:bg-accent-soft hover:text-accent text-left border-t border-border">
                    <Download size={14} /> CSV
                  </button>
                </div>
                </>
              )}
            </div>
            <button
              onClick={() => document.getElementById("csv-import")?.click()}
              disabled={importing}
              className="flex h-10 items-center gap-2 rounded-full border border-border px-3 text-xs font-bold uppercase tracking-widest text-muted-fg transition-colors hover:border-accent hover:text-accent hover:bg-accent-soft disabled:opacity-50"
            >
              <Upload size={14} />
              {importing ? "Importing..." : "Import"}
            </button>
            <input
              id="csv-import"
              type="file"
              accept=".json,.csv,.tsv,.txt,application/json,text/csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleImport(f);
                e.target.value = "";
              }}
            />
            <button
              onClick={startReview}
              className="flex h-10 items-center gap-1.5 rounded-full border border-accent bg-accent px-4 text-xs font-bold uppercase tracking-widest text-accent-fg transition-colors hover:opacity-90"
            >
              <span className="h-2 w-2 rounded-full bg-accent-fg animate-pulse" aria-hidden />
              Review
            </button>
            <button
              onClick={async () => {
                try {
                  const url = `${window.location.origin}/share/${bundleId}`;
                  await navigator.clipboard.writeText(url);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                } catch {
                  // fallback
                  const ta = document.createElement("textarea");
                  ta.value = `${window.location.origin}/share/${bundleId}`;
                  document.body.appendChild(ta);
                  ta.select();
                  document.execCommand("copy");
                  ta.remove();
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }
              }}
              className="flex h-10 items-center gap-2 rounded-full border border-accent/60 bg-accent-soft px-3 text-xs font-bold uppercase tracking-widest text-accent transition-colors hover:border-accent"
            >
              {copied ? <Check size={14} /> : <Link2 size={14} />}
              {copied ? "Copied!" : "Share bundle"}
            </button>
            <ShareBundleButton bundleId={bundleId} bundleName={bundleName} />
            <Button onClick={() => setCreateOpen(true)}>
              <Plus size={16} />
              Add card
            </Button>
          </div>
        </div>

        {(() => {
          const activeCard: Card | null = (reviewQueue[reviewIndex] as Card | undefined) ?? (learningQueue[0] as Card | undefined) ?? null;
          const remainingMain = reviewQueue.length > 0 ? reviewQueue.length - reviewIndex : 0;
          const totalDue = remainingMain + learningQueue.length;
          const completed = reviewQueue.length > 0 ? reviewIndex : 0;
          const initialTotal = totalDue + completed;
          if (!isReviewing || !activeCard) return null;
          return (
          <div className="mb-8 mx-auto max-w-2xl space-y-4">
            <div className="flex items-center justify-between text-xs font-bold uppercase tracking-widest text-muted-fg">
              <span>{completed + 1} / {initialTotal} {learningQueue.length > 0 ? `• Relearning × ${learningQueue.length}` : ""}</span>
              <button onClick={() => { setIsReviewing(false); setIsFlipped(false); }} className="rounded-full border border-border px-3 py-1.5 hover:border-accent hover:text-accent hover:bg-accent-soft">Exit</button>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div className="h-full bg-accent transition-all" style={{ width: `${(completed / Math.max(initialTotal, 1)) * 100}%` }} />
            </div>
            {(() => {
              const card = activeCard;
              return (
                <div className="glass rounded-3xl p-8 min-h-[280px] flex flex-col">
                  <div className="flex-1 flex flex-col justify-center text-center">
                    <p className="text-xl font-bold tracking-tight leading-relaxed">{isFlipped ? card.back : card.front}</p>
                    {isFlipped ? (((card as any).backDescription ?? (card as any).description) && <p className="mt-3 text-sm text-muted-fg">{(card as any).backDescription ?? (card as any).description}</p>) : (((card as any).frontDescription) && <p className="mt-3 text-sm text-muted-fg/80">{(card as any).frontDescription}</p>)}
                  </div>
                  {!isFlipped ? (
                    <Button onClick={() => setIsFlipped(true)} className="mt-6 w-full">Show answer</Button>
                  ) : (
                    <div className="mt-6 grid grid-cols-3 gap-2">
                      {RATING_BUTTONS.map((btn) => (
                        <button key={btn.value} onClick={() => handleRate(btn.value)} disabled={reviewing} className={`rounded-xl border px-3 py-3 text-sm font-bold transition-colors disabled:opacity-50 ${btn.color}`}>
                          <span className="block text-xs uppercase tracking-widest">{btn.shortLabel}</span>
                          <span className="block text-[10px] font-normal normal-case opacity-70">{btn.label}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
          );
        })()}

        {/* Search + Tag filter */}
        <div className="mb-6 flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <Search
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-fg"
            />
            <input
              placeholder="Search cards..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-10 w-full rounded-xl border border-border bg-bg pl-10 pr-3 text-sm font-medium tracking-tight text-fg placeholder:text-muted-fg/60 focus:outline-none"
            />
          </div>
          <select
            value={filterTag}
            onChange={(e) => setFilterTag(e.target.value)}
            aria-label="Filter cards by tag"
            className="h-10 rounded-xl border border-border bg-bg px-3 text-sm text-fg focus:outline-none"
          >
            <option value="all" className="bg-bg text-fg">
              All tags
            </option>
            {allTags.map((t) => (
              <option key={t} value={t} className="bg-bg text-fg">
                {t}
              </option>
            ))}
          </select>
          {loaded && filteredCards.length > 0 && (
            <label className="flex h-10 cursor-pointer items-center gap-2 rounded-full border border-border bg-bg px-3 text-xs font-bold uppercase tracking-widest text-fg">
              <input
                type="checkbox"
                aria-label="Select all visible cards"
                checked={filteredCards.length > 0 && filteredCards.every((c) => selectedIds.has(c.id))}
                onChange={(e) => {
                  setSelectedIds((prev) => {
                    const next = new Set(prev);
                    if (e.target.checked) {
                      for (const c of filteredCards) next.add(c.id);
                    } else {
                      for (const c of filteredCards) next.delete(c.id);
                    }
                    return next;
                  });
                }}
                className="h-4 w-4 cursor-pointer accent-accent"
              />
              Select all
            </label>
          )}
        </div>

        {/* Cards grid */}
        {!loaded ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="glass flex min-h-[200px] flex-col rounded-2xl p-5">
                <div className="flex items-center gap-2">
                  <Skeleton className="h-5 w-16 rounded-full" />
                  <Skeleton className="ml-auto h-3 w-12" />
                </div>
                <Skeleton className="mt-4 h-4 w-3/4" />
                <Skeleton className="mt-2 h-4 w-1/2" />
                <Skeleton className="mt-auto h-9 w-full rounded-xl" />
              </div>
            ))}
          </div>
        ) : filteredCards.length === 0 ? (
          <EmptyState
            icon={<GalleryHorizontalEnd size={48} />}
            title={cards.length === 0 ? "No cards yet" : "No cards found"}
            description={
              cards.length === 0
                ? "Add your first flashcard to this bundle."
                : "Try a different search or filter."
            }
          />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filteredCards.map((card) => {
              const flipped = flippedIds.has(card.id);
              const isSelected = selectedIds.has(card.id);
              return (
                <div
                  key={card.id}
                  className={cn(
                    "group relative flex min-h-[200px] flex-col rounded-2xl border p-5 transition-all duration-200",
                    isSelected
                      ? "border-accent bg-accent/5 ring-1 ring-accent/30"
                      : flipped
                      ? "border-accent bg-accent text-accent-fg"
                      : "border-border bg-bg hover:border-accent hover:bg-accent-soft"
                  )}
                >
                  <div className="mb-3 flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={(e) => {
                          setSelectedIds((prev) => {
                            const next = new Set(prev);
                            if (e.target.checked) next.add(card.id);
                            else next.delete(card.id);
                            return next;
                          });
                        }}
                        onClick={(e) => e.stopPropagation()}
                        aria-label={`Select card: ${card.front}`}
                        className="h-4 w-4 cursor-pointer accent-accent"
                      />
                    </div>
                    <div className="flex gap-1">
                      <button
                        onClick={() => {
                          setEditCard(card);
                          setEditFront(card.front);
                          setEditBack(card.back);
                          setEditFrontDesc((card as any).frontDescription ?? "");
                          setEditBackDesc((card as any).backDescription ?? card.description ?? "");
                          setEditKind(cardKind(card));
                          setEditChoicesText((card.choices ?? []).join("\n"));
                          setEditTags(card.tags.map((t) => t.tag.name));
                        }}
                        aria-label="Edit"
                        className={cn("rounded-full p-2.5 transition-colors", flipped ? "text-accent-fg/70 hover:bg-accent-fg/15 hover:text-accent-fg" : "text-muted-fg hover:bg-accent-soft hover:text-accent")}
                      >
                        <Pencil size={13} />
                      </button>
                      <button
                        onClick={() => setDeleteTarget(card)}
                        aria-label="Delete"
                        className={cn("rounded-full p-2.5 transition-colors", flipped ? "text-accent-fg/70 hover:bg-accent-fg/15 hover:text-accent-fg" : "text-muted-fg hover:bg-danger/10 hover:text-danger")}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                  <div
                    className="flex flex-1 cursor-pointer items-center justify-center text-center"
                    onClick={() => toggleFlip(card.id)}
                  >
                    <div>
                      <span
                        className={cn(
                          "mb-2 inline-block text-[10px] font-bold uppercase tracking-widest",
                          flipped ? "text-accent-fg/70" : "text-muted-fg"
                        )}
                      >
                        {flipped ? "Answer" : "Question"}
                        {cardKind(card) !== "basic" && ` • ${cardKind(card)}`}
                      </span>
                      <p className="text-lg font-bold tracking-tight leading-relaxed">
                        {flipped ? card.back : card.front}
                      </p>
                      {(() => {
                        const d = flipped ? ((card as any).backDescription ?? card.description) : (card as any).frontDescription;
                        return d ? (
                          <p
                            className={cn(
                              "mt-2 text-xs leading-relaxed tracking-tight",
                              flipped ? "text-accent-fg/70" : "text-muted-fg"
                            )}
                          >
                            {d}
                          </p>
                        ) : null;
                      })()}
                    </div>
                  </div>
                  {card.tags.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1">
                      {card.tags.map((t) => (
                        <span
                          key={t.tag.id}
                          className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest", flipped ? "bg-accent-fg/15 text-accent-fg" : "bg-muted text-muted-fg")}
                        >
                          {t.tag.name}
                        </span>
                      ))}
                    </div>
                  )}
                  <p className={cn("mt-2 text-center text-[10px] uppercase tracking-widest", flipped ? "text-accent-fg/60" : "text-muted-fg")}>
                    Click to flip • {card.reviewCount} reviews
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <BulkActionBar
        selectedIds={selectedIds}
        bundles={allBundles}
        currentBundleId={bundleId}
        onCleared={() => setSelectedIds(new Set())}
      />

      {/* Create Modal */}
      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="New card">
        <div className="space-y-6">
          <Input
            label="Question (front)"
            placeholder="e.g. What is SM-2?"
            value={front}
            onChange={(e) => setFront(e.target.value)}
          />
          <Input
            label="Answer (back)"
            placeholder="e.g. A spaced repetition algorithm."
            value={back}
            onChange={(e) => setBack(e.target.value)}
          />
          <Input
            label="Front description (optional)"
            placeholder="Hint shown with question"
            value={frontDesc}
            onChange={(e) => setFrontDesc(e.target.value)}
          />
          <Input
            label="Back description (optional)"
            placeholder="Hint shown with answer"
            value={backDesc}
            onChange={(e) => setBackDesc(e.target.value)}
          />
          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-widest text-muted-fg">
              Tags
            </label>
            <TagInput tags={createTags} onChange={setCreateTags} />
          </div>
          <CardKindFields kind={createKind} onKindChange={setCreateKind} choicesText={createChoicesText} onChoicesTextChange={setCreateChoicesText} />
          {createError && <p className="text-[10px] font-bold uppercase tracking-widest text-danger">{createError}</p>}
          <div className="flex justify-end gap-4 pt-4">
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleCreate}
              disabled={creating || !front.trim() || !back.trim()}
            >
              {creating ? "Creating..." : "Create"}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Edit Modal */}
      <Modal open={!!editCard} onClose={() => setEditCard(null)} title="Edit card">
        {editCard && (
          <div className="space-y-6">
            <Input
              label="Question (front)"
              value={editFront}
              onChange={(e) => setEditFront(e.target.value)}
            />
            <Input
              label="Answer (back)"
              value={editBack}
              onChange={(e) => setEditBack(e.target.value)}
            />
            <Input
              label="Front description (optional)"
              placeholder="Hint shown with question"
              value={editFrontDesc}
              onChange={(e) => setEditFrontDesc(e.target.value)}
            />
            <Input
              label="Back description (optional)"
              placeholder="Hint shown with answer"
              value={editBackDesc}
              onChange={(e) => setEditBackDesc(e.target.value)}
            />
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-widest text-muted-fg">
                Tags
              </label>
              <TagInput tags={editTags} onChange={setEditTags} />
            </div>
            <CardKindFields kind={editKind} onKindChange={setEditKind} choicesText={editChoicesText} onChoicesTextChange={setEditChoicesText} />
            {editError && <p className="text-[10px] font-bold uppercase tracking-widest text-danger">{editError}</p>}
            <div className="flex justify-end gap-4 pt-4">
              <Button variant="ghost" onClick={() => setEditCard(null)}>
                Cancel
              </Button>
              <Button
                onClick={handleEditSave}
                disabled={saving || !editFront.trim() || !editBack.trim()}
              >
                {saving ? "Saving..." : "Save"}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Delete Confirmation */}
      <Modal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Delete card"
      >
        {deleteTarget && (
          <div className="space-y-6">
            <p className="text-sm text-muted-fg">
              Delete this card? This cannot be undone.
            </p>
            <div className="flex justify-end gap-4 pt-2">
              <Button variant="ghost" onClick={() => setDeleteTarget(null)}>
                Cancel
              </Button>
              <Button variant="danger" onClick={handleDelete} disabled={deleting}>
                Delete
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}