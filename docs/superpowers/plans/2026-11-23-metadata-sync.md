# Metadata Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Accounts and opt-in sync of sorting metadata (not photos) between devices, with encryption at rest, in the cloud and self-hosted.

**Architecture:** A Bun server (`server/`, Elysia + better-auth + `bun:sqlite`) serves the static files and `/api`; each run report is stored as a single AES-256-GCM blob (envelope: master key from env, per-user data key). The client stays offline-first: IndexedDB + outbox, with sync only after explicit opt-in and sign-in.

**Tech Stack:** Bun, Elysia, better-auth (`database: new Database()` from `bun:sqlite`), `node:crypto` (aes-256-gcm), Svelte 5 runes, Tailwind v4 tokens, `bun:test`.

**Spec:** `docs/superpowers/specs/2026-11-23-metadata-sync-design.md`

## Global Constraints

- Bun only; `bunfig.toml` has `exact = true` — exact versions, not ranges.
- `bun run validate` (format:check → lint → typecheck → check → test → build) is the gate before every task is considered done.
- Svelte 5 runes only; colors are semantic tokens from `src/app.css`; oxfmt/oxlint, not Prettier/ESLint.
- `@huggingface/transformers` is imported only in `src/lib/model/worker.ts`; the ZIP contract and streaming are unchanged.
- `src/` does not import `server/` and vice versa; the server must not end up in the browser bundle.
- Code/identifiers/comments and UI strings are English.
- 90% lines/functions coverage on modules imported by tests; new pure modules (`server/crypto.ts`, `server/db.ts`, `src/lib/sync/merge.ts`, `src/lib/sync/client.ts`) need tests.
- Photos are never sent to the server; with sync off the client makes no requests to `/api`.
- Secrets come only from env (`SYNC_MASTER_KEY`, `BETTER_AUTH_SECRET`); they are never committed.

## Review Focus

1. **Another user's run id:** user B requests run A → 404 with no data (test in Task 4).
2. **Tampered ciphertext:** modified ct/nonce/aad → `open` throws instead of returning garbage (Task 2).
3. **Resend after offline:** one `clientRunId` → one row on the server, idempotent response (Task 4, Task 7).
4. **Sync off / no session:** no fetch to `/api` (Task 9, browser + spy test).
5. **No `SYNC_MASTER_KEY` at startup:** the server fails with a clear error instead of running with plaintext data (Task 1).

---

### Task 1: Server skeleton, config and migrations

> Note: the skeleton already landed on Hono (commit 32bb8d5). Per the user's decision the server
> is moving to **Elysia**; the swap is the first step of Task 3 (a separate commit
> `refactor: swap hono for elysia`), while the config, migrations, and tables from this task do not change.

**Files:**
- Create: `server/config.ts`, `server/db.ts`, `server/index.ts`, `server/db.test.ts`
- Modify: `package.json` (deps `hono`, `better-auth`; scripts `dev:server`, `start`, `keygen`)

**Interfaces:**
- Produces: `loadConfig(env: Record<string, string | undefined>): Config` where `Config = { masterKey: Uint8Array; authSecret: string; dbPath: string; port: number; baseUrl: string }`; throws `Error` without `SYNC_MASTER_KEY`/`BETTER_AUTH_SECRET`.
- Produces: `openDb(path: string): Database` (from `bun:sqlite`), `migrate(db: Database): void` — idempotent, version in `PRAGMA user_version`.
- Produces: `createApp(deps: { db: Database; config: Config }): Hono` — for now only `GET /api/health`.
- App tables: `user_keys(user_id TEXT PRIMARY KEY, wrapped_key TEXT NOT NULL, key_version INTEGER NOT NULL)`, `sort_runs(id TEXT PRIMARY KEY, user_id TEXT NOT NULL, client_run_id TEXT NOT NULL, source_name TEXT NOT NULL, created_at INTEGER NOT NULL, counts_json TEXT NOT NULL, payload TEXT NOT NULL, scheme TEXT NOT NULL, key_version INTEGER NOT NULL, UNIQUE(user_id, client_run_id))`, `settings(user_id TEXT PRIMARY KEY, payload TEXT NOT NULL, scheme TEXT NOT NULL, key_version INTEGER NOT NULL, updated_at INTEGER NOT NULL)`. better-auth creates its own tables in Task 3.

