import { describe, it, expect, beforeEach } from "vitest";
import {
  getDeviceRole,
  setDeviceRole,
  generatePairingCode,
  getPairingCode,
  getPairedDevices,
  addPairedDevice,
  updatePairedDevice,
  removePairedDevice,
  getLastSyncTimestamp,
  setLastSyncTimestamp,
} from "./sync-lan";

describe("sync-lan engine", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("defaults device role to main (sync authority) and allows switching", () => {
    expect(getDeviceRole()).toBe("main");
    setDeviceRole("replica");
    expect(getDeviceRole()).toBe("replica");
    setDeviceRole("main");
    expect(getDeviceRole()).toBe("main");
  });

  it("generates and stores a valid 6-digit pairing code", () => {
    const code = generatePairingCode();
    expect(code).toHaveLength(6);
    expect(/^\d{6}$/.test(code)).toBe(true);
    expect(getPairingCode()).toBe(code);
  });

  it("manages paired device registry correctly", () => {
    const initial = getPairedDevices();
    expect(initial.length).toBeGreaterThanOrEqual(1);

    const newDevice = {
      id: "tablet-test-id",
      name: "iPad Air",
      role: "replica" as const,
      pairedAt: Date.now(),
      lastSyncAt: Date.now(),
      status: "synced" as const,
    };

    addPairedDevice(newDevice);
    expect(getPairedDevices().some((d) => d.id === "tablet-test-id")).toBe(true);

    updatePairedDevice("tablet-test-id", { status: "offline" });
    expect(getPairedDevices().find((d) => d.id === "tablet-test-id")?.status).toBe("offline");

    removePairedDevice("tablet-test-id");
    expect(getPairedDevices().some((d) => d.id === "tablet-test-id")).toBe(false);
  });

  it("tracks last sync timestamp", () => {
    expect(getLastSyncTimestamp()).toBe(0);
    const now = Date.now();
    setLastSyncTimestamp(now);
    expect(getLastSyncTimestamp()).toBe(now);
  });
});
