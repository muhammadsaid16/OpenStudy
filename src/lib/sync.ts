// ─── Device sync foundation (Study OS §19) ───────────────────────
// Local-first and transport-free: this is everything a transport needs to
// exchange state WITHOUT losing data, proven locally before any network code
// exists.
//
//   row metadata   updatedAt (stamped on every write), rev, lastDeviceId
//   tombstones     deletions survive a merge instead of resurrecting
//   resolveRow()   the conflict rule, in one place, identical on both devices
//   collect/apply  the two halves of an exchange, over any Dexie instance
//
// Why there is no operation/change log yet: it would have to be appended from
// Dexie's write hooks, and a hook CANNOT write to another table — the
// surrounding transaction's scope does not include it and the write is
// silently dropped (verified against dexie 4.4.6). A log that loses entries
// while looking authoritative is worse than no log, so a row's own
// `updatedAt` is the change marker until a transport lands and can afford a
// real, transactional log. Incremental sync then reads "rows newer than my
// bookmark" (see collectSince) instead of replaying operations.
//
// Nothing here decides *policy*: which device is the authority, when to sync,
// how peers pair. Those arrive with the transport. This module is the part
// that must be right first — the part that, if wrong, corrupts study data.

import type { Dexie, IndexableType, Table } from "dexie";
import type { TombstoneRec } from "@/lib/db";

/** Every table whose rows participate in sync. */
export const SYNC_TABLES = [
  "subjects",
  "topics",
  "resources",
  "notes",
  "tags",
  "noteTags",
  "cardTags",
  "bundles",
  "flashcards",
  "reviewLogs",
  "studySessions",
  "pomoPresets",
  "goals",
  "milestones",
  "exams",
  "examQuestions",
  "tasks",
  "cardImages",
  "wallpapers",
] as const;

export type SyncTableName = (typeof SYNC_TABLES)[number];

/**
 * Tables whose rows carry binary payloads. Their metadata syncs; the bytes are
 * omitted from a JSON exchange (a Blob cannot ride in JSON, and base64 in a
 * backup file is its own decision). Media needs a binary channel — deliberately
 * not invented here, and never silently replaced by a broken pointer.
 */
export const MEDIA_TABLES: readonly SyncTableName[] = ["cardImages", "wallpapers"];

export const isSyncTable = (name: string): name is SyncTableName =>
  (SYNC_TABLES as readonly string[]).includes(name);

// ─── The metadata every synced row carries ───────────────────────

export interface SyncMeta {
  /** Last write time. The merge's primary ordering key. */
  updatedAt?: Date | string | number | null;
  /** Monotonic per-row version, bumped on every write (1 on create). */
  rev?: number | null;
  /** Device that performed the last write — the deterministic tiebreaker. */
  lastDeviceId?: string | null;
}

type SyncMetaLike = SyncMeta | null | undefined;

/** Milliseconds for an unknown timestamp: unknown reads as oldest. */
export function tsOf(value: Date | string | number | null | undefined): number {
  if (value == null) return 0;
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const t = new Date(value).getTime();
  return Number.isFinite(t) ? t : 0;
}

/** The metadata fields a write stamps. Pure so it can be tested in isolation. */
export interface SyncStamps {
  updatedAt: Date;
  rev: number;
  lastDeviceId: string;
}

export function nextStamps(previous: SyncMetaLike, deviceId: string, at: Date): SyncStamps {
  return {
    updatedAt: at,
    rev: (previous?.rev ?? 0) + 1,
    lastDeviceId: deviceId,
  };
}

// ─── Device identity (per install, never exported) ───────────────
// Stored in localStorage rather than Dexie: it identifies THIS browser
// install, so restoring a backup must not clone the identity, and importing
// someone else's study data must not adopt their device id.

export interface DeviceIdentity {
  id: string;
  name: string;
  createdAt: number;
}

const DEVICE_KEY = "openstudy-device";

/** Node/tests have no localStorage — identity then lives for the process. */
let memoryDevice: DeviceIdentity | null = null;

function newDeviceId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

