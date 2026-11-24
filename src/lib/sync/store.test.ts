/// <reference lib="dom" />
import "fake-indexeddb/auto";
import { afterEach, describe, expect, test } from "bun:test";

import type { SyncStore } from "./store";
import type { SyncRun } from "./types";

const { openStore } = await import("./store");

const run = (id: string): SyncRun => ({
  clientRunId: id,
  sourceName: `${id}.zip`,
  createdAt: 1,
  counts: { sorted: 1, skipped: 0, errors: 0 },
  rows: [],
});

let store: SyncStore;

afterEach(async () => {
  store.close();
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase("photo-sorter-sync");
    request.onsuccess = () => resolve();
    request.onerror = () => reject(new Error("IndexedDB cleanup failed"));
    request.onblocked = () => resolve();
  });
});

describe("IndexedDB sync store", () => {
  test("stores runs, settings and the outbox", async () => {
    store = await openStore();

    await store.putRuns([run("a"), run("b")]);
    const runs = await store.getRuns();
    expect(runs.map((item) => item.clientRunId)).toEqual(["a", "b"]);

    await store.putSettings({ labels: ["nature"], updatedAt: 10 });
    expect(await store.getSettings()).toEqual({ labels: ["nature"], updatedAt: 10 });

    await store.setOutbox(["a"]);
    expect(await store.getOutbox()).toEqual(["a"]);

    await store.deleteRuns(["a"]);
    const remaining = await store.getRuns();
    expect(remaining.map((item) => item.clientRunId)).toEqual(["b"]);
  });

  test("overwrites settings and clears the outbox", async () => {
    store = await openStore();

    await store.putSettings({ labels: ["old"], updatedAt: 1 });
    await store.putSettings({ labels: ["new"], updatedAt: 2 });
    expect(await store.getSettings()).toEqual({ labels: ["new"], updatedAt: 2 });

    await store.setOutbox(["a", "b"]);
    await store.setOutbox([]);
    expect(await store.getOutbox()).toEqual([]);
  });

  test("returns null when no settings were saved", async () => {
    store = await openStore();
    expect(await store.getSettings()).toBeNull();
  });
});
