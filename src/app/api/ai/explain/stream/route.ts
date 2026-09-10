import { NextResponse } from "next/server";

// ─── POST /api/ai/explain — SSE streaming variant ───────────────
// Same guards + provider chain as route.ts, but streams tokens to the
// client as server-sent events so the explanation appears as it is
// generated (no more full wait then fake typewriter).
//
// Events:
//   { type: "meta",  model }
//   { type: "delta", text }        (repeat)
//   { type: "done",  elapsedMs }
//   { type: "error", error, message }
//
// Both Gemini (streamGenerateContent) and Groq (OpenAI-style
// stream:true) emit incremental chunks; whichever provider is used, the
// chunks are normalized to {type:"delta"} frames.

export const runtime = "nodejs";
export const maxDuration = 60;

const GEMINI_MODEL = "gemini-2.5-flash";
const GROQ_MODEL = "llama-3.3-70b-versatile";
const MIN_SOURCE_CHARS = 20;
const MAX_SOURCE_CHARS = 12_000;

const SYSTEM_INSTRUCTION = `You are a warm, encouraging teacher. A student gives you a lesson they wrote. Explain it back in clear, simple language for revision. Write in the SAME LANGUAGE as the lesson (Arabic lesson → Arabic explanation, English → English). Format with markdown:
## Overview — 2-3 sentences plain summary.
## Key Concepts — bulleted, one line each, bold the term.
## Detailed Explanation — explain each part in order, ### subsections.
## Examples — 1-2 concrete worked examples.
## What to Remember — the 3-5 things to never forget.`;

function sseFrame(obj: unknown): string {
  return `data: ${JSON.stringify(obj)}\n\n`;
}

function sseStream() {
  const encoder = new TextEncoder();
  let controller: ReadableStreamDefaultController<Uint8Array> | null = null;
  const stream = new ReadableStream<Uint8Array>({
    start(c) { controller = c; },
  });
  return {
    stream,
    send(obj: unknown) {
      controller?.enqueue(encoder.encode(sseFrame(obj)));
    },
    close() {
      try { controller?.close(); } catch {}
    },
  };
}

async function streamGemini(apiKey: string, source: string, out: ReturnType<typeof sseStream>): Promise<boolean> {
  // alt=sse gives text/event-stream with data: {...} Gemini chunks.
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:streamGenerateContent?alt=sse&key=${apiKey}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: source }] }],
      systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
      generationConfig: {
        temperature: 0.5,
        topP: 0.9,
        maxOutputTokens: 8192,
        thinkingConfig: { thinkingBudget: 0 },
      },
    }),
  });
  if (!res.ok || !res.body) {
    const detail = await res.text().catch(() => "");
    throw Object.assign(new Error(`Gemini ${res.status}. ${detail.slice(0, 280)}`), { code: res.status === 429 || res.status === 402 || res.status === 403 ? "FALLBACK" : "UPSTREAM" });
  }
  // Parse the SSE lines incrementally.
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let got = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true }).replaceAll("\r\n", "\n");
    let idx: number;
    // Gemini SSE frames end with \n\n after CR normalization; accept bare \n\n too.
    while ((idx = buf.indexOf("\n\n")) !== -1) {
      const frame = buf.slice(0, idx); buf = buf.slice(idx + 2);
      for (const line of frame.split("\n")) {
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (!payload || payload === "[DONE]") continue;
        try {
          const j = JSON.parse(payload) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
          const piece = j.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
          if (piece) { got += piece; out.send({ type: "delta", text: piece }); }
        } catch { /* partial frame — skip */ }
      }
    }
  }
  return got.trim().length >= 30;
}

async function streamGroq(apiKey: string, source: string, out: ReturnType<typeof sseStream>): Promise<boolean> {
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
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
      stream: true,
    }),
  });
  if (res.status === 429) throw Object.assign(new Error("Groq rate-limited"), { code: "RATE_LIMIT" });
  if (!res.ok || !res.body) {
    const t = await res.text().catch(() => "");
    throw Object.assign(new Error(`Groq ${res.status}. ${t.slice(0, 280)}`), { code: "UPSTREAM" });
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let got = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buf.indexOf("\n")) !== -1) {
      const line = buf.slice(0, idx); buf = buf.slice(idx + 1);
      const payload = line.startsWith("data:") ? line.slice(5).trim() : "";
      if (!payload || payload === "[DONE]") continue;
      try {
        const j = JSON.parse(payload) as { choices?: Array<{ delta?: { content?: string } }> };
        const piece = j.choices?.[0]?.delta?.content ?? "";
        if (piece) { got += piece; out.send({ type: "delta", text: piece }); }
      } catch { /* partial — skip */ }
    }
  }
  return got.trim().length >= 30;
}

