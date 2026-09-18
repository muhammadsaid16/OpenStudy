"use client";

// ─── Devices panel (Study OS §19) ────────────────────────────────
// The UI half of the sync foundation. It deliberately offers exactly what is
// built — a file-based exchange between two installs — and says so out loud,
// rather than showing a "Sync now" button that has no transport behind it.
//
// What a user can actually do today, with no account and no server:
//   1. see which install this is (a name + id that never travels in a backup)
//   2. export one file of their complete state
//   3. merge that file on the other install, without replacing anything newer
//
// Full state rather than a delta: an incremental export needs a per-peer
// bookmark, which needs peer identity, which arrives with pairing. Until then a
// full export is the correct choice — it is idempotent, and it cannot drift out
// of sync the way a wrong bookmark can.

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, Download, Trash2, Upload } from "lucide-react";
import { Button, Input } from "@/components/ui";
import { useT } from "@/lib/i18n";
import { showToast } from "@/components/toast";
import {
  applySyncChanges,
  collectSyncChanges,
  getSyncStatus,
  pruneTombstones,
  type SyncStatus,
} from "@/lib/db";
import { decodeBundle, deviceIdentity, encodeBundle, setDeviceName } from "@/lib/sync";

/** Deletions older than this can be pruned — long enough that a peer which
 *  syncs monthly still learns about them. */
const PRUNE_AFTER_DAYS = 30;

