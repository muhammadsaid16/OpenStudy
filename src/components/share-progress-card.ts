"use client";

// ─── Share Progress Card ─────────────────────────────────────────────
// Generates a shareable PNG "achievement card" using the Canvas API —
// no external dependencies. Shows streak, cards reviewed, focus minutes,
// and Ruvren branding on a dark gradient background.

import type { DailyProgressData } from "@/components/daily-progress";

interface CardColors {
  bg1: string;
  bg2: string;
  accent: string;
}

const DEFAULT_COLORS: CardColors = {
  bg1: "#0d0d12",
  bg2: "#111827",
  accent: "#6366f1",
};

/**
 * Draws the achievement card on a hidden canvas and returns a Blob (PNG).
 * Call this on the client only (uses Canvas API).
 */
export async function generateProgressImage(data: DailyProgressData, colors = DEFAULT_COLORS): Promise<Blob> {
  const W = 960;
  const H = 540;

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;

  // ── Background gradient ──────────────────────────────────────────
  const grad = ctx.createLinearGradient(0, 0, W, H);
  grad.addColorStop(0, colors.bg1);
  grad.addColorStop(1, colors.bg2);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // ── Decorative glow blob ─────────────────────────────────────────
  const glow = ctx.createRadialGradient(W * 0.75, H * 0.25, 0, W * 0.75, H * 0.25, 300);
  glow.addColorStop(0, colors.accent + "28");
  glow.addColorStop(1, "transparent");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  // ── Grid lines ───────────────────────────────────────────────────
  ctx.strokeStyle = "rgba(255,255,255,0.04)";
  ctx.lineWidth = 1;
  for (let y = 0; y < H; y += 60) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
  }

  // ── Border ───────────────────────────────────────────────────────
  ctx.strokeStyle = "rgba(255,255,255,0.08)";
  ctx.lineWidth = 1.5;
  roundRect(ctx, 0, 0, W, H, 24);
  ctx.stroke();

  // ── Ruvren wordmark ──────────────────────────────────────────────
  ctx.font = "bold 28px system-ui, -apple-system, sans-serif";
  ctx.fillStyle = colors.accent;
  ctx.letterSpacing = "2px";
  ctx.fillText("RUVREN", 56, 68);

  ctx.font = "12px system-ui, sans-serif";
  ctx.fillStyle = "rgba(255,255,255,0.35)";
  ctx.letterSpacing = "1px";
  ctx.fillText("YOUR KNOWLEDGE OS", 56, 90);

  // ── Date ─────────────────────────────────────────────────────────
  const dateStr = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
  ctx.font = "13px system-ui, sans-serif";
  ctx.fillStyle = "rgba(255,255,255,0.5)";
  ctx.textAlign = "right";
  ctx.letterSpacing = "0px";
  ctx.fillText(dateStr, W - 56, 68);
  ctx.textAlign = "left";

  // ── Headline ─────────────────────────────────────────────────────
  ctx.font = "bold 48px system-ui, sans-serif";
  ctx.fillStyle = "#ffffff";
  ctx.fillText("Today's Progress", 56, 200);

  // ── Stats ────────────────────────────────────────────────────────
  const stats: { emoji: string; value: string; label: string }[] = [
    {
      emoji: "🔥",
      value: String(data.streakDays),
      label: data.streakDays === 1 ? "day streak" : "day streak",
    },
    {
      emoji: "🃏",
      value: String(data.cardsReviewed),
      label: `of ${data.cardsGoal} cards reviewed`,
    },
    {
      emoji: "⏱",
      value: `${data.minutesToday}m`,
      label: `of ${data.minutesGoal}m focus`,
    },
  ];

  const colW = (W - 112) / 3;
  stats.forEach((s, i) => {
    const x = 56 + i * colW;
    const y = 280;

    // Card background
    ctx.fillStyle = "rgba(255,255,255,0.05)";
    roundRect(ctx, x, y, colW - 16, 160, 16);
    ctx.fill();

    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    ctx.lineWidth = 1;
    roundRect(ctx, x, y, colW - 16, 160, 16);
    ctx.stroke();

    // Emoji
    ctx.font = "36px serif";
    ctx.fillText(s.emoji, x + 20, y + 48);

    // Value
    ctx.font = "bold 44px system-ui, sans-serif";
    ctx.fillStyle = "#ffffff";
    ctx.fillText(s.value, x + 20, y + 106);

    // Label
    ctx.font = "13px system-ui, sans-serif";
    ctx.fillStyle = "rgba(255,255,255,0.45)";
    ctx.fillText(s.label, x + 20, y + 130);
  });

  // ── Footer ───────────────────────────────────────────────────────
  ctx.font = "11px system-ui, sans-serif";
  ctx.fillStyle = "rgba(255,255,255,0.25)";
  ctx.textAlign = "right";
  ctx.fillText("ruvren.app · Study smarter, not harder", W - 56, H - 30);
  ctx.textAlign = "left";

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Canvas toBlob failed"));
      },
      "image/png",
      1.0
    );
  });
}

/** Path helper for rounded rectangles (Safari-safe). */
function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}
