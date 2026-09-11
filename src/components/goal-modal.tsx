"use client";

import { useT } from "@/lib/i18n";

// GoalModal — create/edit a goal. Aurora Glass styling: glass-inset
// wells, rounded-full pill horizon picker, theme-token swatches only
// (no hardcoded colors — adapts to all 12 themes).

import { useState } from "react";
import { Modal, Input, Textarea, Button } from "@/components/ui";
import { createGoal, updateGoal } from "@/app/actions";
import { SubjectTopicMenu } from "@/components/subject-topic-menu";
import type { GoalRec, GoalHorizon, GoalRepeat, SubjectRec } from "@/lib/db";
import { cn } from "@/lib/utils";
import { Rocket, ListTodo, Repeat } from "lucide-react";

// Swatch palette drawn from theme tokens — resolved at runtime so every
// theme recolors them. `null` = no custom color.
const SWATCHES: { value: string | null; css: string; label: string }[] = [
  { value: null, css: "transparent", label: "ui.no_color" },
  { value: "var(--color-accent)", css: "var(--color-accent)", label: "Accent" },
  { value: "var(--color-flow)", css: "var(--color-flow)", label: "Flow" },
  { value: "var(--color-grow)", css: "var(--color-grow)", label: "Grow" },
  { value: "var(--color-badge-lavender)", css: "var(--color-badge-lavender)", label: "Lavender" },
  { value: "var(--color-badge-yellow)", css: "var(--color-badge-yellow)", label: "Yellow" },
  { value: "var(--color-badge-rose)", css: "var(--color-badge-rose)", label: "Rose" },
  { value: "var(--color-badge-mint)", css: "var(--color-badge-mint)", label: "Mint" },
  { value: "var(--color-badge-sky)", css: "var(--color-badge-sky)", label: "Sky" },
];

function toDateInputValue(d?: Date | null): string {
  if (!d) return "";
  const dt = new Date(d);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}

export function GoalModal({
  open,
  onClose,
  goal,
  subjects,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  goal: GoalRec | null; // null = create
  subjects: SubjectRec[];
  onSaved: () => void;
}) {
  const t = useT();
  if (!open) return null;
  // Keyed remount: the form re-initializes from `goal` every time the
  // modal opens — no useEffect/setState reset dance (React 19 lint-safe).
  return (
    <GoalForm
      key={goal?.id ?? "new"}
      goal={goal}
      subjects={subjects}
      onClose={onClose}
      onSaved={onSaved}
    />
  );
}

