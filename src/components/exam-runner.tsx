"use client";

// ─── Timed Exam Simulator Runner ─────────────────────────────────
// Timed test interface with countdown timer, low-time warning,
// sticky side question navigator (Answered, Unanswered, Flagged for Review),
// and hidden mid-exam feedback until full submission.

import { useEffect, useRef, useState } from "react";
import {
  Clock,
  Flag,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  AlertTriangle,
  Send,
  HelpCircle,
  Timer,
} from "lucide-react";
import { Button, Modal } from "./ui";
import { answerExamQuestion, completeExam, getExam } from "@/app/actions";
import { Markdown } from "@/components/markdown";
import { CardImage } from "@/components/card-image";
import type { ExamQuestionRec, ExamRec, CardImageRec } from "@/lib/db";
import { cn } from "@/lib/utils";
import { showToast } from "@/components/toast";

export interface ExamRunnerProps {
  examId: string;
  onExit: () => void;
  onFinish: () => void;
}

export function ExamRunner({ examId, onExit, onFinish }: ExamRunnerProps) {
  const [exam, setExam] = useState<ExamRec | null>(null);
  const [questions, setQuestions] = useState<ExamQuestionRec[]>([]);
  const [idx, setIdx] = useState(0);

  // User answers state: questionId -> answer string
  const [answers, setAnswers] = useState<Record<string, string>>({});
  // Self grade state for basic/cloze: questionId -> quality (0 or 5)
  const [selfGrades, setSelfGrades] = useState<Record<string, number>>({});
  // Flagged questions state: Set of question indices
  const [flagged, setFlagged] = useState<Set<number>>(new Set());

  // Timer state
  const [remainingSec, setRemainingSec] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [confirmSubmitOpen, setConfirmSubmitOpen] = useState(false);

  useEffect(() => {
    (async () => {
      const data = await getExam(examId);
      if (!data || !data.exam) {
        onExit();
        return;
      }
      setExam(data.exam);
      setQuestions(data.questions);

      // Pre-fill existing answers
      const initialAns: Record<string, string> = {};
      const initialSelf: Record<string, number> = {};
      data.questions.forEach((q: ExamQuestionRec) => {
        if (q.answer) initialAns[q.id] = q.answer;
        if (typeof q.quality === "number") initialSelf[q.id] = q.quality;
      });
      setAnswers(initialAns);
      setSelfGrades(initialSelf);

      // Set countdown timer
      if (data.exam.timeLimitSec) {
        const elapsed = Math.floor((Date.now() - new Date(data.exam.startedAt).getTime()) / 1000);
        const rem = Math.max(0, data.exam.timeLimitSec - elapsed);
        setRemainingSec(rem);
      }
    })();
  }, [examId]);

  // Countdown timer effect
  useEffect(() => {
    if (remainingSec === null || remainingSec <= 0 || submitting) return;
    const t = setInterval(() => {
      setRemainingSec((prev) => {
        if (prev === null || prev <= 1) {
          clearInterval(t);
          // Auto submit on time expiry
          handleSubmitExam();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [remainingSec, submitting]);

  if (!exam || questions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-muted-fg">
        <Clock className="animate-spin mb-2" size={24} />
        <p className="text-xs uppercase tracking-widest font-bold">Loading exam environment…</p>
      </div>
    );
  }

  const curQ = questions[idx];
  const curAns = answers[curQ.id] ?? "";
  const curSelf = selfGrades[curQ.id];
  const isCurFlagged = flagged.has(idx);

  const toggleFlag = (i: number) => {
    setFlagged((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  };

  const handlePickChoice = async (opt: string) => {
    setAnswers((prev) => ({ ...prev, [curQ.id]: opt }));
    await answerExamQuestion(curQ.id, { mode: "choice", answer: opt });
  };

  const handleSelfGrade = async (quality: number) => {
    setSelfGrades((prev) => ({ ...prev, [curQ.id]: quality }));
    setAnswers((prev) => ({ ...prev, [curQ.id]: quality >= 3 ? "Correct" : "Incorrect" }));
    await answerExamQuestion(curQ.id, { mode: "self", quality });
  };

  const handleSubmitExam = async () => {
    setSubmitting(true);
    try {
      await completeExam(examId);
      showToast("Exam completed!", "success");
      onFinish();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Submission failed", "danger");
      setSubmitting(false);
    }
  };

  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s < 10 ? "0" : ""}${s}`;
  };

  const isLowTime = remainingSec !== null && remainingSec < 300; // under 5 min

  const answeredCount = Object.keys(answers).length;
  const unansweredCount = questions.length - answeredCount;

  return (
    <div className="min-h-screen bg-bg p-4 lg:p-8 space-y-6">
      {/* Header bar: Timer + Title + Action */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-border bg-bg/80 backdrop-blur px-6 py-4">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-primary">TIMED EXAM SIMULATION</p>
          <h1 className="text-xl font-bold tracking-tight text-fg">{exam.title}</h1>
        </div>

        <div className="flex items-center gap-4">
          {remainingSec !== null && (
            <div
              className={`flex items-center gap-2 rounded-full border px-4 py-1.5 text-xs font-mono font-bold ${
                isLowTime
                  ? "border-danger/60 bg-danger/10 text-danger animate-pulse"
                  : "border-border bg-bg text-fg"
              }`}
            >
              <Timer size={14} />
              <span>{formatTime(remainingSec)}</span>
            </div>
          )}

          <Button variant="secondary" size="sm" onClick={onExit}>
            Exit
          </Button>
          <Button size="sm" onClick={() => setConfirmSubmitOpen(true)} disabled={submitting}>
            <Send size={14} />Submit Exam
          </Button>
        </div>
      </div>

      {/* Main Grid: Navigator Sidebar (left) + Question Card (right) */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-4">
        {/* Question Navigator Panel (Sticky) */}
        <div className="lg:col-span-1 space-y-4">
          <div className="rounded-2xl border border-border bg-bg p-5 space-y-4 sticky top-6">
            <div className="flex items-center justify-between border-b border-border/60 pb-3">
              <h3 className="text-xs font-bold uppercase tracking-widest text-muted-fg">Question Navigator</h3>
              <span className="font-mono text-xs font-bold text-primary">
                {answeredCount}/{questions.length}
              </span>
            </div>

            {/* Grid of question buttons */}
            <div className="grid grid-cols-5 gap-2">
              {questions.map((q, i) => {
                const isAns = !!answers[q.id];
                const isFlg = flagged.has(i);
                const isCur = i === idx;

                return (
                  <button
                    key={q.id}
                    onClick={() => setIdx(i)}
                    className={cn(
                      "relative flex h-9 w-full items-center justify-center rounded-xl border text-xs font-bold transition-all",
                      isCur
                        ? "border-primary bg-primary-container text-on-primary-container ring-2 ring-primary/40"
                        : isAns
                        ? "border-primary/40 bg-primary-container/20 text-fg"
                        : "border-border bg-bg/50 text-muted-fg hover:border-primary/30",
                      isFlg && "border-amber-500/80 bg-amber-500/10 text-amber-500"
                    )}
                  >
                    {i + 1}
                    {isFlg && (
                      <Flag size={10} className="absolute top-1 end-1 fill-amber-500 text-amber-500" />
                    )}
                  </button>
                );
              })}
            </div>

            {/* Legend */}
            <div className="space-y-1.5 pt-2 border-t border-border/60 text-[11px] font-bold uppercase tracking-widest text-muted-fg">
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-primary" /> Answered ({answeredCount})
              </div>
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full border border-border bg-bg" /> Unanswered ({unansweredCount})
              </div>
              <div className="flex items-center gap-2">
                <Flag size={11} className="fill-amber-500 text-amber-500" /> Flagged ({flagged.size})
              </div>
            </div>
          </div>
        </div>

        {/* Question Runner Screen */}
        <div className="lg:col-span-3 space-y-4">
          <div className="rounded-2xl border border-border bg-bg p-6 lg:p-8 space-y-6 min-h-[420px] flex flex-col justify-between">
            {/* Top row: question index + flag button */}
            <div className="flex items-center justify-between border-b border-border/60 pb-4">
              <span className="text-xs font-bold uppercase tracking-widest text-muted-fg">
                Question {idx + 1} of {questions.length}
              </span>
              <button
                type="button"
                onClick={() => toggleFlag(idx)}
                className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold transition-colors ${
                  isCurFlagged
                    ? "border-amber-500/60 bg-amber-500/10 text-amber-500"
                    : "border-border text-muted-fg hover:border-amber-500/40 hover:text-amber-500"
                }`}
              >
                <Flag size={12} className={isCurFlagged ? "fill-amber-500 text-amber-500" : ""} />
                {isCurFlagged ? "Flagged" : "Flag for Review"}
              </button>
            </div>

            {/* Question Stem / Content */}
            <div className="space-y-6 flex-1 flex flex-col justify-center">
              <div className="text-2xl font-bold tracking-tight text-fg leading-relaxed">
                <Markdown content={curQ.frontText} align="center" />
              </div>

              {/* Multiple Choice Options */}
              {curQ.choicesSnapshot && curQ.choicesSnapshot.length > 0 ? (
                <div className="grid gap-3 pt-4">
                  {curQ.choicesSnapshot.map((opt) => {
                    const sel = curAns === opt;
                    return (
                      <button
                        key={opt}
                        type="button"
                        onClick={() => handlePickChoice(opt)}
                        className={`flex items-center justify-between rounded-xl border p-4 text-start text-sm font-bold transition-colors ${
                          sel
                            ? "border-primary bg-primary-container text-on-primary-container"
                            : "border-border bg-bg/50 text-fg hover:border-primary/40 hover:bg-primary-container/10"
                        }`}
                      >
                        <span>{opt}</span>
                        {sel && <CheckCircle2 size={16} className="shrink-0 text-primary" />}
                      </button>
                    );
                  })}
                </div>
              ) : (
                /* Basic / Cloze Self Grade (Strict exam rules: no instant answer leak during run) */
                <div className="space-y-3 pt-4">
                  <p className="text-xs font-bold uppercase tracking-widest text-muted-fg">
                    Rate your confidence for this concept:
                  </p>
                  <div className="flex gap-3">
                    <Button
                      variant={curSelf === 0 ? "primary" : "secondary"}
                      onClick={() => handleSelfGrade(0)}
                      size="sm"
                    >
                      Unsure / Incorrect
                    </Button>
                    <Button
                      variant={curSelf === 5 ? "primary" : "secondary"}
                      onClick={() => handleSelfGrade(5)}
                      size="sm"
                    >
                      Confident / Correct
                    </Button>
                  </div>
                </div>
              )}
            </div>

            {/* Bottom Nav Bar */}
            <div className="flex items-center justify-between border-t border-border/60 pt-4">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setIdx((i) => Math.max(0, i - 1))}
                disabled={idx === 0}
              >
                <ChevronLeft size={16} />Previous
              </Button>

              <Button
                variant="secondary"
                size="sm"
                onClick={() => setIdx((i) => Math.min(questions.length - 1, i + 1))}
                disabled={idx === questions.length - 1}
              >
                Next<ChevronRight size={16} />
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Submission Confirmation Modal */}
      <Modal open={confirmSubmitOpen} onClose={() => setConfirmSubmitOpen(false)} title="Submit Exam?">
        <div className="space-y-4">
          <p className="text-sm text-fg">
            Are you sure you want to finish and submit your exam?
          </p>
          {unansweredCount > 0 && (
            <div className="flex items-center gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-xs font-bold text-amber-500">
              <AlertTriangle size={16} className="shrink-0" />
              <span>You have {unansweredCount} unanswered question(s).</span>
            </div>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setConfirmSubmitOpen(false)}>Continue Exam</Button>
            <Button onClick={handleSubmitExam} disabled={submitting}>
              {submitting ? "Submitting…" : "Confirm & Submit"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
