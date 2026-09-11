"use client";

import { useT } from "@/lib/i18n";
import { useState } from "react";
import { Clipboard, Sparkles, Check, AlertTriangle, Loader2, ExternalLink } from "lucide-react";
import { Button, Modal } from "./ui";
import { bulkCreateFlashcards, bulkCreateFlashcardsFromNote } from "@/app/actions";
import { NOTEBOOKLM_IMPORT_PROMPT } from "@/lib/ai-import";
import { useRouter } from "next/navigation";
import type { BundleRec } from "@/lib/db";

type Phase = "idle" | "importing" | "done" | "error";

export function AiImportModal({
  kind,
  sourceId,
  sourceName,
  availableBundles,
  onClose,
  onImported,
}: {
  kind: "bundle" | "note";
  sourceId: string;
  sourceName: string;
  /** Required when kind === "note" so user picks a destination bundle. */
  availableBundles?: BundleRec[];
  onClose: () => void;
  onImported?: () => void | Promise<void>;
}) {
  const t = useT();
  const router = useRouter();
  const [open, setOpen] = useState(true);
  const [phase, setPhase] = useState<Phase>("idle");
  const [pasted, setPasted] = useState("");
  const [created, setCreated] = useState(0);
  const [err, setErr] = useState("");
  const [copied, setCopied] = useState(false);
  // For note source: which bundle to put the cards into.
  const [targetBundleId, setTargetBundleId] = useState<string>(
    () => availableBundles?.[0]?.id ?? ""
  );

  // Live detection of how many cards are in the pasted JSON.
  const detectedCount = (() => {
    if (!pasted.trim()) return 0;
    try {
      const stripped = pasted.trim()
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```\s*$/, "");
      const p = JSON.parse(stripped);
      if (Array.isArray(p)) return p.length;
      if (Array.isArray(p?.cards)) return p.cards.length;
      return 0;
    } catch {
      return 0;
    }
  })();

  const close = () => {
    setOpen(false);
    setTimeout(onClose, 150);
  };

  const copyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(NOTEBOOKLM_IMPORT_PROMPT);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = NOTEBOOKLM_IMPORT_PROMPT;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand("copy"); } catch {}
      ta.remove();
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    }
  };

  const openNotebookLM = () => {
    window.open("https://notebook.google.com/", "_blank", "noopener,noreferrer");
  };

  const importNow = async () => {
    if (!pasted.trim()) { setErr("Paste some JSON first."); setPhase("error"); return; }
    if (kind === "note" && !targetBundleId) {
      setErr("Pick a destination bundle for these cards."); setPhase("error"); return;
    }
    setPhase("importing");
    setErr("");
    try {
      const r = kind === "bundle"
        ? await bulkCreateFlashcards(sourceId, pasted)
        : await bulkCreateFlashcardsFromNote(sourceId, targetBundleId, pasted);
      if (!r.ok) { setErr(r.error || "Import failed."); setPhase("error"); return; }
      setCreated(r.created);
      setPhase("done");
      try {
        if (onImported) await onImported();
        else router.refresh();
      } catch {
        /* parent re-fetch failed */
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setPhase("error");
    }
  };

  // ────────────────────────────────────────────────────────────────
  // Body variants
  // ────────────────────────────────────────────────────────────────

  const promptStep = (
    <div className="space-y-2">
      <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-muted-fg">
        STEP 01 — COPY THE PROMPT BELOW
      </p>
      <p className="text-sm text-muted-fg leading-relaxed">
        Paste this prompt into NotebookLM (or any chat LLM) along with your lesson.
        It returns a JSON array of <code className="font-mono text-accent">{"{front, back, description?}"}</code> cards.
      </p>
      <div className="flex flex-wrap gap-2 pt-1">
        <Button size="sm" variant="secondary" onClick={copyPrompt}>
          {copied ? <Check size={14} /> : <Clipboard size={14} />}
          {copied ? "Copied" : "Copy prompt"}
        </Button>
        <Button size="sm" variant="secondary" onClick={openNotebookLM}>
          <ExternalLink size={14} /> Open NotebookLM
        </Button>
      </div>
    </div>
  );

  // For note source: a bundle picker. For bundle source: a static label.
  const destinationStep = kind === "note" ? (
    <div className="space-y-2">
      <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-muted-fg">
        STEP 02 — CHOOSE A DESTINATION BUNDLE
      </p>
      {availableBundles && availableBundles.length > 0 ? (
        <select
          value={targetBundleId}
          onChange={(e) => setTargetBundleId(e.target.value)}
          className="w-full rounded-xl border border-border bg-bg px-3 py-2 text-sm font-bold text-fg focus:outline-none"
          aria-label="Destination bundle"
        >
          {availableBundles.map((b) => (
            <option key={b.id} value={b.id} className="bg-bg text-fg">
              {b.name}
            </option>
          ))}
        </select>
      ) : (
        <p className="text-sm text-warning">
          No decks yet — create one in Library first.
        </p>
      )}
    </div>
  ) : (
    <div className="space-y-1">
      <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-muted-fg">
        STEP 02 — CONFIRM DESTINATION
      </p>
      <p className="text-sm text-fg">
        Cards will be added to{" "}
        <span className="font-bold text-accent">{sourceName}</span>.
      </p>
    </div>
  );

  const pasteStep = (
    <div className="space-y-2">
      <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-muted-fg">
        {kind === "note" ? "Step 03" : "Step 02"} — paste the JSON below
      </p>
      <textarea
        value={pasted}
        onChange={(e) => { setPasted(e.target.value); if (phase === "error") setPhase("idle"); }}
        placeholder={`[\n  { "front": "What is 2+2?", "back": "4", "description": "Optional hint" },\n  { "front": "...", "back": "..." }\n]`}
        className="w-full min-h-[200px] resize-y rounded-xl border border-border bg-bg p-3 font-mono text-sm text-fg leading-relaxed placeholder:text-muted-fg/50 focus:outline-none"
        spellCheck={false}
        autoComplete="off"
        aria-label="Paste NotebookLM JSON output"
      />
      <div className="flex items-center justify-between text-[11px] uppercase tracking-widest">
        <span className="text-muted-fg">
          {pasted.trim() ? (
            detectedCount > 0 ? (
              <>Detected · <span className="font-bold text-fg">{detectedCount}</span> card{detectedCount !== 1 ? "s" : ""}</>
            ) : (
              <span className="text-warning">Unreadable JSON — check format</span>
            )
          ) : (
            "Paste the JSON here"
          )}
        </span>
        {pasted && (
          <button
            type="button"
            onClick={() => setPasted("")}
            className="text-muted-fg hover:text-accent"
          >
            CLEAR
          </button>
        )}
      </div>
    </div>
  );

  const errorBox = err ? (
    <div className="flex items-start gap-2 rounded-xl border border-danger/40 bg-danger/10 p-3 text-xs text-danger">
      <AlertTriangle size={14} className="shrink-0 mt-0.5" />
      <p>{err}</p>
    </div>
  ) : null;

  const canImport = pasted.trim() &&
    detectedCount > 0 &&
    (kind === "bundle" || !!targetBundleId);

  const actionBar = (
    <div className="mt-2 flex flex-wrap items-center justify-end gap-2">
      <Button variant="secondary" size="sm" onClick={close}>
        CANCEL
      </Button>
      <Button size="sm" onClick={importNow} disabled={phase === "importing" || !canImport}>
        {phase === "importing" ? (
          <><Loader2 size={14} className="animate-spin" /> IMPORTING…</>
        ) : (
          <><Sparkles size={14} /> IMPORT {detectedCount > 0 ? `${detectedCount} ` : ""}CARD{detectedCount !== 1 ? "S" : ""}</>
        )}
      </Button>
    </div>
  );

  const targetBundleName = kind === "note"
    ? availableBundles?.find((b) => b.id === targetBundleId)?.name ?? "—"
    : sourceName;

  const doneScreen = (
    <div className="space-y-4">
      <div className="flex items-start gap-3 rounded-xl border border-success/40 bg-success/10 p-4">
        <Check size={18} className="shrink-0 mt-0.5 text-success" />
        <div>
          <p className="font-bold uppercase tracking-tight text-fg">
            IMPORTED {created} CARD{created !== 1 ? "S" : ""}
          </p>
          <p className="mt-0.5 text-xs text-muted-fg uppercase tracking-widest">
            ADDED TO {targetBundleName}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap justify-end gap-2">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => router.push(kind === "bundle" ? `/bundles/${sourceId}/cards` : `/bundles/${targetBundleId}/cards`)}
        >
          REVIEW CARDS
        </Button>
        <Button size="sm" onClick={close}>DONE</Button>
      </div>
    </div>
  );

  return (
    <Modal
      open={open}
      onClose={close}
      title={`AI IMPORT · ${kind === "note" ? "Note: " : ""}${sourceName}`}
    >
      <div className="space-y-5">
        {phase === "done" ? doneScreen : (
          <>
            {promptStep}
            <div className="h-px w-full bg-border" aria-hidden />
            {destinationStep}
            <div className="h-px w-full bg-border" aria-hidden />
            {pasteStep}
            {errorBox}
            {actionBar}
          </>
        )}
      </div>
    </Modal>
  );
}