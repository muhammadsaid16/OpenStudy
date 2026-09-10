"use client";

import { useState } from "react";
import { Share2 } from "lucide-react";
import { Button, Modal } from "@/components/ui";
import { exportBundle } from "@/app/actions";
import { SHARE_URL_LIMIT, encodeShare, type SharedBundle } from "@/lib/share";

// SHARE button for the bundle cards page: copy a link (/share#…,
// works offline — the payload rides in the hash, no server) or download
// the same payload as a .studymax-bundle.json file for big decks.
export function ShareBundleButton({ bundleId, bundleName }: { bundleId: string; bundleName: string }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const [tooBig, setTooBig] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");

  async function payload(): Promise<SharedBundle> {
    const data = JSON.parse(await exportBundle(bundleId)) as {
      name: string; description?: string | null;
      cards: { front: string; back: string; description?: string | null; kind?: SharedBundle["cards"][number]["kind"]; choices?: string[] }[];
    };
    return {
      name: data.name,
      ...(data.description ? { description: data.description } : {}),
      cards: data.cards.map((c) => ({
        front: c.front,
        back: c.back,
        ...(c.description ? { description: c.description } : {}),
        ...(c.kind && c.kind !== "basic" ? { kind: c.kind } : {}),
        ...(c.choices?.length ? { choices: c.choices } : {}),
      })),
    };
  }

  async function makeLink() {
    setBusy(true); setError(""); setCopied(false);
    try {
      const p = await payload();
      if (!p.cards.length) {
        setError(`"${bundleName}" HAS NO CARDS YET — ADD CARDS BEFORE SHARING.`);
        return;
      }
      const hash = encodeShare(p);
      if (hash.length > SHARE_URL_LIMIT) {
        setTooBig(true); setLink(null);
      } else {
        setTooBig(false);
        setLink(window.location.origin + "/share#" + hash);
      }
    } catch { setError("COULD NOT BUILD SHARE LINK."); }
    finally { setBusy(false); }
  }

  async function download() {
    setBusy(true); setError("");
    try {
      const p = await payload();
      if (!p.cards.length) {
        setError(`"${bundleName}" HAS NO CARDS YET — ADD CARDS BEFORE SHARING.`);
        return;
      }
      const blob = new Blob([JSON.stringify({ app: "studymax-share", version: 1, ...p }, null, 2)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = bundleName.toLowerCase().replace(/[^a-z0-9]+/g, "-") + ".studymax-bundle.json";
      a.click();
      URL.revokeObjectURL(a.href);
    } catch { setError("COULD NOT BUILD SHARE FILE."); }
    finally { setBusy(false); }
  }

  async function copy() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch { setError("COPY FAILED — LONG-PRESS THE LINK INSTEAD."); }
  }

  return (
    <>
      <Button variant="secondary" onClick={() => { setOpen(true); setLink(null); setTooBig(false); setError(""); }}>
        <Share2 size={16} />
        SHARE
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Share bundle">
        <div className="space-y-3">
          <p className="text-xs uppercase tracking-widest text-muted-fg">
            Anyone with the link or file can import “{bundleName}” into their library.
          </p>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" disabled={busy} onClick={makeLink}>{busy ? "…" : "Copy link"}</Button>
            <Button variant="secondary" disabled={busy} onClick={download}>{busy ? "…" : "Save file"}</Button>
          </div>
          {link && (
            <button type="button" onClick={copy} className="w-full break-all rounded-xl border border-accent bg-accent/10 p-3 text-left text-xs">
              {link}
              <span className="mt-1 block font-bold uppercase tracking-widest">{copied ? "Copied ✓" : "Tap to copy"}</span>
            </button>
          )}
          {tooBig && <p className="text-xs uppercase tracking-widest text-warning">Too big for a link — use save file instead.</p>}
          {error !== "" && <p className="text-xs font-bold uppercase tracking-widest text-danger">{error}</p>}
        </div>
      </Modal>
    </>
  );
}
