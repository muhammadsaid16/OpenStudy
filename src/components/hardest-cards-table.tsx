"use client";

import { useT } from "@/lib/i18n";
import { useState } from "react";
import { RotateCcw, AlertTriangle, Check } from "lucide-react";
import { Button, Modal } from "./ui";
import { findHardestCards } from "@/lib/stats";
import { batchResetCardProgress } from "@/app/actions";
import { showToast } from "./toast";
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
        showToast("Card reset — queued as new", "success");
        setTimeout(() => setDoneId(null), 1800);
        router.refresh();
      } else {
        showToast("No card was reset", "warning");
      }
    } catch (e) {
      console.error("Reset failed", e);
      showToast("Reset failed", "danger");
    } finally {
      setBusy(false);
      setConfirmId(null);
    }
  };

  return (
    <>
      {/* Desktop table — hidden on mobile */}
      <div className="hidden md:block overflow-x-auto -mx-1">
        <table className="w-full text-left text-sm min-w-[560px]">
          <thead>
            <tr className="border-b border-border text-[10px] font-mono uppercase tracking-widest text-muted-fg">
              <th className="py-2 pe-4">{t("hardest.front")}</th>
              <th className="py-2 pe-4">{t("hardest.bundle")}</th>
              <th className="py-2 pe-4 text-end">{t("hardest.accuracy")}</th>
              <th className="py-2 pe-4 text-end">{t("hardest.reviews")}</th>
              <th className="py-2 ps-2 text-end">{t("hardest.action")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.cardId} className="border-b border-border/60 last:border-0">
                <td className="py-2.5 pe-4 max-w-[min(34cqi,260px)]">
                  <p className="truncate text-fg" style={{ fontSize: "clamp(0.85rem, 1.5cqi, 0.95rem)" }}>{r.front}</p>
                </td>
                <td className="py-2.5 pe-4 text-muted-fg truncate max-w-[18ch]">{r.bundleName}</td>
                <td className="py-2.5 pe-4 text-end font-mono tabular-nums">
                  <span className={r.accuracy < 0.5 ? "text-danger" : r.accuracy < 0.75 ? "text-warning" : "text-fg"}>
                    {Math.round(r.accuracy * 100)}%
                  </span>
                </td>
                <td className="py-2.5 pe-4 text-end font-mono tabular-nums text-muted-fg">
                  {r.reviewCount}
                </td>
                <td className="py-2.5 ps-2 text-end">
                  {doneId === r.cardId ? (
                    <span className="inline-flex items-center gap-1 text-success text-xs font-bold uppercase">
                      <Check size={12} />{t("ui.reset")}</span>
                  ) : (
                    <Button
                      size="sm"
                      variant="secondary"
                      className="tap-target"
                      onClick={() => setConfirmId(r.cardId)}
                      aria-label={`Reset progress on card: ${r.front}`}
                    >
                      <RotateCcw size={12} />{t("ui.reset")}</Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {/* Mobile cards — visible below md */}
      <div className="md:hidden space-y-3 cq" role="list">
        {rows.map((r) => (
          <div key={r.cardId} className="rounded-2xl border border-border bg-muted/30 p-4 flex flex-col gap-3" role="listitem">
            <p className="font-medium leading-snug line-clamp-2" style={{ fontSize: "var(--text-sm)" }}>{r.front}</p>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="rounded-full bg-muted px-2.5 py-1 font-mono text-muted-fg max-w-[20ch] truncate">{r.bundleName}</span>
              <span className={`rounded-full px-2.5 py-1 font-mono font-bold ${r.accuracy < 0.5 ? "bg-danger/15 text-danger" : r.accuracy < 0.75 ? "bg-warning/15 text-warning" : "bg-success/15 text-success"}`}>{Math.round(r.accuracy * 100)}% · {r.reviewCount} {t("hardest.reviews").toLowerCase()}</span>
            </div>
            <div className="flex justify-end">
              {doneId === r.cardId ? (
                <span className="inline-flex items-center gap-1 text-success text-xs font-bold uppercase"><Check size={12} />{t("ui.reset")}</span>
              ) : (
                <Button size="sm" variant="secondary" className="tap-target w-full sm:w-auto justify-center" onClick={() => setConfirmId(r.cardId)} aria-label={`Reset progress on card: ${r.front}`}><RotateCcw size={12} />{t("ui.reset")}</Button>
              )}
            </div>
          </div>
        ))}
      </div>

      <Modal open={confirmId !== null} onClose={() => setConfirmId(null)} title={t("hardest.reset")}>
        <div className="space-y-4">
          <div className="flex items-start gap-2 rounded-xl border border-warning/40 bg-warning/10 p-3 text-xs text-warning">
            <AlertTriangle size={14} className="shrink-0 mt-0.5" />
            <p>
              This resets the card to &quot;new&quot;: ease factor 2.5, 1-day
              interval. Review history for this card will be cleared so it
              drops from Hardest and re-queues as new starting today.
            </p>
          </div>
          <p className="text-sm text-fg">
            {rows.find((r) => r.cardId === confirmId)?.front}
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={() => setConfirmId(null)}>{t("common.cancel")}</Button>
            <Button size="sm" onClick={() => confirmId && doReset(confirmId)} disabled={busy}>
              {busy ? "Resetting…" : "Reset"}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
