import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import {
  type RawDump,
  SAFETY_DB,
  dismissResetNotice,
  listSnapshots,
  migrateLegacyLocalBackup,
  readResetNotice,
  readSnapshot,
  rescueBeforeReset,
  restoreRawDump,
  safetyDb,
  salvageDatabase,
  saveSnapshot,
  snapshotFilename,
} from "@/lib/safety-net";

const V2 = JSON.stringify({ version: 2, subjects: [] });

/** Build a raw IndexedDB database at a chosen version, bypassing Dexie. */
async function makeRawDb(name: string, version: number, store: string, row?: unknown) {
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.open(name, version);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(store, { keyPath: "id" });
    };
    req.onsuccess = () => {
      const conn = req.result;
      if (!row) {
        conn.close();
        return resolve();
      }
      const tx = conn.transaction(store, "readwrite");
      tx.objectStore(store).put(row);
      tx.oncomplete = () => {
        conn.close();
        resolve();
      };
      tx.onerror = () => reject(tx.error);
    };
    req.onerror = () => reject(req.error);
  });
}

beforeEach(async () => {
  await safetyDb.snapshots.clear();
  await safetyDb.meta.clear();
  localStorage.clear();
});

describe("snapshot storage", () => {
  it("survives deletion of the primary database", async () => {
    // The whole reason this store exists: the recovery path for a schema
    // mismatch deletes `studymax`, so a backup kept inside it dies with it.
    await saveSnapshot({ id: "latest", format: "v2", payload: V2, reason: "auto" });
    await db.delete();

    const back = await readSnapshot("latest");
    expect(back?.format).toBe("v2");
    expect(back?.payload).toBe(V2);
  });

  it("stores a raw dump as an object, so Date fields survive structured clone", async () => {
    const when = new Date("2026-01-02T03:04:05.000Z");
    const dump: RawDump = {
      kind: "raw",
      dbName: "studymax",
      version: 99,
      stores: { reviewLogs: [{ id: "r1", reviewedAt: when }] },
      unreadable: [],
      createdAt: when.getTime(),
    };
    await saveSnapshot({ id: "pre-reset", format: "raw", payload: dump, reason: "schema-mismatch" });

    const back = await readSnapshot("pre-reset");
    const payload = back?.payload as RawDump;
    expect(payload.version).toBe(99);
    expect((payload.stores.reviewLogs[0] as { reviewedAt: Date }).reviewedAt).toBeInstanceOf(Date);
  });

  it("reports whether a slot is populated", async () => {
    expect(await readSnapshot("latest")).toBeNull();
    await saveSnapshot({ id: "latest", format: "v2", payload: V2, reason: "auto" });
    expect((await readSnapshot("latest"))?.bytes).toBe(V2.length);
  });

  it("lists the newest snapshot first", async () => {
    await saveSnapshot({ id: "latest", format: "v2", payload: V2, reason: "auto" });
    await new Promise((r) => setTimeout(r, 5));
    await saveSnapshot({ id: "pre-reset", format: "raw", payload: { kind: "raw", dbName: "studymax", version: 9, stores: {}, unreadable: [], createdAt: Date.now() }, reason: "schema-mismatch" });

    const snaps = await listSnapshots();
    expect(snaps.map((s) => s.id)).toEqual(["pre-reset", "latest"]);
  });

  it("names a downloaded copy by slot and time", () => {
    expect(snapshotFilename({ id: "pre-reset", createdAt: Date.UTC(2026, 0, 2, 3, 4, 5) })).toBe(
      "openstudy-recovered-2026-01-02-03-04-05.json"
    );
    expect(snapshotFilename({ id: "latest", createdAt: 0 })).toBe(
      "openstudy-backup-1970-01-01-00-00-00.json"
    );
  });
});

describe("restoreRawDump", () => {
  const dump = (stores: Record<string, unknown[]>): RawDump => ({
    kind: "raw",
    dbName: "studymax",
    version: 10,
    stores,
    unreadable: [],
    createdAt: Date.now(),
  });

  it("writes each store through the table and counts the rows", async () => {
    const bulkPut = vi.fn().mockResolvedValue(undefined);
    const target = { table: vi.fn(() => ({ bulkPut })) };

    const res = await restoreRawDump(target, dump({ subjects: [{ id: "a" }, { id: "b" }] }));

    expect(res).toEqual({ restored: 2, skipped: [] });
    expect(target.table).toHaveBeenCalledWith("subjects");
    expect(bulkPut).toHaveBeenCalledWith([{ id: "a" }, { id: "b" }]);
  });

  it("reports a store it cannot write instead of aborting the rest", async () => {
    const target = {
      table: (name: string) => ({
        bulkPut: name === "ghosts" ? vi.fn().mockRejectedValue(new Error("no such table")) : vi.fn().mockResolvedValue(undefined),
      }),
    };

    const res = await restoreRawDump(target, dump({ ghosts: [{ id: "x" }], subjects: [{ id: "a" }] }));

    expect(res.skipped).toEqual(["ghosts"]);
    expect(res.restored).toBe(1);
  });

  it("ignores empty and malformed stores", async () => {
    const target = { table: vi.fn(() => ({ bulkPut: vi.fn().mockResolvedValue(undefined) })) };
    const res = await restoreRawDump(target, dump({ empty: [], missing: undefined as unknown as unknown[] }));
    expect(res).toEqual({ restored: 0, skipped: [] });
    expect(target.table).not.toHaveBeenCalled();
  });
});

