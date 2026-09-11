"use client";

import { useT } from "@/lib/i18n";
import { useState } from "react";
import { RotateCcw, AlertTriangle, Check } from "lucide-react";
import { Button, Modal } from "./ui";
import { findHardestCards } from "@/lib/stats";
import { batchResetCardProgress } from "@/app/actions";
import type { BundleRec, FlashcardRec, ReviewLogRec } from "@/lib/db";
import { useRouter } from "next/navigation";

export function HardestCardsTable({
  reviews,
  cards,
  bundles,
  limit = 20,
}: {
  reviews: ReviewLogRec[];
  cards: FlashcardRec[];
  bundles: BundleRec[];
  limit?: number;
}) {
  const t = useT();
  const router = useRouter();
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [doneId, setDoneId] = useState<string | null>(null);

  const rows = findHardestCards(reviews, cards, bundles, limit, 3);

  if (rows.length === 0) {
    return (
      <p className="text-xs uppercase tracking-widest text-muted-fg">
        NOT ENOUGH REVIEW DATA — EACH CARD NEEDS AT LEAST 3 REVIEWS.
      </p>
    );
  }

  const doReset = async (cardId: string) => {
    setBusy(true);
    try {
      const n = await batchResetCardProgress([cardId]);
      if (n > 0) {
        setDoneId(cardId);
        setTimeout(() => setDoneId(null), 1800);
        router.refresh();
      }
    } finally {
      setBusy(false);
      setConfirmId(null);
    }
  };

  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-border text-[10px] font-mono uppercase tracking-widest text-muted-fg">
              <th className="py-2 pr-4">{t("hardest.front")}</th>
              <th className="py-2 pr-4">{t("hardest.bundle")}</th>
              <th className="py-2 pr-4 text-right">{t("hardest.accuracy")}</th>
              <th className="py-2 pr-4 text-right">{t("hardest.reviews")}</th>
              <th className="py-2 pr-2 text-right">{t("hardest.action")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.cardId} className="border-b border-border/60 last:border-0">
                <td className="py-2.5 pr-4 max-w-[260px]">
                  <p className="truncate text-fg">{r.front}</p>
                </td>
                <td className="py-2.5 pr-4 text-muted-fg">{r.bundleName}</td>
                <td className="py-2.5 pr-4 text-right font-mono tabular-nums">
                  <span className={r.accuracy < 0.5 ? "text-danger" : r.accuracy < 0.75 ? "text-warning" : "text-fg"}>
                    {Math.round(r.accuracy * 100)}%
                  </span>
                </td>
                <td className="py-2.5 pr-4 text-right font-mono tabular-nums text-muted-fg">
                  {r.reviewCount}
                </td>
                <td className="py-2.5 pr-2 text-right">
                  {doneId === r.cardId ? (
                    <span className="inline-flex items-center gap-1 text-success text-xs font-bold uppercase">
                      <Check size={12} /> RESET
                    </span>
                  ) : (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => setConfirmId(r.cardId)}
                      aria-label={`Reset progress on card: ${r.front}`}
                    >
                      <RotateCcw size={12} /> RESET
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal open={confirmId !== null} onClose={() => setConfirmId(null)} title={t("hardest.reset")}>
        <div className="space-y-4">
          <div className="flex items-start gap-2 rounded-xl border border-warning/40 bg-warning/10 p-3 text-xs text-warning">
            <AlertTriangle size={14} className="shrink-0 mt-0.5" />
            <p>
              This resets the card to &quot;new&quot;: ease factor 2.5, 1-day interval, all
              review history on this card is kept (for stats) but the card will
              show up in your review queue starting today.
            </p>
          </div>
          <p className="text-sm text-fg">
            {rows.find((r) => r.cardId === confirmId)?.front}
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={() => setConfirmId(null)}>
              Cancel
            </Button>
            <Button size="sm" onClick={() => confirmId && doReset(confirmId)} disabled={busy}>
              {busy ? "Resetting…" : "Reset"}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
