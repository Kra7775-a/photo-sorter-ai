# Sort Benchmark Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Measure real ZIP sorting on the 3925-image dataset and make batch size tunable for comparison.

**Architecture:** `BATCH_SIZE` stays a constant but is parsed from the build-time `VITE_BATCH_SIZE` env var with a safe default. `scripts/bench-sort.ts` drives the real SvelteKit app through Playwright, uploads a ZIP, waits for the result and writes JSON to `reports/bench/`.

**Tech Stack:** Bun, Playwright Chromium, Vite build-time env, existing Stryker/quality gates.

**Spec:** `docs/superpowers/specs/2026-11-26-sort-benchmark-design.md`

## Global Constraints

- Bun only, exact dependency versions; no new dependency.
- Default `BATCH_SIZE` stays 8; invalid env values fall back to 8.
- Benchmark never kills unrelated servers; port conflict → clear error unless `BENCH_BASE_URL` is provided.
- No benchmark data committed; `reports/` stays gitignored.
- Code/identifiers/comments English; no new secrets.
- New `src/lib/**/*.ts` branches need tests.
- No commits without explicit approval.

## Review Focus

1. Invalid batch-size env values must not break sorting — Task 1 parse tests.
2. Default behavior must be byte-for-byte unchanged — Task 1 default test + existing sort tests.
3. Benchmark must not hang forever — Task 2 explicit timeout and cleanup.
4. Benchmark must not disturb other dev servers — Task 2 port check / `BENCH_BASE_URL`.
5. Results must be attributable to a batch size — Task 2 records it in JSON.

---

### Task 1: Configurable batch size

**Files:**
- Modify: `src/lib/archive/sort.ts`, `src/lib/archive/sort.test.ts`

**Interfaces:**
- Produces: `export function parseBatchSize(raw: string | undefined): number;` and `export const BATCH_SIZE = parseBatchSize(import.meta.env.VITE_BATCH_SIZE);`

- [ ] **Step 1: Write failing tests**

`sort.test.ts` cases: `undefined` → 8; `"16"` → 16; `"0"`, `"-1"`, `"65"`, `"abc"` → 8; `"4"` → 4.

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test src/lib/archive/sort.test.ts`
Expected: FAIL — `parseBatchSize` missing.

- [ ] **Step 3: Implement parser and constant**

Implement a pure parser: accept only integer strings 1–64, otherwise fallback 8. Set `BATCH_SIZE` from `import.meta.env.VITE_BATCH_SIZE` with a guard for non-Vite runtimes. Keep all batching logic and output behavior unchanged with the default.

- [ ] **Step 4: Verify**

Run: `bun test src/lib/archive/sort.test.ts`, `bun run lint`, `bun run check`, `bun run typecheck`, `bun run arch:check`. Expected: PASS.

### Task 2: Benchmark script and docs

**Files:**
- Create: `scripts/bench-sort.ts`
- Modify: `package.json`, `README.md`, `AGENTS.md`

**Interfaces:**
- Consumes: `BATCH_SIZE` behavior from Task 1; Playwright Chromium.
- Produces: `bun run bench:sort [zipPath]`; JSON in `reports/bench/sort-<timestamp>.json`.

- [ ] **Step 1: Implement the benchmark**

Script steps: optional ZIP path arg defaults to `/home/kramarich/Загрузки/val.zip`; if `BENCH_BASE_URL` set, use it; else check port 3000 — if busy, exit with a clear message; otherwise spawn `bun scripts/dev-all.ts`, poll `GET /` until 200, and stop it in `finally`. Launch Chromium, collect console errors, `goto("/app")`, set `input[accept=".zip,application/zip"]` to the ZIP, start timer, wait up to 30 min for the result download link, stop timer, read counts text from UI, write JSON with timestamp/zip/batchSize/elapsedMs/counts/errors/chromium version, print a one-line summary. Exit non-zero on error.

- [ ] **Step 2: Wire command and docs**

Add `"bench:sort": "bun scripts/bench-sort.ts"` to package.json. Document the command, `VITE_BATCH_SIZE` and `BENCH_BASE_URL` in README/AGENTS. No version changes.

- [ ] **Step 3: Verify script safety**

Run with a nonexistent ZIP path and confirm a clear error and no orphan dev server. Run `bun run format`, `bun run lint`, `bun run typecheck`, `bun run arch:check`, `bun run unused`, `bun run quality`, `bun run validate`, `git diff --check`. Expected: all green. Do NOT run the full benchmark yet.

### Task 3: Baseline measurement and decision

**Files:**
- Reports only under `reports/bench/` (gitignored).

- [ ] **Step 1: Run baseline**

Free port 3000 only if it belongs to this repository or with explicit care for other projects; alternatively reuse a running app via `BENCH_BASE_URL`. Run `bun run bench:sort /home/kramarich/Загрузки/val.zip` with default batch size 8. Record elapsed time and counts.

- [ ] **Step 2: Compare one alternative batch size**

Rebuild/restart the app with `VITE_BATCH_SIZE=16`, rerun the same benchmark, compare results. If 16 is clearly faster and stable, it becomes the new default; otherwise keep 8. If the difference is within noise, keep 8 and defer prefetch/pool as not worth the risk.

- [ ] **Step 3: Report**

Write a short decision note in the final response: measured numbers, chosen batch size, and whether prefetch/worker pool is still justified. Do not commit until explicitly asked.

## Self-Review Notes

- Spec coverage: configurable batch → Task 1; benchmark script/docs → Task 2; real measurement/decision → Task 3.
- All five Review Focus items have an owning step.
- Default behavior is protected by existing sort tests.
- No commits are built into the tasks.
