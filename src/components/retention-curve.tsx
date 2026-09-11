"use client";

import { useT } from "@/lib/i18n";
import { useMemo } from "react";
import { buildRetentionCurve } from "@/lib/stats";
import type { ReviewLogRec } from "@/lib/db";
import { motion } from "framer-motion";

const W = 480;
const H = 200;
const PADDING = { top: 16, right: 16, bottom: 28, left: 36 };
const INNER_W = W - PADDING.left - PADDING.right;
const INNER_H = H - PADDING.top - PADDING.bottom;

export function RetentionCurve({ reviews }: { reviews: ReviewLogRec[] }) {
  const t = useT();
  const points = useMemo(() => buildRetentionCurve(reviews), [reviews]);
  const hasData = points.some((p) => p.sampleSize > 0);

  if (!hasData) {
    return (
      <div className="flex h-[200px] items-center justify-center text-xs uppercase tracking-widest text-muted-fg">{t("ui.not_enough_review_data_yet")}</div>
    );
  }

  const maxDay = Math.max(...points.map((p) => p.daysSinceFirstReview));
  const x = (d: number) => PADDING.left + (d / maxDay) * INNER_W;
  const y = (acc: number) => PADDING.top + (1 - acc) * INNER_H;

  // Line path: connect all points with sampleSize > 0
  const valid = points.filter((p) => p.sampleSize > 0);
  const pathD = valid
    .map((p, i) => `${i === 0 ? "M" : "L"}${x(p.daysSinceFirstReview).toFixed(1)} ${y(p.accuracy).toFixed(1)}`)
    .join(" ");

  // Axis ticks
  const xTicks = [0, 1, 7, 30, 90].filter((d) => d <= maxDay);
  const yTicks = [0, 0.25, 0.5, 0.75, 1.0];

  return (
    <motion.svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full"
      role="img"
      aria-label="Retention curve — accuracy over days since first review"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4 }}
    >
      {/* Y gridlines + labels */}
      {yTicks.map((t) => (
        <g key={t}>
          <line
            x1={PADDING.left}
            x2={W - PADDING.right}
            y1={y(t)}
            y2={y(t)}
            stroke="currentColor"
            strokeOpacity={0.1}
            strokeDasharray="2 4"
          />
          <text
            x={PADDING.left - 6}
            y={y(t) + 3}
            textAnchor="end"
            className="fill-muted-fg font-mono"
            style={{ fontSize: 9 }}
          >
            {Math.round(t * 100)}%
          </text>
        </g>
      ))}

      {/* X labels */}
      {xTicks.map((d) => (
        <text
          key={d}
          x={x(d)}
          y={H - 6}
          textAnchor="middle"
          className="fill-muted-fg font-mono"
          style={{ fontSize: 9 }}
        >
          {d === 0 ? "0d" : d < 30 ? `${d}d` : `${Math.round(d / 30)}mo`}
        </text>
      ))}

      {/* The line */}
      <motion.path
        d={pathD}
        fill="none"
        stroke="var(--color-accent)"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.8, ease: "easeOut" }}
      />

      {/* Data points */}
      {valid.map((p, i) => (
        <g key={i}>
          <circle
            cx={x(p.daysSinceFirstReview)}
            cy={y(p.accuracy)}
            r={3}
            fill="var(--color-accent)"
          />
          <title>
            {`Day ${p.daysSinceFirstReview}: ${Math.round(p.accuracy * 100)}% (n=${p.sampleSize})`}
          </title>
        </g>
      ))}
    </motion.svg>
  );
}
