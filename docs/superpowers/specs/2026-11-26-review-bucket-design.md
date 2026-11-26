# Review bucket for uncertain classifications

Date: 2026-11-26
Status: accepted by delegation ("check the research and do it")

## Intent

The user's first real ZIP run showed confident-looking but wrong classifications (`pie mask.png → buildings 0.9011`, `loss graph.png → transport 0.6168`, `accuracy graph.png → graphics 0.5004`). Today `topScore()` always picks a category, so uncertain images are silently filed into the wrong folder. The fix is selective prediction: abstain into a `review/` folder and keep enough evidence in `report.csv` for a human to decide.

## Goals

- Move uncertain images to `review/` instead of a wrong category folder.
- Keep every image in the output archive — nothing is silently dropped.
- Record why an image was deferred: candidate, runner-up and margin.
- Show the review count in the UI next to sorted/skipped/errors.

## Non-goals

- No model change, no new dependency, no server-side inference.
- No user-facing threshold control in this iteration.
- No automatic reclassification or learning from user corrections.
- No change to the output container: it stays a ZIP with `report.csv`.

## Constraints

- Code/identifiers/comments English; ZIP contract and README updated together.
- Svelte 5 runes, semantic Tailwind tokens, no new colors.
- `Counts.review` is optional (default 0) so existing synced runs and test fixtures stay valid.
- New branches in `src/lib/**/*.ts` need tests (Stryker mutates that tree).
- `bun run validate`, `bun run quality`, `bun run test:e2e` stay green.

## Research summary

Selective prediction fits a threshold on a confidence score and abstains below it (Geifman & El-Yaniv, 2017). For frozen CLIP-style models, a natural score is the **margin between the two largest logits**; softmax maximum alone is easy to miscalibrate under distribution shift ("The Margin Knows the Background", arXiv:2611.00026, 2026), and no single score is universally best. Prompt/label quality also matters. We therefore use both signals rather than trusting one probability: low top-1 score **or** a small top-1/top-2 gap means review.

## Decision

- New pure module `src/lib/archive/decision.ts`:
  - constants `MIN_CONFIDENCE = 0.65`, `MIN_MARGIN = 0.15`;
  - `decideCategory(scores: readonly Score[]): Decision | null`, where `Decision` carries `category`, `candidate`, `runnerUp`, `margin`, `score` and `review: boolean`;
  - review when `scores[0].score < MIN_CONFIDENCE || (scores[0].score - (scores[1]?.score ?? 0)) < MIN_MARGIN`; empty scores → `null`.
- `sortArchive` uses `decideCategory` instead of `topScore`. Review rows get `status: "review"`, `category: "review"` and are written to `review/<safe name>`, deduplicated by the existing `uniquePath`.
- `ReportStatus` gains `"review"`. `ReportRow` gains `candidate`, `runnerUp` and `margin`; `report.csv` header becomes
  `source,category,score,margin,candidate,runner_up,status,error` with `margin` formatted to 4 decimals.
- `Counts` gains optional `review?: number`; `sortArchive` counts review rows, `RunCounts.svelte` shows `review: N` only when >0, and `ArchiveResultCard` adds a short note pointing to the `review/` folder.
- `server/runs.ts` validation accepts an optional numeric `review` field so old JSON rows remain valid.

## Test matrix impact

- `decision.test.ts` pins both thresholds, the empty case, runner-up formatting and dedup interaction indirectly through `sort.test.ts`.
- `sort.test.ts` gains a case where low-confidence and narrow-margin images land in `review/` with the new CSV columns and `counts.review`.
- `RunCounts` and `ArchiveResultCard` are verified by svelte-check and E2E; no new component tests required.
- After implementation, regenerate `bun run test:coverage` and `bun run matrix`; a later Stryker run will cover the new module.

## Builder latitude

- Exact Tailwind classes for the review note.
- Whether to place the threshold constants in `decision.ts` or a config file (keep them in `decision.ts` unless a UI control is added later).
