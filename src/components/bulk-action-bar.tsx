"use client";

import { useT } from "@/lib/i18n";
import { useState, type ChangeEvent } from "react";
import { Tag, ArrowRight, RotateCcw, Trash2, X } from "lucide-react";
import { Button, Modal, Input } from "./ui";
import {
  batchDeleteCards,
  batchTagCards,
  batchMoveCards,
  batchResetCardProgress,
} from "@/app/actions";
import { useRouter } from "next/navigation";
import type { BundleRec } from "@/lib/db";

export function BulkActionBar({
  selectedIds,
  bundles,
  currentBundleId,
  onCleared,
}: {
  selectedIds: Set<string>;
  bundles: BundleRec[];
  currentBundleId?: string;
  onCleared: () => void;
}) {
  const t = useT();
  const router = useRouter();
  const [tagOpen, setTagOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [tagInput, setTagInput] = useState("");
  const [moveTarget, setMoveTarget] = useState<string>(
    currentBundleId ? "" : bundles[0]?.id ?? ""
  );
  // bundles load async and may arrive after first render — derive the default
  // at render time instead of syncing it in an effect.
  const otherBundles = bundles.filter((b) => b.id !== currentBundleId);
  const effectiveMoveTarget = moveTarget || otherBundles[0]?.id || "";
  const [busy, setBusy] = useState(false);

  if (selectedIds.size === 0) return null;

  const ids = Array.from(selectedIds);

  const doTag = async () => {
    setBusy(true);
    try {
      const tags = tagInput.split(",").map((t) => t.trim()).filter(Boolean);
      if (tags.length === 0) return;
      await batchTagCards(ids, tags);
      setTagOpen(false);
      setTagInput("");
      onCleared();
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  const doMove = async () => {
    if (!effectiveMoveTarget) return;
    setBusy(true);
    try {
      await batchMoveCards(ids, effectiveMoveTarget || null);
      setMoveOpen(false);
      onCleared();
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  const doDelete = async () => {
    setBusy(true);
    try {
      await batchDeleteCards(ids);
      setDeleteOpen(false);
      onCleared();
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  const doReset = async () => {
    setBusy(true);
    try {
      await batchResetCardProgress(ids);
      onCleared();
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="fixed inset-x-0 bottom-6 z-40 flex justify-center px-4 pointer-events-none">
        <div className="pointer-events-auto flex flex-wrap items-center gap-2 rounded-full border border-accent/60 bg-bg-raised px-4 py-2 shadow-2xl backdrop-blur-md">
          <span className="font-mono text-xs font-bold uppercase tracking-widest text-accent">
           {ids.length} selected
          </span>
          <span className="h-4 w-px bg-border" />
          <Button size="sm" variant="secondary" onClick={() => setTagOpen(true)} disabled={busy}>
            <Tag size={12} /> TAG
          </Button>
          <Button size="sm" variant="secondary" onClick={() => setMoveOpen(true)} disabled={busy}>
            <ArrowRight size={12} /> MOVE
          </Button>
          <Button size="sm" variant="secondary" onClick={doReset} disabled={busy}>
            <RotateCcw size={12} /> RESET
          </Button>
          <Button size="sm" variant="danger" onClick={() => setDeleteOpen(true)} disabled={busy}>
            <Trash2 size={12} /> DELETE
          </Button>
          <span className="h-4 w-px bg-border" />
          <button
            type="button"
            onClick={onCleared}
            className="rounded-full p-1.5 text-muted-fg hover:bg-accent-soft hover:text-accent"
            aria-label={t("bulk.clear")}
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* TAG modal */}
      <Modal open={tagOpen} onClose={() => setTagOpen(false)} title={t("bulk.tag")}>
        <div className="space-y-4">
          <p className="text-sm text-muted-fg">
            Comma-separated tags. <span className="font-bold text-fg">{ids.length}</span> cards selected.
          </p>
          <Input
            value={tagInput}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setTagInput(e.target.value)}
            placeholder="algebra, chapter-3, important"
            autoFocus
          />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={() => setTagOpen(false)}>{t("common.cancelUpper")}</Button>
            <Button size="sm" onClick={doTag} disabled={busy || !tagInput.trim()}>
              {busy ? "Tagging…" : "Apply"}
            </Button>
          </div>
        </div>
      </Modal>

      {/* MOVE modal */}
      <Modal open={moveOpen} onClose={() => setMoveOpen(false)} title={t("bulk.move")}>
        <div className="space-y-4">
          <p className="text-sm text-muted-fg">
            Move <span className="font-bold text-fg">{ids.length}</span> cards to another bundle.
          </p>
          <select
            value={effectiveMoveTarget}
            onChange={(e) => setMoveTarget(e.target.value)}
            className="w-full rounded-xl border border-border bg-bg px-3 py-2 text-sm text-fg focus:outline-none"
          >
            {otherBundles.map((b) => (
              <option key={b.id} value={b.id} className="bg-bg text-fg">{b.name}</option>
            ))}
            {otherBundles.length === 0 && (
              <option value="" className="bg-bg text-fg">No other bundles — create one first</option>
            )}
          </select>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={() => setMoveOpen(false)}>{t("common.cancelUpper")}</Button>
            <Button size="sm" onClick={doMove} disabled={busy || !effectiveMoveTarget}>
              {busy ? "Moving…" : "Move"}
            </Button>
          </div>
        </div>
      </Modal>

      {/* DELETE confirm */}
      <Modal open={deleteOpen} onClose={() => setDeleteOpen(false)} title={t("bulk.delete")}>
        <div className="space-y-4">
          <p className="text-sm text-fg">
            Delete <span className="font-bold text-danger">{ids.length}</span> cards? This cannot be undone.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={() => setDeleteOpen(false)}>{t("common.cancel")}</Button>
            <Button variant="danger" size="sm" onClick={doDelete} disabled={busy}>
              {busy ? "Deleting…" : t("common.delete")}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}