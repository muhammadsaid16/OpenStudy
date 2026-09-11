import { NextResponse } from "next/server";
import { rateLimit, clientIp } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 30;

// Edge TTS — free, no key, works for AR+EN. Uses the public
// speech.platform.bing.com endpoint with TrustedClientToken.
// Returns audio/mpeg (MP3) directly; client plays via <audio>.
// Fallback: if Edge fails, 503 with JSON so client can fall back to speechSynthesis.
const EDGE_ENDPOINT =
  "https://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1?TrustedClientToken=6A5AAE6D4FFA4A959FFA07EDAB968BAF";

const MAX_CHARS = 5_000;

function ssml(text: string, voice: string, lang: string) {
  const esc = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
  return `<speak version='1.0' xml:lang='${lang}'><voice name='${voice}'>${esc}</voice></speak>`;
}

const AR_RE = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;

export async function POST(req: Request) {
  const ip = clientIp(req);
  const rl = rateLimit(`tts:${ip}`, 20, 60_000);
  if (!rl.ok) {
    const s = Math.ceil(rl.retryAfterMs / 1000);
    return NextResponse.json({ error: "rate_limited", retryAfter: s }, { status: 429, headers: { "Retry-After": String(s) } });
  }

  let body: { text?: string; lang?: string; voice?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_json" }, { status: 400 });
  }
  const raw = (body.text ?? "").trim();
  if (!raw) return NextResponse.json({ error: "missing_text" }, { status: 400 });
  if (raw.length > MAX_CHARS) return NextResponse.json({ error: "too_long", max: MAX_CHARS }, { status: 400 });

  const hintedLang = body.lang?.toLowerCase() ?? "";
  const isAr = hintedLang.startsWith("ar") || AR_RE.test(raw);
  // Prefer Egyptian Arabic when available, fallback voice per Edge catalog.
  const voice = body.voice ?? (isAr ? "ar-EG-ShakirNeural" : "en-US-JennyNeural");
  const lang = isAr ? "ar-EG" : "en-US";

  const payload = ssml(raw, voice, lang);

  try {
    const r = await fetch(EDGE_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/ssml+xml",
        "User-Agent": "Mozilla/5.0",
        "X-Microsoft-OutputFormat": "audio-24khz-48kbitrate-mono-mp3",
      },
      body: payload,
    });
    if (!r.ok || !r.body) {
      const detail = await r.text().catch(() => "");
      return NextResponse.json({ error: "tts_upstream", status: r.status, detail: detail.slice(0, 500) }, { status: 503 });
    }
    const buf = Buffer.from(await r.arrayBuffer());
    if (!buf.length) return NextResponse.json({ error: "empty_audio" }, { status: 503 });
    return new NextResponse(buf, {
      headers: {
        "Content-Type": "audio/mpeg",
        "Content-Length": String(buf.length),
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: "tts_failed", message: msg.slice(0, 500) }, { status: 503 });
  }
}
