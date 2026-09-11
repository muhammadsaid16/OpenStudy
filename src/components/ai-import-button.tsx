"use client";

import { useT } from "@/lib/i18n";
import { useState } from "react";
import { Sparkles } from "lucide-react";
import { AiImportModal } from "./ai-import-modal";
import { Button } from "./ui";
import type { BundleRec } from "@/lib/db";

export function AiImportButton({
  bundleId,
  bundleName,
  availableBundles,
  onImported,
}: {
  bundleId: string;
  bundleName: string;
  /** Required when importing from a note (the note needs a destination). */
  availableBundles?: BundleRec[];
  onImported?: () => void | Promise<void>;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        size="sm"
        variant="secondary"
        onClick={(e) => { e.stopPropagation(); e.preventDefault(); setOpen(true); }}
        aria-label={t("ai.importNb")}
        title={t("ai.importNb")}
      >
        <Sparkles size={14} />
        <span className="hidden sm:inline">{t("ui.ai_import")}</span>
      </Button>
      {open && (
        <AiImportModal
          kind="bundle"
          sourceId={bundleId}
          sourceName={bundleName}
          availableBundles={availableBundles}
          onClose={() => setOpen(false)}
          onImported={onImported}
        />
      )}
    </>
  );
}
