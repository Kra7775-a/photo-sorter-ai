# AI Photo Sorter

A browser-based photo sorter that groups photos by category. The model runs locally: images never leave your device. The server is optional — it is only needed for accounts and for syncing metadata between devices.

## Stack

- Svelte 5 (runes) + TypeScript + Vite
- Tailwind CSS v4
- [Transformers.js](https://github.com/huggingface/transformers.js) + ONNX Runtime Web (WASM)
- MobileCLIP-B `Xenova/mobileclip_b`, int8 (~145 MB)
- Web Worker for inference
- ZIP without a server: `@zip.js/zip.js` reads the archive, `client-zip` builds the new one
- PWA (vite-plugin-pwa): offline shell, installable on a device
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
bun run test:mutation  # mutation tests (Stryker + Bun, ~6 min)
```

`dev:all` needs the same env variables as the server (`SYNC_MASTER_KEY`,
`BETTER_AUTH_SECRET`); without them the server exits immediately. `BETTER_AUTH_URL`
defaults to `http://localhost:3000` so better-auth cookies work through the Vite proxy.

Full check before committing:

```bash
bun run validate   # format:check + lint + typecheck + check + test + build
```

Bun only counts coverage for modules imported by tests. `worker.ts`, Svelte components
and entry points are excluded in `bunfig.toml`; the percentages in the report refer to
modules that have tests.

Mutation tests are run with `bun run test:mutation`. Stryker uses the unofficial
`stryker-mutator-bun-runner`; a local patch in `patches/` adapts it to Bun 1.4 (which no
longer prints per-line results in non-TTY mode and no longer understands the old output
format). The report is at `reports/mutation/mutation.html`; the `break` threshold in
`stryker.conf.json` is 60%.

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
- only the file name is used; the original directories inside the archive are not preserved;
- duplicate names get a ` (2)`, ` (3)` suffix;
- `report.csv` at the root contains the source, category, confidence and status
  (`sorted` / `skipped` / `error`);
- non-images and files that fail to decode are not copied, but are listed in the report;
- HEIC/TIFF are skipped: the browser cannot decode them.

### Why English labels

MobileCLIP's text encoder is English-only. Russian words produce almost random results
(a photo of a cat ends up under "nature" instead of "animals"). The `a photo of ` template
noticeably improves short labels like `cat`.

## Structure

```
src/
  App.svelte              thin layer: auth/sync + component composition
  app.css                 Tailwind and semantic OKLCH tokens
  main.ts                 entry point
- `lib/ui/`                UI kit on bits-ui + OKLCH tokens (see `docs/ui-kit.md`)
  lib/sorter/
    controller.ts         photo/ZIP orchestrator with injected dependencies + tests
  lib/components/
    AccountPanel.svelte   sign in/sign up, sync opt-in
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
