"use client";

import { useT } from "@/lib/i18n";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getAllFlashcards, getAllNotes, getBundles, getSubjects } from "@/app/actions";
import { cardKind, maskCloze } from "@/lib/card-kinds";
import { cn } from "@/lib/utils";

type Entry = { id: string; group: string; title: string; sub: string; href: string };

const PER_GROUP = 6;

// Global search: ⌘K / Ctrl+K fuzzy palette over subjects, bundles,
// flashcards (cloze-aware: the masked stem is searchable, not the hidden
// answers) and notes. Built lazily on first open; capped so big libraries stay fast.
function hay(e: Entry): string {
  return (e.title + " " + e.sub).toLowerCase();
}

export function CommandPalette() {
  const t = useT();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const [index, setIndex] = useState<Entry[] | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const startedRef = useRef(false);

  const load = useCallback(async () => {
    try {
      const [subjects, bundles, cards, notes] = await Promise.all([
        getSubjects(),
        getBundles(),
        getAllFlashcards(),
        getAllNotes(),
      ]);
      const out: Entry[] = [];
      for (const s of subjects)
        out.push({ id: "s" + s.id, group: t("common.subjects"), title: s.name, sub: "", href: "/subjects" });
      for (const b of bundles ?? [])
        out.push({ id: "b" + b.id, group: "Bundles", title: b.name, sub: (b as { description?: string }).description ?? "", href: "/bundles/" + b.id + "/cards" });
      for (const c of (cards ?? []).slice(0, 1500)) {
        const k = cardKind(c as { kind?: string | null });
        const front = k === "cloze" ? maskCloze(c.front) : c.front;
        out.push({
          id: "c" + c.id, group: "Cards", title: front.slice(0, 90), sub: k === "basic" ? c.back.slice(0, 90) : k.toUpperCase(),
          href: c.bundleId ? "/bundles/" + c.bundleId + "/cards" : "/subjects",
        });
      }
      for (const n of (notes ?? []).slice(0, 500))
        out.push({ id: "n" + n.id, group: t("common.notesLabel"), title: n.title, sub: "", href: "/notes/" + n.id });
      setIndex(out);
    } catch { setIndex([]); }
  }, []);

  const toggle = useCallback(() => {
    setQ(""); setSel(0);
    // Lazy index build fires from the toggle event, not an effect —
    // opening the palette never needs a cascading render to fetch data.
    if (startedRef.current === false) {
      startedRef.current = true;
      void load();
    }
    setOpen((o) => !o);
  }, [load]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        toggle();
      } else if (e.key === "Escape") setOpen(false);
    };
    // Custom event so buttons (sidebar, mobile) can open the palette too.
    const onCustom = () => toggle();
    window.addEventListener("keydown", onKey);
    window.addEventListener("open-command-palette", onCustom);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("open-command-palette", onCustom);
    };
  }, [toggle]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 30);
  }, [open]);

  const results = useMemo(() => {
    const all = index ?? [];
    const needle = q.trim().toLowerCase();
    const pool = needle ? all.filter((e) => hay(e).includes(needle)) : all;
    const out: Entry[] = [];
    for (const g of ["Cards", "Bundles", t("common.subjects"), t("common.notesLabel")])
      for (const e of pool) {
        if (e.group !== g) continue;
        if (out.filter((x) => x.group === g).length >= PER_GROUP) continue;
        out.push(e);
      }
    return out.slice(0, 24);
  }, [index, q]);

  const go = useCallback((e: Entry) => {
    setOpen(false);
    router.push(e.href);
  }, [router]);

  // Selection follows the query: reset in the change event (not an effect).
  function onQuery(v: string) {
    setQ(v);
    setSel(0);
  }
  useEffect(() => {
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: "nearest" });
  }, [sel]);

  if (!open) return null;
  let lastGroup = "";
  return (
    <div role="dialog" aria-label="Global search" className="fixed inset-0 z-[90] flex items-start justify-center bg-black/60 p-4 pt-[12vh]" onClick={() => setOpen(false)}>
      <div className="w-full max-w-xl overflow-hidden rounded-2xl border border-border bg-bg shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => onQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") { e.preventDefault(); setSel((s) => Math.min(s + 1, results.length - 1)); }
            else if (e.key === "ArrowUp") { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)); }
            else if (e.key === "Enter" && results[sel]) go(results[sel]);
          }}
          placeholder="SEARCH CARDS, BUNDLES, SUBJECTS, NOTES…"
          className="w-full border-b-2 border-border bg-transparent px-5 py-4 text-sm font-bold uppercase tracking-widest outline-none placeholder:text-muted-fg"
        />
        <div ref={listRef} className="max-h-[50vh] overflow-y-auto p-2">
          {index === null && <p className="px-4 py-6 text-center text-xs uppercase tracking-widest text-muted-fg">LOADING…</p>}
          {index !== null && results.length === 0 && <p className="px-4 py-6 text-center text-xs uppercase tracking-widest text-muted-fg">NO MATCHES</p>}
          {results.map((e, i) => {
            const head = e.group !== lastGroup ? e.group : null;
            lastGroup = e.group;
            return (
              <div key={e.id}>
                {head && <p className="px-3 pb-1 pt-3 text-[10px] font-bold uppercase tracking-widest text-muted-fg">{head}</p>}
                <button
                  type="button"
                  data-active={i === sel}
                  onMouseEnter={() => setSel(i)}
                  onClick={() => go(e)}
                  className={cn("flex w-full flex-col gap-0.5 rounded-lg px-3 py-2 text-start", i === sel ? "bg-accent/15" : "hover:bg-accent/10")}
                >
                  <span className="truncate text-sm font-bold uppercase">{e.title}</span>
                  {e.sub !== "" && <span className="truncate text-xs text-muted-fg">{e.sub}</span>}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}