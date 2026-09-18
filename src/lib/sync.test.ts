// ─── Device-sync foundation tests (§19) ──────────────────────────
// Two levels, and the second is the one that matters:
//   1. the pure rules (stamps, the conflict resolver, the bundle codec)
//   2. a REAL two-database exchange — two OpenStudyDB instances with distinct
//      device ids, exchanging payloads both ways until they converge. That is
//      the property a transport will depend on, so it is proven here, offline,
//      before any network code exists.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { OpenStudyDB } from "@/lib/db";
import {
  applySyncPayload,
  collectSince,
  decodeBundle,
  deleteRowsWithTombstones,
  deviceIdentity,
  encodeBundle,
  installSyncHooks,
  nextStamps,
  resolveRow,
  setDeviceName,
  tsOf,
  type SyncPayload,
} from "@/lib/sync";

const note = (id: string, title = "Note") => ({
  id,
  topicId: null,
  title,
  content: "c",
  isPinned: false,
  createdAt: new Date(0),
  updatedAt: new Date(0),
});

// ─── 1. Pure rules ───────────────────────────────────────────────

describe("nextStamps", () => {
  it("starts a row at rev 1 and bumps it on every later write", () => {
    const at = new Date("2026-09-18T10:00:00Z");
    const created = nextStamps(undefined, "dev-a", at);
    expect(created).toEqual({ updatedAt: at, rev: 1, lastDeviceId: "dev-a" });
    const updated = nextStamps({ rev: 1 }, "dev-b", at);
    expect(updated.rev).toBe(2);
    expect(updated.lastDeviceId).toBe("dev-b");
  });

  it("treats a legacy row with no rev as rev 0", () => {
    expect(nextStamps({ updatedAt: new Date(0) }, "dev-a", new Date()).rev).toBe(1);
  });
});

describe("tsOf", () => {
  it("reads dates, ISO strings and epoch numbers alike, and unknown as oldest", () => {
    const iso = "2026-09-18T10:00:00.000Z";
    expect(tsOf(new Date(iso))).toBe(Date.parse(iso));
    expect(tsOf(iso)).toBe(Date.parse(iso));
    expect(tsOf(1234)).toBe(1234);
    expect(tsOf(null)).toBe(0);
    expect(tsOf(undefined)).toBe(0);
    expect(tsOf("not a date")).toBe(0);
    expect(tsOf(NaN)).toBe(0);
  });
});

describe("resolveRow — the conflict rule", () => {
  const t1 = "2026-09-18T10:00:00.000Z";
  const t2 = "2026-09-18T11:00:00.000Z";

  it("inserts a row this device has never seen", () => {
    expect(resolveRow({ remote: { updatedAt: t1 } })).toEqual({ action: "insert", reason: "new-row" });
  });

  it("the newer write wins, in both directions", () => {
    expect(resolveRow({ local: { updatedAt: t1 }, remote: { updatedAt: t2 } })).toEqual({
      action: "replace",
      reason: "remote-newer",
    });
    expect(resolveRow({ local: { updatedAt: t2 }, remote: { updatedAt: t1 } })).toEqual({
      action: "skip",
      reason: "local-newer",
    });
  });

  it("a missing timestamp reads as oldest, so a stamped row always beats a legacy one", () => {
    expect(resolveRow({ local: {}, remote: { updatedAt: t1 } }).action).toBe("replace");
    expect(resolveRow({ local: { updatedAt: t1 }, remote: {} }).action).toBe("skip");
  });

  it("breaks a timestamp tie on rev, then on device id — deterministically", () => {
    expect(resolveRow({ local: { updatedAt: t1, rev: 1 }, remote: { updatedAt: t1, rev: 2 } }).action).toBe("replace");
    expect(resolveRow({ local: { updatedAt: t1, rev: 3 }, remote: { updatedAt: t1, rev: 2 } }).action).toBe("skip");
    // Same clock, same version: the device id decides, and BOTH sides agree.
    const a = resolveRow({ local: { updatedAt: t1, rev: 1, lastDeviceId: "dev-a" }, remote: { updatedAt: t1, rev: 1, lastDeviceId: "dev-z" } });
    const b = resolveRow({ local: { updatedAt: t1, rev: 1, lastDeviceId: "dev-z" }, remote: { updatedAt: t1, rev: 1, lastDeviceId: "dev-a" } });
    expect(a).toEqual({ action: "replace", reason: "remote-newer" });
    expect(b).toEqual({ action: "skip", reason: "local-newer" });
  });

  it("identical copies are a no-op", () => {
    const row = { updatedAt: t1, rev: 1, lastDeviceId: "dev-a" };
    expect(resolveRow({ local: row, remote: { ...row } })).toEqual({ action: "skip", reason: "identical" });
  });

  it("a tombstone deletes an untouched row, and an edit since the delete wins", () => {
    const tombstone = { deletedAt: Date.parse(t1), deviceId: "dev-a" };
    expect(resolveRow({ local: { updatedAt: t1 }, tombstone })).toEqual({ action: "delete", reason: "tombstone" });
    // Edited after the delete: deleting someone's newer work is the one outcome
    // that must never happen silently.
    expect(resolveRow({ local: { updatedAt: t2 }, tombstone })).toEqual({
      action: "keep",
      reason: "edited-since-delete",
    });
    // A tombstone for a row that is already gone changes nothing.
    expect(resolveRow({ tombstone })).toEqual({ action: "none", reason: "already-deleted" });
  });
});

