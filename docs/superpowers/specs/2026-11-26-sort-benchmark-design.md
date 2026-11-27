# Sort benchmark

Date: 2026-11-26
Status: approved (option A)

## Intent

The second performance wave should start from measurement, not guesses. The user's real dataset is available at `/home/kramarich/Загрузки/val.zip` (~102 MB, 3925 images). A reproducible benchmark lets us compare batch sizes and later a worker pool without relying on impressions.

## Goals

- Add a Bun script that drives the real app through Playwright and uploads a ZIP.
- Report elapsed time, file/category counts, review count and console errors.
- Make `BATCH_SIZE` configurable at build time so the same dataset can measure 4/8/16.
- Store machine-readable results under `reports/bench/` and expose `bun run bench:sort`.

## Non-goals

- No model, prompt, threshold or ZIP-contract changes.
- No worker pool or prefetch yet — the benchmark decides whether they are worth it.
- No benchmark data committed; only the script and docs.

## Constraints

- Bun only, exact dependency versions; use already installed `@playwright/test`.
- The benchmark must not kill unrelated dev servers; it fails with a clear message if port 3000 is busy and accepts `BENCH_BASE_URL` to reuse a running app.
- Static output order, BOM/CRLF CSV and review folder behavior stay unchanged.
- Code/identifiers/comments English; no new secrets or env files.

## Decision

- `src/lib/archive/sort.ts`: `BATCH_SIZE` remains 8 by default but reads an optional `VITE_BATCH_SIZE` build-time variable, clamped to 1–64, with the fallback 8. This is a pure constant change; all behavior with the default stays identical.
- `scripts/bench-sort.ts`:
  - optional CLI arg = ZIP path (default `/home/kramarich/Загрузки/val.zip`);
  - if `BENCH_BASE_URL` is set, reuse that origin; otherwise start `bun scripts/dev-all.ts`, wait for `GET /` → 200, then stop it in `finally`;
  - if port 3000 is already listening without `BENCH_BASE_URL`, exit with a clear message;
  - open Chromium, `page.goto("/app")`, set the file input, wait up to 30 minutes for the download result link;
  - record elapsed ms, counts text, review count from `report.csv` if convenient, console errors, batch size from env;
  - write `reports/bench/sort-<timestamp>.json` and print a short summary.
- `package.json`: `"bench:sort": "bun scripts/bench-sort.ts"`.

## Verification

- Unit tests still pass with default batch size 8.
- Run baseline on `val.zip`, then one alternative batch size; compare numbers in `reports/bench/`.
- `bun run validate`, `bun run quality`, `bun run test:e2e` stay green.

## Builder latitude

- Exact JSON report shape and console summary wording.
- Whether to read counts from the UI text or the downloaded `report.csv`; prefer the UI text for simplicity and the CSV when already downloading.
