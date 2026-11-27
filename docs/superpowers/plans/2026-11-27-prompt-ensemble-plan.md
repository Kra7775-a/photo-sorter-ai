# Prompt Ensemble Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Average text embeddings over four English templates per label and verify on the real `val.zip` benchmark whether uncertain (review) results drop.

**Architecture:** A pure `src/lib/model/prompt.ts` builds label-major prompts and averages/normalizes grouped embeddings. `worker.ts` calls it inside the existing cached `embedLabels()`, so the batch protocol, main-thread engine and ZIP contract stay unchanged.

**Tech Stack:** Bun tests, Transformers.js text tower, existing Playwright benchmark, Stryker.

**Spec:** `docs/superpowers/specs/2026-11-27-prompt-ensemble-design.md`

## Global Constraints

- Bun only, exact dependency versions; no new dependency.
- Code/identifiers/comments English; prompts remain English.
- `worker.ts` is the only module importing `@huggingface/transformers`.
- Cache key stays the label set; templates are a code constant.
- New `src/lib/**/*.ts` branches need tests.
- No commits without explicit approval.
- Final gates: `validate`, `quality`, `test:e2e`, benchmark comparison, `test:mutation:diff`, `matrix`.

## Review Focus

1. Prompt/embedding order must match — `labelPrompts` test.
2. Averaging must be element-wise and normalized — `averageLabelEmbeddings` tests.
3. Degenerate/empty groups must not produce NaN — zero-vector fallback test.
4. Cached label sets must still work — worker cache logic unchanged, E2E covers.
5. Benchmark must show whether review share improves — Task 3.

---

### Task 1: Pure prompt helpers

**Files:**
- Create: `src/lib/model/prompt.ts`, `src/lib/model/prompt.test.ts`

**Interfaces:**
- Produces:
  - `PROMPT_TEMPLATES` with exactly four strings: `a photo of {label}`, `a picture of {label}`, `an image of {label}`, `a photograph of {label}`;
  - `labelPrompts(labels: readonly string[]): string[]` — label-major order;
  - `averageLabelEmbeddings(embeddings: readonly number[][], templateCount?: number): number[][]`.

- [ ] **Step 1: Write failing tests**

Cases: two labels produce 8 prompts in label-major order; template strings all contain `{label}`; averaging unit vectors gives expected mean; result is L2-normalized; empty embeddings → `[]`; a zero group → zero vector (no NaN); length not divisible by templateCount is handled as a partial group.

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test src/lib/model/prompt.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement helpers**

Keep helpers pure. Use element-wise mean, then L2 normalize; `Math.hypot(...values)` is acceptable. Zero/empty group returns a zero vector of the same dimension.

- [ ] **Step 4: Verify**

Run `bun test src/lib/model/prompt.test.ts`, `bun run lint`, `bun run check`, `bun run typecheck`, `bun run arch:check`. Expected: PASS.

### Task 2: Worker integration

**Files:**
- Modify: `src/lib/model/worker.ts`
- Test: existing `engine.test.ts`, E2E later

**Interfaces:**
- Consumes: `labelPrompts`, `averageLabelEmbeddings` from `./prompt`.

- [ ] **Step 1: Replace prompt construction**

In `embedLabels()`, build `prompts = labelPrompts(labels)`, tokenize once, take `text_embeds.tolist()` (raw, no pre-normalization), and pass through `averageLabelEmbeddings`. Keep cache semantics and `MAX_CACHED_LABEL_SETS`.

- [ ] **Step 2: Verify**

Run `bun test src/lib/model/engine.test.ts`, `bun run test`, `bun run check`, `bun run typecheck`, `bun run arch:check`, `bun run lint`. Expected: PASS. No E2E yet.

### Task 3: Benchmark decision and quality pass

**Files:**
- Reports only under `reports/bench/`; docs if needed.

- [ ] **Step 1: Standard gates**

Run `bun run format`, `bun run quality`, `bun run validate`, `bun run test:e2e`. Expected: green, E2E 33 passed / 1 skipped.

- [ ] **Step 2: Benchmark comparison**

Free port 3000 if safe (do not kill foreign servers silently), run `bun run bench:sort /home/kramarich/Загрузки/val.zip` with default batch 8, and compare to baseline 2264.7s / 2094 sorted / 1831 review / 0 errors. Keep the ensemble only if review share drops without a large elapsed-time regression; otherwise revert and report.

- [ ] **Step 3: Mutation and matrix**

Run `bun run test:coverage`, `bun run test:mutation:diff`, `bun run matrix`, `git diff --check`. Expected: mutation score above 60; matrix includes `prompt.ts`. Show final diff; do not commit.

## Self-Review Notes

- Spec coverage: helpers → Task 1; worker → Task 2; measurement/quality → Task 3.
- Review Focus items have owning tests or benchmark steps.
- Default behavior of output ZIP/report stays unchanged.
- No commits are built into the tasks.
