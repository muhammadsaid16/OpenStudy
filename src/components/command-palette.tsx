"use client";

import { useT } from "@/lib/i18n";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getAllFlashcards, getAllNotes, getBundles, getSubjects, getTasks, getGoals } from "@/app/actions";
import { db } from "@/lib/db";
import { computeWeaknessSignals, examEvidenceFromQuestions } from "@/lib/weakness";
import { cardKind, maskCloze } from "@/lib/card-kinds";
import { cn } from "@/lib/utils";
import {
  Search,
  BookOpen,
  Layers,
  Target,
  FileQuestion,
  GraduationCap,
  Clock,
  ArrowRight,
  Sparkles,
  Folder,
  CheckSquare,
  FileText,
  Compass,
  AlertTriangle,
  Link as LinkIcon,
  Zap,
} from "lucide-react";

export type SearchEntry = {
  id: string;
  group: string;
  title: string;
  sub: string;
  href: string;
  icon?: string;
};

const PER_GROUP = 5;

// Relationship-aware global search: ⌘K / Ctrl+K fuzzy palette across the entire Study OS.
// Indexes Subjects, Topics, Notes, Flashcards, Tasks, Goals, Exams, Resources, Weakness Signals, and Quick Actions.
function hay(e: SearchEntry): string {
  return (e.title + " " + e.sub + " " + e.group).toLowerCase();
}

