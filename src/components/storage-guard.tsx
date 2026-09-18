"use client";

import { useCallback, useEffect, useState } from "react";
import { db } from "@/lib/db";
import { exportAllData, importAllData } from "@/app/actions";
import { useT } from "@/lib/i18n";
import {
  type RawDump,
  dismissEmptyBackupNotice,
  dismissResetNotice,
  listSnapshots,
  migrateLegacyLocalBackup,
  readEmptyBackupNotice,
  readResetNotice,
  restoreRawDump,
  saveSnapshot,
  snapshotFilename,
  snapshotHasContent,
} from "@/lib/safety-net";

const PROD_HOST = "openstudy-v1.vercel.app";

function isPreviewHost(host: string) {
  if (host === PROD_HOST) return false;
  if (host === "localhost" || host.startsWith("127.") || host.startsWith("192.")) return false;
  // any *.vercel.app that is not prod is a preview
  return host.endsWith(".vercel.app");
}

/** Where the mirror is written now — a separate database, not localStorage. */
async function writeRollingBackup(last: { json: string }) {
  try {
    const [sCount, bCount, cCount] = await Promise.all([
      db.subjects.count(),
      db.bundles.count(),
      db.flashcards.count(),
    ]);
    // Never overwrite or create auto-snapshots on a blank database (e.g. replica before sync)
    if (sCount === 0 && bCount === 0 && cCount === 0) return;

    const json = await exportAllData();
    if (json === last.json) return;
    // No size cap any more. The old localStorage mirror gave up above ~4.5MB,
    // which silently left heavy users with no backup at all.
    await saveSnapshot({ id: "latest", format: "v2", payload: json, reason: "auto" });
    last.json = json;
  } catch {
    /* never let a failed backup surface as an error to the user */
  }
}

