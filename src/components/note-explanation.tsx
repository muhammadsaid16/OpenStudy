"use client";

import { useT } from "@/lib/i18n";

import { useState, useRef, useEffect } from "react";
import { Sparkles, Clipboard, ClipboardCheck, ExternalLink, Trash2, Pencil, Copy, Check, Loader2, Lightbulb, AlertTriangle, BookOpen, Download, FileDown, ClockAlert } from "lucide-react";
import { Button, Skeleton } from "@/components/ui";
import { Markdown } from "@/components/markdown";
import { updateNote } from "@/app/actions";

const NOTEBOOKLM_URL = "https://notebooklm.google.com/";

function notebookPrompt(title: string, content: string): string {
  const lesson = content.trim() || title.trim();
  return `You are an expert tutor inside NotebookLM. I will paste my lesson below — explain it in exhaustive detail for a student who wants to master it.

Follow this exact structure in your answer:
## Overview — 1 paragraph: what this lesson is and why it matters.
## Key Concepts — bullet list of every term/definition/principle.
## Detailed Explanation — section-by-section walkthrough, add sub-headings (### ), examples and analogies. Cover EVERY section in the source; do not skip.
## Examples — 1-3 concrete worked examples that make it tangible.
## What to Remember — numbered list of the 5-8 highest-yield recall points.

Rules: write in the SAME language as the lesson, warm teacher tone, short sentences, clean Markdown, no meta-talk.

LESSON TITLE: ${title || "(untitled)"}

LESSON:
"""
${lesson}
"""`;
}

