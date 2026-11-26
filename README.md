# AI Photo Sorter

A browser-based photo sorter that groups photos by category. The model runs locally: images never leave your device. The server is optional — it is only needed for accounts and for syncing metadata between devices.

## Stack

- SvelteKit 3 in SPA mode + Svelte 5 (runes) + TypeScript + Vite
- Tailwind CSS v4
- [Transformers.js](https://github.com/huggingface/transformers.js) + ONNX Runtime Web (WASM)
- MobileCLIP-B `Xenova/mobileclip_b`, int8 (~145 MB)
- Web Worker for inference
- ZIP without a server: `@zip.js/zip.js` reads the archive, `client-zip` builds the new one
- PWA (`@vite-pwa/sveltekit`): offline shell, installable on a device
- Bun, oxlint, oxfmt, svelte-check, `bun test`

## Run

```bash
bun install
bun run dev        # http://localhost:3000 (client only)
bun run dev:all    # client + API in one command, /api → localhost:3001
bun run dev:server # API only on :3001
bun run build      # production build into dist/
bun run preview    # preview the build locally
bun run test:coverage  # coverage (text + coverage/lcov.info)
bun run test:mutation     # full mutation tests (Stryker + Bun, ~15 min)
bun run test:mutation:diff # incremental mutation tests (changed mutants only)
bun run test:e2e       # Playwright E2E + visual regression
bun run arch:check     # dependency-cruiser architecture rules
bun run arch:graph     # dependency graph (Mermaid)
```

`dev:all` needs the same env variables as the server (`SYNC_MASTER_KEY`,
`BETTER_AUTH_SECRET`); without them the server exits immediately. `BETTER_AUTH_URL`
defaults to `http://localhost:3000` so better-auth cookies work through the Vite proxy.

Full check before committing:

```bash
bun run validate   # format:check + lint + arch:check + typecheck + check + test + build
```

## Routes

SvelteKit owns routing and layouts; the app is a client-only SPA (`ssr = false`,
`adapter-static` with an `index.html` fallback). There is no hand-written router.

| Path       | Page      | Purpose                                                        |
| ---------- | --------- | -------------------------------------------------------------- |
| `/`        | Landing   | Public intro; "Try without account" opens `/app`                |
| `/sign-in` | Sign in   | Sign in / sign up, "Continue as guest" → `/app`                 |
| `/app`     | Sorter    | Guest-first photo/ZIP sorting, history and the account chip     |
| `/help`    | Help      | Categories, ZIP contract, first run and offline use             |
| `/privacy` | Privacy   | The shared privacy statement                                    |
| `/about`   | About     | Project, stack and model limitations                            |

Guests can open `/app` directly and sort without an account: sync stays off and no
`/api` request is made unless the readable `photo-sorter-session=1` hint cookie
exists. An account exists only for opt-in metadata sync. A returning user on
`/sign-in` redirects to `/app`. One `AppController` lives in
`src/routes/+layout.svelte` for the whole SPA, so the loaded model and local history
survive navigation between routes.

The production output stays in `dist/`. `public/_redirects` contains
`/* /index.html 200` for static hosts such as Cloudflare Pages, and the Bun server
serves `dist/index.html` for non-API paths. Keep both so deep links like `/app`
work in production.

Quality and security tools (run separately, not part of `validate`):

```bash
bun run quality       # duplication, unused code, spelling, secrets, docs style
bun run sast          # Semgrep if installed locally; CI always runs it
bun run hooks:install # install Lefthook pre-commit hooks (fast checks only)
bun run matrix        # regenerate docs/quality/test-matrix.md from coverage + mutation reports
```

`bun run matrix` needs fresh `bun run test:coverage` and `bun run test:mutation` reports. It maps
modules to test files by convention and documents the generated test matrix; with
`coverageAnalysis: "off"`, Stryker cannot reliably attribute a mutant to a specific test file.

Lefthook's pre-commit hook runs `format:check`, `lint`, `arch:check`, `secrets` and `spell`;
the full `validate`, E2E and mutation suites stay explicit. The Semgrep rules in `.semgrep.yml`
forbid `eval`/`Function` in TypeScript source and `innerHTML` assignments in `src/**`.

Bun only counts coverage for modules imported by tests. `worker.ts` and entry points are
excluded in `bunfig.toml`; Svelte components are compiled by `svelte-loader.ts` and their
component tests are included in the report. The percentages therefore cover modules that
have tests.

Component tests use Bun's `--conditions=browser`, a `.svelte` compiler preload
(`svelte-loader.ts`) and `happy-dom`; `@testing-library/svelte` mounts components locally.
UI kit components have component tests next to them as `Component.svelte.test.ts`, with shared
DOM setup in `component-test.ts`. Feature shells are verified with svelte-check and E2E and can
get component tests later. Tests run with `--isolate`, so per-file DOM registration cannot leak
into server or archive tests.

Mutation tests are run with `bun run test:mutation` (full, `--force`) or
`bun run test:mutation:diff` (`--incremental`). Stryker uses the unofficial
`stryker-mutator-bun-runner`; a local patch in `patches/` adapts it to Bun 1.4 (which no
longer prints per-line results in non-TTY mode and no longer understands the old output
format). The `json` reporter writes machine-readable results to `reports/mutation/mutation.json`;
`scripts/mutation.ts` also copies timestamped snapshots into `reports/mutation/history/` so runs do
not overwrite each other. The HTML report is at `reports/mutation/mutation.html`; the `break`
threshold in `stryker.conf.json` is 60%.

Incremental mode reuses results from `reports/stryker-incremental.json`. Because `coverageAnalysis`
is `off`, it reliably detects changed mutants but cannot reliably tell which tests changed — run the
full command before releases and the diff command during development.

Architecture is enforced by dependency-cruiser (`arch:check`, included in `validate`). Its
rules in `.dependency-cruiser.cjs` encode the decisions in `docs/adr/0001-vertical-slices-architecture.md`
(vertical slices, thin root layout) and `docs/adr/0002-sveltekit-spa.md` (SvelteKit SPA routing):
cycles, `src ↔ server`, domain → UI, UI leaf, feature-scope leaks, component scope, pages outside the root layout acting as a composition root, no client barrel imports and server route/bootstrap separation are all forbidden. `arch:graph` prints a Mermaid graph of the current dependencies.

Playwright lives in `tests/e2e/` with fixtures in `tests/fixtures/`; it starts `dev:all`
itself. Sorter flows start at `/app`; navigation and auth flows also use `/`,
`/sign-in`, `/help`, `/privacy` and `/about`. Visual baselines capture `main` on
`/app` (the sorter empty state) and on `/` (the landing page) in the dark desktop,
light desktop and dark mobile variants. First run after cloning:
`bun x playwright install chromium`, then `bun run test:e2e --update-snapshots` to
create the visual baselines.

## CI

Two GitHub Actions workflows run on push and pull requests to `main`:

- `quality.yml` — `bun run validate` on Bun 1.4.4 plus `dup`, `unused`, `spell`, `secrets` and `docs:lint`.
- `security.yml` — CodeQL, Semgrep (pinned `semgrep==1.186.0`), gitleaks and TruffleHog, with full git history for the secret scanners. It also runs weekly and can be triggered manually.

External services are deliberately deferred: `renovate.json` and `sonar-project.properties` are
committed but inactive. Renovate needs the GitHub App installed, SonarCloud needs a token and real
`sonar.organization`/project key, and GitGuardian needs its GitHub App and credentials. No tokens
are stored in this repository; the workflows use only `GITHUB_TOKEN`.

## How it works

1. The user enters categories (one per line, English only).
2. The worker lazily loads two MobileCLIP towers: text and vision.
3. Labels are turned into `a photo of <label>` prompts and cached by set.
4. The photo embedding is compared with the label embeddings, softmax produces probabilities,
   and the UI shows the top 3.
5. The first run downloads ~145 MB (cached by the browser); after that inference takes
   hundreds of milliseconds on WASM.

### ZIP archives

You can select a `.zip` instead of individual photos. The archive is read one file at a time
(without unpacking everything into memory), each image is classified, and a new
`*-sorted.zip` archive is assembled:

- photos are placed into folders named after the category (`people/`, `nature/`, …);
- uncertain photos go to `review/` instead of a likely-wrong category: when the top score is
  below `0.65` or the gap to the runner-up is below `0.15`;
- only the file name is used; the original directories inside the archive are not preserved;
- duplicate names get a ` (2)`, ` (3)` suffix;
- `report.csv` at the root has a UTF-8 BOM and CRLF line endings; its header is
  `source,category,score,margin,candidate,runner_up,status,error`, with scores and margins
  written to 4 decimals;
- status is `sorted`, `review`, `skipped` or `error`; `candidate`, `runner_up` and `margin`
  record why an image was deferred;
- non-images and files that fail to decode are not copied, but are listed in the report;
- HEIC/TIFF are skipped: the browser cannot decode them.

Images are classified in batches of 8: the worker handles one batch per message with a
single vision forward and stays sequential (ONNX sessions are not reentrant). Callers
that don't provide a batch callback keep the per-image classification path.

The sorted/review/skipped/error counts appear above the download link. Synced run metadata
carries an optional `review` count, so runs recorded before the review bucket existed stay valid.

### Why English labels

MobileCLIP's text encoder is English-only. Russian words produce almost random results
(a photo of a cat ends up under "nature" instead of "animals"). The `a photo of ` template
noticeably improves short labels like `cat`.

## Structure

```
src/
  app.html                SvelteKit document shell
  app.css                 Tailwind and semantic OKLCH tokens
  routes/
    +layout.ts            SPA mode (ssr = false, prerender = false)
    +layout.svelte        root layout: one AppController, context, PWA registration
    +page.svelte          landing page wrapper
    sign-in/, app/, help/, privacy/, about/  thin route wrappers
    +error.svelte         not-found page
  lib/pages/              page components rendered by the route wrappers
  lib/app/
    controller.ts         auth/sync/labels/ZIP orchestration + tests
  lib/ui/                 UI kit on bits-ui + OKLCH tokens (see docs/ui-kit.md)
  lib/sorter/
    controller.ts         photo/ZIP orchestrator with injected dependencies + tests
  lib/components/
    SiteHeader.svelte     public top navigation
    AppHeader.svelte      app top navigation and account chip
    AuthForm.svelte       sign in/sign up form on /sign-in
    AccountPanel.svelte   signed-in controls: sync opt-in, sign out, delete
    CategoriesField.svelte, SourcePicker.svelte, ProgressPanel.svelte,
    ArchiveResultCard.svelte, PhotoList.svelte, HistoryPanel.svelte
  lib/sync/
    controller.ts         offline-first sync (IndexedDB → network) + tests
    client.ts, store.ts, merge.ts, types.ts
  lib/model/
    protocol.ts           message types between main thread and worker
    engine.ts             worker client, matching requests by id
    worker.ts             model loading, embeddings, softmax
    ranking.ts            pure result sorting/slicing + tests
  lib/archive/
    naming.ts             safe names, deduplication, report.csv + tests
    sort.ts               read ZIP → classify → new ZIP + tests
tests/
  e2e/                    Playwright flows + visual regression
  fixtures/               ZIP/JPEG fixtures
```

## Deployment

A static build (`dist/`) works on its own: Cloudflare Pages, Vercel, or any CDN. The model is not hosted on these platforms (Cloudflare Pages has a 25 MiB per-file limit); it is downloaded from Hugging Face Hub and cached in the browser. If you need your own CDN, put the model files in R2/S3 and override `env.remoteHost` in the worker. Without the server, sync is unavailable, but sorting works fully.

## Server and sync

The server is a single Bun process: it serves `dist/` and handles `/api` (accounts, runs, settings). First build the frontend (`bun run build`), then set the environment variables:

| Variable             | Purpose                                              | Default                  |
| -------------------- | ---------------------------------------------------- | ------------------------ |
| `SYNC_MASTER_KEY`    | required, base64 of 32 random bytes                   | —                        |
| `BETTER_AUTH_SECRET` | required, secret for sessions                         | —                        |
| `SYNC_DB_PATH`       | path to the SQLite file                               | `sync.db`                |
| `PORT`               | HTTP server port                                      | `3001`                   |
| `BETTER_AUTH_URL`    | public URL (for better-auth cookies and links)        | `http://localhost:$PORT` |

```bash
bun run keygen   # prints a key: copy it into SYNC_MASTER_KEY
SYNC_MASTER_KEY=<key> BETTER_AUTH_SECRET=<secret> bun run start
```

Master key rotation: generate a new `SYNC_MASTER_KEY`, then
`OLD_SYNC_MASTER_KEY=<old> SYNC_MASTER_KEY=<new> bun run rewrap` — this re-encrypts users'
keys without data loss.

For development there is `bun run dev:server` (watch mode). Secrets are stored only in the
environment and are never committed; losing `SYNC_MASTER_KEY` means losing access to the
encrypted data.

On successful sign-in/sign-up the server also sets `photo-sorter-session=1`: a
readable, non-HttpOnly hint (`Path=/`, `SameSite=Lax`, 30 days, `Secure` when
`BETTER_AUTH_URL` is https). Sign-out and account deletion clear it. The SPA reads
only this hint from `document.cookie` to decide whether to ask
`/api/auth/get-session`; better-auth's HttpOnly cookie remains the actual
credential. Guests therefore produce zero `/api` requests, while returning users
are recognized after a reload even with sync off.

Privacy: "Photos never leave your device. File names and categories are stored encrypted on the server; the server operator has access to them. Sync is off until you turn it on yourself."

## Self-host

The same process can be run locally with the commands above, or in a container (the Dockerfile copies the ready `dist/` and `server/`):

```bash
bun run build
docker build -t photo-sorter-ai .
docker run -p 3001:3001 \
  -e SYNC_MASTER_KEY=<key> \
  -e BETTER_AUTH_SECRET=<secret> \
  -e BETTER_AUTH_URL=http://localhost:3001 \
  -e SYNC_DB_PATH=/app/data/sync.db \
  -v "$PWD/data:/app/data" \
  photo-sorter-ai
```

A backup is the `SYNC_DB_PATH` file plus a safely stored `SYNC_MASTER_KEY`; without the key the backup cannot be decrypted. Static files can also be served separately without the server — sync is then simply unavailable.

## Cloud

Use the same image/process: one Bun server serves the static files and `/api`, with a TLS proxy in front (Caddy, Nginx, Cloudflare Tunnel). Set `BETTER_AUTH_URL` to the public `https` address, put SQLite on a persistent volume, and configure backups together with the keys.