export function CommandPalette() {
  const t = useT();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const [index, setIndex] = useState<SearchEntry[] | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const startedRef = useRef(false);

  const load = useCallback(async () => {
    try {
      const [
        subjects,
        topics,
        bundles,
        cards,
        notes,
        tasks,
        goals,
        exams,
        questions,
        logs,
        resources,
      ] = await Promise.all([
        getSubjects(),
        db.topics.toArray(),
        getBundles(),
        getAllFlashcards(),
        getAllNotes(),
        getTasks(),
        getGoals(),
        db.exams.toArray(),
        db.examQuestions.filter((x) => x.isCorrect != null).toArray(),
        db.reviewLogs.toArray(),
        db.resources.toArray(),
      ]);

      const subjectById = new Map(subjects.map((s) => [s.id, s]));
      const topicById = new Map(topics.map((t) => [t.id, t]));

      // Compute live weakness signals for weak-area search items
      const examItems = examEvidenceFromQuestions(questions, exams);
      const weakness = computeWeaknessSignals({
        logs,
        cards,
        topics,
        subjects,
        examItems,
      });

      const out: SearchEntry[] = [];

      // 1. Quick Actions
      out.push(
        { id: "qa-review", group: "Actions", title: "Study All Due Cards", sub: "Spaced repetition review queue", href: "/review", icon: "zap" },
        { id: "qa-exam", group: "Actions", title: "Take Timed Exam", sub: "Test knowledge and identify weak areas", href: "/exam", icon: "exam" },
        { id: "qa-plan", group: "Actions", title: "Open Study Planner", sub: "Daily study capacity and forecast", href: "/plan", icon: "plan" },
        { id: "qa-session", group: "Actions", title: "Start Focus Session", sub: "Pomodoro or stopwatch study timer", href: "/sessions", icon: "clock" },
        { id: "qa-notes", group: "Actions", title: "Create Note", sub: "Write a lesson or study notes", href: "/notes", icon: "notes" },
        { id: "qa-cards", group: "Actions", title: "Create Flashcard", sub: "Add a new basic, cloze, or choice card", href: "/flashcards", icon: "cards" },
        { id: "qa-goals", group: "Actions", title: "View Goals & Milestones", sub: "Kanban roadmap and todo tasks", href: "/goals", icon: "target" }
      );

      // 2. Weak Areas (highlighted if detected)
      for (const w of weakness) {
        if (w.score > 0) {
          out.push({
            id: "w-" + (w.topicId ?? w.label),
            group: "Weak Areas",
            title: `${w.label} (Weakness: ${w.score})`,
            sub: `${w.evidence} · Drill available`,
            href: `/exam?practice=true&topicId=${w.topicId ?? ""}`,
            icon: "weakness",
          });
        }
      }

      // 3. Topics (relationship-rich)
      for (const tp of topics) {
        const sub = subjectById.get(tp.subjectId);
        const cardCount = cards.filter((c) => c.topicId === tp.id).length;
        const taskCount = tasks.filter((tk) => tk.topicId === tp.id && tk.status !== "done").length;
        const noteCount = notes.filter((n) => n.topicId === tp.id).length;
        const metaParts = [];
        if (sub) metaParts.push(sub.name);
        metaParts.push(`${cardCount} cards`);
        if (taskCount > 0) metaParts.push(`${taskCount} open tasks`);
        if (noteCount > 0) metaParts.push(`${noteCount} notes`);

        out.push({
          id: "tp-" + tp.id,
          group: "Topics",
          title: tp.name,
          sub: metaParts.join(" · "),
          href: `/subjects?subjectId=${tp.subjectId}`,
          icon: "topic",
        });
      }

      // 4. Exams
      for (const ex of exams.slice(0, 50)) {
        const isDone = ex.status === "completed";
        const meta = isDone
          ? `Completed · Score: ${ex.scorePct ?? 0}% · ${ex.questionCount} Questions`
          : `Upcoming · ${ex.questionCount} Questions${ex.timeLimitSec ? ` · ${Math.round(ex.timeLimitSec / 60)} min` : " · Untimed"}`;
        out.push({
          id: "ex-" + ex.id,
          group: "Exams",
          title: ex.title,
          sub: meta,
          href: isDone ? `/exam` : `/exam`,
          icon: "exam",
        });
      }

      // 5. Tasks (connected to topics/subjects)
      for (const tk of tasks.slice(0, 100)) {
        const tp = tk.topicId ? topicById.get(tk.topicId) : null;
        const sub = tk.subjectId ? subjectById.get(tk.subjectId) : null;
        const path = tp ? (sub ? `${sub.name} › ${tp.name}` : tp.name) : (sub?.name ?? "General");
        const statusLabel = tk.status === "done" ? "Done" : tk.status === "in_progress" ? "In Progress" : "Todo";
        out.push({
          id: "tk-" + tk.id,
          group: "Tasks",
          title: tk.title,
          sub: `${statusLabel} · ${path}${tk.dueDate ? ` · Due ${new Date(tk.dueDate).toLocaleDateString()}` : ""}`,
          href: "/plan",
          icon: "task",
        });
      }

      // 6. Goals
      for (const g of goals.slice(0, 50)) {
        const sub = g.subjectId ? subjectById.get(g.subjectId) : null;
        out.push({
          id: "g-" + g.id,
          group: "Goals",
          title: g.title,
          sub: `${g.horizon === "long" ? "Long-Term Vision" : "Todo"} · ${g.status}${sub ? ` · ${sub.name}` : ""}`,
          href: "/goals",
          icon: "goal",
        });
      }

      // 7. Notes
      for (const n of (notes ?? []).slice(0, 500)) {
        const tp = n.topicId ? topicById.get(n.topicId) : null;
        const sub = tp?.subjectId ? subjectById.get(tp.subjectId) : null;
        const path = tp ? (sub ? `${sub.name} › ${tp.name}` : tp.name) : (n.isPinned ? "Pinned Note" : "Standalone");
        out.push({
          id: "n-" + n.id,
          group: t("common.notesLabel"),
          title: n.title,
          sub: path,
          href: "/notes/" + n.id,
          icon: "notes",
        });
      }

      // 8. Flashcards (cloze-aware)
      for (const c of (cards ?? []).slice(0, 1500)) {
        const k = cardKind(c as { kind?: string | null });
        const front = k === "cloze" ? maskCloze(c.front) : c.front;
        const tp = c.topicId ? topicById.get(c.topicId) : null;
        const sub = c.subjectId ? subjectById.get(c.subjectId) : null;
        const path = tp ? (sub ? `${sub.name} › ${tp.name}` : tp.name) : (sub?.name ?? k.toUpperCase());
        out.push({
          id: "c-" + c.id,
          group: t("ui.cards"),
          title: front.slice(0, 90),
          sub: `${k === "basic" ? c.back.slice(0, 60) : k.toUpperCase()} · ${path}`,
          href: c.bundleId ? "/bundles/" + c.bundleId + "/cards" : "/subjects",
          icon: "cards",
        });
      }

      // 9. Resources
      for (const res of resources.slice(0, 100)) {
        const tp = topicById.get(res.topicId);
        out.push({
          id: "res-" + res.id,
          group: "Resources",
          title: res.title,
          sub: `${res.type.toUpperCase()} · ${tp?.name ?? "General"}`,
          href: res.url || "/subjects",
          icon: "resource",
        });
      }

      // 10. Subjects & Bundles
      for (const s of subjects) {
        const topicCount = topics.filter((t) => t.subjectId === s.id).length;
        out.push({
          id: "s-" + s.id,
          group: t("common.subjects"),
          title: s.name,
          sub: `${topicCount} topics`,
          href: "/subjects",
          icon: "subject",
        });
      }
      for (const b of bundles ?? []) {
        out.push({
          id: "b-" + b.id,
          group: t("page.bundles"),
          title: b.name,
          sub: (b as { description?: string }).description ?? "Card Deck",
          href: "/bundles/" + b.id + "/cards",
          icon: "bundle",
        });
      }

      setIndex(out);
    } catch {
      setIndex([]);
    }
  }, [t]);

  const toggle = useCallback(() => {
    setQ("");
    setSel(0);
    if (startedRef.current === false) {
      startedRef.current = true;
      void load();
    }
    setOpen((o) => !o);
  }, [load]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        toggle();
      } else if (e.key === "Escape") setOpen(false);
    };
    const onCustom = () => toggle();
    window.addEventListener("keydown", onKey);
    window.addEventListener("open-command-palette", onCustom);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("open-command-palette", onCustom);
    };
  }, [toggle]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 30);
  }, [open]);

  const results = useMemo(() => {
    const all = index ?? [];
    const needle = q.trim().toLowerCase();
    const pool = needle ? all.filter((e) => hay(e).includes(needle)) : all;
    const out: SearchEntry[] = [];
    const groupOrder = [
      "Actions",
      "Weak Areas",
      "Topics",
      "Exams",
      "Tasks",
      "Goals",
      t("common.notesLabel"),
      t("ui.cards"),
      "Resources",
      t("common.subjects"),
      t("page.bundles"),
    ];

    for (const g of groupOrder) {
      for (const e of pool) {
        if (e.group !== g) continue;
        if (out.filter((x) => x.group === g).length >= PER_GROUP) continue;
        out.push(e);
      }
    }
    return out.slice(0, 32);
  }, [index, q, t]);

  const go = useCallback(
    (e: SearchEntry) => {
      setOpen(false);
      if (e.href.startsWith("http")) {
        window.open(e.href, "_blank", "noopener,noreferrer");
      } else {
        router.push(e.href);
      }
    },
    [router]
  );

  function onQuery(v: string) {
    setQ(v);
    setSel(0);
  }

  useEffect(() => {
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: "nearest" });
  }, [sel]);

  if (!open) return null;
  let lastGroup = "";

  return (
    <div
      role="dialog"
      aria-label={t("ui.global_search")}
      className="fixed inset-0 z-[90] flex items-start justify-center bg-black/60 p-4 pt-[10vh] backdrop-blur-sm"
      onClick={() => setOpen(false)}
    >
      <div
        className="w-full max-w-2xl overflow-hidden rounded-2xl border border-border bg-bg shadow-2xl transition-all"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative flex items-center border-b border-border/80 px-4">
          <Search size={18} className="text-muted-fg shrink-0" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => onQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setSel((s) => Math.min(s + 1, results.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setSel((s) => Math.max(s - 1, 0));
              } else if (e.key === "Enter" && results[sel]) {
                go(results[sel]);
              }
            }}
            placeholder="Search Study OS: subjects, topics, notes, cards, exams, tasks..."
            className="w-full bg-transparent px-4 py-4 text-sm font-semibold tracking-wide outline-none placeholder:text-muted-fg/70"
          />
          <kbd className="hidden sm:inline-block rounded-md border border-border bg-card/60 px-2 py-0.5 text-[10px] font-medium text-muted-fg">
            ESC to close
          </kbd>
        </div>

        <div ref={listRef} className="max-h-[55vh] overflow-y-auto p-2">
          {index === null && (
            <p className="px-4 py-8 text-center text-xs uppercase tracking-widest text-muted-fg">
              INDEXING STUDY OS…
            </p>
          )}
          {index !== null && results.length === 0 && (
            <div className="px-4 py-8 text-center">
              <p className="text-sm font-semibold text-muted-fg">{t("ui.no_matches")}</p>
              <p className="mt-1 text-xs text-muted-fg/70">
                Try searching for a subject, topic, exam title, or task.
              </p>
            </div>
          )}
          {results.map((e, i) => {
            const head = e.group !== lastGroup ? e.group : null;
            lastGroup = e.group;
            return (
              <div key={e.id}>
                {head && (
                  <div className="flex items-center gap-2 px-3 pb-1 pt-3">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-primary">
                      {head}
                    </span>
                    <div className="h-px flex-1 bg-border/40" />
                  </div>
                )}
                <button
                  type="button"
                  data-active={i === sel}
                  onMouseEnter={() => setSel(i)}
                  onClick={() => go(e)}
                  className={cn(
                    "flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-start transition-colors",
                    i === sel ? "bg-primary-container/20 text-primary" : "hover:bg-primary-container/10"
                  )}
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-card/80 text-muted-fg">
                      {e.group === "Actions" ? (
                        <Zap size={14} className="text-accent" />
                      ) : e.group === "Weak Areas" ? (
                        <AlertTriangle size={14} className="text-danger" />
                      ) : e.group === "Topics" ? (
                        <Folder size={14} className="text-primary" />
                      ) : e.group === "Exams" ? (
                        <FileQuestion size={14} className="text-secondary" />
                      ) : e.group === "Tasks" ? (
                        <CheckSquare size={14} className="text-flow" />
                      ) : e.group === "Goals" ? (
                        <Target size={14} className="text-accent" />
                      ) : e.group === "Resources" ? (
                        <LinkIcon size={14} className="text-muted-fg" />
                      ) : e.group === t("common.notesLabel") ? (
                        <FileText size={14} className="text-primary" />
                      ) : (
                        <Layers size={14} className="text-muted-fg" />
                      )}
                    </span>
                    <div className="flex min-w-0 flex-col">
                      <span className="truncate text-sm font-semibold">{e.title}</span>
                      {e.sub !== "" && (
                        <span className="truncate text-xs text-muted-fg">{e.sub}</span>
                      )}
                    </div>
                  </div>
                  <ArrowRight
                    size={14}
                    className={cn(
                      "shrink-0 transition-opacity",
                      i === sel ? "opacity-100 text-primary" : "opacity-0"
                    )}
                  />
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}