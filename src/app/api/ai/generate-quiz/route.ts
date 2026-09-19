import { NextResponse } from "next/server";
import { rateLimit, clientIp } from "@/lib/rate-limit";

// ─── AI Quiz Generator — MCQ mode ───────────────────────────────────
// POST { text: string } → { ok: true, questions: MCQItem[], model, elapsedMs }
//
// Uses the same Gemini-first / Groq-fallback pattern as /api/ai/generate-cards.
// Structured XML output prevents JSON-escaping failures on non-Latin text.

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_SOURCE_CHARS = 8_000;
const MIN_SOURCE_CHARS = 20;
const GEMINI_MODEL = "gemini-2.5-flash";
const GROQ_MODEL = "llama-3.3-70b-versatile";
const GEMINI_URL = (key: string) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${key}`;
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

export interface MCQItem {
  question: string;
  options: string[];       // 4 items: [correct, wrong1, wrong2, wrong3] before shuffle
  correctIndex: number;   // index in `options` of the correct answer
  explanation: string;
}

interface ApiSuccess {
  ok: true;
  questions: MCQItem[];
  model: string;
  elapsedMs: number;
}
interface ApiError {
  ok: false;
  error: string;
  message: string;
}

const SYSTEM_INSTRUCTION = `You are a practice quiz generator for a spaced-repetition study app.

Read the user's source text and answer with an XML <quiz> document. Each question is one <question> element:

  <stem>     — required. The question stem (max 200 chars).
  <correct>  — required. The correct answer (max 200 chars).
  <wrong1>   — required. A plausible wrong option.
  <wrong2>   — required. A plausible wrong option.
  <wrong3>   — optional. A third wrong option if appropriate.
  <explain>  — required. A brief explanation of why the answer is correct (max 400 chars).

Rules:
- Answer with ONLY the XML — no prose, no markdown fences.
- Generate 3–10 questions from the source, each testing one distinct concept.
- Wrong options must be plausible but clearly incorrect upon reflection.
- If the source is not in English, write the questions in the source's language.

Output format:
<quiz>
  <question>
    <stem>...</stem>
    <correct>...</correct>
    <wrong1>...</wrong1>
    <wrong2>...</wrong2>
    <explain>...</explain>
  </question>
</quiz>`;

function parseQuizXml(raw: string): MCQItem[] {
  // Strip any leading/trailing whitespace or markdown fences
  const clean = raw.replace(/^```xml\s*/i, "").replace(/```\s*$/, "").trim();
  const questionPattern = /<question>([\s\S]*?)<\/question>/g;
  const items: MCQItem[] = [];

  let match: RegExpExecArray | null;
  while ((match = questionPattern.exec(clean)) !== null) {
    const block = match[1];
    const get = (tag: string) => {
      const m = new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`).exec(block);
      return m ? m[1].trim() : "";
    };
    const stem = get("stem");
    const correct = get("correct");
    const wrong1 = get("wrong1");
    const wrong2 = get("wrong2");
    const wrong3 = get("wrong3");
    const explain = get("explain");
    if (!stem || !correct || !wrong1 || !wrong2) continue;

    // Build options array: correct is placed at index 0 before client-side shuffle
    const wrongs = [wrong1, wrong2, ...(wrong3 ? [wrong3] : [])];
    const options = [correct, ...wrongs];

    items.push({
      question: stem,
      options,
      correctIndex: 0, // correct is always first; client shuffles and adjusts index
      explanation: explain,
    });
  }
  if (items.length === 0) throw new Error("NO_QUESTIONS_XML");
  return items;
}

function jsonError(body: ApiError, status: number) {
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
  const rl = rateLimit(`ai:generate-quiz:` + clientIp(req), 10, 60_000);
  if (!rl.ok)
    return NextResponse.json(
      { error: "Too many requests — try again shortly." },
      { status: 429, headers: { "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)) } }
    );

  const t0 = Date.now();
  const geminiKey = (process.env.GEMINI_API_KEY ?? "").trim().split(/\s+/)[0].replace(/^["']|["']$/g, "");
  const groqKey = (process.env.GROQ_API_KEY ?? "").trim().split(/\s+/)[0].replace(/^["']|["']$/g, "");

  let body: { text?: string };
  try {
    body = await req.json();
  } catch {
    return jsonError({ ok: false, error: "INVALID_BODY", message: "Request body must be JSON." }, 400);
  }

  const text = (body.text ?? "").trim();
  if (text.length < MIN_SOURCE_CHARS)
    return jsonError({ ok: false, error: "TEXT_TOO_SHORT", message: `Need at least ${MIN_SOURCE_CHARS} characters.` }, 400);
  if (text.length > MAX_SOURCE_CHARS)
    return jsonError({ ok: false, error: "TEXT_TOO_LONG", message: `Max ${MAX_SOURCE_CHARS.toLocaleString()} chars — split into smaller chunks.` }, 413);

  let raw = "";
  let usedModel = GEMINI_MODEL;
  let geminiFailed = false;
  let geminiErr: unknown = null;

  if (geminiKey) {
    try {
      const payload = {
        contents: [{ role: "user", parts: [{ text: `SOURCE:\n"""\n${text}\n"""` }] }],
        systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
        generationConfig: { temperature: 0.4, topP: 0.9, maxOutputTokens: 16_384, thinkingConfig: { thinkingBudget: 0 } },
      };
      const upstream = await fetch(GEMINI_URL(geminiKey), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (upstream.status === 429) throw Object.assign(new Error("Gemini rate-limited"), { code: "RATE_LIMIT" });
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
      if (code === "RATE_LIMIT" && !groqKey)
        return jsonError({ ok: false, error: "RATE_LIMIT", message: "Rate limited. Set GROQ_API_KEY as fallback." }, 429);
    }
  } else {
    geminiFailed = true;
  }

  if ((geminiFailed || !raw) && groqKey) {
    try {
      raw = await callGroq(text, groqKey);
      usedModel = GROQ_MODEL;
      if (!raw) throw new Error("Groq returned empty response");
    } catch (e) {
      const code = (e as { code?: string })?.code;
      if (code === "RATE_LIMIT") return jsonError({ ok: false, error: "RATE_LIMIT", message: "Both providers rate-limited." }, 429);
      if (geminiFailed) {
        const msg = e instanceof Error ? e.message : String(e);
        return jsonError({ ok: false, error: "UPSTREAM_ERROR", message: msg.slice(0, 400) }, 502);
      }
    }
  }

  if (!raw) {
    if (!geminiKey && !groqKey)
      return jsonError({ ok: false, error: "NO_API_KEY", message: "No AI API key configured." }, 503);
    const code = (geminiErr as { code?: string })?.code;
    if (code === "RATE_LIMIT") return jsonError({ ok: false, error: "RATE_LIMIT", message: "Rate limited — try again shortly." }, 429);
    const msg = geminiErr instanceof Error ? geminiErr.message : String(geminiErr ?? "empty response");
    return jsonError({ ok: false, error: "UPSTREAM_ERROR", message: msg.slice(0, 400) }, 502);
  }

  let questions: MCQItem[];
  try {
    questions = parseQuizXml(raw);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return jsonError({ ok: false, error: msg === "NO_QUESTIONS_XML" ? "NO_QUESTIONS" : "INVALID_OUTPUT", message: "The model returned no usable questions. Try again." }, 502);
  }

  return NextResponse.json({ ok: true, questions, model: usedModel, elapsedMs: Date.now() - t0 } satisfies ApiSuccess);
}
