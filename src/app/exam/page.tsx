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
} from "@/app/actions";
import { filterExamPool } from "@/lib/exam";
import { shuffled } from "@/lib/card-kinds";
import { RATING_BUTTONS } from "@/lib/card-status";
import { Button, EmptyState, Modal, Skeleton } from "@/components/ui";
import { cn } from "@/lib/utils";
import { db, type ExamQuestionRec, type ExamRec, type SubjectRec } from "@/lib/db";
import { ArrowLeft, Award, CheckCircle2, ChevronRight, Clock, FileQuestion, ListChecks, Timer, Trash2, XCircle } from "lucide-react";

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
    return <ExamResults examId={examId} onRetake={() => setPhase("setup")} />;
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
  const [starting, setStarting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<ExamRec | null>(null);

  useEffect(() => {
    (async () => {
      const [s, cards, allTopics] = await Promise.all([getSubjects(), getAllFlashcards(), db.topics.toArray()]);
      setSubjects(s);
      setTopics(allTopics.map((x) => ({ id: x.id, name: x.name, subjectId: x.subjectId })));
      setPoolSize(filterExamPool(cards as any, { title: "", subjectIds: [], topicIds: [], questionCount: 0, timeLimitSec: null, practiceOnly: false }).length);
    })();
  }, []);

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

  if (!subjects || !topics) return <Skeleton className="h-[420px] w-full" />;

  return (
    <div className="space-y-8">
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="glass space-y-6 rounded-2xl p-6">
          <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-widest text-muted-fg">{t("exam.title_label")}</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t("exam.default_title")}
              className="h-11 w-full rounded-xl border border-glass-border bg-glass px-3 text-sm font-bold tracking-tight text-fg backdrop-blur-md focus:border-accent focus:outline-none"
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
                      "rounded-full border px-3 py-1.5 text-xs font-bold tracking-tight transition-colors",
                      on ? "border-accent bg-accent text-accent-fg" : "border-border text-muted-fg hover:border-accent/60 hover:text-accent"
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
                        on ? "border-accent bg-accent/15 text-accent" : "border-border text-muted-fg hover:border-accent/60"
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
              <input
                type="number"
                min={1}
                max={200}
                value={count}
                onChange={(e) => setCount(Math.min(200, Math.max(1, parseInt(e.target.value) || 1)))}
                className="h-11 w-full rounded-xl border border-glass-border bg-glass px-3 text-sm font-bold text-fg backdrop-blur-md focus:border-accent focus:outline-none"
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
                    onClick={() => setTimeMin(m)}
                    className={cn(
                      "rounded-lg border px-2.5 py-2 text-[11px] font-bold transition-colors",
                      timeMin === m ? "border-accent bg-accent text-accent-fg" : "border-border text-muted-fg hover:border-accent/60"
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

// ─── Runner ──────────────────────────────────────────────────────
function ExamRunner({ examId, onExit, onFinish }: { examId: string; onExit: () => void; onFinish: () => void }) {
  const t = useT();
  const reducedMotion = useAppStore((s) => s.reducedMotion);
  const [loaded, setLoaded] = useState(false);
  const [exam, setExam] = useState<ExamRec | null>(null);
  const [questions, setQuestions] = useState<ExamQuestionRec[]>([]);
  const [idx, setIdx] = useState(0);
  const [choiceOptions, setChoiceOptions] = useState<string[]>([]);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [finishing, setFinishing] = useState(false);
  const [confirmExit, setConfirmExit] = useState(false);
  const answeredRef = useRef(false);
  const deadlineRef = useRef<number | null>(null);
  const finishedRef = useRef(false);

  useEffect(() => {
    (async () => {
      const data = await getExam(examId);
      if (!data) return;
      setExam(data.exam);
      setQuestions(data.questions);
      if (data.exam.timeLimitSec) {
        deadlineRef.current = Date.now() + data.exam.timeLimitSec * 1000;
        setRemaining(data.exam.timeLimitSec);
      }
      setLoaded(true);
    })();
  }, [examId]);

  const q = questions[idx];

  useEffect(() => {
    if (q?.kind === "choice" && q.choicesSnapshot) {
      setChoiceOptions(shuffled([q.backText, ...q.choicesSnapshot]));
    } else {
      setChoiceOptions([]);
    }
    answeredRef.current = false;
  }, [q?.id]);

  const finish = async () => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    setFinishing(true);
    await completeExam(examId);
    onFinish();
  };

  // Countdown — expiry auto-completes the exam with what was answered.
  useEffect(() => {
    if (remaining === null) return;
    const iv = setInterval(() => {
      const left = Math.max(0, Math.round(((deadlineRef.current ?? 0) - Date.now()) / 1000));
      setRemaining(left);
      if (left === 0) {
        clearInterval(iv);
        finish();
      }
    }, 1000);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remaining === null]);

  const answer = async (input: { mode: "choice"; answer: string } | { mode: "self"; quality: number }) => {
    if (!q || answeredRef.current || finishing) return;
    answeredRef.current = true;
    await answerExamQuestion(q.id, input);
    if (idx + 1 < questions.length) {
      setIdx(idx + 1);
    } else {
      await finish();
    }
  };

  if (!loaded || !exam || !q) return <Skeleton className="mx-auto h-[380px] w-full max-w-2xl" />;

  const answeredCount = questions.filter((x) => x.isCorrect !== null && x.isCorrect !== undefined).length;

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div className="flex items-center justify-between text-xs font-bold uppercase tracking-widest text-muted-fg">
        <button onClick={() => setConfirmExit(true)} className="flex items-center gap-1.5 hover:text-accent"><ArrowLeft size={13} />{t("exam.exit")}</button>
        <span>{idx + 1} / {questions.length}</span>
        {remaining !== null ? (
          <span className={cn("flex items-center gap-1.5", remaining < 60 && "text-danger")}><Timer size={13} />{Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, "0")}</span>
        ) : (
          <span className="flex items-center gap-1.5"><Clock size={13} />{exam.practiceOnly ? t("exam.practice_badge") : t("exam.real_badge")}</span>
        )}
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div className="h-full bg-accent transition-all" style={{ width: `${((idx + 1) / questions.length) * 100}%` }} />
      </div>

      <div className="glass min-h-[300px] rounded-2xl p-8">
        <p className="mb-4 text-[10px] font-bold uppercase tracking-widest text-muted-fg">
          {q.kind === "choice" ? t("exam.kind_choice") : t("exam.kind_self")}
        </p>
        <p className="whitespace-pre-wrap text-center text-2xl font-bold leading-relaxed tracking-tight">{q.frontText}</p>

        {q.kind === "choice" ? (
          <div className="mt-8 grid gap-2">
            {choiceOptions.map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() => answer({ mode: "choice", answer: opt })}
                className="rounded-xl border border-border bg-bg/60 px-4 py-3 text-sm font-bold tracking-tight transition-colors hover:border-accent hover:text-accent hover:bg-accent-soft"
              >
                {opt}
              </button>
            ))}
          </div>
        ) : (
          <div className="mt-8">
            <p className="mb-3 text-center text-xs uppercase tracking-widest text-muted-fg">{t("exam.rate_prompt")}</p>
            <div className="grid grid-cols-3 gap-2">
              {RATING_BUTTONS.map((btn) => (
                <button
                  key={btn.value}
                  onClick={() => answer({ mode: "self", quality: btn.value })}
                  className={cn("rounded-xl border px-3 py-3 text-sm font-bold transition-colors", btn.color)}
                >
                  <span className="block text-xs uppercase tracking-widest">{btn.shortLabel}</span>
                  <span className="block text-[10px] font-normal normal-case opacity-70">{btn.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <p className="text-center text-[10px] uppercase tracking-widest text-muted-fg">
        {answeredCount}/{questions.length} {t("exam.answered_count")}
      </p>

      <Modal open={confirmExit} onClose={() => setConfirmExit(false)} title={t("exam.exit")}>
        <p className="text-sm text-muted-fg">{t("exam.exit_confirm")}</p>
        <div className="flex justify-end gap-3 pt-4">
          <Button variant="ghost" onClick={() => setConfirmExit(false)}>{t("common.cancel")}</Button>
          <Button variant="danger" onClick={onExit}>{t("exam.exit")}</Button>
        </div>
      </Modal>
    </div>
  );
}

// ─── Results ─────────────────────────────────────────────────────
function ExamResults({ examId, onRetake }: { examId: string; onRetake: () => void }) {
  const t = useT();
  const [data, setData] = useState<Awaited<ReturnType<typeof getExamResults>>>(null);
  const [questions, setQuestions] = useState<ExamQuestionRec[]>([]);

  useEffect(() => {
    (async () => {
      const res = await getExamResults(examId);
      setData(res);
      const full = await getExam(examId);
      setQuestions(full?.questions ?? []);
    })();
  }, [examId]);

  if (!data) return <Skeleton className="mx-auto h-[380px] w-full max-w-3xl" />;
  const { exam, totals } = data;
  const wrong = questions.filter((q) => q.isCorrect === false);
  const passing = totals.scorePct >= 60;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="glass rounded-2xl p-8 text-center">
        <Award size={30} className={cn("mx-auto mb-3", passing ? "text-success" : "text-warning")} />
        <p className="text-5xl font-black tracking-tight">{totals.scorePct}%</p>
        <p className="mt-2 text-sm text-muted-fg">
          {exam.title} · {t("exam.correct_of").replace("{c}", String(totals.correct)).replace("{n}", String(totals.answered))}
          {totals.durationSec > 0 && ` · ${Math.floor(totals.durationSec / 60)}m ${totals.durationSec % 60}s`}
        </p>
        <p className="mt-3 text-xs uppercase tracking-widest text-muted-fg">
          {exam.practiceOnly ? t("exam.practice_note") : t("exam.fed_note")}
        </p>
      </div>

      {totals.byTopic.length > 0 && (
        <div className="glass space-y-3 rounded-2xl p-6">
          <p className="text-xs font-bold uppercase tracking-widest text-muted-fg">{t("exam.by_topic")}</p>
          {totals.byTopic.map((tp) => (
            <div key={tp.topicId ?? "general"} className="space-y-1">
              <div className="flex justify-between text-xs font-bold tracking-tight">
                <span>{tp.label}</span>
                <span className={tp.pct < 50 ? "text-danger" : tp.pct < 80 ? "text-warning" : "text-success"}>{tp.correct}/{tp.total} · {tp.pct}%</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                <div className={cn("h-full rounded-full", tp.pct < 50 ? "bg-danger" : tp.pct < 80 ? "bg-warning" : "bg-success")} style={{ width: `${tp.pct}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}

      {wrong.length > 0 && (
        <div className="glass space-y-4 rounded-2xl p-6">
          <p className="text-xs font-bold uppercase tracking-widest text-muted-fg">{t("exam.wrong_review")}</p>
          {wrong.map((q) => (
            <div key={q.id} className="rounded-xl border border-border p-4">
              <p className="flex items-start gap-2 text-sm font-bold tracking-tight"><XCircle size={15} className="mt-0.5 shrink-0 text-danger" />{q.frontText}</p>
              <p className="mt-2 flex items-start gap-2 text-sm text-muted-fg"><CheckCircle2 size={15} className="mt-0.5 shrink-0 text-success" />{q.backText}</p>
              {q.answer && <p className="mt-1 text-[10px] uppercase tracking-widest text-muted-fg">{t("exam.your_answer")}: {q.answer}</p>}
            </div>
          ))}
        </div>
      )}

      <div className="flex justify-center gap-3">
        <Button variant="ghost" onClick={onRetake}><ChevronRight size={15} />{t("exam.new_exam")}</Button>
        <Link href="/"><Button>{t("exam.back_home")}</Button></Link>
      </div>
    </div>
  );
}
