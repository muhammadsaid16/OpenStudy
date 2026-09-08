"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Input } from "@/components/ui";
import { createTopic, createSubject, getSubjects } from "@/app/actions";

type Subject = { id: string; name: string; color: string };

/**
 * Subject-first topic picker.
 * - Pick one of YOUR subjects (from /subjects).
 * - Optionally type a topic name → creates it under that subject.
 * - If no topic name given, a topic is auto-created using the subject name.
 * Returns topicId via onChange once resolved.
 */
export function SubjectTopicSelect({
  subjects,
  value,
  onChange,
  onSubjectsChange,
}: {
  subjects: Subject[];
  value: string;
  onChange: (topicId: string) => void;
  /** Called after an inline subject creation so the parent list refreshes. */
  onSubjectsChange?: (subjects: Subject[]) => void;
}) {
  const [selectedSubject, setSelectedSubject] = useState<string>("");
  const [topicName, setTopicName] = useState("");
  const [creating, setCreating] = useState(false);
  // Inline first-subject creation (new-account dead-end: previously the
  // picker was unusable until you left to /subjects manually).
  const [newSubjectName, setNewSubjectName] = useState("");
  const [subjectErr, setSubjectErr] = useState("");

  const createSubjectInline = async () => {
    const name = newSubjectName.trim();
    if (!name) return;
    setSubjectErr("");
    setCreating(true);
    try {
      const s = await createSubject({ name, color: "#FF7A72", icon: "book-open" });
      setSelectedSubject(s.id);
      setNewSubjectName("");
      if (onSubjectsChange) {
        try { onSubjectsChange(await getSubjects()); } catch { /* parent list stays; selection works */ }
      }
    } catch {
      setSubjectErr("Couldn't create subject — try again.");
    } finally {
      setCreating(false);
    }
  };

  const resolve = async (subjectId: string, name: string) => {
    setCreating(true);
    try {
      const topic = await createTopic({
        subjectId,
        name: name.trim() || subjects.find((s) => s.id === subjectId)?.name || "General",
      });
      onChange(topic.id);
    } finally {
      setCreating(false);
    }
  };

  if (subjects.length === 0) {
    return (
      <div className="space-y-2">
        <Input
          autoFocus
          placeholder="Subject name (e.g. Biology)"
          value={newSubjectName}
          onChange={(e) => setNewSubjectName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              createSubjectInline();
            }
          }}
        />
        <button
          type="button"
          disabled={creating || !newSubjectName.trim()}
          onClick={createSubjectInline}
          className="inline-flex shrink-0 items-center gap-2 rounded-full border border-border bg-bg px-4 py-2 text-xs font-bold text-fg transition-all hover:bg-accent hover:text-accent-fg disabled:opacity-50"
        >
          <Plus size={14} />
          {creating ? "Creating…" : "Create subject"}
        </button>
        {subjectErr && <p className="text-xs text-danger">{subjectErr}</p>}
        <p className="text-xs text-muted-fg">First subject — more can be added in Subjects later.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <select
        value={selectedSubject}
        onChange={(e) => setSelectedSubject(e.target.value)}
        aria-label="Select a subject"
        className="flex h-12 w-full border-b border-border bg-bg px-0 py-2 text-lg font-bold uppercase tracking-tight text-fg focus:outline-none"
      >
        <option value="" className="bg-bg text-fg">
          Select a subject…
        </option>
        {subjects.map((s) => (
          <option key={s.id} value={s.id} className="bg-bg text-fg">
            {s.name}
          </option>
        ))}
      </select>

      {selectedSubject && (
        <div className="flex gap-2">
          <Input
            placeholder="Topic name (optional)"
            value={topicName}
            onChange={(e) => setTopicName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") resolve(selectedSubject, topicName);
            }}
          />
          <button
            type="button"
            disabled={creating}
            onClick={() => resolve(selectedSubject, topicName)}
            className="inline-flex shrink-0 items-center gap-2 rounded-full border border-border bg-bg px-4 text-xs font-bold uppercase tracking-tighter text-fg transition-all hover:bg-accent hover:text-accent-fg disabled:opacity-50"
          >
            <Plus size={14} />
            {creating ? "…" : "Use"}
          </button>
        </div>
      )}

      {value && (
        <p className="text-xs text-muted-fg uppercase tracking-widest">
          Topic linked
        </p>
      )}
    </div>
  );
}
