"use client";

import {
  useState,
  useRef,
  useEffect,
  useCallback,
  forwardRef,
  useImperativeHandle,
  type TextareaHTMLAttributes,
  type KeyboardEvent,
  type ChangeEvent,
} from "react";
import { FileText, Layers, Link as LinkIcon } from "lucide-react";
import { getAllNotes, getBundles } from "@/app/actions";
import { useLiveData } from "@/lib/use-live-data";

export interface SuggestionItem {
  id: string;
  title: string;
  type: "note" | "bundle";
  subtitle?: string;
}

export interface WikiSuggestTextareaProps
  extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "onChange"> {
  value: string;
  onChange: (value: string) => void;
  onSelectLink?: (item: SuggestionItem) => void;
  customNotes?: { id: string; title: string }[];
  customBundles?: { id: string; name: string }[];
}

export const WikiSuggestTextarea = forwardRef<HTMLTextAreaElement, WikiSuggestTextareaProps>(
  function WikiSuggestTextarea(
    {
      value,
      onChange,
      onSelectLink,
      customNotes,
      customBundles,
      className,
      rows = 8,
      placeholder,
      ...props
    },
    ref
  ) {
    const internalRef = useRef<HTMLTextAreaElement | null>(null);
    useImperativeHandle(ref, () => internalRef.current as HTMLTextAreaElement);
    const textareaRef = internalRef;
    const dropdownRef = useRef<HTMLDivElement | null>(null);

  // Auto-fetch notes and decks if not passed via props
  const liveData = useLiveData(
    () => Promise.all([getAllNotes(), getBundles()]),
    []
  );

  const [fetchedNotes, fetchedBundles] = liveData ?? [[], []];
  const allNotes = customNotes ?? fetchedNotes;
  const allBundles = customBundles ?? fetchedBundles;

  // Autocomplete state
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [matchStart, setMatchStart] = useState<number>(-1);
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Compute suggestions
  const suggestions: SuggestionItem[] = [];
  if (isOpen) {
    const q = query.toLowerCase();

    // Notes matches
    allNotes.forEach((n) => {
      const title = (n as { title?: string }).title || "Untitled Note";
      if (!q || title.toLowerCase().includes(q)) {
        suggestions.push({
          id: n.id,
          title,
          type: "note",
          subtitle: "Note",
        });
      }
    });

    // Bundles / Decks matches
    allBundles.forEach((b) => {
      const name = (b as { name?: string }).name || "Deck";
      if (!q || name.toLowerCase().includes(q)) {
        suggestions.push({
          id: b.id,
          title: name,
          type: "bundle",
          subtitle: "Flashcard Deck",
        });
      }
    });
  }

  const limitedSuggestions = suggestions.slice(0, 8);

  // Check for [[ at cursor
  const checkTrigger = useCallback((val: string, cursor: number) => {
    const textBefore = val.slice(0, cursor);
    const match = textBefore.match(/\[\[([^\]\n]*)$/);

    if (match && match.index !== undefined) {
      setIsOpen(true);
      setQuery(match[1]);
      setMatchStart(match.index);
      setSelectedIndex(0);
    } else {
      setIsOpen(false);
      setQuery("");
      setMatchStart(-1);
    }
  }, []);

  const handleChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    const nextVal = e.target.value;
    const cursor = e.target.selectionStart ?? nextVal.length;
    onChange(nextVal);
    checkTrigger(nextVal, cursor);
  };

  const insertSuggestion = (item: SuggestionItem) => {
    if (matchStart === -1) return;
    const textarea = textareaRef.current;
    const currentCursor = textarea?.selectionStart ?? value.length;

    const before = value.slice(0, matchStart);
    const after = value.slice(currentCursor);
    const insertion = `[[${item.title}]]`;
    const nextVal = before + insertion + after;
    const nextCursor = matchStart + insertion.length;

    onChange(nextVal);
    setIsOpen(false);
    setMatchStart(-1);
    onSelectLink?.(item);

    // Reposition cursor right after ]]
    setTimeout(() => {
      if (textarea) {
        textarea.focus();
        textarea.setSelectionRange(nextCursor, nextCursor);
      }
    }, 10);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (!isOpen || limitedSuggestions.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % limitedSuggestions.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + limitedSuggestions.length) % limitedSuggestions.length);
    } else if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      const selected = limitedSuggestions[selectedIndex];
      if (selected) {
        insertSuggestion(selected);
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      setIsOpen(false);
    }
  };

  // Close when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        textareaRef.current &&
        !textareaRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="relative w-full">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onKeyUp={(e) => {
          if (!["ArrowUp", "ArrowDown", "Enter", "Tab", "Escape"].includes(e.key)) {
            const cursor = e.currentTarget.selectionStart ?? value.length;
            checkTrigger(value, cursor);
          }
        }}
        onClick={(e) => {
          const cursor = e.currentTarget.selectionStart ?? value.length;
          checkTrigger(value, cursor);
        }}
        rows={rows}
        placeholder={placeholder}
        className={
          className ||
          "w-full resize-y rounded-xl border border-border bg-bg p-3 text-sm text-fg leading-relaxed placeholder:text-muted-fg/50 focus:outline-none focus:ring-1 focus:ring-primary"
        }
        {...props}
      />

      {/* Obsidian-style Suggestion Popup */}
      {isOpen && (
        <div
          ref={dropdownRef}
          className="absolute z-50 max-h-52 w-80 overflow-y-auto rounded-2xl border border-border bg-bg/95 p-1.5 shadow-2xl backdrop-blur-md transition-all animate-in fade-in zoom-in-95 duration-100"
          style={{ top: "100%", marginTop: "6px" }}
        >
          <div className="flex items-center justify-between px-2.5 py-1.5 border-b border-border/60 text-[10px] font-bold uppercase tracking-wider text-muted-fg">
            <span className="flex items-center gap-1.5">
              <LinkIcon size={12} className="text-primary" />
              Link Note or Deck
            </span>
            <span className="font-mono text-[9px]">↑↓ to navigate · ↵ to insert</span>
          </div>

          <div className="mt-1 space-y-0.5">
            {limitedSuggestions.length === 0 ? (
              <div className="p-3 text-center text-xs text-muted-fg">
                No matching notes or decks found for <span className="font-semibold text-fg">&ldquo;{query}&rdquo;</span>
              </div>
            ) : (
              limitedSuggestions.map((item, idx) => {
                const isSelected = idx === selectedIndex;
                const isNote = item.type === "note";
                const Icon = isNote ? FileText : Layers;

                return (
                  <button
                    key={`${item.type}-${item.id}`}
                    type="button"
                    onMouseEnter={() => setSelectedIndex(idx)}
                    onClick={() => insertSuggestion(item)}
                    className={`flex w-full items-center justify-between rounded-xl px-2.5 py-2 text-start text-xs transition-colors ${
                      isSelected
                        ? "bg-primary text-on-primary font-semibold shadow-sm"
                        : "text-fg hover:bg-bg-raised"
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <div
                        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg ${
                          isSelected
                            ? "bg-on-primary/20 text-on-primary"
                            : isNote
                            ? "bg-blue-500/15 text-blue-500"
                            : "bg-violet-500/15 text-violet-500"
                        }`}
                      >
                        <Icon size={13} />
                      </div>
                      <span className="truncate">{item.title}</span>
                    </div>

                    <span
                      className={`ms-2 shrink-0 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest ${
                        isSelected
                          ? "bg-on-primary/25 text-on-primary"
                          : "bg-muted text-muted-fg"
                      }`}
                    >
                      {item.subtitle}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
});
