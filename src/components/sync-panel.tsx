"use client";

// ─── Automatic Local-Network Sync Panel (Study OS §19) ───────────
// Core mental model:
//   - ONE user, multiple devices.
//   - ONE Main Device (Sync Authority).
//   - Secondary Devices (Replicas) create/edit/delete locally.
//   - Automatic synchronization over the same local network (Wi-Fi / LAN).
//   - Pairing happens ONCE.
//   - Manual export/import is strictly demoted to emergency backup/recovery.

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Wifi,
  WifiOff,
  Laptop,
  Tablet,
  Smartphone,
  RefreshCw,
  CheckCircle2,
  ShieldCheck,
  Key,
  ChevronDown,
  ChevronUp,
  Download,
  Upload,
  Trash2,
  AlertTriangle,
  Copy,
  Check,
  Plus,
} from "lucide-react";
import { Button, Input, Modal } from "@/components/ui";
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
import {
  getDeviceRole,
  setDeviceRole,
  getPairedDevices,
  addPairedDevice,
  removePairedDevice,
  generatePairingCode,
  getPairingCode,
  pairWithMainDevice,
  executeLanSync,
  startAutoSyncLoop,
  type DeviceRole,
  type DeviceSyncState,
  type PairedDevice,
} from "@/lib/sync-lan";

const PRUNE_AFTER_DAYS = 30;

