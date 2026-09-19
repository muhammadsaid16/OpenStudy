"use client";

import { useState } from "react";
import { useT } from "@/lib/i18n";
import { KnowledgeGraph } from "@/components/knowledge-graph";
import { Info, X, Tag, Link as LinkIcon, FolderTree } from "lucide-react";

export default function GraphPage() {
  const t = useT();
  const [showGuide, setShowGuide] = useState(true);

  return (
    <div className="p-6 lg:p-10">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
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
      </div>

      {/* Linking Guide Notice */}
      {showGuide && (
        <div className="mb-6 rounded-2xl border border-primary/20 bg-primary-container/10 p-4 backdrop-blur transition-all">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-primary">
              <Info size={15} />
              <span>How Nodes Connect in Your Knowledge Graph</span>
            </div>
            <button
              onClick={() => setShowGuide(false)}
              className="text-muted-fg hover:text-fg transition-colors"
              aria-label="Dismiss guide"
            >
              <X size={15} />
            </button>
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-3 text-xs text-muted-fg">
            <div className="flex items-start gap-2.5 rounded-xl border border-border/50 bg-bg/60 p-3">
              <Tag size={16} className="mt-0.5 shrink-0 text-emerald-500" />
              <div>
                <strong className="block font-semibold text-fg">Tags (#tag)</strong>
                Notes sharing the exact same tag automatically connect to each other and form a cluster around a central tag node.
              </div>
            </div>
            <div className="flex items-start gap-2.5 rounded-xl border border-border/50 bg-bg/60 p-3">
              <LinkIcon size={16} className="mt-0.5 shrink-0 text-blue-500" />
              <div>
                <strong className="block font-semibold text-fg">Wiki-Links ([[Title]])</strong>
                Type <code className="rounded bg-bg-raised px-1 py-0.5 text-primary">[[Other Note Title]]</code> in note text or title to draw a direct connection.
              </div>
            </div>
            <div className="flex items-start gap-2.5 rounded-xl border border-border/50 bg-bg/60 p-3">
              <FolderTree size={16} className="mt-0.5 shrink-0 text-purple-500" />
              <div>
                <strong className="block font-semibold text-fg">Hierarchy</strong>
                Assign notes and decks to the same Subject & Topic to group them in structured branches.
              </div>
            </div>
          </div>
        </div>
      )}

      <KnowledgeGraph />
    </div>
  );
}
