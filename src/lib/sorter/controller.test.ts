import { describe, expect, mock, test } from "bun:test";

import type { ReportRow } from "../archive/naming";
import type { ArchiveProgress, SortArchiveResult } from "../archive/sort";
import type { Score } from "../model/protocol";
import type { SyncRun } from "../sync/types";
import { createSorterController, type SorterDeps, type SorterSnapshot } from "./controller";

const LABELS = ["people", "food"];
const SCORES: Score[] = [{ label: "people", score: 0.9 }];

const REPORT: ReportRow[] = [
  { source: "a.jpg", category: "people", score: 0.9, status: "sorted", error: "" },
  { source: "notes.txt", category: "", score: null, status: "skipped", error: "not an image" },
  { source: "broken.jpg", category: "", score: null, status: "error", error: "bad crc" },
];

function photo(name: string): File {
  return new File([`bytes-${name}`], name, { type: "image/jpeg" });
}

function archiveResult(): SortArchiveResult {
  return {
    blob: new Blob(["zip"]),
    fileName: "sorted.zip",
    report: REPORT,
    counts: { sorted: 1, skipped: 1, errors: 1 },
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
}

function harness(options: Partial<SorterDeps> = {}) {
  const clock = 1_700_000_000_000;
  let runId = 0;
  let urlId = 0;
  const revoked: string[] = [];
  const snapshots: SorterSnapshot[] = [];
  let sink: ((progress: { loaded: number; total: number }) => void) | null = null;

  const classify = mock<SorterDeps["classify"]>(
    options.classify ?? (async () => ({ scores: SCORES, ms: 12 })),
  );
  const sortArchive = mock<SorterDeps["sortArchive"]>(
    options.sortArchive ?? (async () => archiveResult()),
  );
  const classifyBatch = mock<SorterDeps["classifyBatch"]>(
    options.classifyBatch ?? (async () => []),
  );

  const controller = createSorterController({
    classify,
    classifyBatch,
    sortArchive,
    createUrl: () => `blob:${++urlId}`,
    revokeUrl: (url) => {
      revoked.push(url);
    },
    now: () => clock,
    uuid: () => `run-${++runId}`,
    onSnapshot: (snapshot) => {
      snapshots.push(snapshot);
    },
    setProgressSink: (next) => {
      sink = next;
    },
  });

  return {
    controller,
    classify,
    classifyBatch,
    sortArchive,
    snapshots,
    revoked,
    last(): SorterSnapshot {
      const last = snapshots.at(-1);

      if (last === undefined) {
        throw new Error("No snapshot emitted");
      }
      return last;
    },
    modelProgress(loaded: number, total: number): void {
      if (sink === null) {
        throw new Error("No progress sink registered");
      }
      sink({ loaded, total });
    },
  };
}

describe("createSorterController", () => {
  test("classifyFiles unshifts items and moves pending from increment to decrement", async () => {
    const gate = deferred<{ scores: Score[]; ms: number }>();
    const classify = mock<SorterDeps["classify"]>(async () => gate.promise);
    const h = harness({ classify });
    const first = photo("first.jpg");
    const second = photo("second.jpg");

    const work = h.controller.classifyFiles([first, second], LABELS);

    expect(h.last().pending).toBe(2);
    expect(h.last().busy).toBe(true);
    expect(h.last().items).toEqual([]);

    gate.resolve({ scores: SCORES, ms: 12 });
    await work;

    expect(classify).toHaveBeenCalledTimes(2);
    expect(classify).toHaveBeenNthCalledWith(1, first, LABELS);
    expect(classify).toHaveBeenNthCalledWith(2, second, LABELS);
    expect(h.snapshots.map((snapshot) => snapshot.pending)).toEqual([2, 1, 0]);
    expect(h.last().pending).toBe(0);
    expect(h.last().busy).toBe(false);
    expect(h.last().items.map((item) => [item.name, item.id, item.ms, item.scores])).toEqual([
      ["second.jpg", 2, 12, SCORES],
      ["first.jpg", 1, 12, SCORES],
    ]);
    expect(h.last().items.map((item) => item.url)).toEqual(["blob:2", "blob:1"]);
  });

  test("classifyFiles reports a failure with the file name and keeps going", async () => {
    const classify = mock<SorterDeps["classify"]>(async (file) => {
      if (file instanceof File && file.name === "bad.jpg") {
        throw new Error("model exploded");
      }
      return { scores: SCORES, ms: 7 };
    });
    const h = harness({ classify });

    await h.controller.classifyFiles([photo("ok.jpg"), photo("bad.jpg")], LABELS);

    expect(h.last().failure).toBe("bad.jpg: model exploded");
    expect(h.last().items.map((item) => item.name)).toEqual(["ok.jpg"]);
    expect(h.last().pending).toBe(0);
  });

  test("empty labels are rejected before any classify call", async () => {
    const h = harness();

    await h.controller.classifyFiles([photo("a.jpg")], []);

    expect(h.last().failure).toBe("Add at least one category");
    expect(h.classify).not.toHaveBeenCalled();
    expect(h.last().pending).toBe(0);
  });

  test("empty file list is a no-op", async () => {
    const h = harness();

    await h.controller.classifyFiles([], LABELS);

    expect(h.snapshots).toEqual([]);
    expect(h.classify).not.toHaveBeenCalled();
  });

  test("model progress yields a clamped percent and drives loadingModel while pending", async () => {
    const gate = deferred<{ scores: Score[]; ms: number }>();
    const h = harness({ classify: mock<SorterDeps["classify"]>(async () => gate.promise) });

    h.modelProgress(25, 100);
    expect(h.last().progress).toEqual({ loaded: 25, total: 100 });
    expect(h.last().percent).toBe(25);
    expect(h.last().loadingModel).toBe(false);

    const work = h.controller.classifyFiles([photo("a.jpg")], LABELS);

    expect(h.last().loadingModel).toBe(true);

    h.modelProgress(200, 100);
    expect(h.last().percent).toBe(100);
    expect(h.last().loadingModel).toBe(false);

    h.modelProgress(0, 0);
    expect(h.last().percent).toBe(0);

    gate.resolve({ scores: SCORES, ms: 5 });
    await work;

    expect(h.last().loadingModel).toBe(false);
  });

  test("sortArchiveFile returns a SyncRun and exposes the archive view", async () => {
    const progress: ArchiveProgress[] = [
      { done: 0, total: 3, current: "" },
      { done: 3, total: 3, current: "a.jpg" },
    ];
    const sortArchive = mock<SorterDeps["sortArchive"]>(
      async (_file, _labels, _classify, onProgress) => {
        progress.forEach(onProgress);
        return archiveResult();
      },
    );
    const h = harness({ sortArchive });
    const file = photo("holiday.zip");

    const run = await h.controller.sortArchiveFile(file, LABELS);

    expect(run).toEqual({
      clientRunId: "run-1",
      sourceName: "sorted.zip",
      createdAt: 1_700_000_000_000,
      counts: { sorted: 1, skipped: 1, errors: 1 },
      rows: REPORT,
    } satisfies SyncRun);
    expect(h.sortArchive).toHaveBeenCalledTimes(1);
    expect(h.sortArchive.mock.calls[0][0]).toBe(file);
    expect(h.sortArchive.mock.calls[0][1]).toEqual(LABELS);
    expect(h.sortArchive.mock.calls[0][4]).toBeDefined();

    const batch = [photo("batch-1.jpg"), photo("batch-2.jpg")];

    await h.sortArchive.mock.calls[0][4]?.(batch, LABELS);
    expect(h.classifyBatch).toHaveBeenCalledWith(batch, LABELS);

    const nested = photo("nested.jpg");

    await h.sortArchive.mock.calls[0][2](nested, LABELS);
    expect(h.classify).toHaveBeenCalledWith(nested, LABELS);
    expect(h.last().archiveResult).toEqual({
      name: "sorted.zip",
      url: "blob:1",
      counts: { sorted: 1, skipped: 1, errors: 1 },
      failures: [{ source: "broken.jpg", error: "bad crc" }],
    });
    expect(h.snapshots.map((snapshot) => snapshot.archiveProgress)).toEqual([
      { done: 0, total: 0, current: "holiday.zip" },
      ...progress,
      null,
    ]);
    expect(h.snapshots.map((snapshot) => snapshot.archivePercent)).toEqual([0, 0, 100, 0]);
    expect(h.snapshots.map((snapshot) => snapshot.archiveBusy)).toEqual([true, true, true, false]);
    expect(h.snapshots.map((snapshot) => snapshot.busy)).toEqual([true, true, true, false]);
    expect(h.last().archiveBusy).toBe(false);
    expect(h.last().archiveProgress).toBeNull();
  });

  test("sortArchiveFile sets failure and returns null when the archive fails", async () => {
    const sortArchive = mock<SorterDeps["sortArchive"]>(async () => {
      throw new Error("corrupt zip");
    });
    const h = harness({ sortArchive });

    const run = await h.controller.sortArchiveFile(photo("broken.zip"), LABELS);

    expect(run).toBeNull();
    expect(h.last().failure).toBe("broken.zip: corrupt zip");
    expect(h.last().archiveResult).toBeNull();
    expect(h.last().archiveBusy).toBe(false);
    expect(h.last().archiveProgress).toBeNull();
  });

  test("empty labels reject the archive before any sort call", async () => {
    const h = harness();

    const run = await h.controller.sortArchiveFile(photo("holiday.zip"), []);

    expect(run).toBeNull();
    expect(h.last().failure).toBe("Add at least one category");
    expect(h.sortArchive).not.toHaveBeenCalled();
  });

  test("a second archive revokes the previous archive URL", async () => {
    const h = harness();

    await h.controller.sortArchiveFile(photo("first.zip"), LABELS);
    expect(h.last().archiveResult?.url).toBe("blob:1");

    await h.controller.sortArchiveFile(photo("second.zip"), LABELS);

    expect(h.revoked).toEqual(["blob:1"]);
    expect(h.last().archiveResult?.url).toBe("blob:2");
  });

  test("dispose revokes every item URL and the last archive URL", async () => {
    const h = harness();

    await h.controller.classifyFiles([photo("a.jpg"), photo("b.jpg")], LABELS);
    await h.controller.sortArchiveFile(photo("holiday.zip"), LABELS);

    h.controller.dispose();

    expect([...h.revoked].sort()).toEqual(["blob:1", "blob:2", "blob:3"]);
  });

  test("labels are snapshotted at the start of each batch", async () => {
    const classifyGate = deferred<{ scores: Score[]; ms: number }>();
    const sortGate = deferred<SortArchiveResult>();
    const classify = mock<SorterDeps["classify"]>(async () => classifyGate.promise);
    const sortArchive = mock<SorterDeps["sortArchive"]>(async () => sortGate.promise);
    const h = harness({ classify, sortArchive });
    const labels = [...LABELS];

    const classifying = h.controller.classifyFiles([photo("a.jpg")], labels);
    labels.push("screenshots");

    classifyGate.resolve({ scores: SCORES, ms: 1 });
    await classifying;

    expect(classify.mock.calls[0][1]).toEqual(LABELS);

    const archiving = h.controller.sortArchiveFile(photo("holiday.zip"), labels);
    labels.push("transport");

    sortGate.resolve(archiveResult());
    await archiving;

    expect(h.sortArchive.mock.calls[0][1]).toEqual(["people", "food", "screenshots"]);
  });

  test("an archive already running cannot be started twice", async () => {
    const gate = deferred<SortArchiveResult>();
    const h = harness({
      sortArchive: mock<SorterDeps["sortArchive"]>(async () => gate.promise),
    });

    const first = h.controller.sortArchiveFile(photo("first.zip"), LABELS);
    const second = await h.controller.sortArchiveFile(photo("second.zip"), LABELS);

    expect(second).toBeNull();
    expect(h.sortArchive).toHaveBeenCalledTimes(1);

    gate.resolve(archiveResult());
    await first;
  });

  test("work completing after dispose does not add items or emits", async () => {
    const gate = deferred<{ scores: Score[]; ms: number }>();
    const h = harness({ classify: mock<SorterDeps["classify"]>(async () => gate.promise) });
    const work = h.controller.classifyFiles([photo("a.jpg")], LABELS);
    const emitted = h.snapshots.length;

    h.controller.dispose();
    gate.resolve({ scores: SCORES, ms: 1 });
    await work;

    expect(h.last().items).toEqual([]);
    expect(h.revoked).toEqual([]);
    expect(h.snapshots).toHaveLength(emitted);
  });

  test("model progress after dispose is ignored", () => {
    const h = harness();

    h.modelProgress(10, 100);
    const emitted = h.snapshots.length;

    h.controller.dispose();
    h.modelProgress(90, 100);

    expect(h.snapshots).toHaveLength(emitted);
    expect(h.last().percent).toBe(10);
  });

  test("an archive finishing after dispose creates no object URL", async () => {
    const gate = deferred<SortArchiveResult>();
    const h = harness({
      sortArchive: mock<SorterDeps["sortArchive"]>(async () => gate.promise),
    });
    const work = h.controller.sortArchiveFile(photo("holiday.zip"), LABELS);

    h.controller.dispose();
    gate.resolve(archiveResult());

    expect(await work).toBeNull();
    expect(h.revoked).toEqual([]);
    expect(h.last().archiveResult).toBeNull();
  });
});
