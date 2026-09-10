import { NextResponse } from "next/server";
import { parseAiCardsXml, type XmlCard } from "@/lib/ai-import/schema";

// Direct AI card generation. The user pastes source text (notes, a
// transcript, a chapter) and we call Gemini (primary) or Groq (fallback)
// ourselves, parsing the model's XML answer into the shape
// `bulkCreateFlashcards` accepts.
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

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_SOURCE_CHARS = 8_000;
const MIN_SOURCE_CHARS = 20;
const GEMINI_MODEL = "gemini-2.5-flash";
const GROQ_MODEL = "llama-3.3-70b-versatile";
const GEMINI_URL = (key: string) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${key}`;
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

interface AiGenerateResponse {
  ok: true;
  cards: XmlCard[];
  model: string;
  elapsedMs: number;
}
interface AiGenerateError {
  ok: false;
  error: "NO_API_KEY" | "TEXT_TOO_SHORT" | "TEXT_TOO_LONG" | "RATE_LIMIT" | "UPSTREAM_ERROR" | "INVALID_OUTPUT" | "NO_CARDS";
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

async function callGroq(text: string, groqKey: string): Promise<string> {
  const res = await fetch(GROQ_URL, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${groqKey}` },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages: [
        { role: "system", content: SYSTEM_INSTRUCTION },
        { role: "user", content: `SOURCE:\n"""\n${text}\n"""` },
      ],
      temperature: 0.4,
      max_tokens: 8192,
    }),
  });
  if (res.status === 429) throw Object.assign(new Error("Groq rate-limited"), { code: "RATE_LIMIT" });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Groq ${res.status}. ${t.slice(0, 280)}`);
  }
  const j = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  return j.choices?.[0]?.message?.content?.trim() ?? "";
}

export async function POST(req: Request) {
  const t0 = Date.now();
  const groqKey = (process.env.GROQ_API_KEY ?? "").trim().split(/\s+/)[0].replace(/^["']|["']$/g, "");
  const geminiKey = (process.env.GEMINI_API_KEY ?? "").trim().split(/\s+/)[0].replace(/^["']|["']$/g, "");

  let body: { text?: string; topicId?: string; subjectId?: string };
  try {
    body = await req.json();
  } catch {
    return jsonError({ ok: false, error: "INVALID_OUTPUT", message: "Request body must be JSON." }, 400);
  }
  const text = (body.text ?? "").trim();
  if (text.length < MIN_SOURCE_CHARS) {
    return jsonError(
      { ok: false, error: "TEXT_TOO_SHORT", message: `Source text is too short (${text.length} chars). Paste at least ${MIN_SOURCE_CHARS} characters of study material.` },
      400,
    );
  }
  if (text.length > MAX_SOURCE_CHARS) {
    return jsonError(
      { ok: false, error: "TEXT_TOO_LONG", message: `Source text is ${text.length} chars; the cap is ${MAX_SOURCE_CHARS}. Split it into smaller chunks.` },
      413,
    );
  }

  // Try Gemini first when available
  let raw = "";
  let usedModel = GEMINI_MODEL;
  let geminiFailed = false;
  let geminiErr: unknown = null;

  if (geminiKey) {
    try {
      const payload = {
        contents: [{ role: "user", parts: [{ text: `SOURCE:\n"""\n${text}\n"""` }] }],
        systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
        generationConfig: {
          temperature: 0.4,
          topP: 0.9,
          maxOutputTokens: 65_536,
          thinkingConfig: { thinkingBudget: 0 },
        },
      };
      const upstream = await fetch(GEMINI_URL(geminiKey), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (upstream.status === 429) {
        const e = Object.assign(new Error("Gemini rate-limited"), { code: "RATE_LIMIT" });
        throw e;
      }
      if (!upstream.ok) {
        const detail = await upstream.text().catch(() => "");
        throw new Error(`Gemini ${upstream.status}. ${detail.slice(0, 240)}`);
      }
      const uj = (await upstream.json()) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
      raw = uj.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("").trim() ?? "";
      if (!raw) throw new Error("Gemini returned empty response");
    } catch (e) {
      geminiFailed = true;
      geminiErr = e;
      const code = (e as { code?: string })?.code;
      // RATE_LIMIT with no Groq → surface 429 immediately; otherwise fall through to Groq
      if (code === "RATE_LIMIT" && !groqKey) {
        return jsonError({ ok: false, error: "RATE_LIMIT", message: "Gemini rate-limited. Wait a moment or set GROQ_API_KEY as fallback." }, 429);
      }
    }
  } else {
    geminiFailed = true;
  }

  // Fallback to Groq when Gemini failed/missing and Groq is configured
  if ((geminiFailed || !raw) && groqKey) {
    try {
      raw = await callGroq(text, groqKey);
      usedModel = GROQ_MODEL;
      if (!raw) throw new Error("Groq returned empty response");
    } catch (e) {
      const code = (e as { code?: string })?.code;
      if (code === "RATE_LIMIT") return jsonError({ ok: false, error: "RATE_LIMIT", message: "Both providers rate-limited. Wait and retry." }, 429);
      // If Gemini also failed, surface Groq error; if Gemini had returned raw, we'd have parsed it above
      if (geminiFailed) {
        const msg = e instanceof Error ? e.message : String(e);
        return jsonError({ ok: false, error: "UPSTREAM_ERROR", message: msg.slice(0, 400) }, 502);
      }
    }
  }

  if (!raw) {
    if (!geminiKey && !groqKey) {
      return jsonError({ ok: false, error: "NO_API_KEY", message: "No AI API key set. Add GEMINI_API_KEY or GROQ_API_KEY and redeploy." }, 503);
    }
    const msg = geminiErr instanceof Error ? geminiErr.message : String(geminiErr ?? "empty response");
    const code = (geminiErr as { code?: string })?.code;
    if (code === "RATE_LIMIT") return jsonError({ ok: false, error: "RATE_LIMIT", message: "Gemini rate-limited. Try again shortly." }, 429);
    return jsonError({ ok: false, error: "UPSTREAM_ERROR", message: msg.slice(0, 400) }, 502);
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
        message: msg === "NO_CARDS_XML" ? "The model returned no usable cards." : `Model output had no valid <card> elements (${msg}). Try again.`,
      },
      502,
    );
  }

  return NextResponse.json({ ok: true, cards, model: usedModel, elapsedMs: Date.now() - t0 } satisfies AiGenerateResponse);
}
