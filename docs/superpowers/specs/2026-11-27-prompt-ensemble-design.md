# Prompt ensembling for label embeddings

Date: 2026-11-27
Status: approved (option A)

## Intent

The real benchmark classified 3925 images into 2094 sorted and 1831 review — 46.6% of files were uncertain. Today `embedLabels()` uses one template (`a photo of <label>`) per category. CLIP-style models conventionally average text embeddings over several natural templates; this can make abstract categories less sensitive to one phrasing without touching the model or the ZIP contract.

## Goals

- Average text embeddings over four English templates per label.
- Keep one text-encoder call per label set and the existing cache.
- Keep the worker sequential, batch protocol and UI unchanged.
- Measure the effect on the same `val.zip` benchmark and keep the change only if review share improves without a large slowdown.

## Non-goals

- No category-specific heuristic templates, no new dependency, no model change.
- No change to thresholds, report format or review behavior.
- No user-facing prompt editor.

## Constraints

- Code/identifiers/comments English; no new secrets.
- New `src/lib/**/*.ts` branches need tests (Stryker runs there).
- `worker.ts` remains the only module importing `@huggingface/transformers`.
- Cache key stays based on the label set, now covering all templates.
- `bun run validate`, `quality`, `test:e2e` and benchmark remain runnable.

## Decision

- `src/lib/model/prompt.ts`:
  - `export const PROMPT_TEMPLATES = ["a photo of {label}", "a picture of {label}", "an image of {label}", "a photograph of {label}"] as const;`
  - `export function labelPrompts(labels: readonly string[]): string[]` — flat order label-major: all templates for label 0, then label 1, etc.
  - `export function averageLabelEmbeddings(embeddings: readonly number[][], templateCount = PROMPT_TEMPLATES.length): number[][]` — groups consecutive embeddings by label, averages element-wise, L2-normalizes, falls back to zero vector for an empty/degenerate group.
- `worker.ts`: `embedLabels()` builds prompts with `labelPrompts`, tokenizes once, takes raw `text_embeds.tolist()`, runs `averageLabelEmbeddings`, and caches. Remove the old single-template normalization; the helper normalizes.
- Keep `MAX_CACHED_LABEL_SETS` and cache invalidation unchanged. The cache is per label set and implicitly per template set; templates are a code constant, so no version key is needed.

## Verification

- `prompt.test.ts` pins prompt order/count, averaging, normalization, empty input and zero-vector fallback.
- Existing `engine.test.ts` and E2E flow stay green.
- Run `bun run bench:sort /home/kramarich/Загрузки/val.zip` with default batch 8 and compare against baseline: 2264.7s, 2094 sorted, 1831 review, 0 errors. Keep the change if review share drops without a large elapsed-time regression; otherwise revert.
- After code changes: `bun run test:coverage`, `bun run matrix`, `bun run test:mutation:diff`.

## Builder latitude

- Exact internal variable names in `worker.ts`.
- Whether to keep fallback zero vector or unit vector for degenerate embeddings; zero vector is preferred because it yields neutral similarity.
