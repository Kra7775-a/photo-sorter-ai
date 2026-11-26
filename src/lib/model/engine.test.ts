import { afterAll, beforeEach, describe, expect, test } from "bun:test";

import { createEngine } from "./engine";
import type { LoadProgress, WorkerRequest, WorkerResponse } from "./protocol";

const NativeWorker = globalThis.Worker;
const IMAGE = new Blob(["not a real image"], { type: "image/jpeg" });
const LABELS = ["cat", "dog"];

class FakeWorker {
  static instances: FakeWorker[] = [];

  onmessage: ((event: MessageEvent<WorkerResponse>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  onmessageerror: ((event: MessageEvent) => void) | null = null;

  readonly posted: WorkerRequest[] = [];
  terminated = false;
  terminateCalls = 0;

  constructor() {
    FakeWorker.instances.push(this);
  }

  postMessage(message: WorkerRequest): void {
    this.posted.push(message);
  }

  terminate(): void {
    this.terminated = true;
    this.terminateCalls += 1;
  }

  emit(message: WorkerResponse): void {
    this.onmessage?.({ data: message } as MessageEvent<WorkerResponse>);
  }

  fail(message: string): void {
    this.onerror?.({ message } as ErrorEvent);
  }

  failMessage(): void {
    this.onmessageerror?.({} as MessageEvent);
  }
}

function latestWorker(): FakeWorker {
  const worker = FakeWorker.instances.at(-1);

  if (!worker) {
    throw new Error("createEngine() did not construct a worker");
  }

  return worker;
}

/**
 * Awaits a rejection without `expect(...).rejects` (Bun types that matcher as
 * synchronous). The returned promise is created eagerly, so the rejection is
 * observed even when it happens before the assertion runs.
 */
async function rejectionMessage(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }

  throw new Error("Expected the promise to reject");
}

beforeEach(() => {
  FakeWorker.instances = [];
  globalThis.Worker = FakeWorker as unknown as typeof Worker;
});

afterAll(() => {
  globalThis.Worker = NativeWorker;
});

describe("createEngine", () => {
  test("resolves the request whose id comes back, ignoring stray ids", async () => {
    const engine = createEngine();
    const worker = latestWorker();
    const result = engine.classify(IMAGE, LABELS);
    const request = worker.posted[0];

    expect(request).toMatchObject({ type: "classify", image: IMAGE, labels: LABELS });

    const scores = [{ label: "cat", score: 0.9 }];

    worker.emit({ type: "result", id: "stray", scores, ms: 1 });
    worker.emit({ type: "result", id: request.id, scores, ms: 42 });

    expect(await result).toEqual({ scores, ms: 42 });
  });

  test("classifyBatch posts one batch request and resolves its results", async () => {
    const engine = createEngine();
    const worker = latestWorker();
    const second = new Blob(["second image"], { type: "image/jpeg" });
    const results = [
      { ms: 11, scores: [{ label: "cat", score: 0.9 }] },
      { ms: 12, scores: [{ label: "dog", score: 0.8 }] },
    ];
    const pending = engine.classifyBatch([IMAGE, second], LABELS);

    expect(worker.posted).toHaveLength(1);
    expect(worker.posted[0]).toMatchObject({
      type: "classify-batch",
      images: [IMAGE, second],
      labels: LABELS,
    });
    expect(typeof worker.posted[0].id).toBe("string");

    worker.emit({ type: "batch-result", id: worker.posted[0].id, results });

    expect(await pending).toEqual(results);
  });

  test("classifyBatch with no images resolves without posting", async () => {
    const engine = createEngine();
    const worker = latestWorker();

    expect(await engine.classifyBatch([], LABELS)).toEqual([]);
    expect(worker.posted).toEqual([]);
  });

  test("classifyBatch ignores stray ids until its batch-result arrives", async () => {
    const engine = createEngine();
    const worker = latestWorker();
    const first = engine.classifyBatch([IMAGE], LABELS);
    const firstId = worker.posted[0].id;
    const second = engine.classifyBatch([IMAGE], LABELS);
    const secondId = worker.posted[1].id;
    const firstResults = [{ ms: 1, scores: [{ label: "cat", score: 0.7 }] }];
    const secondResults = [{ ms: 2, scores: [{ label: "dog", score: 0.8 }] }];

    worker.emit({ type: "batch-result", id: "stray", results: firstResults });
    worker.emit({ type: "batch-result", id: secondId, results: secondResults });
    worker.emit({ type: "batch-result", id: firstId, results: firstResults });

    expect(await second).toEqual(secondResults);
    expect(await first).toEqual(firstResults);
  });

  test("classifyBatch rejects after dispose without posting", async () => {
    const engine = createEngine();
    const worker = latestWorker();

    engine.dispose();

    expect(await rejectionMessage(engine.classifyBatch([IMAGE], LABELS))).toBe(
      "AI engine is disposed",
    );
    expect(worker.posted).toEqual([]);
  });

  test("forwards download progress to the caller", () => {
    const progress: LoadProgress[] = [];
    createEngine({ onProgress: (next) => progress.push(next) });

    const worker = latestWorker();
    const first = { loaded: 1, total: 10 };
    const second = { loaded: 4, total: 10 };

    worker.emit({ type: "progress", progress: first });
    worker.emit({ type: "progress", progress: second });

    expect(progress).toEqual([first, second]);
  });

  test("rejects only the request that failed", async () => {
    const engine = createEngine();
    const worker = latestWorker();
    const failingMessage = rejectionMessage(engine.classify(IMAGE, LABELS));
    const failingId = worker.posted[0].id;

    const succeeding = engine.classify(IMAGE, LABELS);
    const succeedingId = worker.posted[1].id;
    const scores = [{ label: "dog", score: 0.8 }];

    worker.emit({ type: "error", id: failingId, message: "decode failed" });
    worker.emit({ type: "result", id: succeedingId, scores, ms: 5 });

    expect(await failingMessage).toBe("decode failed");
    expect(await succeeding).toEqual({ scores, ms: 5 });
  });

  test("dispose rejects pending work, terminates the worker and blocks new work", async () => {
    const progress: LoadProgress[] = [];
    const engine = createEngine({ onProgress: (next) => progress.push(next) });
    const worker = latestWorker();
    const pendingMessage = rejectionMessage(engine.classify(IMAGE, LABELS));

    engine.dispose();

    expect(worker.terminated).toBe(true);

    worker.emit({ type: "progress", progress: { loaded: 1, total: 1 } });

    expect(await pendingMessage).toBe("AI engine disposed");
    expect(progress).toEqual([]);
    expect(await rejectionMessage(engine.classify(IMAGE, LABELS))).toBe("AI engine is disposed");
  });

  test("dispose is idempotent", () => {
    const engine = createEngine();
    const worker = latestWorker();

    engine.dispose();
    engine.dispose();

    expect(worker.terminateCalls).toBe(1);
  });

  test("a worker crash rejects pending work and prevents further use", async () => {
    const engine = createEngine();
    const worker = latestWorker();
    const pendingMessage = rejectionMessage(engine.classify(IMAGE, LABELS));

    worker.fail("worker crashed");

    expect(await pendingMessage).toBe("worker crashed");
    expect(worker.terminated).toBe(true);
    expect(await rejectionMessage(engine.classify(IMAGE, LABELS))).toBe("AI engine is disposed");
  });

  test("an undeserializable worker message also fails the engine", async () => {
    const engine = createEngine();
    const worker = latestWorker();
    const pendingMessage = rejectionMessage(engine.classify(IMAGE, LABELS));

    worker.failMessage();

    expect(await pendingMessage).toBe("AI worker message could not be deserialized");
    expect(await rejectionMessage(engine.classify(IMAGE, LABELS))).toBe("AI engine is disposed");
  });
});
