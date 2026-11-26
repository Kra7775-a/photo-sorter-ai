import { afterEach, describe, expect, test } from "bun:test";

import {
  BlobReader,
  BlobWriter,
  TextReader,
  TextWriter,
  ZipReader,
  ZipWriter,
  type Entry,
} from "@zip.js/zip.js";

import type { Score } from "../model/protocol";
import {
  BATCH_SIZE,
  sortArchive,
  createZipLoader,
  type ArchiveProgress,
  type ClassifyBatch,
  type ZipApi,
} from "./sort";

const readers: ZipReader<Blob>[] = [];

afterEach(async () => {
  for (const reader of readers.splice(0)) {
    await reader.close();
  }
});

async function makeArchive(files: Array<{ name: string; data: string }>): Promise<File> {
  const writer = new ZipWriter<Blob>(new BlobWriter("application/zip"), { useWebWorkers: false });

  for (const file of files) {
    await writer.add(file.name, new TextReader(file.data), { level: 0, useWebWorkers: false });
  }

  const blob = await writer.close();

  return new File([blob], "photos.zip", { type: "application/zip" });
}

/** Flips one byte inside a stored entry so its CRC no longer matches. */
async function corruptData(file: File, needle: string): Promise<File> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const marker = new TextEncoder().encode(needle);
  const at = bytes.findIndex((_, index) =>
    marker.every((value, offset) => bytes[index + offset] === value),
  );

  if (at === -1) {
    throw new Error(`Marker ${needle} not found`);
  }

  bytes[at] ^= 0xff;

  return new File([bytes], file.name, { type: file.type });
}

async function readArchive(blob: Blob): Promise<{ entries: Entry[]; names: string[] }> {
  const reader = new ZipReader(new BlobReader(blob), { useWebWorkers: false });

  readers.push(reader);

  const entries = await reader.getEntries();

  return { entries, names: entries.map((entry) => entry.filename).sort() };
}

async function orderedEntryNames(blob: Blob): Promise<string[]> {
  const reader = new ZipReader(new BlobReader(blob), { useWebWorkers: false });

  readers.push(reader);

  const entries = await reader.getEntries();

  return entries.map((entry) => entry.filename);
}

async function readText(entries: Entry[], name: string): Promise<string> {
  const entry = entries.find((candidate) => candidate.filename === name);

  if (!entry || entry.directory) {
    throw new Error(`File entry ${name} not found`);
  }

  return entry.getData(new TextWriter());
}

/** Confident stub with a clear runner-up so the decision stays out of review. */
const scoresFor = (label: string, score: number): Score[] => [
  { label, score },
  { label: "other", score: score - 0.4 },
];

async function rejectionMessage(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }

  throw new Error("Expected the promise to reject");
}

