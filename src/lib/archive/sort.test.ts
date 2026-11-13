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
import { sortArchive, createZipLoader, type ArchiveProgress, type ZipApi } from "./sort";

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

async function readText(entries: Entry[], name: string): Promise<string> {
  const entry = entries.find((candidate) => candidate.filename === name);

  if (!entry || entry.directory) {
    throw new Error(`File entry ${name} not found`);
  }

  return entry.getData(new TextWriter());
}

const scoresFor = (label: string, score: number): Score[] => [{ label, score }];

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
    expect(result.counts).toEqual({ errors: 0, skipped: 1, sorted: 3 });

    const { entries, names } = await readArchive(result.blob);

    expect(names).toEqual(["nature/dog.png", "people/cat (2).jpg", "people/cat.jpg", "report.csv"]);
    expect(progress[0]).toEqual({ current: "", done: 0, total: 4 });
    expect(progress.at(-1)).toEqual({ current: "album/dog.png", done: 4, total: 4 });
    expect(progress).toHaveLength(5);

    const report = await readText(entries, "report.csv");

    expect(report).toContain("album/cat.jpg,people,0.7000,sorted,");
    expect(report).toContain("album/notes.txt,,,skipped,not a supported image");
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

    expect(result.counts).toEqual({ errors: 1, skipped: 0, sorted: 1 });

    const { entries, names } = await readArchive(result.blob);

    expect(names).toEqual(["nature/ok.jpg", "report.csv"]);

    const report = await readText(entries, "report.csv");

    expect(report).toContain("a/fail.jpg,,,error,decode failed");
    expect(report).toContain("a/ok.jpg,nature,0.9000,sorted,");
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

    expect(result.counts).toEqual({ errors: 1, skipped: 0, sorted: 1 });

    const { entries, names } = await readArchive(result.blob);

    expect(names).toEqual(["nature/good.jpg", "report.csv"]);

    const report = await readText(entries, "report.csv");

    expect(report).toContain("a/bad.jpg,,,error,");
    expect(report).toContain("a/good.jpg,nature,0.9000,sorted,");
  });

  test("writes the report even when the archive has no images", async () => {
    const input = await makeArchive([{ name: "readme.txt", data: "hello" }]);
    const result = await sortArchive(input, ["nature"], async () => {
      throw new Error("must not be called");
    });

    expect(result.counts).toEqual({ errors: 0, skipped: 1, sorted: 0 });

    const { entries, names } = await readArchive(result.blob);

    expect(names).toEqual(["report.csv"]);
    expect(await readText(entries, "report.csv")).toContain(
      "readme.txt,,,skipped,not a supported image",
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
