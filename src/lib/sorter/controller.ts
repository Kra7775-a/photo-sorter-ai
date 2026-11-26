import type { ArchiveProgress, ClassifyImage, SortArchiveResult } from "../archive/sort";
import type { Score } from "../model/protocol";
import type { SyncRun } from "../sync/types";

export type SorterItem = { id: number; ms: number; name: string; scores: Score[]; url: string };

export type ArchiveView = {
  url: string;
  name: string;
  counts: { sorted: number; skipped: number; errors: number; review?: number };
  failures: { source: string; error: string }[];
};

export type SorterSnapshot = {
  items: SorterItem[];
  pending: number;
  failure: string | null;
  progress: { loaded: number; total: number } | null;
  percent: number;
  loadingModel: boolean;
  archiveProgress: ArchiveProgress | null;
  archivePercent: number;
  archiveResult: ArchiveView | null;
  archiveBusy: boolean;
  busy: boolean;
};

export type SorterDeps = {
  classify(file: Blob, labels: string[]): Promise<{ scores: Score[]; ms: number }>;
  sortArchive(
    file: File,
    labels: string[],
    classify: ClassifyImage,
    onProgress: (p: ArchiveProgress) => void,
  ): Promise<SortArchiveResult>;
  createUrl(blob: Blob): string;
  revokeUrl(url: string): void;
  now(): number;
  uuid(): string;
  onSnapshot(snapshot: SorterSnapshot): void;
  /** The host passes this sink to `createEngine({ onProgress })` for model downloads. */
  setProgressSink?(sink: (progress: { loaded: number; total: number }) => void): void;
};

export type SorterController = {
  classifyFiles(files: readonly File[], labels: string[]): Promise<void>;
  sortArchiveFile(file: File, labels: string[]): Promise<SyncRun | null>;
  dispose(): void;
};

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function percentOf(done: number | undefined, total: number | undefined): number {
  if (done === undefined || total === undefined || total <= 0) {
    return 0;
  }

  return Math.min(100, Math.round((done / total) * 100));
}

/**
 * Client-only photo orchestration: all browser/model/archive access is injected,
 * so every state transition can be exercised without a DOM or a worker.
 */
export function createSorterController(deps: SorterDeps): SorterController {
  const items: SorterItem[] = [];
  let pending = 0;
  let failure: string | null = null;
  let progress: { loaded: number; total: number } | null = null;
  let archiveProgress: ArchiveProgress | null = null;
  let archiveResult: ArchiveView | null = null;
  let archiveBusy = false;
  let counter = 0;
  let disposed = false;

  function emit(): void {
    if (disposed) {
      return;
    }

    deps.onSnapshot({
      items: [...items],
      pending,
      failure,
      progress,
      percent: percentOf(progress?.loaded, progress?.total),
      loadingModel: pending > 0 && progress !== null && progress.loaded < progress.total,
      archiveProgress,
      archivePercent: percentOf(archiveProgress?.done, archiveProgress?.total),
      archiveResult,
      archiveBusy,
      busy: archiveBusy || pending > 0,
    });
  }

  deps.setProgressSink?.((next) => {
    if (disposed) {
      return;
    }

    progress = next;
    emit();
  });

  async function classifyFiles(files: readonly File[], labels: string[]): Promise<void> {
    if (files.length === 0) {
      return;
    }

    if (labels.length === 0) {
      failure = "Add at least one category";
      emit();
      return;
    }

    failure = null;
    pending += files.length;

    // Keep one batch on one label set even if the textarea changes mid-way.
    const activeLabels = [...labels];

    emit();

    for (const file of files) {
      try {
        const result = await deps.classify(file, activeLabels);

        if (disposed) {
          continue;
        }

        counter += 1;
        items.unshift({
          id: counter,
          ms: result.ms,
          name: file.name,
          scores: result.scores,
          url: deps.createUrl(file),
        });
      } catch (error) {
        if (!disposed) {
          failure = `${file.name}: ${messageOf(error)}`;
        }
      } finally {
        pending -= 1;
        emit();
      }
    }
  }

  async function sortArchiveFile(file: File, labels: string[]): Promise<SyncRun | null> {
    if (archiveBusy) {
      return null;
    }

    if (labels.length === 0) {
      failure = "Add at least one category";
      emit();
      return null;
    }

    failure = null;
    archiveBusy = true;
    archiveProgress = { done: 0, total: 0, current: file.name };

    if (archiveResult !== null) {
      deps.revokeUrl(archiveResult.url);
      archiveResult = null;
    }

    // One archive is processed with the labels it started with.
    const activeLabels = [...labels];

    emit();

    try {
      const result = await deps.sortArchive(
        file,
        activeLabels,
        (image, labels) => deps.classify(image, labels),
        (next) => {
          archiveProgress = next;
          emit();
        },
      );

      if (disposed) {
        return null;
      }

      archiveResult = {
        counts: result.counts,
        failures: result.report
          .filter((row) => row.status === "error")
          .map((row) => ({ error: row.error, source: row.source })),
        name: result.fileName,
        url: deps.createUrl(result.blob),
      };

      return {
        clientRunId: deps.uuid(),
        sourceName: result.fileName,
        createdAt: deps.now(),
        counts: result.counts,
        rows: result.report,
      };
    } catch (error) {
      if (!disposed) {
        failure = `${file.name}: ${messageOf(error)}`;
        emit();
      }
      return null;
    } finally {
      archiveBusy = false;
      archiveProgress = null;
      emit();
    }
  }

  function dispose(): void {
    disposed = true;

    for (const item of items) {
      deps.revokeUrl(item.url);
    }

    if (archiveResult !== null) {
      deps.revokeUrl(archiveResult.url);
    }
  }

  return { classifyFiles, sortArchiveFile, dispose };
}