describe("sortArchive", () => {
  test("sorts images by the highest score, dedupes names and skips non-images", async () => {
    const input = await makeArchive([
      { name: "album/cat.jpg", data: "cat" },
      { name: "other/cat.jpg", data: "cat" },
      { name: "album/notes.txt", data: "ignore me" },
      { name: "album/dog.png", data: "dog" },
    ]);
    const progress: ArchiveProgress[] = [];
    const result = await sortArchive(
      input,
      ["animals", "people", "nature"],
      async (image) =>
        (await image.text()) === "cat"
          ? // Intentionally not sorted by score: the sorter must pick the maximum.
            {
              scores: [
                { label: "animals", score: 0.2 },
                { label: "people", score: 0.7 },
              ],
            }
          : { scores: scoresFor("nature", 0.8) },
      { onProgress: (next) => progress.push(next) },
    );

    expect(result.fileName).toBe("photos-sorted.zip");
    expect(result.counts).toEqual({ errors: 0, skipped: 1, sorted: 3, review: 0 });

    const { entries, names } = await readArchive(result.blob);

    expect(names).toEqual(["nature/dog.png", "people/cat (2).jpg", "people/cat.jpg", "report.csv"]);
    expect(progress[0]).toEqual({ current: "", done: 0, total: 4 });
    expect(progress.at(-1)).toEqual({ current: "album/dog.png", done: 4, total: 4 });
    expect(progress).toHaveLength(5);

    const report = await readText(entries, "report.csv");

    expect(report).toContain("album/cat.jpg,people,0.7000,0.5000,people,animals,sorted,");
    expect(report).toContain("album/notes.txt,,,,,,skipped,not a supported image");
  });

  test("refuses archives whose entry names escape the output directory", async () => {
    const input = await makeArchive([{ name: "../../etc/passwd.jpg", data: "cat" }]);
    const message = rejectionMessage(
      sortArchive(input, ["people"], async () => ({ scores: scoresFor("people", 0.9) })),
    );

    expect(await message).toBe("Unsafe filename");
  });

  test("records classification failures in the report and continues", async () => {
    const input = await makeArchive([
      { name: "a/fail.jpg", data: "fail" },
      { name: "a/ok.jpg", data: "ok" },
    ]);
    const result = await sortArchive(input, ["nature"], async (image) => {
      if ((await image.text()) === "fail") {
        throw new Error("decode failed");
      }

      return { scores: scoresFor("nature", 0.9) };
    });

    expect(result.counts).toEqual({ errors: 1, skipped: 0, sorted: 1, review: 0 });

    const { entries, names } = await readArchive(result.blob);

    expect(names).toEqual(["nature/ok.jpg", "report.csv"]);

    const report = await readText(entries, "report.csv");

    expect(report).toContain("a/fail.jpg,,,,,,error,decode failed");
    expect(report).toContain("a/ok.jpg,nature,0.9000,0.4000,nature,other,sorted,");
  });

  test("records decompression failures in the report and continues", async () => {
    const pristine = await makeArchive([
      { name: "a/bad.jpg", data: "corrupt-me" },
      { name: "a/good.jpg", data: "good" },
    ]);
    const input = await corruptData(pristine, "corrupt-me");
    const result = await sortArchive(input, ["nature"], async () => ({
      scores: scoresFor("nature", 0.9),
    }));

    expect(result.counts).toEqual({ errors: 1, skipped: 0, sorted: 1, review: 0 });

    const { entries, names } = await readArchive(result.blob);

    expect(names).toEqual(["nature/good.jpg", "report.csv"]);

    const report = await readText(entries, "report.csv");

    expect(report).toContain("a/bad.jpg,,,,,,error,");
    expect(report).toContain("a/good.jpg,nature,0.9000,0.4000,nature,other,sorted,");
  });

  test("writes the report even when the archive has no images", async () => {
    const input = await makeArchive([{ name: "readme.txt", data: "hello" }]);
    const result = await sortArchive(input, ["nature"], async () => {
      throw new Error("must not be called");
    });

    expect(result.counts).toEqual({ errors: 0, skipped: 1, sorted: 0, review: 0 });

    const { entries, names } = await readArchive(result.blob);

    expect(names).toEqual(["report.csv"]);
    expect(await readText(entries, "report.csv")).toContain(
      "readme.txt,,,,,,skipped,not a supported image",
    );
  });

  test("rejects an empty label list before reading the archive", async () => {
    const input = await makeArchive([{ name: "cat.jpg", data: "cat" }]);
    let called = false;
    const message = rejectionMessage(
      sortArchive(input, [], async () => {
        called = true;
        return { scores: [] };
      }),
    );

    expect(await message).toBe("At least one category is required");
    expect(called).toBe(false);
  });

  test("moves low-confidence images to review/ with evidence in the report", async () => {
    const input = await makeArchive([
      { name: "album/uncertain.jpg", data: "uncertain" },
      { name: "album/clear.jpg", data: "clear" },
    ]);
    const result = await sortArchive(input, ["buildings", "graphics", "people"], async (image) =>
      (await image.text()) === "uncertain"
        ? {
            scores: [
              { label: "buildings", score: 0.5 },
              { label: "graphics", score: 0.3 },
            ],
          }
        : {
            scores: [
              { label: "people", score: 0.9 },
              { label: "buildings", score: 0.1 },
            ],
          },
    );

    expect(result.counts).toEqual({ errors: 0, skipped: 0, sorted: 1, review: 1 });

    const { entries, names } = await readArchive(result.blob);

    expect(names).toEqual(["people/clear.jpg", "report.csv", "review/uncertain.jpg"]);
    expect(names).toHaveLength(3);

    const reviewRow = result.report.find((row) => row.status === "review");

    expect(reviewRow).toEqual({
      source: "album/uncertain.jpg",
      category: "review",
      score: 0.5,
      margin: 0.2,
      candidate: "buildings",
      runnerUp: "graphics",
      status: "review",
      error: "",
    });
    expect(await readText(entries, "report.csv")).toContain(
      "album/uncertain.jpg,review,0.5000,0.2000,buildings,graphics,review,",
    );
  });

  test("defers a confident-looking image with a narrow margin", async () => {
    const input = await makeArchive([{ name: "pie mask.png", data: "pie" }]);
    const result = await sortArchive(input, ["buildings", "graphics"], async () => ({
      scores: [
        { label: "buildings", score: 0.9011 },
        { label: "graphics", score: 0.88 },
      ],
    }));

    expect(result.counts).toEqual({ errors: 0, skipped: 0, sorted: 0, review: 1 });

    const { names } = await readArchive(result.blob);

    expect(names).toEqual(["report.csv", "review/pie mask.png"]);
    expect(result.report[0].status).toBe("review");
  });

  test("deduplicates review filenames like category folders", async () => {
    const input = await makeArchive([
      { name: "a/cat.jpg", data: "a" },
      { name: "b/cat.jpg", data: "b" },
    ]);
    const result = await sortArchive(input, ["buildings", "graphics"], async () => ({
      scores: [
        { label: "buildings", score: 0.5 },
        { label: "graphics", score: 0.3 },
      ],
    }));

    expect(result.counts.review).toBe(2);

    const { names } = await readArchive(result.blob);

    expect(names).toEqual(["report.csv", "review/cat (2).jpg", "review/cat.jpg"]);
  });

  test("keeps empty classification results in _unsorted with null evidence", async () => {
    const input = await makeArchive([{ name: "album/unknown.jpg", data: "unknown" }]);
    const result = await sortArchive(input, ["people"], async () => ({ scores: [] }));

    expect(result.counts).toEqual({ errors: 0, skipped: 0, sorted: 1, review: 0 });
    expect(result.report[0]).toEqual({
      source: "album/unknown.jpg",
      category: "_unsorted",
      score: null,
      margin: null,
      candidate: "",
      runnerUp: null,
      status: "sorted",
      error: "",
    });

    const { names } = await readArchive(result.blob);

    expect(names).toEqual(["_unsorted/unknown.jpg", "report.csv"]);
  });

  const neverClassify = async (): Promise<{ scores: Score[] }> => {
    throw new Error("per-image classify must not run");
  };

  test("classifies a full batch in one call and keeps input order", async () => {
    const names = ["alpha", "bravo", "charlie", "delta", "echo", "foxtrot", "golf", "hotel"];
    const sources = names.map((name, index) => `${index}-${name}.jpg`);
    const input = await makeArchive(
      names.map((name, index) => ({ name: sources[index], data: name })),
    );
    const calls: Blob[][] = [];
    const progress: ArchiveProgress[] = [];
    const classifyBatch: ClassifyBatch = async (images, labels) => {
      calls.push(images);
      expect(labels).toEqual(["people", "nature"]);

      return Promise.all(
        images.map(async (image) => ({ scores: scoresFor(await image.text(), 0.9), ms: 2 })),
      );
    };

    const result = await sortArchive(
      input,
      ["people", "nature"],
      neverClassify,
      { onProgress: (next) => progress.push(next) },
      classifyBatch,
    );

    expect(BATCH_SIZE).toBe(8);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toHaveLength(8);
    expect(await Promise.all(calls[0].map((image) => image.text()))).toEqual(names);
    expect(result.report.map((row) => row.source)).toEqual(sources);
    expect(result.report.map((row) => row.category)).toEqual(names);
    expect(await orderedEntryNames(result.blob)).toEqual([
      ...names.map((name, index) => `${name}/${index}-${name}.jpg`),
      "report.csv",
    ]);
    expect(progress.map((next) => next.done)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    expect(progress.map((next) => next.current)).toEqual(["", ...sources]);
  });

  test("splits nine images into a full batch and a one-image tail", async () => {
    const names = Array.from({ length: 9 }, (_, index) => `name${index}`);
    const sources = names.map((name, index) => `${index}-${name}.png`);
    const input = await makeArchive(
      names.map((name, index) => ({ name: sources[index], data: name })),
    );
    const calls: string[][] = [];
    const classifyBatch: ClassifyBatch = async (images) => {
      const texts = await Promise.all(images.map((image) => image.text()));

      calls.push(texts);

      return texts.map((text) => ({ scores: scoresFor(text, 0.9), ms: 1 }));
    };
    const progress: ArchiveProgress[] = [];

    const result = await sortArchive(
      input,
      ["people"],
      neverClassify,
      { onProgress: (next) => progress.push(next) },
      classifyBatch,
    );

    expect(calls).toEqual([names.slice(0, 8), names.slice(8)]);
    expect(result.report.map((row) => row.source)).toEqual(sources);
    expect(progress).toHaveLength(10);
    expect(progress.at(-1)?.current).toBe(sources[8]);
  });

  test("a rejected batch marks every image as an error and still writes report.csv", async () => {
    const sources = ["a/first.jpg", "b/second.jpg", "c/third.jpg"];
    const input = await makeArchive(sources.map((source) => ({ name: source, data: "image" })));
    const progress: ArchiveProgress[] = [];
    const classifyBatch: ClassifyBatch = async () => {
      throw new Error("worker exploded");
    };

    const result = await sortArchive(
      input,
      ["people"],
      neverClassify,
      { onProgress: (next) => progress.push(next) },
      classifyBatch,
    );

    expect(result.counts).toEqual({ errors: 3, skipped: 0, sorted: 0, review: 0 });
    expect(result.report.map((row) => row.source)).toEqual(sources);
    expect(result.report.map((row) => row.error)).toEqual([
      "worker exploded",
      "worker exploded",
      "worker exploded",
    ]);
    expect(await orderedEntryNames(result.blob)).toEqual(["report.csv"]);
    expect(progress.map((next) => next.done)).toEqual([0, 1, 2, 3]);
  });

  test("a short batch result marks the missing images as errors", async () => {
    const input = await makeArchive([
      { name: "a/first.jpg", data: "one" },
      { name: "a/second.jpg", data: "two" },
    ]);
    const classifyBatch: ClassifyBatch = async () => [{ scores: scoresFor("people", 0.9), ms: 1 }];

    const result = await sortArchive(input, ["people"], neverClassify, {}, classifyBatch);

    expect(result.report.map((row) => row.status)).toEqual(["sorted", "error"]);
    expect(result.report[1].error).toBe("missing classification result");
    expect(result.counts).toEqual({ errors: 1, skipped: 0, sorted: 1, review: 0 });
  });

  test("flushes a partial batch before a skipped entry to keep report order", async () => {
    const sources = ["a/one.jpg", "b/two.jpg", "notes.txt", "c/three.jpg", "d/four.jpg"];
    const input = await makeArchive([
      { name: sources[0], data: "one" },
      { name: sources[1], data: "two" },
      { name: sources[2], data: "not an image" },
      { name: sources[3], data: "three" },
      { name: sources[4], data: "four" },
    ]);
    const calls: string[][] = [];
    const classifyBatch: ClassifyBatch = async (images) => {
      const texts = await Promise.all(images.map((image) => image.text()));

      calls.push(texts);

      return texts.map((text) => ({ scores: scoresFor(text, 0.9), ms: 1 }));
    };
    const progress: ArchiveProgress[] = [];

    const result = await sortArchive(
      input,
      ["people"],
      neverClassify,
      { onProgress: (next) => progress.push(next) },
      classifyBatch,
    );

    expect(calls).toEqual([
      ["one", "two"],
      ["three", "four"],
    ]);
    expect(result.report.map((row) => row.source)).toEqual(sources);
    expect(result.report[2].status).toBe("skipped");
    expect(progress.map((next) => next.current)).toEqual(["", ...sources]);
  });
});

describe("createZipLoader", () => {
  test("caches the module and retries after a failed load", async () => {
    let attempts = 0;
    const module = {} as ZipApi;
    const loadZip = createZipLoader(async () => {
      attempts += 1;

      if (attempts === 1) {
        throw new Error("chunk offline");
      }

      return module;
    });

    expect(await rejectionMessage(loadZip())).toBe("chunk offline");

    const second = loadZip();
    const third = loadZip();

    expect(await second).toBe(module);
    expect(await third).toBe(module);
    expect(attempts).toBe(2);
  });
});
