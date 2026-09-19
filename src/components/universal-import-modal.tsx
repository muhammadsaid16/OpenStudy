"use client";

// ─── Universal Import & Vault Backup Modal ──────────────────────────
// Tabbed modal providing:
// 1. Quizlet & Delimited Text Parser (Tab, Comma, Semicolon, Dash, Pipe) + Live Preview + Destination picker
// 2. File Upload (CSV, TSV, Markdown) + Auto-column mapping + Note/Flashcard import
// 3. Vault Backup & Restore (1-click JSON download & Full Vault restore)

import { useState, useRef } from "react";
import {
  Upload,
  Download,
  FileText,
  Table as TableIcon,
  Check,
  X,
  Database,
  Layers,
  Sparkles,
  ChevronDown,
  AlertCircle,
  FileCode,
} from "lucide-react";
import { Button, Modal, Textarea, Input } from "./ui";
import { parseQuizletText, type ParsedQuizletCard } from "@/lib/importers/quizlet";
import { parseCsvTsvContent, parseMarkdownNoteContent } from "@/lib/importers/csv-md";
import { exportVaultToJson, restoreVaultFromJson } from "@/lib/importers/vault";
import { bulkCreateFlashcards, createNote } from "@/app/actions";
import { showToast } from "@/components/toast";

type TabMode = "quizlet" | "files" | "vault";

interface BundleOption {
  id: string;
  name: string;
}