// ─── 2. Hooks, deletions, and a real two-device exchange ──────────

describe("two databases, one convergent state", () => {
  let a: OpenStudyDB;
  let b: OpenStudyDB;

  beforeEach(async () => {
    for (const name of ["openstudy-sync-a", "openstudy-sync-b"]) {
      const tmp = new OpenStudyDB(name);
      await tmp.delete().catch(() => {});
      tmp.close();
    }
    a = new OpenStudyDB("openstudy-sync-a");
    b = new OpenStudyDB("openstudy-sync-b");
    installSyncHooks(a, { deviceId: () => "device-a" });
    installSyncHooks(b, { deviceId: () => "device-b" });
    await a.open();
    await b.open();
  });

  // Close both before the next `beforeEach` deletes them, or Dexie logs a
  // "another connection wants to delete" warning on every test.
  afterEach(() => {
    a.close();
    b.close();
  });

  async function exchange(from: OpenStudyDB, to: OpenStudyDB, since = 0) {
    const payload = await collectSince(from, since);
    return { payload, report: await applySyncPayload(to, payload) };
  }

  it("stamps every create and update through the hooks", async () => {
    await a.notes.add(note("n1"));
    const created = await a.notes.get("n1");
    expect(created?.rev).toBe(1);
    expect(created?.lastDeviceId).toBe("device-a");
    expect(tsOf(created?.updatedAt)).toBeGreaterThan(0);

    await a.notes.update("n1", { title: "Edited" });
    const updated = await a.notes.get("n1");
    expect(updated?.rev).toBe(2);
    await a.notes.update("n1", { title: "Edited again" });
    expect((await a.notes.get("n1"))?.rev).toBe(3);
  });

  it("records a tombstone and removes the row in one transaction", async () => {
    await a.notes.add(note("n1"));
    await a.notes.add(note("n2"));
    const removed = await deleteRowsWithTombstones(a, "notes", ["n1"], "device-a");
    expect(removed).toBe(1);
    expect(await a.notes.get("n1")).toBeUndefined();
    expect(await a.notes.count()).toBe(1);
    const tombstones = await a.tombstones.toArray();
    expect(tombstones).toHaveLength(1);
    expect(tombstones[0]).toMatchObject({ table: "notes", entityId: "n1", key: "n1", deviceId: "device-a" });
    expect(tombstones[0].rev).toBe(1);
  });

  it("propagates creates in both directions", async () => {
    await a.notes.add(note("from-a", "A wrote this"));
    await exchange(a, b);
    expect((await b.notes.get("from-a"))?.title).toBe("A wrote this");

    await b.notes.add(note("from-b", "B wrote this"));
    await exchange(b, a);
    expect((await a.notes.get("from-b"))?.title).toBe("B wrote this");
  });

  it("the newer edit wins wherever it was made", async () => {
    await a.notes.add(note("shared", "original"));
    await exchange(a, b);

    // B edits, A has not seen it yet.
    await b.notes.update("shared", { title: "B's later edit" });
    let { report } = await exchange(b, a);
    expect((await a.notes.get("shared"))?.title).toBe("B's later edit");
    expect(report.replaced).toBe(1);

    // A edits after that — from A's perspective it is the newer write.
    await a.notes.update("shared", { title: "A's newest edit" });
    ({ report } = await exchange(a, b));
    expect((await b.notes.get("shared"))?.title).toBe("A's newest edit");
    expect(report.replaced).toBe(1);

    // Replaying an older payload never rolls a row backwards.
    const stale: SyncPayload = {
      deviceId: "device-b",
      since: 0,
      builtAt: Date.now(),
      rows: { notes: [{ key: "shared", row: { ...note("shared", "original"), rev: 1, updatedAt: new Date(0) } }] },
      tombstones: [],
      mediaOmitted: [],
    };
    const replay = await applySyncPayload(b, stale);
    expect((await b.notes.get("shared"))?.title).toBe("A's newest edit");
    expect(replay.skipped).toBeGreaterThanOrEqual(0);
  });

  it("propagates deletions instead of resurrecting the row", async () => {
    await a.notes.add(note("doomed"));
    await exchange(a, b);
    expect(await b.notes.get("doomed")).toBeDefined();

    await deleteRowsWithTombstones(a, "notes", ["doomed"]);
    const { report } = await exchange(a, b);
    expect(await b.notes.get("doomed")).toBeUndefined();
    expect(report.deleted).toBe(1);

    // And the deletion keeps holding on a later full exchange in either
    // direction — no ping-pong resurrection.
    await exchange(b, a);
    await exchange(a, b);
    expect(await a.notes.get("doomed")).toBeUndefined();
    expect(await b.notes.get("doomed")).toBeUndefined();
  });

  it("an edit made after a delete rescues the row, and says so", async () => {
    await a.notes.add(note("contested", "before"));
    await exchange(a, b);

    await deleteRowsWithTombstones(a, "notes", ["contested"]);
    // B edits it *after* the delete: that edit is newer than the tombstone.
    await new Promise((r) => setTimeout(r, 5));
    await b.notes.update("contested", { title: "work B did after A deleted it" });

    const { report } = await exchange(a, b);
    expect(report.keptOverTombstone).toBe(1);
    expect((await b.notes.get("contested"))?.title).toBe("work B did after A deleted it");

    // The rescued row then travels back to A, so the two devices agree.
    await exchange(b, a);
    expect((await a.notes.get("contested"))?.title).toBe("work B did after A deleted it");
  });

  it("incremental sync only carries what changed since the bookmark", async () => {
    await a.notes.add(note("old"));
    const bookmark = Date.now();
    await new Promise((r) => setTimeout(r, 5));
    await a.notes.add(note("new"));

    const payload = await collectSince(a, bookmark);
    expect(payload.rows.notes?.map((r) => r.key)).toEqual(["new"]);

    // A full state exchange still carries everything.
    const full = await collectSince(a, 0);
    expect(full.rows.notes?.map((r) => r.key).sort()).toEqual(["new", "old"]);
  });

  it("syncs compound-key junction rows with their real keys", async () => {
    const tag = { id: "tag-1", name: "biology" };
    await a.tags.add(tag);
    await a.noteTags.add({ noteId: "n1", tagId: "tag-1" });
    await exchange(a, b);
    expect(await b.noteTags.count()).toBe(1);
    // The key round-tripped as the compound array, so a peer can delete it.
    const payload = await collectSince(a, 0);
    expect(payload.rows.noteTags?.[0].key).toEqual(["n1", "tag-1"]);
  });

  it("leaves binary media out of a JSON exchange and says which tables it skipped", async () => {
    await a.cardImages.add({
      id: "img-1",
      cardId: "c1",
      side: "front",
      blob: new Blob(["bytes"], { type: "image/png" }),
      type: "image/png",
      name: "x.png",
      regions: null,
      createdAt: new Date(),
    });
    const payload = await collectSince(a, 0);
    expect(payload.rows.cardImages).toBeUndefined();
    expect(payload.mediaOmitted).toContain("cardImages");
  });

  it("converges: after exchanging both ways the two devices hold the same rows", async () => {
    await a.subjects.add({ id: "s-a", name: "Physics", color: "#fff", icon: "x", createdAt: new Date(), updatedAt: new Date() });
    await exchange(a, b);
    await b.topics.add({ id: "t-b", subjectId: "s-a", name: "Waves", order: 0, createdAt: new Date(), updatedAt: new Date() });
    await exchange(b, a);
    await b.subjects.update("s-a", { name: "Physics (B)" });
    await exchange(b, a);
    await deleteRowsWithTombstones(a, "topics", ["t-b"]);
    await exchange(a, b);

    const strip = <T,>(rows: T[]): T[] =>
      [...rows].sort((x, y) => String((x as { id: string }).id).localeCompare(String((y as { id: string }).id)));

    expect(strip(await a.subjects.toArray())).toEqual(strip(await b.subjects.toArray()));
    expect(await b.topics.count()).toBe(0);
    expect(await a.topics.count()).toBe(0);
    expect((await b.subjects.get("s-a"))?.name).toBe("Physics (B)");
  });

  it("does not stamp rows that arrive from another device", async () => {
    await a.notes.add(note("n1"));
    const payload = await collectSince(a, 0);
    const remoteRev = payload.rows.notes?.[0].row.rev;
    await applySyncPayload(b, payload);
    const landed = await b.notes.get("n1");
    // Applying must preserve the writer's metadata, not claim the row as B's:
    // restamping here would make every received row look newer than its source.
    expect(landed?.rev).toBe(remoteRev);
    expect(landed?.lastDeviceId).toBe("device-a");
  });
});

