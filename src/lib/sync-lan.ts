"use client";

// ─── Automatic Local-Network Device Synchronization (Study OS) ───
// Core Model:
//   - ONE user with multiple devices.
//   - Main Device (Sync Authority) is the anchor of truth.
//   - Secondary Devices (Replicas) create, edit, delete locally and sync
//     automatically over the same local network (Wi-Fi / LAN).
//   - Uses durable tombstones, deterministic last-write-wins (lib/sync.ts),
//     BroadcastChannel for instant local-first sync, and /api/sync/exchange for LAN.

import {
  applySyncChanges,
  collectSyncChanges,
  db,
  type SyncStatus,
} from "@/lib/db";
import { deviceIdentity, type SyncPayload } from "@/lib/sync";

export type DeviceRole = "main" | "replica";
export type DeviceSyncState = "synced" | "syncing" | "offline" | "error";

export interface PairedDevice {
  id: string;
  name: string;
  role: DeviceRole;
  pairedAt: number;
  lastSyncAt: number;
  status: "synced" | "syncing" | "offline";
  ipAddress?: string | null;
}

const ROLE_KEY = "openstudy_device_role";
const PAIRED_DEVICES_KEY = "openstudy_paired_devices";
const PAIRING_CODE_KEY = "openstudy_pairing_code";
const LAST_SYNC_KEY = "openstudy_last_lan_sync";
const SYNC_HOST_KEY = "openstudy_sync_host";
const CHANNEL_NAME = "openstudy_lan_sync_channel";

// ─── Target Host & Endpoints ─────────────────────────────────────

export function getSyncHost(): string {
  if (typeof localStorage === "undefined") return "";
  return localStorage.getItem(SYNC_HOST_KEY) || "";
}

export function setSyncHost(host: string): void {
  if (typeof localStorage === "undefined") return;
  if (!host) {
    localStorage.removeItem(SYNC_HOST_KEY);
    return;
  }
  const clean = host.trim().replace(/\/+$/, "");
  localStorage.setItem(SYNC_HOST_KEY, clean);
}

export function resolveEndpoint(endpointPath: string): string {
  const host = getSyncHost();
  if (!host) return endpointPath;
  return `${host}${endpointPath.startsWith("/") ? "" : "/"}${endpointPath}`;
}

// ─── Role & Identity ─────────────────────────────────────────────

export function getDeviceRole(): DeviceRole {
  if (typeof localStorage === "undefined") return "main";
  const stored = localStorage.getItem(ROLE_KEY);
  if (stored === "replica") return "replica";
  return "main"; // Defaults to Main Device / Sync Authority
}

export function setDeviceRole(role: DeviceRole): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(ROLE_KEY, role);
  if (role === "main") {
    setSyncHost("");
    void registerAuthorityWithServer();
    void executeLanSync(0);
  }
  notifyChannel({ type: "ROLE_CHANGED", role, deviceId: deviceIdentity().id });
}

export function getLastSyncTimestamp(): number {
  if (typeof localStorage === "undefined") return 0;
  const val = localStorage.getItem(LAST_SYNC_KEY);
  return val ? parseInt(val, 10) : 0;
}

export function setLastSyncTimestamp(ts: number): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(LAST_SYNC_KEY, String(ts));
}

// ─── Paired Devices Registry ─────────────────────────────────────

export function getPairedDevices(): PairedDevice[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(PAIRED_DEVICES_KEY);
    if (!raw) {
      // Seed default entry for self
      const self = deviceIdentity();
      const role = getDeviceRole();
      return [
        {
          id: self.id,
          name: self.name,
          role,
          pairedAt: self.createdAt,
          lastSyncAt: Date.now(),
          status: "synced",
        },
      ];
    }
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export function savePairedDevices(devices: PairedDevice[]): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(PAIRED_DEVICES_KEY, JSON.stringify(devices));
  } catch {
    /* ignore */
  }
}

export function addPairedDevice(device: PairedDevice): void {
  const current = getPairedDevices().filter((d) => d.id !== device.id);
  current.push(device);
  savePairedDevices(current);
}

