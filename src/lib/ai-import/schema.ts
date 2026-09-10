import { z } from "zod";

/**
 * JSON shape we accept when importing flashcards from an external LLM
 * (NotebookLM, ChatGPT, Gemini, hand-typed, ...). Two top-level shapes:
 *   - Bare array:  [{ front, back, tags?, description?, difficulty? }, ...]
 *   - Wrapped:     { cards: [{ front, back, ... }] }
 * Both go through `parseAiCardsInput` which normalises to the array form.
 */
export const AiCardInput = z.object({
  front: z.string().min(1).max(2000),
  back: z.string().min(1).max(8000),
  frontDescription: z.string().max(2000).optional(),
  backDescription: z.string().max(2000).optional(),
  description: z.string().max(2000).optional(),
  tags: z.array(z.string().min(1).max(40)).max(20).optional(),
  difficulty: z.number().int().min(1).max(5).optional(),
  kind: z.enum(["basic", "cloze", "choice"]).optional(),
  choices: z.array(z.string().min(1).max(200)).max(8).optional(),
});
export type AiCardInput = z.infer<typeof AiCardInput>;

export const AiCardsBareArray = z.array(AiCardInput).min(1).max(2000);
export const AiCardsWrapped = z.object({ cards: AiCardsBareArray });

export function parseAiCardsInput(raw: string): AiCardInput[] {
  const trimmed = raw.trim();
  if (!trimmed) throw new Error("EMPTY_INPUT");
  // Strip ```json fences and leading "json" if the LLM added them.
  const stripped = trimmed
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/, "");
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripped);
  } catch {
    throw new Error("INVALID_JSON");
  }
  // Try bare array first; fall back to { cards: [...] }
  const bare = AiCardsBareArray.safeParse(parsed);
  if (bare.success) return bare.data;
  const wrapped = AiCardsWrapped.safeParse(parsed);
  if (wrapped.success) return wrapped.data.cards;
  throw new Error("SHAPE_MISMATCH");
}

// ─── XML output parsing (AI generate routes) ─────────────────────
//
// The server asks Gemini to answer in XML rather than JSON:
//   - Token-dense languages (Arabic ~3 tokens/char) blow JSON budgets
//     mid-object; an unterminated <card> just drops that one card.
//   - No escaping hell: model text is plain element content, not a
//     quoted string with \" \n \\ to misplace.
//   - zod can't parse XML, so we validate with per-field guards instead.
//
// Tolerated quirks: prose around the <cards> root, fenced blocks,
// self-closed or unterminated trailing <card>, missing optional
// elements, attribute-style junk on tags.

export interface XmlCard {
  front: string;
  back: string;
  frontDescription?: string;
  backDescription?: string;
  description?: string;
  tags?: string[];
  kind?: "basic" | "cloze" | "choice";
  choices?: string[];
}

/** Extract inner text of the first <tag>…</tag> pair in a fragment. */
function innerText(xml: string, tag: string): string | null {
  const open = `<${tag}`;
  const i = xml.indexOf(open);
  if (i === -1) return null;
  const gt = xml.indexOf(">", i);
  if (gt === -1) return null;
  // self-closing <tag/> → empty
  if (xml[gt - 1] === "/") return "";
  const close = xml.indexOf(`</${tag}>`, gt);
  if (close === -1) return null;
  let s = xml.slice(gt + 1, close);
  // Basic un-escaping of the five XML entities.
  s = s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
  return s.trim() ? s.trim() : s;
}

