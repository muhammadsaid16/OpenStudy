// ─── CSV / TSV & Markdown Importer ───────────────────────────────
// Handles CSV/TSV file parsing with automatic column detection for flashcards,
// and Markdown file parsing into structured Notes with headers as titles/sections.

export interface ParsedCsvCard {
  front: string;
  back: string;
  description?: string;
  tags?: string[];
}

export interface ParsedMarkdownNote {
  title: string;
  content: string;
  tags: string[];
}

/** Split a CSV/TSV line respecting quoted values */
function splitDelimitedLine(line: string, delimiter: string): string[] {
  const cells: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else {
      if (ch === '"') inQuotes = true;
      else if (ch === delimiter) {
        cells.push(cur);
        cur = "";
      } else {
        cur += ch;
      }
    }
  }
  cells.push(cur);
  return cells.map((c) => c.trim());
}

/**
 * Parses CSV or TSV file text into flashcards.
 * Auto-detects header row for Front, Back, Tags, and Hint/Description.
 */
export function parseCsvTsvContent(rawText: string, filename = "import.csv"): ParsedCsvCard[] {
  const trimmed = rawText.trim();
  if (!trimmed) return [];

  const lines = trimmed.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return [];

  const isTsv = filename.endsWith(".tsv") || lines[0].includes("\t");
  const delim = isTsv ? "\t" : ",";

  const firstRow = splitDelimitedLine(lines[0], delim);
  const lowerHeader = firstRow.map((c) => c.toLowerCase());

  // Check if first row is header
  const hasHeader =
    lowerHeader.includes("front") ||
    lowerHeader.includes("back") ||
    lowerHeader.includes("question") ||
    lowerHeader.includes("answer") ||
    lowerHeader.includes("term") ||
    lowerHeader.includes("definition");

  const headerMap: Record<string, number> = {};
  let startIdx = 0;

  if (hasHeader) {
    lowerHeader.forEach((h, i) => {
      if (h.includes("front") || h.includes("question") || h.includes("term")) headerMap["front"] = i;
      else if (h.includes("back") || h.includes("answer") || h.includes("definition")) headerMap["back"] = i;
      else if (h.includes("hint") || h.includes("desc") || h.includes("explanation")) headerMap["desc"] = i;
      else if (h.includes("tag")) headerMap["tags"] = i;
    });
    startIdx = 1;
  } else {
    headerMap["front"] = 0;
    headerMap["back"] = 1;
    if (firstRow.length > 2) headerMap["desc"] = 2;
    if (firstRow.length > 3) headerMap["tags"] = 3;
  }

  const cards: ParsedCsvCard[] = [];

  for (let i = startIdx; i < lines.length; i++) {
    const cells = splitDelimitedLine(lines[i], delim);
    const getCell = (key: string) => {
      const idx = headerMap[key];
      return idx !== undefined && idx < cells.length ? cells[idx] : "";
    };

    const front = (getCell("front") || cells[0] || "").trim();
    const back = (getCell("back") || cells[1] || "").trim();
    const desc = (getCell("desc") || (cells.length > 2 ? cells[2] : "") || "").trim();
    const tagRaw = getCell("tags") || (cells.length > 3 ? cells[3] : "");

    if (front && back) {
      const tags = typeof tagRaw === "string" && tagRaw.trim()
        ? tagRaw.split(/[;,]/).map((t) => t.trim()).filter(Boolean)
        : undefined;

      cards.push({
        front,
        back,
        ...(desc ? { description: desc } : {}),
        ...(tags && tags.length > 0 ? { tags } : {}),
      });
    }
  }

  return cards;
}

/**
 * Parses Markdown file text into structured Note records.
 * Extracts title from filename or H1 header, tags from frontmatter/content.
 */
export function parseMarkdownNoteContent(rawText: string, filename = "note.md"): ParsedMarkdownNote {
  const text = rawText.trim();
  const cleanFilename = filename.replace(/\.md$/i, "").replace(/[-_]/g, " ");

  // Extract title: check H1 header (# Title) or default to filename
  const h1Match = /^#\s+(.+)$/m.exec(text);
  const title = h1Match ? h1Match[1].trim() : cleanFilename;

  // Extract inline tags (#biology #react)
  const tagMatches = text.match(/#([a-zA-Z0-9_-]+)/g) ?? [];
  const tags = Array.from(new Set(tagMatches.map((t) => t.slice(1).toLowerCase()))).filter(
    (t) => t !== "title" && t.length > 1
  );

  return {
    title: title || "Imported Note",
    content: text,
    tags,
  };
}
