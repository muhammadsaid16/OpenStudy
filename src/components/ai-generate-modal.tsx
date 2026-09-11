"use client";

import { useT } from "@/lib/i18n";

// Direct AI card generation — paste source text or upload an image, the server
// calls Gemini, and the result is previewed for one-click bulk-accept.

import { useEffect, useRef, useState } from "react";
import {
  Sparkles,
  Loader2,
  Check,
  X,
  AlertTriangle,
  RefreshCw,
  Wand2,
  Image as ImageIcon,
  FileText,
  Upload,
  Link2,
} from "lucide-react";
import { Button, Modal } from "./ui";
import { bulkCreateFlashcards } from "@/app/actions";
import { showUndo } from "@/components/undo-toast";
import type { AiCardInput } from "@/lib/ai-import/schema";
import { useRouter } from "next/navigation";
import type { BundleRec } from "@/lib/db";

type BundleLike = Pick<BundleRec, "id" | "name">;

type Phase =
  | "input" // user is typing/picking source
  | "generating" // server is calling Gemini
  | "preview" // cards are back, user can prune + accept
  | "saving" // bulk-create in flight
  | "done" // saved
  | "error";

const MAX_CHARS = 8_000;
const MIN_CHARS = 20;
const GEN_STAGES = ["Reading source", "Extracting concepts", "Writing cards"] as const;

interface ApiSuccess {
  ok: true;
  cards: AiCardInput[];
  model: string;
  elapsedMs: number;
  ocrPreview?: string;
}
interface ApiError {
  ok: false;
  error: string;
  message: string;
}