export function removePairedDevice(id: string): void {
  const current = getPairedDevices().filter((d) => d.id !== id);
  savePairedDevices(current);
}

export function updatePairedDevice(id: string, patch: Partial<PairedDevice>): void {
  const current = getPairedDevices().map((d) => (d.id === id ? { ...d, ...patch } : d));
  savePairedDevices(current);
}

// ─── Pairing Protocol & Authority Registration ───────────────────

export function generatePairingCode(): string {
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  if (typeof localStorage !== "undefined") {
    localStorage.setItem(PAIRING_CODE_KEY, code);
  }
  void registerAuthorityWithServer(code);
  return code;
}

export function getPairingCode(): string {
  if (typeof localStorage === "undefined") return "742918";
  let code = localStorage.getItem(PAIRING_CODE_KEY);
  if (!code) {
    code = generatePairingCode();
  }
  return code;
}

export async function registerAuthorityWithServer(customCode?: string): Promise<boolean> {
  if (getDeviceRole() !== "main") return false;
  try {
    const self = deviceIdentity();
    const code = customCode || getPairingCode();
    const endpoint = resolveEndpoint("/api/sync/exchange");
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "register-authority",
        deviceId: self.id,
        deviceName: self.name,
        pairingCode: code,
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function pairWithMainDevice(
  code: string,
  targetHost?: string
): Promise<{ ok: boolean; error?: string }> {
  const cleanCode = code.trim().replace(/\s+/g, "");
  if (cleanCode.length !== 6) {
    return { ok: false, error: "Pairing code must be 6 digits." };
  }

  const host = targetHost?.trim().replace(/\/+$/, "") || getSyncHost();
  const endpoint = host ? `${host}/api/sync/exchange` : "/api/sync/exchange";

  try {
    const self = deviceIdentity();
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "pair",
        deviceId: self.id,
        deviceName: self.name,
        role: "replica",
        pairingCode: cleanCode,
      }),
    });

    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      return { ok: false, error: errJson.error || "Pairing rejected by Main Device." };
    }

    const data = await res.json();
    if (host) {
      setSyncHost(host);
    }
    setDeviceRole("replica");

    // Record Main Device
    addPairedDevice({
      id: data.mainDeviceId || "main-authority",
      name: data.mainDeviceName || "Laptop — Main Device",
      role: "main",
      pairedAt: Date.now(),
      lastSyncAt: Date.now(),
      status: "synced",
      ipAddress: host || null,
    });

    // Request initial full sync from authority immediately
    setLastSyncTimestamp(0);
    await executeLanSync(0);

    // Also notify same-browser peers
    notifyChannel({ type: "REQUEST_FULL_SYNC", deviceId: self.id });

    return { ok: true };
  } catch {
    return {
      ok: false,
      error: `Could not reach Main Device at ${endpoint}. Check that the address is correct and both devices are on the same Wi-Fi.`,
    };
  }
}

// ─── Realtime BroadcastChannel (Sub-100ms local tab/window sync) ───

let broadcastChannel: BroadcastChannel | null = null;

function getBroadcastChannel(): BroadcastChannel | null {
  if (typeof window === "undefined" || !("BroadcastChannel" in window)) return null;
  if (!broadcastChannel) {
    broadcastChannel = new BroadcastChannel(CHANNEL_NAME);
    broadcastChannel.onmessage = (event) => {
      const data = event.data;
      if (!data || data.deviceId === deviceIdentity().id) return;

      if (data.type === "PAYLOAD_BROADCAST" && data.payload) {
        // Incorporate remote changes immediately
        void applySyncChanges(data.payload).then(() => {
          setLastSyncTimestamp(Date.now());
        });
      } else if (data.type === "DATA_UPDATED") {
        // Peer updated, trigger sync
        void executeLanSync();
      } else if (data.type === "REQUEST_FULL_SYNC") {
        // A replica requested full data from this main authority
        if (getDeviceRole() === "main") {
          void collectSyncChanges(0).then((payload) => {
            notifyChannel({
              type: "PAYLOAD_BROADCAST",
              deviceId: deviceIdentity().id,
              payload,
            });
          });
        }
      }
    };
  }
  return broadcastChannel;
}