export function NoteExplanation({
  noteId,
  title,
  content,
  explanation,
  explanationUpdatedAt,
  noteUpdatedAt,
  onSaved,
}: {
  noteId: string;
  title: string;
  content: string;
  explanation: string | null | undefined;
  explanationUpdatedAt: Date | string | null | undefined;
  noteUpdatedAt?: Date | string | null;
  onSaved: (next: string | null) => void;
}) {
  const t = useT();
  const [generating, setGenerating] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [copiedPrompt, setCopiedPrompt] = useState(false);
  const [copiedExp, setCopiedExp] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState("");

  // Streaming typewriter
  const [displayed, setDisplayed] = useState<string | null>(null);
  const [isTyping, setIsTyping] = useState(false);
  const typingRef = useRef<number | null>(null);

  const hasLesson = (content ?? "").trim().length >= 20;
  const hasExplanation = !!(explanation ?? "").trim();

  // stale: lesson edited after explanation was generated
  const isStale =
    hasExplanation &&
    noteUpdatedAt &&
    explanationUpdatedAt &&
    new Date(noteUpdatedAt).getTime() > new Date(explanationUpdatedAt).getTime() + 1500;

  // keep displayed in sync when explanation prop changes outside typing
  useEffect(() => {
    if (!isTyping) setDisplayed(explanation ?? null);
  }, [explanation, isTyping]);

  useEffect(() => {
    return () => {
      if (typingRef.current) window.clearInterval(typingRef.current);
    };
  }, []);

  const startTyping = (full: string) => {
    if (typingRef.current) window.clearInterval(typingRef.current);
    setDisplayed("");
    setIsTyping(true);
    let idx = 0;
    const chunk = 4; // chars per tick — fast but visible
    const speed = 10;
    typingRef.current = window.setInterval(() => {
      idx += chunk;
      if (idx >= full.length) {
        setDisplayed(full);
        setIsTyping(false);
        if (typingRef.current) window.clearInterval(typingRef.current);
        typingRef.current = null;
      } else {
        setDisplayed(full.slice(0, idx));
      }
    }, speed);
  };

  // Live SSE generation: explanation streams in token-by-token as the
  // provider produces it (no full wait, no fake typewriter).
  const doGenerate = async () => {
    if (!hasLesson) {
      setErr("Add more lesson content first (at least 20 characters).");
      return;
    }
    setErr(null);
    setGenerating(true);
    setIsTyping(true);
    setDisplayed("");
    let acc = "";
    let streamed = false;
    try {
      const res = await fetch("/api/ai/explain/stream", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: content, title }),
      });
      if (!res.ok || !res.body) {
        const j = (await res.json().catch(() => null)) as { message?: string } | null;
        setErr(j?.message ?? `AI explanation failed (${res.status}).`);
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let idx: number;
        while ((idx = buf.indexOf("\n\n")) !== -1) {
          const frame = buf.slice(0, idx); buf = buf.slice(idx + 2);
          const dataLine = frame.split("\n").find((l) => l.startsWith("data:"));
          if (!dataLine) continue;
          let ev: { type?: string; text?: string; message?: string; elapsedMs?: number };
          try { ev = JSON.parse(dataLine.slice(5).trim()); } catch { continue; }
          if (ev.type === "delta" && ev.text) {
            streamed = true;
            acc += ev.text;
            setDisplayed(acc);
          } else if (ev.type === "error") {
            if (streamed) {
              // partial output already on screen — keep it, note the truncation
              setErr((ev.message ?? "") + " (Partial output kept.)");
            } else {
              setErr(ev.message ?? "AI explanation failed.");
            }
          } else if (ev.type === "done") {
            // finished cleanly below
          }
        }
      }
      if (acc.trim()) {
        const cleaned = acc.replace(/^```(?:markdown)?\s*/i, "").replace(/```\s*$/i, "").trim();
        await updateNote(noteId, { explanation: cleaned });
        onSaved(cleaned);
        setDisplayed(cleaned);
      } else if (!streamed) {
        setErr("AI returned no content. Try Option 2 — NotebookLM below.");
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Network error. Try Option 2 — NotebookLM below.");
    } finally {
      setGenerating(false);
      setIsTyping(false);
    }
  };

  const doSavePaste = async () => {
    const t = pasteText.trim();
    if (!t) return;
    setSaving(true);
    try {
      await updateNote(noteId, { explanation: t });
      onSaved(t);
      setDisplayed(t);
      setPasteText("");
      setErr(null);
    } finally {
      setSaving(false);
    }
  };

  const doSaveEdit = async () => {
    const t = editText.trim();
    if (!t) return;
    setSaving(true);
    try {
      await updateNote(noteId, { explanation: t });
      onSaved(t);
      setDisplayed(t);
      setEditing(false);
      setErr(null);
    } finally {
      setSaving(false);
    }
  };

  const doDelete = async () => {
    if (isTyping && typingRef.current) {
      window.clearInterval(typingRef.current);
      setIsTyping(false);
    }
    setSaving(true);
    try {
      await updateNote(noteId, { explanation: null });
      onSaved(null);
      setDisplayed(null);
      setErr(null);
    } finally {
      setSaving(false);
    }
  };

  const copyPrompt = async () => {
    const p = notebookPrompt(title, content);
    await navigator.clipboard.writeText(p);
    setCopiedPrompt(true);
    setTimeout(() => setCopiedPrompt(false), 2000);
  };

  const copyExp = async () => {
    const src = displayed ?? explanation;
    if (!src) return;
    await navigator.clipboard.writeText(src);
    setCopiedExp(true);
    setTimeout(() => setCopiedExp(false), 2000);
  };

  const downloadMarkdown = () => {
    const src = displayed ?? explanation;
    if (!src) return;
    const md = `# ${title || "Untitled"} — Explanation\n\n${src}\n`;
    const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const safe = (title || "explanation").slice(0, 40).replace(/[^a-z0-9\u0600-\u06FF]+/gi, "_");
    a.download = `${safe}-explanation.md`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const exportPdf = () => {
    const src = displayed ?? explanation;
    if (!src) return;
    const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    // minimal markdown → html for print: headings/bold/lists
    let html = esc(src)
      .replace(/^### (.+)$/gm, "<h3>$1</h3>")
      .replace(/^## (.+)$/gm, "<h2>$1</h2>")
      .replace(/^# (.+)$/gm, "<h1>$1</h1>")
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/^- (.+)$/gm, "<li>$1</li>")
      .replace(/^\d+\. (.+)$/gm, "<li>$1</li>")
      .replace(/\n\n/g, "</p><p>")
      .replace(/\n/g, "<br/>");
    // wrap stray <li> in <ul>
    const liRe = /(<li>.*<\/li>)/g;
    html = html.replace(liRe, "<ul>$1</ul>").replace(/<\/ul><ul>/g, "");
    html = `<p>${html}</p>`;
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(`<!doctype html><html><head><meta charset="utf-8"/><title>${esc(title)} — Explanation</title>
      <style>
        body{font-family: ui-sans-serif,system-ui,sans-serif; max-width:720px; margin:40px auto; padding:0 24px; color:#111; line-height:1.6; font-size:13px;}
        h1{font-size:22px; margin:28px 0 12px; border-bottom:1px solid #e5e7eb; padding-bottom:8px;} /* print doc — isolated window, not themed */
        h2{font-size:17px; margin:24px 0 10px; color:#111;}
        h3{font-size:14px; margin:18px 0 8px;}
        ul{padding-left:20px; margin:8px 0;}
        li{margin:4px 0;}
        strong{font-weight:700;}
        p{margin:10px 0;}
        .meta{font-size:11px; color:#6b7280; margin-bottom:16px; border-bottom:1px solid #f3f4f6; padding-bottom:12px;}
        @media print{body{margin:24px;}}
      </style></head><body>
      <div class="meta">${esc(title)} — Explanation · ${new Date().toLocaleDateString()} · OpenStudy</div>
      ${html}
    </body></html>`);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 300);
  };

  const promptStr = notebookPrompt(title, content);
  const shown = isTyping ? (displayed ?? "") : (displayed ?? explanation ?? "");

  return (
    <div className="glass mt-8 rounded-3xl p-8">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2.5 text-lg font-bold tracking-tight">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-accent-soft text-accent">
              <Lightbulb size={16} />
            </span>
            Explanation
            {hasExplanation && (
              <span className="rounded-full bg-accent-soft px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-accent">AI</span>
            )}
            {isTyping && (
              <span className="rounded-full bg-accent px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-accent-fg animate-pulse">{t("noteExp.typing")}</span>
            )}
            {isStale && !isTyping && (
              <span className="rounded-full bg-amber-500/15 border border-amber-500/30 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-amber-600 dark:text-amber-400">{t("noteExp.outdated")}</span>
            )}
          </h2>
          <p className="mt-1 max-w-xl text-xs leading-relaxed text-muted-fg">
            Two ways to get your study companion. <span className="font-semibold text-fg">{t("noteExp.option1")}</span> generates it here instantly.
            <span className="font-semibold text-fg"> Option 2 — NotebookLM</span> is the backup when the lesson is very long or credits run out.
          </p>
          {explanationUpdatedAt && hasExplanation && (
            <p className="mt-1 text-[11px] text-muted-fg/70">
              Updated {new Date(explanationUpdatedAt).toLocaleDateString()} · {new Date(explanationUpdatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              {isStale && <span className="ml-2 font-semibold text-amber-600 dark:text-amber-400">· Lesson changed since</span>}
            </p>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          {hasExplanation ? (
            <>
              <Button size="sm" variant="secondary" onClick={() => { setEditText(shown); setEditing((v) => !v); }}>
                <Pencil size={14} /> {editing ? "Cancel edit" : "Edit"}
              </Button>
              <Button size="sm" variant="secondary" onClick={copyExp}>
                {copiedExp ? <Check size={14} /> : <Copy size={14} />} {copiedExp ? "Copied" : "Copy"}
              </Button>
              <Button size="sm" variant="secondary" onClick={downloadMarkdown} title={t("noteExp.downloadMd")}>
                <Download size={14} /> .md
              </Button>
              <Button size="sm" variant="secondary" onClick={exportPdf} title={t("noteExp.savePdf")}>
                <FileDown size={14} /> PDF
              </Button>
              <Button size="sm" variant="ghost" onClick={doDelete} disabled={saving} className="text-muted-fg hover:text-danger">
                <Trash2 size={14} /> Delete
              </Button>
            </>
          ) : null}
          <Button size="sm" onClick={doGenerate} disabled={generating || isTyping} title={!hasLesson ? "Add lesson content first" : "Generate explanation"}>
            {generating ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
            {generating ? "Generating…" : isTyping ? "Typing…" : hasExplanation ? "Regenerate" : "Generate"}
          </Button>
        </div>
      </div>

      {/* Edit */}
      {editing && (
        <div className="mt-6 rounded-2xl border border-glass-border bg-bg-raised p-4">
          <label className="text-xs font-semibold uppercase tracking-widest text-muted-fg">{t("noteExp.editExpl")}</label>
          <textarea
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            rows={14}
            className="glass-inset mt-2 flex min-h-56 w-full rounded-xl px-4 py-3 text-sm leading-relaxed text-fg placeholder:text-muted-fg/60 focus:outline-none focus:!border-accent/20"
            placeholder="Edit the explanation…"
          />
          <div className="mt-3 flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>Cancel</Button>
            <Button size="sm" onClick={doSaveEdit} disabled={saving || !editText.trim()}>{saving ? <Loader2 size={14} className="animate-spin" /> : null} Save</Button>
          </div>
        </div>
      )}

      {/* Stale banner */}
      {isStale && !editing && (
        <div className="mt-6 flex gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm">
          <ClockAlert size={16} className="mt-0.5 shrink-0 text-amber-600" />
          <div className="min-w-0">
            <p className="font-semibold text-amber-700 dark:text-amber-300">Lesson edited since this explanation — may be outdated</p>
            <p className="mt-1 text-xs leading-relaxed text-fg/80">The note was changed after this explanation was generated. Regenerate to bring it up to date, or update it via NotebookLM.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" onClick={doGenerate} disabled={generating || isTyping}>
                <Sparkles size={14} /> Regenerate
              </Button>
              <a href="#notebooklm-option2" className="inline-flex h-8 items-center gap-2 rounded-full border border-amber-500/30 bg-bg px-3 text-xs font-semibold hover:bg-amber-500/10">
                Go to Option 2 <ExternalLink size={12} />
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Body */}
      <div className="mt-6">
        {generating ? (
          <div className="space-y-3">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
            <Skeleton className="mt-6 h-32 w-full" />
            <p className="text-center text-xs text-muted-fg">Writing your explanation… (10–20s)</p>
          </div>
        ) : hasExplanation && !editing ? (
          <div className="prose prose-invert max-w-none prose-p:leading-relaxed prose-headings:font-bold prose-headings:tracking-tight prose-li:leading-relaxed">
            <Markdown content={shown} />
            {isTyping && <span className="inline-block h-4 w-2 animate-pulse bg-accent align-baseline ml-0.5" aria-hidden />}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-glass-border bg-bg-raised/40 p-6">
            <p className="text-sm font-semibold">No explanation yet</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-fg">
              {hasLesson
                ? "Generate it here with AI, or use Option 2 — NotebookLM — when the lesson is very long or credits are exhausted."
                : "Write your lesson above (≥20 chars) first, then generate or paste an explanation here."}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button size="sm" onClick={doGenerate} disabled={generating || !hasLesson || isTyping}>
                <Sparkles size={14} /> Generate with AI
              </Button>
              <a href="#notebooklm-option2" className="inline-flex h-9 items-center gap-2 rounded-full border border-glass-border px-4 text-xs font-semibold text-fg hover:border-accent hover:text-accent">
                Go to Option 2 — NotebookLM <ExternalLink size={14} />
              </a>
            </div>
          </div>
        )}

        {err && (
          <div className="mt-4 flex gap-3 rounded-2xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm">
            <AlertTriangle size={16} className="mt-0.5 shrink-0 text-danger" />
            <div className="min-w-0">
              <p className="font-semibold text-danger">AI couldn’t generate — try Option 2 below</p>
              <p className="mt-1 text-xs leading-relaxed text-fg/80">{err}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <a href="#notebooklm-option2" className="inline-flex h-8 items-center gap-2 rounded-full bg-bg px-3 text-xs font-semibold hover:brightness-110">
                  Go to Option 2 — NotebookLM <ExternalLink size={12} />
                </a>
                <Button size="sm" variant="ghost" onClick={() => setErr(null)}>Dismiss</Button>
              </div>
            </div>
          </div>
        )}

        {/* ── OPTION 2 ── */}
        <div
          id="notebooklm-option2"
          className="mt-6 rounded-2xl border border-accent/25 bg-accent-soft/40 p-5 ring-1 ring-accent/10"
        >
          <div className="flex items-start justify-between gap-3">
            <h3 className="flex items-center gap-2 text-sm font-bold tracking-tight">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent text-accent-fg">
                <BookOpen size={14} />
              </span>
              Option 2 — Import via NotebookLM
              <span className="hidden rounded-full bg-accent px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-accent-fg sm:inline">Backup solution</span>
            </h3>
            <span className="shrink-0 rounded-full border border-accent/30 bg-bg px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-accent">When AI fails or lesson is too long</span>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-muted-fg">
            Used when the built-in AI is rate-limited, credits are exhausted, or your lesson exceeds the size limit. You generate the explanation in{" "}
            <a href={NOTEBOOKLM_URL} target="_blank" rel="noopener noreferrer" className="font-bold text-accent underline underline-offset-2">
              NotebookLM
            </a>{" "}
            with a pre-built prompt (already includes your lesson), then paste the result back here.
          </p>
          <ol className="mt-3 list-decimal space-y-1 pl-5 text-xs leading-relaxed text-muted-fg">
            <li>Click <span className="font-semibold text-fg">Copy prompt</span> below.</li>
            <li>
              Open{" "}
              <a href={NOTEBOOKLM_URL} target="_blank" rel="noopener noreferrer" className="font-bold text-accent underline underline-offset-2">
                NotebookLM
              </a>{" "}
              → <span className="font-semibold text-fg">New notebook</span> → paste the prompt → generate.
            </li>
            <li>Copy NotebookLM’s answer, come back here, paste it in the box below and hit Save.</li>
          </ol>

          <div className="mt-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-fg">Prompt to copy into NotebookLM</p>
              <Button size="sm" variant="secondary" onClick={copyPrompt} className="h-7 px-3 text-xs">
                {copiedPrompt ? <ClipboardCheck size={14} /> : <Clipboard size={14} />} {copiedPrompt ? "Copied" : "Copy prompt"}
              </Button>
            </div>
            <pre className="glass-inset mt-2 max-h-52 overflow-auto whitespace-pre-wrap break-words rounded-xl p-4 text-xs leading-relaxed text-fg/90">
              {promptStr}
            </pre>
            <div className="mt-3 flex flex-wrap gap-2">
              <a
                href={NOTEBOOKLM_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-9 items-center gap-2 rounded-full bg-accent px-4 text-xs font-bold text-accent-fg transition hover:brightness-110"
              >
                Open NotebookLM <ExternalLink size={14} />
              </a>
              <Button size="sm" variant="secondary" onClick={copyPrompt}>
                {copiedPrompt ? <ClipboardCheck size={14} /> : <Clipboard size={14} />} {copiedPrompt ? "Copied" : "Copy prompt"}
              </Button>
            </div>
          </div>

          <div className="mt-5 border-t border-accent/15 pt-5">
            <label className="text-xs font-semibold uppercase tracking-widest text-muted-fg">Paste NotebookLM answer here</label>
            <textarea
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              rows={10}
              placeholder="Paste the NotebookLM answer here (Markdown supported — headings, bullets, bold)…"
              className="glass-inset mt-2 flex min-h-40 w-full rounded-xl px-4 py-3 text-sm leading-relaxed text-fg placeholder:text-muted-fg/60 focus:outline-none focus:!border-accent/20"
            />
            <div className="mt-3 flex flex-wrap justify-end gap-2">
              <Button size="sm" onClick={doSavePaste} disabled={saving || !pasteText.trim()}>
                {saving ? <Loader2 size={14} className="animate-spin" /> : null} Save explanation
              </Button>
            </div>
            {pasteText.trim().length > 0 && (
              <p className="mt-2 text-right text-xs text-muted-fg">{pasteText.trim().length.toLocaleString()} chars — will overwrite current explanation</p>
            )}
            {hasExplanation && !pasteText.trim() && !editing && (
              <p className="mt-2 text-xs text-muted-fg">Pasting here replaces the current explanation. Your previous one will be overwritten.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
