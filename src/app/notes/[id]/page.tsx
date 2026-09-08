"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Pencil, Trash2, Pin, StickyNote, BookOpen, Calendar } from "lucide-react";
import Link from "next/link";
import { Button, Skeleton } from "@/components/ui";
import { Modal } from "@/components/ui";
import { TagInput } from "@/components/tag-input";
import { Markdown } from "@/components/markdown";
import { NoteAiImportButton } from "@/components/note-ai-import-button";
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
    if (!note || !confirm("DELETE THIS NOTE?")) return;
    const snapshot = note;
    await deleteNote(note.id);
    router.push("/notes");
    showUndo({
      message: `NOTE "${snapshot.title}" DELETED`,
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
        <h2 className="text-2xl font-bold uppercase tracking-tight">NOTE NOT FOUND</h2>
        <p className="mt-2 text-sm text-muted-fg uppercase tracking-widest">This note may have been deleted.</p>
        <Button className="mt-6" onClick={() => router.push("/notes")}>
          <ArrowLeft size={16} /> BACK TO NOTES
        </Button>
      </div>
    );
  }

  const accent = note.topic?.subject?.color || "#FF7A72";

  return (
    <div className="min-h-screen bg-bg">
      <div className="max-w-4xl mx-auto p-8 lg:p-12">
        {/* Back */}
        <button
          onClick={() => router.push("/notes")}
          className="mb-8 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-muted-fg hover:text-fg transition-colors"
        >
          <ArrowLeft size={14} /> BACK TO NOTES
        </button>

        {/* Header */}
        <div
          className="rounded-3xl border border-zinc-800 bg-zinc-900/60 p-8 backdrop-blur-xl"
          style={{ backgroundImage: `radial-gradient(140% 120% at 0% 0%, ${accent}10, transparent 60%)` }}
        >
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              {note.topic && (
                <p className="mb-3 flex flex-wrap items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-zinc-400">
                  <span
                    className="inline-block rounded-full px-2.5 py-1 text-[10px]"
                    style={{ backgroundColor: `${accent}1f`, color: accent, boxShadow: `inset 0 0 0 1px ${accent}40` }}
                  >
                    {note.topic.subject?.name || "GENERAL"}
                  </span>
                  <span className="text-zinc-600">›</span>
                  <span>{note.topic.name}</span>
                  {note.isPinned && <span className="ml-1 inline-flex items-center gap-1 text-accent"><Pin size={10} /> PINNED</span>}
                </p>
              )}
              <h1 className="font-display text-3xl font-bold uppercase tracking-tight text-white lg:text-4xl">
                {note.title}
              </h1>
              <p className="mt-3 flex items-center gap-2 text-xs text-zinc-500">
                <Calendar size={12} /> {new Date(note.updatedAt).toLocaleDateString()} · {note.tags.length} tags
              </p>
            </div>
            <div className="flex shrink-0 gap-1">
              <button
                onClick={handleTogglePin}
                className={`p-2.5 rounded-xl border transition-colors ${note.isPinned ? "border-accent bg-accent text-accent-fg" : "border-zinc-800 bg-zinc-900 text-zinc-400 hover:text-white hover:border-zinc-700"}`}
                title={note.isPinned ? "Unpin" : "Pin"}
              >
                <Pin size={16} />
              </button>
              <button
                onClick={openEdit}
                className="p-2.5 rounded-xl border border-zinc-800 bg-zinc-900 text-zinc-400 hover:text-white hover:border-zinc-700 transition-colors"
                title="Edit"
              >
                <Pencil size={16} />
              </button>
              <button
                onClick={handleDelete}
                className="p-2.5 rounded-xl border border-zinc-800 bg-zinc-900 text-zinc-400 hover:text-red-400 hover:border-red-400/30 transition-colors"
                title="Delete"
              >
                <Trash2 size={16} />
              </button>
            </div>
          </div>

          {note.tags.length > 0 && (
            <div className="mt-6 flex flex-wrap gap-1.5">
              {note.tags.map(({ tag }) => (
                <span key={tag.id} className="rounded-full bg-zinc-800 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-zinc-400">
                  {tag.name}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Content */}
        <div className="mt-8 rounded-3xl border border-zinc-800 bg-zinc-900/40 p-8 backdrop-blur">
          {note.content ? (
            <div className="prose prose-invert max-w-none prose-p:leading-relaxed prose-headings:font-bold prose-headings:tracking-tight">
              <Markdown content={note.content} />
            </div>
          ) : (
            <div className="flex flex-col items-center py-16 text-center">
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-accent-soft text-accent">
                <StickyNote size={28} />
              </div>
              <p className="text-sm font-bold uppercase tracking-widest">NO CONTENT YET</p>
              <p className="mt-1 text-xs text-muted-fg">Edit this note to add study material</p>
              <Button size="sm" className="mt-6" onClick={openEdit}>
                <Pencil size={14} /> EDIT NOTE
              </Button>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="mt-8 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-zinc-800 bg-zinc-900/30 p-4">
          <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-zinc-500">
            <BookOpen size={14} /> STUDY MODE — READ, THEN IMPORT TO FLASHCARDS
          </p>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={openEdit}>
              <Pencil size={14} /> EDIT
            </Button>
            <NoteAiImportButton noteId={note.id} noteTitle={note.title} availableBundles={bundles} />
          </div>
        </div>

        {/* Related */}
        <div className="mt-8 flex justify-center">
          <Link href="/notes" className="text-xs font-bold uppercase tracking-widest text-muted-fg hover:text-accent transition-colors">
            ← BACK TO ALL NOTES
          </Link>
        </div>
      </div>

      {/* Edit Modal */}
      <Modal open={editOpen} onClose={() => setEditOpen(false)} title="EDIT NOTE">
        <div className="space-y-6">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-widest text-muted-fg">TITLE</label>
            <input
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              className="glass-inset flex h-12 w-full rounded-xl px-4 py-2 text-base font-medium tracking-tight text-fg placeholder:text-muted-fg/60 border-border focus:outline-none"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-widest text-muted-fg">CONTENT</label>
            <textarea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              rows={10}
              className="glass-inset flex w-full rounded-xl px-4 py-3 text-base font-medium tracking-tight text-fg placeholder:text-muted-fg/60 border-border focus:outline-none resize-none"
            />
          </div>
          <TagInput label="TAGS" tags={editTags} onChange={setEditTags} />
          <div className="flex justify-end gap-4 pt-4">
            <Button variant="ghost" onClick={() => setEditOpen(false)}>CANCEL</Button>
            <Button onClick={handleEditSave} disabled={!editTitle.trim()}>SAVE</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
