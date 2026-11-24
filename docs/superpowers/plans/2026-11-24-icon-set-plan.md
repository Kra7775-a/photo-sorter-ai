# Icon Set Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore `phosphor-svelte` and `happy-dom` as genuinely used dependencies and add a small consistent icon vocabulary to key UI actions.

**Architecture:** UI-kit `Icon.svelte` maps semantic names to Phosphor glyphs; feature components import only that wrapper. Component-test setup uses an explicit typed `happy-dom` settings object so the DOM engine is a direct, pinned dependency. No commits: the user explicitly asked to leave all changes in the working tree.

**Tech Stack:** Bun, Svelte 5 runes, `phosphor-svelte@3.1.1`, `happy-dom@21.0.4`, Tailwind semantic tokens, Bun component tests, Playwright visual regression.

**Spec:** `docs/superpowers/specs/2026-11-24-icon-set-design.md`

## Global Constraints

- Bun only; exact versions. `phosphor-svelte@3.1.1` in `dependencies`, `happy-dom@21.0.4` in `devDependencies`.
- Svelte 5 runes only; no legacy `export let` or `$:`.
- Icons are decorative: `aria-hidden="true"`, no new accessible names; existing text labels stay unchanged.
- No raw colors; icons inherit `currentColor` and use existing semantic `text-*` tokens only.
- Do not change Elysia `2.0.0-rc.5`, TypeScript `6.0.3`, or any unrelated dependency.
- Do not touch the pending Stryker/tooling changes or commit anything.
- Keep `.env*`, tokens and secrets untouched.
- `bun run quality` and `bun run validate` must pass after each task.

## Review Focus

1. Decorative icons must not leak into the accessibility tree — `Icon.svelte.test.ts` asserts `aria-hidden="true"` on the rendered SVG.
2. Existing labels and callbacks must survive the JSX/Svelte edits — `bun run test` and E2E flows assert the current button/label text.
3. The restored dependencies must survive `knip` without new ignores — `bun run unused` must exit 0 with `phosphor-svelte` and `happy-dom` present.
4. Icon sizing/color must follow the UI kit — `Icon.svelte.test.ts` asserts the `class` prop is forwarded and `bun run check` validates Svelte/token usage.
5. Visual baselines must match dark/light/mobile — `bun run test:e2e` must pass after snapshot regeneration.

---

### Task 1: Restore dependencies, add Icon UI component and place icons

**Files:**
- Modify: `package.json`, `bun.lock`
- Modify: `src/lib/ui/component-test.ts`
- Create: `src/lib/ui/Icon.svelte`, `src/lib/ui/Icon.svelte.test.ts`
- Modify: `src/App.svelte`, `src/lib/components/SourcePicker.svelte`, `src/lib/components/ArchiveResultCard.svelte`, `src/lib/components/AccountPanel.svelte`

**Interfaces:**
- Consumes: existing feature props in `App.svelte`, `SourcePicker`, `ArchiveResultCard`, `AccountPanel`; `setupComponentTest()` from `src/lib/ui/component-test.ts`.
- Produces: `Icon.svelte` with props `{ name: "brand" | "photos" | "archive" | "download" | "signOut"; size?: number; class?: string }`, rendering a Phosphor SVG with `aria-hidden="true"`; typed `happy-dom` settings passed to `GlobalRegistrator.register`.

- [ ] **Step 1: Restore exact dependency versions**

```bash
bun add phosphor-svelte@3.1.1
bun add -d happy-dom@21.0.4
```

Verify `package.json` shows the exact versions from Global Constraints and no other version changed. Do not edit other dependency lines.

- [ ] **Step 2: Write the failing component test**

Create `src/lib/ui/Icon.svelte.test.ts` using the same pattern as an existing UI-kit test (read `src/lib/ui/Badge.svelte.test.ts` first). Assertions:
- rendering `<Icon name="download" />` produces an `svg` element with `aria-hidden="true"`;
- passing `class="text-ink-muted"` puts that class on the rendered SVG;
- two different `name` values (`brand`, `signOut`) render different SVG path data.

- [ ] **Step 3: Run the test to verify it fails**

Run: `bun test src/lib/ui/Icon.svelte.test.ts`
Expected: FAIL — module `Icon.svelte` does not exist.

- [ ] **Step 4: Implement `Icon.svelte`**

Create `src/lib/ui/Icon.svelte` with Svelte 5 runes. Map the five semantic names to Phosphor named exports (`ApertureIcon`, `ImagesIcon`, `FileZipIcon`, `DownloadSimpleIcon`, `SignOutIcon`), select the component with `$derived`, and forward `size`, `class`, `aria-hidden="true"` and `focusable="false"` to it. Check the installed `phosphor-svelte` icon component props before writing the component; do not add a raw color.

- [ ] **Step 5: Use direct `happy-dom` types in component-test setup**

In `src/lib/ui/component-test.ts`, import `type { IOptionalBrowserSettings } from "happy-dom"`, declare a typed settings object with a stable URL for tests, and pass it as `GlobalRegistrator.register({ url, settings })` (happy-dom 21 accepts `url` only as a top-level option, not inside `settings`). Keep the existing `afterAll` unregister behavior.

- [ ] **Step 6: Place the five icons**

Add `<Icon ... />` with no new text: header title in `src/App.svelte`; the two file-picker labels in `src/lib/components/SourcePicker.svelte`; the download button in `src/lib/components/ArchiveResultCard.svelte`; the Sign out button in `src/lib/components/AccountPanel.svelte`. Keep existing markup, labels, handlers and Tailwind classes intact.

- [ ] **Step 7: Verify**

Run: `bun test src/lib/ui/Icon.svelte.test.ts`, then `bun run quality`, then `bun run validate`.
Expected: test passes; `unused` exits 0 with both restored dependencies; quality/validate green. Do not commit.

### Task 2: Regenerate visual baselines and final verification

**Files:**
- Modify: `tests/e2e/__screenshots__/**/*.png` (regenerated), `docs/superpowers/specs/2026-11-24-icon-set-design.md` (status line only)

**Interfaces:**
- Consumes: the five placed icons from Task 1.
- Produces: up-to-date Playwright screenshots; final green quality gate.

- [ ] **Step 1: Regenerate screenshots**

Run: `bun run test:e2e --update-snapshots`
Expected: all visual snapshots updated; suite otherwise passes. If Chromium is missing, install once with `bun x playwright install chromium` and rerun.

- [ ] **Step 2: Confirm the new baseline**

Run: `bun run test:e2e`
Expected: all previously passing tests still pass, one pre-existing skip remains.

- [ ] **Step 3: Final gates**

Run: `bun run quality`, `bun run validate`, `git diff --check`.
Expected: exit 0 everywhere; show the final diff to the user. Do not commit.

## Self-Review Notes

- Spec coverage: restored deps → Task 1 Step 1; icon vocabulary and placements → Steps 2, 4, 6; direct happy-dom → Step 5; snapshots → Task 2; no commits → both tasks.
- No new knip ignores; knip is the proof that both dependencies are real.
- Component test covers the icon interface; E2E covers visual regressions; `validate` covers type and behavior regressions.