export function AiGenerateModal({
  bundles,
  defaultBundleId,
  defaultPrompt,
  onClose,
  onCreated,
}: {
  bundles: BundleLike[];
  defaultBundleId?: string;
  defaultPrompt?: string;
  onClose: () => void;
  onCreated?: () => void | Promise<void>;
}) {
  const t = useT();
  const router = useRouter();
  const [open, setOpen] = useState(true);
  const [mode, setMode] = useState<"text" | "image">("text");
  const [phase, setPhase] = useState<Phase>("input");
  const [source, setSource] = useState(defaultPrompt ?? "");

  useEffect(() => {
    if (defaultPrompt && source === "" ) setSource(defaultPrompt);
    // keep source in sync if prompt arrives late (e.g. note loads after mount)
    if (defaultPrompt && defaultPrompt !== source && phase === "input" && source.length === 0) setSource(defaultPrompt);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultPrompt]);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [bundleId, setBundleId] = useState<string>(defaultBundleId ?? bundles[0]?.id ?? "");
  const [cards, setCards] = useState<AiCardInput[]>([]);
  const [rejected, setRejected] = useState<Set<number>>(new Set());
  const [err, setErr] = useState("");
  const [errCode, setErrCode] = useState<string>("");
  const [meta, setMeta] = useState<{ model: string; elapsedMs: number; ocrPreview?: string } | null>(null);
  const [savedCount, setSavedCount] = useState(0);
  // Stage animation for generating step
  const [stageIdx, setStageIdx] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const close = () => {
    setOpen(false);
    setTimeout(onClose, 150);
  };

  // Animate generating stages
  useEffect(() => {
    if (phase !== "generating") { setStageIdx(0); return; }
    let i = 0;
    const id = setInterval(() => {
      i = (i + 1) % GEN_STAGES.length;
      setStageIdx(i);
    }, 1200);
    return () => clearInterval(id);
  }, [phase]);

  // Cmd/Ctrl+Enter to generate from the textarea.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && phase === "input" && mode === "text") {
        e.preventDefault();
        void generate();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, source, bundleId, mode]);

  const sourceLen = source.length;
  const sourceValid = sourceLen >= MIN_CHARS && sourceLen <= MAX_CHARS;
  const imageValid = !!imageFile;

  const onPickImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null;
    if (!f) {
      setImageFile(null);
      setImagePreview(null);
      return;
    }
    if (f.size > 8 * 1024 * 1024) {
      setErr("Image is over 8 MB. Use a smaller photo.");
      setErrCode("IMAGE_TOO_LARGE");
      setPhase("error");
      e.target.value = "";
      return;
    }
    if (!/^image\/(png|jpe?g|webp|gif)$/i.test(f.type)) {
      setErr(`Unsupported type "${f.type}". Use PNG, JPEG, WEBP, or GIF.`);
      setErrCode("UNSUPPORTED_TYPE");
      setPhase("error");
      e.target.value = "";
      return;
    }
    setImageFile(f);
    setImagePreview(URL.createObjectURL(f));
    if (phase === "error") setPhase("input");
  };

  const clearImage = () => {
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    setImageFile(null);
    setImagePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const generate = async () => {
    if (!bundleId) {
      setErr("Pick a destination bundle first.");
      setErrCode("NO_BUNDLE");
      setPhase("error");
      return;
    }

    if (mode === "text") {
      if (!sourceValid) {
        setErr(
          sourceLen < MIN_CHARS
            ? `Need at least ${MIN_CHARS} characters.`
            : `Max ${MAX_CHARS.toLocaleString()} characters — split into smaller chunks.`
        );
        setErrCode("CLIENT_VALIDATION");
        setPhase("error");
        return;
      }
      setPhase("generating");
      setErr("");
      setErrCode("");
      setMeta(null);
      try {
        const r = await fetch("/api/ai/generate-cards", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ text: source }),
        });
        const data = (await r.json()) as ApiSuccess | ApiError;
        if (!data.ok) {
          setErr(data.message);
          setErrCode(data.error);
          setPhase("error");
          return;
        }
        setCards(data.cards);
        setRejected(new Set());
        setMeta({ model: data.model, elapsedMs: data.elapsedMs });
        setPhase("preview");
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
        setErrCode("NETWORK");
        setPhase("error");
      }
      return;
    }

    if (!imageValid) {
      setErr("Pick an image first.");
      setErrCode("CLIENT_VALIDATION");
      setPhase("error");
      return;
    }
    setPhase("generating");
    setErr("");
    setErrCode("");
    setMeta(null);
    try {
      const fd = new FormData();
      fd.append("image", imageFile!);
      const r = await fetch("/api/ai/analyze-image", {
        method: "POST",
        body: fd,
      });
      const data = (await r.json()) as ApiSuccess | ApiError & { ocrPreview?: string };
      if (!data.ok) {
        setErr(data.message);
        setErrCode(data.error);
        setPhase("error");
        return;
      }
      setCards(data.cards);
      setRejected(new Set());
      setMeta({
        model: data.model,
        elapsedMs: data.elapsedMs,
        ocrPreview: (data as { ocrPreview?: string }).ocrPreview,
      });
      setPhase("preview");
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setErrCode("NETWORK");
      setPhase("error");
    }
  };

  const acceptAll = async () => {
    const keep = cards.filter((_, i) => !rejected.has(i));
    if (keep.length === 0) {
      setErr("Uncheck at least one card to accept.");
      setErrCode("NONE_SELECTED");
      setPhase("error");
      return;
    }
    setPhase("saving");
    setErr("");
    try {
      const r = await bulkCreateFlashcards(
        bundleId,
        JSON.stringify(keep.map((c) => ({
          front: c.front,
          back: c.back,
          ...(c.description ? { description: c.description } : {}),
        })))
      );
      if (!r.ok) {
        setErr(r.error || "Import failed.");
        setErrCode("BULK_FAILED");
        setPhase("error");
        return;
      }
      setSavedCount(r.created);
      setPhase("done");
      showUndo({ message: `ADDED ${r.created} CARD${r.created !== 1 ? "S" : ""} — UNDO?`, duration: 6000, undo: () => { /* NOP — cards are already persisted */ } });
      try {
        if (onCreated) await onCreated();
        else router.refresh();
      } catch {
        /* parent re-fetch failed */
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setErrCode("BULK_FAILED");
      setPhase("error");
    }
  };

  const toggleReject = (i: number) => {
    setRejected((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  };

  const keepCount = cards.length - rejected.size;
  const selectedBundle = bundles.find((b) => b.id === bundleId);

  // Count kinds for the meta line
  const kindCount = cards.reduce(
    (acc, c) => {
      acc[c.kind ?? "basic"] = (acc[c.kind ?? "basic"] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  // ─── Input step ──────────────────────────────────────────────────
  const inputStep = (
    <div className="space-y-4">
      {/* Mode switcher (text vs image) */}
      <div className="flex gap-1 rounded-xl border border-border bg-bg p-1">
        <button
          type="button"
          onClick={() => { if (phase !== "generating" && phase !== "saving") setMode("text"); }}
          disabled={phase === "generating" || phase === "saving"}
          className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-bold uppercase tracking-widest transition-colors ${
            mode === "text"
              ? "bg-accent text-accent-fg"
              : "text-muted-fg hover:text-accent disabled:opacity-50"
          }`}
          aria-pressed={mode === "text"}
        >
          <FileText size={14} /> TEXT
        </button>
        <button
          type="button"
          onClick={() => { if (phase !== "generating" && phase !== "saving") setMode("image"); }}
          disabled={phase === "generating" || phase === "saving"}
          className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-bold uppercase tracking-widest transition-colors ${
            mode === "image"
              ? "bg-accent text-accent-fg"
              : "text-muted-fg hover:text-accent disabled:opacity-50"
          }`}
          aria-pressed={mode === "image"}
        >
          <ImageIcon size={14} /> IMAGE
        </button>
      </div>

      {/* Source description */}
      <p className="rounded-lg border border-border/60 bg-bg/60 px-3 py-2 text-[11px] leading-relaxed text-muted-fg">
        {mode === "text"
          ? "Paste lesson notes, a chapter, or any teachable text. Gemini turns it into flashcards."
          : "Take a photo of notes, a textbook page, a slide, or a whiteboard."}
      </p>

      {/* Bundle picker */}
      <div className="space-y-1">
        <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-muted-fg">
          DESTINATION BUNDLE
        </p>
        {bundles.length > 0 ? (
          <select
            value={bundleId}
            onChange={(e) => setBundleId(e.target.value)}
            className="w-full rounded-xl border border-border bg-bg px-3 py-2 text-sm font-bold text-fg focus:outline-none"
            aria-label="Destination bundle"
          >
            {bundles.map((b) => (
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

      <div className="h-px w-full bg-border" aria-hidden />

      {mode === "text" ? (
        <div className="space-y-2">
          <div className="flex items-end justify-between">
            <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-muted-fg">
              YOUR SOURCE TEXT
            </p>
            <span
              className={`font-mono text-[10px] uppercase tracking-widest ${
                sourceLen > MAX_CHARS
                  ? "text-danger"
                  : sourceLen >= MIN_CHARS
                  ? "text-success"
                  : "text-muted-fg"
              }`}
            >
              {sourceLen.toLocaleString()} / {MAX_CHARS.toLocaleString()}
            </span>
          </div>
          <textarea
            ref={textareaRef}
            value={source}
            onChange={(e) => {
              setSource(e.target.value);
              if (phase === "error") setPhase("input");
            }}
            placeholder={
              "Paste lesson notes, a chapter, a transcript — anything teachable.\n\nTip: ⌘/Ctrl + Enter to generate."
            }
            className="w-full min-h-[260px] resize-y rounded-xl border border-border bg-bg p-3 text-sm text-fg leading-relaxed placeholder:text-muted-fg/50 focus:outline-none"
            spellCheck={false}
            autoComplete="off"
            aria-label="Source text for AI card generation"
          />
          <p className="text-[11px] text-muted-fg leading-relaxed">
            {sourceLen < MIN_CHARS
              ? `Need ${MIN_CHARS - sourceLen} more characters`
              : sourceLen > MAX_CHARS
              ? "Over limit — split into smaller chunks"
              : "Ready · press Generate or use ⌘/Ctrl + Enter"}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-muted-fg">
            YOUR IMAGE
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            onChange={onPickImage}
            className="hidden"
            aria-label="Image to analyze"
          />
          {imagePreview ? (
            <div className="space-y-2">
              <div className="relative overflow-hidden rounded-xl border border-border bg-bg">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={imagePreview}
                  alt="Selected study material"
                  className="mx-auto max-w-full h-auto max-h-[320px] object-contain"
                />
                <button
                  type="button"
                  onClick={clearImage}
                  className="absolute end-2 top-2 rounded-full border border-border bg-bg/90 p-1 text-muted-fg hover:text-accent hover:bg-accent-soft"
                  aria-label="Remove image"
                >
                  <X size={14} />
                </button>
              </div>
              <p className="text-[11px] text-muted-fg">
                {imageFile?.name} · {(imageFile!.size / 1024).toFixed(0)} KB · READY
              </p>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-bg px-4 py-12 text-muted-fg transition-colors hover:border-accent hover:text-accent hover:bg-accent-soft"
            >
              <Upload size={28} />
              <span className="font-mono text-[10px] font-bold uppercase tracking-widest">
                CLICK TO PICK AN IMAGE
              </span>
              <span className="text-[11px]">
                PNG / JPEG / WEBP / GIF · MAX 8 MB
              </span>
            </button>
          )}
          <p className="text-[11px] text-muted-fg leading-relaxed">
            {imageValid
              ? "Ready · press Analyze to extract cards"
              : "photo of notes, a textbook page, a slide, or a whiteboard"}
          </p>
        </div>
      )}

      {err && (
        <div className="flex items-start gap-2 rounded-xl border border-danger/40 bg-danger/10 p-3 text-xs text-danger">
          <AlertTriangle size={14} className="shrink-0 mt-0.5" />
          <div>
            <p className="font-bold uppercase tracking-wider">
              {errCode.replaceAll("_", " ")}
            </p>
            <p className="mt-0.5">{err}</p>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button variant="secondary" size="sm" onClick={close}>
          CANCEL
        </Button>
        <Button
          size="sm"
          onClick={generate}
          disabled={
            !bundleId ||
            bundles.length === 0 ||
            (mode === "text" ? !sourceValid : !imageValid)
          }
        >
          {mode === "image" ? <ImageIcon size={14} /> : <Wand2 size={14} />}
          {mode === "image" ? "Analyze image" : "Generate cards"}
        </Button>
      </div>
    </div>
  );

  // ─── Generating step ─────────────────────────────────────────────
  const generatingStep = (
    <div className="flex flex-col items-center justify-center gap-4 py-12">
      <Loader2 size={28} className="animate-spin text-accent" />
      <div className="space-y-1 text-center">
        <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-accent">
          {GEN_STAGES[stageIdx]}
        </p>
        <p className="text-xs text-muted-fg leading-relaxed">
          {mode === "image" ? (
            <>Analyzing <span className="font-bold text-fg">{imageFile?.name ?? "image"}</span> → <span className="font-bold text-fg">{selectedBundle?.name ?? "—"}</span></>
          ) : (
            <>{sourceLen.toLocaleString()} chars → <span className="font-bold text-fg">{selectedBundle?.name ?? "—"}</span></>
          )}
        </p>
        <p className="text-[10px] text-muted-fg/60">Usually takes 5–10 seconds</p>
      </div>
      {/* Stage dots */}
      <div className="flex gap-1.5">
        {GEN_STAGES.map((_, i) => (
          <div
            key={i}
            className={`h-1.5 w-1.5 rounded-full transition-colors ${
              i === stageIdx ? "bg-accent" : i < stageIdx ? "bg-accent/60" : "bg-border"
            }`}
          />
        ))}
      </div>
    </div>
  );

  // ─── Preview step ───────────────────────────────────────────────
  const previewStep = (
    <div className="space-y-4">
      {/* Meta bar */}
      {meta && (
        <div className="space-y-2">
          <div className="flex items-center justify-between rounded-xl border border-border bg-bg/50 px-3 py-2 text-[11px] uppercase tracking-widest text-muted-fg">
            <div className="flex items-center gap-3">
              <span>
                <span className="font-bold text-fg">{cards.length}</span> CARD{cards.length !== 1 ? "S" : ""} GENERATED
              </span>
              <span className="text-border">·</span>
              <span>{(meta.elapsedMs / 1000).toFixed(1)}S</span>
              <span className="text-border">·</span>
              <span>{meta.model}</span>
            </div>
            <button
              type="button"
              onClick={() => {
                setPhase("input");
                setCards([]);
                setRejected(new Set());
                setErr("");
              }}
              className="flex items-center gap-1 text-accent hover:underline"
            >
              <RefreshCw size={11} /> Try again
            </button>
          </div>
          {/* Kind breakdown */}
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(kindCount).map(([kind, count]) => (
              <span
                key={kind}
                className="rounded-full border border-border px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest text-muted-fg"
              >
                {count} {kind.toUpperCase()}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* OCR preview — shown by default for image mode */}
      {meta?.ocrPreview && (
        <div className="rounded-xl border border-border/60 bg-bg/40 p-3 text-[11px] text-muted-fg">
          <p className="mb-1 font-mono text-[10px] font-bold uppercase tracking-widest text-muted-fg/60">
            WHAT THE MODEL READ
          </p>
          <p className="leading-relaxed text-fg/80">{meta.ocrPreview.slice(0, 300)}{meta.ocrPreview.length > 300 ? "…" : ""}</p>
        </div>
      )}

      {/* Card list */}
      <ul className="max-h-[420px] space-y-2 overflow-y-auto pe-1">
        {cards.map((c, i) => {
          const off = rejected.has(i);
          return (
            <li
              key={i}
              className={`group rounded-xl border p-3 transition-colors ${
                off
                  ? "border-border bg-bg/30 opacity-50"
                  : "border-border bg-bg hover:border-accent/40"
              }`}
            >
              <div className="flex items-start gap-3">
                <button
                  type="button"
                  onClick={() => toggleReject(i)}
                  aria-pressed={!off}
                  aria-label={off ? "Include this card" : "Exclude this card"}
                  className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border transition-colors ${
                    off
                      ? "border-border bg-bg text-muted-fg"
                      : "border-accent bg-accent text-accent-fg"
                  }`}
                >
                  {off ? <X size={14} /> : <Check size={14} />}
                </button>
                <div className="min-w-0 flex-1 space-y-1">
                  <p
                    className={`text-sm font-bold leading-snug ${off ? "line-through text-muted-fg" : "text-fg"}`}
                  >
                    {c.front}
                  </p>
                  <p
                    className={`text-xs leading-relaxed ${off ? "line-through text-muted-fg" : "text-muted-fg"}`}
                  >
                    {c.back}
                  </p>
                  {c.description && (
                    <p className="text-[10px] uppercase tracking-widest text-accent">
                      HINT · {c.description}
                    </p>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      {err && (
        <div className="flex items-start gap-2 rounded-xl border border-danger/40 bg-danger/10 p-3 text-xs text-danger">
          <AlertTriangle size={14} className="shrink-0 mt-0.5" />
          <p>{err}</p>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-mono text-[10px] uppercase tracking-widest text-muted-fg">
          {keepCount} OF {cards.length} SELECTED
        </span>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={() => setPhase("input")}>
            BACK
          </Button>
          <Button
            size="sm"
            onClick={acceptAll}
            disabled={keepCount === 0}
          >
            <Check size={14} /> ADD {keepCount} CARD{keepCount !== 1 ? "S" : ""}
          </Button>
        </div>
      </div>
    </div>
  );

  // ─── Saving step ─────────────────────────────────────────────────
  const savingStep = (
    <div className="flex flex-col items-center justify-center gap-3 py-12">
      <Loader2 size={28} className="animate-spin text-accent" />
      <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-muted-fg">
        ADDING CARDS…
      </p>
    </div>
  );

  // ─── Done step ───────────────────────────────────────────────────
  const doneStep = (
    <div className="space-y-4">
      <div className="flex items-start gap-3 rounded-xl border border-success/40 bg-success/10 p-4">
        <Check size={18} className="shrink-0 mt-0.5 text-success" />
        <div>
          <p className="font-bold uppercase tracking-tight text-fg">
            ADDED {savedCount} CARD{savedCount !== 1 ? "S" : ""} TO {selectedBundle?.name ?? "—"}
          </p>
          <p className="mt-0.5 text-xs font-bold uppercase tracking-widest text-success/70">
            READY FOR REVIEW · DUE IMMEDIATELY
          </p>
        </div>
      </div>
      <div className="flex flex-wrap justify-end gap-2">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => router.push(`/bundles/${bundleId}/cards`)}
        >
          REVIEW CARDS
        </Button>
        <Button size="sm" onClick={close}>
          DONE
        </Button>
      </div>
    </div>
  );

  return (
    <Modal open={open} onClose={close} title={t("modal.aiCards")}>
      <div className="space-y-4">
        {phase === "input" && inputStep}
        {phase === "generating" && generatingStep}
        {phase === "preview" && previewStep}
        {phase === "saving" && savingStep}
        {phase === "done" && doneStep}
        {phase === "error" && (
          <>
            {inputStep}
            <div className="flex items-start gap-2 rounded-xl border border-danger/40 bg-danger/10 p-3 text-xs text-danger">
              <AlertTriangle size={14} className="shrink-0 mt-0.5" />
              <div>
                <p className="font-bold uppercase tracking-wider">{errCode.replaceAll("_", " ")}</p>
                <p className="mt-0.5">{err}</p>
              </div>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}