"use client";

import { useState, useEffect, useTransition } from "react";
import { Plus, Trash2, BookOpen, Pencil, Layers, FileText, ExternalLink, Link2, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { Card, Button, Modal, Input, EmptyState, Skeleton } from "@/components/ui";
import { formatDuration, formatRelative } from "@/lib/utils";
import { RevealHeading } from "@/components/reveal-heading";
import { ScrambleSubtitle } from "@/components/scramble-subtitle";
import {
  getSubjects,
  createSubject,
  deleteSubject,
  createTopic,
  getTopics,
  updateTopic,
  deleteTopic,
  updateSubject,
  getBundles,
  getBundlesByTopic,
  createBundleFromTopic,
  linkBundleToTopic,
  createBundle,
  importCardsIntoBundle,
  getAllDueFlashcards,
  reviewFlashcardWithLog,
} from "@/app/actions";
import { SubjectTopicMenu } from "@/components/subject-topic-menu";
import { RATING_BUTTONS } from "@/lib/card-status";
import { parseSharedBundle } from "@/lib/share";
import { showToast } from "@/components/toast";
import { db } from "@/lib/db";
import { BundleColorPicker } from "@/components/bundle-color-picker";
import { SubjectIconPicker, SUBJECT_ICONS } from "@/components/subject-icon-picker";
import { readableOn } from "@/lib/utils";
import { tiltHandlers } from "@/lib/interactions";

type Subject = Awaited<ReturnType<typeof getSubjects>>[number];
type Bundle = Awaited<ReturnType<typeof getBundles>>[number];

export default function SubjectsPage() {
  const router = useRouter();
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState("#DFE104");
  const [icon, setIcon] = useState("book-open");
  const [isPending, startTransition] = useTransition();

  // Subject edit state
  const [editSubject, setEditSubject] = useState<Subject | null>(null);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editColor, setEditColor] = useState("#FACC15");
  const [editIcon, setEditIcon] = useState("book-open");

  // Topic management modal state
  const [manageTopicsFor, setManageTopicsFor] = useState<string | null>(null);
  const [manageSubjectsName, setManageSubjectsName] = useState("");
  const [manageSubjectColor, setManageSubjectColor] = useState("#DFE104");
  const [managedTopics, setManagedTopics] = useState<{ id: string; name: string; description: string | null }[]>([]);
  const [topicLoaded, setTopicLoaded] = useState(false);
  const [newTopicName, setNewTopicName] = useState("");
  const [editTopicId, setEditTopicId] = useState<string | null>(null);
  const [editTopicName, setEditTopicName] = useState("");
  const [deleteTopicId, setDeleteTopicId] = useState<string | null>(null);
  const [deleteSubjectId, setDeleteSubjectId] = useState<string | null>(null);
  const [topicSearch, setTopicSearch] = useState("");

  // Per-topic stats: notes / cards / linked bundles
  const [topicStats, setTopicStats] = useState<Record<string, { notes: number; cards: number; bundles: Bundle[] }>>({});
  const [allBundles, setAllBundles] = useState<Bundle[]>([]);
  const [linkTopicId, setLinkTopicId] = useState<string | null>(null);
  const [linkBundleId, setLinkBundleId] = useState("");

  const [topicCounts, setTopicCounts] = useState<Record<string, number>>({});
  const [activeTab, setActiveTab] = useState<"subjects" | "decks" | "study">("subjects");

  // Decks tab state (merged from /bundles)
  const [deckCreateOpen, setDeckCreateOpen] = useState(false);
  const [deckName, setDeckName] = useState("");
  const [deckDesc, setDeckDesc] = useState("");
  const [deckColor, setDeckColor] = useState("#DFE104");
  const [deckSubjectId, setDeckSubjectId] = useState("");
  const [deckTopicId, setDeckTopicId] = useState("");
  const [dueCount, setDueCount] = useState<number | null>(null);
  const [reviewQueue, setReviewQueue] = useState<any[]>([]);
  const [reviewIndex, setReviewIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [isReviewing, setIsReviewing] = useState(false);
  const [reviewing, setReviewing] = useState(false);

  // Keep deckTopicId in sync via SubjectTopicMenu denormalization (handled in action)


  const refreshTopicStats = async (subjectId: string, topicIds: string[]) => {
    const [bundles] = await Promise.all([getBundles()]);
    setAllBundles(bundles as Bundle[]);
    const stats: Record<string, { notes: number; cards: number; bundles: Bundle[] }> = {};
    for (const tid of topicIds) {
      const [notes, cards, linked] = await Promise.all([
        db.notes.where("topicId").equals(tid).count(),
        db.flashcards.where("topicId").equals(tid).count(),
        getBundlesByTopic(tid),
      ]);
      stats[tid] = { notes, cards, bundles: linked as Bundle[] };
    }
    setTopicStats(stats);
  };

  const openManageTopics = async (subjectId: string, subjectName: string) => {
    const subj = subjects.find((s) => s.id === subjectId);
    setManageTopicsFor(subjectId);
    setManageSubjectsName(subjectName);
    setManageSubjectColor(subj?.color || "#DFE104");
    setTopicLoaded(false);
    setNewTopicName("");
    setEditTopicId(null);
    setTopicSearch("");
    setLinkTopicId(null);
    const t = await getTopics(subjectId);
    setManagedTopics(t.map((x) => ({ id: x.id, name: x.name, description: x.description ?? null })));
    setTopicLoaded(true);
    await refreshTopicStats(subjectId, t.map((x) => x.id));
  };

  const handleAddTopic = () => {
    const t = newTopicName.trim();
    if (!t || !manageTopicsFor) return;
    startTransition(async () => {
      await createTopic({ subjectId: manageTopicsFor, name: t });
      const t2 = await getTopics(manageTopicsFor);
      setManagedTopics(t2.map((x) => ({ id: x.id, name: x.name, description: x.description ?? null })));
      setNewTopicName("");
      setTopicCounts((prev) => ({
        ...prev,
        [manageTopicsFor]: (prev[manageTopicsFor] ?? 0) + 1,
      }));
      await refreshTopicStats(manageTopicsFor, t2.map((x) => x.id));
    });
  };

  const handleRenameTopic = (id: string) => {
    const t = editTopicName.trim();
    if (!t) return;
    startTransition(async () => {
      await updateTopic(id, { name: t });
      setManagedTopics((prev) => prev.map((x) => (x.id === id ? { ...x, name: t } : x)));
      setEditTopicId(null);
      setEditTopicName("");
    });
  };

  const handleDeleteTopic = (id: string) => {
    if (!manageTopicsFor) return;
    startTransition(async () => {
      await deleteTopic(id);
      const t2 = await getTopics(manageTopicsFor);
      setManagedTopics(t2.map((x) => ({ id: x.id, name: x.name, description: x.description ?? null })));
      setTopicCounts((prev) => ({
        ...prev,
        [manageTopicsFor]: Math.max(0, (prev[manageTopicsFor] ?? 1) - 1),
      }));
      setDeleteTopicId(null);
      await refreshTopicStats(manageTopicsFor, t2.map((x) => x.id));
    });
  };

  const handleCreateBundleFromTopic = (topicId: string) => {
    if (!manageTopicsFor) return;
    startTransition(async () => {
      const b = await createBundleFromTopic(topicId);
      await refreshTopicStats(manageTopicsFor, managedTopics.map((x) => x.id));
      // quick nav hint: stay here but allow jump
      setTopicStats((prev) => ({
        ...prev,
        [topicId]: { ...prev[topicId], bundles: [...(prev[topicId]?.bundles ?? []), b as Bundle] },
      }));
    });
  };

  const handleLinkBundle = () => {
    if (!linkTopicId || !linkBundleId) return;
    startTransition(async () => {
      await linkBundleToTopic(linkBundleId, linkTopicId);
      setLinkTopicId(null);
      setLinkBundleId("");
      if (manageTopicsFor) await refreshTopicStats(manageTopicsFor, managedTopics.map((x) => x.id));
    });
  };

  const handleCreateDeck = () => {
    if (!deckName.trim()) return;
    startTransition(async () => {
      try {
        await createBundle({ name: deckName.trim(), description: deckDesc.trim() || undefined, color: deckColor, topicId: deckTopicId || null });
        setDeckCreateOpen(false);
        setDeckName("");
        setDeckDesc("");
        setDeckColor("#DFE104");
        setDeckSubjectId("");
        setDeckTopicId("");
        const bundles = await getBundles();
        setAllBundles(bundles as Bundle[]);
      } catch (e) {
        console.error("Failed to create deck", e);
        showToast("Failed to create deck", "danger");
      }
    });
  };

  // Load due count lazily for Study tab
  const loadDueCount = async () => {
    try {
      const due = await getAllDueFlashcards();
      setDueCount(Array.isArray(due) ? due.length : 0);
    } catch { setDueCount(0); }
  };

  const startReview = async () => {
    try {
      const due = await getAllDueFlashcards();
      const list = Array.isArray(due) ? due : [];
      if (list.length === 0) { showToast("No cards due", "info"); return; }
      setReviewQueue(list);
      setReviewIndex(0);
      setIsFlipped(false);
      setIsReviewing(true);
      setActiveTab("study");
    } catch { showToast("Failed to load cards", "danger"); }
  };

  const startReviewForBundle = async (bundleId: string) => {
    try {
      const due = await getAllDueFlashcards();
      const all = Array.isArray(due) ? due : [];
      const list = all.filter((c: any) => c.bundleId === bundleId);
      if (list.length === 0) { showToast("No cards due in this deck", "info"); return; }
      setReviewQueue(list);
      setReviewIndex(0);
      setIsFlipped(false);
      setIsReviewing(true);
      setActiveTab("study");
    } catch { showToast("Failed to load cards", "danger"); }
  };

  const handleRate = async (quality: number) => {
    if (reviewing || reviewIndex >= reviewQueue.length) return;
    const card = reviewQueue[reviewIndex];
    setReviewing(true);
    try {
      await reviewFlashcardWithLog(card.id, quality);
      const next = reviewIndex + 1;
      if (next >= reviewQueue.length) {
        setIsReviewing(false);
        setReviewQueue([]);
        setReviewIndex(0);
        setIsFlipped(false);
        showToast(`Reviewed ${reviewQueue.length} cards`, "success");
        loadDueCount();
        const bundles = await getBundles();
        setAllBundles(bundles as Bundle[]);
      } else {
        setReviewIndex(next);
        setIsFlipped(false);
      }
    } catch (e) {
      console.error("review failed", e);
      showToast("Failed to save rating", "danger");
    } finally { setReviewing(false); }
  };

  useEffect(() => {
    getSubjects().then((s) => {
      setSubjects(s);
      setTopicCounts(
        Object.fromEntries(s.map((x) => [x.id, x._count.topics]))
      );
      setLoaded(true);
    });
    // Load bundles once so the empty state can surface unlinked decks.
    getBundles().then((b) => setAllBundles(b as Bundle[])).catch(() => {});
  }, []);

  useEffect(() => {
    loadDueCount();
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target?.isContentEditable) return;
      if (e.key === "n" || e.key === "N") {
        e.preventDefault();
        setModalOpen(true);
      }
      if (e.key === "Escape") {
        setModalOpen(false);
        setEditSubject(null);
        setManageTopicsFor(null);
        setDeleteTopicId(null);
        setDeleteSubjectId(null);
        setLinkTopicId(null);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const handleCreate = () => {
    if (!name.trim()) return;
    startTransition(async () => {
      const subject = await createSubject({
        name: name.trim(),
        description: description.trim() || undefined,
        color,
        icon,
      });
      setSubjects((prev) => [
        {
          ...subject,
          _count: {
            topics: 0,
            flashcards: 0,
            studySessions: 0,
            minutes: 0,
            lastStudiedAt: null,
            mastered: 0,
          },
        },
        ...prev,
      ]);
      setModalOpen(false);
      setName("");
      setDescription("");
      setIcon("book-open");
    });
  };

  const handleDelete = () => {
    if (!deleteSubjectId) return;
    const id = deleteSubjectId;
    startTransition(async () => {
      await deleteSubject(id);
      setSubjects((prev) => prev.filter((s) => s.id !== id));
      setDeleteSubjectId(null);
    });
  };

  const openEditSubject = (subject: Subject) => {
    setEditSubject(subject);
    setEditName(subject.name);
    setEditDescription(subject.description ?? "");
    setEditColor(subject.color || "#FACC15");
    setEditIcon(subject.icon || "book-open");
  };

  const handleEditSave = () => {
    if (!editSubject || !editName.trim()) return;
    startTransition(async () => {
      const desc = editDescription.trim();
      await updateSubject(editSubject.id, { name: editName.trim(), description: desc, color: editColor, icon: editIcon });
      setSubjects((prev) =>
        prev.map((s) =>
          s.id === editSubject.id
            ? { ...s, name: editName.trim(), description: desc || null, color: editColor, icon: editIcon }
            : s
        )
      );
      setEditSubject(null);
    });
  };

  const filteredTopics = managedTopics.filter((t) =>
    !topicSearch.trim() ? true : t.name.toLowerCase().includes(topicSearch.toLowerCase())
  );

  return (
    <div className="p-8 lg:p-12">
      {/* Header — Library merges Subjects + Flashcards + Bundles */}
      <div className="mb-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <RevealHeading text="Library" className="text-5xl lg:text-8xl" />
            <ScrambleSubtitle
              text="Subjects → Topics → Decks → Cards — one hierarchy"
              className="mt-4 text-sm text-muted-fg uppercase tracking-widest"
            />
          </div>
          {activeTab === "subjects" && !(loaded && subjects.length === 0) && (
            <Button onClick={() => setModalOpen(true)}>
              <Plus size={16} />
              New subject
            </Button>
          )}
          {activeTab === "decks" && !(loaded && allBundles.length === 0) && (
            <div className="flex gap-2">
              <input id="lib-share-import" type="file" accept=".json,application/json" className="hidden" onChange={async (e) => {
                const f = e.target.files?.[0]; (e.target as HTMLInputElement).value = "";
                if (!f) return;
                try {
                  const shared = parseSharedBundle(JSON.parse(await f.text()));
                  const created = await createBundle({ name: shared.name, description: shared.description });
                  await importCardsIntoBundle(created.id, shared.cards.map((c: any) => ({ front: c.front, back: c.back, description: c.description, tags: c.tags, kind: c.kind, choices: c.choices })));
                  const bundles = await getBundles();
                  setAllBundles(bundles as Bundle[]);
                  showToast(`Imported ${shared.cards.length} cards into ${shared.name}`, "success");
                } catch { showToast("Import failed: not a valid share file.", "danger"); }
              }} />
              <Button variant="secondary" onClick={() => document.getElementById("lib-share-import")?.click()}>Import share</Button>
              <Button onClick={() => setDeckCreateOpen(true)}>
                <Plus size={16} />
                New deck
              </Button>
            </div>
          )}
        </div>
        {/* Tabs */}
        <div className="mt-8 flex gap-2 border-b border-border">
          {[
            { id: "subjects", label: "Subjects", count: loaded ? subjects.length : undefined },
            { id: "decks", label: "Decks", count: loaded ? allBundles.length : undefined },
            { id: "study", label: "Study", count: dueCount ?? undefined },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              aria-current={activeTab === tab.id ? "page" : undefined}
              className={`relative -mb-px border-b-2 px-4 py-2.5 text-sm font-bold tracking-tight transition-colors ${
                activeTab === tab.id
                  ? "border-accent text-accent"
                  : "border-transparent text-muted-fg hover:text-accent hover:border-muted-fg/30"
              }`}
            >
              {tab.label}
              {tab.count !== undefined && (
                <span className={`ml-2 rounded-full px-2 py-0.5 text-[10px] font-mono ${activeTab === tab.id ? "bg-accent-soft text-accent" : "bg-muted text-muted-fg"}`}>
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {activeTab === "subjects" && <>
      {!loaded ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
           <div key={i} className="glass rounded-2xl p-6">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-4">
                  <Skeleton className="h-16 w-16" />
                  <div className="space-y-2">
                    <Skeleton className="h-5 w-32" />
                    <Skeleton className="h-3 w-20" />
                  </div>
                </div>
              </div>
              <div className="mt-6 flex gap-6">
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-3 w-16" />
              </div>
            </div>
          ))}
        </div>
      ) : subjects.length === 0 ? (
        <div className="space-y-8">
          <EmptyState
            icon={<BookOpen size={48} />}
            title="No subjects yet"
            description="Subjects organize your curriculum — topics live under them, and cards/notes live under topics. Flashcard bundles work standalone too."
            action={
              <Button onClick={() => setModalOpen(true)}>
                <Plus size={16} />
                Create subject
              </Button>
            }
          />
          {/* Bridge the two hierarchies: unlinked bundles (created on
              /flashcards without a topic) are surfaced here with one-tap
              linking, so Subjects never looks dead while /flashcards has
              content. */}
          {allBundles.filter((b) => !b.topicId).length > 0 && (
            <div className="glass rounded-2xl p-5">
              <p className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-muted-fg">
                <Layers size={14} /> Unlinked bundles ({allBundles.filter((b) => !b.topicId).length})
              </p>
              <p className="mb-4 text-sm text-muted-fg">
                These decks exist on the Flashcards page but aren't filed under any subject/topic yet.
              </p>
              <div className="flex flex-wrap gap-2">
                {allBundles.filter((b) => !b.topicId).map((b) => (
                  <button
                    key={b.id}
                    onClick={() => {
                      setManageTopicsFor(null);
                      router.push(`/bundles/${b.id}/cards`);
                    }}
                    className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1.5 text-xs font-bold hover:border-accent hover:text-accent hover:bg-accent-soft"
                    style={{ borderColor: b.color || undefined, color: b.color || undefined }}
                    title="Open bundle cards"
                  >
                    <Layers size={12} /> {b.name}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {subjects.map((subject) => (
            <Card
              key={subject.id}
              hover
              {...tiltHandlers(5)}
              className="group relative will-change-transform"
            >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-4 flex-1 min-w-0">
                    <div
                      className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl text-2xl font-bold transition-transform duration-200 group-hover:scale-105 bg-[var(--chip)] text-[var(--chip-text)]"
                      style={{
                        ["--chip" as string]: subject.color || "#DFE104",
                        ["--chip-text" as string]: readableOn(subject.color || "#DFE104"),
                      }}
                    >
                      {(() => {
                        const Icon = SUBJECT_ICONS[subject.icon || "book-open"];
                        return Icon ? <Icon size={28} /> : subject.name.charAt(0);
                      })()}
                    </div>
                    <div className="min-w-0">
                      <h3 className="truncate text-xl font-bold tracking-tight">
                        {subject.name}
                      </h3>
                      {subject.description && (
                        <p className="mt-1 text-xs text-muted-fg line-clamp-1">
                          {subject.description}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        openEditSubject(subject);
                      }}
                      aria-label="Edit subject"
                      className="flex h-9 w-9 items-center justify-center rounded-full text-muted-fg transition-colors hover:bg-accent-soft hover:text-accent"
                    >
                      <Pencil size={16} />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteSubjectId(subject.id);
                      }}
                      aria-label="Delete subject"
                      className="flex h-9 w-9 items-center justify-center rounded-full text-muted-fg transition-colors hover:bg-danger/10 hover:text-danger"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              <div className="mt-6 flex flex-wrap gap-x-6 gap-y-1 text-xs font-bold uppercase tracking-widest text-muted-fg">
                <span>{topicCounts[subject.id] ?? subject._count.topics} TOPICS</span>
                <span>{subject._count.flashcards} CARDS</span>
                <span>{formatDuration(subject._count.minutes ?? 0)}</span>
              </div>

              {/* Spec §2: mastery progress + last studied — discoverable on
                  the card, not behind a click into the subject */}
              <div className="mt-4">
                <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-widest text-muted-fg">
                  <span>Mastery</span>
                  <span className="font-mono tabular-nums">
                    {subject._count.flashcards > 0
                      ? `${Math.round(((subject._count.mastered ?? 0) / subject._count.flashcards) * 100)}%`
                      : "—"}
                  </span>
                </div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${
                        subject._count.flashcards > 0
                          ? ((subject._count.mastered ?? 0) / subject._count.flashcards) * 100
                          : 0
                      }%`,
                      backgroundColor: subject.color || "var(--color-accent)",
                    }}
                  />
                </div>
                <p className="mt-2 text-[10px] uppercase tracking-widest text-muted-fg">
                  {subject._count.lastStudiedAt
                    ? `Last studied ${formatRelative(subject._count.lastStudiedAt)}`
                    : "Not studied yet"}
                </p>
              </div>

              <button
                onClick={(e) => {
                  e.stopPropagation();
                  openManageTopics(subject.id, subject.name);
                }}
                className="mt-4 inline-flex items-center py-2 text-xs font-bold uppercase tracking-widest text-accent transition-colors hover:underline"
              >
                Manage topics
              </button>
            </Card>
          ))}
        </div>
      )}
        </>}

      {activeTab === "decks" && (
        <>
          {!loaded ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="glass rounded-2xl p-6">
                  <Skeleton className="h-12 w-12 mb-4" />
                  <Skeleton className="h-5 w-32 mb-2" />
                  <Skeleton className="h-3 w-48" />
                </div>
              ))}
            </div>
          ) : allBundles.length === 0 ? (
            <EmptyState
              icon={<Layers size={48} />}
              title="No decks yet"
              description="Decks are flashcard collections. Create one standalone or from a topic."
              action={
                <Button onClick={() => setDeckCreateOpen(true)}>
                  <Plus size={16} />
                  Create deck
                </Button>
              }
            />
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-3">
              {allBundles.map((bundle) => (
                <div
                  key={bundle.id}
                  className="group relative flex h-64 w-full flex-col justify-between overflow-hidden rounded-2xl glass p-6 transition-all duration-200 hover:-translate-y-1"
                  style={{ backgroundImage: `radial-gradient(140% 120% at 0% 0%, ${(bundle.color || "#DFE104")}14, transparent 55%)` }}
                >
                  <button onClick={() => router.push(`/bundles/${bundle.id}/cards`)} className="flex flex-1 flex-col justify-between text-left w-full">
                    <div className="flex items-start justify-between w-full">
                      <div
                        className="flex h-11 w-11 items-center justify-center rounded-xl text-lg font-black transition-transform duration-200 group-hover:scale-110"
                        style={{ backgroundColor: bundle.color || "#DFE104", color: readableOn(bundle.color || "#DFE104") }}
                      >
                        {bundle.name.charAt(0).toUpperCase()}
                      </div>
                      <span className="rounded-full bg-bg-raised px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-muted-fg">
                        {bundle._count.flashcards} cards
                      </span>
                    </div>
                    <div className="mt-auto">
                      <h3 className="truncate text-lg font-bold tracking-tight">{bundle.name}</h3>
                      {bundle.description && <p className="mt-1 line-clamp-2 text-xs text-muted-fg">{bundle.description}</p>}
                      {(bundle as any).topic && (
                        <p className="mt-2 text-[10px] font-bold uppercase tracking-widest text-muted-fg">
                          {(bundle as any).topic.subject?.name ? `${(bundle as any).topic.subject.name} › ` : ""}{(bundle as any).topic.name}
                        </p>
                      )}
                    </div>
                  </button>
                  <div className="mt-4 flex gap-2">
                    <Button size="sm" variant="secondary" onClick={() => router.push(`/bundles/${bundle.id}/cards`)} className="flex-1">Open</Button>
                    <Button size="sm" onClick={() => startReviewForBundle(bundle.id)} className="flex-1 gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-accent-fg animate-pulse" aria-hidden />
                      Review
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {activeTab === "study" && (
        <>
          {isReviewing && reviewQueue.length > 0 ? (
            <div className="mx-auto max-w-2xl space-y-6">
              <div className="flex items-center justify-between text-xs font-bold uppercase tracking-widest text-muted-fg">
                <span>{reviewIndex + 1} / {reviewQueue.length}</span>
                <button onClick={() => { setIsReviewing(false); setIsFlipped(false); }} className="rounded-full border border-border px-3 py-1.5 hover:border-accent hover:text-accent hover:bg-accent-soft">Exit</button>
              </div>
              <div className="w-full h-1.5 overflow-hidden rounded-full bg-muted">
                <div className="h-full bg-accent transition-all" style={{ width: `${((reviewIndex) / reviewQueue.length) * 100}%`}} />
              </div>
              {(() => {
                const card = reviewQueue[reviewIndex];
                if (!card) return null;
                return (
                  <div className="glass rounded-3xl p-8 min-h-[280px] flex flex-col">
                    <p className="text-xs font-bold uppercase tracking-widest text-muted-fg mb-3">
                      {(card as any).topic?.subject?.name ? `${(card as any).topic.subject.name} › ${(card as any).topic.name}` : (card as any).topic?.name || "General"}
                    </p>
                    <div className="flex-1 flex flex-col justify-center text-center">
                      <p className="text-xl font-bold tracking-tight leading-relaxed">{isFlipped ? card.back : card.front}</p>
                      {isFlipped && (card as any).description && <p className="mt-3 text-sm text-muted-fg">{(card as any).description}</p>}
                    </div>
                    {!isFlipped ? (
                      <Button onClick={() => setIsFlipped(true)} className="mt-6 w-full">Show answer</Button>
                    ) : (
                      <div className="mt-6 grid grid-cols-3 gap-2">
                        {RATING_BUTTONS.map((btn) => (
                          <button
                            key={btn.value}
                            onClick={() => handleRate(btn.value)}
                            disabled={reviewing}
                            className={`rounded-xl border px-3 py-3 text-sm font-bold transition-colors disabled:opacity-50 ${btn.color}`}
                          >
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
          ) : (
            <div className="space-y-6">
              <div className="glass rounded-2xl p-6">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <h3 className="text-lg font-bold tracking-tight">Spaced repetition</h3>
                    <p className="mt-1 text-sm text-muted-fg">
                      {dueCount === null ? "Loading…" : dueCount === 0 ? "All caught up — no cards due." : `${dueCount} cards due for review.`}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="secondary" onClick={() => setActiveTab("decks")}>Browse decks</Button>
                  </div>
                </div>
                {allBundles.length > 0 && (
                  <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {allBundles.slice(0, 6).map((b) => (
                  <div
                    key={b.id}
                    className="flex items-center justify-between rounded-xl border border-border bg-bg-raised/60 px-3 py-2"
                  >
                    <button onClick={() => router.push(`/bundles/${b.id}/cards`)} className="flex-1 flex items-center justify-between text-left min-w-0">
                      <span className="truncate text-sm font-bold">{b.name}</span>
                      <span className="ml-2 shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-mono">{b._count.flashcards}</span>
                    </button>
                    <Button size="sm" onClick={() => startReviewForBundle(b.id)} className="ml-3 shrink-0 gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-accent-fg animate-pulse" aria-hidden />
                      Review
                    </Button>
                  </div>
                ))}
                  </div>
                )}
              </div>
              <div className="glass rounded-2xl p-6">
                <h4 className="text-xs font-bold uppercase tracking-widest text-muted-fg">How it works</h4>
                <p className="mt-2 text-sm leading-relaxed text-muted-fg">
                  Library merges the old Subjects + Flashcards/Bundles hierarchies: Subject → Topic → Deck → Cards is now one path. Create a subject, add topics, then create a deck inside a topic — or create a standalone deck and link it later. All cards live in decks and stay reviewable via Study.
                </p>
              </div>
            </div>
          )}
        </>
      )}

      {/* Delete Subject Confirmation
 (replaces native confirm()) */}
      <Modal
        open={!!deleteSubjectId}
        onClose={() => setDeleteSubjectId(null)}
        title="Delete subject"
      >
        <div className="space-y-6">
          <p className="text-sm text-muted-fg">
            Delete this subject and all of its topics, notes, and cards? This cannot be undone.
          </p>
          <div className="flex justify-end gap-4 pt-2">
            <Button variant="ghost" onClick={() => setDeleteSubjectId(null)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={handleDelete}>
              Delete
            </Button>
          </div>
        </div>
      </Modal>

      {/* Topic Management Modal — now USABLE */}
      <Modal
        open={!!manageTopicsFor}
        onClose={() => setManageTopicsFor(null)}
        title={`Topics · ${manageSubjectsName}`}
      >
        <div className="space-y-4">
          {/* Add */}
          <div className="flex gap-2">
            <Input
              placeholder="New topic name..."
              value={newTopicName}
              onChange={(e) => setNewTopicName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAddTopic();
                if (e.key === "Escape") {
                  setNewTopicName("");
                }
              }}
            />
            <Button size="sm" onClick={handleAddTopic} disabled={!newTopicName.trim()}>
              Add
            </Button>
          </div>

          {/* Search topics */}
          {managedTopics.length > 3 && (
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-fg" />
              <input
                placeholder="Search topics..."
                value={topicSearch}
                onChange={(e) => setTopicSearch(e.target.value)}
                className="h-10 w-full rounded-xl border border-border bg-bg pl-8 pr-3 text-sm font-medium tracking-tight placeholder:text-muted-fg/60 focus:outline-none focus:border-accent"
              />
            </div>
          )}

          {/* List */}
          {!topicLoaded ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-24 w-full" />
              ))}
            </div>
          ) : managedTopics.length === 0 ? (
            <EmptyState
              icon={<BookOpen size={40} />}
              title="No topics yet"
              description="Add your first topic above — then create a bundle for it to start making cards."
            />
          ) : filteredTopics.length === 0 ? (
            <EmptyState icon={<Search size={40} />} title="No match" description="Try a different search." />
          ) : (
            <div className="max-h-[58vh] space-y-3 overflow-y-auto pr-1">
              {filteredTopics.map((topic) => {
                const stats = topicStats[topic.id];
                const bundles = stats?.bundles ?? [];
                const unlinkedBundles = allBundles.filter((b) => !b.topicId);
                return (
                <div
                  key={topic.id}
                  className="glass rounded-2xl p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    {editTopicId === topic.id ? (
                      <Input
                        autoFocus
                        value={editTopicName}
                        onChange={(e) => setEditTopicName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleRenameTopic(topic.id);
                          if (e.key === "Escape") {
                            setEditTopicId(null);
                            setEditTopicName("");
                          }
                        }}
                      />
                    ) : (
                      <div className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-bold tracking-tight">
                          {topic.name}
                        </span>
                        {stats && (
                          <span className="mt-1 flex flex-wrap gap-2 text-[10px] font-bold uppercase tracking-widest text-muted-fg">
                            <span className="inline-flex items-center gap-1"><FileText size={10} /> {stats.notes} notes</span>
                            <span className="inline-flex items-center gap-1"><Layers size={10} /> {stats.cards} cards</span>
                            <span className="inline-flex items-center gap-1"><BookOpen size={10} /> {bundles.length} bundles</span>
                          </span>
                        )}
                        {bundles.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {bundles.map((b) => (
                              <button
                                key={b.id}
                                onClick={() => {
                                  setManageTopicsFor(null);
                                  router.push(`/bundles/${b.id}/cards`);
                                }}
                                className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest hover:border-accent hover:text-accent hover:bg-accent-soft"
                                style={{ borderColor: b.color || manageSubjectColor, color: b.color || manageSubjectColor }}
                                title="Manage bundle cards"
                              >
                                <Layers size={10} /> {b.name}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                    <div className="flex shrink-0 gap-1">
                      {editTopicId === topic.id ? (
                        <Button size="sm" onClick={() => handleRenameTopic(topic.id)}>
                          SAVE
                        </Button>
                      ) : (
                        <button
                          onClick={() => {
                            setEditTopicId(topic.id);
                            setEditTopicName(topic.name);
                          }}
                          aria-label="Edit topic"
                          className="p-2 text-muted-fg transition-colors hover:bg-accent hover:text-accent-fg"
                        >
                          <Pencil size={14} />
                        </button>
                      )}
                      <button
                        onClick={() => setDeleteTopicId(topic.id)}
                        aria-label="Delete topic"
                        className="p-2 text-muted-fg transition-colors hover:bg-danger hover:text-on-color"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>

                  {/* Actions bar — the usable part */}
                  {editTopicId !== topic.id && (
                    <div className="mt-3 flex flex-wrap gap-1.5 border-t border-border pt-3">
                      <button
                        onClick={() => {
                          setManageTopicsFor(null);
                          router.push(`/notes?topic=${topic.id}`);
                        }}
                        className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-widest text-muted-fg hover:border-accent hover:text-accent hover:bg-accent-soft"
                      >
                        <FileText size={12} /> Notes
                      </button>
                      {bundles.length > 0 ? (
                        <button
                          onClick={() => {
                            setManageTopicsFor(null);
                            router.push(`/bundles/${bundles[0].id}/cards`);
                          }}
                          className="inline-flex items-center gap-1 rounded-full border border-accent bg-accent px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-widest text-accent-fg hover:opacity-90"
                        >
                          <Layers size={12} /> Cards ({bundles[0]._count.flashcards}) <ExternalLink size={10} />
                        </button>
                      ) : (
                        <button
                          onClick={() => handleCreateBundleFromTopic(topic.id)}
                          disabled={isPending}
                          className="inline-flex items-center gap-1 rounded-full border border-accent bg-accent px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-widest text-accent-fg hover:opacity-90 disabled:opacity-50"
                        >
                          <Plus size={12} /> New bundle
                        </button>
                      )}
                      <button
                        onClick={() => setLinkTopicId(linkTopicId === topic.id ? null : topic.id)}
                        className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-widest text-muted-fg hover:border-accent hover:text-accent hover:bg-accent-soft"
                      >
                        <Link2 size={12} /> Link
                      </button>
                      {bundles.length > 1 && (
                        <button
                          onClick={() => {
                            setManageTopicsFor(null);
                            router.push(`/bundles/${bundles[0].id}/cards`);
                          }}
                          className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-widest text-muted-fg hover:border-accent hover:text-accent hover:bg-accent-soft"
                          title="Study all bundles for this topic"
                        >
                          Study all →
                        </button>
                      )}
                    </div>
                  )}

                  {/* Link picker inline */}
                  {linkTopicId === topic.id && (
                    <div className="mt-3 flex gap-2 border-t border-dashed border-border pt-3">
                      <select
                        value={linkBundleId}
                        onChange={(e) => setLinkBundleId(e.target.value)}
                        className="h-9 flex-1 rounded-xl border border-border bg-bg px-2 text-xs focus:outline-none focus:border-accent"
                      >
                        <option value="">Select bundle...</option>
                        {unlinkedBundles.map((b) => (
                          <option key={b.id} value={b.id}>{b.name} ({b._count.flashcards} cards)</option>
                        ))}
                      </select>
                      <Button size="sm" disabled={!linkBundleId} onClick={handleLinkBundle}>Link</Button>
                      <Button size="sm" variant="ghost" onClick={() => setLinkTopicId(null)}>Cancel</Button>
                    </div>
                  )}
                </div>
              )})}
            </div>
          )}
          <p className="text-center text-[10px] uppercase tracking-widest text-muted-fg">
            Tip — each topic can have its own bundle. Cards in that bundle stay linked to the topic.
          </p>
        </div>
      </Modal>

      {/* Delete Topic Confirmation */}
      <Modal
        open={!!deleteTopicId}
        onClose={() => setDeleteTopicId(null)}
        title="Delete topic"
      >
        {deleteTopicId && (
          <div className="space-y-6">
            <p className="text-sm text-muted-fg">
              Delete this topic? Its flashcards and notes will be moved to no topic or removed. Linked bundles will be unlinked (not deleted). This cannot be undone.
            </p>
            <div className="flex justify-end gap-4 pt-2">
              <Button variant="ghost" onClick={() => setDeleteTopicId(null)}>
                Cancel
              </Button>
              <Button variant="danger" onClick={() => handleDeleteTopic(deleteTopicId)}>
                Delete
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Create Modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="New subject">
        <div className="space-y-6">
          <Input
            label="Subject name"
            placeholder="e.g. Linear Algebra"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Input
            label="Description (optional)"
            placeholder="Brief description..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <BundleColorPicker value={color} onChange={setColor} />
          <SubjectIconPicker value={icon} onChange={setIcon} />
          <div className="flex justify-end gap-4 pt-4">
            <Button variant="ghost" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={isPending || !name.trim()}>
              {isPending ? "Creating..." : "Create"}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Deck Create Modal (Library → Decks) */}
      <Modal open={deckCreateOpen} onClose={() => setDeckCreateOpen(false)} title="New deck">
        <div className="space-y-6">
          <Input label="Deck name" placeholder="e.g. Biology — Chapter 1" value={deckName} onChange={(e) => setDeckName(e.target.value)} />
          <Input label="Description (optional)" placeholder="Brief description..." value={deckDesc} onChange={(e) => setDeckDesc(e.target.value)} />
          <BundleColorPicker value={deckColor} onChange={setDeckColor} />
          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-widest text-muted-fg">Subject & topic (optional)</label>
            <SubjectTopicMenu subjects={subjects.map(s => ({ id: s.id, name: s.name, color: s.color }))} subjectId={deckSubjectId} topicId={deckTopicId} onSubjectChange={setDeckSubjectId} onTopicChange={setDeckTopicId} subjectOptional />
          </div>
          <div className="flex justify-end gap-4 pt-4">
            <Button variant="ghost" onClick={() => setDeckCreateOpen(false)}>Cancel</Button>
            <Button onClick={handleCreateDeck} disabled={!deckName.trim()}>{deckName.trim() ? "Create" : "Create"}</Button>
          </div>
        </div>
      </Modal>

      {/* Edit Subject Modal */}
      <Modal open={!!editSubject} onClose={() => setEditSubject(null)} title="Edit subject">
        {editSubject && (
          <div className="space-y-6">
            <Input
              label="Subject name"
              placeholder="e.g. Linear Algebra"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
            />
            <Input
              label="Description (optional)"
              placeholder="Brief description..."
              value={editDescription}
              onChange={(e) => setEditDescription(e.target.value)}
            />
            <BundleColorPicker value={editColor} onChange={setEditColor} />
            <SubjectIconPicker value={editIcon} onChange={setEditIcon} />
            <div className="flex justify-end gap-4 pt-4">
              <Button variant="ghost" onClick={() => setEditSubject(null)}>
                Cancel
              </Button>
              <Button onClick={handleEditSave} disabled={isPending || !editName.trim()}>
                {isPending ? "Saving..." : "Save"}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