// Measured, not assumed. These two facts decide where the recovery path can and
// cannot help, and both are counter-intuitive enough that they were got wrong
// once already while writing this module.
describe("dexie version behaviour this design rests on", () => {
  it("opens a NEWER on-disk schema without complaint", async () => {
    // So a downgraded deploy fails silently rather than loudly: the app happily
    // reads and writes a schema from a build it does not know. Nothing here can
    // rely on Dexie raising an error for that case.
    await makeRawDb("newer-schema-fixture", 100, "subjects");
    const Dexie = (await import("dexie")).default;
    const probe = new Dexie("newer-schema-fixture");
    probe.version(10).stores({ subjects: "id" });

    await expect(probe.open()).resolves.not.toThrow();
    expect(probe.backendDB().version).toBe(100);
    expect(await probe.table("subjects").count()).toBe(0);
    probe.close();
  });

  it("encodes its own version, so a raw IDB version is not the declared one", async () => {
    // This is why the app's v10 schema shows up on disk as `studymax@v100`, and
    // why comparing a raw IDB version against a declared version is meaningless.
    const Dexie = (await import("dexie")).default;
    const probe = new Dexie("version-encoding-fixture");
    probe.version(1).stores({ snapshots: "id" });
    await probe.open();

    const onDisk = (await indexedDB.databases()).find((d) => d.name === "version-encoding-fixture")?.version;
    expect(onDisk).not.toBe(probe.verno);
    probe.close();
  });
});

describe("salvageDatabase", () => {
  it("reads every store of a higher-version database", async () => {
    const name = "studymax-newer-fixture";
    await makeRawDb(name, 42, "notes", { id: "n1", title: "Recovered" });

    const dump = await salvageDatabase(name);

    expect(dump?.version).toBe(42);
    expect(dump?.stores.notes).toEqual([{ id: "n1", title: "Recovered" }]);
    expect(dump?.unreadable).toEqual([]);
  });

  it("resolves rather than hanging when the database does not exist", async () => {
    const dump = await salvageDatabase("studymax-absent-fixture");
    expect(dump?.stores).toEqual({});
  });
});

describe("legacy localStorage migration", () => {
  it("moves the old mirror into the safety database and frees the key", async () => {
    localStorage.setItem(SAFETY_DB.legacyLocalKey, V2);

    expect(await migrateLegacyLocalBackup()).toBe(true);
    expect((await readSnapshot("latest"))?.payload).toBe(V2);
    expect(localStorage.getItem(SAFETY_DB.legacyLocalKey)).toBeNull();
  });

  it("never clobbers a newer snapshot on the way in", async () => {
    await saveSnapshot({ id: "latest", format: "v2", payload: '{"version":2,"subjects":[{"new":true}]}', reason: "auto" });
    localStorage.setItem(SAFETY_DB.legacyLocalKey, V2);

    expect(await migrateLegacyLocalBackup()).toBe(false);
    expect((await readSnapshot("latest"))?.payload).toContain('"new"');
  });

  it("leaves a corrupt mirror out of the safety database", async () => {
    localStorage.setItem(SAFETY_DB.legacyLocalKey, "not json");
    expect(await migrateLegacyLocalBackup()).toBe(false);
    expect(await readSnapshot("latest")).toBeNull();
  });
});

describe("reset notice", () => {
  it("records that a reset happened until the user dismisses it", async () => {
    expect(await readResetNotice()).toBeNull();

    await rescueBeforeReset();

    const notice = await readResetNotice();
    expect(notice?.resetAt).toBeTypeOf("number");
    expect(notice?.dismissed).toBe(false);

    await dismissResetNotice();
    expect((await readResetNotice())?.dismissed).toBe(true);
  });

  it("saves nothing when there is nothing to rescue", async () => {
    localStorage.clear();
    const res = await rescueBeforeReset();
    expect(res).toEqual({ salvaged: false, rolling: false });
    expect(await readSnapshot("pre-reset")).toBeNull();
  });

  it("gets the rows out of the primary database before the reset deletes it", async () => {
    // The guarantee that matters: whatever else happens, the user's work is
    // copied somewhere the reset cannot reach before anything is deleted.
    await makeRawDb("studymax", 99, "subjects", { id: "s1", name: "Organic Chemistry" });

    const res = await rescueBeforeReset();

    expect(res.salvaged).toBe(true);
    const saved = await readSnapshot("pre-reset");
    const dump = saved?.payload as RawDump;
    expect(dump.version).toBe(99);
    expect(dump.stores.subjects).toEqual([{ id: "s1", name: "Organic Chemistry" }]);
  });
});
