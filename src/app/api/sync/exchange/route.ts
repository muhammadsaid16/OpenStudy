import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import type { TombstoneRec } from "@/lib/db";
import { entityIdOf, tsOf, type SyncPayload, type SyncRow, type SyncTableName } from "@/lib/sync";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface ServerRow {
  key: any;
  row: any;
  updatedAt: number;
  rev: number;
  lastDeviceId: string;
}

interface ServerState {
  authority: {
    id: string;
    name: string;
    pairingCode: string;
    lastSeen: number;
  } | null;
  replicas: Record<string, { id: string; name: string; lastSeen: number }>;
  tables: Record<string, Record<string, ServerRow>>;
  tombstones: Record<string, TombstoneRec>;
  lastModifiedAt: number;
}

const CACHE_FILE = path.join(process.cwd(), ".lan-sync-cache.json");

function loadState(): ServerState {
  try {
    if (fs.existsSync(CACHE_FILE)) {
      const data = fs.readFileSync(CACHE_FILE, "utf-8");
      const parsed = JSON.parse(data);
      return {
        authority: parsed.authority ?? null,
        replicas: parsed.replicas ?? {},
        tables: parsed.tables ?? {},
        tombstones: parsed.tombstones ?? {},
        lastModifiedAt: parsed.lastModifiedAt ?? Date.now(),
      };
    }
  } catch {
    /* fallback to clean in-memory state */
  }
  return {
    authority: null,
    replicas: {},
    tables: {},
    tombstones: {},
    lastModifiedAt: Date.now(),
  };
}

let state: ServerState = loadState();

function persistState() {
  try {
    fs.writeFileSync(CACHE_FILE, JSON.stringify(state, null, 2), "utf-8");
  } catch {
    /* ignore write failures in ephemeral environments */
  }
}

