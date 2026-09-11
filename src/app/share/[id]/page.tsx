"use client";

import { useT } from "@/lib/i18n";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { exportBundle } from "@/app/actions";

// Legacy direct link: /share/{bundleId} — sender's old link format.
// Export the bundle on the sender's device and redirect to hash form
// /share#<payload> where the real import UI lives. If the bundle is
// gone (or this is the receiver opening a stale id), show not-found.
// Uses the same utf-8-safe encoding as lib/share.ts so non-ascii survives.
function toHash(json: string): string {
  return btoa(unescape(encodeURIComponent(json)))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

export default function ShareBundlePage() {
  const t = useT();
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [status, setStatus] = useState<"loading" | "not_found">("loading");

  useEffect(() => {
    const bundleId = params.id;
    if (!bundleId) { setStatus("not_found"); return; }
    exportBundle(bundleId)
      .then((json) => {
        const hash = toHash(json);
        router.replace("/share#" + hash);
      })
      .catch(() => setStatus("not_found"));
  }, [params.id, router]);

  if (status === "not_found") {
    return (
      <div className="mx-auto max-w-lg p-12 text-center">
        <h1 className="text-2xl font-bold uppercase">{t("ui.bundle_not_found")}</h1>
        <p className="mt-2 text-xs uppercase tracking-widest text-muted-fg">THIS BUNDLE WAS DELETED OR THE LINK IS FROM ANOTHER DEVICE. ASK THE SENDER FOR THE LINK ENDING IN #… OR A .STUDYMAX-BUNDLE.JSON FILE.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg p-12 text-center">
      <p className="text-xs font-bold uppercase tracking-widest text-muted-fg">LOADING SHARED DECK…</p>
    </div>
  );
}