/** Parse all <card>…</card> blocks out of a model response (or fragment). */
export function parseAiCardsXml(raw: string): XmlCard[] {
  const stripped = raw
    .replace(/^```(?:xml|json)?\s*/i, "")
    .replace(/\s*```\s*$/, "")
    .trim();
  if (!stripped) throw new Error("EMPTY_INPUT");

  // Find every <card ...> opening tag; slice to its </card> (or end of
  // text if truncated — an unterminated card is simply dropped).
  const cards: XmlCard[] = [];
  const openRe = /<card(?:\s[^>]*)?>/g;
  let m: RegExpExecArray | null;
  let anyOpenTag = false;
  while ((m = openRe.exec(stripped)) !== null) {
    anyOpenTag = true;
    const start = m.index + m[0].length;
    const closeIdx = stripped.indexOf("</card>", start);
    const frag =
      closeIdx === -1
        ? "" // unterminated (truncation) — skip this one
        : stripped.slice(start, closeIdx);
    if (!frag) continue;
    const front = innerText(frag, "front");
    const back = innerText(frag, "back");
    if (!front || !back) continue; // card without both required fields → drop
    const card: XmlCard = { front, back };
    // front/back descriptions (with aliases), fallback to legacy description -> backDescription
    const frontDesc =
      innerText(frag, "frontDescription") ??
      innerText(frag, "front_description") ??
      innerText(frag, "frontDesc") ??
      innerText(frag, "front_desc");
    if (frontDesc) card.frontDescription = frontDesc;
    const backDesc =
      innerText(frag, "backDescription") ??
      innerText(frag, "back_description") ??
      innerText(frag, "backDesc") ??
      innerText(frag, "back_desc");
    if (backDesc) card.backDescription = backDesc;
    const description = innerText(frag, "description") ?? innerText(frag, "desc") ?? innerText(frag, "hint") ?? innerText(frag, "note");
    if (description) {
      card.description = description;
      if (!card.backDescription && !card.frontDescription) card.backDescription = description;
    }
    // tags: one <tags>a, b, c</tags> CSV or multiple <tag>x</tag>
    const tagsBlock = innerText(frag, "tags");
    if (tagsBlock) {
      const list = tagsBlock
        .replace(/<\/?tag>/g, ",")
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
      if (list.length) card.tags = list.slice(0, 8);
    } else {
      const tagRe = /<tag(?:\s[^>]*)?>([^<]*)<\/tag>/g;
      const list: string[] = [];
      let t: RegExpExecArray | null;
      while ((t = tagRe.exec(frag)) !== null) {
        if (t[1].trim()) list.push(t[1].trim());
      }
      if (list.length) card.tags = list.slice(0, 8);
    }
    const kindRaw = (innerText(frag, "kind") ?? "").toLowerCase().trim();
    if (kindRaw === "cloze" || kindRaw === "choice") card.kind = kindRaw;
    const choicesBlock = innerText(frag, "choices");
    if (choicesBlock) {
      const list = choicesBlock
        .replace(/<\/?choice>/g, ",")
        .split(/[\n,]/)
        .map((c) => c.trim())
        .filter(Boolean);
      if (list.length) card.choices = list.slice(0, 8);
    } else {
      const chRe = /<choice(?:\s[^>]*)?>([^<]*)<\/choice>/g;
      const list: string[] = [];
      let c: RegExpExecArray | null;
      while ((c = chRe.exec(frag)) !== null) {
        if (c[1].trim()) list.push(c[1].trim());
      }
      if (list.length) card.choices = list.slice(0, 8);
    }
    cards.push(card);
  }
  if (cards.length === 0) {
    // No <card> elements at all. Gemini occasionally ignores the XML
    // contract and answers in JSON (observed when responseMimeType is
    // mis-set). Fall back to the JSON parser so the request still
    // succeeds instead of erroring in front of the user.
    if (!anyOpenTag) {
      try {
        return parseAiCardsInput(stripped) as XmlCard[];
      } catch {
        /* not JSON either → NO_CARDS_XML below */
      }
    }
    throw new Error("NO_CARDS_XML");
  }
  return cards;
}

/**
 * The single prompt we hand to the user. One block, copy it as-is.
 * Designed for NotebookLM specifically but works in any chat LLM.
 */
export const NOTEBOOKLM_IMPORT_PROMPT = `You are a flashcard generator. Read the source below and return a JSON array of study flashcards. Each card must be an object with two required fields and optional description fields:

  "front" — a short question, term, or prompt (max 200 chars)
  "back"  — the answer, definition, or explanation (max 800 chars)
  "frontDescription" — optional hint shown alongside the question (max 200 chars). Omit when nothing useful to add.
  "backDescription" — optional hint shown alongside the answer (max 200 chars). Omit when nothing useful to add.
  "description" — legacy alias for backDescription (still accepted for backwards compat, prefer backDescription).
  "kind" — optional card type: "basic" (default), "cloze", or "choice".
    - cloze: put {{blanks}} in "front" around the key term(s), e.g. "Paris is {{the capital}} of France". "back" holds the full un-blanked statement.
    - choice: "back" is the correct answer and "choices" lists 2-4 wrong options (plain strings, no letters).
  "choices" — required when kind is "choice": array of wrong answers.

Rules:
- Return ONLY the JSON array, nothing else — no prose, no markdown fences, no commentary.
- One fact per card. Split dense passages into multiple cards.
- If the source is not in English, write the cards in the source's language.
- Skip trivia, references, acknowledgments, and metadata. Only teachable content.
- Use "front" for what the student should recall and "back" for the explanation.
- Aim for 8–25 cards unless the source is genuinely tiny.

Output format (return this exact shape, with your cards in place of "..."):
[
  { "front": "...", "back": "...", "frontDescription": "...", "backDescription": "..." },
  { "front": "...", "back": "..." }
]

SOURCE TO CONVERT:
[PASTE YOUR LESSON, NOTES, OR DOCUMENT TEXT HERE]
`;
