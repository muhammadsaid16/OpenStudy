import { describe, expect, it, beforeEach } from "vitest";
import { GET, POST } from "./route";
import { NextRequest } from "next/server";

function jsonReq(body: any): NextRequest {
  return new NextRequest("http://localhost:3000/api/sync/exchange", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("LAN sync exchange route", () => {
  beforeEach(async () => {
    await POST(jsonReq({ action: "test-reset" }));
  });

  it("responds to GET with health and active stats", async () => {
    const res = await GET();
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.status).toBe("online");
    expect(json.localNetwork).toBe(true);
  });

  it("handles authority registration and pairing code verification", async () => {
    // 1. Register authority
    const regRes = await POST(
      jsonReq({
        action: "register-authority",
        deviceId: "laptop-main",
        deviceName: "MacBook Pro",
        pairingCode: "654321",
      })
    );
    const regJson = await regRes.json();
    expect(regJson.ok).toBe(true);
    expect(regJson.authority.pairingCode).toBe("654321");

    // 2. Reject incorrect pairing code
    const badPairRes = await POST(
      jsonReq({
        action: "pair",
        deviceId: "phone-replica",
        deviceName: "iPhone",
        pairingCode: "000000",
      })
    );
    expect(badPairRes.status).toBe(401);

    // 3. Accept matching pairing code
    const goodPairRes = await POST(
      jsonReq({
        action: "pair",
        deviceId: "phone-replica",
        deviceName: "iPhone",
        pairingCode: "654321",
      })
    );
    const goodPairJson = await goodPairRes.json();
    expect(goodPairRes.status).toBe(200);
    expect(goodPairJson.ok).toBe(true);
    expect(goodPairJson.mainDeviceId).toBe("laptop-main");
  });

  it("synchronizes rows and tombstones bidirectionally between authority and replica", async () => {
    const t1 = Date.now() - 5000;
    const t2 = Date.now();

    // 1. Authority pushes initial notes
    const authSyncRes = await POST(
      jsonReq({
        action: "sync",
        deviceId: "laptop-main",
        deviceName: "MacBook Pro",
        role: "main",
        since: 0,
        payload: {
          deviceId: "laptop-main",
          since: 0,
          builtAt: t1,
          rows: {
            notes: [
              {
                key: "note-1",
                row: {
                  id: "note-1",
                  title: "Cell Biology",
                  updatedAt: new Date(t1).toISOString(),
                  rev: 1,
                  lastDeviceId: "laptop-main",
                },
              },
            ],
          },
          tombstones: [],
          mediaOmitted: [],
        },
      })
    );
    expect(authSyncRes.status).toBe(200);

    // 2. Replica performs initial sync with since=0 and receives note-1
    const replicaSyncRes = await POST(
      jsonReq({
        action: "sync",
        deviceId: "phone-replica",
        deviceName: "iPhone",
        role: "replica",
        since: 0,
        payload: {
          deviceId: "phone-replica",
          since: 0,
          builtAt: t1,
          rows: {},
          tombstones: [],
          mediaOmitted: [],
        },
      })
    );
    const replicaJson = await replicaSyncRes.json();
    expect(replicaJson.ok).toBe(true);
    expect(replicaJson.payload.rows.notes).toBeDefined();
    expect(replicaJson.payload.rows.notes).toHaveLength(1);
    expect(replicaJson.payload.rows.notes[0].key).toBe("note-1");

    // 3. Replica creates note-2 and pushes it
    const replicaPushRes = await POST(
      jsonReq({
        action: "sync",
        deviceId: "phone-replica",
        deviceName: "iPhone",
        role: "replica",
        since: t1,
        payload: {
          deviceId: "phone-replica",
          since: t1,
          builtAt: t2,
          rows: {
            notes: [
              {
                key: "note-2",
                row: {
                  id: "note-2",
                  title: "Photosynthesis",
                  updatedAt: new Date(t2).toISOString(),
                  rev: 1,
                  lastDeviceId: "phone-replica",
                },
              },
            ],
          },
          tombstones: [],
          mediaOmitted: [],
        },
      })
    );
    expect(replicaPushRes.status).toBe(200);

    // 4. Authority syncs with since=t1 and receives note-2
    const authPullRes = await POST(
      jsonReq({
        action: "sync",
        deviceId: "laptop-main",
        deviceName: "MacBook Pro",
        role: "main",
        since: t1,
        payload: {
          deviceId: "laptop-main",
          since: t1,
          builtAt: t2,
          rows: {},
          tombstones: [],
          mediaOmitted: [],
        },
      })
    );
    const authPullJson = await authPullRes.json();
    expect(authPullJson.payload.rows.notes).toBeDefined();
    const noteKeys = authPullJson.payload.rows.notes.map((n: any) => n.key);
    expect(noteKeys).toContain("note-2");

    // 5. Authority deletes note-1 with tombstone
    const deleteTime = Date.now() + 1000;
    await POST(
      jsonReq({
        action: "sync",
        deviceId: "laptop-main",
        role: "main",
        since: t2,
        payload: {
          deviceId: "laptop-main",
          since: t2,
          builtAt: deleteTime,
          rows: {},
          tombstones: [
            {
              id: "notes:note-1",
              table: "notes",
              entityId: "note-1",
              key: "note-1",
              deletedAt: deleteTime,
              rev: 2,
              deviceId: "laptop-main",
            },
          ],
          mediaOmitted: [],
        },
      })
    );

    // 6. Replica pulls changes and receives tombstone for note-1
    const replicaTombRes = await POST(
      jsonReq({
        action: "sync",
        deviceId: "phone-replica",
        role: "replica",
        since: t2,
      })
    );
    const replicaTombJson = await replicaTombRes.json();
    expect(replicaTombJson.payload.tombstones).toHaveLength(1);
    expect(replicaTombJson.payload.tombstones[0].entityId).toBe("note-1");
  });
});
