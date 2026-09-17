// ─── Study OS cross-agent contracts ──────────────────────────────
// FROZEN interfaces agreed before Wave 1 of the Study OS evolution.
// Each shape has exactly one producing agent and named consumers — if you
// need to change a shape here, it is a contract negotiation, not an edit:
// every consumer listed below must be checked in the same change.
//
// Merge ladder: schema → {fsrs, images, weakness} → exam → {planner, hubs}
//               → relations → os-flow → main

// ─── Contract 1: the scheduling seam ─────────────────────────────
// Producers/consumers of card scheduling ALL go through
// reviewFlashcardWithLog(id, quality) / logReviewOnly(id, quality) in
// app/actions.ts. Signature does NOT change when SM-2 → FSRS lands:
//   - Examiner (exam mode) writes wrong answers through it (see below)
//   - Scheduler (FSRS agent) owns its internals
//   - quality scale stays 0…5 with isCorrect(≥3) as the pass boundary

// ─── Contract 2: WeaknessSignal ──────────────────────────────────
// Producer: lib/weakness.ts (Diagnostician).
// Consumers: /plan (Planner), subject/topic hubs (Connector), dashboard
// Next Action (Conductor), exam results screen (Examiner).
export type WeaknessTrend = "worsening" | "flat" | "improving";

export interface WeaknessSignal {
  /** Topic the weakness is attributed to; null when the evidence has no topic. */
  topicId: string | null;
  /** Subject the topic belongs to (or the evidence's subject directly). */
  subjectId: string | null;
  /** Topic/subject display name at computation time. */
  label: string;
  /** 0..100 — higher = weaker. Computed from evidence, never entered by hand. */
  score: number;
  /** Human-readable evidence summary, e.g. "4 lapses in 7 days, 38% exam accuracy". */
  evidence: string;
  /** Direction of travel over the recent window — improving weaknesses decay. */
  trend: WeaknessTrend;
  /** Estimated minutes of targeted practice owed, from signal magnitude. */
  suggestedMinutes: number;
}

// ─── Contract 3: NextAction ──────────────────────────────────────
// Producer: dashboard integration (Conductor) built on lib/planner.ts +
// lib/weakness.ts. Consumer: dashboard hero card.
export type NextActionKind =
  | "due_reviews"      // protected: reviews are never displaced by other work
  | "weak_practice"    // targeted practice on the weakest topic
  | "task"             // next traceable task
  | "exam_prep"        // upcoming exam within its warning window
  | "planned_session"; // planner-suggested study block

export interface NextAction {
  kind: NextActionKind;
  title: string;
  detail: string;
  href: string;
  /** Minutes the action is expected to take; 0 = open-ended. */
  minutes: number;
}

// ─── Contract 4: PlannerDay ──────────────────────────────────────
// Producer: lib/planner.ts. Consumers: /plan page, dashboard.
export interface PlannerDay {
  date: string; // YYYY-MM-DD (local)
  /** Minutes of card-review work forecast for this day (protected). */
  reviewMinutes: number;
  /** Minutes of targeted weak-topic practice recommended. */
  practiceMinutes: number;
  /** Minutes of task work recommended. */
  taskMinutes: number;
  /** Items in each bucket, for rendering. */
  dueCount: number;
  taskTitles: string[];
  examTitles: string[];
  /** Total recommended minutes = review + practice + task. */
  totalMinutes: number;
}

// ─── Contract 5: the exam → SRS feeding rule ─────────────────────
// Examiner must implement EXACTLY this, in lib/exam.ts:
//   1. Wrong answers on real (non-practice) exams call
//      reviewFlashcardWithLog(flashcardId, 0) — a genuine SM-2/FSRS lapse,
//      so the card comes back sooner and the weakness engine sees it.
//   2. Correct answers on real exams call logReviewOnly (evidence without
//      stretching the schedule — passing an exam must not push due dates out).
//   3. Practice exams call logReviewOnly for everything.
//   4. Already-answered questions are never re-fed (idempotent per question).
export const EXAM_FEED_RULE = "wrong→schedule-lapse, correct→log-only, practice→log-only";

// ─── Contract 6: FSRS rating mapping ─────────────────────────────
// Scheduler maps the app's 0/3/5 quality scale onto FSRS grades centrally.
// Semantics: 0 = "Didn't remember" → again; 3 = "Remembered with
// difficulty" → hard; 5 = "Remembered easily" → easy. Anything below 3 is
// a failed recall per isCorrect, so it maps to again — a fail can never
// enter FSRS as a passing grade.
export type FsrsGrade = "again" | "hard" | "good" | "easy";
export function gradeFromQuality(quality: number): FsrsGrade {
  if (quality < 3) return "again";
  if (quality < 4) return "hard";
  if (quality < 5) return "good";
  return "easy";
}

// ─── Contract 7: card image access ───────────────────────────────
// All image blob access goes through lib/card-images.ts (Imager owns it).
// Consumers (editor, review renderer, exam runner) never touch db.cardImages
// directly. Occlusion readiness: regions live on CardImageRec; no behavior
// ships for them yet.
