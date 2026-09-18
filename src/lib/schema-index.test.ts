// ─── Every indexed query must have an index (regression guard) ───
// Dexie does not check `.where("field")` against the schema at build time: it
// throws a SchemaError at RUNTIME, on the user's device, when the query runs.
// Two such bugs were live in this codebase — deleting a topic and restoring a
// backup with topic-owned bundles both threw — and neither was visible to any
// test, because each needed a specific action to trigger.
//
// This test reads the real schema out of lib/db.ts, then checks every
// `db.<table>.where("key")` / `.orderBy("key")` in the app against it. It is
// static, so it fails at review time rather than in someone's study session.

import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/** Index keys per table, merged across every `version(N).stores({...})` block. */
function declaredIndexes(): Map<string, Set<string>> {
  const source = readFileSync(join("src", "lib", "db.ts"), "utf8");
  const indexes = new Map<string, Set<string>>();

  for (const block of source.matchAll(/\.stores\(\{([\s\S]*?)\}\)/g)) {
    for (const entry of block[1].matchAll(/([A-Za-z0-9_]+)\s*:\s*("(?:[^"\\]|\\.)*"|null)/g)) {
      const table = entry[1];
      if (entry[2] === "null") {
        // `table: null` drops the table in this version.
        indexes.delete(table);
        continue;
      }
      const spec = JSON.parse(entry[2]) as string;
      // `&unique`, `*multiEntry` prefixes are not part of the key name; a
      // compound `[a+b]` stays bracketed, because Dexie queries it as
      // where("[a+b]") — its members are NOT queryable on their own.
      const keys = spec
        .split(",")
        .map((part) => part.trim())
        .filter(Boolean)
        .map((part) => part.replace(/^[&*]/, ""));
      indexes.set(table, new Set(keys));
    }
  }
  return indexes;
}

function sourceFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) sourceFiles(full, acc);
    else if (/\.(ts|tsx)$/.test(entry) && !/\.test\.tsx?$/.test(entry)) acc.push(full);
  }
  return acc;
}

describe("query keys are indexed", () => {
  it("parses a schema worth trusting", () => {
    const indexes = declaredIndexes();
    // Sanity-check the parser itself: if the schema format ever changes, this
    // fails loudly instead of silently passing every query below.
    expect(indexes.get("subjects")).toContain("name");
    expect(indexes.get("studySessions")).toContain("subjectId");
    expect(indexes.get("flashcards")).toContain("nextReview");
    expect(indexes.get("cardImages")).toContain("[cardId+side]");
    expect(indexes.size).toBeGreaterThan(15);
  });

  it("checks that the parser drops a table removed by a later version", () => {
    // The `spotify` table is created in v7 and dropped in v8 — a parser that
    // ignored `null` would claim indexes that no longer exist.
    expect(declaredIndexes().has("spotify")).toBe(false);
  });

  it("every db.<table>.where(...) / .orderBy(...) key exists in the schema", () => {
    const indexes = declaredIndexes();
    const offenders: string[] = [];
    const pattern = /db\.([a-zA-Z0-9_]+)\.(?:where|orderBy)\(\s*"([^"]+)"\s*\)/g;

    for (const file of sourceFiles("src")) {
      const relative = file.replace(/\\/g, "/");
      if (relative === join("src", "lib", "db.ts").replace(/\\/g, "/")) continue;
      for (const match of readFileSync(file, "utf8").matchAll(pattern)) {
        const [, table, key] = match;
        const known = indexes.get(table);
        if (!known) {
          // A table that does not exist in any version — also worth knowing.
          offenders.push(`${relative}: db.${table} is not a table`);
          continue;
        }
        if (!known.has(key)) {
          offenders.push(
            `${relative}: db.${table}.where("${key}") — "${key}" is not indexed (has: ${[...known].join(", ")})`
          );
        }
      }
    }

    expect(offenders, `Queries on unindexed keys throw SchemaError at runtime:\n${offenders.join("\n")}`).toEqual([]);
  });
});
