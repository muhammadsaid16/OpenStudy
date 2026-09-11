"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// ─── Cross-platform TTS ──────────────────────────────────────
// Tier 1: server Edge TTS (MP3 via /api/tts) — works on phone +
// Linux where speechSynthesis voices are missing/broken. Tier 2:
// browser speechSynthesis fallback (offline, no network).
// Usage: <ReadAloudButton text={card.front} />

function stripMd(s: string): string {
  return s
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/(\*\*|__|~~)/g, "")
    .replace(/[*_]/g, "")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^\s*[-*+>]\s+/gm, "")
    .replace(/\|/g, " ")
    .replace(/<\/?[a-z][^>]*>/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const AR_RE = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;

type Status = "idle" | "loading" | "playing" | "error";

export function useReadAloud() {
  const [status, setStatus] = useState<Status>("idle");
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const urlRef = useRef<string | null>(null);

  const stop = useCallback(() => {
    try { window.speechSynthesis?.cancel(); } catch {}
    const a = audioRef.current;
    if (a) { a.pause(); a.currentTime = 0; }
    if (urlRef.current) { URL.revokeObjectURL(urlRef.current); urlRef.current = null; }
    setStatus("idle");
  }, []);

  useEffect(() => stop, [stop]);

  const speak = useCallback(async (raw: string, langHint?: string) => {
    const text = stripMd(raw).slice(0, 5000);
    if (!text) return;
    stop();
    setStatus("loading");

    // Try server Edge TTS first — this is the phone+Linux path.
    try {
      const isAr = langHint ? langHint.startsWith("ar") : AR_RE.test(text);
      const r = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, lang: isAr ? "ar" : "en" }),
      });
      if (r.ok && r.headers.get("Content-Type")?.includes("audio")) {
        const blob = await r.blob();
        const url = URL.createObjectURL(blob);
        urlRef.current = url;
        const a = new Audio(url);
        audioRef.current = a;
        a.onended = () => { setStatus("idle"); URL.revokeObjectURL(url); urlRef.current = null; };
        a.onerror = () => { setStatus("idle"); };
        await a.play();
        setStatus("playing");
        return;
      }
    } catch {
      // fall through to speechSynthesis
    }

    // Fallback: browser speechSynthesis (offline, or if server 503)
    try {
      if (typeof window === "undefined" || !("speechSynthesis" in window)) { setStatus("error"); return; }
      const synth = window.speechSynthesis;
      synth.cancel();
      const u = new SpeechSynthesisUtterance(text);
      const isAr = langHint ? langHint.startsWith("ar") : AR_RE.test(text);
      u.lang = isAr ? "ar-EG" : "en-US";
      // pick voice if available
      try {
        const voices = synth.getVoices();
        const v = isAr ? voices.find(v => v.lang.startsWith("ar")) : voices.find(v => v.lang.startsWith("en"));
        if (v) u.voice = v;
      } catch {}
      u.onend = () => setStatus("idle");
      u.onerror = () => setStatus("idle");
      setStatus("playing");
      synth.speak(u);
    } catch {
      setStatus("error");
    }
  }, [stop]);

  return { status, speak, stop, playing: status === "playing", loading: status === "loading" };
}
