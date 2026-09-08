"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Input } from "@/components/ui";
import { createTopic } from "@/app/actions";

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
}: {
  subjects: Subject[];
  value: string;
  onChange: (topicId: string) => void;
}) {
  const [selectedSubject, setSelectedSubject] = useState<string>("");
  const [topicName, setTopicName] = useState("");
  const [creating, setCreating] = useState(false);

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
      <p className="text-xs text-muted-fg uppercase tracking-widest">
        NO SUBJECTS YET — ADD ONE IN SUBJECTS FIRST
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <select
        value={selectedSubject}
        onChange={(e) => setSelectedSubject(e.target.value)}
        aria-label="Select a subject"
        className="flex h-12 w-full border-b-2 border-border bg-bg px-0 py-2 text-lg font-bold uppercase tracking-tight text-fg focus:outline-none"
      >
        <option value="" className="bg-bg text-fg">
          SELECT A SUBJECT...
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
            placeholder="TOPIC NAME (OPTIONAL)"
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
          TOPIC LINKED
        </p>
      )}
    </div>
  );
}
