import { NextResponse } from "next/server";
import { parseAiCardsXml, type XmlCard } from "@/lib/ai-import/schema";

// Direct AI card generation. The user pastes source text (notes, a
// transcript, a chapter) and we call Gemini ourselves, parsing the
// model's XML answer into the shape `bulkCreateFlashcards` accepts.
//
// Why XML (not JSON) for the model contract:
//  - Token-dense languages (Arabic ≈3 tokens/char vs ~0.75 for English)
//    blew the JSON budget mid-string — a truncated quote broke the ENTIRE
//    parse. An unterminated <card> just drops that one card.
//  - No string-escaping failure modes: card text is element content,
//    not a quoted string with \" \n \\ to misplace.
//  - Per-card element pairs validate themselves; no zod needed.
//
// Card count: no artificial cap. Dense/long chapters may legitimately
// produce 30–60+ cards; the route streams them all back and the client
// lets the user prune before accepting.

export const runtime = "nodejs"; // gemini SDK is a node module
export const maxDuration = 60; // 60s is the Vercel hobby limit; plenty.

const MAX_SOURCE_CHARS = 8_000;
const MIN_SOURCE_CHARS = 20;
// gemini-2.5-flash: cheap, fast, reliable structured-output adherence.
const GEMINI_MODEL = "gemini-2.5-flash";
const GEMINI_URL = (key: string) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${key}`;

interface AiGenerateResponse {
  ok: true;
  cards: XmlCard[];
  model: string;
  /** ms the model call took, server-side. For the "GENERATED IN 3.2S" UI. */
  elapsedMs: number;
}
interface AiGenerateError {
  ok: false;
  error:
    | "NO_API_KEY"
    | "TEXT_TOO_SHORT"
    | "TEXT_TOO_LONG"
    | "RATE_LIMIT"
    | "UPSTREAM_ERROR"
    | "INVALID_OUTPUT"
    | "NO_CARDS";
  message: string;
}

const SYSTEM_INSTRUCTION = `You are a flashcard generator for a spaced-repetition study app.

Read the user's source text and answer with an XML <cards> document. Each flashcard is one <card> element with these children:

  <front>            — required. A short question, term, or prompt (max 200 chars).
  <back>             — required. The answer, definition, or explanation (max 800 chars).
  <frontDescription> — optional. Hint shown alongside the question (max 200 chars). Omit when nothing useful to add.
  <backDescription>  — optional. Hint shown alongside the answer (max 200 chars). Omit when nothing useful to add.
  <tags>         — optional. 1-4 short topic keywords, comma-separated inside the element, e.g. <tags>biology, cells</tags>.
  <kind>         — optional. Card type: basic (default, omit the element), cloze, or choice.
                     cloze: put {{blanks}} in <front> around key terms, e.g. <front>Paris is {{the capital}} of France</front>. <back> holds the full un-blanked statement.
                     choice: <back> is the correct answer; list 2-4 wrong options as <choice> children inside <choices>.
  <choices>      — required when kind is choice: 2-4 <choice> children with wrong answers.

Rules:
- Answer with ONLY the XML — no prose before or after, no markdown fences, no commentary.
- QUANTITY: cover the source completely. Short passages (1-2 sentences): 2-4 cards. Medium notes (3-5 paragraphs): 5-10 cards. Long or dense chapters: 20-60+ cards — do NOT stop early and do NOT truncate; every distinct concept, definition, date, cause, and effect gets its own card. There is NO card limit.
- One fact per card. Split dense passages into multiple cards.
- If the source is not in English, write the cards in the source's language.
- Skip trivia, references, acknowledgments, and metadata. Only teachable content.
- Use <front> for what the student should recall and <back> for the explanation.

Output format (exact skeleton — repeat <card> as many times as the source needs):
<cards>
  <card>
    <front>...</front>
    <back>...</back>
    <tags>topic, keyword</tags>
  </card>
  <card>...</card>
