"use client";

// ─── /exam — Exam Mode (Agent 3, Examiner) ───────────────────────
// Setup → runner → results. All scheduling side-effects happen inside
// answerExamQuestion (Contract 5); this page only renders and records.

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useT } from "@/lib/i18n";
import { useAppStore } from "@/lib/store";
import {
  createExam,
  getExam,
  getExamResults,
  answerExamQuestion,
  completeExam,
  abandonExam,
  getSubjects,
  getAllFlashcards,
  listExams,
  deleteExam,
  getExamTrace,
} from "@/app/actions";
import { filterExamPool } from "@/lib/exam";
import { shuffled } from "@/lib/card-kinds";
import { RATING_BUTTONS } from "@/lib/card-status";
import { Button, EmptyState, Modal, Input, Skeleton } from "@/components/ui";
import { CardImage } from "@/components/card-image";
import { cn } from "@/lib/utils";
import { db, type ExamQuestionRec, type ExamRec, type FlashcardRec, type SubjectRec } from "@/lib/db";
import { ArrowLeft, Award, CheckCircle2, ChevronRight, Clock, FileQuestion, ListChecks, Timer, Trash2, XCircle } from "lucide-react";

import { ExamRunner } from "@/components/exam-runner";
import { ExamDiagnosticReport } from "@/components/exam-diagnostic-report";

type Phase = "setup" | "running" | "results";
type TopicRow = { id: string; name: string; subjectId: string };

const TIME_OPTIONS = [null, 5, 10, 15, 30, 45, 60];

export default function ExamPage() {
  return <ExamContent />;
}

function ExamContent() {
  const t = useT();
  const [phase, setPhase] = useState<Phase>("setup");
  const [examId, setExamId] = useState<string | null>(null);
  const [history, setHistory] = useState<ExamRec[] | null>(null);

  useEffect(() => {
    listExams().then((xs) => setHistory(xs.filter((x) => x.status !== "in_progress").slice(0, 6)));
  }, [phase]);

  if (phase === "running" && examId) {
    return <ExamRunner examId={examId} onExit={async () => { await abandonExam(examId); setPhase("setup"); }} onFinish={() => setPhase("results")} />;
  }
  if (phase === "results" && examId) {
    return <ExamDiagnosticReport examId={examId} onRetake={() => setPhase("setup")} onNewExam={() => setPhase("setup")} />;
  }
  return <ExamSetup onStart={(id) => { setExamId(id); setPhase("running"); }} history={history} onDeleteExam={deleteExam} />;
}

