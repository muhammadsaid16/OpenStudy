"use client";

import { useState, useEffect, useTransition, Suspense, useRef } from "react";
import { useT } from "@/lib/i18n";
import { Plus, Trash2, Pin, StickyNote, Pencil, Eye, BookOpen, Search, X, Download, Upload, Lightbulb, ClockAlert } from "lucide-react";
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
import { showToast } from "@/components/toast";
import { spotlightProps } from "@/lib/interactions";
import type { BundleRec } from "@/lib/db";
import { useLiveData } from "@/lib/use-live-data";

type Note = Omit<Awaited<ReturnType<typeof getAllNotes>>[number], "topic"> & {
  topic: Awaited<ReturnType<typeof getAllNotes>>[number]["topic"] | null;
};

function NotesContent() {
  const t = useT();
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
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const importInputRef = useRef<HTMLInputElement>(null);

  // Edit state
  const [editNote, setEditNote] = useState<Note | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");
  const [editTags, setEditTags] = useState<string[]>([]);
  const [editTopicId, setEditTopicId] = useState("");

  // Realtime: re-runs on ANY table change (same tab, other tab, import).
  const live = useLiveData(() => Promise.all([getAllNotes(), getSubjects(), getBundles()]), []);
  useEffect(() => {
    if (!live) return;
    const [n, s, b] = live;
    setNotes(n);
    setSubjects(s);
    setBundles(b);
    setLoaded(true);
  }, [live]);

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
        setEditTopicId("");
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
      (n.explanation ?? "").toLowerCase().includes(q) ||
      n.tags.some((t) => t.tag.name.toLowerCase().includes(q)) ||
      (n.topic?.name ?? "").toLowerCase().includes(q) ||
      (n.topic?.subject?.name ?? "").toLowerCase().includes(q)
    );
  });
  const activeTopicName = topicFilter
    ? notes.find((n) => n.topicId === topicFilter)?.topic?.name ?? topicFilter.slice(0, 8)
    : null;

  const handleCreate = () => {
    if (!title.trim()) return;
    startTransition(async () => {
      await createNote({
        topicId: selectedTopicId || null,
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
          await createNote({
            title: note.title,
            content: note.content || "",
            topicId: note.topicId || null,
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
    setEditTopicId(note.topicId || "");
  };

  const handleEditSave = async () => {
    if (!editNote || !editTitle.trim()) return;
    await updateNote(editNote.id, {
      title: editTitle.trim(),
      content: editContent.trim(),
      tags: editTags,
      topicId: editTopicId ? editTopicId : null,
    } as any);
    const fresh = await getAllNotes();
    setNotes(fresh as Note[]);
    setEditNote(null);
    setEditTopicId("");
  };

  // ─── Export / Import ──────────────────────────────────────────
  const csvEsc = (v: string) => `"${String(v ?? "").replace(/"/g, '""')}"`;

  function splitCsvLine(line: string, delimiter: string): string[] {
    const cells: string[] = [];
    let cur = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuotes) {
        if (ch === '"') {
          if (line[i + 1] === '"') { cur += '"'; i++; } else inQuotes = false;
        } else cur += ch;
      } else {
        if (ch === '"') inQuotes = true;
        else if (ch === delimiter) { cells.push(cur); cur = ""; }
        else cur += ch;
      }
    }
    cells.push(cur);
    return cells.map((c) => c.trim());
  }

  const exportAsJson = async () => {
    setExportMenuOpen(false);
    try {
      const all = await getAllNotes();
      const payload = (all as any[]).map((n) => ({
        title: n.title,
        content: n.content ?? "",
        topicId: n.topicId,
        tags: (n.tags ?? []).map((t: any) => t.tag?.name ?? t.name ?? ""),
      }));
      const json = JSON.stringify(payload, null, 2);
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = "notes.json"; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      showToast(`Exported ${payload.length} notes`, "success");
    } catch (e) { console.error(e); showToast("Export failed", "danger"); }
  };

  const exportAsCsv = async () => {
    setExportMenuOpen(false);
    try {
      const all = await getAllNotes();
      const header = ["title","content","topicId","tags"];
      const rows = (all as any[]).map((n) =>
        [csvEsc(n.title), csvEsc(n.content ?? ""), csvEsc(n.topicId ?? ""), csvEsc((n.tags ?? []).map((t: any) => t.tag?.name ?? t.name ?? "").join(";"))].join(",")
      );
      const csv = [header.join(","), ...rows].join("\n");
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = "notes.csv"; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      showToast(`Exported ${rows.length} notes`, "success");
    } catch (e) { console.error(e); showToast("Export failed", "danger"); }
  };

  const handleNotesImport = async (file: File) => {
    setImporting(true);
    try {
      const text = await file.text();
      const trimmed = text.trim();
      if (!trimmed) { showToast("File is empty", "warning"); return; }
      let items: any[] = [];
      const isJson = file.name.endsWith(".json") || trimmed.startsWith("[") || trimmed.startsWith("{");
      if (isJson) {
        try {
          const parsed = JSON.parse(trimmed);
          if (Array.isArray(parsed)) items = parsed;
          else if (Array.isArray(parsed.notes)) items = parsed.notes;
          else if (parsed.title) items = [parsed];
          else { showToast("Invalid JSON format", "danger"); return; }
        } catch {
          const isJsonExt = file.name.endsWith(".json");
          if (isJsonExt) { showToast("Invalid JSON file", "danger"); return; }
        }
      }
      if (!items.length) {
        const lines = trimmed.split("\n").map((l) => l.replace(/\r$/, "")).filter((l) => l.trim());
        if (!lines.length) { showToast("No valid rows", "warning"); return; }
        const firstCells = splitCsvLine(lines[0], lines[0].includes("\t") ? "\t" : ",");
        const lower = firstCells.map((c) => c.toLowerCase().trim());
        const hasHeader = lower.includes("title") || lower.includes("content");
        const headerMap: Record<string, number> = {};
        let start = 0;
        if (hasHeader) {
          lower.forEach((h, i) => { headerMap[h] = i; });
          start = 1;
        } else {
          headerMap["title"] = 0; headerMap["content"] = 1; headerMap["topicid"] = 2; headerMap["tags"] = 3;
        }
        for (let i = start; i < lines.length; i++) {
          const delim = lines[i].includes("\t") ? "\t" : ",";
          const cells = splitCsvLine(lines[i], delim);
          const get = (k: string) => {
            const idx = headerMap[k];
            return idx !== undefined && idx < cells.length ? cells[idx] : "";
          };
          const title = (get("title") || cells[0] || "").trim();
          if (!title) continue;
          items.push({
            title,
            content: get("content") || "",
            topicId: get("topicid") || get("topic_id") || get("topic") || "",
            tags: get("tags") || "",
          });
        }
      }
      if (!items.length) { showToast("No valid notes found", "warning"); return; }
      let ok = 0, skipped = 0;
      for (const raw of items) {
        const title = String(raw.title ?? raw.name ?? "").trim();
        if (!title) { skipped++; continue; }
        const content = String(raw.content ?? raw.body ?? "").trim();
        // Topic is optional — notes without one import as standalone.
        const topicId = String(raw.topicId ?? raw.topic ?? "").trim() || null;
        let tagArr: string[] = [];
        if (Array.isArray(raw.tags)) tagArr = raw.tags.map((t: any) => String(t).trim()).filter(Boolean);
        else if (typeof raw.tags === "string" && raw.tags.trim()) tagArr = raw.tags.split(/[;,]/).map((t: string) => t.trim()).filter(Boolean);
        try {
          await createNote({ topicId, title, content, tags: tagArr });
          ok++;
        } catch { skipped++; }
      }
      const fresh = await getAllNotes();
      setNotes(fresh as Note[]);
      if (ok) showToast(`Imported ${ok} notes${skipped ? `, ${skipped} skipped` : ""}`, "success");
      else showToast("No notes imported", "warning");
    } catch (e) {
      console.error(e);
      showToast("Import failed: invalid file", "danger");
    } finally {
      setImporting(false);
      if (importInputRef.current) importInputRef.current.value = "";
    }
  };

  return (
    <div className="p-8 lg:p-12">
      {/* Header */}
      <div className="mb-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <RevealHeading text={t("notes.title")} className="text-5xl lg:text-8xl" />
            <ScrambleSubtitle
              text={t("notes.subtitle")}
              className="mt-4 text-sm text-muted-fg uppercase tracking-widest"
            />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative">
              <button
                onClick={() => setExportMenuOpen((o) => !o)}
                className="flex h-10 items-center gap-2 rounded-full border border-border bg-bg px-3 text-xs font-bold uppercase tracking-widest text-muted-fg transition-colors hover:border-accent hover:text-accent hover:bg-accent-soft"
              >
                <Download size={14} />
                {t("notes.exportBtn")}
              </button>
              {exportMenuOpen && (
                <>
                  <button className="fixed inset-0 z-10" onClick={() => setExportMenuOpen(false)} aria-label={t("common.closeExport")} />
                  <div className="absolute end-0 mt-2 w-44 overflow-hidden rounded-2xl border border-border bg-bg p-1 shadow-2xl z-20">
                    <button onClick={exportAsJson} className="flex w-full items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold tracking-wide text-fg hover:bg-accent-soft hover:text-accent text-start">
                      <Download size={14} /> JSON
                    </button>
                    <button onClick={exportAsCsv} className="flex w-full items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold tracking-wide text-fg hover:bg-accent-soft hover:text-accent text-start">
                      <Download size={14} /> CSV
                    </button>
                  </div>
                </>
              )}
            </div>
            <button
              onClick={() => importInputRef.current?.click()}
              disabled={importing}
              className="flex h-10 items-center gap-2 rounded-full border border-border bg-bg px-3 text-xs font-bold uppercase tracking-widest text-muted-fg transition-colors hover:border-accent hover:text-accent hover:bg-accent-soft disabled:opacity-50"
            >
              <Upload size={14} />
              {importing ? t("notes.importingBtn") : t("notes.importBtn")}
            </button>
            <input
              ref={importInputRef}
              type="file"
              accept=".json,.csv,.tsv,.txt,application/json,text/csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleNotesImport(f);
              }}
            />
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
              <Search size={16} className="absolute start-3 top-1/2 -translate-y-1/2 text-muted-fg" />
              <input
                placeholder={t("notes.searchNotes")}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-10 w-full rounded-xl border border-border bg-bg ps-10 pe-3 text-sm font-medium tracking-tight text-fg placeholder:text-muted-fg/60 focus:outline-none"
              />
            </div>
            {topicFilter && (
              <span className="inline-flex items-center gap-2 rounded-full border border-accent bg-accent px-3 py-1.5 text-xs font-bold uppercase tracking-widest text-accent-fg">
                <BookOpen size={12} /> {activeTopicName}
                <button onClick={() => router.push("/notes")} className="ms-1 hover:opacity-70" title="Clear topic filter">
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
          title={t("notes.emptyTitle")}
          description={t("notes.emptyDesc")}
          action={
            <Button onClick={() => setModalOpen(true)}>
              <Plus size={16} />
              {t("notes.createNoteBtn")}
            </Button>
          }
        />
      ) : filteredNotes.length === 0 ? (
        <EmptyState
          icon={<Search size={48} />}
          title={t("notes.noResultsTitle")}
          description={t("notes.noResultsDesc")}
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
              className="spotlight-card group relative flex h-[320px] w-full flex-col justify-between overflow-hidden rounded-2xl glass p-6 text-start transition-all duration-200 hover:-translate-y-1 cursor-pointer"
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
                  className="flex -me-2 gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100 max-md:opacity-100"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    onClick={() => router.push("/notes/" + note.id)}
                    aria-label="Study note"
                    title="Study"
                    className="rounded-full p-2.5 text-muted-fg transition-colors hover:text-accent"
                  >
                    <Eye size={14} />
                  </button>
                  <button
                    onClick={() => openEdit(note)}
                    aria-label="Edit"
                    className="rounded-full p-2.5 text-muted-fg transition-colors hover:text-accent"
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    onClick={() => handleTogglePin(note.id, note.isPinned)}
                    aria-label={isPinned ? "Unpin" : "Pin"}
                    className={`rounded-full p-2.5 transition-colors ${isPinned ? "text-accent" : "text-muted-fg hover:text-accent"}`}
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
                    {isPinned && <span className="ms-2 text-accent">· Pinned</span>}
                  </p>
                )}
                <div className="mt-3 line-clamp-3 text-sm leading-relaxed text-muted-fg">
                  {note.content ? <Markdown content={note.content} /> : <span className="italic text-muted-fg/70">No content</span>}
                </div>
                {/* Explanation snippet */}
                {(note as any).explanation && (
                  <div className={`mt-3 flex gap-2 rounded-xl border px-3 py-2 ${(note as any).explanationUpdatedAt && new Date(note.updatedAt).getTime() > new Date((note as any).explanationUpdatedAt).getTime() + 1500 ? "border-amber-500/25 bg-amber-500/10" : "border-accent/15 bg-accent-soft/40"}`}>
                    <Lightbulb size={12} className={`mt-0.5 shrink-0 ${(note as any).explanationUpdatedAt && new Date(note.updatedAt).getTime() > new Date((note as any).explanationUpdatedAt).getTime() + 1500 ? "text-amber-600" : "text-accent"}`} />
                    <p className="line-clamp-2 text-xs leading-relaxed text-fg/75">
                      {(note as any).explanationUpdatedAt && new Date(note.updatedAt).getTime() > new Date((note as any).explanationUpdatedAt).getTime() + 1500 && (
                        <span className="inline-flex items-center gap-1 font-bold text-amber-600 dark:text-amber-400 me-1"><ClockAlert size={10}/> Outdated ·</span>
                      )}
                      {(note as any).explanation.replace(/\n/g, " ").slice(0, 130)}{(note as any).explanation.length > 130 ? "…" : ""}
                    </p>
                  </div>
                )}
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
              <div className="absolute bottom-3 end-3 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
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
            {selectedTopicId && (
              <button
                type="button"
                onClick={() => setSelectedTopicId("")}
                className="inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-xs font-bold text-muted-fg transition-colors hover:border-danger/20 hover:bg-danger/10 hover:text-danger"
              >
                <X size={12} /> Remove
              </button>
            )}
            <p className="text-[11px] uppercase tracking-widest text-muted-fg">
              {selectedTopicId ? t("notes.linkedHint") : t("notes.optionalHint")}
            </p>
          </div>
          <Input
            label={t("notes.titleField")}
            placeholder={t("notes.noteTitle")}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <Textarea
            label={t("notes.contentField")}
            placeholder={t("notes.writeHere")}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={8}
          />
          <TagInput label={t("notes.tags")} tags={tags} onChange={setTags} />
          <div className="flex justify-end gap-4 pt-4">
            <Button variant="ghost" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleCreate}
              disabled={isPending || !title.trim()}
            >
              {isPending ? "Creating..." : "Create"}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Edit Modal */}
      <Modal open={!!editNote} onClose={() => { setEditNote(null); setEditTopicId(""); }} title="Edit note">
        {editNote && (
          <div className="space-y-6">
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-widest text-muted-fg">
                Topic
              </label>
              <SubjectTopicSelect
                subjects={subjects}
                value={editTopicId}
                onChange={setEditTopicId}
              />
              {editTopicId && (
                <button
                  type="button"
                  onClick={() => setEditTopicId("")}
                  className="inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-xs font-bold text-muted-fg transition-colors hover:border-danger/20 hover:bg-danger/10 hover:text-danger"
                >
                  <X size={12} /> Remove
                </button>
              )}
              {!editTopicId && subjects.length > 0 && (
                <p className="text-[11px] uppercase tracking-widest text-warning">
                  {t("notes.pickSubject")}
                </p>
              )}
            </div>
            <Input
              label={t("notes.titleField")}
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
            />
            <Textarea
              label={t("notes.contentField")}
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              rows={8}
            />
            <TagInput label={t("notes.tags")} tags={editTags} onChange={setEditTags} />
            <div className="flex justify-end gap-4 pt-4">
              <Button variant="ghost" onClick={() => { setEditNote(null); setEditTopicId(""); }}>
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
