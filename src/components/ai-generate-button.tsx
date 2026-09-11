"use client";

import { useT } from "@/lib/i18n";
// "Generate from text" — direct Gemini call. Sibling to AiImportButton
// (NotebookLM paste flow). Both add cards to a bundle; this one creates
// them server-side instead of asking the user to copy/paste into a chat LLM.
import { useState } from "react";
import { Sparkles, Wand2 } from "lucide-react";
import { Button } from "./ui";
import { AiGenerateModal } from "./ai-generate-modal";
import type { BundleRec } from "@/lib/db";

// Loose shape — the flashcards page holds a *narrowed* Bundle with computed
// counts. The modal only reads .id and .name, so any record-like with those
// two fields works. Keep this loose instead of lying about types.
type BundleLike = Pick<BundleRec, "id" | "name">;

export function AiGenerateButton({
  bundles,
  defaultBundleId,
  onCreated,
}: {
  bundles: BundleLike[];
  defaultBundleId?: string;
  onCreated?: () => void | Promise<void>;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        size="sm"
        onClick={(e) => { e.stopPropagation(); e.preventDefault(); setOpen(true); }}
        aria-label="Generate cards from text with AI"
        title="Generate cards from text with AI"
      >
        <Wand2 size={14} />
        <span className="hidden sm:inline">AI GENERATE</span>
      </Button>
      {open && (
        <AiGenerateModal
          bundles={bundles as unknown as Parameters<typeof AiGenerateModal>[0]["bundles"]}
          defaultBundleId={defaultBundleId}
          onClose={() => setOpen(false)}
          onCreated={onCreated}
        />
      )}
    </>
  );
}