export function StorageGuard() {
  const t = useT();
  const [preview, setPreview] = useState(false);
  const [emptyWithBackup, setEmptyWithBackup] = useState(false);
  const [resetAt, setResetAt] = useState<number | null>(null);
  const [copyCount, setCopyCount] = useState(0);
  const [restoring, setRestoring] = useState(false);

  // ── Detect the state we need to talk about: a database that was reset out
  // from under the user, or an empty one that still has a backup available.
  useEffect(() => {
    const host = window.location.hostname;
    setPreview(isPreviewHost(host));

    // Ask browser to keep storage (prevents eviction under pressure)
    try {
      if (navigator.storage?.persist) navigator.storage.persist().catch(() => {});
    } catch {}

    let cancelled = false;
    (async () => {
      try {
        // Move any pre-existing localStorage mirror into the safety database
        // before anything reads from it.
        await migrateLegacyLocalBackup();

        const snaps = await listSnapshots();
        const discardedReset = await readResetNotice();
        const dismissedEmptyBackup = await readEmptyBackupNotice();
        if (cancelled) return;

        setCopyCount(snaps.length);

        if (discardedReset && !discardedReset.dismissed) {
          // A reset destroyed the primary database. Say so loudly and offer the
          // copy that was taken before it happened.
          setResetAt(discardedReset.resetAt);
          return;
        }

        if (!dismissedEmptyBackup) {
          const [sCount, bCount] = await Promise.all([db.subjects.count(), db.bundles.count()]);
          if (!cancelled && sCount === 0 && bCount === 0) {
            const hasMeaningful = snaps.some(snapshotHasContent);
            setEmptyWithBackup(hasMeaningful);
          }
        }
      } catch {
        /* the banner is a nicety; never break the app to show it */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // ── Rolling mirror of IndexedDB into the safety database.
  useEffect(() => {
    const last = { json: "" };
    const doBackup = () => writeRollingBackup(last);

    // initial backup after hydration settles
    const init = setTimeout(doBackup, 2500);
    // re-backup whenever the tab is going away. visibilitychange + pagehide are
    // the reliable pair — the previous `beforeunload` handler was an empty
    // function, so everything since the last poll was simply lost on close.
    const onVis = () => {
      if (document.visibilityState === "hidden") doBackup();
    };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("pagehide", doBackup);
    // steady-state poll: cheap, and the export is entirely local
    const iv = setInterval(doBackup, 30_000);

    return () => {
      clearTimeout(init);
      clearInterval(iv);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("pagehide", doBackup);
    };
  }, []);

  // ── Restore from whichever copy is most complete.
  const restore = useCallback(async () => {
    setRestoring(true);
    try {
      const snaps = await listSnapshots();
      const raw = snaps.find((s) => s.format === "raw");
      const logical = snaps.find((s) => s.format === "v2");

      // The raw dump is the most recent data (taken at reset time) even though
      // it bypasses this build's schema, so it goes first.
      if (raw) {
        const payload = raw.payload as RawDump;
        const { restored, skipped } = await restoreRawDump(db, payload);
        if (skipped.length) console.warn("[StorageGuard] tables skipped:", skipped);
        if (restored > 0) {
          await dismissResetNotice();
          window.location.reload();
          return;
        }
      }

      if (logical) {
        await importAllData(logical.payload as string);
        await dismissResetNotice();
        window.location.reload();
        return;
      }

      alert(t("guard.nothingToRestore"));
      setRestoring(false);
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
      setRestoring(false);
    }
  }, [t]);

  // ── Let the user get the data out by hand, whatever else they choose.
  const download = useCallback(async () => {
    const snaps = await listSnapshots();
    const snapshot = snaps[0];
    if (!snapshot) return;
    const body =
      typeof snapshot.payload === "string"
        ? snapshot.payload
        : JSON.stringify(snapshot.payload, null, 2);
    const url = URL.createObjectURL(new Blob([body], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = snapshotFilename(snapshot);
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  const dismiss = useCallback(async () => {
    await dismissResetNotice();
    setResetAt(null);
  }, []);

  const dismissBackup = useCallback(async () => {
    await dismissEmptyBackupNotice();
    setEmptyWithBackup(false);
  }, []);

  if (!preview && resetAt === null && !emptyWithBackup) return null;

  return (
    <div className="sticky top-0 z-40">
      {preview && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-warning/30 bg-tertiary/15 px-4 py-3 text-sm backdrop-blur">
          <p className="font-medium text-fg">
            {t("guard.previewLink").replace("{host}", PROD_HOST)}
          </p>
          <a href={`https://${PROD_HOST}`} className="rounded-full bg-fg px-4 py-1.5 text-xs font-bold uppercase tracking-widest text-bg hover:opacity-90">
            {t("guard.openProd")}
          </a>
        </div>
      )}

      {resetAt !== null && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-warning/40 bg-tertiary/20 px-4 py-3 text-sm backdrop-blur">
          <div className="space-y-0.5">
            <p className="font-bold text-fg">{t("guard.resetTitle")}</p>
            <p className="text-muted-fg">
              {copyCount > 0 ? t("guard.resetCopySaved") : t("guard.resetNoCopy")}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {copyCount > 0 && (
              <>
                <button onClick={download} className="rounded-full border border-border bg-bg px-4 py-1.5 text-xs font-bold uppercase tracking-widest text-fg hover:border-primary">
                  {t("guard.downloadCopy")}
                </button>
                <button onClick={restore} disabled={restoring} className="rounded-full bg-primary-container px-4 py-1.5 text-xs font-bold uppercase tracking-widest text-on-primary-container disabled:opacity-50">
                  {restoring ? t("guard.restoring") : t("guard.restoreOld")}
                </button>
              </>
            )}
            <button onClick={dismiss} className="rounded-full px-3 py-1.5 text-xs font-bold uppercase tracking-widest text-muted-fg hover:text-fg">
              {t("guard.dismiss")}
            </button>
          </div>
        </div>
      )}

      {resetAt === null && emptyWithBackup && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-primary/25 bg-primary-container/15/50 px-4 py-3 text-sm backdrop-blur">
          <p className="font-medium text-fg">{t("guard.foundBackup")}</p>
          <div className="flex items-center gap-2">
            <button onClick={download} className="rounded-full border border-border bg-bg px-4 py-1.5 text-xs font-bold uppercase tracking-widest text-fg hover:border-primary">
              {t("guard.downloadCopy")}
            </button>
            <button onClick={restore} disabled={restoring} className="rounded-full bg-primary-container px-4 py-1.5 text-xs font-bold uppercase tracking-widest text-on-primary-container disabled:opacity-50">
              {restoring ? t("guard.restoring") : t("guard.restoreBackup")}
            </button>
            <button onClick={dismissBackup} className="rounded-full px-3 py-1.5 text-xs font-bold uppercase tracking-widest text-muted-fg hover:text-fg">
              {t("guard.dismiss")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