export function SyncPanel() {
  const t = useT();
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [deviceName, setDeviceNameState] = useState("");
  const [busy, setBusy] = useState<null | "export" | "import" | "prune">(null);
  const [confirmPrune, setConfirmPrune] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // The name is read inside the async refresh rather than synchronously in the
  // effect: `deviceIdentity()` touches localStorage, which does not exist
  // during the server render, so reading it lazily avoids a hydration mismatch.
  // The `current ||` guard means a half-typed name is never overwritten by a
  // background refresh.
  const refresh = useCallback(
    () =>
      getSyncStatus()
        .then((next) => {
          setStatus(next);
          setDeviceNameState((current) => current || deviceIdentity().name);
        })
        .catch((e) => console.error("[sync] status failed", e)),
    []
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const saveDeviceName = () => {
    const next = setDeviceName(deviceName);
    setDeviceNameState(next.name);
    showToast(t("settings.sync.deviceSaved"));
    void refresh();
  };

  const handleExportBundle = async () => {
    setBusy("export");
    try {
      const payload = await collectSyncChanges(0);
      const blob = new Blob([encodeBundle(payload)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `openstudy-devices-${new Date().toISOString().split("T")[0]}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      showToast(t("settings.sync.exportDone"), "success");
    } catch (e) {
      console.error("[sync] export failed", e);
      showToast(t("settings.sync.exportFailed"), "danger");
    } finally {
      setBusy(null);
    }
  };

  const handleImportBundle = async (file: File) => {
    setBusy("import");
    try {
      const decoded = decodeBundle(await file.text());
      if (!decoded.ok || !decoded.payload) {
        showToast(t("settings.sync.notBundle"), "danger");
        return;
      }
      const own = deviceIdentity().id;
      if (decoded.payload.deviceId === own) {
        // Harmless (it would be a no-op merge), but worth saying: exporting and
        // re-importing the same file is a sign of a mixed-up pair of devices.
        showToast(t("settings.sync.sameDevice"), "warning");
        return;
      }
      const report = await applySyncChanges(decoded.payload);
      // The counts matter: "merged" that silently dropped every row is exactly
      // the failure this panel exists to make visible.
      const summary = t("settings.sync.importDone")
        .replace("{added}", String(report.inserted))
        .replace("{updated}", String(report.replaced))
        .replace("{removed}", String(report.deleted));
      if (report.errors.length > 0) {
        console.error("[sync] merge errors", report.errors);
        showToast(`${summary} · ${report.errors.length} ⚠`, "warning");
      } else {
        showToast(summary, "success");
      }
      if (report.keptOverTombstone > 0) {
        showToast(
          t("settings.sync.rescued").replace("{n}", String(report.keptOverTombstone)),
          "warning"
        );
      }
      await refresh();
    } catch (e) {
      console.error("[sync] import failed", e);
      showToast(t("settings.sync.importFailed"), "danger");
    } finally {
      setBusy(null);
    }
  };

  const runPrune = async () => {
    setBusy("prune");
    try {
      const cutoff = Date.now() - PRUNE_AFTER_DAYS * 24 * 60 * 60 * 1000;
      const removed = await pruneTombstones(cutoff);
      showToast(t("settings.sync.pruneDone").replace("{n}", String(removed)), "success");
      setConfirmPrune(false);
      await refresh();
    } catch (e) {
      console.error("[sync] prune failed", e);
      showToast(t("settings.sync.pruneFailed"), "danger");
    } finally {
      setBusy(null);
    }
  };

  const tables = status?.perTable ?? [];
  const topTables = [...tables].sort((a, b) => b.rows - a.rows).slice(0, 6);

  return (
    <section className="mt-12 max-w-2xl space-y-4">
      <h2 className="mb-1 text-lg font-bold tracking-tight text-fg">{t("settings.sync.title")}</h2>
      <p className="text-xs text-muted-fg">{t("settings.sync.subtitle")}</p>

      {/* This device */}
      <div className="rounded-2xl border border-border bg-bg p-5">
        <p className="text-sm font-bold tracking-tight text-fg">{t("settings.sync.thisDevice")}</p>
        <p className="mt-1 text-xs text-muted-fg">{t("settings.sync.thisDeviceHint")}</p>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <div className="min-w-[220px] flex-1">
            <Input
              label={t("settings.sync.deviceName")}
              value={deviceName}
              maxLength={40}
              onChange={(e) => setDeviceNameState(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") saveDeviceName();
              }}
            />
          </div>
          <Button size="sm" variant="secondary" onClick={saveDeviceName}>
            {t("common.save")}
          </Button>
        </div>
        {status && (
          <p className="mt-3 font-mono text-[11px] text-muted-fg">
            {t("settings.sync.deviceId")}: {status.deviceId}
          </p>
        )}
      </div>

      {/* What this install holds */}
      <div className="rounded-2xl border border-border bg-bg p-5">
        <p className="text-sm font-bold tracking-tight text-fg">{t("settings.sync.holds")}</p>
        <p className="mt-1 text-xs text-muted-fg">
          {t("settings.sync.holdsHint")
            .replace("{rows}", String(status?.rowCount ?? 0))
            .replace("{tables}", String(tables.length))}
        </p>
        {topTables.length > 0 && (
          <ul className="mt-3 space-y-1">
            {topTables.map((row) => (
              <li key={row.table} className="flex items-center justify-between text-xs">
                <span className="font-medium tracking-tight text-muted-fg">{row.table}</span>
                <span className="font-mono text-fg">{row.rows}</span>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-4 border-t border-border pt-4">
          <p className="text-xs text-muted-fg">
            {t("settings.sync.tombstones").replace("{n}", String(status?.tombstoneCount ?? 0))}
          </p>
          {!confirmPrune ? (
            <Button
              size="sm"
              variant="ghost"
              className="mt-2"
              disabled={!status || status.tombstoneCount === 0}
              onClick={() => setConfirmPrune(true)}
            >
              <Trash2 size={14} /> {t("settings.sync.prune")}
            </Button>
          ) : (
            <div role="alertdialog" aria-label={t("settings.sync.prune")} className="mt-2 border border-warning/40 bg-tertiary/10 p-3">
              <p className="flex items-start gap-2 text-xs text-muted-fg">
                <AlertTriangle size={14} className="mt-0.5 shrink-0 text-tertiary" />
                {t("settings.sync.pruneWarning").replace("{n}", String(PRUNE_AFTER_DAYS))}
              </p>
              <div className="mt-3 flex gap-2">
                <Button size="sm" variant="danger" loading={busy === "prune"} onClick={runPrune}>
                  <Trash2 size={14} /> {t("settings.sync.pruneConfirm")}
                </Button>
                <Button size="sm" variant="secondary" onClick={() => setConfirmPrune(false)}>
                  {t("common.cancel")}
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Exchange */}
      <div className="rounded-2xl border border-border bg-bg p-5">
        <p className="text-sm font-bold tracking-tight text-fg">{t("settings.sync.exchange")}</p>
        <p className="mt-1 text-xs text-muted-fg">{t("settings.sync.exchangeHint")}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button size="sm" loading={busy === "export"} onClick={handleExportBundle}>
            <Download size={14} /> {t("settings.sync.exportBundle")}
          </Button>
          <Button
            size="sm"
            variant="secondary"
            loading={busy === "import"}
            onClick={() => fileRef.current?.click()}
          >
            <Upload size={14} /> {t("settings.sync.mergeBundle")}
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept=".json,application/json"
            aria-label={t("settings.sync.mergeBundle")}
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleImportBundle(file);
              e.target.value = "";
            }}
          />
        </div>
        <p className="mt-3 text-[11px] text-muted-fg">{t("settings.sync.mediaNote")}</p>
      </div>

      <p className="text-[11px] text-muted-fg">{t("settings.sync.notYet")}</p>
    </section>
  );
}
