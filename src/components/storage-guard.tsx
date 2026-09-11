"use client";

import { useEffect, useState } from "react";
import { db } from "@/lib/db";
import { exportAllData, importAllData } from "@/app/actions";
import { useT } from "@/lib/i18n";

const AUTO_KEY = "studymax:autobackup";
const PROD_HOST = "openstudy-v1.vercel.app";

function isPreviewHost(host: string) {
  if (host === PROD_HOST) return false;
  if (host === "localhost" || host.startsWith("127.") || host.startsWith("192.")) return false;
  // any *.vercel.app that is not prod is a preview
  return host.endsWith(".vercel.app");
}

export function StorageGuard() {
  const t = useT();
  const [preview, setPreview] = useState(false);
  const [recoverable, setRecoverable] = useState(false);
  const [restoring, setRestoring] = useState(false);

  useEffect(() => {
    const host = window.location.hostname;
    setPreview(isPreviewHost(host));

    // Ask browser to keep storage (prevents eviction under pressure)
    try {
      if (navigator.storage?.persist) navigator.storage.persist().catch(() => {});
    } catch {}

    // If DB looks empty but an auto-backup exists (e.g. opened a preview URL),
    // offer one-click restore. Also runs on prod after accidental clear.
    let cancelled = false;
    (async () => {
      try {
        const raw = localStorage.getItem(AUTO_KEY);
        if (!raw) return;
        const [sCount, bCount] = await Promise.all([db.subjects.count(), db.bundles.count()]);
        if (!cancelled && sCount === 0 && bCount === 0) {
          // validate JSON before offering
          JSON.parse(raw);
          setRecoverable(true);
        }
      } catch {}
    })();
    return () => { cancelled = true; };
  }, []);

  // Debounced auto-backup: keep localStorage mirror of IndexedDB
  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | null = null;
    let last = "";
    const doBackup = async () => {
      try {
        const json = await exportAllData();
        if (json === last) return;
        last = json;
        // cap ~4MB to stay inside localStorage quota. If the real DB outgrew
        // the cap, DELETE the stale mirror — restoring an old snapshot (or
        // silently keeping one from before a big delete) is worse than none.
        if (json.length > 4_500_000) {
          localStorage.removeItem(AUTO_KEY);
          return;
        }
        localStorage.setItem(AUTO_KEY, json);
      } catch {}
    };
    // initial backup after hydration settles
    const init = setTimeout(doBackup, 2500);
    // re-backup on visibility change / before unload
    const onVis = () => { if (document.visibilityState === "hidden") doBackup(); };
    const onBefore = () => { try { /* sync fallback: cannot await, skip */ } catch {} };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("beforeunload", onBefore);
    // also watch for DB mutations via polling every 30s (cheap, export is local)
    const iv = setInterval(doBackup, 30_000);

    return () => {
      clearTimeout(init);
      if (t) clearTimeout(t);
      clearInterval(iv);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("beforeunload", onBefore);
    };
  }, []);

  const restore = async () => {
    const raw = localStorage.getItem(AUTO_KEY);
    if (!raw) return;
    setRestoring(true);
    try {
      await importAllData(raw);
      setRecoverable(false);
      window.location.reload();
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
      setRestoring(false);
    }
  };

  if (!preview && !recoverable) return null;

  return (
    <div className="sticky top-0 z-40">
      {preview && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-warning/30 bg-warning/15 px-4 py-3 text-sm backdrop-blur">
          <p className="font-medium text-fg">
            {t("guard.previewLink").replace("{host}", PROD_HOST)}
          </p>
          <a href={`https://${PROD_HOST}`} className="rounded-full bg-fg px-4 py-1.5 text-xs font-bold uppercase tracking-widest text-bg hover:opacity-90">
            {t("guard.openProd")}
          </a>
        </div>
      )}
      {recoverable && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-accent/25 bg-accent-soft/50 px-4 py-3 text-sm backdrop-blur">
          <p className="font-medium text-fg">{t("guard.foundBackup")}</p>
          <button onClick={restore} disabled={restoring} className="rounded-full bg-accent px-4 py-1.5 text-xs font-bold uppercase tracking-widest text-accent-fg disabled:opacity-50">
            {restoring ? t("guard.restoring") : t("guard.restoreBackup")}
          </button>
        </div>
      )}
    </div>
  );
}