function formatRelativeSyncTime(timestamp: number): string {
  if (!timestamp) return "Never";
  const diffSec = Math.max(0, Math.round((Date.now() - timestamp) / 1000));
  if (diffSec < 30) return "Just now";
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffHours = Math.round(diffMin / 60);
  if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? "s" : ""} ago`;
  const diffDays = Math.round(diffHours / 24);
  return `${diffDays} day${diffDays > 1 ? "s" : ""} ago`;
}

export function SyncPanel() {
  const t = useT();
  const [role, setRoleState] = useState<DeviceRole>("main");
  const [syncState, setSyncState] = useState<DeviceSyncState>("synced");
  const [isOnline, setIsOnline] = useState(true);
  const [pairedDevices, setPairedDevices] = useState<PairedDevice[]>([]);
  const [deviceName, setDeviceNameState] = useState("");
  const [pairingOpen, setPairingOpen] = useState(false);
  const [pairingCodeInput, setPairingCodeInput] = useState("");
  const [pairingHostInput, setPairingHostInput] = useState("");
  const [currentPairingCode, setCurrentPairingCode] = useState("");
  const [copiedCode, setCopiedCode] = useState(false);
  const [isSyncingManual, setIsSyncingManual] = useState(false);
  const [showBackupSection, setShowBackupSection] = useState(false);

  // Backup & emergency export state
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [busy, setBusy] = useState<null | "export" | "import" | "prune">(null);
  const [confirmPrune, setConfirmPrune] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const refreshData = useCallback(() => {
    setRoleState(getDeviceRole());
    setPairedDevices(getPairedDevices());
    setDeviceNameState(deviceIdentity().name);
    setCurrentPairingCode(getPairingCode());
    getSyncStatus().then(setStatus).catch(() => {});
  }, []);

  useEffect(() => {
    refreshData();
    setIsOnline(typeof navigator !== "undefined" ? navigator.onLine : true);

    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);

    // Start automatic background sync loop
    const stopSync = startAutoSyncLoop((state) => {
      setSyncState(state);
      setPairedDevices(getPairedDevices());
    });

    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      stopSync();
    };
  }, [refreshData]);

  const handleToggleRole = () => {
    const next: DeviceRole = role === "main" ? "replica" : "main";
    setDeviceRole(next);
    setRoleState(next);
    showToast(
      next === "main"
        ? "Designated as Main Device (Sync Authority)"
        : "Switched to Secondary Device (Replica)"
    );
    refreshData();
  };

  const handleSyncNow = async () => {
    setIsSyncingManual(true);
    setSyncState("syncing");
    try {
      const res = await executeLanSync();
      if (res.success) {
        showToast("Synchronized with local network", "success");
        setSyncState("synced");
      } else {
        showToast("Local network sync unavailable", "warning");
        setSyncState("offline");
      }
    } catch {
      showToast("Sync error", "danger");
      setSyncState("error");
    } finally {
      setIsSyncingManual(false);
      refreshData();
    }
  };

  const handleCopyPairingCode = () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(currentPairingCode);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
      showToast("Pairing code copied to clipboard", "success");
    }
  };

  const handleNewPairingCode = () => {
    const code = generatePairingCode();
    setCurrentPairingCode(code);
  };

  const handleConnectPair = async () => {
    if (!pairingCodeInput || pairingCodeInput.length < 6) {
      showToast("Please enter a valid 6-digit code", "warning");
      return;
    }
    const res = await pairWithMainDevice(pairingCodeInput, pairingHostInput);
    if (res.ok) {
      showToast("Device successfully paired with Main Device!", "success");
      setPairingOpen(false);
      setPairingCodeInput("");
      refreshData();
      void handleSyncNow();
    } else {
      showToast(res.error || "Pairing failed", "danger");
    }
  };

  const handleSaveDeviceName = () => {
    const updated = setDeviceName(deviceName);
    setDeviceNameState(updated.name);
    showToast("Device name updated");
    refreshData();
  };

  // Emergency file export/import
  const handleExportBundle = async () => {
    setBusy("export");
    try {
      const payload = await collectSyncChanges(0);
      const blob = new Blob([encodeBundle(payload)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `openstudy-emergency-backup-${new Date().toISOString().split("T")[0]}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      showToast("Emergency backup exported", "success");
    } catch {
      showToast("Export failed", "danger");
    } finally {
      setBusy(null);
    }
  };

  const handleImportBundle = async (file: File) => {
    setBusy("import");
    try {
      const decoded = decodeBundle(await file.text());
      if (!decoded.ok || !decoded.payload) {
        showToast("Invalid backup file", "danger");
        return;
      }
      const report = await applySyncChanges(decoded.payload);
      showToast(`Restored: ${report.inserted} added, ${report.replaced} updated`, "success");
      refreshData();
    } catch {
      showToast("Import failed", "danger");
    } finally {
      setBusy(null);
    }
  };

  const runPrune = async () => {
    setBusy("prune");
    try {
      const cutoff = Date.now() - PRUNE_AFTER_DAYS * 24 * 60 * 60 * 1000;
      const removed = await pruneTombstones(cutoff);
      showToast(`Pruned ${removed} old deletion records`, "success");
      setConfirmPrune(false);
      refreshData();
    } catch {
      showToast("Prune failed", "danger");
    } finally {
      setBusy(null);
    }
  };

  const mainDevice = pairedDevices.find((d) => d.role === "main") ?? (role === "main" ? { name: deviceName || "This Device" } : null);

  return (
    <section className="mt-12 max-w-3xl space-y-6">
      <div>
        <h2 className="text-xl font-bold tracking-tight text-fg">SYNC</h2>
        <p className="mt-1 text-xs text-muted-fg">
          Automatic local-network synchronization across all your devices. No cloud account or external internet required.
        </p>
      </div>

      {/* Main Status & Authority Card */}
      <div className="rounded-2xl border border-border bg-card/60 p-6 shadow-sm">
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
          {/* Main Device */}
          <div className="space-y-1">
            <p className="text-[11px] font-bold uppercase tracking-wider text-muted-fg">
              Main Device
            </p>
            <p className="text-base font-bold text-fg">
              {mainDevice?.name || "Laptop"}
            </p>
            <span className="inline-flex items-center gap-1 rounded-md bg-primary-container/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary">
              <ShieldCheck size={12} />
              {role === "main" ? "This Device (Authority)" : "Sync Authority"}
            </span>
          </div>

          {/* Sync Status */}
          <div className="space-y-1">
            <p className="text-[11px] font-bold uppercase tracking-wider text-muted-fg">
              Status
            </p>
            <div className="flex items-center gap-2">
              <span
                className={`h-2.5 w-2.5 rounded-full ${
                  syncState === "synced"
                    ? "bg-secondary animate-pulse"
                    : syncState === "syncing"
                    ? "bg-flow animate-spin"
                    : "bg-muted-fg/40"
                }`}
              />
              <span className="text-sm font-semibold capitalize text-fg">
                {syncState === "synced"
                  ? "● Synced"
                  : syncState === "syncing"
                  ? "● Syncing..."
                  : "○ Offline"}
              </span>
            </div>
            <p className="text-[11px] text-muted-fg">
              {syncState === "synced" ? "All local data up to date" : "Waiting for local network"}
            </p>
          </div>

          {/* Local Network */}
          <div className="space-y-1">
            <p className="text-[11px] font-bold uppercase tracking-wider text-muted-fg">
              Local Network
            </p>
            <div className="flex items-center gap-2">
              {isOnline ? (
                <>
                  <Wifi size={15} className="text-secondary" />
                  <span className="text-sm font-semibold text-fg">● Connected</span>
                </>
              ) : (
                <>
                  <WifiOff size={15} className="text-muted-fg" />
                  <span className="text-sm font-semibold text-muted-fg">○ Disconnected</span>
                </>
              )}
            </div>
            <p className="text-[11px] text-muted-fg">
              Wi-Fi / LAN active
            </p>
          </div>
        </div>

        <div className="mt-5 rounded-xl border border-primary/20 bg-primary-container/10 px-4 py-3">
          <p className="text-xs text-fg/90">
            <strong>Automatic synchronization</strong> is active whenever your devices are on the same local network.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-border/80 pt-5">
          <Button
            size="sm"
            variant="primary"
            onClick={() => setPairingOpen(true)}
            className="gap-2 font-semibold"
          >
            <Plus size={15} />
            Pair New Device
          </Button>

          <Button
            size="sm"
            variant="secondary"
            onClick={handleToggleRole}
            className="gap-2"
          >
            <ShieldCheck size={14} />
            {role === "main" ? "Designate as Secondary" : "Set as Main Device"}
          </Button>

          <Button
            size="sm"
            variant="secondary"
            loading={isSyncingManual}
            onClick={handleSyncNow}
            className="gap-2"
          >
            <RefreshCw size={14} className={isSyncingManual ? "animate-spin" : ""} />
            Sync Now
          </Button>
        </div>
      </div>

      {/* Connected Devices List */}
      <div className="rounded-2xl border border-border bg-card/60 p-6 shadow-sm">
        <div className="flex items-center justify-between border-b border-border/80 pb-4">
          <div>
            <h3 className="text-sm font-bold uppercase tracking-wider text-fg">
              Connected Devices
            </h3>
            <p className="mt-0.5 text-xs text-muted-fg">
              Paired devices that automatically synchronize over the local network.
            </p>
          </div>
          <span className="rounded-full bg-surface px-2.5 py-1 text-xs font-mono font-medium text-muted-fg border border-border">
            {pairedDevices.length} paired
          </span>
        </div>

        <div className="mt-4 divide-y divide-border/60">
          {pairedDevices.map((device) => {
            const isCurrentDevice = device.id === deviceIdentity().id;
            return (
              <div
                key={device.id}
                className="flex items-center justify-between py-3.5 first:pt-1 last:pb-1"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-surface text-muted-fg border border-border/70">
                    {device.name.toLowerCase().includes("phone") ? (
                      <Smartphone size={17} />
                    ) : device.name.toLowerCase().includes("tablet") || device.name.toLowerCase().includes("pad") ? (
                      <Tablet size={17} />
                    ) : (
                      <Laptop size={17} />
                    )}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm text-fg">
                        {device.name}
                      </span>
                      {isCurrentDevice && (
                        <span className="rounded-md bg-secondary/15 px-1.5 py-0.5 text-[10px] font-bold text-secondary">
                          This Device
                        </span>
                      )}
                      {device.role === "main" && (
                        <span className="rounded-md bg-primary-container/20 px-1.5 py-0.5 text-[10px] font-bold text-primary">
                          Main Authority
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-fg">
                      Last sync: {formatRelativeSyncTime(device.lastSyncAt)}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <span className="inline-flex items-center gap-1.5 text-xs font-medium text-secondary">
                    <span className="h-2 w-2 rounded-full bg-secondary" />
                    Synced
                  </span>
                  {!isCurrentDevice && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 w-8 p-0 text-muted-fg hover:text-error"
                      onClick={() => {
                        removePairedDevice(device.id);
                        refreshData();
                        showToast(`Unpaired ${device.name}`);
                      }}
                    >
                      <Trash2 size={14} />
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Device Name Setting */}
        <div className="mt-6 flex flex-wrap items-end gap-3 border-t border-border/80 pt-4">
          <div className="min-w-[240px] flex-1">
            <Input
              label="This Device Name"
              value={deviceName}
              maxLength={40}
              onChange={(e) => setDeviceNameState(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSaveDeviceName();
              }}
            />
          </div>
          <Button size="sm" variant="secondary" onClick={handleSaveDeviceName}>
            Save Name
          </Button>
        </div>
      </div>

      {/* Pairing Modal */}
      {pairingOpen && (
        <Modal
          open={pairingOpen}
          title={role === "main" ? "Pair a Secondary Device" : "Connect to Main Device"}
          onClose={() => setPairingOpen(false)}
        >
          {role === "main" ? (
            <div className="space-y-4">
              <p className="text-xs text-muted-fg">
                Open OpenStudy on your phone, tablet, or secondary laptop connected to the same Wi-Fi network. Enter this 6-digit pairing code once:
              </p>

              <div className="flex items-center justify-center gap-3 rounded-2xl border border-primary/40 bg-primary-container/15 py-6">
                <span className="font-mono text-3xl font-extrabold tracking-[0.3em] text-primary">
                  {currentPairingCode.slice(0, 3)} {currentPairingCode.slice(3)}
                </span>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={handleCopyPairingCode}
                  className="h-9 px-3"
                >
                  {copiedCode ? <Check size={15} /> : <Copy size={15} />}
                </Button>
              </div>

              <div className="rounded-xl border border-border bg-surface p-3 text-xs text-muted-fg space-y-1">
                <p className="font-semibold text-fg">Local Network Tip:</p>
                <p>Ensure both devices are connected to the same local Wi-Fi router. Pairing only needs to be completed once.</p>
              </div>

              <div className="flex justify-between items-center pt-2">
                <Button size="sm" variant="ghost" onClick={handleNewPairingCode}>
                  Generate New Code
                </Button>
                <Button size="sm" variant="secondary" onClick={() => setPairingOpen(false)}>
                  Done
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-xs text-muted-fg">
                Enter the 6-digit pairing code displayed in <strong>Settings &gt; Sync</strong> on your Main Device (e.g. Laptop):
              </p>

              <Input
                label="6-Digit Pairing Code"
                value={pairingCodeInput}
                maxLength={6}
                placeholder="e.g. 742918"
                onChange={(e) => setPairingCodeInput(e.target.value.replace(/\D/g, ""))}
              />

              <Input
                label="Main Device LAN Address (Optional)"
                value={pairingHostInput}
                placeholder="e.g. http://192.168.1.50:3000"
                onChange={(e) => setPairingHostInput(e.target.value)}
              />

              <div className="flex justify-end gap-2 pt-3">
                <Button size="sm" variant="secondary" onClick={() => setPairingOpen(false)}>
                  Cancel
                </Button>
                <Button size="sm" variant="primary" onClick={handleConnectPair}>
                  Pair &amp; Synchronize
                </Button>
              </div>
            </div>
          )}
        </Modal>
      )}

      {/* Demoted: Manual Backup & Emergency Recovery Drawer */}
      <div className="rounded-2xl border border-border/80 bg-card/30 p-5">
        <button
          type="button"
          onClick={() => setShowBackupSection(!showBackupSection)}
          className="flex w-full items-center justify-between text-start"
        >
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-muted-fg">
              Manual Backup &amp; Emergency Data Transfer
            </h4>
            <p className="text-[11px] text-muted-fg/80">
              Only required for air-gapped device recovery or moving data without a local network.
            </p>
          </div>
          {showBackupSection ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>

        {showBackupSection && (
          <div className="mt-4 space-y-4 border-t border-border/60 pt-4">
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" loading={busy === "export"} onClick={handleExportBundle}>
                <Download size={14} /> Export Backup File
              </Button>
              <Button
                size="sm"
                variant="secondary"
                loading={busy === "import"}
                onClick={() => fileRef.current?.click()}
              >
                <Upload size={14} /> Restore from File
              </Button>
              <input
                ref={fileRef}
                type="file"
                accept=".json,application/json"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void handleImportBundle(file);
                  e.target.value = "";
                }}
              />
            </div>

            {status && (
              <div className="flex items-center justify-between pt-2 text-xs text-muted-fg">
                <span>
                  {status.rowCount} total records · {status.tombstoneCount} tombstones
                </span>
                {!confirmPrune ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={status.tombstoneCount === 0}
                    onClick={() => setConfirmPrune(true)}
                  >
                    <Trash2 size={13} /> Prune Deletions
                  </Button>
                ) : (
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="danger" loading={busy === "prune"} onClick={runPrune}>
                      Confirm Prune
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => setConfirmPrune(false)}>
                      Cancel
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

