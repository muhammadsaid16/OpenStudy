// ─── Flashcards shared helpers ────────────────────────────────────
// Hoisted from the former 1,683-line monolith so each mode component
// (review / browse / leeches / stats) imports the same rating scale.

/**
 * The one definition of "the user got it right". Quality runs 0…5, and 3 is
 * the pass boundary. Accuracy, retention curves, per-bundle mastery and the
 * in-session correct counter all read from here, so moving the threshold is
 * a one-line change instead of eight coordinated edits.
 */
export function isCorrect(quality: number | null | undefined): boolean {
  return (quality ?? 0) >= 3;
}

// SRS rating scale — shared by the review keyboard handler and UI.
export const RATING_BUTTONS = [
  { value: 0, label: "Didn't remember", shortLabel: "Again", color: "border-danger bg-danger/10 text-danger hover:bg-danger hover:text-on-color" },
  { value: 3, label: "Remembered with difficulty", shortLabel: "Hard", color: "border-warning bg-warning/10 text-warning hover:bg-warning hover:text-on-color" },
  { value: 5, label: "Remembered easily", shortLabel: "Easy", color: "border-success bg-success/10 text-success hover:bg-success hover:text-on-color" },
] as const;
