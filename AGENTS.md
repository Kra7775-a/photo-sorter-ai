# AGENTS.md

Browser-based photo sorter: Svelte 5 + Vite, MobileCLIP runs in a Web Worker. Optional Bun server for opt-in metadata sync (no photos are uploaded, no env files are committed). Product details and the ZIP contract are in `README.md`.

## Commands

- Package manager: Bun only (`bun.lock`). `bunfig.toml` sets `exact = true`: don't replace exact dependency versions with ranges.
- `bun run dev` — Vite at `http://localhost:3000`; `strictPort` is on, so dev fails if the port is already in use.
- `bun run dev:all` — Vite + Bun API in one process group; `/api` is proxied from 3000 to 3001.
- `bun run validate` — required gate: `format:check → lint → arch:check → typecheck → check → test → build`. Run it before considering work done.
- `bun run arch:check` — dependency-cruiser rules in `.dependency-cruiser.cjs`; `arch:graph` prints the dependency graph.
- Single file: `bun test src/lib/archive/sort.test.ts`; single test: `bun test -t "writes the report"`. Tests use `bun:test`, live next to the code, `*.test.ts`.
- `bun run test:coverage` — 90% lines/functions threshold. Component tests live beside components as `Component.svelte.test.ts`, use Bun's browser conditions + happy-dom via `svelte-loader.ts`, and run with `--isolate`.
- `bun run test:e2e` — Playwright flows in `tests/e2e/`; install Chromium with `bun x playwright install chromium` once.
- `bun run typecheck` — built-in `bun check --no-script -b` (project references), not `tsc`. `bun run check` — separate `svelte-check`. Both are required.
- No CI; `bun run validate` is the only automated check.

## Architecture

- `src/main.ts` mounts `src/App.svelte` — a thin wiring layer: auth/sync + composition of components. UI logic lives in `src/lib/components/*`; file/ZIP orchestration lives in the tested `src/lib/sorter/controller.ts`.
- The main thread talks to the model only through `src/lib/model/engine.ts`; `worker.ts` is the only place that actually imports `@huggingface/transformers`. Don't pull the library into the main thread.
- The worker processes requests sequentially (`queue`): ONNX sessions are not reentrant. `progress` messages are global, without `id`; `result`/`error` are matched by `id`. Message shapes are in `protocol.ts` — change them consistently.
- `sortArchive` reads the ZIP one file at a time and streams the result via `client-zip`. `@zip.js/zip.js` is lazy-loaded from `zip-core-native`; `zip-core.d.ts` is a local type shim for that subpath. Don't replace streaming with in-memory extraction.
- ZIP contract: category folders, name deduplication with ` (2)`, `report.csv` with BOM and CRLF; HEIC/TIFF and non-images are skipped, errors go into the report. If you change behavior, update tests and README.
- The `Xenova/mobileclip_b` model (q8, ~145 MB) is downloaded from Hugging Face on first run and cached by the browser. The text encoder is English-only: categories must be English, prompt `a photo of <label>`. The UI is English, but categories must not be translated.
- The PWA precaches the shell; the ORT `.wasm` (26.9 MB) is cached at runtime because it exceeds Cloudflare's 25 MB limit. `dist/` is a static deploy.

## Conventions

- Svelte 5 runes only (`$state`, `$derived`): `runes: true` is set in `svelte.config.js`. Don't write new code in legacy syntax (`export let`, `$:`).
- Tailwind v4 via `@tailwindcss/vite`. Colors are semantic tokens from `src/app.css` (`text-ink`, `bg-panel`, `bg-accent`, `border-line`, …) with light/dark values already provided. Don't add raw colors or hex.
- Formatting is oxfmt (`.oxfmtrc.json`), linting is type-aware oxlint. These are not Prettier or ESLint: don't add their configs. `bun run format` sorts imports and Tailwind classes.
- `.agents/skills/*` are vendored skills tracked by `skills-lock.json`; don't edit them by hand. They are excluded from lint/format/Tailwind. Use these skills when working with Svelte and Transformers.js.
- Coverage only counts modules imported by tests; `worker.ts`, `main.ts`, and `.svelte` files are excluded in `bunfig.toml`. New branches in `engine.ts`, `ranking.ts`, `archive/*` need tests; verify the worker and UI in the browser.
- Test scripts use `--pass-with-no-tests`: a typo in the filter or file name exits 0 with no tests run.
- Code, identifiers, and comments are English; UI strings are English.
