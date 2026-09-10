"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Pencil, Trash2, Pin, StickyNote, BookOpen, Calendar, Sparkles } from "lucide-react";
import Link from "next/link";
import { Button, Skeleton } from "@/components/ui";
import { Modal } from "@/components/ui";
import { TagInput } from "@/components/tag-input";
import { Markdown } from "@/components/markdown";
import { NoteAiImportButton } from "@/components/note-ai-import-button";
import { AiGenerateModal } from "@/components/ai-generate-modal";
import { getAllNotes, updateNote, deleteNote, getBundles } from "@/app/actions";
import { showUndo } from "@/components/undo-toast";
import type { BundleRec } from "@/lib/db";

type Note = Awaited<ReturnType<typeof getAllNotes>>[number];

export default function NotePage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const router = useRouter();
  const [note, setNote] = useState<Note | null>(null);
  const [bundles, setBundles] = useState<BundleRec[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [notFound, setNotFound] = useState(false);

  // Edit
  const [editOpen, setEditOpen] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");
  const [editTags, setEditTags] = useState<string[]>([]);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [generateOpen, setGenerateOpen] = useState(false);

  useEffect(() => {
    Promise.all([getAllNotes(), getBundles()]).then(([notes, b]) => {
      const found = notes.find((n) => n.id === id);
      if (!found) setNotFound(true);
      else setNote(found as Note);
      setBundles(b);
      setLoaded(true);
    });
  }, [id]);

  const openEdit = () => {
    if (!note) return;
    setEditTitle(note.title);
    setEditContent(note.content || "");
    setEditTags(note.tags.map((t) => t.tag.name));
    setEditOpen(true);
  };

  const handleEditSave = async () => {
    if (!note || !editTitle.trim()) return;
    await updateNote(note.id, { title: editTitle.trim(), content: editContent.trim(), tags: editTags });
    const notes = await getAllNotes();
    const updated = notes.find((n) => n.id === id) as Note | undefined;
    if (updated) setNote(updated);
    setEditOpen(false);
  };

  const handleTogglePin = async () => {
    if (!note) return;
    await updateNote(note.id, { isPinned: !note.isPinned });
    setNote((prev) => (prev ? { ...prev, isPinned: !prev.isPinned } : prev));
  };

  const handleDelete = async () => {
    if (!note) return;
    const snapshot = note;
    await deleteNote(note.id);
    setDeleteOpen(false);
    router.push("/notes");
    showUndo({
      message: `Note "${snapshot.title}" deleted`,
      undo: async () => {
        const { createNote } = await import("@/app/actions");
        if (!snapshot.topicId) return;
        await createNote({
          title: snapshot.title,
          content: snapshot.content || "",
          topicId: snapshot.topicId,
          tags: snapshot.tags.map((t) => t.tag.name),
        });
      },
    });
  };

  if (!loaded) {
    return (
      <div className="p-8 lg:p-12 max-w-4xl mx-auto">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-6 w-full mt-6" />
        <Skeleton className="h-64 w-full mt-6" />
      </div>
    );
  }

  if (notFound || !note) {
    return (
      <div className="p-8 lg:p-12 max-w-4xl mx-auto text-center">
        <StickyNote size={48} className="mx-auto mb-4 text-muted-fg" />
        <h2 className="text-2xl font-bold tracking-tight">Note not found</h2>
        <p className="mt-2 text-sm text-muted-fg">This note may have been deleted.</p>
        <Button className="mt-6" onClick={() => router.push("/notes")}>
          <ArrowLeft size={16} /> Back to notes
        </Button>
      </div>
    );
  }

  const accent = note.topic?.subject?.color || "var(--color-accent)";

  return (
    <div className="min-h-screen bg-bg">
      <div className="max-w-4xl mx-auto p-8 lg:p-12">
        {/* Back */}
        <button
          onClick={() => router.push("/notes")}
          className="mb-8 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-muted-fg hover:text-accent transition-colors"
        >
          <ArrowLeft size={14} /> Back to notes
        </button>

        {/* Header */}
        <div
          className="glass rounded-3xl p-8"
          style={{ backgroundImage: `radial-gradient(140% 120% at 0% 0%, color-mix(in srgb, ${accent} 6%, transparent), transparent 60%)` }}
        >
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              {note.topic && (
                <p className="mb-3 flex flex-wrap items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-muted-fg">
                  <span
                    className="inline-block rounded-full px-2.5 py-1 text-[10px]"
                    style={{ backgroundColor: `color-mix(in srgb, ${accent} 12%, transparent)`, color: accent, boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${accent} 25%, transparent)` }}
                  >
                    {note.topic.subject?.name || "General"}
                  </span>
                  <span aria-hidden>›</span>
                  <span>{note.topic.name}</span>
                  {note.isPinned && <span className="ml-1 inline-flex items-center gap-1 text-accent"><Pin size={10} /> Pinned</span>}
                </p>
              )}
              <h1 className="font-display text-3xl font-bold tracking-tight text-fg lg:text-4xl">
                {note.title}
              </h1>
              <p className="mt-3 flex items-center gap-2 text-xs text-muted-fg">
                <Calendar size={12} /> {new Date(note.updatedAt).toLocaleDateString()} · {note.tags.length} tags
              </p>
            </div>
            <div className="flex shrink-0 gap-1">
              <button
                onClick={handleTogglePin}
                className={`rounded-full p-2.5 transition-colors ${note.isPinned ? "bg-accent text-accent-fg" : "text-muted-fg hover:bg-accent-soft hover:text-accent"}`}
                title={note.isPinned ? "Unpin" : "Pin"}
                aria-label={note.isPinned ? "Unpin note" : "Pin note"}
              >
                <Pin size={16} />
              </button>
              <button
                onClick={openEdit}
                className="rounded-full p-2.5 text-muted-fg transition-colors hover:bg-accent-soft hover:text-accent"
                title="Edit"
                aria-label="Edit note"
              >
                <Pencil size={16} />
              </button>
              <button
                onClick={() => setDeleteOpen(true)}
                className="rounded-full p-2.5 text-muted-fg transition-colors hover:bg-danger/10 hover:text-danger"
                title="Delete"
                aria-label="Delete note"
              >
                <Trash2 size={16} />
              </button>
            </div>
          </div>

          {note.tags.length > 0 && (
            <div className="mt-6 flex flex-wrap gap-1.5">
              {note.tags.map(({ tag }) => (
                <span key={tag.id} className="rounded-full bg-muted px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-muted-fg">
                  {tag.name}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Content */}
        <div className="glass mt-8 rounded-3xl p-8">
          {note.content ? (
            <div className="prose prose-invert max-w-none prose-p:leading-relaxed prose-headings:font-bold prose-headings:tracking-tight">
              <Markdown content={note.content} />
            </div>
          ) : (
            <div className="flex flex-col items-center py-16 text-center">
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-accent-soft text-accent">
                <StickyNote size={28} />
              </div>
              <p className="text-sm font-bold uppercase tracking-widest">No content yet</p>
              <p className="mt-1 text-xs text-muted-fg">Edit this note to add study material</p>
              <Button size="sm" className="mt-6" onClick={openEdit}>
                <Pencil size={14} /> Edit note
              </Button>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="glass mt-8 flex flex-wrap items-center justify-between gap-4 rounded-2xl p-4">
          <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-muted-fg">
            <BookOpen size={14} /> Study mode — read, then import to flashcards
          </p>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={openEdit}>
              <Pencil size={14} /> Edit
            </Button>
            <Button variant="secondary" onClick={() => setGenerateOpen(true)} aria-label="Generate cards with AI" title="Generate cards with AI">
              <Sparkles size={14} /> AI Generate
            </Button>
            <NoteAiImportButton noteId={note.id} noteTitle={note.title} availableBundles={bundles} />
          </div>
        </div>

        {/* Related */}
        <div className="mt-8 flex justify-center">
          <Link href="/notes" className="text-xs font-bold uppercase tracking-widest text-muted-fg hover:text-accent transition-colors">
            ← Back to all notes
          </Link>
        </div>
      </div>

      {/* Delete confirmation */}
      <Modal open={deleteOpen} onClose={() => setDeleteOpen(false)} title="Delete note">
        <div className="space-y-6">
          <p className="text-sm text-muted-fg">
            Delete “{note.title}”? You can undo this right after.
          </p>
          <div className="flex justify-end gap-4 pt-2">
            <Button variant="ghost" onClick={() => setDeleteOpen(false)}>Cancel</Button>
            <Button variant="danger" onClick={handleDelete}>Delete</Button>
          </div>
        </div>
      </Modal>

      {/* Edit Modal */}
      <Modal open={editOpen} onClose={() => setEditOpen(false)} title="Edit note">
        <div className="space-y-6">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-widest text-muted-fg">Title</label>
            <input
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              className="glass-inset flex h-12 w-full rounded-xl px-4 py-2 text-base font-medium tracking-tight text-fg placeholder:text-muted-fg/60 border-border focus:outline-none"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-widest text-muted-fg">Content</label>
            <textarea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              rows={10}
              className="glass-inset flex w-full rounded-xl px-4 py-3 text-base font-medium tracking-tight text-fg placeholder:text-muted-fg/60 border-border focus:outline-none resize-none"
            />
          </div>
          <TagInput label="Tags" tags={editTags} onChange={setEditTags} />
          <div className="flex justify-end gap-4 pt-4">
            <Button variant="ghost" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button onClick={handleEditSave} disabled={!editTitle.trim()}>Save</Button>
          </div>
        </div>
      </Modal>

      {generateOpen && (
        <AiGenerateModal
          bundles={bundles}
          defaultBundleId={bundles[0]?.id}
          defaultPrompt={note.content ?? note.title}
          onClose={() => setGenerateOpen(false)}
        />
      )}
    </div>
  );
}
