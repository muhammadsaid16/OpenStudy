// ─── CSV / Anki import ──────────────────────────────────────
// Parses either:
//  - Basic CSV with front/back columns (header-aware): "front","back".
//    When the FIRST data line is a recognized header row, a description-style
//    column (description|desc|hint|note|notes) becomes the card's optional
//    description, and tag-style columns (tag|tags, plus any other trailing
//    column) become tags. The terse "q,a" pair is only treated as a header
//    when bare — "q,a,…" rows with extra cells are data.
//  - Anki TSV export (.txt): tab-separated "front\tback\textra..." where
//    fields 1 and 2 are front/back and any trailing column is treated as tags
//    (comma-separated when Anki's tag column is present). Headerless TSV
//    keeps this legacy mapping — trailing columns are never description.
// Also accepts JSON arrays of { front, back, description? } for flexibility
// (description also accepts the aliases desc/hint/note/notes).
// Header names that map a column to the card's optional description (legacy single).
const DESCRIPTION_HEADERS = new Set(["description", "desc", "hint", "note", "notes"]);
const FRONT_DESC_HEADERS = new Set(["frontdescription", "front_description", "frontdesc", "front_desc", "frontnote", "front_note", "fronthint", "front_hint", "front description", "front desc", "front note", "front hint"]);
const BACK_DESC_HEADERS = new Set(["backdescription", "back_description", "backdesc", "back_desc", "backnote", "back_note", "backhint", "back_hint", "back description", "back desc", "back note", "back hint"]);
// Header names for card kind (basic/cloze/choice — "mcq" and
// "multiple choice" also map to choice).
const KIND_HEADERS = new Set(["kind", "type", "cardtype", "card_type"]);
// Header names for choice distractors. Split on | first (options often
// contain commas), then ;, then newlines.
const CHOICES_HEADERS = new Set(["choices", "options", "distractors", "wrong"]);

function parseKindCell(v: string): "basic" | "cloze" | "choice" | undefined {
  const t = v.trim().toLowerCase();
  if (!t) return undefined;
  if (t === "cloze" || t === "c") return "cloze";
  if (t === "choice" || t === "mcq" || t === "multiple choice" || t === "multiple-choice") return "choice";
  if (t === "basic" || t === "b" || t === "standard") return "basic";
  return undefined;
}

function parseChoicesCell(v: string): string[] | undefined {
  const t = v.trim();
  if (!t) return undefined;
  const parts = t.includes("|") ? t.split("|") : t.includes(";") ? t.split(";") : t.split("\n");
  const out = parts.map((p) => p.trim()).filter(Boolean);
  return out.length ? out : undefined;
}

