"use client";

// ─── Daily Progress — smartwatch-style multi-ring widget ───────────
// Three concentric SVG rings (cards reviewed / focus minutes / daily goal),
// anime.js staggered dashoffset fill, CountUp centers.

import { useEffect, useRef } from "react";
import { Flame, Layers, Timer } from "lucide-react";
import { useT } from "@/lib/i18n";

export interface DailyProgressData {
  cardsReviewed: number;
  cardsGoal: number;
  minutesToday: number;
  minutesGoal: number;
  streakDays: number;
}

const RING = [
  { key: "cards", color: "var(--color-accent)", icon: Layers },
  { key: "minutes", color: "var(--color-flow)", icon: Timer },
  { key: "streak", color: "var(--color-grow)", icon: Flame },
] as const;

function Ring({
  color,
  size,
  stroke,
  circleRef,
}: {
  pct?: number;
  color: string;
  size: number;
  stroke: number;
  circleRef: React.RefObject<SVGCircleElement | null>;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <svg
      width={size}
      height={size}
      // center on the container's midpoint (NOT inset-0, which stretches
      // every svg to the 140px box and throws inner rings off-center so
      // they collide instead of nesting concentrically)
      className="absolute start-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 -rotate-90"
      aria-hidden
    >
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-muted)" strokeWidth={stroke} />
      <circle
        ref={circleRef}
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c}
      />
    </svg>
  );
}

export function DailyProgress({ data }: { data: DailyProgressData }) {
  const t = useT();
  // Three separate ref objects — passed to <Ring> by NAME in JSX (never
  // indexed/dereferenced during render) and gathered into an array only
  // inside the effect below, where ref access is allowed.
  const cardsCircle = useRef<SVGCircleElement>(null);
  const minutesCircle = useRef<SVGCircleElement>(null);
  const streakCircle = useRef<SVGCircleElement>(null);

  const pcts = [
    data.cardsGoal > 0 ? (data.cardsReviewed / data.cardsGoal) * 100 : 0,
    data.minutesGoal > 0 ? (data.minutesToday / data.minutesGoal) * 100 : 0,
    // streak ring: full at 7 days
    (data.streakDays / 7) * 100,
  ];
  const clamped = pcts.map((p) => Math.max(0, Math.min(100, p)));

  useEffect(() => {
    // Gather refs here (effect scope) — ref access during render is what
    // react-hooks/refs forbids, not effect-time reads.
    const refs = [cardsCircle, minutesCircle, streakCircle];
    let cancelled = false;
    import("animejs")
      .then((mod) => {
        if (cancelled) return;
        const { animate, eases } = mod as typeof import("animejs");
        clamped.forEach((pct, i) => {
          const el = refs[i].current;
          if (!el) return;
          // ring sizes match the <Ring> renders: 140/96/52 outer→inner
          const size = [140, 96, 52][i];
          const r = (size - 10) / 2;
          const c = 2 * Math.PI * r;
          // anime.js v4: params + options in ONE object; explicit stagger delay
          animate(el, {
            strokeDashoffset: [c, c - (c * pct) / 100],
            duration: 1600,
            delay: i * 150,
            ease: eases.outExpo,
          });
        });
      })
      .catch(() => {
        if (cancelled) return;
        // fallback — set final values directly
        clamped.forEach((pct, i) => {
          const el = refs[i].current;
          if (!el) return;
          const size = [140, 96, 52][i];
          const r = (size - 10) / 2;
          const c = 2 * Math.PI * r;
          el.style.strokeDashoffset = String(c - (c * pct) / 100);
        });
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.cardsReviewed, data.minutesToday, data.streakDays]);

  return (
    <div className="glass flex flex-col gap-4 rounded-3xl p-6 sm:flex-row sm:items-center sm:gap-6" role="img"
      aria-label={t("dailyProgress.aria").replace("{c}", String(data.cardsReviewed)).replace("{cg}", String(data.cardsGoal)).replace("{m}", String(data.minutesToday)).replace("{mg}", String(data.minutesGoal)).replace("{s}", String(data.streakDays))}>
      <div className="relative mx-auto h-[140px] w-[140px] shrink-0 sm:mx-0">
        {/* outer → inner: cards (accent), minutes (flow), streak (grow).
            Ref objects are passed by name — never indexed/dereferenced
            during render; they're only read inside effects/callbacks. */}
        <Ring pct={clamped[0]} color={RING[0].color} size={140} stroke={10} circleRef={cardsCircle} />
        <Ring pct={clamped[1]} color={RING[1].color} size={96} stroke={10} circleRef={minutesCircle} />
        <Ring pct={clamped[2]} color={RING[2].color} size={52} stroke={10} circleRef={streakCircle} />
      </div>
      <div className="min-w-0 flex-1 space-y-3 overflow-hidden">
        <p className="truncate text-xs font-bold uppercase tracking-widest text-muted-fg">
          {t("dailyProgress.today")}
        </p>
        {[
          { label: t("dash.cardsReviewed"), value: `${data.cardsReviewed}/${data.cardsGoal}`, color: RING[0].color },
          { label: t("dash.focusMinutes"), value: `${data.minutesToday}/${data.minutesGoal}`, color: RING[1].color },
          { label: t("dash.dayStreak"), value: `${data.streakDays}`, color: RING[2].color },
        ].map((row) => (
          <div key={row.label} className="flex items-center gap-2.5 text-sm">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: row.color }} aria-hidden />
            <span className="truncate text-muted-fg">{row.label}</span>
            <span className="ms-auto shrink-0 font-mono font-bold tabular-nums">{row.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
