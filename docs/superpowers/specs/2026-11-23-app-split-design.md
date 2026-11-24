# Design: split App.svelte into an orchestrator and components

Date: 2026-11-23
Status: approach 3 chosen (approved by the user)

## Why

`src/App.svelte` has grown to ~600 lines: classification, ZIP handling, model loading,
sync, local history, and markup are all mixed together. This hinders maintenance and the
future bits-ui UI kit.

## Goals

- `App.svelte` becomes thin: state comes from the orchestrator, markup from components.
- All photo and ZIP business logic lives in a testable pure module, with no Svelte runtime.
- Behavior, the ZIP contract, and zero `/api` traffic when sync is off are unchanged.
- Lay the groundwork for the UI kit: components become small wrappers with `$props()`.

## Non-goals

- The bits-ui UI kit and migration to it (a separate stage after this split).
- Changing the ARCHIVE/report contract, engine/worker, or sync protocol.
- Merely moving `AccountPanel`/`HistoryPanel` — they are already separate.

## Approach

1. **Orchestrator `src/lib/sorter/controller.ts`**, modeled on `sync/controller.ts`:
   - dependencies are injected: `createEngine`, `sortArchive`, `URL.createObjectURL/revokeObjectURL`, `now`, `uuid`;
   - state (`items`, `pending`, `failure`, `progress`, `archiveProgress`, `archiveResult`, flags)
     lives inside and is exposed as a snapshot via `onSnapshot`;
   - methods: `classifyFiles(files, labels)`, `sortArchiveFile(file, labels)`, `dispose()`;
   - tested with a fake engine/sortArchive, including cleanup of object URLs and the label snapshot.
2. **Presentational components** in `src/lib/components/`:
   - `CategoriesField.svelte` — categories textarea;
   - `SourcePicker.svelte` — both file inputs;
   - `ProgressPanel.svelte` — progressbar (model/archive);
   - `ArchiveResultCard.svelte` — result and report;
   - `PhotoList.svelte` — photo list and score chips.
   All use `$props()`, English strings, tokens from `app.css`, and keyed `{#each}`.
3. **`App.svelte`** — snapshot state and wiring only: the auth/sync part stays as is, but rendering
   is delegated to components; target ~100–150 lines.

## Left to the builder

- Exact props interfaces of the components, snapshot order, and tests.
- Browser check: photo upload, ZIP run, both themes, no `/api` requests when sync is off.