export function parseCardsFile(
  raw: string
): { front: string; back: string; tags?: string[]; description?: string; frontDescription?: string; backDescription?: string; kind?: "basic" | "cloze" | "choice"; choices?: string[] }[] {
  let trimmed = raw.trim();
  if (!trimmed) return [];

  // Strip markdown code fences — LLM replies commonly wrap the JSON array in fences.
  const fenceMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fenceMatch) {
    trimmed = fenceMatch[1].trim();
  } else {
    trimmed = trimmed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  }
  if (!trimmed) return [];

  // JSON array fallback
  if (trimmed.startsWith("[")) {
    try {
      const arr = JSON.parse(trimmed);
      if (Array.isArray(arr)) {
        return arr
          .map((r: unknown) => {
            const o = r as Record<string, unknown>;
            const front = String(o.front ?? o.question ?? o.q ?? "");
            const back = String(o.back ?? o.answer ?? o.a ?? "");
            if (!front.trim() || !back.trim()) return null;
            const tagStr = o.tags ?? o.tag;
            const tags =
              typeof tagStr === "string"
                ? tagStr
                    .split(",")
                    .map((t) => t.trim())
                    .filter(Boolean)
                : Array.isArray(tagStr)
                  ? (tagStr as string[])
                  : undefined;
            const rawFrontDesc = o.frontDescription ?? o.front_description ?? o.frontDesc ?? o.front_desc ?? o["front description"] ?? o["front desc"];
            const frontDescription =
              rawFrontDesc === undefined || rawFrontDesc === null
                ? undefined
                : String(rawFrontDesc).trim() || undefined;
            const rawBackDesc = o.backDescription ?? o.back_description ?? o.backDesc ?? o.back_desc ?? o["back description"] ?? o["back desc"];
            const backDescription =
              rawBackDesc === undefined || rawBackDesc === null
                ? undefined
                : String(rawBackDesc).trim() || undefined;
            const rawDesc = o.description ?? o.desc ?? o.hint ?? o.note ?? o.notes;
            const description =
              rawDesc === undefined || rawDesc === null
                ? undefined
                : String(rawDesc).trim() || undefined;
            // Legacy fallback: if no backDescription but description exists, keep description for compat
            const rawKind = o.kind ?? o.type;
            const kind =
              typeof rawKind === "string" ? parseKindCell(rawKind) : undefined;
            const rawChoices = o.choices ?? o.options ?? o.distractors;
            const choices =
              typeof rawChoices === "string"
                ? parseChoicesCell(rawChoices)
                : Array.isArray(rawChoices)
                  ? (rawChoices as unknown[]).map((x) => String(x).trim()).filter(Boolean)
                  : undefined;
            return {
              front: front.trim(),
              back: back.trim(),
              ...(tags?.length ? { tags } : {}),
              ...(frontDescription ? { frontDescription } : {}),
              ...(backDescription ? { backDescription } : {}),
              ...(description ? { description } : {}),
              ...(kind && kind !== "basic" ? { kind } : {}),
              ...(choices?.length ? { choices } : {}),
            };
          })
          .filter(Boolean) as {
          front: string;
          back: string;
          tags?: string[];
          description?: string;
          frontDescription?: string;
          backDescription?: string;
          kind?: "basic" | "cloze" | "choice";
          choices?: string[];
        }[];
      }
    } catch {
      // fall through to CSV/TSV
    }
  }

  const lines = trimmed
    .split("\n")
    .map((l) => l.replace(/\r$/, ""))
    .filter((l) => l.trim().length > 0);
  if (lines.length === 0) return [];

  const result: { front: string; back: string; tags?: string[]; description?: string; frontDescription?: string; backDescription?: string; kind?: "basic" | "cloze" | "choice"; choices?: string[] }[] = [];

  // Column map built from the first data line when it is a recognized header
  // row. `tagCols === undefined` means no header was recognized → legacy
  // behavior (all trailing columns are tags, e.g. headerless Anki TSV).
  let descCol: number | undefined;
  let frontDescCol: number | undefined;
  let backDescCol: number | undefined;
  let kindCol: number | undefined;
  let choicesCol: number | undefined;
  let tagCols: number[] | undefined;
  let first = true;

  for (const line of lines) {
    // Detect delimiter: tab (Anki) or comma (CSV)
    const isTsv = line.includes("\t");
    const delimiter = isTsv ? "\t" : ",";
    const cells = splitCsvLine(line, delimiter);

    if (cells.length < 2) continue;
    const front = cells[0].trim();
    const back = cells[1].trim();
    if (!front || !back) continue;

    // Skip header rows ("front,back" / "question,answer" etc.). The FIRST one
    // is consumed as a header and builds a column map from all of its cells.
    // The terse "q,a" pair only counts as a header when bare (2 cells) —
    // otherwise an Anki data row like "q\ta\ttag1 tag2" would be swallowed.
    const isHeaderRow =
      (front.toLowerCase() === "front" && back.toLowerCase() === "back") ||
      (front.toLowerCase() === "question" && back.toLowerCase() === "answer") ||
      (front.toLowerCase() === "q" && back.toLowerCase() === "a" && cells.length === 2);

    if (first) {
      first = false;
      if (isHeaderRow) {
        descCol = undefined;
        frontDescCol = undefined;
        backDescCol = undefined;
        kindCol = undefined;
        choicesCol = undefined;
        tagCols = [];
        for (let i = 2; i < cells.length; i++) {
          const rawName = cells[i].trim();
          const name = rawName.toLowerCase();
          const norm = name.replace(/[\s_]+/g, "");
          if (FRONT_DESC_HEADERS.has(name) || FRONT_DESC_HEADERS.has(norm)) {
            if (frontDescCol === undefined) frontDescCol = i;
          } else if (BACK_DESC_HEADERS.has(name) || BACK_DESC_HEADERS.has(norm)) {
            if (backDescCol === undefined) backDescCol = i;
          } else if (DESCRIPTION_HEADERS.has(name)) {
            if (descCol === undefined) descCol = i;
          } else if (KIND_HEADERS.has(name)) {
            if (kindCol === undefined) kindCol = i;
          } else if (CHOICES_HEADERS.has(name)) {
            if (choicesCol === undefined) choicesCol = i;
          } else {
            // "tag"/"tags" columns and any unrecognized trailing column stay tags
            tagCols.push(i);
          }
        }
        continue;
      }
    } else if (isHeaderRow && !tagCols) {
      // No header was recognized → legacy behavior: skip header-looking rows.
      // (After a consumed header, rows like "q,a,hint" are data, not headers.)
      continue;
    }

    let tags: string[] | undefined;
    let description: string | undefined;
    let frontDescription: string | undefined;
    let backDescription: string | undefined;
    let kind: "basic" | "cloze" | "choice" | undefined;
    let choices: string[] | undefined;
    if (tagCols) {
      // Header-mapped row: description/kind/choices/tags come from mapped columns.
      if (frontDescCol !== undefined && frontDescCol < cells.length) {
        const d = cells[frontDescCol].trim();
        if (d) frontDescription = d;
      }
      if (backDescCol !== undefined && backDescCol < cells.length) {
        const d = cells[backDescCol].trim();
        if (d) backDescription = d;
      }
      if (descCol !== undefined && descCol < cells.length) {
        const d = cells[descCol].trim();
        if (d) description = d;
      }
      // Legacy fallback: if no backDescription but description exists, keep description
      if (!backDescription && description && frontDescCol === undefined && backDescCol === undefined) {
        // keep description as legacy; also map to backDescription for new code if desired?
        // We preserve description field but don't auto-map to avoid duplication
      }
      if (kindCol !== undefined && kindCol < cells.length) {
        kind = parseKindCell(cells[kindCol]);
      }
      if (choicesCol !== undefined && choicesCol < cells.length) {
        choices = parseChoicesCell(cells[choicesCol]);
      }
      const tagCells = tagCols.filter((i) => i < cells.length).map((i) => cells[i]);
      if (tagCells.length) {
        tags = tagCells
          .flatMap((c) => (c.includes(",") ? c.split(",") : c.split(/\s+/)))
          .map((t) => t.trim())
          .filter(Boolean);
      }
    } else if (cells.length > 2) {
      // No header recognized: trailing columns are tags (Anki exports may
      // split them across columns).
      tags = cells
        .slice(2)
        .flatMap((c) => (c.includes(",") ? c.split(",") : c.split(/\s+/)))
        .map((t) => t.trim())
        .filter(Boolean);
    }
    result.push({
      front,
      back,
      ...(tags?.length ? { tags } : {}),
      ...(frontDescription ? { frontDescription } : {}),
      ...(backDescription ? { backDescription } : {}),
      ...(description ? { description } : {}),
      ...(kind && kind !== "basic" ? { kind } : {}),
      ...(choices?.length ? { choices } : {}),
    });
  }

  return result;
}

// Minimal CSV/TSV cell splitter that respects double-quoted fields.
function splitCsvLine(line: string, delimiter: string): string[] {
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
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === delimiter) {
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