function notifyChannel(msg: Record<string, unknown>): void {
  try {
    const ch = getBroadcastChannel();
    ch?.postMessage(msg);
  } catch {
    /* ignore */
  }
}

// ─── LAN Synchronization Execution ───────────────────────────────

let isSyncing = false;

export async function executeLanSync(forceSince?: number): Promise<{
  success: boolean;
  inserted: number;
  replaced: number;
  deleted: number;
  error?: string;
}> {
  if (isSyncing) {
    return { success: true, inserted: 0, replaced: 0, deleted: 0 };
  }

  isSyncing = true;
  const self = deviceIdentity();
  const since = typeof forceSince === "number" ? forceSince : getLastSyncTimestamp();

  try {
    // 1. Ensure authority is registered if role is main
    if (getDeviceRole() === "main" && since === 0) {
      void registerAuthorityWithServer();
    }

    // 2. Collect local changes since bookmark
    const payload = await collectSyncChanges(since);

    // 3. Broadcast to any open windows/tabs on the local machine
    notifyChannel({
      type: "PAYLOAD_BROADCAST",
      deviceId: self.id,
      payload,
    });

    // 4. Send delta to LAN exchange endpoint
    let remotePayload: SyncPayload | null = null;
    const endpoint = resolveEndpoint("/api/sync/exchange");

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "sync",
          deviceId: self.id,
          deviceName: self.name,
          role: getDeviceRole(),
          since,
          payload,
        }),
      });

      if (res.ok) {
        const json = await res.json();
        if (json.payload) {
          remotePayload = json.payload;
        }
      }
    } catch {
      // Offline or LAN endpoint not reachable; BroadcastChannel covers local tabs
    }

    let report = { inserted: 0, replaced: 0, deleted: 0 };
    if (remotePayload) {
      const mergeReport = await applySyncChanges(remotePayload);
      report = {
        inserted: mergeReport.inserted,
        replaced: mergeReport.replaced,
        deleted: mergeReport.deleted,
      };
    }

    const now = Date.now();
    setLastSyncTimestamp(now);

    // Update all paired devices' last sync time
    const updated = getPairedDevices().map((d) => ({
      ...d,
      lastSyncAt: now,
      status: "synced" as const,
    }));
    savePairedDevices(updated);

    return {
      success: true,
      ...report,
    };
  } catch (err) {
    return {
      success: false,
      inserted: 0,
      replaced: 0,
      deleted: 0,
      error: String(err),
    };
  } finally {
    isSyncing = false;
  }
}

// ─── Automatic Sync Loop ─────────────────────────────────────────

export function startAutoSyncLoop(
  onStateChange?: (state: DeviceSyncState) => void
): () => void {
  if (typeof window === "undefined") return () => {};

  // Setup broadcast channel
  getBroadcastChannel();

  // If Main Device, register authority on startup
  if (getDeviceRole() === "main") {
    void registerAuthorityWithServer();
  }

  const sync = async () => {
    if (!navigator.onLine) {
      onStateChange?.("offline");
      return;
    }
    onStateChange?.("syncing");
    const res = await executeLanSync();
    if (res.success) {
      onStateChange?.("synced");
    } else {
      onStateChange?.("error");
    }
  };

  // 1. Periodic background interval (every 20 seconds)
  const interval = setInterval(sync, 20000);

  // 2. Immediate sync on window focus & online event
  const onFocus = () => void sync();
  const onOnline = () => void sync();
  const onOffline = () => onStateChange?.("offline");

  window.addEventListener("focus", onFocus);
  window.addEventListener("online", onOnline);
  window.addEventListener("offline", onOffline);

  // Initial sync: seeds server or pulls latest from authority
  void sync();

  return () => {
    clearInterval(interval);
    window.removeEventListener("focus", onFocus);
    window.removeEventListener("online", onOnline);
    window.removeEventListener("offline", onOffline);
  };
}
