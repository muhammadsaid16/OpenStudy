"use client";

// ─── Note Selection Toolbar ─────────────────────────────────────────
// A floating toolbar that appears near selected text in a <textarea>.
// Provides quick actions: "→ Flashcard" and "→ Practice Q" (AI quiz).

import { useEffect, useRef, useState } from "react";
import { BookOpen, Wand2, X } from "lucide-react";

interface SelectionToolbarProps {
  /** The textarea element to watch for selections. */
  targetRef: React.RefObject<HTMLTextAreaElement | null>;
  /** Called when user clicks → Flashcard with the selected text. */
  onMakeFlashcard: (selectedText: string) => void;
  /** Called when user clicks → Practice Q with the selected text. */
  onMakePracticeQ: (selectedText: string) => void;
  /** Whether the toolbar actions are available (e.g. not while running timer). */
  disabled?: boolean;
}

export function NoteSelectionToolbar({
  targetRef,
  onMakeFlashcard,
  onMakePracticeQ,
  disabled = false,
}: SelectionToolbarProps) {
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const [selectedText, setSelectedText] = useState("");
  const toolbarRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = targetRef.current;
    if (!el) return;

    const onMouseUp = () => {
      const start = el.selectionStart;
      const end = el.selectionEnd;
      if (start === end) {
        setPosition(null);
        setSelectedText("");
        return;
      }
      const text = el.value.slice(start, end).trim();
      if (text.length < 3) {
        setPosition(null);
        setSelectedText("");
        return;
      }

      // Position the toolbar just above the textarea using getBoundingClientRect.
      const rect = el.getBoundingClientRect();
      setPosition({ top: rect.top + window.scrollY - 48, left: rect.left + window.scrollX });
      setSelectedText(text);
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.shiftKey) onMouseUp();
    };

    const onMouseDown = (e: MouseEvent) => {
      // Only dismiss if the click is outside the toolbar
      if (toolbarRef.current && !toolbarRef.current.contains(e.target as Node)) {
        setPosition(null);
        setSelectedText("");
      }
    };

    el.addEventListener("mouseup", onMouseUp);
    el.addEventListener("keyup", onKeyUp);
    document.addEventListener("mousedown", onMouseDown);

    return () => {
      el.removeEventListener("mouseup", onMouseUp);
      el.removeEventListener("keyup", onKeyUp);
      document.removeEventListener("mousedown", onMouseDown);
    };
  }, [targetRef]);

  if (!position || !selectedText) return null;

  return (
    <div
      ref={toolbarRef}
      style={{ top: position.top, left: position.left }}
      className="fixed z-50 flex items-center gap-1 rounded-xl border border-border bg-card px-2 py-1.5 shadow-xl backdrop-blur-md"
      role="toolbar"
      aria-label="Text actions"
    >
      <span className="me-1 max-w-[120px] truncate font-mono text-[10px] text-muted-fg">
        "{selectedText.slice(0, 30)}{selectedText.length > 30 ? "…" : ""}"
      </span>
      <button
        onClick={() => {
          if (!disabled) {
            onMakeFlashcard(selectedText);
            setPosition(null);
            setSelectedText("");
          }
        }}
        disabled={disabled}
        title="Convert to Flashcard"
        aria-label="Convert selection to Flashcard"
        className="flex items-center gap-1.5 rounded-lg border border-primary/40 bg-primary-container/15 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-primary transition-colors hover:bg-primary-container/30 disabled:opacity-40"
      >
        <BookOpen size={11} />
        Flashcard
      </button>
      <button
        onClick={() => {
          if (!disabled) {
            onMakePracticeQ(selectedText);
            setPosition(null);
            setSelectedText("");
          }
        }}
        disabled={disabled}
        title="Generate Practice Question"
        aria-label="Generate practice question from selection"
        className="flex items-center gap-1.5 rounded-lg border border-border bg-muted/40 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-muted-fg transition-colors hover:border-primary/40 hover:text-primary disabled:opacity-40"
      >
        <Wand2 size={11} />
        Practice Q
      </button>
      <button
        onClick={() => { setPosition(null); setSelectedText(""); }}
        aria-label="Dismiss toolbar"
        className="ms-0.5 rounded-md p-0.5 text-muted-fg/50 hover:text-muted-fg"
      >
        <X size={12} />
      </button>
    </div>
  );
}
