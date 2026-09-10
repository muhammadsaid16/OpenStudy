"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { createBundle, importCardsIntoBundle } from "@/app/actions";
import { decodeShare, parseSharedBundle, type SharedBundle } from "@/lib/share";

// Receiving end of a share link: /share#<payload>. Decodes the hash,
// previews the deck, and imports it as a new standalone bundle.
export default function SharePage() {
  const router = useRouter();
  // Decode once during initial render (client component, so `window` is
  // safe) — no mount effect, no cascading render.
  const [shared] = useState<{ bundle: SharedBundle } | { bad: true }>(() => {
    try {
      return { bundle: parseSharedBundle(decodeShare<unknown>(window.location.hash)) };
    } catch {
      return { bad: true as const };
    }
  });
  const bundle = "bundle" in shared ? shared.bundle : null;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function doImport() {
    if (!bundle) return;
    setBusy(true); setError("");
    try {
      const created = await createBundle({ name: bundle.name, description: bundle.description });
      await importCardsIntoBundle(created.id, bundle.cards.map((c) => ({
        front: c.front,
        back: c.back,
        description: c.description,
        tags: c.tags,
        kind: c.kind,
        choices: c.choices,
      })));
      router.push("/bundles/" + created.id + "/cards");
    } catch { setError("IMPORT FAILED — THE LINK MAY BE CORRUPT."); }
    finally { setBusy(false); }
  }

  if (!("bundle" in shared))
    return (
      <div className="mx-auto max-w-lg p-12 text-center">
        <h1 className="text-2xl font-bold uppercase">INVALID SHARE LINK</h1>
        <p className="mt-2 text-xs uppercase tracking-widest text-muted-fg">ASK THE SENDER FOR A FRESH LINK OR FILE.</p>
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
    </div>
  );
}
