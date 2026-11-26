# Review Bucket Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Send uncertain classifications to a `review/` folder with audit data in `report.csv` instead of silently filing them under a wrong category.

**Architecture:** A pure `src/lib/archive/decision.ts` applies two thresholds to the ranked scores. `sortArchive` uses it for both the output path and report rows. `review` is an optional count so existing synced runs stay valid. UI and docs expose the new status without changing the ZIP container.

**Tech Stack:** Bun tests, Svelte 5 runes, Tailwind semantic tokens, dependency-cruiser, Playwright E2E, Stryker (mutates `src/lib/**/*.ts`).

**Spec:** `docs/superpowers/specs/2026-11-26-review-bucket-design.md`

## Global Constraints

- Bun only, exact dependency versions; no new dependency.
- Code/identifiers/comments English; UI strings English.
- Svelte 5 runes only; semantic Tailwind tokens, no raw colors.
- `Counts.review` is optional (default 0); old synced runs and fixtures remain valid.
- ZIP stays a ZIP with BOM+CRLF `report.csv`; streaming one file at a time is preserved.
- New `src/lib/**/*.ts` branches need tests (Stryker mutates that tree).
- No commits without explicit user approval; show diff first.
- Final gates: `bun run validate`, `bun run quality`, `bun run test:e2e`.

## Review Focus

1. Confident-but-wrong classification (0.9011) must be deferrable via the margin rule — Task 1 `decision.test.ts` and Task 2 `sort.test.ts`.
2. Low-confidence classification (0.50) must go to `review/` — Task 1 and Task 2 tests.
3. An image must not be dropped: every classified file still yields exactly one output entry — Task 2 count/equality assertions.
4. Old synced runs without `review` must validate — Task 3 `server/runs.test.ts`.
5. CSV consumers must see the new columns without breaking BOM/CRLF — Task 2 `naming.test.ts`.

---

### Task 1: Pure decision module

**Files:**
- Create: `src/lib/archive/decision.ts`, `src/lib/archive/decision.test.ts`

**Interfaces:**
- Produces:
  - `export const MIN_CONFIDENCE = 0.65;`
  - `export const MIN_MARGIN = 0.15;`
  - `export type Decision = { category: string; candidate: string; runnerUp: string | null; margin: number | null; score: number; review: boolean };`
  - `export function decideCategory(scores: readonly Score[]): Decision | null;`

- [ ] **Step 1: Write failing tests**

`decision.test.ts` with cases:
- empty scores → `null`;
- `[{ people, 0.9 }, { nature, 0.1 }]` → `review: false`, `category: "people"`, `candidate: "people"`, `runnerUp: "nature"`, `margin: 0.8`;
- `[{ buildings, 0.5 }, { graphics, 0.3 }]` → `review: true`, `category: "review"`, `margin: 0.2` (low confidence);
- `[{ buildings, 0.9 }, { graphics, 0.88 }]` → `review: true` (narrow margin despite high score);
- unsorted input is sorted by score before deciding (assert the winner is the highest).

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/lib/archive/decision.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement `decideCategory`**

Sort a copy descending. `review = score < MIN_CONFIDENCE || score - runnerUpScore < MIN_MARGIN`. `category = review ? "review" : safeFolderName(candidate)` (import `safeFolderName` from `./naming`). `margin` is `null` when there is no runner-up, which also counts as review.

- [ ] **Step 4: Run tests**

Run: `bun test src/lib/archive/decision.test.ts`, `bun run arch:check`.
Expected: PASS; archive scope still allows `decision.ts` → `naming.ts` and `model/protocol`.

### Task 2: Archive integration and CSV contract

**Files:**
- Modify: `src/lib/archive/naming.ts`, `src/lib/archive/sort.ts`, `src/lib/archive/naming.test.ts`, `src/lib/archive/sort.test.ts`

**Interfaces:**
- Consumes: `Decision` and thresholds from Task 1.
- Produces: `ReportStatus` includes `"review"`; `ReportRow` gains `candidate: string`, `runnerUp: string | null`, `margin: number | null`; CSV header becomes `source,category,score,margin,candidate,runner_up,status,error`; `SortArchiveResult.counts` gains `review?: number`.

