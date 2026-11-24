# Icon set design

Date: 2026-11-24
Status: awaiting approval

## Intent

`knip` removed `phosphor-svelte` (unused) and `happy-dom` (duplicate of a transitive dependency)
while setting up the quality tooling. Restore both, but make them genuinely used so the quality gate
stays honest: real icons in the UI, and an explicit pinned DOM engine in component tests.

## Goals

- Restore `phosphor-svelte@3.1.1` and `happy-dom@21.0.4` at their original exact versions.
- Give the UI a small, consistent icon vocabulary instead of scattered raw icon imports.
- Keep `bun run quality` and `bun run validate` green; no new knip ignores for these two packages.

## Non-goals

- No icons in every panel; only the key actions listed below.
- No new colors (icons inherit semantic `text-*` colors via `currentColor`).
- No changes to other dependency versions, application behavior, or the pending Stryker/tooling diff.
- No commits.

## Constraints

- Bun only, exact versions; `phosphor-svelte` in `dependencies`, `happy-dom` in `devDependencies`.
- Svelte 5 runes only; semantic Tailwind tokens from `src/app.css`.
- Feature components stay thin; UI kit owns presentation details.
- E2E visual baselines compare `main` with a 2% pixel tolerance, so they need regeneration.
- Icons are decorative next to existing text labels: `aria-hidden="true"`, no accessible-name changes.

## Approaches

1. **Minimum**: one icon in the header and one in the download button. Least churn, but no shared
   vocabulary and later icons would be added ad hoc.
2. **UI kit + key actions (chosen)**: a single `Icon.svelte` maps semantic names to Phosphor glyphs;
   use it in the header, `SourcePicker`, `ArchiveResultCard` and `AccountPanel`. One place controls
   size/weight/color, and the dependency is clearly used. Slightly more files, but easy to extend.
3. **Everywhere**: icons across all panels and alerts. Highest visual impact, largest diff and most
   snapshot churn for little extra clarity.

## Design

- `src/lib/ui/Icon.svelte`: typed `name` union (`brand`, `photos`, `archive`, `download`, `signOut`)
  mapping to Phosphor components (`ApertureIcon`, `ImagesIcon`, `FileZipIcon`, `DownloadSimpleIcon`,
  `SignOutIcon`);
  props for `size` (default 18) and optional `class`; `aria-hidden="true"` and `focusable="false"`;
  inherits `currentColor`.
- Placement: header title (`brand`), the two file-picker labels (`photos`, `archive`), the archive
  download button (`download`), the Sign out button (`signOut`). Text labels stay unchanged.
- `src/lib/ui/component-test.ts`: import `IOptionalBrowserSettings` from `happy-dom`, type a small
  settings object and pass it to `GlobalRegistrator.register({ url, settings })` with a stable test
  URL (happy-dom 21 rejects `url` inside `settings`). This makes the direct dependency real and
  documents why it is pinned.
- Update E2E screenshots with `bun run test:e2e --update-snapshots`, then rerun `bun run quality`
  and `bun run validate`.
- If a placement turns out to hide or duplicate existing text semantics, drop that placement rather
  than adding `aria-label` noise.