export function deviceIdentity(): DeviceIdentity {
  if (typeof localStorage === "undefined") {
    memoryDevice ??= { id: newDeviceId(), name: "This device", createdAt: Date.now() };
    return memoryDevice;
  }
  try {
    const raw = localStorage.getItem(DEVICE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<DeviceIdentity>;
      if (parsed && typeof parsed.id === "string" && parsed.id.length >= 8) {
        return {
          id: parsed.id,
          name: typeof parsed.name === "string" && parsed.name.trim() ? parsed.name : "This device",
          createdAt: typeof parsed.createdAt === "number" ? parsed.createdAt : Date.now(),
        };
      }
    }
  } catch {
    /* corrupt value → mint a fresh identity below */
  }
  const fresh: DeviceIdentity = { id: newDeviceId(), name: "This device", createdAt: Date.now() };
  try {
    localStorage.setItem(DEVICE_KEY, JSON.stringify(fresh));
  } catch {
    /* private mode: identity stays in memory for this session */
  }
  return fresh;
}

export function setDeviceName(name: string): DeviceIdentity {
  const current = deviceIdentity();
  const next: DeviceIdentity = { ...current, name: name.trim().slice(0, 40) || "This device" };
  if (typeof localStorage === "undefined") {
    memoryDevice = next;
    return next;
  }
  try {
    localStorage.setItem(DEVICE_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
  return next;
}

// ─── Stamping hooks ──────────────────────────────────────────────
// Installed once per database instance. Two Dexie subtleties, both load-bearing:
//   • a `creating` hook receives the row being written and may mutate it;
//   • an `updating` hook must RETURN the additional changes — mutating the
//     modifications object in place is ignored (dexie 4.4.6).
// Because these hooks cannot append to another table, the stamps they write
// ARE the change record; see the module note above.

let stampsPaused = 0;

/** Run writes without stamping (used when applying a remote payload, whose
 *  rows must keep the metadata they arrived with). */
export async function withStampsPaused<T>(fn: () => Promise<T>): Promise<T> {
  stampsPaused++;
  try {
    return await fn();
  } finally {
    stampsPaused--;
  }
}

export interface InstallOptions {
  /** Which install this database speaks for. Defaults to deviceIdentity(). */
  deviceId?: () => string;
  tables?: readonly SyncTableName[];
}

export function installSyncHooks(database: Dexie, options: InstallOptions = {}): void {
  const id = options.deviceId ?? (() => deviceIdentity().id);
  for (const name of options.tables ?? SYNC_TABLES) {
    const table = database.table(name);
    table.hook("creating", (_primKey: IndexableType, obj: SyncMeta) => {
      if (stampsPaused > 0) return;
      Object.assign(obj as object, nextStamps(obj, id(), new Date()));
    });
    table.hook("updating", (_mods: object, _primKey: IndexableType, obj: SyncMeta) => {
      if (stampsPaused > 0) return undefined;
      return nextStamps(obj, id(), new Date());
    });
  }
}

// ─── The conflict rule (pure) ────────────────────────────────────
export type MergeAction = "insert" | "replace" | "delete" | "keep" | "skip" | "none";
export type MergeReason =
  | "new-row"
  | "remote-newer"
  | "local-newer"
  | "identical"
  | "tombstone"
  | "edited-since-delete"
  | "no-remote-row"
  | "already-deleted";

export interface MergeDecision {
  action: MergeAction;
  reason: MergeReason;
}

export interface ResolveInput {
  local?: SyncMetaLike;
  remote?: SyncMetaLike;
  /** A tombstone for this row, if the other device reports one. */
  tombstone?: Pick<TombstoneRec, "deletedAt" | "deviceId"> | null;
}

/**
 * Last-write-wins per row, with three rules that matter:
 *
 *  1. A tombstone deletes — unless the local row was MODIFIED after the
 *     delete. Then the local edit wins ("edited-since-delete"): deleting work
 *     someone did on another device is the one outcome a study app must never
 *     produce silently, so an edit resurrects the row and the caller reports
 *     it rather than hiding it.
 *  2. Equal timestamps fall back to the higher `rev`, then to the device id —
 *     both devices compute the same winner, so a merge never ping-pongs.
 *  3. A missing `updatedAt` reads as oldest, which is how pre-sync rows behave.
 */
export function resolveRow({ local, remote, tombstone }: ResolveInput): MergeDecision {
  const localExists = local != null;
  if (!localExists && !remote) {
    return { action: "none", reason: tombstone ? "already-deleted" : "no-remote-row" };
  }

  if (tombstone) {
    if (!localExists) return { action: "none", reason: "already-deleted" };
    if (tsOf(local!.updatedAt) > tombstone.deletedAt) {
      return { action: "keep", reason: "edited-since-delete" };
    }
    return { action: "delete", reason: "tombstone" };
  }

  if (!localExists) return { action: "insert", reason: "new-row" };
  if (!remote) return { action: "none", reason: "no-remote-row" };

  const localTs = tsOf(local!.updatedAt);
  const remoteTs = tsOf(remote.updatedAt);
  if (remoteTs > localTs) return { action: "replace", reason: "remote-newer" };
  if (localTs > remoteTs) return { action: "skip", reason: "local-newer" };

  const localRev = local!.rev ?? 0;
  const remoteRev = remote.rev ?? 0;
  if (remoteRev > localRev) return { action: "replace", reason: "remote-newer" };
  if (localRev > remoteRev) return { action: "skip", reason: "local-newer" };

  // Same timestamp and same revision: break the tie on device id so both
  // sides pick the same copy.
  const localBy = local!.lastDeviceId ?? "";
  const remoteBy = remote.lastDeviceId ?? "";
  if (remoteBy > localBy) return { action: "replace", reason: "remote-newer" };
  if (localBy > remoteBy) return { action: "skip", reason: "local-newer" };
  return { action: "skip", reason: "identical" };
}

// ─── Exchange payload ────────────────────────────────────────────

export interface SyncRow<T = Record<string, unknown>> {
  key: IndexableType;
  row: T & SyncMeta;
}

export interface SyncPayload {
  deviceId: string;
  /** Bookmark this payload was built from (ms epoch, 0 = full state). */
  since: number;
  builtAt: number;
  rows: Partial<Record<SyncTableName, SyncRow[]>>;
  tombstones: TombstoneRec[];
  /** Tables whose binary payload was deliberately left out. */
  mediaOmitted: SyncTableName[];
}

/** Rows and tombstones changed after `sinceMs` — the export half of a sync. */
export async function collectSince(
  database: Dexie,
  sinceMs: number,
  opts: { includeMedia?: boolean } = {}
): Promise<SyncPayload> {
  const rows: Partial<Record<SyncTableName, SyncRow[]>> = {};
  const mediaOmitted: SyncTableName[] = [];

  for (const name of SYNC_TABLES) {
    if (!opts.includeMedia && MEDIA_TABLES.includes(name)) {
      mediaOmitted.push(name);
      continue;
    }
    const table = database.table(name);
    const collected: SyncRow[] = [];
    // One pass that yields the row AND its primary key — including compound
    // keys on the tag-junction tables, which are not `row.id`.
    await table.toCollection().each((row: SyncMeta & Record<string, unknown>, cursor: { primaryKey: IndexableType }) => {
      if (tsOf(row.updatedAt) > sinceMs) collected.push({ key: cursor.primaryKey, row });
    });
    if (collected.length > 0) rows[name] = collected;
  }

  const tombstones = (await database
    .table("tombstones")
    .where("deletedAt")
    .above(sinceMs)
    .toArray()) as TombstoneRec[];

  const identity = deviceIdentity();
  return { deviceId: identity.id, since: sinceMs, builtAt: Date.now(), rows, tombstones, mediaOmitted };
}

// ─── Deletions ──────────────────────────────────────────────────

/** Printable form of a row key — arrays for the tag-junction tables. */
export function entityIdOf(key: IndexableType): string {
  return Array.isArray(key) ? key.map((k) => String(k)).join("|") : String(key);
}

/**
 * Delete rows and record their tombstones in ONE transaction.
 *
 * Every delete goes through here, because a deletion is the only operation that
 * destroys the information a peer needs to agree with us. The tombstone is
 * written before the rows go: a crash between the two then leaves a tombstone
 * for a row that still exists (a peer just deletes it) rather than a vanished
 * row with no trace (a peer resurrects it forever).
 */
export async function deleteRowsWithTombstones(
  database: Dexie,
  table: SyncTableName,
  keys: readonly IndexableType[],
  deviceId: string = deviceIdentity().id
): Promise<number> {
  if (keys.length === 0) return 0;
  const target = database.table(table);
  const record = database.table("tombstones");
  const deletedAt = Date.now();
  const list = [...keys];
  return database.transaction("rw", [target, record], async (): Promise<number> => {
    const rows = (await target.bulkGet(list)) as (SyncMeta | undefined)[];
    const tombstones: TombstoneRec[] = list.map((key, i) => {
      const entityId = entityIdOf(key);
      return {
        id: `${table}:${entityId}`,
        table,
        entityId,
        key,
        deletedAt,
        rev: rows[i]?.rev ?? 0,
        deviceId,
      };
    });
    await record.bulkPut(tombstones);
    await target.bulkDelete(list); // returns void by Dexie's typings
    return list.length;
  });
}

export interface MergeReport {
  inserted: number;
  replaced: number;
  deleted: number;
  /** Rows an edit rescued from a stale delete — worth surfacing, not hiding. */
  keptOverTombstone: number;
  skipped: number;
  perTable: Partial<Record<SyncTableName, number>>;
  /**
   * Rows owned by the remote device that this device has no table for, or
   * records that failed to apply. Never silent.
   */
  errors: string[];
}

const emptyReport = (): MergeReport => ({
  inserted: 0,
  replaced: 0,
  deleted: 0,
  keptOverTombstone: 0,
  skipped: 0,
  perTable: {},
  errors: [],
});

/** Apply a payload to this database. Tombstones first, so a delete that lost
 *  a race to a local edit still gets the chance to be rejected by resolveRow. */
export async function applySyncPayload(database: Dexie, payload: SyncPayload): Promise<MergeReport> {
  const report = emptyReport();
  const bump = (name: SyncTableName) => {
    report.perTable[name] = (report.perTable[name] ?? 0) + 1;
  };

  await withStampsPaused(async () => {
    // 1. Deletions.
    for (const tombstone of payload.tombstones) {
      if (!isSyncTable(tombstone.table)) {
        report.errors.push(`tombstone for unknown table ${tombstone.table}`);
        continue;
      }
      const table = database.table(tombstone.table);
      try {
        const local = (await table.get(tombstone.key)) as SyncMeta | undefined;
        const decision = resolveRow({ local, tombstone });
        if (decision.action === "delete") {
          await table.delete(tombstone.key);
          report.deleted++;
          bump(tombstone.table);
        } else if (decision.action === "keep") {
          report.keptOverTombstone++;
        }
      } catch (err) {
        report.errors.push(`delete ${tombstone.table}:${tombstone.entityId} — ${String(err)}`);
      }
    }

    // 2. Rows.
    for (const [name, entries] of Object.entries(payload.rows) as [SyncTableName, SyncRow[]][]) {
      if (!isSyncTable(name)) {
        report.errors.push(`rows for unknown table ${name}`);
        continue;
      }
      const table = database.table(name);
      for (const entry of entries) {
        try {
          const local = (await table.get(entry.key)) as SyncMeta | undefined;
          const decision = resolveRow({ local, remote: entry.row });
          if (decision.action === "insert" || decision.action === "replace") {
            await table.put(entry.row);
            if (decision.action === "insert") report.inserted++;
            else report.replaced++;
            bump(name);
          } else {
            report.skipped++;
          }
        } catch (err) {
          report.errors.push(`put ${name} — ${String(err)}`);
        }
      }
    }
  });

  return report;
}

// ─── Bundle codec (the file transport we already have) ───────────
// A transport-agnostic payload as JSON. Dates serialize to ISO strings, which
// tsOf() reads back; keys are JSON-safe for single-column tables, and junction
// tables are exported only when they carry a compound key of primitives.

export function encodeBundle(payload: SyncPayload): string {
  return JSON.stringify({ ...payload, format: "openstudy-sync", version: 1 }, null, 0);
}

export interface DecodeResult {
  ok: boolean;
  payload?: SyncPayload;
  error?: string;
}

export function decodeBundle(json: string): DecodeResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return { ok: false, error: "Not valid JSON" };
  }
  const p = parsed as Partial<SyncPayload> & { format?: string };
  if (!p || p.format !== "openstudy-sync") {
    return { ok: false, error: "Not an OpenStudy sync bundle" };
  }
  if (typeof p.deviceId !== "string" || typeof p.rows !== "object" || p.rows === null) {
    return { ok: false, error: "Bundle is missing its device or payload" };
  }
  return {
    ok: true,
    payload: {
      deviceId: p.deviceId,
      since: typeof p.since === "number" ? p.since : 0,
      builtAt: typeof p.builtAt === "number" ? p.builtAt : Date.now(),
      rows: p.rows,
      tombstones: Array.isArray(p.tombstones) ? p.tombstones : [],
      mediaOmitted: Array.isArray(p.mediaOmitted) ? p.mediaOmitted : [],
    },
  };
}

/** Tables helper used by callers that need typed access. */
export type SyncTable = Table<Record<string, unknown>, IndexableType>;
