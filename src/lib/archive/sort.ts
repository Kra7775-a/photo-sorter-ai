import { downloadZip } from "client-zip";

import type { ClassifyResult, Score } from "../model/protocol";
import { decideCategory } from "./decision";
import {
  archiveOutputName,
  baseName,
  buildReportCsv,
  isImagePath,
  safeFileName,
  safeFolderName,
  uniquePath,
  type ReportRow,
} from "./naming";

export type ClassifyImage = (image: Blob, labels: string[]) => Promise<{ scores: Score[] }>;

export type ClassifyBatch = (images: Blob[], labels: string[]) => Promise<ClassifyResult[]>;

export const BATCH_SIZE = 8;

export type ArchiveProgress = {
  done: number;
  total: number;
  current: string;
};

export type SortArchiveOptions = {
  onProgress?: (progress: ArchiveProgress) => void;
};

export type SortArchiveResult = {
  blob: Blob;
  fileName: string;
  report: ReportRow[];
  counts: {
    sorted: number;
    skipped: number;
    errors: number;
    review?: number;
  };
};

type OutputEntry = {
  name: string;
  input: Blob | string;
  lastModified?: Date;
};

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** zip.js is only needed when a ZIP is picked, so keep it out of the initial bundle. */
async function importZip() {
  return import("@zip.js/zip.js/lib/zip-core-native.js");
}

export type ZipApi = Awaited<ReturnType<typeof importZip>>;

/**
 * Caches the module promise. A failed chunk request is forgotten so the next
 * click on a ZIP retries instead of reusing the same rejection forever.
 */
export function createZipLoader(load: () => Promise<ZipApi> = importZip): () => Promise<ZipApi> {
  let cached: Promise<ZipApi> | null = null;

  return () => {
    cached ??= load().catch((error: unknown) => {
      cached = null;
      throw error;
    });

    return cached;
  };
}

const loadZip = createZipLoader();

/**
 * Reads the input archive one entry at a time, classifies images in batches
 * and streams the result into a new archive. Only the current batch is kept
 * in memory; the output is buffered once by `downloadZip`.
 */
export async function sortArchive(
  file: File,
  labels: readonly string[],
  classify: ClassifyImage,
  options: SortArchiveOptions = {},
  classifyBatch?: ClassifyBatch,
): Promise<SortArchiveResult> {
  if (labels.length === 0) {
    throw new Error("At least one category is required");
  }

  const { BlobReader, BlobWriter, ZipReader } = await loadZip();
  const activeLabels = [...labels];
  const reader = new ZipReader(new BlobReader(file), { useWebWorkers: false });
  const report: ReportRow[] = [];
  const usedPaths = new Set<string>();

  try {
    const entries = await reader.getEntries();
    const files = entries.filter((entry) => !entry.directory);
    const total = files.length;

    options.onProgress?.({ done: 0, total, current: "" });

    type Pending = { source: string; image: Blob; lastModified?: Date };
    let done = 0;
    let pending: Pending[] = [];

    function recordError(
      source: string,
      error: string,
      status: "error" | "skipped" = "error",
    ): void {
      report.push({
        source,
        category: "",
        score: null,
        margin: null,
        candidate: "",
        runnerUp: null,
        status,
        error,
      });
      done += 1;
      options.onProgress?.({ done, total, current: source });
    }

    function classifiedEntry(item: Pending, scores: Score[]): OutputEntry {
      const decision = decideCategory(scores);
      const folder = decision?.category ?? safeFolderName("");
      const review = decision?.review === true;

      report.push({
        source: item.source,
        category: review ? "review" : folder,
        score: decision?.score ?? null,
        margin: decision?.margin ?? null,
        candidate: decision?.candidate ?? "",
        runnerUp: decision?.runnerUp ?? null,
        status: review ? "review" : "sorted",
        error: "",
      });
      done += 1;
      options.onProgress?.({ done, total, current: item.source });

      const outputName = safeFileName(baseName(item.source));

      return {
        name: uniquePath(review ? `review/${outputName}` : `${folder}/${outputName}`, usedPaths),
        input: item.image,
        lastModified: item.lastModified,
      };
    }

    async function* flushBatch(): AsyncGenerator<OutputEntry> {
      if (pending.length === 0) {
        return;
      }

      const current = pending;
      pending = [];

      if (classifyBatch === undefined) {
        for (const item of current) {
          try {
            const result = await classify(item.image, activeLabels);

            yield classifiedEntry(item, result.scores);
          } catch (error) {
            recordError(item.source, messageOf(error));
          }
        }
        return;
      }

      let results: ClassifyResult[];

      try {
        results = await classifyBatch(
          current.map((item) => item.image),
          activeLabels,
        );
      } catch (error) {
        for (const item of current) {
          recordError(item.source, messageOf(error));
        }
        return;
      }

      for (const [index, item] of current.entries()) {
        const result = results.at(index);

        if (result === undefined) {
          recordError(item.source, "missing classification result");
          continue;
        }

        yield classifiedEntry(item, result.scores);
      }
    }

    async function* outputEntries(): AsyncGenerator<OutputEntry> {
      for (const entry of files) {
        const source = entry.filename;

        if (!isImagePath(source)) {
          yield* flushBatch();
          recordError(source, "not a supported image", "skipped");
          continue;
        }

        let image: Blob;

        try {
          image = await entry.getData(new BlobWriter(), {
            checkCrc32: true,
            useWebWorkers: false,
          });
        } catch (error) {
          yield* flushBatch();
          recordError(source, messageOf(error));
          continue;
        }

        pending.push({ source, image, lastModified: entry.lastModDate });

        if (pending.length === BATCH_SIZE) {
          yield* flushBatch();
        }
      }

      yield* flushBatch();

      yield {
        name: uniquePath("report.csv", usedPaths),
        input: buildReportCsv(report),
        lastModified: new Date(),
      };
    }

    const response = downloadZip(outputEntries(), { buffersAreUTF8: true });
    const blob = await response.blob();

    const counts = { sorted: 0, skipped: 0, errors: 0, review: 0 };

    for (const row of report) {
      if (row.status === "sorted") {
        counts.sorted += 1;
      } else if (row.status === "skipped") {
        counts.skipped += 1;
      } else if (row.status === "review") {
        counts.review += 1;
      } else {
        counts.errors += 1;
      }
    }

    return {
      blob,
      counts,
      fileName: archiveOutputName(file.name),
      report,
    };
  } finally {
    await reader.close();
  }
}
