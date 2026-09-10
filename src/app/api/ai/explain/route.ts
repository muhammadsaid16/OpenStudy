import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_SOURCE_CHARS = 12_000;
const MIN_SOURCE_CHARS = 20;
const GEMINI_MODEL = "gemini-2.5-flash";
const GEMINI_URL = (key: string) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${key}`;

interface ExplainOk {
  ok: true;
  explanation: string;
  model: string;
  elapsedMs: number;
}
interface ExplainErr {
  ok: false;
  error: "NO_API_KEY" | "TEXT_TOO_SHORT" | "TEXT_TOO_LONG" | "RATE_LIMIT" | "UPSTREAM_ERROR" | "INVALID_OUTPUT";
  message: string;
}

const SYSTEM_INSTRUCTION = `You are an expert tutor inside a study app. The user has pasted a lesson and you must produce a thorough, study-ready EXPLANATION of that lesson.

Write in the SAME LANGUAGE the lesson is written in. If the lesson is Arabic, explain in Arabic. If English, in English. Mixed — follow the lesson's dominant language.

Format your answer as clean Markdown with this exact structure (use ## for section headers):

## Overview
1 short paragraph: what this lesson is about and why it matters.

## Key Concepts
Bullet list (- ) — every term, definition, principle, formula the lesson introduces. Each bullet: **term** — crisp definition.

## Detailed Explanation
Explain the lesson section-by-section, in order. Use sub-headings (### Title) for each section, plain prose + bullets where helpful. Re-state definitions, unpack mechanisms, give analogies and mini-examples. Do NOT skip any section present in the source. This is the longest section.

## Examples
1-3 concrete worked examples or illustrations that make the material tangible. If the lesson has none, invent short realistic ones.

## What to Remember
Numbered list (1. ) — the 5-8 highest-yield points for recall.

Rules:
- No preamble, no “Sure, here is…”, no meta-talk — start directly with ## Overview.
- Keep tone warm, clear, teacher-like. Prefer short sentences.
- No XML, no JSON, no fences — just Markdown.
- If the source is fragmentary or very short, do your best with what is given and note at the top: “Source looks brief — this explanation elaborates from the given material.”`;

function jErr(body: ExplainErr, status: number) {
  return NextResponse.json(body, { status });
}

export async function POST(req: Request) {
  const t0 = Date.now();
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return jErr(
      { ok: false, error: "NO_API_KEY", message: "GEMINI_API_KEY is not set on the server. Add it to your .env and redeploy." },
      503,
    );
  }
  let body: { text?: string; title?: string };
  try {
    body = await req.json();
  } catch {
    return jErr({ ok: false, error: "INVALID_OUTPUT", message: "Request body must be JSON." }, 400);
  }
  const title = (body.title ?? "").trim();
  const text = (body.text ?? "").trim();
  if (text.length < MIN_SOURCE_CHARS) {
    return jErr(
      { ok: false, error: "TEXT_TOO_SHORT", message: `Lesson is too short (${text.length} chars). Add at least ${MIN_SOURCE_CHARS} characters.` },
      400,
    );
  }
  if (text.length > MAX_SOURCE_CHARS) {
    return jErr(
      { ok: false, error: "TEXT_TOO_LONG", message: `Lesson is ${text.length} chars; cap is ${MAX_SOURCE_CHARS}. Split it or use NotebookLM import.` },
      413,
    );
  }

  const source = title ? `TITLE: ${title}\n\nLESSON:\n"""\n${text}\n"""` : `LESSON:\n"""\n${text}\n"""`;

  const payload = {
    contents: [{ role: "user", parts: [{ text: source }] }],
    systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
    generationConfig: {
      temperature: 0.5,
      topP: 0.9,
      maxOutputTokens: 8192,
      thinkingConfig: { thinkingBudget: 0 },
    },
  };

  let upstream: Response;
  try {
    upstream = await fetch(GEMINI_URL(apiKey), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch (e) {
    return jErr({ ok: false, error: "UPSTREAM_ERROR", message: e instanceof Error ? e.message : "Failed to reach Gemini." }, 502);
  }

  if (upstream.status === 429) {
    return jErr({ ok: false, error: "RATE_LIMIT", message: "Gemini rate-limited. Credits/quota likely exhausted or too many requests. Try again later or use NotebookLM import." }, 429);
  }
  if (upstream.status === 402 || upstream.status === 403) {
    return jErr({ ok: false, error: "UPSTREAM_ERROR", message: "Gemini rejected the request (billing/quota). Try NotebookLM import as fallback." }, 502);
  }
  if (!upstream.ok) {
    const detail = await upstream.text().catch(() => "");
    return jErr({ ok: false, error: "UPSTREAM_ERROR", message: `Gemini ${upstream.status}. ${detail.slice(0, 280)}` }, 502);
  }

  const j = (await upstream.json()) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
  const raw = j.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("").trim() ?? "";
  if (!raw) return jErr({ ok: false, error: "INVALID_OUTPUT", message: "Gemini returned an empty explanation. Try again." }, 502);
  // light cleanup: strip accidental outer fences
  const cleaned = raw.replace(/^```(?:markdown)?\s*/i, "").replace(/```\s*$/i, "").trim();
  if (cleaned.length < 30) return jErr({ ok: false, error: "INVALID_OUTPUT", message: "Explanation too short — try again." }, 502);

  const ok: ExplainOk = { ok: true, explanation: cleaned, model: GEMINI_MODEL, elapsedMs: Date.now() - t0 };
  return NextResponse.json(ok);
}
