"use client";

import { useT } from "@/lib/i18n";
import { KnowledgeGraph } from "@/components/knowledge-graph";

export default function GraphPage() {
  const t = useT();

  return (
    <div className="p-6 lg:p-10">
      <div className="mb-6">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-fg/70">
          {t("nav.learn")}
        </p>
        <h1 className="mt-1.5 text-3xl font-bold tracking-tight text-fg lg:text-[34px] lg:leading-tight">
          {t("nav.graph")}
        </h1>
        <p className="mt-2 text-sm text-muted-fg">
          Interactive force-directed graph of your subjects, topics, notes, flashcard decks, and exams.
        </p>
      </div>

      <KnowledgeGraph />
    </div>
  );
}