// ─── Bundle codec (the file transport that exists today) ─────────

describe("sync bundle codec", () => {
  it("round-trips a payload", () => {
    const payload: SyncPayload = {
      deviceId: "device-a",
      since: 0,
      builtAt: 1,
      rows: { notes: [{ key: "n1", row: { ...note("n1"), rev: 2, updatedAt: new Date("2026-09-18T10:00:00Z") } }] },
      tombstones: [
        { id: "notes:n9", table: "notes", entityId: "n9", key: "n9", deletedAt: 99, rev: 1, deviceId: "device-a" },
      ],
      mediaOmitted: ["cardImages"],
    };
    const decoded = decodeBundle(encodeBundle(payload));
    expect(decoded.ok).toBe(true);
    expect(decoded.payload?.rows.notes?.[0].key).toBe("n1");
    expect(decoded.payload?.tombstones[0].entityId).toBe("n9");
    expect(decoded.payload?.mediaOmitted).toEqual(["cardImages"]);
    // Dates come back as ISO strings, which the merge reads correctly.
    expect(tsOf(decoded.payload?.rows.notes?.[0].row.updatedAt)).toBe(Date.parse("2026-09-18T10:00:00Z"));
  });

  it("rejects anything that is not a sync bundle", () => {
    expect(decodeBundle("not json").ok).toBe(false);
    expect(decodeBundle(JSON.stringify({ version: 2, subjects: [] })).ok).toBe(false);
    expect(decodeBundle(JSON.stringify({ format: "openstudy-sync" })).ok).toBe(false);
  });
});

describe("device identity", () => {
  it("is stable across calls and can be renamed", () => {
    const first = deviceIdentity();
    expect(deviceIdentity().id).toBe(first.id);
    const renamed = setDeviceName("Pixel 9");
    expect(renamed.name).toBe("Pixel 9");
    expect(deviceIdentity().name).toBe("Pixel 9");
    setDeviceName("This device");
  });

  it("refuses to adopt an empty name", () => {
    expect(setDeviceName("   ").name).toBe("This device");
  });
});
