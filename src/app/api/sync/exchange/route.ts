import { NextRequest, NextResponse } from "next/server";

// In-memory relay buffer on the local server instance for LAN device sync.
// Survives during local server uptime across Wi-Fi connected devices.
interface SyncMessage {
  deviceId: string;
  role: "main" | "replica";
  timestamp: number;
  payload: any;
}

let lastAuthorityPayload: SyncMessage | null = null;
let lastReplicaPayload: SyncMessage | null = null;
let mainDeviceRegistered: { id: string; name: string; lastSeen: number } | null = null;

export async function GET() {
  return NextResponse.json({
    status: "online",
    localNetwork: true,
    mainDevice: mainDeviceRegistered
      ? {
          name: mainDeviceRegistered.name,
          online: Date.now() - mainDeviceRegistered.lastSeen < 60000,
        }
      : null,
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, deviceId, deviceName, role, pairingCode, payload } = body;

    // 1. Pairing handshake
    if (action === "pair") {
      if (!pairingCode || String(pairingCode).length !== 6) {
        return NextResponse.json({ error: "Invalid 6-digit pairing code." }, { status: 400 });
      }

      return NextResponse.json({
        ok: true,
        paired: true,
        mainDeviceId: mainDeviceRegistered?.id || "main-authority",
        mainDeviceName: mainDeviceRegistered?.name || "Laptop — Main Device",
      });
    }

    // 2. LAN Sync Exchange
    if (action === "sync") {
      const now = Date.now();

      if (role === "main") {
        mainDeviceRegistered = {
          id: deviceId || "main",
          name: deviceName || "Laptop — Main Device",
          lastSeen: now,
        };

        if (payload) {
          lastAuthorityPayload = {
            deviceId,
            role: "main",
            timestamp: now,
            payload,
          };
        }

        // Return the latest pending replica changes to the Main Device
        const replyPayload = lastReplicaPayload && lastReplicaPayload.deviceId !== deviceId ? lastReplicaPayload.payload : null;
        return NextResponse.json({ ok: true, payload: replyPayload });
      } else {
        // Replica sync
        if (payload) {
          lastReplicaPayload = {
            deviceId,
            role: "replica",
            timestamp: now,
            payload,
          };
        }

        // Return the latest Authority payload to the replica
        const replyPayload = lastAuthorityPayload && lastAuthorityPayload.deviceId !== deviceId ? lastAuthorityPayload.payload : null;
        return NextResponse.json({ ok: true, payload: replyPayload });
      }
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: "Sync exchange failed", details: String(err) }, { status: 500 });
  }
}
