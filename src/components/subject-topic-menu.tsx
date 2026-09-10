"use client";

import { useEffect, useState } from "react";
import { getTopics } from "@/app/actions";
import { cn } from "@/lib/utils";

type Subject = { id: string; name: string; color?: string };

/**
 * SubjectTopicMenu — cascading subject → topic dropdown pair.
 * Pick a subject; its topics load into a second menu beside it.
 * Purely presentational choice (no creation) — unlike the flashcard
 * SubjectTopicSelect which can also create. Used where the record
 * stores a topicId (sessions) or just narrows context (goals).
 */
export function SubjectTopicMenu({
  subjects,
  subjectId,
  topicId,
  onSubjectChange,
  onTopicChange,
  subjectLabel = "Subject",
  topicLabel = "Topic",
  compact = false,
  subjectOptional = false,
}: {
  subjects: Subject[];
  subjectId: string;
  topicId: string;
  onSubjectChange: (subjectId: string) => void;
  onTopicChange: (topicId: string) => void;
  subjectLabel?: string;
  topicLabel?: string;
  compact?: boolean;
  /** When true: subject may stay empty and topic empty = "No topic". */
  subjectOptional?: boolean;
}) {
  const [topics, setTopics] = useState<{ id: string; name: string }[] | null>(null);
  const [loading, setLoading] = useState(false);

  // Load topics whenever the chosen subject changes (and clear on empty).
  useEffect(() => {
    if (!subjectId) {
      setTopics(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    getTopics(subjectId)
      .then((ts) => {
        if (!cancelled) setTopics(ts.map((t) => ({ id: t.id, name: t.name })));
      })
      .catch(() => {
        if (!cancelled) setTopics([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [subjectId]);

  const selectCls = compact
    ? "glass-inset w-full cursor-pointer rounded-full px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-muted-fg outline-none appearance-none focus:outline-none focus:border-accent/20"
    : "glass-inset w-full rounded-xl px-4 py-3 text-sm text-fg transition-colors outline-none appearance-none disabled:opacity-50 focus:outline-none focus:border-accent/20";

  return (
    <div className={cn("grid gap-3", compact ? "grid-cols-2" : "sm:grid-cols-2")}>
      <div>
        {!compact && (
          <label className="mb-2 block text-xs font-bold tracking-wider text-muted-fg">
            {subjectLabel}
          </label>
        )}
        <select
          aria-label={subjectLabel}
          value={subjectId}
          onChange={(e) => {
            onSubjectChange(e.target.value);
            onTopicChange(""); // topic can't survive a subject switch
          }}
          className={selectCls}
        >
          <option value="" className="bg-bg text-fg">
            {subjectOptional
              ? "No subject"
              : subjectLabel === "Subject"
              ? "General"
              : `All ${subjectLabel.toLowerCase()}s`}
          </option>
          {subjects.map((s) => (
            <option key={s.id} value={s.id} className="bg-bg text-fg">
              {s.name}
            </option>
          ))}
        </select>
      </div>
      <div>
        {!compact && (
          <label className="mb-2 block text-xs font-bold tracking-wider text-muted-fg">
            {topicLabel}
          </label>
        )}
        <select
          aria-label={topicLabel}
          value={topicId}
          onChange={(e) => onTopicChange(e.target.value)}
          disabled={!subjectId || loading || !topics || topics.length === 0}
          className={selectCls}
        >
          <option value="" className="bg-bg text-fg">
            {loading
              ? "Loading…"
              : !subjectId
              ? `Pick a ${subjectLabel.toLowerCase()} first`
              : topics && topics.length === 0
              ? "No topics yet"
              : subjectOptional
              ? "No topic"
              : `All ${topicLabel.toLowerCase()}s`}
          </option>
          {(topics ?? []).map((t) => (
            <option key={t.id} value={t.id} className="bg-bg text-fg">
              {t.name}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}