export function UniversalImportModal({
  bundles,
  defaultBundleId,
  onClose,
  onImportComplete,
}: {
  bundles: BundleOption[];
  defaultBundleId?: string;
  onClose: () => void;
  onImportComplete?: () => void;
}) {
  const [open, setOpen] = useState(true);
  const [tab, setTab] = useState<TabMode>("quizlet");

  // Quizlet state
  const [quizletRaw, setQuizletRaw] = useState("");
  const [delimiter, setDelimiter] = useState("\t");
  const [bundleId, setBundleId] = useState(defaultBundleId ?? bundles[0]?.id ?? "");
  const [parsedCards, setParsedCards] = useState<ParsedQuizletCard[]>([]);
  const [quizletError, setQuizletError] = useState("");
  const [savingQuizlet, setSavingQuizlet] = useState(false);

  // File upload state
  const [file, setFile] = useState<File | null>(null);
  const [fileParsedCards, setFileParsedCards] = useState<ParsedQuizletCard[]>([]);
  const [parsedNote, setParsedNote] = useState<{ title: string; content: string; tags: string[] } | null>(null);
  const [savingFile, setSavingFile] = useState(false);
  const [fileError, setFileError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Vault state
  const [vaultRestoring, setVaultRestoring] = useState(false);
  const [vaultMsg, setVaultMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const vaultInputRef = useRef<HTMLInputElement>(null);

  const close = () => {
    setOpen(false);
    setTimeout(onClose, 150);
  };

  // ─── Quizlet Live Parsing ───────────────────────────────────────
  const handleParseQuizlet = (text: string, delim: string) => {
    setQuizletRaw(text);
    if (!text.trim()) {
      setParsedCards([]);
      return;
    }
    const cards = parseQuizletText(text, { delimiter: delim });
    setParsedCards(cards);
  };

  const handleSaveQuizlet = async () => {
    if (parsedCards.length === 0) { setQuizletError("Paste some terms and definitions first."); return; }
    if (!bundleId) { setQuizletError("Pick a destination deck."); return; }
    setQuizletError("");
    setSavingQuizlet(true);

    try {
      const payload = JSON.stringify(parsedCards.map((c) => ({ front: c.front, back: c.back, description: c.description, tags: c.tags })));
      const res = await bulkCreateFlashcards(bundleId, payload);
      if (!res.ok) {
        setQuizletError(res.error ?? "Import failed.");
        return;
      }
      showToast(`Imported ${res.created} flashcards!`, "success");
      onImportComplete?.();
      close();
    } catch (e) {
      setQuizletError(e instanceof Error ? e.message : "Import failed.");
    } finally {
      setSavingQuizlet(false);
    }
  };

  // ─── File Parser ────────────────────────────────────────────────
  const handleFileSelect = async (f: File) => {
    setFile(f);
    setFileError("");
    setFileParsedCards([]);
    setParsedNote(null);

    const name = f.name.toLowerCase();
    const text = await f.text();

    if (name.endsWith(".md") || name.endsWith(".markdown")) {
      const note = parseMarkdownNoteContent(text, f.name);
      setParsedNote(note);
    } else if (name.endsWith(".csv") || name.endsWith(".tsv") || name.endsWith(".txt")) {
      const cards = parseCsvTsvContent(text, f.name);
      setFileParsedCards(cards);
      if (cards.length === 0) {
        setFileError("No valid cards found in file.");
      }
    } else {
      setFileError("Unsupported file type. Use .csv, .tsv, .txt, or .md");
    }
  };

  const handleSaveFile = async () => {
    if (parsedNote) {
      setSavingFile(true);
      try {
        await createNote({
          title: parsedNote.title,
          content: parsedNote.content,
          tags: parsedNote.tags,
        });
        showToast(`Imported Note: "${parsedNote.title}"`, "success");
        onImportComplete?.();
        close();
      } catch (e) {
        setFileError(e instanceof Error ? e.message : "Failed to save note.");
      } finally {
        setSavingFile(false);
      }
    } else if (fileParsedCards.length > 0) {
      if (!bundleId) { setFileError("Pick a destination deck."); return; }
      setSavingFile(true);
      try {
        const payload = JSON.stringify(fileParsedCards);
        const res = await bulkCreateFlashcards(bundleId, payload);
        if (!res.ok) { setFileError(res.error ?? "Failed to save cards."); return; }
        showToast(`Imported ${res.created} flashcards!`, "success");
        onImportComplete?.();
        close();
      } catch (e) {
        setFileError(e instanceof Error ? e.message : "Failed to save cards.");
      } finally {
        setSavingFile(false);
      }
    }
  };

  // ─── Vault Export & Restore ──────────────────────────────────────
  const handleExportVault = async () => {
    try {
      await exportVaultToJson();
      showToast("Vault exported successfully!", "success");
    } catch {
      showToast("Vault export failed", "danger");
    }
  };

  const handleRestoreVault = async (f: File) => {
    setVaultRestoring(true);
    setVaultMsg(null);
    try {
      const res = await restoreVaultFromJson(f);
      if (!res.ok) {
        setVaultMsg({ type: "error", text: res.error ?? "Restore failed." });
        return;
      }
      setVaultMsg({
        type: "success",
        text: `Restored: ${res.subjectsCount} Subjects, ${res.flashcardsCount} Flashcards, ${res.notesCount} Notes!`,
      });
      showToast("Vault restored & merged successfully!", "success");
      onImportComplete?.();
    } catch (e) {
      setVaultMsg({ type: "error", text: e instanceof Error ? e.message : "Failed to restore." });
    } finally {
      setVaultRestoring(false);
      if (vaultInputRef.current) vaultInputRef.current.value = "";
    }
  };

  return (
    <Modal open={open} onClose={close} title="Universal Importer & Vault Backup">
      <div className="space-y-5">
        {/* Tabs */}
        <div className="flex gap-1 rounded-xl border border-border bg-bg p-1">
          <button
            type="button"
            onClick={() => setTab("quizlet")}
            className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-bold uppercase tracking-widest transition-colors ${tab === "quizlet" ? "bg-primary-container text-on-primary-container" : "text-muted-fg hover:text-primary"}`}
          >
            <TableIcon size={14} />Quizlet / Text
          </button>
          <button
            type="button"
            onClick={() => setTab("files")}
            className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-bold uppercase tracking-widest transition-colors ${tab === "files" ? "bg-primary-container text-on-primary-container" : "text-muted-fg hover:text-primary"}`}
          >
            <FileText size={14} />CSV / TSV / MD
          </button>
          <button
            type="button"
            onClick={() => setTab("vault")}
            className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-bold uppercase tracking-widest transition-colors ${tab === "vault" ? "bg-primary-container text-on-primary-container" : "text-muted-fg hover:text-primary"}`}
          >
            <Database size={14} />Vault Backup
          </button>
        </div>

        {/* Destination bundle picker (for flashcard tabs) */}
        {(tab === "quizlet" || (tab === "files" && fileParsedCards.length > 0)) && bundles.length > 0 && (
          <div className="space-y-1.5">
            <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-muted-fg">Destination Deck</p>
            <div className="relative">
              <select
                value={bundleId}
                onChange={(e) => setBundleId(e.target.value)}
                className="w-full appearance-none rounded-xl border border-border bg-bg px-3 py-2 text-sm font-bold text-fg focus:outline-none"
              >
                {bundles.map((b) => (
                  <option key={b.id} value={b.id} className="bg-bg text-fg">
                    {b.name}
                  </option>
                ))}
              </select>
              <ChevronDown size={14} className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-muted-fg" />
            </div>
          </div>
        )}

        {/* ── Tab 1: Quizlet & Delimited Text ─────────────────────── */}
        {tab === "quizlet" && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-muted-fg">Paste terms & definitions copied from Quizlet or Anki:</p>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold uppercase tracking-widest text-muted-fg">Delimiter:</span>
                <select
                  value={delimiter}
                  onChange={(e) => handleParseQuizlet(quizletRaw, e.target.value)}
                  className="rounded-lg border border-border bg-bg px-2 py-1 text-xs font-bold text-fg"
                >
                  <option value="\t">Tab (\t)</option>
                  <option value="custom-dash">Dash ( - )</option>
                  <option value=";">Semicolon (;)</option>
                  <option value="|">Pipe (|)</option>
                  <option value=",">Comma (,)</option>
                </select>
              </div>
            </div>

            <Textarea
              value={quizletRaw}
              onChange={(e) => handleParseQuizlet(e.target.value, delimiter)}
              placeholder={`Term 1\tDefinition 1\nTerm 2\tDefinition 2`}
              rows={6}
              className="font-mono text-xs"
            />

            {parsedCards.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs font-bold uppercase tracking-widest text-muted-fg">
                  <span>Parsed Preview ({parsedCards.length} cards)</span>
                </div>
                <div className="max-h-48 overflow-y-auto rounded-xl border border-border bg-bg/50 p-2 space-y-1">
                  {parsedCards.slice(0, 10).map((c, i) => (
                    <div key={i} className="flex items-center justify-between rounded-lg bg-card/60 px-3 py-1.5 text-xs">
                      <span className="font-bold text-fg truncate max-w-[40%]">{c.front}</span>
                      <span className="text-muted-fg truncate max-w-[50%]">{c.back}</span>
                    </div>
                  ))}
                  {parsedCards.length > 10 && (
                    <p className="text-center text-[10px] text-muted-fg pt-1">+{parsedCards.length - 10} more cards</p>
                  )}
                </div>
              </div>
            )}

            {quizletError && <p className="text-xs text-danger">{quizletError}</p>}

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="secondary" size="sm" onClick={close}>Cancel</Button>
              <Button size="sm" onClick={handleSaveQuizlet} disabled={savingQuizlet || parsedCards.length === 0}>
                <Check size={14} />{savingQuizlet ? "Importing…" : `Import ${parsedCards.length} Cards`}
              </Button>
            </div>
          </div>
        )}

        {/* ── Tab 2: CSV / TSV / Markdown Upload ──────────────────── */}
        {tab === "files" && (
          <div className="space-y-4">
            <div
              onClick={() => fileInputRef.current?.click()}
              className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-border/80 bg-bg/40 p-8 text-center cursor-pointer transition-colors hover:border-primary/50 hover:bg-primary-container/10"
            >
              <Upload size={32} className="text-primary mb-2" />
              <p className="text-sm font-bold text-fg">Click or Drag File to Upload</p>
              <p className="text-xs text-muted-fg mt-1">Supports .csv, .tsv, .txt (flashcards) or .md (notes)</p>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.tsv,.txt,.md,.markdown"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFileSelect(f);
              }}
            />

            {file && (
              <div className="rounded-xl border border-border bg-bg/60 p-3 flex items-center justify-between text-xs font-bold">
                <span className="flex items-center gap-2 text-fg truncate">
                  <FileCode size={16} className="text-primary shrink-0" />
                  {file.name}
                </span>
                <span className="text-muted-fg">{(file.size / 1024).toFixed(1)} KB</span>
              </div>
            )}

            {parsedNote && (
              <div className="rounded-xl border border-primary/30 bg-primary-container/15 p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-widest text-primary">Note Found</span>
                  <span className="text-xs font-bold text-fg">{parsedNote.title}</span>
                </div>
                <p className="line-clamp-3 text-xs text-muted-fg">{parsedNote.content}</p>
              </div>
            )}

            {fileParsedCards.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-bold uppercase tracking-widest text-muted-fg">
                  Parsed {fileParsedCards.length} Flashcards
                </p>
                <div className="max-h-40 overflow-y-auto rounded-xl border border-border bg-bg/50 p-2 space-y-1">
                  {fileParsedCards.slice(0, 5).map((c, i) => (
                    <div key={i} className="flex justify-between rounded-lg bg-card/60 px-3 py-1 text-xs">
                      <span className="font-bold text-fg truncate max-w-[45%]">{c.front}</span>
                      <span className="text-muted-fg truncate max-w-[45%]">{c.back}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {fileError && <p className="text-xs text-danger">{fileError}</p>}

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="secondary" size="sm" onClick={close}>Cancel</Button>
              <Button
                size="sm"
                onClick={handleSaveFile}
                disabled={savingFile || (!parsedNote && fileParsedCards.length === 0)}
              >
                <Check size={14} />{savingFile ? "Saving…" : "Save to Library"}
              </Button>
            </div>
          </div>
        )}

        {/* ── Tab 3: Vault Backup & Restore ───────────────────────── */}
        {tab === "vault" && (
          <div className="space-y-4">
            <div className="rounded-2xl border border-border bg-bg p-5 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-bold text-fg">Export Full Vault JSON</h4>
                  <p className="text-xs text-muted-fg mt-0.5">
                    Download a full snapshot of all subjects, notes, flashcards, and sessions.
                  </p>
                </div>
                <Button size="sm" onClick={handleExportVault}>
                  <Download size={14} />Export Vault
                </Button>
              </div>
            </div>

            <div className="rounded-2xl border border-border bg-bg p-5 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-bold text-fg">Restore / Merge Vault</h4>
                  <p className="text-xs text-muted-fg mt-0.5">
                    Safely merge a JSON backup into IndexedDB without losing existing work.
                  </p>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => vaultInputRef.current?.click()}
                  disabled={vaultRestoring}
                >
                  <Upload size={14} />{vaultRestoring ? "Restoring…" : "Restore File"}
                </Button>
                <input
                  ref={vaultInputRef}
                  type="file"
                  accept=".json,application/json"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleRestoreVault(f);
                  }}
                />
              </div>

              {vaultMsg && (
                <div
                  className={`mt-3 flex items-center gap-2 rounded-xl border p-3 text-xs font-bold ${
                    vaultMsg.type === "success"
                      ? "border-success/40 bg-success/10 text-success"
                      : "border-danger/40 bg-danger/10 text-danger"
                  }`}
                >
                  {vaultMsg.type === "success" ? <Check size={14} /> : <AlertCircle size={14} />}
                  <span>{vaultMsg.text}</span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
