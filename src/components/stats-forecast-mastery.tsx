"use client";

import { useT } from "@/lib/i18n";
import { useEffect, useMemo, useState } from "react";
import { forecastDue, buildBundleMastery, type BundleMastery } from "@/lib/stats";
import type { BundleRec, FlashcardRec } from "@/lib/db";

export function ForecastCard({ cards }: { cards: FlashcardRec[] }) {
  const t = useT();
  const f = useMemo(() => forecastDue(cards), [cards]);
  const stats = [
    { label: "Today", value: f.dueToday, color: f.dueToday > 0 ? "text-accent" : "text-muted-fg" },
    { label: "Tomorrow", value: f.dueTomorrow - f.dueToday, color: "text-fg" },
    { label: t("ui.this_week"), value: f.dueThisWeek - f.dueTomorrow, color: "text-fg" },
    { label: t("ui.this_month"), value: f.dueThisMonth - f.dueThisWeek, color: "text-fg" },
  ];
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
      {stats.map((s) => (
        <div key={s.label} className="space-y-1">
          <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-muted-fg">
            {s.label}
          </p>
          <p className={`font-mono text-3xl font-bold tabular-nums ${s.color}`}>{s.value}</p>
        </div>
      ))}
    </div>
  );
}

export function BundleMasteryTable({
  cards,
  bundles,
  reviews,
}: {
  cards: FlashcardRec[];
  bundles: BundleRec[];
  reviews: BundleMastery["bundleId"] extends never ? never : Parameters<typeof buildBundleMastery>[0];
}) {
  const t = useT();
  // wall clock — captured once in the mount effect (react-hooks/purity bans Date.now() in render)
  const [nowMs, setNowMs] = useState(0);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNowMs(Date.now());
  }, []);

  const rows = useMemo(() => buildBundleMastery(reviews, cards, bundles, nowMs), [reviews, cards, bundles, nowMs]);

  if (rows.length === 0) {
    return (
      <p className="text-xs uppercase tracking-widest text-muted-fg">{t("sfm.noBundles")}</p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-border text-[10px] font-mono uppercase tracking-widest text-muted-fg">
            <th className="py-2 pr-4">BUNDLE</th>
            <th className="py-2 pr-4 text-right">{t("sfm.cards")}</th>
            <th className="py-2 pr-4 text-right">{t("ui.due")}</th>
            <th className="py-2 pr-4 text-right">{t("sfm.leeches")}</th>
            <th className="py-2 pr-4 text-right">ACCURACY</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.bundleId} className="border-b border-border/60 last:border-0">
              <td className="py-2.5 pr-4">
                <div className="flex items-center gap-2">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ background: r.bundleColor }}
                    aria-hidden
                  />
                  <span className="text-fg">{r.bundleName}</span>
                </div>
              </td>
              <td className="py-2.5 pr-4 text-right font-mono tabular-nums text-fg">{r.total}</td>
              <td className="py-2.5 pr-4 text-right font-mono tabular-nums text-accent">{r.dueCount}</td>
              <td className="py-2.5 pr-4 text-right font-mono tabular-nums">
                {r.leechCount > 0 ? <span className="text-danger">{r.leechCount}</span> : <span className="text-muted-fg">0</span>}
              </td>
              <td className="py-2.5 pr-4 text-right font-mono tabular-nums">
                {isNaN(r.accuracy) ? (
                  <span className="text-muted-fg">—</span>
                ) : (
                  <span className={r.accuracy < 0.5 ? "text-danger" : r.accuracy < 0.75 ? "text-warning" : "text-fg"}>
                    {Math.round(r.accuracy * 100)}%
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
