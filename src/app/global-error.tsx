"use client";

import { useT } from "@/lib/i18n";

// Global error boundary — the last line of defense. Catches errors the
// root layout itself throws. Next.js requires html/body tags here.
// Reads lang/dir from localStorage prefs (theme-init format) so the
// crash screen matches the user's language without the store mounted.

import { AlertTriangle } from "lucide-react";

function readLang(): "en" | "ar" {
  try {
    const p = JSON.parse(localStorage.getItem("study-prefs") || "{}");
    return p.lang === "ar" ? "ar" : "en";
  } catch {
    return "en";
  }
}

const ERR = {
  en: {
    title: t("ui.openstudy_hit_a_snag"),
    body: "Something failed at the app shell level. Your local data is safe.",
    reload: t("ui.reload_app"),
  },
  ar: {
    title: "واجه OpenStudy مشكلة",
    body: "حدث خطأ على مستوى هيكل التطبيق. بياناتك المحلية آمنة.",
    reload: "إعادة تحميل التطبيق",
  },
};

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useT();
  const lang = readLang();
  const s = ERR[lang];
  return (
    <html lang={lang} dir={lang === "ar" ? "rtl" : "ltr"}>
      <body
        style={{
          margin: 0,
          background: "#0B0F17",
          color: "#E7EDF7",
          fontFamily: "system-ui, sans-serif",
          display: "flex",
          minHeight: "100vh",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div style={{ textAlign: "center", padding: "2rem", maxWidth: 420 }}>
          <AlertTriangle size={48} color="#FB4A55" style={{ margin: "0 auto 1rem" }} />
          <h1 style={{ fontSize: 24, margin: "0 0 0.5rem" }}>{s.title}</h1>
          <p style={{ color: "#94A3B8", fontSize: 14, lineHeight: 1.6 }}>{s.body}</p>
          {error?.digest && (
            <p style={{ color: "#94A3B8", fontSize: 11, fontFamily: "monospace" }}>
              code: {error.digest.slice(0, 8)}
            </p>
          )}
          <button
            onClick={reset}
            style={{
              marginTop: 24,
              padding: "10px 24px",
              borderRadius: 999,
              border: "none",
              background: "#FF7A72",
              color: "#1A0505",
              fontWeight: 700,
              fontSize: 14,
              cursor: "pointer",
            }}
          >
            {s.reload}
          </button>
        </div>
      </body>
    </html>
  );
}
