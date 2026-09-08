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
} from "@/app/actions";
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
      {/* Header */}
      <div className="mb-16">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <RevealHeading text="Subjects" className="text-5xl lg:text-8xl" />
            <ScrambleSubtitle
              text="Organize your learning topics"
              className="mt-4 text-sm text-muted-fg uppercase tracking-widest"
            />
          </div>
          {!(loaded && subjects.length === 0) && (
            <Button onClick={() => setModalOpen(true)}>
              <Plus size={16} />
              New subject
            </Button>
          )}
        </div>
      </div>

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
                    className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1.5 text-xs font-bold hover:border-accent hover:text-accent"
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

      {/* Delete Subject Confirmation (replaces native confirm()) */}
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
                                className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest hover:border-accent hover:text-accent"
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
                        className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-widest text-muted-fg hover:border-fg hover:text-fg"
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
                        className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-widest text-muted-fg hover:border-accent hover:text-accent"
                      >
                        <Link2 size={12} /> Link
                      </button>
                      {bundles.length > 1 && (
                        <button
                          onClick={() => {
                            setManageTopicsFor(null);
                            router.push(`/flashcards?topic=${topic.id}`);
                          }}
                          className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-widest text-muted-fg hover:border-fg hover:text-fg"
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
