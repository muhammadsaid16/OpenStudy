"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { createBundle, importCardsIntoBundle } from "@/app/actions";
import { decodeShare, parseSharedBundle, type SharedBundle } from "@/lib/share";

type SharedState = { bundle: SharedBundle } | { bad: true; reason: string } | { empty: true };

function decodeFromHash(hash: string): SharedState {
  const raw = hash.startsWith("#") ? hash.slice(1) : hash;
  if (!raw.trim()) return { empty: true };
  try {
    const bundle = parseSharedBundle(decodeShare<unknown>(hash));
    return { bundle };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // A deck shared with 0 cards — friendlier than "invalid link".
    if (msg.includes("cards") && (msg.includes("too_small") || msg.includes(">= 1"))) {
      return { bad: true, reason: "THE SENDER SHARED AN EMPTY DECK — IT HAS NO CARDS YET. ASK THEM TO ADD CARDS AND SHARE AGAIN." };
    }
    return { bad: true, reason: msg };
  }
}

export default function SharePage() {
  const router = useRouter();
  const [shared, setShared] = useState<SharedState>(() => {
    if (typeof window === "undefined") return { empty: true };
    return decodeFromHash(window.location.hash);
  });
  const bundle = "bundle" in shared ? shared.bundle : null;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [fileBusy, setFileBusy] = useState(false);

  useEffect(() => {
    const sync = () => setShared(decodeFromHash(window.location.hash));
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);

  async function doImport() {
    if (!bundle) return;
    setBusy(true); setError("");
    try {
      // description may be null (schema allows it) — createBundle's zod rejects null
      const created = await createBundle({ name: bundle.name, description: bundle.description ?? undefined });
      await importCardsIntoBundle(created.id, bundle.cards.map((c) => ({
        front: c.front,
        back: c.back,
        description: c.description ?? undefined,
        tags: c.tags ?? undefined,
        kind: c.kind ?? undefined,
        choices: c.choices ?? undefined,
      })));
      router.push("/bundles/" + created.id + "/cards");
    } catch { setError("IMPORT FAILED — THE LINK MAY BE CORRUPT."); }
    finally { setBusy(false); }
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileBusy(true); setError("");
    try {
      const text = await file.text();
      const raw = JSON.parse(text) as unknown;
      const parsed = parseSharedBundle(raw);
      setShared({ bundle: parsed });
    } catch { setError("INVALID FILE — ASK THE SENDER FOR A FRESH EXPORT."); }
    finally { setFileBusy(false); e.target.value = ""; }
  }

  if ("empty" in shared) {
    return (
      <div className="mx-auto max-w-lg p-12 text-center">
        <h1 className="text-2xl font-bold uppercase">NO SHARE DATA</h1>
        <p className="mt-2 text-xs uppercase tracking-widest text-muted-fg">OPEN THE LINK THE SENDER GAVE YOU — IT MUST END WITH # AND A LONG CODE. IF YOU HAVE A .STUDYMAX-BUNDLE.JSON FILE, IMPORT IT BELOW.</p>
        <label className="mt-6 inline-flex cursor-pointer items-center rounded-full border border-border bg-bg px-5 py-2.5 text-xs font-bold uppercase tracking-widest">
          <input type="file" accept=".json,application/json" className="hidden" onChange={onFile} disabled={fileBusy} />
          {fileBusy ? "Reading…" : "Import from file"}
        </label>
        {error !== "" && <p className="mt-3 text-xs font-bold uppercase tracking-widest text-danger">{error}</p>}
      </div>
    );
  }

  if ("bad" in shared)
    return (
      <div className="mx-auto max-w-lg p-12 text-center">
        <h1 className="text-2xl font-bold uppercase">INVALID SHARE LINK</h1>
        <p className="mt-2 text-xs uppercase tracking-widest text-muted-fg">ASK THE SENDER FOR A FRESH LINK OR FILE. LINKS ARE LONG — SOME APPS CUT THEM OFF. THE FILE (.STUDYMAX-BUNDLE.JSON) ALWAYS WORKS.</p>
        <div className="mt-6 flex flex-col items-center gap-3">
          <label className="inline-flex cursor-pointer items-center rounded-full border border-border bg-bg px-5 py-2.5 text-xs font-bold uppercase tracking-widest">
            <input type="file" accept=".json,application/json" className="hidden" onChange={onFile} disabled={fileBusy} />
            {fileBusy ? "Reading…" : "Import from file instead"}
          </label>
          <Button variant="secondary" onClick={() => router.push("/subjects")}>Back to library</Button>
        </div>
        {error !== "" && <p className="mt-3 text-xs font-bold uppercase tracking-widest text-danger">{error}</p>}
        <p className="mt-4 break-all text-[10px] text-muted-fg">{shared.reason}</p>
      </div>
    );

  if (!bundle)
    return (
      <div className="mx-auto max-w-lg p-12 text-center">
        <p className="text-xs uppercase tracking-widest text-muted-fg">READING SHARED DECK…</p>
      </div>
    );

  return (
    <div className="mx-auto max-w-xl p-8 lg:p-12">
      <p className="text-xs font-bold uppercase tracking-widest text-muted-fg">Shared deck</p>
      <h1 className="mt-1 text-3xl font-bold lg:text-5xl">{bundle.name}</h1>
      {bundle.description && <p className="mt-2 text-sm text-muted-fg">{bundle.description}</p>}
      <p className="mt-2 text-xs uppercase tracking-widest text-muted-fg">{bundle.cards.length} cards</p>
      <div className="mt-6 divide-y divide-border overflow-hidden rounded-2xl border border-border">
        {bundle.cards.slice(0, 5).map((c, i) => (
          <div key={i} className="bg-bg p-3">
            <p className="truncate text-sm font-bold">{c.front}</p>
            <p className="truncate text-xs text-muted-fg">{c.back}</p>
          </div>
        ))}
        {bundle.cards.length > 5 && (
          <p className="bg-bg p-3 text-xs uppercase tracking-widest text-muted-fg">+ {bundle.cards.length - 5} more</p>
        )}
      </div>
      {error !== "" && <p className="mt-3 text-xs font-bold uppercase tracking-widest text-danger">{error}</p>}
      <div className="mt-6 flex gap-2">
        <Button disabled={busy} onClick={doImport}>{busy ? "Importing…" : `Import ${bundle.cards.length} cards`}</Button>
        <Button variant="secondary" onClick={() => router.push("/subjects")}>Cancel</Button>
      </div>
      <div className="mt-8 border-t border-border pt-6">
        <p className="text-xs uppercase tracking-widest text-muted-fg">Or import a .studymax-bundle.json file instead</p>
        <label className="mt-3 inline-flex cursor-pointer items-center rounded-full border border-border bg-bg px-5 py-2.5 text-xs font-bold uppercase tracking-widest">
          <input type="file" accept=".json,application/json" className="hidden" onChange={onFile} disabled={fileBusy} />
          {fileBusy ? "Reading…" : "Choose file"}
        </label>
      </div>
    </div>
  );
}
