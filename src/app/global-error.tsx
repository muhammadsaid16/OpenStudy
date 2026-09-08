"use client";

// Global error boundary — the last line of defense. Catches errors the
// root layout itself throws. Next.js requires html/body tags here.

import { AlertTriangle } from "lucide-react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
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
          <h1 style={{ fontSize: 24, margin: "0 0 0.5rem" }}>OpenStudy hit a snag</h1>
          <p style={{ color: "#94A3B8", fontSize: 14, lineHeight: 1.6 }}>
            Something failed at the app shell level. Your local data is safe.
          </p>
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
            Reload app
          </button>
        </div>
      </body>
    </html>
  );
}
