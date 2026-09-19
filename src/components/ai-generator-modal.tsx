"use client";

import { useState } from "react";
import { Modal, Button, Input } from "@/components/ui";
import { Sparkles, Layers, Plus, Trash2, Check, RefreshCw } from "lucide-react";
import { extractCardsFromText, type GeneratedCard } from "@/lib/ai-generator";
import { createBundle, importCardsIntoBundle, getSubjects, getBundles } from "@/app/actions";
import { useLiveData } from "@/lib/use-live-data";
import type { SubjectRec, BundleRec } from "@/lib/db";

export interface AIGeneratorModalProps {
  open: boolean;
  onClose: () => void;
  initialText?: string;
}

export function AIGeneratorModal({ open, onClose, initialText = "" }: AIGeneratorModalProps) {
  const [inputText, setInputText] = useState(initialText);
  const [cards, setCards] = useState<GeneratedCard[]>([]);
  const [bundleName, setBundleName] = useState("AI Generated Deck");
  const [selectedBundleId, setSelectedBundleId] = useState<string>("");
  const [isSaving, setIsSaving] = useState(false);
  const [savedCount, setSavedCount] = useState<number | null>(null);

  const data = useLiveData(() => Promise.all([getSubjects(), getBundles()]), []);
  const [subjects, bundles] = data ?? [[], []];

  const handleGenerate = () => {
    const extracted = extractCardsFromText(inputText);
    setCards(extracted);
  };

  const handleSave = async () => {
    if (cards.length === 0) return;
    setIsSaving(true);
    try {
      let targetId = selectedBundleId;
      if (!targetId) {
        const created = await createBundle({ name: bundleName || "AI Generated Study Deck" });
        targetId = created.id;
      }

      await importCardsIntoBundle(
        targetId,
        cards.map((c) => ({
          front: c.front,
          back: c.back,
          kind: c.kind,
          choices: c.choices,
          tags: c.tags,
        }))
      );

      setSavedCount(cards.length);
      setTimeout(() => {
        setIsSaving(false);
        setSavedCount(null);
        onClose();
      }, 1200);
    } catch (err) {
      console.error("Failed to save AI cards:", err);
      setIsSaving(false);
    }
  };

  const handleRemoveCard = (index: number) => {
    setCards(cards.filter((_, i) => i !== index));
  };

  return (
    <Modal open={open} onClose={onClose} title="AI Auto-Card & Quiz Generator">
      <div className="space-y-6">
        <p className="text-xs text-muted-fg">
          Paste your study notes, articles, or definitions below. Ruvren AI will automatically extract Q&A, Cloze deletion, and Multiple-Choice cards.
        </p>

        {/* Input Text Area */}
        <div>
          <textarea
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="Paste your notes here... (e.g. Photosynthesis: Process by which plants turn light into energy. **Mitosis**: Cell division process.)"
            rows={5}
            className="w-full rounded-2xl border border-border bg-bg p-4 text-xs font-mono text-fg focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <div className="mt-2 flex justify-end">
            <Button size="sm" onClick={handleGenerate} disabled={!inputText.trim()}>
              <Sparkles size={14} className="me-1" /> Generate Cards ({cards.length})
            </Button>
          </div>
        </div>

        {/* Card Previews */}
        {cards.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-2">
              <span className="text-xs font-bold uppercase tracking-widest text-fg">
                Extracted Cards ({cards.length})
              </span>
              <Button variant="ghost" size="sm" onClick={() => setCards([])}>
                Clear
              </Button>
            </div>

            <div className="max-h-60 space-y-3 overflow-y-auto pe-1">
              {cards.map((c, i) => (
                <div key={i} className="relative rounded-xl border border-border bg-bg-raised/60 p-3 text-xs">
                  <button
                    onClick={() => handleRemoveCard(i)}
                    className="absolute top-3 end-3 text-muted-fg hover:text-red-400"
                  >
                    <Trash2 size={14} />
                  </button>
                  <div className="pe-6">
                    <span className="inline-block rounded bg-primary/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest text-primary mb-1">
                      {c.kind}
                    </span>
                    <p className="font-bold text-fg">{c.front}</p>
                    <p className="mt-1 text-muted-fg">{c.back}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Target Bundle Selector */}
            <div className="space-y-2 border-t border-border pt-4">
              <span className="text-xs font-bold uppercase tracking-widest text-muted-fg">Save Destination</span>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-[10px] uppercase tracking-widest text-muted-fg mb-1">New Bundle Name</label>
                  <Input
                    value={bundleName}
                    onChange={(e) => {
                      setBundleName(e.target.value);
                      setSelectedBundleId("");
                    }}
                    placeholder="e.g. Biology Ch 4"
                  />
                </div>
                <div>
                  <label className="block text-[10px] uppercase tracking-widest text-muted-fg mb-1">Or Existing Deck</label>
                  <select
                    value={selectedBundleId}
                    onChange={(e) => setSelectedBundleId(e.target.value)}
                    className="w-full rounded-full border border-border bg-bg px-4 py-2 text-xs font-semibold text-fg"
                  >
                    <option value="">-- Create New Deck --</option>
                    {(bundles as BundleRec[]).map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="secondary" onClick={onClose}>
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={isSaving}>
                {savedCount !== null ? (
                  <>
                    <Check size={14} className="me-1 text-success" /> Saved {savedCount} Cards!
                  </>
                ) : isSaving ? (
                  "Saving..."
                ) : (
                  `Save ${cards.length} Cards to Deck`
                )}
              </Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
