# Design: accounts and sorting metadata sync

Date: 2026-11-23
Status: draft under review

## Why

Right now the app is a single static folder: categories and results live in the tab's memory and
disappear on reload. Two audiences need support:

- **cloud** — someone opens the site and installs nothing;
- **self-host** — someone deploys a copy on their own.

In both cases work must not be lost, and it must be visible from another device. At the same time,
the essence of the product does not change: **photos never leave the device**, inference stays
in the browser (Web Worker + MobileCLIP). Only metadata goes to the server: categories, settings,
and sorting reports (file name → category, confidence, status).

## Goals

- Accounts (sign in/sign up) and sessions.
- Persisting sorting runs and settings on the server, accessible from any device.
- Offline-first: without an account and without a network everything works as before, with data in IndexedDB.
- Sync is an explicit opt-in toggle; off by default.
- Metadata encryption at rest (envelope, option A below).
- Self-host: one process, one database file. Cloud: the same process on a host.
- Honest privacy wording in the UI.

## Non-goals

- Storing photos on the server (never).
- Server-side inference.
- Search/filtering by file names on the server.
- E2EE (option B) now — only a compatible format for a future transition.
- Sharing runs between users, collaboration.
- Mobile apps.

## Anti-goals

- Losing local mode: without a server the app must work fully.
- Plaintext file names in the database.
- Silently sending anything to the server without sync enabled.
- Restoring "lost photos" from history: history stores a report, not images.

## Constraints (from AGENTS.md and current code)

- Bun only, `exact = true` in `bunfig.toml`; don't replace exact versions with ranges.
- Svelte 5 runes; colors are semantic tokens from `src/app.css`; oxfmt/oxlint, not Prettier/ESLint.
- `@huggingface/transformers` is imported only in `worker.ts`.
- The ZIP contract and streaming are unchanged.
- `bun run validate` is a required gate; 90% lines/functions coverage on tested modules.
- Code/identifiers/comments and UI strings are English.
- No CI; new branches in `engine.ts`, `ranking.ts`, `archive/*` and new pure modules need tests.

## Approaches

### Architecture

1. **Bun server + better-auth + bun:sqlite (chosen).** `server/` next to the static files: Elysia,
   better-auth sessions, a sqlite file. Self-host — one process; cloud — the same process on
   Fly/VPS. Pros: familiar accounts, account recovery, one runtime, trivial self-host. Cons: the
   cloud is no longer pure static (host, TLS, backups); the server operator has access to metadata
   (mitigated by opt-in and honest wording, option A).
2. Cloudflare Workers + D1. Rejected: self-host would get a second, incompatible backend;
   better-auth on top of D1 is a less-traveled path.
3. No accounts, E2EE with a passphrase. Rejected as the primary option: no account recovery,
   unfamiliar UX; kept as a future option B on top of the same blob format.

### Encryption

- **A (chosen): envelope on the server.** Master key in env, random per-user data key,
  AES-256-GCM blobs. Protects against dumps/backups/disk; the operator can read.
- B: E2EE in the browser. Deferred; the blob format is tagged with a scheme, so the transition is
  a change of key ownership without data migration.
- Whole-database SQLCipher is not possible: `bun:sqlite` does not support it (oven-sh/bun#11397 is open).
  We encrypt not individual columns, but **the entire run report as one blob**: the server needs no
  queries by name, so no blind indexes are needed.

## Decided by the user

- Photos are not stored on the server; only metadata.
- Work must be continuable from another device ⇒ a server and accounts are needed.
- Architecture 1: Bun + better-auth + bun:sqlite.
- Encryption A now, with an eye on B.

## My decisions (open to challenge)

- **Elysia** (the user's choice: wants to try it; Bun-native, typed routes).
  The Task 1 skeleton landed on Hono and moves to Elysia in Task 3 in a separate commit.
- **Sign-in: email + password** at first; email verification is disabled (no SMTP dependency);
  OAuth/passkeys later. An account is an email address — the only plaintext personal data.
- **Single package**, `server/` directory, no workspaces: `dev:server`, `start`, `keygen` scripts.
- **Append-only runs** ⇒ no merge conflicts; settings use last-write-wins by
  `updatedAt`. Deleting a run is an explicit user action.
- **History = report**, not photos. The UI states outright: "file names and categories are
  stored; the photos themselves are not stored and cannot be restored from history".
- **Quotas** (my estimate, not a requirement): 1000 runs per user, 20 000 rows per
  run, 2 MB per blob; beyond that — rejection with a clear error.
- **Signing out** stops sync, local data stays local;
  switching accounts does not mix datasets (local history is shared, server history is per user).
- **Account deletion** cascades to server data.
- **Cloud**: `oven/bun` Docker image, one process serves `dist/` and `/api`; a Fly.io example.
  Self-host: the same image or `bun run start`; static files without the server are also supported
  (sync is simply unavailable).

## How it works

### Server (`server/`)

- `server/index.ts` — Elysia: `/api/auth/*` → better-auth, the rest is the sync API,
  serving `dist/` in production.
- `server/db.ts` — `bun:sqlite`, migrations as a list of versioned SQL strings.
- `server/crypto.ts` — envelope: master key `SYNC_MASTER_KEY` (32 bytes, base64, env);
  the per-user data key (random 32) is wrapped with the master key; blob = AES-256-GCM,
  random nonce, AAD = `userId|recordId|scheme`; format `{scheme, keyVersion, nonce, ct}`.
  Pure functions ⇒ unit tests (round-trip, tamper, wrong key, rotation).
- Tables: better-auth (`user`, `session`, `account`, `verification`);
  `user_keys(user_id, wrapped_key, key_version)`;
  `sort_runs(id, user_id, client_run_id, created_at, counts_json, payload, scheme, key_version)`;
  `settings(user_id, payload, scheme, key_version, updated_at)`.
  In plaintext: ids, dates, and the sorted/skipped/errors counters. Names/categories live in the blob only.
- API: `POST /api/runs`, `GET /api/runs?since=`, `GET /api/runs/:id`, `DELETE /api/runs/:id`,
  `GET/PUT /api/settings`. All behind a session; other users' ids are not visible.
- `server/keygen.ts` — master key generation for self-host.

### Client

- `src/lib/sync/store.ts` — IndexedDB: `runs`, `settings`, `outbox`; pure merge and queue logic
  moved to `src/lib/sync/merge.ts` with tests (append-only runs, LWW settings,
  retries idempotent by `client_run_id`).
- `src/lib/sync/client.ts` — fetch wrapper for the API, retries with backoff (details to the builder).
- UI in `App.svelte`/new components: account panel (sign in/sign up/sign out),
  sync toggle with privacy text, run history (report, counters,
  deletion), sync status. Strings are English, colors are tokens.
- When sync is enabled, local runs are sent once (explicit consent via the toggle's text).
  Without an account the toggle is unavailable.

### Privacy (UI strings, draft)

"Photos never leave your device. File names and categories are stored encrypted on the server; the server operator has access to them. Sync is off until you turn it on yourself."

## Left to the builder

- Exact better-auth wiring with `bun:sqlite` (adapter/dialect) and migrations for its tables.
- IndexedDB schema, indexes, outbox/backoff details.
- Layout of the account panel and history, loading/error states.
- Dockerfile, deployment example, backup instructions for self-host.
- A list of tests beyond the mandatory ones: crypto round-trip/tamper, merge logic, API quotas.
- Master key rotation: a rewrap script by `key_version` (the format already supports it).
