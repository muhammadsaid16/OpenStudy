import { NextResponse } from "next/server";
import { parseAiCardsXml, type XmlCard } from "@/lib/ai-import/schema";

// Image-to-cards. The client uploads a photo of notes / a textbook page
// / a whiteboard, and the server sends it to Gemini 2.5 Flash (which is
// multimodal — handles text + images natively) and parses the model's
// XML answer — same contract as the text route.
//
// Why Gemini over Groq here: Groq's vision models were blocked for this
// key. Gemini handles the same task in one model with `inline_data`, so
// we have one less moving part (no separate OCR step).
//
// Why XML output: see src/app/api/ai/generate-cards/route.ts.

export const runtime = "nodejs";
export const maxDuration = 90;

const MAX_IMAGE_BYTES = 8 * 1024 * 1024; // 8 MB hard cap
const GEMINI_MODEL = "gemini-2.5-flash";
const GEMINI_URL = (key: string) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${key}`;

const SYSTEM_INSTRUCTION = `You are a flashcard generator for a spaced-repetition study app.

You are given an image of study material (a textbook page, handwritten notes, a slide, a whiteboard, a diagram with labels, etc.). Read it carefully and answer with an XML <cards> document. Each flashcard is one <card> element with these children:

  <front>            — required. A short question, term, or prompt (max 200 chars).
  <back>             — required. The answer, definition, or explanation (max 800 chars).
  <frontDescription> — optional. Hint shown alongside the question (max 200 chars). Omit when nothing useful to add.
  <backDescription>  — optional. Hint shown alongside the answer (max 200 chars). Omit when nothing useful to add.
  <tags>         — optional. 1-4 short topic keywords, comma-separated inside the element.
  <kind>         — optional. Card type: basic (default, omit), cloze, or choice.
                     cloze: put {{blanks}} in <front> around key terms. <back> holds the full un-blanked statement.
                     choice: <back> is the correct answer; list 2-4 wrong options as <choice> children inside <choices>.
  <choices>      — required when kind is choice: 2-4 <choice> children with wrong answers.

Rules:
- Read ALL visible text in the image. Don't skip paragraphs, captions, or labels.
- If the image has diagrams, extract the labeled concepts into cards.
- Answer with ONLY the XML — no prose before or after, no markdown fences, no commentary.
- QUANTITY: cover everything visible. Short notes: 2-4 cards. Dense pages: 20-60+ cards — every distinct concept gets its own card. There is NO card limit.
- One fact per card. Split dense passages into multiple cards.
- If the text is not in English, write the cards in that language.
- Skip page numbers, watermarks, references, and acknowledgments. Only teachable content.
- Use <front> for what the student should recall and <back> for the explanation.

Output format (exact skeleton — repeat <card> as many times as the image needs):
<cards>
  <card>
    <front>...</front>
    <back>...</back>
    <tags>topic, keyword</tags>
  </card>
  <card>...</card>
</cards>`;

interface ApiSuccess {
  ok: true;
  cards: XmlCard[];
  model: string;
  elapsedMs: number;
  ocrPreview: string;
}
interface ApiError {
  ok: false;
  error:
    | "NO_API_KEY"
    | "NO_IMAGE"
    | "IMAGE_TOO_LARGE"
    | "UNSUPPORTED_TYPE"
    | "RATE_LIMIT"
    | "UPSTREAM_ERROR"
    | "INVALID_OUTPUT"
    | "NO_CARDS";
  message: string;
}

function jsonError(body: ApiError, status: number) {
  return NextResponse.json(body, { status });
}

async function fileToBase64(file: File): Promise<string> {
  const buf = Buffer.from(await file.arrayBuffer());
  return buf.toString("base64");
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
          "GEMINI_API_KEY is not set on the server. Add it to .env.local and restart `npm run dev`.",
      },
      503
    );
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return jsonError(
      { ok: false, error: "INVALID_OUTPUT", message: "Expected multipart/form-data with an image file." },
      400
    );
  }
  const file = form.get("image");
  if (!(file instanceof File) || file.size === 0) {
    return jsonError(
      { ok: false, error: "NO_IMAGE", message: "Upload a non-empty image file." },
      400
    );
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return jsonError(
      {
        ok: false,
        error: "IMAGE_TOO_LARGE",
        message: `Image is ${(file.size / 1024 / 1024).toFixed(1)} MB; max is 8 MB.`,
      },
      413
    );
  }
  if (!/^image\/(png|jpe?g|webp|gif)$/i.test(file.type)) {
    return jsonError(
      {
        ok: false,
        error: "UNSUPPORTED_TYPE",
        message: `Unsupported type "${file.type}". Use PNG, JPEG, WEBP, or GIF.`,
      },
      415
    );
  }

  const base64 = await fileToBase64(file);

  // Gemini's multimodal shape: one user turn with [text, inline_data].
  const upstream = await fetch(GEMINI_URL(apiKey), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [
            {
              text:
                "Read this image carefully and return the flashcard XML document.",
            },
            {
              inline_data: {
                mime_type: file.type,
                data: base64,
              },
            },
          ],
        },
      ],
      systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
      generationConfig: {
        temperature: 0.4,
        topP: 0.9,
        maxOutputTokens: 65_536, // no card cap → no truncation risk
        // No thinking phase — mechanical OCR/extraction (see generate-cards
        // route: 2.25× faster, same quality).
        thinkingConfig: { thinkingBudget: 0 },
        // NOTE: no responseMimeType — see generate-cards route. The XML
        // mime knob makes Gemini ignore the prompt and emit JSON.
      },
    }),
  });

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

  // parseAiCardsXml is naturally truncation-tolerant: an unterminated
  // trailing <card> is simply dropped, every complete card survives.
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
            : `Model output did not contain any valid <card> elements (${msg}). Try again with a clearer image.`,
      },
      502
    );
  }

  const ocrPreview = raw.replace(/[\s\n]+/g, " ").slice(0, 200);

  const body: ApiSuccess = {
    ok: true,
    cards,
    model: GEMINI_MODEL,
    elapsedMs: Date.now() - t0,
    ocrPreview,
  };
  return NextResponse.json(body);
}