// ─── Setup ───────────────────────────────────────────────────────
function ExamSetup({ onStart, history, onDeleteExam }: {
  onStart: (examId: string) => void;
  history: ExamRec[] | null;
  onDeleteExam: (id: string) => Promise<void>;
}) {
  const t = useT();
  const [title, setTitle] = useState("");
  const [subjects, setSubjects] = useState<SubjectRec[] | null>(null);
  const [topics, setTopics] = useState<TopicRow[] | null>(null);
  const [selSubjects, setSelSubjects] = useState<string[]>([]);
  const [selTopics, setSelTopics] = useState<string[]>([]);
  const [count, setCount] = useState(15);
  const [timeMin, setTimeMin] = useState<number | null>(15);
  const [practice, setPractice] = useState(false);
  const [poolSize, setPoolSize] = useState<number | null>(null);
  const [allCards, setAllCards] = useState<FlashcardRec[] | null>(null);
  const [starting, setStarting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<ExamRec | null>(null);

  useEffect(() => {
    (async () => {
      const [s, cards, allTopics] = await Promise.all([getSubjects(), getAllFlashcards(), db.topics.toArray()]);
      setSubjects(s);
      setAllCards(cards as FlashcardRec[]);
      setTopics(allTopics.map((x) => ({ id: x.id, name: x.name, subjectId: x.subjectId })));
    })();
  }, []);

  // Pool size reacts to scope changes so the sidebar count matches what
  // Start will actually build from.
  useEffect(() => {
    if (!allCards) return;
    setPoolSize(
      filterExamPool(allCards, {
        title: "",
        subjectIds: selSubjects,
        topicIds: selTopics,
        questionCount: 0,
        timeLimitSec: null,
        practiceOnly: false,
      }).length
    );
  }, [allCards, selSubjects, selTopics]);

  const visibleTopics = useMemo(() => {
    if (!topics) return [];
    return selSubjects.length ? topics.filter((tp) => selSubjects.includes(tp.subjectId)) : topics;
  }, [topics, selSubjects]);

  const start = async () => {
    setStarting(true);
    try {
      const exam = await createExam({
        title: title.trim() || t("exam.default_title"),
        subjectIds: selSubjects,
        topicIds: selTopics,
        questionCount: count,
        timeLimitSec: timeMin ? timeMin * 60 : null,
        practiceOnly: practice,
      });
      onStart(exam.id);
    } finally {
      setStarting(false);
    }
  };

  if (!subjects || !topics) return <div className="page-gutter"><Skeleton className="h-[420px] w-full" /></div>;

  return (
    <div className="page-gutter cq space-y-8">
      {/* Header — standard v2 page header (eyebrow → title → subtitle) */}
      <div className="mb-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-fg/70">{t("nav.practice")}</p>
        <h1 className="mt-1.5 text-3xl font-bold tracking-tight text-fg lg:text-[34px] lg:leading-tight">{t("page.exam")}</h1>
        <p className="mt-2 text-sm text-muted-fg">{t("page.exam.subtitle")}</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="glass space-y-6 rounded-2xl p-6">
          <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-widest text-muted-fg">{t("exam.title_label")}</label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t("exam.default_title")}
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-widest text-muted-fg">{t("exam.subjects_label")}</label>
            <div className="flex flex-wrap gap-2">
              {subjects.map((s) => {
                const on = selSubjects.includes(s.id);
                return (
                  <button
                    key={s.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => {
                      setSelSubjects((prev) => (on ? prev.filter((x) => x !== s.id) : [...prev, s.id]));
                      setSelTopics([]);
                    }}
                    className={cn(
                      "tap-target flex items-center rounded-full border px-3 py-1.5 text-xs font-bold tracking-tight transition-colors",
                      on ? "border-primary bg-primary-container text-on-primary-container" : "border-border text-muted-fg hover:border-primary/60 hover:text-primary"
                    )}
                  >
                    {s.name}
                  </button>
                );
              })}
              {subjects.length === 0 && <p className="text-xs text-muted-fg">{t("exam.no_subjects")}</p>}
            </div>
            <p className="text-[10px] uppercase tracking-widest text-muted-fg/70">{t("exam.subjects_hint")}</p>
          </div>

          {visibleTopics.length > 0 && (
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-widest text-muted-fg">{t("exam.topics_label")}</label>
              <div className="flex max-h-32 flex-wrap gap-2 overflow-y-auto">
                {visibleTopics.map((tp) => {
                  const on = selTopics.includes(tp.id);
                  return (
                    <button
                      key={tp.id}
                      type="button"
                      aria-pressed={on}
                      onClick={() => setSelTopics((prev) => (on ? prev.filter((x) => x !== tp.id) : [...prev, tp.id]))}
                      className={cn(
                        "rounded-full border px-2.5 py-1 text-[11px] font-bold tracking-tight transition-colors",
                        on ? "border-primary bg-primary-container/15 text-primary" : "border-border text-muted-fg hover:border-primary/60"
                      )}
                    >
                      {tp.name}
                    </button>
                  );
                })}
              </div>
              <p className="text-[10px] uppercase tracking-widest text-muted-fg/70">{t("exam.topics_hint")}</p>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-widest text-muted-fg">{t("exam.questions_label")}</label>
              <Input
                type="number"
                min={1}
                max={200}
                value={count}
                onChange={(e) => setCount(Math.min(200, Math.max(1, parseInt(e.target.value) || 1)))}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-widest text-muted-fg">{t("exam.time_label")}</label>
              <div className="flex flex-wrap gap-1.5">
                {TIME_OPTIONS.map((m) => (
                  <button
                    key={String(m)}
                    type="button"
                    aria-pressed={timeMin === m}
                    onClick={() => setTimeMin(m)}                      className={cn(
                        "tap-target flex items-center rounded-lg border px-2.5 py-2 text-[11px] font-bold transition-colors",
                        timeMin === m ? "border-primary bg-primary-container text-on-primary-container" : "border-border text-muted-fg hover:border-primary/60"
                      )}
                  >
                    {m === null ? t("exam.time_none") : `${m}m`}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border p-3">
            <input type="checkbox" checked={practice} onChange={(e) => setPractice(e.target.checked)} className="mt-0.5 accent-[var(--color-accent)]" />
            <span>
              <span className="block text-sm font-bold tracking-tight">{t("exam.practice_label")}</span>
              <span className="block text-xs text-muted-fg">{t("exam.practice_hint")}</span>
            </span>
          </label>

          <Button onClick={start} disabled={starting || (poolSize ?? 0) === 0} className="w-full">
            <FileQuestion size={16} />
            {starting ? t("common.loading") : t("exam.start")}
          </Button>
        </div>

        <div className="space-y-4">
          <div className="glass rounded-2xl p-5 text-sm">
            <p className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-muted-fg"><ListChecks size={13} />{t("exam.pool_label")}</p>
            <p className="text-2xl font-black tracking-tight">{poolSize ?? "—"}</p>
            <p className="mt-1 text-xs text-muted-fg">{t("exam.pool_hint")}</p>
          </div>
          <div className="glass rounded-2xl p-5 text-xs leading-relaxed text-muted-fg">
            <p className="mb-1 font-bold uppercase tracking-widest text-fg">{t("exam.feed_title")}</p>
            <p>{t("exam.feed_hint")}</p>
          </div>
        </div>
      </div>

      {history && history.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs font-bold uppercase tracking-widest text-muted-fg">{t("exam.history")}</p>
          {history.map((x) => (
            <div key={x.id} className="glass flex items-center justify-between rounded-xl px-4 py-3">
              <div>
                <p className="text-sm font-bold tracking-tight">{x.title}</p>
                <p className="text-[10px] uppercase tracking-widest text-muted-fg">
                  {x.status === "completed" ? `${x.scorePct}% · ${x.correctCount}/${x.questionCount}` : x.status} · {new Date(x.startedAt).toLocaleDateString()}
                </p>
              </div>
              <button aria-label={t("exam.delete")} onClick={() => setConfirmDelete(x)} className="text-muted-fg hover:text-danger"><Trash2 size={15} /></button>
            </div>
          ))}
        </div>
      )}

      <Modal open={!!confirmDelete} onClose={() => setConfirmDelete(null)} title={t("exam.delete")}>
        <p className="text-sm text-muted-fg">{t("exam.delete_confirm")}</p>
        <div className="flex justify-end gap-3 pt-4">
          <Button variant="ghost" onClick={() => setConfirmDelete(null)}>{t("common.cancel")}</Button>
          <Button variant="danger" onClick={async () => { if (confirmDelete) { await onDeleteExam(confirmDelete.id); setConfirmDelete(null); } }}>{t("exam.delete")}</Button>
        </div>
      </Modal>

      {poolSize === 0 && (
        <EmptyState icon={<FileQuestion size={44} />} title={t("exam.pool_empty_title")} description={t("exam.pool_empty_hint")} />
      )}
    </div>
  );
}
