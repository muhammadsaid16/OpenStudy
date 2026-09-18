import Dexie, { type Table } from "dexie";

// ─── Safety net — backups that outlive the database they protect ──────
//
// `studymax` is the single source of truth for the user's work and there is no
// server copy anywhere (see lib/db.ts). Two consequences drove this module:
//
//   1. lib/db.ts resets that database when it cannot open it, so anything kept
//      inside it goes with it. The mirror has to live elsewhere.
//   2. localStorage was the previous home for the rolling mirror. It caps at
//      ~5MB, and the old code deleted the mirror outright once the export
//      crossed 4.5MB — so a user with a real deck silently had no backup at
//      all. That is the bug this module exists to fix.
//
// So snapshots live here instead: a SEPARATE IndexedDB database, opened
// independently of `studymax`, with no size budget beyond the browser's disk
// quota. Nothing in this module ever writes to `studymax`.
//
// Every function swallows its own errors and reports failure by returning
// false/null/0. A backup that throws must never be able to break the app.

const SAFETY_DB_NAME = "studymax-safety";
const PRIMARY_DB_NAME = "studymax";
const LEGACY_LOCAL_KEY = "studymax:autobackup";

/** `latest` is the rolling mirror. `pre-reset` is written just before a reset. */
export type SnapshotId = "latest" | "pre-reset";

/**
 * A lossless dump taken straight from IndexedDB, used when Dexie can no longer
 * open the database. Stored as an object (not a string) so that structured
 * clone preserves Date instances on the way back in.
 */
export interface RawDump {
  kind: "raw";
  dbName: string;
  version: number;
  stores: Record<string, unknown[]>;
  /** Stores that existed but could not be read. */
  unreadable: string[];
  createdAt: number;
}

export type SnapshotPayload = string | RawDump;

export interface SnapshotRec {
  id: SnapshotId;
  /** "v2" = the portable export produced by exportAllData(); "raw" = RawDump. */
  format: "v2" | "raw";
  payload: SnapshotPayload;
  bytes: number;
  createdAt: number;
  reason: string;
}

interface MetaRec {
  id: "state";
  /** Set when a schema mismatch forced a reset, so the UI can offer the copy. */
  resetAt?: number;
  resetNoticeDismissedAt?: number;
  emptyBackupDismissedAt?: number;
}

class SafetyDB extends Dexie {
  snapshots!: Table<SnapshotRec, string>;
  meta!: Table<MetaRec, string>;

  constructor() {
    super(SAFETY_DB_NAME);
    // v1 only. This schema must stay boringly additive: it is the thing that
    // has to open when the other database cannot.
    this.version(1).stores({ snapshots: "id, createdAt", meta: "id" });
  }
}

export const safetyDb = new SafetyDB();

function byteSize(payload: SnapshotPayload): number {
  if (typeof payload === "string") return payload.length;
  try {
    return JSON.stringify(payload).length;
  } catch {
    return 0;
  }
}

async function withSafetyDb<T>(fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch (err) {
    // Private-browsing quota, blocked storage, an older browser: none of these
    // may take the app down with them.
    console.warn("[safety-net] backup store unavailable:", err);
    return null;
  }
}

// ─── Reading and writing snapshots ────────────────────────────────

export async function saveSnapshot(input: {
  id: SnapshotId;
  format: "v2" | "raw";
  payload: SnapshotPayload;
  reason: string;
}): Promise<boolean> {
  const rec: SnapshotRec = {
    id: input.id,
    format: input.format,
    payload: input.payload,
    bytes: byteSize(input.payload),
    createdAt: Date.now(),
    reason: input.reason,
  };
  const res = await withSafetyDb(async () => {
    await safetyDb.snapshots.put(rec);
    return true;
  });
  return res === true;
}

export async function readSnapshot(id: SnapshotId): Promise<SnapshotRec | null> {
  return withSafetyDb(async () => (await safetyDb.snapshots.get(id)) ?? null);
}

export async function hasSnapshot(id: SnapshotId): Promise<boolean> {
  const rec = await readSnapshot(id);
  return rec !== null;
}

/** Both slots, newest first — newest first because that is what to offer. */
export async function listSnapshots(): Promise<SnapshotRec[]> {
  const res = await withSafetyDb(async () => safetyDb.snapshots.toArray());
  return (res ?? []).sort((a, b) => b.createdAt - a.createdAt);
}

