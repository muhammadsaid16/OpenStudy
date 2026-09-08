"use client";

import { useState, useEffect, useTransition, Suspense } from "react";
import { Plus, Trash2, Pin, StickyNote, Pencil, Eye, BookOpen, Search, X } from "lucide-react";
import { useSearchParams, useRouter } from "next/navigation";
import { Button, Modal, Input, EmptyState, Skeleton, Textarea } from "@/components/ui";
import { RevealHeading } from "@/components/reveal-heading";
import { ScrambleSubtitle } from "@/components/scramble-subtitle";
import { getAllNotes, getSubjects, createNote, deleteNote, updateNote, getBundles } from "@/app/actions";
import { SubjectTopicSelect } from "@/components/subject-topic-select";
import { TagInput } from "@/components/tag-input";
import { Markdown } from "@/components/markdown";
import { formatRelative } from "@/lib/utils";
import { NoteAiImportButton } from "@/components/note-ai-import-button";
import { showUndo } from "@/components/undo-toast";
import { spotlightProps } from "@/lib/interactions";
import type { BundleRec } from "@/lib/db";

type Note = Omit<Awaited<ReturnType<typeof getAllNotes>>[number], "topic"> & {
  topic: Awaited<ReturnType<typeof getAllNotes>>[number]["topic"] | null;
};

function NotesContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const topicFilter = searchParams.get("topic");
  const [notes, setNotes] = useState<Note[]>([]);
  const [subjects, setSubjects] = useState<{ id: string; name: string; color: string }[]>([]);
  const [bundles, setBundles] = useState<BundleRec[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedTopicId, setSelectedTopicId] = useState("");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [isPending, startTransition] = useTransition();
  const [search, setSearch] = useState("");

  // Edit state
  const [editNote, setEditNote] = useState<Note | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");
  const [editTags, setEditTags] = useState<string[]>([]);

  useEffect(() => {
    Promise.all([getAllNotes(), getSubjects(), getBundles()]).then(([n, s, b]) => {
      setNotes(n);
      setSubjects(s);
      setBundles(b);
      setLoaded(true);
    });
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
        setEditNote(null);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const filteredNotes = notes.filter((n) => {
    if (topicFilter && n.topicId !== topicFilter) return false;
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      n.title.toLowerCase().includes(q) ||
      (n.content ?? "").toLowerCase().includes(q) ||
      n.tags.some((t) => t.tag.name.toLowerCase().includes(q)) ||
      (n.topic?.name ?? "").toLowerCase().includes(q) ||
      (n.topic?.subject?.name ?? "").toLowerCase().includes(q)
    );
  });
  const activeTopicName = topicFilter
    ? notes.find((n) => n.topicId === topicFilter)?.topic?.name ?? topicFilter.slice(0, 8)
    : null;

  const handleCreate = () => {
    if (!title.trim() || !selectedTopicId) return;
    startTransition(async () => {
      await createNote({
        topicId: selectedTopicId,
        title: title.trim(),
        content: content.trim(),
        tags,
      });
      // Re-fetch so topic include + real tag ids are correct (previous
      // optimistic push used topic: null and fabricated tag ids).
      const fresh = await getAllNotes();
      setNotes(fresh as Note[]);
      setModalOpen(false);
      setTitle("");
      setContent("");
      setTags([]);
      setSelectedTopicId("");
    });
  };

  const handleTogglePin = async (id: string, isPinned: boolean) => {
    await updateNote(id, { isPinned: !isPinned });
    setNotes((prev) =>
      prev.map((n) => (n.id === id ? { ...n, isPinned: !isPinned } : n))
    );
  };

  const handleDelete = (note: Note) => {
    startTransition(async () => {
      await deleteNote(note.id);
      setNotes((prev) => prev.filter((n) => n.id !== note.id));
      showUndo({
        message: `Note "${note.title}" deleted`,
        undo: async () => {
          if (!note.topicId) {
            // Shouldn't happen — notes always have a topic — but guard
            // so undo doesn't throw a zod validation error.
            const fresh = await getAllNotes();
            setNotes(fresh as Note[]);
            return;
          }
          await createNote({
            title: note.title,
            content: note.content || "",
            topicId: note.topicId,
            tags: note.tags.map((t) => t.tag.name),
          });
          const n = await getAllNotes();
          setNotes(n as Note[]);
        },
      });
    });
  };

  const openEdit = (note: Note) => {
    setEditNote(note);
    setEditTitle(note.title);
    setEditContent(note.content || "");
    setEditTags(note.tags.map((t) => t.tag.name));
  };

  const handleEditSave = async () => {
    if (!editNote || !editTitle.trim()) return;
    await updateNote(editNote.id, { title: editTitle.trim(), content: editContent.trim(), tags: editTags });
    const fresh = await getAllNotes();
    setNotes(fresh as Note[]);
    setEditNote(null);
  };

  return (
    <div className="p-8 lg:p-12">
      {/* Header */}
      <div className="mb-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <RevealHeading text="NOTES" className="text-5xl lg:text-8xl" />
            <ScrambleSubtitle
              text="YOUR STUDY NOTES AND REFERENCE MATERIAL"
              className="mt-4 text-sm text-muted-fg uppercase tracking-widest"
            />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {!(loaded && notes.length === 0) && (
              <Button onClick={() => setModalOpen(true)}>
                <Plus size={16} />
                New note
              </Button>
            )}
          </div>
        </div>
        {/* Search */}
        {loaded && notes.length > 0 && (
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <div className="relative max-w-md flex-1">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-fg" />
              <input
                placeholder="Search notes..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-10 w-full rounded-xl border border-border bg-bg pl-10 pr-3 text-sm font-medium tracking-tight text-fg placeholder:text-muted-fg/60 focus:outline-none focus:border-accent"
              />
            </div>
            {topicFilter && (
              <span className="inline-flex items-center gap-2 rounded-full border border-accent bg-accent px-3 py-1.5 text-xs font-bold uppercase tracking-widest text-accent-fg">
                <BookOpen size={12} /> {activeTopicName}
                <button onClick={() => router.push("/notes")} className="ml-1 hover:opacity-70" title="Clear topic filter">
                  <X size={12} />
                </button>
              </span>
            )}
          </div>
        )}
      </div>

      {!loaded ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="glass rounded-2xl p-6">
              <Skeleton className="h-6 w-2/3" />
              <Skeleton className="h-16 w-full mt-4" />
              <Skeleton className="h-3 w-1/3 mt-4" />
            </div>
          ))}
        </div>
      ) : notes.length === 0 ? (
        <EmptyState
          icon={<StickyNote size={48} />}
          title="No notes yet"
          description="Create notes linked to your study topics."
          action={
            <Button onClick={() => setModalOpen(true)}>
              <Plus size={16} />
              Create note
            </Button>
          }
        />
      ) : filteredNotes.length === 0 ? (
        <EmptyState
          icon={<Search size={48} />}
          title="No results"
          description="Try a different search."
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredNotes.map((note) => {
            const accent = note.topic?.subject?.color || "var(--color-accent)";
            const isPinned = note.isPinned;
            return (
            <div
              key={note.id}
              onClick={() => router.push("/notes/" + note.id)}
              {...spotlightProps()}
              className="spotlight-card group relative flex h-[320px] w-full flex-col justify-between overflow-hidden rounded-2xl glass p-6 text-left transition-all duration-200 hover:-translate-y-1 cursor-pointer"
              style={{ backgroundImage: `radial-gradient(140% 120% at 0% 0%, color-mix(in srgb, ${accent} 8%, transparent), transparent 55%)` }}
            >
              {/* Header: icon + actions */}
              <div className="flex items-start justify-between">
                <div
                  className="flex h-11 w-11 items-center justify-center rounded-xl text-lg font-black transition-transform duration-200 group-hover:scale-110"
                  style={{
                    backgroundColor: `color-mix(in srgb, ${accent} 12%, transparent)`,
                    color: accent,
                    boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${accent} 24%, transparent)`,
                  }}
                >
                  {isPinned ? <Pin size={18} className="fill-current" /> : <StickyNote size={18} />}
                </div>
                <div
                  className="flex -mr-2 gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100 max-md:opacity-100"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    onClick={() => router.push("/notes/" + note.id)}
                    aria-label="Study note"
                    title="Study"
                    className="rounded-full p-2.5 text-muted-fg transition-colors hover:text-fg"
                  >
                    <Eye size={14} />
                  </button>
                  <button
                    onClick={() => openEdit(note)}
                    aria-label="Edit"
                    className="rounded-full p-2.5 text-muted-fg transition-colors hover:text-fg"
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    onClick={() => handleTogglePin(note.id, note.isPinned)}
                    aria-label={isPinned ? "Unpin" : "Pin"}
                    className={`rounded-full p-2.5 transition-colors ${isPinned ? "text-accent" : "text-muted-fg hover:text-fg"}`}
                  >
                    <Pin size={14} />
                  </button>
                  <button
                    onClick={() => handleDelete(note)}
                    aria-label="Delete"
                    className="rounded-full p-2.5 text-muted-fg transition-colors hover:text-danger"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>

              {/* Content */}
              <div className="mt-3 min-w-0 flex-1">
                <h3 className="line-clamp-2 text-lg font-bold text-fg transition-colors group-hover:text-accent">
                  {note.title}
                </h3>
                {note.topic && (
                  <p className="mt-1 text-[10px] font-bold uppercase tracking-widest text-muted-fg">
                    {note.topic.subject?.name ? `${note.topic.subject.name} › ` : ""}
                    {note.topic.name}
                    {isPinned && <span className="ml-2 text-accent">· Pinned</span>}
                  </p>
                )}
                <div className="mt-3 line-clamp-3 text-sm leading-relaxed text-muted-fg">
                  {note.content ? <Markdown content={note.content} /> : <span className="italic text-muted-fg/70">No content</span>}
                </div>
              </div>

              {/* Footer */}
              <div className="mt-4 flex items-center justify-between gap-2">
                <div className="flex flex-wrap gap-1">
                  {note.tags.slice(0, 3).map(({ tag }) => (
                    <span
                      key={tag.id}
                      className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-muted-fg"
                    >
                      {tag.name}
                    </span>
                  ))}
                  {note.tags.length > 3 && (
                    <span className="px-1 text-[10px] font-bold text-muted-fg">+{note.tags.length - 3}</span>
                  )}
                </div>
                {/* Spec §4: note metadata shows freshness, not just tags */}
                <span
                  className="shrink-0 text-[10px] font-bold uppercase tracking-widest text-muted-fg transition-colors"
                  title={`Updated ${new Date(note.updatedAt).toLocaleString()}`}
                >
                  {formatRelative(new Date(note.updatedAt))}
                </span>
              </div>

              {/* AI Import — absolute subtle */}
              <div className="absolute bottom-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
                <NoteAiImportButton noteId={note.id} noteTitle={note.title} availableBundles={bundles} />
              </div>
            </div>
            );
          })}
        </div>
      )}

      {/* Create Modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="New note">
        <div className="space-y-6">
          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-widest text-muted-fg">
              Topic
            </label>
            <SubjectTopicSelect
              subjects={subjects}
              value={selectedTopicId}
              onChange={setSelectedTopicId}
            />
            {!selectedTopicId && subjects.length > 0 && (
              <p className="text-[11px] uppercase tracking-widest text-warning">
                Pick a subject above and click Use to link a topic before creating.
              </p>
            )}
          </div>
          <Input
            label="Title"
            placeholder="Note title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <Textarea
            label="Content"
            placeholder="Write your notes... (Markdown supported)"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={8}
          />
          <TagInput label="Tags" tags={tags} onChange={setTags} />
          <div className="flex justify-end gap-4 pt-4">
            <Button variant="ghost" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleCreate}
              disabled={isPending || !title.trim() || !selectedTopicId}
            >
              {isPending ? "Creating..." : "Create"}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Edit Modal */}
      <Modal open={!!editNote} onClose={() => setEditNote(null)} title="Edit note">
        {editNote && (
          <div className="space-y-6">
            <Input
              label="Title"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
            />
            <Textarea
              label="Content"
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              rows={8}
            />
            <TagInput label="Tags" tags={editTags} onChange={setEditTags} />
            <div className="flex justify-end gap-4 pt-4">
              <Button variant="ghost" onClick={() => setEditNote(null)}>
                Cancel
              </Button>
              <Button onClick={handleEditSave} disabled={!editTitle.trim()}>
                Save
              </Button>
            </div>
          </div>
        )}
      </Modal>
</div>
  );
}

function NotesPageSuspenseFallback() {
  return (
    <div className="p-8 lg:p-12">
      <Skeleton className="h-12 w-48" />
      <Skeleton className="h-64 w-full mt-8" />
    </div>
  );
}

export default function NotesPage() {
  return (
    <Suspense fallback={<NotesPageSuspenseFallback />}>
      <NotesContent />
    </Suspense>
  );
}
