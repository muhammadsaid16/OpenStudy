// ─── Flashcards shared helpers ────────────────────────────────────
// Hoisted from the former 1,683-line monolith so each mode component
// (review / browse / leeches / stats) imports the same status logic.

export interface CardStatusLike {
  reviewCount: number;
  nextReview: Date | string;
}

export function getCardStatus(card: CardStatusLike, nowMs: number) {
  const rc = card.reviewCount;
  const isDue = new Date(card.nextReview).getTime() <= nowMs;
  if (rc === 0) return { label: "NEW", dot: "bg-gray-400" };
  if (isDue) return { label: "DUE", dot: "bg-danger" };
  if (rc <= 3) return { label: "LEARNING", dot: "bg-warning" };
  return { label: "MATURE", dot: "bg-success" };
}

// SRS rating scale — shared by the review keyboard handler and UI.
export const RATING_BUTTONS = [
  { value: 0, label: "DIDN'T REMEMBER", shortLabel: "AGAIN", color: "border-danger bg-danger/10 text-danger hover:bg-danger hover:text-on-color" },
  { value: 3, label: "REMEMBERED WITH DIFFICULTY", shortLabel: "HARD", color: "border-warning bg-warning/10 text-warning hover:bg-warning hover:text-on-color" },
  { value: 5, label: "REMEMBERED EASILY", shortLabel: "EASY", color: "border-success bg-success/10 text-success hover:bg-success hover:text-on-color" },
] as const;