function GoalForm({
  goal,
  subjects,
  onClose,
  onSaved,
}: {
  goal: GoalRec | null;
  subjects: SubjectRec[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useT();
  const [title, setTitle] = useState(goal?.title ?? "");
  const [description, setDescription] = useState(goal?.description ?? "");
  const [horizon, setHorizon] = useState<GoalHorizon>(goal?.horizon ?? "regular");
  const [dueDate, setDueDate] = useState(toDateInputValue(goal?.dueDate));
  const [repeat, setRepeat] = useState<GoalRepeat | null>(goal?.repeat ?? null);
  const [subjectId, setSubjectId] = useState<string>(goal?.subjectId ?? "");
  const [topicId, setTopicId] = useState("");
  const [color, setColor] = useState<string | null>(goal?.color ?? null);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    if (!title.trim() || saving) return;
    setSaving(true);
    try {
      const due = dueDate
        ? (() => {
            const [y, m, d] = dueDate.split("-").map(Number);
            return new Date(y, m - 1, d);
          })()
        : null;
      if (goal) {
        await updateGoal(goal.id, {
          title: title.trim(),
          description: description.trim() || null,
          horizon,
          dueDate: due,
          repeat,
          subjectId: subjectId || null,
          color,
        });
      } else {
        await createGoal({
          title: title.trim(),
          description: description.trim() || undefined,
          horizon,
          dueDate: due,
          repeat,
          subjectId: subjectId || null,
          color,
        });
      }
      onSaved();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={goal ? "ui.edit_goal" : "New goal"}>
      <div className="space-y-4">
        <Input
          placeholder={"modal.exampleGoal"}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSubmit();
          }}
          autoFocus
        />
        <Textarea
          placeholder={"modal.whyMatters"}
          rows={3}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />

        {/* Horizon picker */}
        <div>
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-widest text-muted-fg">{"ui.horizon"}</p>
          <div className="inline-flex w-full rounded-full border border-glass-border bg-glass p-1">
            {(
              [
                { id: "long", label: "goals.longTerm", icon: Rocket },
                { id: "regular", label: "goals.todo", icon: ListTodo },
              ] as const
            ).map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => setHorizon(id)}
                className={cn(
                  "relative flex flex-1 items-center justify-center gap-1.5 rounded-full px-3 py-2 text-xs font-bold transition-colors",
                  horizon === id ? "text-accent-fg" : "text-muted-fg hover:text-accent"
                )}
              >
                {horizon === id && (
                  <span className="absolute inset-0 rounded-full bg-accent" />
                )}
                <span className="relative z-10 flex items-center gap-1.5">
                  <Icon size={13} />
                  {label}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Repeat picker */}
        <div>
          <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest text-muted-fg">
            <Repeat size={11} />{"ui.repeats"}</p>
          <div className="inline-flex w-full rounded-full border border-glass-border bg-glass p-1">
            {(
              [
                { id: null, label: "Never" },
                { id: "daily", label: "Daily" },
                { id: "weekly", label: "Weekly" },
                { id: "monthly", label: "Monthly" },
              ] as const
            ).map(({ id, label }) => (
              <button
                key={label}
                type="button"
                onClick={() => setRepeat(id)}
                className={cn(
                  "relative flex flex-1 items-center justify-center rounded-full px-2 py-2 text-xs font-bold transition-colors",
                  repeat === id ? "text-accent-fg" : "text-muted-fg hover:text-accent"
                )}
              >
                {repeat === id && (
                  <span className="absolute inset-0 rounded-full bg-accent" />
                )}
                <span className="relative z-10">{label}</span>
              </button>
            ))}
          </div>
          {repeat && (
            <p className="mt-1.5 text-[11px] text-muted-fg">
              Completing this todo reschedules it automatically and returns it to the backlog.
            </p>
          )}
        </div>

        {/* Due date */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold uppercase tracking-widest text-muted-fg">{"ui.due_date"}</label>
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="glass-inset flex h-12 w-full rounded-xl px-4 py-2 text-base font-medium tracking-tight text-fg transition-colors duration-200 focus:outline-none focus:!border-accent/20"
          />
        </div>

        {/* Subject + topic context */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold uppercase tracking-widest text-muted-fg">{"dash.subject"}</label>
          <SubjectTopicMenu
            subjects={subjects}
            subjectId={subjectId}
            topicId={topicId}
            onSubjectChange={setSubjectId}
            onTopicChange={setTopicId}
          />
        </div>

        {/* Color swatches */}
        <div>
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-widest text-muted-fg">{"fc.color"}</p>
          <div className="flex flex-wrap items-center gap-2">
            {SWATCHES.map((s) => (
              <button
                key={s.label}
                type="button"
                aria-label={s.label}
                title={s.label}
                onClick={() => setColor(s.value)}
                className={cn(
                  "h-7 w-7 rounded-full border border-glass-border transition-transform hover:scale-110",
                  color === s.value &&
                    "ring-2 ring-accent ring-offset-2 ring-offset-bg-raised"
                )}
                style={{
                  background:
                    s.value === null
                      ? "repeating-linear-gradient(45deg, transparent, transparent 3px, color-mix(in srgb, var(--color-muted-fg) 30%, transparent) 3px, color-mix(in srgb, var(--color-muted-fg) 30%, transparent) 6px)"
                      : s.css,
                }}
              />
            ))}
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose}>{"common.cancel"}</Button>
          <Button onClick={handleSubmit} disabled={!title.trim() || saving}>
            {saving ? "fc.saving" : goal ? "Save changes" : "ui.create_goal"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
