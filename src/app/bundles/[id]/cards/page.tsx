"use client";

import { useT } from "@/lib/i18n";

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
import { AiGenerateButton } from "@/components/ai-generate-button";
import { AiImportButton } from "@/components/ai-import-button";
import { ReadAloudButton } from "@/components/read-aloud-button";
import { ShareBundleButton } from "@/components/share-bundle-button";
import { showToast } from "@/components/toast";
import { cn } from "@/lib/utils";
import type { BundleRec, CardKind } from "@/lib/db";
import { cardKind, cleanChoices, shuffled } from "@/lib/card-kinds";
import { CardKindFields } from "@/components/card-kind-fields";
import { RATING_BUTTONS } from "@/lib/card-status";
import { useLiveData } from "@/lib/use-live-data";

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
  const t = useT();
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

  // Realtime: deck + cards re-fetch on ANY table change (rename, edit,
  // import, review, another tab…).
  const live = useLiveData(async () => {
    const [bundleCards, bundles] = await Promise.all([
      getBundleCards(bundleId),
      getBundles(),
    ]);
    return { bundleCards, bundles };
  }, [bundleId]);
  useEffect(() => {
    if (!live) return;
    const { bundleCards, bundles } = live;
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
  }, [live, bundleId]);

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
      setCreateError(err instanceof Error ? err.message.slice(0, 140) : t("ui.could_not_create_card"));
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
      setEditError(err instanceof Error ? err.message.slice(0, 140) : t("ui.could_not_save_card"));
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
      showToast(t("toast.importedNCards").replace("{n}", String(res.count)), "success");
      setLoaded(false);
      await load();
    } catch (e) {
      console.error(e);
      showToast(t("fc.importFailed"), "danger");
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
      showToast(t("fc.practiceMode"), "info");
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
            showToast(t("toast.reviewedNCards").replace("{n}", String(reviewQueue.length)), "success");
            setLoaded(false);
            await load();
          }
        }
      } else if (quality >= 3) {
        setLearningQueue((prev) => {
          const next = prev.slice(1);
          if (next.length === 0) {
            setIsReviewing(false);
            showToast(t("toast.reviewedNCards").replace("{n}", String(reviewQueue.length + prev.length)), "success");
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
    } catch (e) { console.error("Export failed", e); showToast(t("fc.exportFailed"), "danger"); }
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
              aria-label={t("cards.backToBundles")}
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
                  {bundleTopicLabel ? bundleTopicLabel : t("cards.manageTitle")}
                </p>
              </div>
              <RevealHeading
                text={bundleName || t("fc.bundle")}
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
                {t("common.export")}
              </button>
              {exportMenuOpen && (
                <>
                  <button className="fixed inset-0 z-10" onClick={() => setExportMenuOpen(false)} aria-label={t("common.closeExport")} />
                  <div className="absolute end-0 mt-2 w-44 overflow-hidden rounded-2xl border border-border bg-bg shadow-2xl z-20">
                  <button onClick={exportAsJson} className="flex w-full items-center gap-2 px-4 py-2.5 text-xs font-bold tracking-wide text-fg hover:bg-accent-soft hover:text-accent text-start">
                    <Download size={14} />{t("ui.json")}</button>
                  <button onClick={exportAsCsv} className="flex w-full items-center gap-2 px-4 py-2.5 text-xs font-bold tracking-wide text-fg hover:bg-accent-soft hover:text-accent text-start border-t border-border">
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
              {importing ? t("common.importing") : t("common.import")}
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
              {t("deckCard.review")}
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
              {copied ? t("cards.copied") : t("cards.shareBundleBtn")}
            </button>
            <ShareBundleButton bundleId={bundleId} bundleName={bundleName} />
            <AiImportButton bundleId={bundleId} bundleName={bundleName} availableBundles={allBundles} onImported={load} />
            <AiGenerateButton bundles={allBundles} defaultBundleId={bundleId} onCreated={load} />
            <Button onClick={() => setCreateOpen(true)}>
              <Plus size={16} />
              {t("cards.addCard")}
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
              <button onClick={() => { setIsReviewing(false); setIsFlipped(false); }} className="rounded-full border border-border px-3 py-1.5 hover:border-accent hover:text-accent hover:bg-accent-soft">{t("cards.exit")}</button>
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
                    <Button onClick={() => setIsFlipped(true)} className="mt-6 w-full">{t("cards.showAnswer")}</Button>
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
              className="absolute start-3 top-1/2 -translate-y-1/2 text-muted-fg"
            />
            <input
              placeholder={t("cards.searchCards")}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-10 w-full rounded-xl border border-border bg-bg ps-10 pe-3 text-sm font-medium tracking-tight text-fg placeholder:text-muted-fg/60 focus:outline-none"
            />
          </div>
          <select
            value={filterTag}
            onChange={(e) => setFilterTag(e.target.value)}
            aria-label={t("cards.filterByTag")}
            className="h-10 rounded-xl border border-border bg-bg px-3 text-sm text-fg focus:outline-none"
          >
            <option value="all" className="bg-bg text-fg">{t("cards.allTags")}</option>
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
                aria-label={t("cards.selectAll")}
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
              />{t("cards.selectAll2")}</label>
          )}
        </div>

        {/* Cards grid */}
        {!loaded ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="glass flex min-h-[200px] flex-col rounded-2xl p-5">
                <div className="flex items-center gap-2">
                  <Skeleton className="h-5 w-16 rounded-full" />
                  <Skeleton className="ms-auto h-3 w-12" />
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
            title={cards.length === 0 ? t("cards.noCardsYet") : t("cards.noCardsFound")}
            description={
              cards.length === 0
                ? t("cards.addFirstDesc")
                : t("ui.try_a_different_search_or_filter")
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
                        aria-label={t("common.edit")}
                        className={cn("rounded-full p-2.5 transition-colors", flipped ? "text-accent-fg/70 hover:bg-accent-fg/15 hover:text-accent-fg" : "text-muted-fg hover:bg-accent-soft hover:text-accent")}
                      >
                        <Pencil size={13} />
                      </button>
                      <span onClick={(e) => e.stopPropagation()} className="inline-flex">
                        <ReadAloudButton
                          text={`${flipped ? card.back : card.front}${(() => { const d = flipped ? ((card as any).backDescription ?? (card as any).description) : (card as any).frontDescription; return d ? ". " + d : ""; })()}`}
                          size={13}
                          className={cn(flipped ? "border-accent-fg/20 text-accent-fg/80 hover:bg-accent-fg/15" : "")}
                        />
                      </span>
                      <button
                        onClick={() => setDeleteTarget(card)}
                        aria-label={t("common.delete")}
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
                        {flipped ? t("cards.answerLabel") : t("cards.questionLabel")}
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
      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title={t("modal.newCard")}>
        <div className="space-y-6">
          <Input
            label={t("cards.questionFront")}
            placeholder="e.g. What is SM-2?"
            value={front}
            onChange={(e) => setFront(e.target.value)}
          />
          <Input
            label={t("cards.answerBack")}
            placeholder="e.g. A spaced repetition algorithm."
            value={back}
            onChange={(e) => setBack(e.target.value)}
          />
          <Input
            label={t("fc.frontDesc")}
            placeholder={t("modal.hintQuestion")}
            value={frontDesc}
            onChange={(e) => setFrontDesc(e.target.value)}
          />
          <Input
            label={t("fc.backDesc")}
            placeholder={t("modal.hintAnswer")}
            value={backDesc}
            onChange={(e) => setBackDesc(e.target.value)}
          />
          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-widest text-muted-fg">{t("notes.tags")}</label>
            <TagInput tags={createTags} onChange={setCreateTags} />
          </div>
          <CardKindFields kind={createKind} onKindChange={setCreateKind} choicesText={createChoicesText} onChoicesTextChange={setCreateChoicesText} />
          {createError && <p className="text-[10px] font-bold uppercase tracking-widest text-danger">{createError}</p>}
          <div className="flex justify-end gap-4 pt-4">
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>{t("common.cancel")}</Button>
            <Button
              onClick={handleCreate}
              disabled={creating || !front.trim() || !back.trim()}
            >
              {creating ? "Creating..." : t("common.create")}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Edit Modal */}
      <Modal open={!!editCard} onClose={() => setEditCard(null)} title={t("modal.editCard")}>
        {editCard && (
          <div className="space-y-6">
            <Input
              label={t("cards.questionFront")}
              value={editFront}
              onChange={(e) => setEditFront(e.target.value)}
            />
            <Input
              label={t("cards.answerBack")}
              value={editBack}
              onChange={(e) => setEditBack(e.target.value)}
            />
            <Input
              label={t("fc.frontDesc")}
              placeholder={t("modal.hintQuestion")}
              value={editFrontDesc}
              onChange={(e) => setEditFrontDesc(e.target.value)}
            />
            <Input
              label={t("fc.backDesc")}
              placeholder={t("modal.hintAnswer")}
              value={editBackDesc}
              onChange={(e) => setEditBackDesc(e.target.value)}
            />
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-widest text-muted-fg">{t("notes.tags")}</label>
              <TagInput tags={editTags} onChange={setEditTags} />
            </div>
            <CardKindFields kind={editKind} onKindChange={setEditKind} choicesText={editChoicesText} onChoicesTextChange={setEditChoicesText} />
            {editError && <p className="text-[10px] font-bold uppercase tracking-widest text-danger">{editError}</p>}
            <div className="flex justify-end gap-4 pt-4">
              <Button variant="ghost" onClick={() => setEditCard(null)}>{t("common.cancel")}</Button>
              <Button
                onClick={handleEditSave}
                disabled={saving || !editFront.trim() || !editBack.trim()}
              >
                {saving ? "Saving..." : t("ui.save")}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Delete Confirmation */}
      <Modal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title={t("modal.deleteCard")}
      >
        {deleteTarget && (
          <div className="space-y-6">
            <p className="text-sm text-muted-fg">
              Delete this card? This cannot be undone.
            </p>
            <div className="flex justify-end gap-4 pt-2">
              <Button variant="ghost" onClick={() => setDeleteTarget(null)}>{t("common.cancel")}</Button>
              <Button variant="danger" onClick={handleDelete} disabled={deleting}>{t("common.delete")}</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}