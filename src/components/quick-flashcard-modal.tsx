"use client";

// ─── Quick Flashcard Modal ──────────────────────────────────────────
// Lightweight modal to create a single flashcard from selected note text.
// Front is pre-filled; user writes the Back (answer) and picks a bundle.

import { useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { Button, Modal, Input, Textarea } from "@/components/ui";
import { bulkCreateFlashcards } from "@/app/actions";
import { showToast } from "@/components/toast";

interface QuickFlashcardModalProps {
  /** Pre-filled front text (from selection). */
  initialFront: string;
  /** Available destination bundles. */
  bundles: { id: string; name: string }[];
  /** Default bundle id to pre-select. */
  defaultBundleId?: string;
  onClose: () => void;
}

export function QuickFlashcardModal({
  initialFront,
  bundles,
  defaultBundleId,
  onClose,
}: QuickFlashcardModalProps) {
  const [open, setOpen] = useState(true);
  const [front, setFront] = useState(initialFront);
  const [back, setBack] = useState("");
  const [hint, setHint] = useState("");
  const [bundleId, setBundleId] = useState(defaultBundleId ?? bundles[0]?.id ?? "");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const close = () => {
    setOpen(false);
    setTimeout(onClose, 150);
  };

  const handleSave = async () => {
    if (!front.trim()) { setErr("Front (question) is required."); return; }
    if (!back.trim()) { setErr("Back (answer) is required."); return; }
    if (!bundleId) { setErr("Pick a destination bundle."); return; }
    setErr("");
    setSaving(true);
    try {
      const card = {
        front: front.trim(),
        back: back.trim(),
        ...(hint.trim() ? { description: hint.trim() } : {}),
      };
      const result = await bulkCreateFlashcards(bundleId, JSON.stringify([card]));
      if (!result.ok) { setErr(result.error ?? "Failed to save."); return; }
      showToast("Flashcard saved!", "success");
      close();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to save flashcard.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={close} title="Quick Flashcard">
      <div className="space-y-4">
        {/* Front */}
        <div className="space-y-1.5">
          <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-muted-fg">
            Front — Question / Term
          </p>
          <Textarea
            value={front}
            onChange={(e) => setFront(e.target.value)}
            placeholder="The question or term to recall…"
            className="min-h-[80px] w-full resize-y"
            aria-label="Flashcard front"
          />
        </div>

        {/* Back */}
        <div className="space-y-1.5">
          <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-muted-fg">
            Back — Answer / Definition
          </p>
          <Textarea
            value={back}
            onChange={(e) => setBack(e.target.value)}
            placeholder="The answer or explanation…"
            className="min-h-[80px] w-full resize-y"
            aria-label="Flashcard back"
          />
        </div>

        {/* Optional hint */}
        <div className="space-y-1.5">
          <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-muted-fg">
            Hint (optional)
          </p>
          <Input
            value={hint}
            onChange={(e) => setHint(e.target.value)}
            placeholder="A short contextual hint…"
            aria-label="Flashcard hint"
          />
        </div>

        {/* Destination bundle */}
        {bundles.length > 0 && (
          <div className="space-y-1.5">
            <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-muted-fg">
              Destination Deck
            </p>
            <div className="relative">
              <select
                value={bundleId}
                onChange={(e) => setBundleId(e.target.value)}
                className="w-full appearance-none rounded-xl border border-border bg-bg px-3 py-2 text-sm font-bold text-fg focus:outline-none"
                aria-label="Destination bundle"
              >
                {bundles.map((b) => (
                  <option key={b.id} value={b.id} className="bg-bg text-fg">
                    {b.name}
                  </option>
                ))}
              </select>
              <ChevronDown
                size={14}
                className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-muted-fg"
              />
            </div>
          </div>
        )}

        {err && (
          <p className="rounded-xl border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">
            {err}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={close} disabled={saving}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saving || !front.trim() || !back.trim()}>
            <Check size={14} />
            {saving ? "Saving…" : "Save Flashcard"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
