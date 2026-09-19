"use client";

// ─── Post-Exam Diagnostic Report & Remediation ──────────────────────
// Displays overall score %, correct/total count, total time spent,
// topic-by-topic mastery breakdown progress bars, detailed list of missed
// questions with explanation, and a 1-Click "Generate Flashcards for Missed Concepts"
// remediation action that creates a targeted review deck in IndexedDB.

import { useEffect, useState } from "react";
import {
  Award,
  Clock,
  CheckCircle2,
  XCircle,
  Sparkles,
  Layers,
  ArrowRight,
  BookOpen,
  RotateCcw,
} from "lucide-react";
import { Button } from "./ui";
import { scoreExam, type ExamTotals } from "@/lib/exam";
import { getExamResults, getExam, bulkCreateFlashcards } from "@/app/actions";
import { db, uid, type ExamQuestionRec } from "@/lib/db";
import { showToast } from "@/components/toast";
import { useRouter } from "next/navigation";

export function ExamDiagnosticReport({
  examId,
  onRetake,
  onNewExam,
}: {
  examId: string;
  onRetake?: () => void;
  onNewExam?: () => void;
}) {
  const router = useRouter();
  const [data, setData] = useState<Awaited<ReturnType<typeof getExamResults>> | null>(null);
  const [questions, setQuestions] = useState<ExamQuestionRec[]>([]);
  const [remediating, setRemediating] = useState(false);

  useEffect(() => {
    (async () => {
      const res = await getExamResults(examId);
      if (res) setData(res);
      const full = await getExam(examId);
      if (full?.questions) setQuestions(full.questions);
    })();
  }, [examId]);

  if (!data || !data.exam) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-muted-fg">
        <Clock className="animate-spin mb-2" size={24} />
        <p className="text-xs uppercase tracking-widest font-bold">Calculating diagnostic results…</p>
      </div>
    );
  }

  const { exam } = data;
  const startedAt = new Date(exam.startedAt).getTime();
  const completedAt = exam.completedAt ? new Date(exam.completedAt).getTime() : Date.now();

  const totals = scoreExam(questions, {
    startedAt,
    completedAt,
    labelFor: (tid) => (tid ? "Topic" : "General"),
  });

  const durationMin = Math.ceil(totals.durationSec / 60);

  // Remediation Action: Extract missed questions and create a dedicated Remediation Bundle
  const handleGenerateRemediationDeck = async () => {
    if (totals.wrongQuestions.length === 0) return;
    setRemediating(true);

    try {
      const bundleId = uid();
      const bundleName = `Remediation: ${exam.title}`;

      // Create remediation bundle in IndexedDB
      await db.bundles.add({
        id: bundleId,
        name: bundleName,
        description: `Targeted review deck created from ${totals.wrongQuestions.length} missed concepts in ${exam.title}.`,
        color: "#f59e0b",
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Format missed questions as flashcards
      const cards = totals.wrongQuestions.map((q) => ({
        front: q.frontText,
        back: q.backText,
        description: `Missed in Exam "${exam.title}". User answered: "${q.answer ?? "Unanswered"}"`,
      }));

      await bulkCreateFlashcards(bundleId, JSON.stringify(cards));

      showToast(`Created Remediation Deck: "${bundleName}"!`, "success");
      // Navigate to review mode for this new bundle
      router.push(`/flashcards?bundle=${bundleId}`);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Remediation failed", "danger");
    } finally {
      setRemediating(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-8">
      {/* Top Banner: Score % + Time + Tier Badge */}
      <div className="relative overflow-hidden rounded-2xl border border-primary/30 bg-gradient-to-br from-primary-container/20 via-bg to-bg p-8">
        <div className="flex flex-wrap items-center justify-between gap-6">
          <div>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary-container/15 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-primary">
              DIAGNOSTIC REPORT
            </span>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-fg">{exam.title}</h1>
            <p className="mt-1 text-xs text-muted-fg">
              Completed on {new Date(completedAt).toLocaleString()}
            </p>
          </div>

          <div className="flex items-center gap-6">
            <div className="text-center">
              <p className="text-4xl font-black tracking-tight text-fg">{totals.scorePct}%</p>
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-fg mt-0.5">
                {totals.correct} of {totals.answered} correct
              </p>
            </div>
            <div className="h-10 w-px bg-border/60" />
            <div className="text-center">
              <p className="text-4xl font-black tracking-tight text-fg">{durationMin}m</p>
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-fg mt-0.5">Time Spent</p>
            </div>
          </div>
        </div>
        {exam.practiceOnly && (
          <p className="mt-3 text-xs font-semibold uppercase tracking-widest text-muted-fg">
            Practice exam — nothing was scheduled.
          </p>
        )}
      </div>

      {/* 1-Click Remediation Action Banner (if missed questions exist) */}
      {totals.wrongQuestions.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-amber-500/40 bg-amber-500/10 p-6">
          <div className="flex items-center gap-3">
            <Sparkles className="text-amber-500 shrink-0" size={24} />
            <div>
              <h3 className="text-sm font-bold text-fg">Targeted Weak-Area Remediation</h3>
              <p className="text-xs text-muted-fg">
                You missed {totals.wrongQuestions.length} concept(s). Turn them into a focused study deck to clear weaknesses immediately.
              </p>
            </div>
          </div>
          <Button onClick={handleGenerateRemediationDeck} disabled={remediating}>
            <Sparkles size={14} />
            {remediating ? "Creating Deck…" : "Generate Flashcards for Missed Concepts"}
          </Button>
        </div>
      )}

      {/* Topic Mastery Breakdown */}
      <div className="rounded-2xl border border-border bg-bg p-6 space-y-4">
        <h3 className="text-sm font-bold uppercase tracking-widest text-fg">Topic Mastery Breakdown</h3>
        <div className="space-y-3">
          {totals.byTopic.map((t) => (
            <div key={t.topicId ?? "gen"} className="space-y-1.5">
              <div className="flex items-center justify-between text-xs font-bold">
                <span className="text-fg">{t.label}</span>
                <span className="font-mono text-muted-fg">{t.correct}/{t.total} ({t.pct}%)</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted/40">
                <div
                  className={`h-full transition-all ${
                    t.pct >= 80 ? "bg-success" : t.pct >= 60 ? "bg-amber-500" : "bg-danger"
                  }`}
                  style={{ width: `${t.pct}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Detailed Missed Questions List */}
      {totals.wrongQuestions.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-sm font-bold uppercase tracking-widest text-fg">
            Missed Questions ({totals.wrongQuestions.length})
          </h3>
          <div className="space-y-3">
            {totals.wrongQuestions.map((q, idx) => (
              <div key={q.id} className="rounded-2xl border border-border bg-bg p-5 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-danger/10 text-xs font-bold text-danger">
                      {idx + 1}
                    </span>
                    <h4 className="text-sm font-bold text-fg leading-relaxed">{q.frontText}</h4>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 text-xs">
                  <div className="rounded-xl border border-danger/30 bg-danger/10 p-3">
                    <p className="font-bold uppercase tracking-widest text-danger text-[10px]">Your Answer:</p>
                    <p className="mt-1 font-medium text-fg">{q.answer || "Unanswered"}</p>
                  </div>
                  <div className="rounded-xl border border-success/30 bg-success/10 p-3">
                    <p className="font-bold uppercase tracking-widest text-success text-[10px]">Correct Answer:</p>
                    <p className="mt-1 font-medium text-fg">{q.backText}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Bottom Action Buttons */}
      <div className="flex justify-end gap-3 pt-4">
        {onRetake && (
          <Button variant="secondary" onClick={onRetake}>
            <RotateCcw size={14} />Retake Exam
          </Button>
        )}
        <Button onClick={() => (onNewExam ? onNewExam() : router.push("/exam"))}>
          New Exam
        </Button>
      </div>
    </div>
  );
}
