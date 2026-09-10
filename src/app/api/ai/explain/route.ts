import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_SOURCE_CHARS = 12_000;
const MIN_SOURCE_CHARS = 20;
const GEMINI_MODEL = "gemini-2.5-flash";
const GROQ_MODEL = "llama-3.3-70b-versatile";
const GEMINI_URL = (key: string) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${key}`;
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

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
- No preamble, no "Sure, here is…", no meta-talk — start directly with ## Overview.
- Keep tone warm, clear, teacher-like. Prefer short sentences.
- No XML, no JSON, no fences — just Markdown.
- If the source is fragmentary or very short, do your best with what is given and note at the top: "Source looks brief — this explanation elaborates from the given material."`;

function jErr(body: ExplainErr, status: number) {
  return NextResponse.json(body, { status });
}

async function callGroqExplain(apiKey: string, source: string): Promise<string | null> {
  const res = await fetch(GROQ_URL, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages: [
        { role: "system", content: SYSTEM_INSTRUCTION },
        { role: "user", content: source },
      ],
      temperature: 0.5,
      max_tokens: 8192,
    }),
  });
  if (res.status === 429) throw Object.assign(new Error("Groq rate-limited"), { code: "RATE_LIMIT" });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Groq ${res.status}. ${t.slice(0, 280)}`);
  }
  const j = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const raw = j.choices?.[0]?.message?.content?.trim() ?? "";
  return raw || null;
}

export async function POST(req: Request) {
  const t0 = Date.now();
  const groqKey = (process.env.GROQ_API_KEY ?? "").trim().split(/\s+/)[0].replace(/^["']|["']$/g, "");
  const geminiKey = (process.env.GEMINI_API_KEY ?? "").trim().split(/\s+/)[0].replace(/^["']|["']$/g, "");

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

  // 1) Try Gemini first (primary)
  if (geminiKey) {
    try {
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
      const upstream = await fetch(GEMINI_URL(geminiKey), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (upstream.status === 429 || upstream.status === 402 || upstream.status === 403) {
        // quota/billing — fall through to Groq
        throw Object.assign(new Error(`Gemini ${upstream.status}`), { code: "FALLBACK" });
      }
      if (!upstream.ok) {
        const detail = await upstream.text().catch(() => "");
        throw Object.assign(new Error(`Gemini ${upstream.status}. ${detail.slice(0, 280)}`), { code: "FALLBACK" });
      }
      const j = (await upstream.json()) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
      const raw = j.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("").trim() ?? "";
      if (raw) {
        const cleaned = raw.replace(/^```(?:markdown)?\s*/i, "").replace(/```\s*$/i, "").trim();
        if (cleaned.length >= 30) {
          return NextResponse.json({ ok: true, explanation: cleaned, model: GEMINI_MODEL, elapsedMs: Date.now() - t0 } satisfies ExplainOk);
        }
      }
      throw Object.assign(new Error("Gemini returned empty/short output"), { code: "FALLBACK" });
    } catch (e) {
      const code = (e as { code?: string })?.code;
      // network / empty also fall through; only hard RATE_LIMIT without groq should surface as 429
      if (code !== "FALLBACK" && code !== "RATE_LIMIT") {
        // if it's a network error without groq available, surface it; otherwise fall through
        if (!groqKey) {
          const msg = e instanceof Error ? e.message : String(e);
          if (code === "RATE_LIMIT") return jErr({ ok: false, error: "RATE_LIMIT", message: "Gemini rate-limited. Credits/quota likely exhausted. Try NotebookLM import." }, 429);
          return jErr({ ok: false, error: "UPSTREAM_ERROR", message: msg.slice(0, 400) }, 502);
        }
      }
      // fall through to Groq
    }
  }

  // 2) Fallback: Groq (also works standalone when Gemini key missing/failed)
  if (groqKey) {
    try {
      const raw = await callGroqExplain(groqKey, source);
      if (!raw) return jErr({ ok: false, error: "INVALID_OUTPUT", message: "Groq returned an empty explanation. Try again." }, 502);
      const cleaned = raw.replace(/^```(?:markdown)?\s*/i, "").replace(/```\s*$/i, "").trim();
      if (cleaned.length < 30) return jErr({ ok: false, error: "INVALID_OUTPUT", message: "Explanation too short — try again." }, 502);
      return NextResponse.json({ ok: true, explanation: cleaned, model: GROQ_MODEL, elapsedMs: Date.now() - t0 } satisfies ExplainOk);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const code = (e as { code?: string })?.code;
      if (code === "RATE_LIMIT") {
        return jErr({ ok: false, error: "RATE_LIMIT", message: "Both providers rate-limited. Credits/quota likely exhausted. Use NotebookLM import as fallback." }, 429);
      }
      // Groq 403 here is often WAF on local IP — on Vercel it succeeds; still surface helpfully
      return jErr({ ok: false, error: "UPSTREAM_ERROR", message: `${msg.slice(0, 380)} — If this persists, use NotebookLM import.` }, 502);
    }
  }

  // 3) No provider available
  if (!geminiKey && !groqKey) {
    return jErr({ ok: false, error: "NO_API_KEY", message: "No AI API key set on the server. Add GEMINI_API_KEY or GROQ_API_KEY and redeploy." }, 503);
  }
  return jErr({ ok: false, error: "UPSTREAM_ERROR", message: "AI providers failed. Try NotebookLM import as fallback." }, 502);
}
