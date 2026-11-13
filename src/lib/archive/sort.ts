import { downloadZip } from "client-zip";

import type { Score } from "../model/protocol";
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
  };
};

type OutputEntry = {
  name: string;
  input: Blob | string;
  lastModified?: Date;
};

function topScore(scores: readonly Score[]): Score | null {
  let best: Score | null = null;

  for (const score of scores) {
    if (best === null || score.score > best.score) {
      best = score;
    }
  }

  return best;
}

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
 * Reads the input archive one entry at a time, classifies images sequentially
 * and streams the result into a new archive. Only the entry being processed is
 * decompressed at any moment; the output is buffered once by `downloadZip`.
 */
export async function sortArchive(
  file: File,
  labels: readonly string[],
  classify: ClassifyImage,
  options: SortArchiveOptions = {},
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

    async function* outputEntries(): AsyncGenerator<OutputEntry> {
      let done = 0;

      for (const entry of files) {
        const source = entry.filename;

        if (!isImagePath(source)) {
          report.push({
            source,
            category: "",
            score: null,
            status: "skipped",
            error: "not a supported image",
          });
          done += 1;
          options.onProgress?.({ done, total, current: source });
          continue;
        }

        let image: Blob;

        try {
          image = await entry.getData(new BlobWriter(), {
            checkCrc32: true,
            useWebWorkers: false,
          });
        } catch (error) {
          report.push({
            source,
            category: "",
            score: null,
            status: "error",
            error: messageOf(error),
          });
          done += 1;
          options.onProgress?.({ done, total, current: source });
          continue;
        }

        let scores: Score[];

        try {
          const result = await classify(image, activeLabels);

          scores = result.scores;
        } catch (error) {
          report.push({
            source,
            category: "",
            score: null,
            status: "error",
            error: messageOf(error),
          });
          done += 1;
          options.onProgress?.({ done, total, current: source });
          continue;
        }

        const top = topScore(scores);
        const folder = safeFolderName(top?.label ?? "");

        report.push({
          source,
          category: folder,
          score: top?.score ?? null,
          status: "sorted",
          error: "",
        });
        done += 1;
        options.onProgress?.({ done, total, current: source });

        yield {
          name: uniquePath(`${folder}/${safeFileName(baseName(source))}`, usedPaths),
          input: image,
          lastModified: entry.lastModDate,
        };
      }

      yield {
        name: uniquePath("report.csv", usedPaths),
        input: buildReportCsv(report),
        lastModified: new Date(),
      };
    }

    const response = downloadZip(outputEntries(), { buffersAreUTF8: true });
    const blob = await response.blob();

    const counts = { sorted: 0, skipped: 0, errors: 0 };

    for (const row of report) {
      if (row.status === "sorted") {
        counts.sorted += 1;
      } else if (row.status === "skipped") {
        counts.skipped += 1;
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