export async function POST(req: Request) {
  const t0 = Date.now();
  const groqKey = (process.env.GROQ_API_KEY ?? "").trim().split(/\s+/)[0].replace(/^["']|["']$/g, "");
  const geminiKey = (process.env.GEMINI_API_KEY ?? "").trim().split(/\s+/)[0].replace(/^["']|["']$/g, "");

  let body: { text?: string; title?: string };
  try { body = await req.json(); } catch {
    return NextResponse.json({ ok: false, error: "INVALID_OUTPUT", message: "Request body must be JSON." }, { status: 400 });
  }
  const title = (body.title ?? "").trim();
  const text = (body.text ?? "").trim();
  if (text.length < MIN_SOURCE_CHARS) {
    return NextResponse.json({ ok: false, error: "TEXT_TOO_SHORT", message: `Lesson is too short (${text.length} chars). Add at least ${MIN_SOURCE_CHARS} characters.` }, { status: 400 });
  }
  if (text.length > MAX_SOURCE_CHARS) {
    return NextResponse.json({ ok: false, error: "TEXT_TOO_LONG", message: `Lesson is ${text.length} chars; cap is ${MAX_SOURCE_CHARS}. Split it or use NotebookLM import.` }, { status: 413 });
  }
  const source = title ? `TITLE: ${title}\n\nLESSON:\n"""\n${text}\n"""` : `LESSON:\n"""\n${text}\n"""`;

  const { stream, send, close } = sseStream();
  (async () => {
    let modelUsed: string | null = null;

    if (geminiKey) {
      try {
        modelUsed = GEMINI_MODEL;
        send({ type: "meta", model: GEMINI_MODEL });
        const ok = await streamGemini(geminiKey, source, { stream, send, close } as unknown as ReturnType<typeof sseStream>);
        if (ok) { send({ type: "done", elapsedMs: Date.now() - t0 }); close(); return; }
        throw Object.assign(new Error("Gemini returned empty/short output"), { code: "FALLBACK" });
      } catch (e) {
        const code = (e as { code?: string })?.code;
        if (code === "RATE_LIMIT" && !groqKey) {
          send({ type: "error", error: "RATE_LIMIT", message: "Gemini rate-limited. Try NotebookLM import." }); close(); return;
        }
        // fall through to Groq
      }
    }

    if (groqKey) {
      try {
        modelUsed = GROQ_MODEL;
        send({ type: "meta", model: GROQ_MODEL });
        const ok = await streamGroq(groqKey, source, { stream, send, close } as unknown as ReturnType<typeof sseStream>);
        if (ok) { send({ type: "done", elapsedMs: Date.now() - t0 }); close(); return; }
        send({ type: "error", error: "INVALID_OUTPUT", message: "Provider returned an empty explanation. Try again." }); close(); return;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        const code = (e as { code?: string })?.code;
        if (code === "RATE_LIMIT") {
          send({ type: "error", error: "RATE_LIMIT", message: "Both providers rate-limited. Use NotebookLM import as fallback." }); close(); return;
        }
        send({ type: "error", error: "UPSTREAM_ERROR", message: `${msg.slice(0, 380)} — If this persists, use NotebookLM import.` }); close(); return;
      }
    }

    if (!geminiKey && !groqKey) {
      send({ type: "error", error: "NO_API_KEY", message: "No AI API key set on the server. Add GEMINI_API_KEY or GROQ_API_KEY and redeploy." }); close(); return;
    }
    send({ type: "error", error: "UPSTREAM_ERROR", message: "AI providers failed. Try NotebookLM import as fallback." }); close();
  })();

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      "x-accel-buffering": "no",
    },
  });
}
