// ─── CSV field escaping ───────────────────────────────────────────
// The one implementation of "how a value becomes a CSV field" (RFC 4180:
// wrap in double quotes, double any embedded quote). goals/page.tsx and
// notes/page.tsx each used to carry their own copy of this lambda.
//
// The former toCsv/fromCsv pair is gone: card import now runs through
// lib/parsers/cards.ts (parseCardsFile) and export through the per-bundle
// exporters in app/actions.ts, so it had no callers left.

/** Quote a single CSV field, doubling embedded quotes. Nullish → empty. */
export function escapeCsvField(value: unknown): string {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}