- [ ] **Step 1: failing test** `server/db.test.ts`: `migrate` on `:memory:` creates the three app tables; a second `migrate` does not throw or duplicate; `loadConfig({})` throws with `SYNC_MASTER_KEY` in the message; valid env (32-byte base64 key) yields `masterKey.length === 32`.
- [ ] **Step 2:** `bun test server/db.test.ts` → FAIL (modules are missing).
- [ ] **Step 3:** implement `config.ts` (base64 decode, length check of 32), `db.ts` (list of SQL migrations, `user_version`), `index.ts` (`createApp` + health).
- [ ] **Step 4:** `bun test server/db.test.ts` → PASS; `bun run validate` → green.
- [ ] **Step 5:** commit `feat: server skeleton with config and sqlite migrations`.

### Task 2: Envelope encryption

**Files:**
- Create: `server/crypto.ts`, `server/crypto.test.ts`

**Interfaces:**
- Consumes: nothing from previous tasks.
- Produces: `type SealedBlob = { scheme: "server-v1"; keyVersion: number; nonce: string; ct: string }` (base64);
  `generateDataKey(): Uint8Array` (32 bytes);
  `wrapKey(master: Uint8Array, key: Uint8Array): SealedBlob`; `unwrapKey(master: Uint8Array, blob: SealedBlob): Uint8Array`;
  `seal(key: Uint8Array, plaintext: Uint8Array, aad: string): SealedBlob`;
  `open(key: Uint8Array, blob: SealedBlob, aad: string): Uint8Array` — throws on a wrong key, aad, nonce, or ct.
- Implementation: `node:crypto` `createCipheriv("aes-256-gcm", key, nonce)` + `getAuthTag`, 12 random nonce bytes; the tag is appended to the ct.

- [ ] **Step 1: failing test**: `seal`/`open` round-trip returns the original bytes; `open` throws on (a) modified ct, (b) modified nonce, (c) different aad, (d) different key; `wrapKey`/`unwrapKey` round-trip; two `seal` calls on the same plaintext produce different nonces.
- [ ] **Step 2:** `bun test server/crypto.test.ts` → FAIL.
- [ ] **Step 3:** implement the signatures above.
- [ ] **Step 4:** `bun test server/crypto.test.ts` → PASS; `bun run validate`.
- [ ] **Step 5:** commit `feat: envelope encryption for metadata blobs`.

### Task 3: Accounts (better-auth) + move to Elysia

**Files:**
- Create: `server/auth.ts`, `server/auth.test.ts`
- Modify: `server/index.ts` (swap Hono → Elysia, mount `/api/auth/*`), `package.json`

**Interfaces:**
- Consumes: `Config`, `Database` from Task 1.
- Produces: `createApp(deps): Elysia` (replaces the Hono version from Task 1); `createAuth(db: Database, config: Config)` — `betterAuth({ database: db, secret: config.authSecret, baseURL: config.baseUrl, emailAndPassword: { enabled: true }, emailVerification: { enabled: false } })`; mounted with a catch-all route `.all("/api/auth/*", ({ request }) => auth.handler(request))` (the full URL is preserved, better-auth basePath = `/api/auth`); helper `getSession(req: Request): Promise<{ userId: string } | null>`.

- [ ] **Step 0 (swap):** `bun remove hono && bun add elysia`; rewrite `createApp`/health for Elysia (`new Elysia().get("/api/health", ...)`), `Bun.serve({ fetch: app.fetch })` in the main block; `bun test server/db.test.ts` + validate → green; commit `refactor: swap hono for elysia`.
- [ ] **Step 1: failing test** (`Bun.serve({ port: 0, fetch: app.fetch })`): sign-up with email+password → 200; sign-in → session cookie; `GET /api/auth/get-session` with the cookie → user's email; wrong password → 401; without cookie → null session.
- [ ] **Step 2:** `bun test server/auth.test.ts` → FAIL.
- [ ] **Step 3:** implement `auth.ts`, mount it in `createApp`.
- [ ] **Step 4:** `bun test server/auth.test.ts` → PASS; `bun run validate`.
- [ ] **Step 5:** commit `feat: email+password accounts via better-auth`.

### Task 4: Runs API

**Files:**
- Create: `server/runs.ts`, `server/runs.test.ts`
- Modify: `server/index.ts`

