// ─── Flashcards shared helpers ────────────────────────────────────
// Hoisted from the former 1,683-line monolith so each mode component
// (review / browse / leeches / stats) imports the same status logic.
//
// Source strings are normal-case: every render site styles them with
// the eyebrow `uppercase` treatment via CSS (also lets screen readers
// read words instead of spelling letters).

export interface CardStatusLike {
  reviewCount: number;
  nextReview: Date | string;
}

export function getCardStatus(card: CardStatusLike, nowMs: number) {
  const rc = card.reviewCount;
  const isDue = new Date(card.nextReview).getTime() <= nowMs;
  if (rc === 0) return { label: "New", dot: "bg-gray-400" };
  if (isDue) return { label: "Due", dot: "bg-danger" };
  if (rc <= 3) return { label: "Learning", dot: "bg-warning" };
  return { label: "Mature", dot: "bg-success" };
}

// SRS rating scale — shared by the review keyboard handler and UI.
export const RATING_BUTTONS = [
  { value: 0, label: "Didn't remember", shortLabel: "Again", color: "border-danger bg-danger/10 text-danger hover:bg-danger hover:text-on-color" },
  { value: 3, label: "Remembered with difficulty", shortLabel: "Hard", color: "border-warning bg-warning/10 text-warning hover:bg-warning hover:text-on-color" },
  { value: 5, label: "Remembered easily", shortLabel: "Easy", color: "border-success bg-success/10 text-success hover:bg-success hover:text-on-color" },
] as const;
