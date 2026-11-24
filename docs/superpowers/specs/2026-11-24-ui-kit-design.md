# Design: UI kit on bits-ui and tokens

Date: 2026-11-24
Status: draft awaiting approval

## Why

A NuxtUI-like layer on top of bits-ui headless primitives, but built entirely on the existing OKLCH design system in `src/app.css`. This prepares the migration of `App.svelte`: components currently use ad-hoc classes, and the kit will provide consistent variants and states.

## Goals

- Components in `src/lib/ui/*` with variants (`variant`, `size`, `tone`) and consistent focus/hover/disabled states using semantic tokens.
- The foundation is bits-ui (`Button`, `Switch`, `Tabs`, `Dialog`, `Separator`) for accessibility and keyboard support; native `input/textarea` elements are wrapped with the same tokens.
- `tailwind-variants` (already a dependency) for variants without manual concatenation.
- `tv()` recipes and their types live next to the component in its `<script module lang="ts">` (not in a shared `variants.ts`).
- Components are imported directly from their `.svelte` files; there is no `index.ts` barrel, at the user's request. Examples are in `docs/ui-kit.md`.
- No raw colors or hex values; only `text-ink`, `bg-panel`, `border-line`, `bg-accent`, `text-on-accent`, `bg-danger-soft`, `text-danger`, `ring-focus`.

## Non-goals

- Migrating current screens to the kit (a separate stage after the kit is approved).
- A new theme or palette.
- Replacing Svelte 5 runes or oxfmt/oxlint.

## Composition (first release)

| Component      | bits-ui base                                                            | Variants                                                                 |
| -------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `Button.svelte` | `Button.Root`                                                           | solid / soft / ghost / outline, sm/md/lg, tone accent/danger, disabled, loading (aria-busy) |
| `Switch.svelte` | `Switch.Root`                                                           | checked (bindable), disabled, label, description                          |
| `Tabs.svelte`   | `Tabs.Root/List/Trigger/Content`                                        | tab list via `$props()`                                                   |
| `Dialog.svelte` | `Dialog.Root/Trigger/Portal/Overlay/Content/Title/Description/Close`     | title/description snippets, size sm/md/lg                                 |
| `TextField.svelte` | native `input`                                                       | label, hint, error, disabled, type                                        |
| `Textarea.svelte` | native `textarea`                                                     | label, hint, error, rows                                                  |
| `Card.svelte`   | `<section>`                                                             | padding none/sm/md, bordered                                              |
| `Badge.svelte`  | `<span>`                                                                | tone neutral/accent/danger, size                                          |
| `Alert.svelte`  | `<div role=alert\|status>`                                              | tone danger/accent/info                                                   |

## Approach

1. Each component is a separate `.svelte` file with `$props()`, `tv()` from tailwind-variants for classes, and English default strings only if needed.
2. `src/lib/ui/index.ts` exports the components and variant types.
3. `docs/ui-kit.md` — a short table plus usage examples in English.
4. Checks: `svelte-autofixer` on all `.svelte` files, `bun run validate`, and a browser smoke test with a demo render (without the app) — either via a temporary page or a build check.

## Left to the builder

- Exact `$props()` signatures and variant names.
- Browser smoke coverage and the final commit.
