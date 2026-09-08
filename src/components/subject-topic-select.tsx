"use client";

import { useEffect, useState } from "react";
import { Plus, Check } from "lucide-react";
import { Input } from "@/components/ui";
import { createTopic, createSubject, getSubjects, getTopics } from "@/app/actions";
import { showToast } from "@/components/toast";
import { SubjectTopicMenu } from "@/components/subject-topic-menu";

type Subject = { id: string; name: string; color: string };
type Topic = { id: string; name: string; _count?: { flashcards: number } };

/**
 * Subject-first topic picker.
 * - Pick one of YOUR subjects (from /subjects).
 * - Optionally type a topic name → creates it under that subject.
 * - If no topic name given, a topic is auto-created using the subject name.
 * - Zero subjects: inline first-subject creation (no dead-end).
 * - Linked state renders as an EDITABLE menu (change subject / pick existing
 *   topic / rename new topic), not dead "Topic linked" text.
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
  // Inline first-subject creation (new-account dead-end fix)
  const [newSubjectName, setNewSubjectName] = useState("");
  const [subjectErr, setSubjectErr] = useState("");
  // Menu state (linked mode)
  const [topics, setTopics] = useState<Topic[] | null>(null);
  const [loadingTopics, setLoadingTopics] = useState(false);

  const loadTopics = async (subjectId: string) => {
    setLoadingTopics(true);
    try {
      setTopics(await getTopics(subjectId));
    } catch {
      setTopics([]);
    } finally {
      setLoadingTopics(false);
    }
  };

  // When the linked topic's subject changes elsewhere, sync the menu.
  useEffect(() => {
    if (!value) return;
    if (selectedSubject && topics !== null) return; // menu already built
    // subject unknown until user opens the menu — leave blank; it fills on open
  }, [value, selectedSubject, topics]);

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

  const resolve = async (subjectId: string, name: string, topicId?: string) => {
    if (topicId) {
      onChange(topicId);
      return;
    }
    setCreating(true);
    try {
      const topic = await createTopic({
        subjectId,
        name: name.trim() || subjects.find((s) => s.id === subjectId)?.name || "General",
      });
      onChange(topic.id);
      setTopicName("");
    } catch (e) {
      console.error("Topic creation failed", e);
      showToast("Couldn't create topic — try again", "danger");
    } finally {
      setCreating(false);
    }
  };

  // ── Linked: render as a change/pick menu ──────────────────────
  if (value) {
    return (
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-grow/40 bg-grow/10 px-2.5 py-1 text-xs font-bold text-grow">
            <Check size={12} /> Topic linked
          </span>
          <button
            type="button"
            onClick={() => {
              // Toggle menu: opening it (re)builds the topic list for the current subject
              if (topics === null && selectedSubject) void loadTopics(selectedSubject);
              setTopics((t) => (t === null ? [] : null));
            }}
            className="text-xs font-bold text-accent hover:underline"
          >
            {topics === null ? "Change" : "Close"}
          </button>
        </div>

        {topics !== null && (
          <div className="space-y-3 rounded-xl border border-border bg-bg-raised/40 p-3">
            {/* subject switch */}
            <select
              value={selectedSubject}
              onChange={(e) => {
                setSelectedSubject(e.target.value);
                setTopics([]);
                if (e.target.value) void loadTopics(e.target.value);
              }}
              aria-label="Select a subject"
              className="flex h-10 w-full rounded-lg border border-border bg-bg px-2 text-sm font-bold text-fg focus:outline-none focus:border-accent"
            >
              <option value="" className="bg-bg text-fg">Select a subject…</option>
              {subjects.map((s) => (
                <option key={s.id} value={s.id} className="bg-bg text-fg">{s.name}</option>
              ))}
            </select>

            {/* existing topics of that subject */}
            {loadingTopics && <p className="text-xs text-muted-fg">Loading topics…</p>}
            {!loadingTopics && topics.length > 0 && (
              <div className="max-h-36 space-y-1 overflow-y-auto">
                {topics.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => resolve(selectedSubject, "", t.id)}
                    className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-sm text-fg transition-colors hover:bg-accent/10"
                  >
                    <span className="truncate">{t.name}</span>
                    {typeof t._count?.flashcards === "number" && (
                      <span className="ml-2 shrink-0 font-mono text-[10px] text-muted-fg">
                        {t._count.flashcards}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}
            {!loadingTopics && topics.length === 0 && selectedSubject && (
              <p className="text-xs text-muted-fg">No topics in this subject yet.</p>
            )}

            {/* new topic under selected subject */}
            {selectedSubject && (
              <div className="flex gap-2">
                <Input
                  placeholder="New topic name"
                  value={topicName}
                  onChange={(e) => setTopicName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      resolve(selectedSubject, topicName);
                    }
                  }}
                />
                <button
                  type="button"
                  disabled={creating || !topicName.trim()}
                  onClick={() => resolve(selectedSubject, topicName)}
                  className="inline-flex shrink-0 items-center gap-2 rounded-full border border-border bg-bg px-4 text-xs font-bold text-fg transition-all hover:bg-accent hover:text-accent-fg disabled:opacity-50"
                >
                  <Plus size={14} />
                  {creating ? "…" : "Use"}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  // ── No subjects yet: inline first-subject creation ────────────
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

  // ── Default: subject select + topic menu of that subject ──────
  return (
    <div className="space-y-3">
      <select
        value={selectedSubject}
        onChange={(e) => {
          setSelectedSubject(e.target.value);
          setTopics(null); // menu below reloads for the new subject
        }}
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
        <SubjectTopicMenu
          subjects={subjects}
          subjectId={selectedSubject}
          topicId={value}
          onSubjectChange={setSelectedSubject}
          onTopicChange={(tid: string) => {
            if (tid) resolve(selectedSubject, "", tid);
          }}
        />
      )}

      {selectedSubject && (
        <div className="flex gap-2">
          <Input
            placeholder="…or type a new topic name"
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
    </div>
  );
}