</cards>`;

function jsonError(body: AiGenerateError, status: number) {
  return NextResponse.json(body, { status });
}

export async function POST(req: Request) {
  const t0 = Date.now();
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return jsonError(
      {
        ok: false,
        error: "NO_API_KEY",
        message:
          "GEMINI_API_KEY is not set on the server. Add it to your .env and restart `npm run dev`.",
      },
      503
    );
  }

  let body: { text?: string; topicId?: string; subjectId?: string };
  try {
    body = await req.json();
  } catch {
    return jsonError(
      { ok: false, error: "INVALID_OUTPUT", message: "Request body must be JSON." },
      400
    );
  }
  const text = (body.text ?? "").trim();
  if (text.length < MIN_SOURCE_CHARS) {
    return jsonError(
      {
        ok: false,
        error: "TEXT_TOO_SHORT",
        message: `Source text is too short (${text.length} chars). Paste at least ${MIN_SOURCE_CHARS} characters of study material.`,
      },
      400
    );
  }
  if (text.length > MAX_SOURCE_CHARS) {
    return jsonError(
      {
        ok: false,
        error: "TEXT_TOO_LONG",
        message: `Source text is ${text.length} chars; the cap is ${MAX_SOURCE_CHARS}. Split it into smaller chunks.`,
      },
      413
    );
  }

  const userPayload = {
    contents: [
      {
        role: "user",
        parts: [{ text: `SOURCE:\n"""\n${text}\n"""` }],
      },
    ],
    systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
    generationConfig: {
      temperature: 0.4, // factual, low variance
      topP: 0.9,
      maxOutputTokens: 65_536, // unlimited cards: no mid-array truncation risk
      // Turn OFF the model's chain-of-thought "thinking" phase. Card
      // extraction is mechanical — thinking only added ~3k tokens of
      // latency (measured: 22.3s → 9.9s on a 5k-char Arabic chapter,
      // same card count) and this key is a free-tier one.
      thinkingConfig: { thinkingBudget: 0 },
      // NOTE: no responseMimeType — Gemini's mime knob only supports
      // JSON/YAML/enum constraining. Setting application/xml made it IGNORE
      // the prompt's XML contract and emit JSON instead. Without the knob,
      // the system instruction's XML skeleton is followed reliably.
    },
  };

  let upstream: Response;
  try {
    upstream = await fetch(GEMINI_URL(apiKey), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(userPayload),
    });
  } catch (e) {
    return jsonError(
      {
        ok: false,
        error: "UPSTREAM_ERROR",
        message: e instanceof Error ? e.message : "Failed to reach Gemini.",
      },
      502
    );
  }

  if (upstream.status === 429) {
    return jsonError(
      {
        ok: false,
        error: "RATE_LIMIT",
        message: "Gemini rate-limited the request. Wait a moment and try again.",
      },
      429
    );
  }
  if (!upstream.ok) {
    const detail = await upstream.text().catch(() => "");
    return jsonError(
      {
        ok: false,
        error: "UPSTREAM_ERROR",
        message: `Gemini returned ${upstream.status}. ${detail.slice(0, 240)}`,
      },
      502
    );
  }

  const upstreamJson = (await upstream.json()) as {
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string }> };
    }>;
  };
  const raw =
    upstreamJson.candidates?.[0]?.content?.parts
      ?.map((p) => p.text ?? "")
      .join("")
      .trim() ?? "";

  if (!raw) {
    return jsonError(
      { ok: false, error: "INVALID_OUTPUT", message: "Gemini returned an empty response." },
      502
    );
  }

  let cards: XmlCard[];
  try {
    cards = parseAiCardsXml(raw);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return jsonError(
      {
        ok: false,
        error: msg === "NO_CARDS_XML" ? "NO_CARDS" : "INVALID_OUTPUT",
        message:
          msg === "NO_CARDS_XML"
            ? "The model returned no usable cards."
            : `Model output did not contain any valid <card> elements (${msg}). Try again — a different sample usually works.`,
      },
      502
    );
  }

  const body2: AiGenerateResponse = {
    ok: true,
    cards,
    model: GEMINI_MODEL,
    elapsedMs: Date.now() - t0,
  };
  return NextResponse.json(body2);
}
