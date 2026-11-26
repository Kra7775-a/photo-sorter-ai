# Batched Inference Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Classify ZIP entries in batches of 8 through one worker vision forward, then re-run mutation to cover `decision.ts` and the new branches.

**Architecture:** A new batch message in `protocol.ts` carries several Blobs; the engine keeps one `pending` map and the worker stays sequential. `sortArchive` collects decoded images into batches and emits entries in original order; a per-image fallback keeps old callers valid. One `AppController`/engine instance is unchanged.

**Tech Stack:** Bun tests, Transformers.js arrays→`pixel_values`, Svelte 5 app wiring, Stryker incremental mode, dependency-cruiser.

**Spec:** `docs/superpowers/specs/2026-11-26-batch-inference-design.md`

## Global Constraints

- Bun only, exact dependency versions; no new dependency.
- Code/identifiers/comments English; UI strings unchanged.
- `worker.ts` remains the only module importing `@huggingface/transformers`.
- Worker requests stay sequential; `progress` has no id, results are matched by id.
- ZIP contract (BOM+CRLF CSV, dedup, review folder) and output order are unchanged.
- New `src/lib/**/*.ts` branches need tests.
- No commits without explicit user approval; show diff first.
- Final gates: `bun run validate`, `bun run quality`, `bun run test:e2e`, `bun run test:mutation:diff`, `bun run matrix`.

## Review Focus

1. Results must map to the correct id even with concurrent batch requests — Task 1 `engine.test.ts`.
2. Empty batch and disposal must not post to a dead worker — Task 1 tests.
3. Batch output must preserve input order and per-file progress — Task 2 `sort.test.ts`.
4. A batch failure must not drop files — Task 2 error test.
5. Mutation must include `decision.ts` and new branches — Task 3.

---

### Task 1: Protocol, engine and worker batch support

**Files:**
- Modify: `src/lib/model/protocol.ts`, `src/lib/model/engine.ts`, `src/lib/model/worker.ts`, `src/lib/model/engine.test.ts`

**Interfaces:**
- Produces:
  - `ClassifyBatchRequest = { type: "classify-batch"; id: string; images: Blob[]; labels: string[] }`
  - `BatchResult = { type: "batch-result"; id: string; results: ClassifyResult[] }`
  - `Engine.classifyBatch(images: readonly Blob[], labels: string[]): Promise<ClassifyResult[]>`

- [ ] **Step 1: Write failing engine tests**

Using the existing `FakeWorker`: assert `classifyBatch([A,B], LABELS)` posts one `classify-batch` message with the Blobs and resolves the matching `batch-result` results; an empty list posts nothing and resolves `[]`; a stray id is ignored; after `dispose()` it rejects.

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test src/lib/model/engine.test.ts`
Expected: FAIL — `classifyBatch` missing.

- [ ] **Step 3: Extend protocol and engine**

Add the two message types and union members. Keep `classify()` behavior; implement `classifyBatch()` with the same `pending`/id machinery and strict `BatchResult` handling.

- [ ] **Step 4: Implement worker batch path**

In `handle()`, branch on `type`: `classify` stays, `classify-batch` calls `model.processor(images)` (array), `vision()` once, normalizes `image_embeds`, and computes one `softmax` per embedding row. Reuse `embedLabels`. Post `batch-result`. Throw on empty labels; empty images returns `results: []`.

- [ ] **Step 5: Verify**

Run: `bun test src/lib/model/engine.test.ts`, `bun run check`, `bun run typecheck`, `bun run arch:check`, `bun run lint`. Expected: PASS.

### Task 2: Batch ZIP sorting

**Files:**
- Modify: `src/lib/archive/sort.ts`, `src/lib/archive/sort.test.ts`, `src/lib/sorter/controller.ts`, `src/lib/sorter/controller.test.ts`

**Interfaces:**
- Consumes: `Engine.classifyBatch` from Task 1.
- Produces: `sortArchive(file, labels, classify, onProgress, classifyBatch?)`, optional 5th parameter; `BATCH_SIZE = 8` export; batch callback `(images: Blob[], labels: string[]) => Promise<ClassifyResult[]>`.

- [ ] **Step 1: Write failing sort tests**

Add stubs: `classifyBatch` records calls and returns one result per image. Assert: 8 images → exactly one batch call; 9 images → batch of 8 + batch of 1; output entries and report rows keep input order; progress fires once per file; a rejected batch marks every image in it `status: "error"` and still yields `report.csv`. Keep existing fallback tests working without a batch callback.

- [ ] **Step 2: Run sort tests to verify they fail**

Run: `bun test src/lib/archive/sort.test.ts`
Expected: FAIL — no batch calls.

- [ ] **Step 3: Implement batching in `sortArchive`**

Read entries one at a time as today; skipped/error entries report immediately. Collect decoded image Blobs up to `BATCH_SIZE`; flush by calling `classifyBatch` (or falling back to `classify` per image) and then yield report rows/entries in original order for that batch. Flush the partial tail before `report.csv`. Update `SorterDeps.sortArchive` signature and pass `deps.classifyBatch` through from `src/lib/app/controller.ts` (add to `AppControllerDeps.createEngine` usage — no new dep, engine already provides it).

- [ ] **Step 4: Update wiring tests**

Add `classifyBatch` mock to `sorter/controller.test.ts` and `app/controller.test.ts` harnesses; assert `sortArchive` receives it. Run their tests.

- [ ] **Step 5: Verify**

Run: `bun test src/lib/archive/sort.test.ts`, `bun test src/lib/sorter/controller.test.ts`, `bun test src/lib/app/controller.test.ts`, `bun run check`, `bun run typecheck`, `bun run arch:check`. Expected: PASS.

### Task 3: Quality pass with mutation coverage

**Files:**
- Modify: `README.md`, `AGENTS.md`, `docs/quality/test-matrix.md` (generated)
- Reports: `coverage/lcov.info`, `reports/mutation/mutation.json`, `reports/stryker-incremental.json`

**Interfaces:**
- Consumes: all code from Tasks 1–2 and the existing `decision.ts`.

- [ ] **Step 1: Document batching**

Add a short note to the ZIP section of `README.md`: archives classify in batches of 8; one worker stays sequential; fallback exists for callers without a batch callback. Update `AGENTS.md` architecture line for the worker protocol's batch message.

- [ ] **Step 2: Regression gates**

Run `bun run quality`, `bun run validate`, `bun run test:e2e`. Expected: green; E2E 33 passed / 1 skipped.

- [ ] **Step 3: Mutation coverage**

Run `bun run test:mutation:diff` (incremental file exists). Confirm the report includes `src/lib/archive/decision.ts`, `naming.ts`, `sort.ts` and `engine.ts`. If the score drops below the 60% break threshold, add tests for the newly surviving branches and rerun. Report the final score and survivors.

- [ ] **Step 4: Regenerate matrix and finish**

Run `bun run test:coverage`, `bun run matrix`, `git diff --check`, and show the diff. Do not commit until explicitly asked.

## Self-Review Notes

- Spec coverage: protocol/engine/worker → Task 1; batch ZIP → Task 2; docs/mutation/matrix → Task 3.
- Review Focus items each have an owning test step.
- No worker pool or prefetch; documented as deferred in the spec.
- No commits are built into the tasks.
