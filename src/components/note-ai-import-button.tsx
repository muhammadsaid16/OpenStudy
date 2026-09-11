"use client";

import { useT } from "@/lib/i18n";
import { useState } from "react";
import { Sparkles } from "lucide-react";
import { AiImportModal } from "./ai-import-modal";
import { Button } from "./ui";
import type { BundleRec } from "@/lib/db";

export function NoteAiImportButton({
  noteId,
  noteTitle,
  availableBundles,
}: {
  noteId: string;
  noteTitle: string;
  availableBundles: BundleRec[];
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        size="sm"
        variant="secondary"
        onClick={() => setOpen(true)}
        aria-label="Import note as flashcards"
        title="Import note as flashcards"
      >
        <Sparkles size={14} />
        <span className="hidden sm:inline">AI IMPORT</span>
      </Button>
      {open && (
        <AiImportModal
          kind="note"
          sourceId={noteId}
          sourceName={noteTitle}
          availableBundles={availableBundles}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