**Interfaces:**
- Consumes: `getSession` (Task 3), `seal/open/wrapKey/unwrapKey/generateDataKey` (Task 2), Task 1 tables.
- Produces: `registerRunRoutes(app: Elysia, deps: { db: Database; config: Config; getSession: GetSession }): void`.
  `POST /api/runs` body `{ clientRunId: string; sourceName: string; createdAt: number; counts: { sorted: number; skipped: number; errors: number }; rows: ReportRow[] }` → 201 `{ id }`; a repeat with the same `clientRunId` → 200 with the same `id`.
  `GET /api/runs?since=<ms>` → `{ runs: Array<{ id, clientRunId, sourceName, createdAt, counts }> }` (without rows).
  `GET /api/runs/:id` → `{ ...meta, rows }` (decrypted). `DELETE /api/runs/:id` → 204.
  Quotas: 1000 runs per user, 20 000 rows, 2 MB of serialized payload → 413 `{ error: "quota" }`.
  AAD = `${userId}|${runId}|server-v1`; the per-user key is created lazily in `user_keys`.

- [ ] **Step 1: failing test**: 401 without a session; user B gets 404 for A's id (list/get/delete); idempotency by `clientRunId`; 20 001 rows → 413 and the row count is unchanged; raw `SELECT payload FROM sort_runs` does not contain a file-name substring from the rows; get decrypts the rows back.
- [ ] **Step 2:** `bun test server/runs.test.ts` → FAIL.
- [ ] **Step 3:** implement `runs.ts` and mount it.
- [ ] **Step 4:** `bun test server/runs.test.ts` → PASS; `bun run validate`.
- [ ] **Step 5:** commit `feat: encrypted sort-run API with quotas and ownership`.

### Task 5: Settings API

**Files:**
- Create: `server/settings.ts`, `server/settings.test.ts`
- Modify: `server/index.ts`

**Interfaces:**
- Consumes: Task 2, Task 3.
- Produces: `registerSettingsRoutes(app, deps)`: `GET /api/settings` → `{ payload: { labels: string[]; syncEnabled?: never }, updatedAt } | null`; `PUT /api/settings` body `{ payload: { labels: string[] }, updatedAt }` → 200; an older `updatedAt` is ignored (a 200 response with the current value). Payload is encrypted with the same per-user key, AAD = `${userId}|settings|server-v1`.

- [ ] **Step 1: failing test**: put→get round-trip of labels; put with an old `updatedAt` does not change data; raw payload does not contain the label string; 401 without a session.
- [ ] **Step 2:** FAIL. **Step 3:** implementation. **Step 4:** PASS + validate.
- [ ] **Step 5:** commit `feat: encrypted user settings with last-write-wins`.

### Task 6: Static serving, keygen, deployment

**Files:**
- Create: `server/keygen.ts`, `Dockerfile`, `server/static.test.ts`
- Modify: `server/index.ts`, `package.json`, `README.md`

**Interfaces:**
- Consumes: `createApp` (Tasks 1–5).
- Produces: `bun run start` = `bun server/index.ts` (port from config, serves `dist/` with SPA fallback for non-`/api` paths); `bun run keygen` prints a base64 32-byte key; `bun run dev:server` = watch mode.

- [ ] **Step 1: failing test**: `createApp` serves `index.html` at `/` and at `/history` (SPA), `GET /api/health` → 200 json, unknown `/api/*` → 404 json.
- [ ] **Step 2:** FAIL. **Step 3:** implement static serving + keygen + Dockerfile (`oven/bun`, copy dist + server, CMD start).
- [ ] **Step 4:** PASS; manually run `bun run build && bun run start`: curl `/` and `/api/health`; validate.
- [ ] **Step 5:** README: the "Server and sync", "Self-host", and "Cloud" sections, with the privacy wording from the spec. Commit `feat: serve static app from bun server, keygen and deploy docs`.

### Task 7: Client merge logic

**Files:**
- Create: `src/lib/sync/types.ts`, `src/lib/sync/merge.ts`, `src/lib/sync/merge.test.ts`

**Interfaces:**
- Produces: `type SyncRun = { clientRunId: string; sourceName: string; createdAt: number; counts: Counts; rows: ReportRow[]; serverId?: string }`; `type SyncSettings = { labels: string[]; updatedAt: number }`;
  `mergeRuns(local: SyncRun[], remote: SyncRun[]): SyncRun[]` — dedupe by `clientRunId`, the larger `createdAt` wins a conflict, `serverId` is preserved;
  `mergeSettings(local: SyncSettings | null, remote: SyncSettings | null): SyncSettings | null` — LWW by `updatedAt`;
  `pendingUploads(runs: SyncRun[]): SyncRun[]` — only those without `serverId`.
