# Batched inference for archives

Date: 2026-11-26
Status: accepted by delegation

## Intent

The 3925-image stress test showed that sorting is dominated by one sequential vision inference per image. The ONNX session stays non-reentrant, but the installed Transformers.js image processor accepts an array of images and stacks them into a batched `pixel_values` tensor (`@huggingface/transformers/dist/transformers.js:21226`). A single worker can therefore classify several images in one vision forward without a second model instance or extra memory copies of the weights.

## Goals

- Add a batch request to the worker protocol and engine.
- Use batches of 8 for ZIP sorting; individual photo flow stays single-image.
- Keep output order, progress, review decisions and ZIP contract unchanged.
- Cover the new branches with tests and a mutation run that also includes `decision.ts`.

## Non-goals

- No worker pool, no second model instance, no WebGPU change.
- No prefetch lookahead in this iteration.
- No change to labels, prompts, thresholds or classification quality.

## Constraints

- `worker.ts` stays the only module importing `@huggingface/transformers`.
- Worker processes messages sequentially; a batch is one message.
- Message shapes in `protocol.ts` change consistently; engine tests use a fake worker.
- Code/identifiers/comments English; no new dependency.
- New `src/lib/**/*.ts` branches need tests.
- `bun run validate`, `bun run quality`, `bun run test:e2e` stay green.

## Decision

- `protocol.ts`: add `ClassifyBatchRequest` (`type: "classify-batch"`, `images: Blob[]`, `labels`, `id`) and `BatchResult` (`type: "batch-result"`, `id`, `results: ClassifyResult[]`). Extend `WorkerRequest`/`WorkerResponse` unions.
- `engine.ts`: expose `classifyBatch(images: readonly Blob[], labels: string[]): Promise<ClassifyResult[]>`; keep `classify()` as a thin single-image wrapper over the same request/response machinery. Empty list resolves to `[]` without posting.
- `worker.ts`: handle a batch by processing `images` with `model.processor(images)`, one `vision()` call, then computing softmax per embedding row. Reuse `embedLabels` cache. Empty labels still throw.
- `src/lib/archive/sort.ts`: accept an optional `classifyBatch` callback; collect up to `BATCH_SIZE = 8` decoded images, classify them in one call, then emit their report rows and entries in original order. Fall back to per-image `classify` when the callback is absent so existing tests/consumers keep working. Skipped/error entries stay outside batches. Batch-level classification failure marks all images in that batch as errors.
- `src/lib/sorter/controller.ts` and `src/lib/app/controller.ts`: pass `engine.classifyBatch` through to `sortArchive`.
- Keep progress callbacks per file, not per batch.

## Why not a worker pool or prefetch now

A second worker would double model memory (~145 MB + WASM) and download pressure for a bounded gain. Prefetch overlaps decompression with inference, but inference dominates; batching attacks the dominant cost first and is independently verifiable with a unit test that counts batch calls.

## Verification and quality

- `engine.test.ts`: batch request shape, result mapping by id, empty batch, disposal rejection.
- `sort.test.ts`: one batch call for 8 images, output/report order, partial final batch, batch failure → errors for all images, progress still per file.
- Worker behavior is exercised by E2E archive flow; no direct worker unit test.
- After implementation: `bun run test:coverage`, `bun run matrix`, then `bun run test:mutation:diff` (incremental file exists) to cover `decision.ts`, `naming.ts`, `sort.ts`, `engine.ts` and the new branches. Update `docs/quality/test-matrix.md` again from the fresh mutation report.

## Builder latitude

- Exact internal helper names in `sort.ts` for batch flushing.
- Whether to keep `classify()` as a separate method or a wrapper; the public shape must stay.
