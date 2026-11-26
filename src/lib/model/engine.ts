import type { ClassifyResult, LoadProgress, WorkerRequest, WorkerResponse } from "./protocol";

export type Engine = {
  classify: (image: Blob, labels: string[]) => Promise<ClassifyResult>;
  classifyBatch: (images: readonly Blob[], labels: string[]) => Promise<ClassifyResult[]>;
  dispose: () => void;
};

type PendingRequest<T> = { reject: (reason: Error) => void; resolve: (result: T) => void };

type Pending =
  | (PendingRequest<ClassifyResult> & { kind: "classify" })
  | (PendingRequest<ClassifyResult[]> & { kind: "batch" });

export type EngineOptions = {
  onProgress?: (progress: LoadProgress) => void;
};

/**
 * The worker owns the model, so the main bundle never sees transformers.js.
 * Requests are matched by id; progress events are global to the download.
 */
export function createEngine(options: EngineOptions = {}): Engine {
  const worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
  const pending = new Map<string, Pending>();
  let counter = 0;
  let disposed = false;

  function rejectAll(message: string): void {
    for (const entry of pending.values()) {
      entry.reject(new Error(message));
    }

    pending.clear();
  }

  function fail(message: string): void {
    disposed = true;
    rejectAll(message);
    worker.terminate();
  }

  worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
    const message = event.data;

    if (message.type === "progress") {
      if (!disposed) {
        options.onProgress?.(message.progress);
      }

      return;
    }

    const entry = pending.get(message.id);

    if (!entry) {
      return;
    }

    pending.delete(message.id);

    if (message.type === "error") {
      entry.reject(new Error(message.message));
      return;
    }

    if (message.type === "batch-result") {
      if (entry.kind === "batch") {
        entry.resolve(message.results);
      }

      return;
    }

    if (entry.kind === "classify") {
      entry.resolve({ ms: message.ms, scores: message.scores });
    }
  };

  worker.onerror = (event) => {
    fail(event.message || "AI worker failed");
  };

  worker.onmessageerror = () => {
    fail("AI worker message could not be deserialized");
  };

  return {
    classify(image, labels) {
      if (disposed) {
        return Promise.reject(new Error("AI engine is disposed"));
      }

      counter += 1;
      const id = `req-${counter}`;

      return new Promise<ClassifyResult>((resolve, reject) => {
        pending.set(id, { kind: "classify", reject, resolve });

        const request: WorkerRequest = { type: "classify", id, image, labels };

        worker.postMessage(request);
      });
    },
    classifyBatch(images, labels) {
      if (disposed) {
        return Promise.reject(new Error("AI engine is disposed"));
      }

      if (images.length === 0) {
        return Promise.resolve([]);
      }

      counter += 1;
      const id = `req-${counter}`;

      return new Promise<ClassifyResult[]>((resolve, reject) => {
        pending.set(id, { kind: "batch", reject, resolve });

        const request: WorkerRequest = {
          type: "classify-batch",
          id,
          images: [...images],
          labels,
        };

        worker.postMessage(request);
      });
    },
    dispose() {
      if (disposed) {
        return;
      }

      disposed = true;
      rejectAll("AI engine disposed");
      worker.terminate();
    },
  };
}
