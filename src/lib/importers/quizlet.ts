// ─── Quizlet / Delimited Text Parser ─────────────────────────────
// Parses raw text copied from Quizlet, Anki text exports, or custom delimited strings.
// Pairs are separated by newlines; terms and definitions by delimiters (Tab, Comma, Semicolon, Dash, Pipe, or Custom).

export interface ParsedQuizletCard {
  front: string;
  back: string;
  description?: string;
  tags?: string[];
}

export interface QuizletParseOptions {
  /** Delimiter separating Front and Back within a single line. Default: '\t' */
  delimiter?: string;
  /** Pair separator. Default: '\n' */
  lineSeparator?: string;
}

/**
 * Parses Quizlet / delimited text into clean card objects.
 * Handles escaping, blank line filtering, and multi-column inputs (e.g. term, def, tags).
 */
export function parseQuizletText(
  rawText: string,
  options: QuizletParseOptions = {}
): ParsedQuizletCard[] {
  const text = rawText.trim();
  if (!text) return [];

  const delim = options.delimiter ?? "\t";
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const cards: ParsedQuizletCard[] = [];

  for (const line of lines) {
    let parts: string[] = [];

    if (delim === "\t") {
      parts = line.split("\t");
    } else if (delim === "custom-dash" || delim === " - ") {
      parts = line.split(/\s+-\s+/);
    } else if (delim === "|") {
      parts = line.split("|");
    } else if (delim === ";") {
      parts = line.split(";");
    } else {
      parts = line.split(delim);
    }

    parts = parts.map((p) => p.trim()).filter((p) => p.length > 0);

    if (parts.length >= 2) {
      const front = parts[0];
      const back = parts[1];
      const description = parts.length > 2 ? parts[2] : undefined;
      const tags = parts.length > 3 ? parts[3].split(/[,;]/).map((t) => t.trim()).filter(Boolean) : undefined;

      if (front && back) {
        cards.push({
          front,
          back,
          ...(description ? { description } : {}),
          ...(tags && tags.length > 0 ? { tags } : {}),
        });
      }
    }
  }

  return cards;
}
