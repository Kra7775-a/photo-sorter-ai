import { describe, expect, test } from "bun:test";

import type { ReportRow } from "../archive/naming";
import { mergeRuns, mergeSettings, pendingUploads } from "./merge";
import type { SyncRun, SyncSettings } from "./types";

function reportRow(source: string): ReportRow {
  return { source, category: "cats", score: 0.9, status: "sorted", error: "" };
}

function makeRun(
  clientRunId: string,
  createdAt: number,
  overrides: Partial<SyncRun> = {},
): SyncRun {
  return {
    clientRunId,
    sourceName: `${clientRunId}.zip`,
    createdAt,
    counts: { sorted: 1, skipped: 0, errors: 0 },
    rows: [reportRow(`${clientRunId}.jpg`)],
    ...overrides,
  };
}

describe("mergeRuns", () => {
  test("keeps one record per clientRunId without duplicating", () => {
    const localA = makeRun("a", 1);
    const localB = makeRun("b", 2);
    const remoteA = makeRun("a", 1);
    const remoteC = makeRun("c", 3);

    const merged = mergeRuns([localA, localB], [remoteA, remoteC]);

    expect(merged).toHaveLength(3);
    expect(merged.map((run) => run.clientRunId)).toEqual(["a", "b", "c"]);
  });

  test("picks the newer record on a createdAt conflict", () => {
    const older = makeRun("same", 100, { sourceName: "old.zip" });
    const newer = makeRun("same", 200, { sourceName: "new.zip" });

    expect(mergeRuns([older], [newer])).toEqual([newer]);
    expect(mergeRuns([newer], [older])).toEqual([newer]);
  });

  test("keeps serverId from either record when the winner has none", () => {
    const uploaded = makeRun("same", 100, { serverId: "srv-1" });
    const pending = makeRun("same", 200);

    const merged = mergeRuns([pending], [uploaded]);

    expect(merged).toHaveLength(1);
    expect(merged[0].sourceName).toBe(pending.sourceName);
    expect(merged[0].serverId).toBe("srv-1");
    expect(pendingUploads(merged)).toEqual([]);
  });

  test("keeps the winning record's serverId when both have one", () => {
    const older = makeRun("same", 100, { serverId: "srv-old" });
    const newer = makeRun("same", 200, { serverId: "srv-new" });

    expect(mergeRuns([older], [newer])[0].serverId).toBe("srv-new");
    expect(mergeRuns([newer], [older])[0].serverId).toBe("srv-new");
  });

  test("handles empty inputs", () => {
    const local = makeRun("a", 1);

    expect(mergeRuns([], [])).toEqual([]);
    expect(mergeRuns([local], [])).toEqual([local]);
    expect(mergeRuns([], [local])).toEqual([local]);
  });
});

describe("mergeSettings", () => {
  const older: SyncSettings = { labels: ["old"], updatedAt: 100 };
  const newer: SyncSettings = { labels: ["new"], updatedAt: 200 };

  test("picks the newer settings in either direction", () => {
    expect(mergeSettings(older, newer)).toEqual(newer);
    expect(mergeSettings(newer, older)).toEqual(newer);
  });

  test("returns the non-null side or null", () => {
    expect(mergeSettings(null, newer)).toEqual(newer);
    expect(mergeSettings(newer, null)).toEqual(newer);
    expect(mergeSettings(null, null)).toBeNull();
  });
});

describe("pendingUploads", () => {
  test("returns only runs without serverId, preserving order", () => {
    const pendingA = makeRun("a", 1);
    const synced = makeRun("b", 2, { serverId: "srv-b" });
    const pendingC = makeRun("c", 3);
    const emptyServerId = makeRun("d", 4, { serverId: "" });

    expect(pendingUploads([pendingA, synced, pendingC, emptyServerId])).toEqual([
      pendingA,
      pendingC,
    ]);
  });

  test("handles an empty input", () => {
    expect(pendingUploads([])).toEqual([]);
  });
});
