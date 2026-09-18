"use client";

import { useEffect, useState } from "react";
import { useT } from "@/lib/i18n";
import { getCardTrace } from "@/app/actions";
import { cn } from "@/lib/utils";
import { Check, Layers, Link2, TrendingDown, X } from "lucide-react";

type Trace = Awaited<ReturnType<typeof getCardTrace>>;

// Card traceability — the visible side of the relationship model
// (lib/relations.ts getCardTraceability). A card is not an island: this panel
// answers "what is this connected to, and how has it been going?" from the
// same traversal every other feature uses, so nothing here can disagree with
// the planner, the hubs or the exam results.
export function CardTracePanel({ cardId, className }: { cardId: string; className?: string }) {
  const t = useT();
  const [trace, setTrace] = useState<Trace>(null);

  useEffect(() => {
    let stale = false;
    getCardTrace(cardId).then((x) => {
      if (!stale) setTrace(x);
    });
    return () => {
      stale = true;
    };
  }, [cardId]);

  if (!trace) return null;

  const accuracy =
    trace.reviewAccuracy == null ? "—" : `${Math.round(trace.reviewAccuracy * 100)}%`;
  const nextReview = new Date(trace.card.nextReview);
  const nextLabel = trace.isDue ? t("trace.due") : nextReview.toLocaleDateString();

  return (
    <section className={cn("space-y-3 rounded-xl border border-border bg-bg p-4", className)}>
      <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-muted-fg">
        <Link2 size={12} aria-hidden /> {t("trace.title")}
      </p>

      <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
        <TraceRow
          label={t("trace.topic")}
          value={
            trace.topic
              ? `${trace.subject ? trace.subject.name + " › " : ""}${trace.topic.name}`
              : t("trace.standalone")
          }
        />
        <TraceRow
          label={t("trace.bundle")}
          value={trace.bundle ? trace.bundle.name : "—"}
          icon={trace.bundle ? <Layers size={11} aria-hidden /> : undefined}
        />
        <TraceRow label={t("trace.accuracy")} value={accuracy} />
        <TraceRow
          label={t("trace.reviews")}
          value={`${trace.reviewHistory.length}${trace.lapses > 0 ? ` · ${trace.lapses} ${t("trace.lapses")}` : ""}`}
          tone={trace.lapses > 0 ? "warn" : undefined}
          icon={trace.lapses > 0 ? <TrendingDown size={11} aria-hidden /> : undefined}
        />
        <TraceRow label={t("trace.scheduled")} value={nextLabel} />
        <TraceRow
          label={t("trace.exams")}
          value={
            trace.examAppearances.length === 0
              ? t("trace.noExams")
              : trace.examAppearances
                  .map((e) => `${e.examTitle} ${e.isCorrect === false ? "✗" : e.isCorrect ? "✓" : "—"}`)
                  .join(", ")
          }
          tone={trace.examAppearances.some((e) => e.isCorrect === false) ? "warn" : undefined}
          icon={
            trace.examAppearances.some((e) => e.isCorrect === false) ? (
              <X size={11} aria-hidden />
            ) : trace.examAppearances.length > 0 ? (
              <Check size={11} aria-hidden />
            ) : undefined
          }
        />
      </div>
    </section>
  );
}

function TraceRow({
  label,
  value,
  icon,
  tone,
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
  tone?: "warn";
}) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-fg">{label}</p>
      <p
        className={cn(
          "mt-0.5 flex items-center gap-1 truncate font-medium tracking-tight",
          tone === "warn" ? "text-tertiary" : "text-fg"
        )}
        title={value}
      >
        {icon}
        <span className="truncate">{value}</span>
      </p>
    </div>
  );
}