- [ ] **Step 1: Write failing naming tests**

In `naming.test.ts`: assert the new header string exactly (BOM + CRLF preserved) and that a review row serializes with `margin: 0.1234` as `0.1234` and empty `runner_up` as `""`.

- [ ] **Step 2: Run naming tests to verify they fail**

Run: `bun test src/lib/archive/naming.test.ts`
Expected: FAIL on header/fields.

- [ ] **Step 3: Extend report types and CSV builder**

Add the three fields and `"review"` to `ReportStatus`. Update `REPORT_HEADER` and `buildReportCsv` to emit the exact new column order. Keep BOM, CRLF, `score.toFixed(4)` and `margin.toFixed(4)` behavior.

- [ ] **Step 4: Write failing sort tests**

In `sort.test.ts`, use the existing classify stub to return a low-confidence score set for one image and a normal set for others. Assert: output contains `review/<name>`; the report row has `status: "review"`, `category: "review"`, `candidate` and `margin`; `counts.review === 1`; total output file count is unchanged. Update existing exact `counts` assertions to include `review: 0` where the new field is required by the result type.

- [ ] **Step 5: Run sort tests to verify they fail**

Run: `bun test src/lib/archive/sort.test.ts`
Expected: FAIL — review folder/status missing.

- [ ] **Step 6: Integrate decision into `sortArchive`**

Replace `topScore` with `decideCategory(scores)`. For `review`, push the row with empty `error`, use `category: "review"` in the report, and yield `review/<safeFileName>` via `uniquePath`. For non-review keep current folder behavior and set `candidate`/`runnerUp`/`margin`. Add `review` to the counts accumulator.

- [ ] **Step 7: Verify**

Run: `bun test src/lib/archive/sort.test.ts`, `bun test src/lib/archive/naming.test.ts`, `bun run check`, `bun run typecheck`. Expected: PASS.

### Task 3: UI, server validation, docs and E2E

**Files:**
- Modify: `src/lib/components/RunCounts.svelte`, `src/lib/components/ArchiveResultCard.svelte`, `src/lib/sorter/controller.ts`, `src/lib/sync/types.ts`, `server/runs.ts`, `server/runs.test.ts`, `README.md`, `tests/e2e/archive.spec.ts`
- Regenerate: `coverage/lcov.info`, `docs/quality/test-matrix.md` via `bun run matrix`

**Interfaces:**
- Consumes: `Counts.review` from Task 2.
- Produces: optional `review` accepted by server validation; UI shows `review: N` when non-zero.

- [ ] **Step 1: Update counts types**

Add optional `review?: number` to the `Counts` type in `src/lib/sync/types.ts` and the archive-result type in `src/lib/sorter/controller.ts`. In `server/runs.ts`, accept an optional numeric `review` field; keep rejecting unknown/malformed counts. Add a `server/runs.test.ts` case with a legacy count object lacking `review` and one with `review: 2`.

- [ ] **Step 2: Update UI**

`RunCounts.svelte`: append ` · review: {counts.review}` only when `counts.review` is a positive number. `ArchiveResultCard.svelte`: when review > 0, add a short line "N files need review in review/". Reuse semantic tokens and existing components; no new colors.

- [ ] **Step 3: E2E and docs**

Keep the existing archive E2E assertions valid (review count stays hidden when zero). Add an assertion that `report.csv` in the downloaded ZIP contains the new header. Document `review/`, the two thresholds, the new CSV columns and the optional count in `README.md` ZIP-contract section.

- [ ] **Step 4: Regenerate matrix and final gates**

Run `bun run test:coverage`, `bun run matrix`, then `bun run quality`, `bun run validate`, `bun run test:e2e`, `git diff --check`.
Expected: all green; E2E 33 passed / 1 skipped. Show diff; do not commit.

## Self-Review Notes

- Spec coverage: thresholds and Decision → Task 1; folder/CSV/counts → Task 2; UI/server/docs/E2E → Task 3.
- All five Review Focus items have an owning test step.
- `Counts.review` stays optional to avoid touching every synced fixture.
- No commits are built into the tasks.