- `ReportRow` is imported from `src/lib/archive/naming.ts`, `Counts` = `SortArchiveResult["counts"]` from `src/lib/archive/sort.ts` (do not duplicate).

- [ ] **Step 1: failing test**: dedup does not create duplicates; conflict by createdAt; `serverId` is not lost; settings LWW in both directions and with nulls; `pendingUploads` excludes already synced runs.
- [ ] **Step 2:** FAIL. **Step 3:** implementation. **Step 4:** PASS + validate.
- [ ] **Step 5:** commit `feat: pure sync merge logic with tests`.

### Task 8: IndexedDB store and API client

**Files:**
- Create: `src/lib/sync/store.ts`, `src/lib/sync/client.ts`, `src/lib/sync/client.test.ts`

**Interfaces:**
- Consumes: types from Task 7.
- Produces: `openStore(): Promise<SyncStore>` where `SyncStore = { getRuns(): Promise<SyncRun[]>; putRuns(runs: SyncRun[]): Promise<void>; getSettings(): Promise<SyncSettings | null>; putSettings(s: SyncSettings): Promise<void>; getOutbox(): Promise<string[]>; setOutbox(ids: string[]): Promise<void> }` (IndexedDB, one database `photo-sorter-sync`, migration versions).
- Produces: `createSyncClient(opts: { baseUrl: string; fetchImpl?: typeof fetch }): SyncClient` with `pushRun(run)`, `pullRuns(since)`, `deleteRun(serverId)`, `pushSettings(s)`, `pullSettings()`; 3 retry attempts with exponential backoff only on network errors/5xx; 401/413 are not retried and throw a typed error.
- `store.ts` is thin (verified in the browser, Task 9); all retry logic lives in `client.ts` and is tested.

- [ ] **Step 1: failing test** (spyOn fetch): 500 then 201 → one successful send after retry; 401 → throws without retry; 413 → throws `QuotaError` without retry; network error 3 times → throws after 3 attempts.
- [ ] **Step 2:** FAIL. **Step 3:** implement store + client. **Step 4:** PASS + validate.
- [ ] **Step 5:** commit `feat: indexeddb store and retrying sync client`.

### Task 9: UI — account, sync, history

**Files:**
- Create: `src/lib/components/AccountPanel.svelte`, `src/lib/components/HistoryPanel.svelte`
- Modify: `src/App.svelte`, `src/lib/sync/store.ts` (if indexes are needed)

**Interfaces:**
- Consumes: Tasks 7, 8; `sortArchive` result → `SyncRun` (rows from `result.report`, counts from `result.counts`, `clientRunId = crypto.randomUUID()`).
- Produces: components with `$props()`; `AccountPanel` — sign in/sign up/sign out, a sync toggle (available only with a session) with the privacy text from the spec; `HistoryPanel` — a list of runs (date, source, counters, deletion), row expansion.
- Behavior: without a session or with the toggle off — no requests to `/api`; after `sortArchive` the run is always written to the store, and to the outbox only when sync is on; the labels textarea is read from/written to settings (LWW); the sync status ("synced / queued / error") is visible.

- [ ] **Step 1:** implement the components and wiring in `App.svelte` (runes, tokens, English strings, keyed each).
- [ ] **Step 2:** `bun x @sveltejs/mcp svelte-autofixer ./src/App.svelte ./src/lib/components/AccountPanel.svelte ./src/lib/components/HistoryPanel.svelte --svelte-version <from package.json>` → 0 issues.
- [ ] **Step 3:** browser check (dev server + `bun run start`): sign up → toggle → ZIP run → page reload shows history; a second browser context with the same account sees the run; offline (devtools) → the run is queued, online → it is sent; sign out → no fetch to `/api` (network log); toggle off → no requests.
- [ ] **Step 4:** `bun run validate`.
- [ ] **Step 5:** commit `feat: account panel, opt-in sync and run history UI`.

### Task 10: API docs and final gate

**Files:**
- Create: `docs/api.md`
- Modify: `README.md` (link to api.md), `bunfig.toml` (if new modules need to be included in coverage)

**Interfaces:**
- Consumes: the actual routes from Tasks 3–6.

- [ ] **Step 1:** `docs/api.md` following the api-documentation-generator convention: route table, auth, curl examples, error codes (401/404/413), quotas, blob format, and privacy.
- [ ] **Step 2:** `bun run test:coverage` → 90% threshold passed; `bun run validate` → green.
- [ ] **Step 3:** commit `docs: api reference and coverage gate for sync modules`.