// ─── Reset bookkeeping ────────────────────────────────────────────

async function writeMeta(patch: Partial<MetaRec>): Promise<void> {
  await withSafetyDb(async () => {
    const current = (await safetyDb.meta.get("state")) ?? { id: "state" as const };
    await safetyDb.meta.put({ ...current, ...patch, id: "state" });
    return true;
  });
}

export async function markReset(): Promise<void> {
  await writeMeta({ resetAt: Date.now() });
}

export async function readResetNotice(): Promise<{ resetAt: number; dismissed: boolean } | null> {
  const meta = await withSafetyDb(async () => (await safetyDb.meta.get("state")) ?? null);
  if (!meta?.resetAt) return null;
  return { resetAt: meta.resetAt, dismissed: Boolean(meta.resetNoticeDismissedAt) };
}

export async function dismissResetNotice(): Promise<void> {
  await writeMeta({ resetNoticeDismissedAt: Date.now() });
}

export async function dismissEmptyBackupNotice(): Promise<void> {
  await writeMeta({ emptyBackupDismissedAt: Date.now() });
}

export async function readEmptyBackupNotice(): Promise<boolean> {
  const meta = await withSafetyDb(async () => (await safetyDb.meta.get("state")) ?? null);
  return Boolean(meta?.emptyBackupDismissedAt);
}

/** Check if a snapshot actually contains meaningful user data (not just empty shell). */
export function snapshotHasContent(snapshot: SnapshotRec | null | undefined): boolean {
  if (!snapshot || !snapshot.payload) return false;
  try {
    if (snapshot.format === "raw") {
      const dump = snapshot.payload as RawDump;
      return Object.values(dump.stores || {}).some(
        (rows) => Array.isArray(rows) && rows.length > 0
      );
    }
    if (snapshot.format === "v2") {
      const p =
        typeof snapshot.payload === "string"
          ? JSON.parse(snapshot.payload)
          : snapshot.payload;
      if (!p || typeof p !== "object") return false;
      const subCount = Array.isArray(p.subjects) ? p.subjects.length : 0;
      const bunCount = Array.isArray(p.bundles) ? p.bundles.length : 0;
      const cardCount = Array.isArray(p.cards) ? p.cards.length : 0;
      const sessCount = Array.isArray(p.sessions) ? p.sessions.length : 0;
      return subCount > 0 || bunCount > 0 || cardCount > 0 || sessCount > 0;
    }
  } catch {
    return false;
  }
  return false;
}

// ─── Raw salvage ──────────────────────────────────────────────────

/**
 * Read a database that Dexie refused to open, using the plain IndexedDB API.
 *
 * Opening with NO version is the whole trick: it opens whatever version is
 * already on disk and does not ask for an upgrade, so it works on a database
 * that Dexie itself has refused.
 *
 * Note what this does NOT cover, measured rather than assumed: Dexie 4 does not
 * reject a database whose on-disk schema is NEWER than the one it declares — it
 * opens it and reads it happily (see the "newer on-disk schema" test). So this
 * path is for the failures Dexie does raise — `UpgradeError`, `SchemaError`, a
 * half-applied upgrade, a blocked delete — where no Dexie handle is usable.
 *
 * The connection is closed before resolving so it cannot block the subsequent
 * `deleteDatabase` with a `blocked` event.
 */
export function salvageDatabase(dbName: string = PRIMARY_DB_NAME): Promise<RawDump | null> {
  return new Promise((resolve) => {
    if (typeof indexedDB === "undefined") return resolve(null);

    let settled = false;
    const finish = (value: RawDump | null) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    let req: IDBOpenDBRequest;
    try {
      req = indexedDB.open(dbName);
    } catch {
      return finish(null);
    }

    req.onerror = () => finish(null);
    // A blocked open would otherwise leave the promise pending forever.
    req.onblocked = () => finish(null);

    req.onsuccess = () => {
      const handle = req.result;
      const names = Array.from(handle.objectStoreNames);
      const stores: Record<string, unknown[]> = {};
      const unreadable: string[] = [];

      const done = () => {
        try {
          handle.close();
        } catch {
          /* already closing */
        }
        finish({
          kind: "raw",
          dbName,
          version: handle.version,
          stores,
          unreadable,
          createdAt: Date.now(),
        });
      };

      if (names.length === 0) return done();

      let pending = names.length;
      const settleOne = () => {
        pending -= 1;
        if (pending === 0) done();
      };

      for (const name of names) {
        try {
          const tx = handle.transaction(name, "readonly");
          const getAll = tx.objectStore(name).getAll();
          getAll.onsuccess = () => {
            stores[name] = Array.isArray(getAll.result) ? getAll.result : [];
            settleOne();
          };
          getAll.onerror = () => {
            unreadable.push(name);
            settleOne();
          };
        } catch {
          unreadable.push(name);
          settleOne();
        }
      }
    };
  });
}