export async function GET() {
  const now = Date.now();
  const authorityActive = state.authority
    ? now - state.authority.lastSeen < 120_000
    : false;

  const tableCounts = Object.fromEntries(
    Object.entries(state.tables).map(([name, rows]) => [name, Object.keys(rows).length])
  );

  return NextResponse.json({
    status: "online",
    localNetwork: true,
    authority: state.authority
      ? {
          id: state.authority.id,
          name: state.authority.name,
          online: authorityActive,
          lastSeen: state.authority.lastSeen,
        }
      : null,
    replicasCount: Object.keys(state.replicas).length,
    tableCounts,
    tombstonesCount: Object.keys(state.tombstones).length,
    lastModifiedAt: state.lastModifiedAt,
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, deviceId, deviceName, role, pairingCode, payload, since = 0 } = body;
    const now = Date.now();

    // 0. Test reset
    if (process.env.NODE_ENV === "test" && action === "test-reset") {
      state = { authority: null, replicas: {}, tables: {}, tombstones: {}, lastModifiedAt: now };
      if (fs.existsSync(CACHE_FILE)) {
        try { fs.unlinkSync(CACHE_FILE); } catch {}
      }
      return NextResponse.json({ ok: true, reset: true });
    }

    // 1. Authority Registration
    if (action === "register-authority") {
      state.authority = {
        id: deviceId || "main-authority",
        name: deviceName || "Main Device (Authority)",
        pairingCode: pairingCode ? String(pairingCode).trim() : (state.authority?.pairingCode || "742918"),
        lastSeen: now,
      };
      state.lastModifiedAt = now;
      persistState();
      return NextResponse.json({ ok: true, registered: true, authority: state.authority });
    }

    // 2. Pairing Handshake
    if (action === "pair") {
      const cleanCode = String(pairingCode || "").trim().replace(/\s+/g, "");
      if (cleanCode.length !== 6) {
        return NextResponse.json({ error: "Invalid 6-digit pairing code." }, { status: 400 });
      }

      // If authority has set a pairing code, enforce it
      if (state.authority?.pairingCode && cleanCode !== state.authority.pairingCode) {
        return NextResponse.json(
          { error: "Incorrect pairing code. Check Settings > Sync on your Main Device." },
          { status: 401 }
        );
      }

      // Record replica device
      if (deviceId) {
        state.replicas[deviceId] = {
          id: deviceId,
          name: deviceName || "Secondary Device (Replica)",
          lastSeen: now,
        };
      }

      state.lastModifiedAt = now;
      persistState();

      return NextResponse.json({
        ok: true,
        paired: true,
        mainDeviceId: state.authority?.id || "main-authority",
        mainDeviceName: state.authority?.name || "Main Device (Authority)",
      });
    }

    // 3. Full-Duplex LAN Sync Exchange
    if (action === "sync") {
      // Keep heartbeats updated
      if (role === "main") {
        if (!state.authority) {
          state.authority = {
            id: deviceId,
            name: deviceName || "Main Device (Authority)",
            pairingCode: "742918",
            lastSeen: now,
          };
        } else {
          state.authority.lastSeen = now;
          if (deviceName) state.authority.name = deviceName;
        }
      } else if (deviceId) {
        state.replicas[deviceId] = {
          id: deviceId,
          name: deviceName || "Secondary Device",
          lastSeen: now,
        };
      }

      let modified = false;

      // Ingest incoming client tombstones
      if (payload?.tombstones && Array.isArray(payload.tombstones)) {
        for (const t of payload.tombstones as TombstoneRec[]) {
          const tId = t.id || `${t.table}:${t.entityId}`;
          const existingTomb = state.tombstones[tId];
          if (!existingTomb || t.deletedAt > existingTomb.deletedAt) {
            state.tombstones[tId] = t;
            modified = true;
          }

          // Remove any stored row in this table that is older than this tombstone
          const tableStore = state.tables[t.table];
          if (tableStore && tableStore[t.entityId]) {
            if (t.deletedAt >= tableStore[t.entityId].updatedAt) {
              delete tableStore[t.entityId];
              modified = true;
            }
          }
        }
      }

      // Ingest incoming client rows
      if (payload?.rows && typeof payload.rows === "object") {
        for (const [tableName, entries] of Object.entries(payload.rows)) {
          if (!Array.isArray(entries)) continue;
          if (!state.tables[tableName]) {
            state.tables[tableName] = {};
          }
          const tableStore = state.tables[tableName];

          for (const entry of entries as SyncRow[]) {
            const entityKey = entityIdOf(entry.key);
            const rowUpdated = tsOf(entry.row.updatedAt);
            const rowRev = (entry.row.rev as number) ?? 1;
            const rowDeviceId = (entry.row.lastDeviceId as string) || deviceId;

            // Check if superseded by tombstone
            const tombId = `${tableName}:${entityKey}`;
            const tomb = state.tombstones[tombId];
            if (tomb && tomb.deletedAt > rowUpdated) {
              continue;
            }

            const existing = tableStore[entityKey];
            if (!existing) {
              tableStore[entityKey] = {
                key: entry.key,
                row: entry.row,
                updatedAt: rowUpdated,
                rev: rowRev,
                lastDeviceId: rowDeviceId,
              };
              modified = true;
            } else {
              // Last-write-wins with rev tiebreaker
              if (rowUpdated > existing.updatedAt || (rowUpdated === existing.updatedAt && rowRev > existing.rev)) {
                tableStore[entityKey] = {
                  key: entry.key,
                  row: entry.row,
                  updatedAt: rowUpdated,
                  rev: rowRev,
                  lastDeviceId: rowDeviceId,
                };
                modified = true;
              }
            }
          }
        }
      }

      if (modified) {
        state.lastModifiedAt = now;
        persistState();
      }

      // Prepare delta response for client
      const clientSince = typeof since === "number" ? since : 0;
      const responseRows: Partial<Record<SyncTableName, SyncRow[]>> = {};

      for (const [tableName, tableStore] of Object.entries(state.tables)) {
        const gathered: SyncRow[] = [];
        for (const stored of Object.values(tableStore)) {
          if (clientSince === 0) {
            // Initial sync: send everything
            gathered.push({ key: stored.key, row: stored.row });
          } else if (stored.updatedAt > clientSince && stored.lastDeviceId !== deviceId) {
            // Incremental sync: send rows newer than bookmark not originating from this device
            gathered.push({ key: stored.key, row: stored.row });
          }
        }
        if (gathered.length > 0) {
          responseRows[tableName as SyncTableName] = gathered;
        }
      }

      const responseTombstones: TombstoneRec[] = [];
      for (const t of Object.values(state.tombstones)) {
        if (clientSince === 0) {
          responseTombstones.push(t);
        } else if (t.deletedAt > clientSince && t.deviceId !== deviceId) {
          responseTombstones.push(t);
        }
      }

      const replyPayload: SyncPayload = {
        deviceId: "server-relay",
        since: clientSince,
        builtAt: now,
        rows: responseRows,
        tombstones: responseTombstones,
        mediaOmitted: [],
      };

      return NextResponse.json({
        ok: true,
        payload: replyPayload,
        authority: state.authority,
        replicas: Object.values(state.replicas),
        serverTime: now,
      });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: "Sync exchange failed", details: String(err) }, { status: 500 });
  }
}