/**
 * Write a raw dump back through Dexie tables.
 *
 * Deliberately per-table and best-effort: a dump can contain stores this build
 * no longer has, or record shapes it never knew. A table that fails is reported
 * rather than allowed to abort the tables that would have worked.
 */
export async function restoreRawDump(
  target: { table: (name: string) => { bulkPut: (rows: unknown[]) => Promise<unknown> } },
  dump: RawDump
): Promise<{ restored: number; skipped: string[] }> {
  let restored = 0;
  const skipped: string[] = [];

  for (const [name, rows] of Object.entries(dump.stores ?? {})) {
    if (!Array.isArray(rows) || rows.length === 0) continue;
    try {
      await target.table(name).bulkPut(rows);
      restored += rows.length;
    } catch {
      skipped.push(name);
    }
  }

  return { restored, skipped };
}

// ─── Rescue: run before the primary database is reset ─────────────

/**
 * Capture what we can before the unopenable database is deleted.
 *
 * Two independent things are saved, because either may be the only survivor:
 * the raw dump (the real data, straight off disk) and the rolling snapshot
 * (schema-clean, but however stale the last mirror is).
 */
export async function rescueBeforeReset(): Promise<{
  salvaged: boolean;
  rolling: boolean;
}> {
  const result = { salvaged: false, rolling: false };

  try {
    const dump = await salvageDatabase();
    const rows = dump
      ? Object.values(dump.stores).reduce((n, r) => n + (Array.isArray(r) ? r.length : 0), 0)
      : 0;
    if (dump && rows > 0) {
      result.salvaged = await saveSnapshot({
        id: "pre-reset",
        format: "raw",
        payload: dump,
        reason: "schema-mismatch",
      });
    }
  } catch {
    /* best effort — the rolling snapshot below may still save the day */
  }

  try {
    result.rolling = await hasSnapshot("latest");
    await markReset();
  } catch {
    /* nothing left to do; the reset below still has to happen */
  }

  return result;
}

// ─── One-time migration off localStorage ──────────────────────────

/**
 * Move the legacy localStorage mirror into the safety database, then drop the
 * key. Without this, anyone who already has a backup would lose it the moment
 * this module takes over — and freeing the ~4MB buys space back on an origin
 * where localStorage is a scarce resource.
 *
 * Only runs when the new store is empty, so it can never clobber a newer copy.
 */
export async function migrateLegacyLocalBackup(): Promise<boolean> {
  if (typeof localStorage === "undefined") return false;

  const raw = localStorage.getItem(LEGACY_LOCAL_KEY);
  if (!raw) return false;

  const migrated = await withSafetyDb(async () => {
    if (await safetyDb.snapshots.get("latest")) return false;
    try {
      JSON.parse(raw); // don't carry a corrupt mirror forward
    } catch {
      return false;
    }
    await safetyDb.snapshots.put({
      id: "latest",
      format: "v2",
      payload: raw,
      bytes: raw.length,
      createdAt: Date.now(),
      reason: "migrated-from-localStorage",
    });
    return true;
  });

  if (migrated === true) {
    try {
      localStorage.removeItem(LEGACY_LOCAL_KEY);
    } catch {
      /* key stays; the snapshot is already safely stored */
    }
  }
  return migrated === true;
}

/** Suggests a filename for a downloaded copy. */
export function snapshotFilename(rec: { id: SnapshotId; createdAt: number }): string {
  const stamp = new Date(rec.createdAt).toISOString().slice(0, 19).replace(/[:T]/g, "-");
  return `ruvren-${rec.id === "pre-reset" ? "recovered" : "backup"}-${stamp}.json`;
}

export const SAFETY_DB = { name: SAFETY_DB_NAME, legacyLocalKey: LEGACY_LOCAL_KEY };
