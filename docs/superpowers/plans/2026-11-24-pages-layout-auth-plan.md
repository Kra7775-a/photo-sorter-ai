# Pages, Layout and Auth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add public pages, dedicated sign-in and a top-navigation shell using SvelteKit's official router, keeping the sorter guest-first.

**Architecture:** SvelteKit 3 in SPA mode (`ssr = false`, `adapter-static` fallback `index.html` → `dist/`) owns routing and layouts. A single `AppController` lives in the root `+layout.svelte` and is shared with pages via Svelte context. Thin route files render page components from `src/lib/pages/`. Auth UI is split between `AuthForm` (sign-in page) and `AccountPanel` (signed-in dialog).

**Tech Stack:** SvelteKit 3.4.0, adapter-static 4.0.1, @vite-pwa/sveltekit 2.0.4, Svelte 5 runes, Tailwind v4 tokens, Bun tests, Playwright E2E, dependency-cruiser.

**Spec:** `docs/superpowers/specs/2026-11-24-pages-layout-auth-design.md`

## Global Constraints

- Bun only; exact dependency versions; no app version downgrades.
- Svelte 5 runes only; no legacy `export let` or `$:`.
- Code/identifiers/comments English; UI strings English; English categories unchanged.
- No raw colors; use semantic tokens and `Icon.svelte`.
- No `.env`, tokens or secrets; no changes to Elysia `2.0.0-rc.5` or TypeScript `6.0.3`.
- One `AppController` for the whole SPA; `start()`/`stop()` run once in root layout.
- Guests make zero `/api` requests unless the server-set readable session hint cookie (`photo-sorter-session=1`) exists; better-auth's real session cookie is HttpOnly, so the hint only gates the lookup.
- Static output stays in `dist/`; Cloudflare `_redirects` remains `/* /index.html 200`.
- No commits without explicit user approval; show diff first.
- Final gates: `bun run quality`, `bun run validate`, `bun run test:e2e`.

## Review Focus

1. Guest with no hint cookie must trigger no auth/API calls — controller tests + Task 4 zero-request E2E.
2. Returning user with sync off must be recognized on `/sign-in` — `checkSession()` test + redirect E2E.
3. Failed sign-in stays on `/sign-in` with `account.error` visible — `SignInPage` success rule + E2E.
4. Direct links to `/app` work in dev, Bun static server and Cloudflare — adapter fallback, `_redirects`, deep-link E2E.
5. Leaving `/app` keeps model/history — root layout controller + cross-route E2E.

---

### Task 1: SvelteKit SPA migration

**Files:**
- Modify: `package.json`, `bun.lock`, `vite.config.ts`, `tsconfig.app.json`, `knip.json`, `.dependency-cruiser.cjs`, `src/App.svelte` (temporary)
- Create: `src/app.html`, `src/app.d.ts`, `src/lib/app/context.ts`, `src/routes/+layout.ts`, `src/routes/+layout.svelte`, `src/routes/+page.svelte`
- Delete: `index.html`, `src/main.ts`, `src/lib/app/router.ts`, `src/lib/app/router.test.ts`

**Interfaces:**
- Consumes: current `App.svelte` controller wiring and markup; `Icon.svelte` and UI kit.
- Produces from `src/lib/app/context.ts`: `type AppContextValue = { app: AppController; view: () => AppSnapshot }`, `setAppContext(value: AppContextValue): void`, `getAppContext(): AppContextValue` (Svelte context with a module-local key).
- Route skeleton: `+layout.ts` exports `ssr = false` and `prerender = false`; `+layout.svelte` provides context and renders `children`; `+page.svelte` temporarily renders the sorter markup moved from `App.svelte`, reading `{ app, view }` from context.

- [ ] **Step 1: Install exact SvelteKit toolchain and delete the custom router**

Run: `bun add -d @sveltejs/kit@3.4.0 @sveltejs/adapter-static@4.0.1 @vite-pwa/sveltekit@2.0.4`.
Keep `vite-plugin-pwa` as a devDependency for virtual-module types. Delete `src/lib/app/router.ts` and `src/lib/app/router.test.ts`. Confirm no other dependency version changed.

- [ ] **Step 2: Configure SvelteKit adapter and PWA**

In `vite.config.ts`, keep `vitePreprocess()` and `compilerOptions.runes = true` in the SvelteKit config passed to `withPwa()`; add `adapter: adapter({ pages: "dist", assets: "dist", fallback: "index.html" })` importing from `@sveltejs/adapter-static`.
In `vite.config.ts`, replace the `svelte()` + `VitePWA()` plugins with `sveltekit()` + `SvelteKitPWA()`; keep port 3000, strictPort and the `/api` proxy. Preserve manifest fields, `registerType: "autoUpdate"`, `maximumFileSizeToCacheInBytes: 25 * 1024 * 1024`, the `.wasm` CacheFirst rule, and set `injectRegister: null` plus precache globs rooted at `client/**/*`.
Create `src/app.html` from the old `index.html` using `%sveltekit.head%` and `%sveltekit.body%`; delete root `index.html`. Create `src/app.d.ts` with `import "vite-plugin-pwa/svelte";` for `virtual:pwa-register` types. Delete `src/main.ts`.

- [ ] **Step 3: Move controller wiring into the root layout**

Create `src/lib/app/context.ts` with the exact interface above. Move the current `AppController` construction, `view` state and `onMount`/`onDestroy` lifecycle from `src/App.svelte` into `src/routes/+layout.svelte`; call `setAppContext({ app, view: () => view })` and render `children`. Keep every dependency injection line identical (auth, sync, engine, ZIP, URL helpers, store, uuid). Import `app.css` and `virtual:pwa-register` there.

Create `src/routes/+layout.ts` exporting `ssr = false` and `prerender = false`. Move the remaining `App.svelte` markup into `src/routes/+page.svelte`, replacing local `app`/`view` references with `getAppContext()`. Delete `src/App.svelte`.

- [ ] **Step 4: Update typecheck, knip and architecture rules**

Run `bun x svelte-kit sync`. Make `tsconfig.app.json` extend `./.svelte-kit/tsconfig.json` while keeping existing compilerOptions and includes. In `knip.json`, replace `src/main.ts` and `src/App.svelte` entries with `src/routes/**/*.svelte`, `src/routes/**/*.ts`, `src/app.d.ts` and `vite.config.ts`.
In `.dependency-cruiser.cjs`: replace `app-view-scope` with `routes-scope` for `^src/routes/` allowing `src/lib/(pages|components|ui|app/(context|controller|copy)[.]ts)` and `$app/*`; update `pages-scope` to drop `app/router` and allow `app/(context|controller|copy)[.]ts` and `$app/*`; keep `components-scope` with `app/copy` and `app/context` only. Do not weaken domain rules.

- [ ] **Step 5: Verify the migration skeleton**

Run: `bun run format`, `bun run check`, `bun run typecheck`, `bun run arch:check`, `bun run unused`, `bun run build`, then start `bun run dev` and confirm `/` renders the sorter with no console errors.
Check that `dist/index.html`, the worker chunk and the service worker exist. Stop the dev server afterwards to free port 3000 for E2E later.

### Task 2: Auth logic and form extraction — COMPLETE

- [x] Add `checkSession(): Promise<void>` to `AppController`; session-hint-gated, no request for guests, one cached session lookup reused by `start()` and reset on unauthorized/sign-out/delete.
- [x] Add controller tests: hint cookie → email; no hint → no call; `start()` + `checkSession()` → one `getSession()` call.
- [x] Extract `AuthForm.svelte` from `AccountPanel.svelte` with component tests for mode switch, callbacks and busy state.
- [x] Verification: `bun test src/lib/app/controller.test.ts` → 26 pass; `AuthForm.svelte.test.ts` → 3 pass; `bun run check` clean. No further work in this task.

### Task 3: Pages, headers and route wrappers

**Files:**
- Create: `src/lib/pages/{LandingPage,SignInPage,AppPage,HelpPage,PrivacyPage,AboutPage,NotFoundPage}.svelte`, `src/lib/components/{SiteHeader,AppHeader}.svelte`
- Create: `src/routes/{sign-in,app,help,privacy,about}/+page.svelte`, `src/routes/+error.svelte`
- Modify: `src/routes/+page.svelte`, `src/lib/components/AccountPanel.svelte`

**Interfaces:**
- Consumes: `getAppContext()` from Task 1; `checkSession()`, `AuthForm`, `PRIVACY_STATEMENT`, `Dialog.svelte`, `Icon.svelte`.
- Produces: `AppPage` and `SignInPage` call `getAppContext()` internally and take no props; all other pages take no props. Route files are one-line wrappers rendering the matching page.

- [ ] **Step 1: Build public pages**

Create `SiteHeader.svelte` (logo; How it works → `/#how`, Privacy, Help, Sign in, Try free → `/app`) and `LandingPage`, `HelpPage`, `PrivacyPage` (uses `PRIVACY_STATEMENT`), `AboutPage`, `NotFoundPage` with the copy from the spec. Use semantic tokens and `Icon.svelte`; no new colors. Make `src/routes/+page.svelte` render `LandingPage` and add the other route wrappers plus `+error.svelte`.

- [ ] **Step 2: Build the app header and AppPage**

Create `AppHeader.svelte`: logo, Sorter (`/app`), History (`/app#history`, scroll after navigation), Help (`/help`) and account chip. Guest chip links to `/sign-in`; signed-in chip opens `Dialog.svelte` with `AccountPanel`. Move the sorter markup from `src/routes/+page.svelte` into `src/lib/pages/AppPage.svelte`, keeping `id="history"` and all handlers/wording. `src/routes/app/+page.svelte` renders `AppPage`.

- [ ] **Step 3: Implement SignInPage**

In `SignInPage.svelte`: call `app.checkSession()` on mount; `goto("/app", { replaceState: true })` when `view.account.email !== null && view.account.error === null`; render `AuthForm` wired to `app.signIn`/`app.signUp`; navigate on success using the same rule; "Continue as guest" → `goto("/app")`; show the note that sync stays off. Keep the error visible on failure.

- [ ] **Step 4: Finish AccountPanel**

Remove the guest branch and the now-unused `onSignIn`/`onSignUp` props from `AccountPanel.svelte`; replace its local `PRIVACY_TEXT` with the shared `PRIVACY_STATEMENT`. Signed-in controls (sync, sign out, delete) stay unchanged.

- [ ] **Step 5: Verify pages**

Run: `bun run format`, `bun run check`, `bun run typecheck`, `bun run arch:check`, `bun run validate`. Expected: all green. E2E updates are in Task 4.

### Task 4: E2E, visual baselines and documentation

**Files:**
- Modify: `tests/e2e/{archive,auth-sync,photo-flow,visual}.spec.ts`, snapshots under `tests/e2e/visual.spec.ts-snapshots/`, `README.md`, `AGENTS.md`

**Interfaces:**
- Consumes: all routes, guest mode and auth behavior from Tasks 1–3.
- Produces: green `bun run test:e2e` and updated developer docs.

- [ ] **Step 1: Retarget and extend E2E**

Change existing app flows from `/` to `/app`. Keep the zero-`/api`-request assertion. Add assertions for: landing "Try without account" → `/app`; `/sign-in` "Continue as guest" → `/app`; deep link `/app`; `/help`, `/privacy`, `/about` reachable and showing headings; existing session on `/sign-in` redirects to `/app`; failed sign-in stays with visible error; signing in from `/app`, visiting `/help` and returning keeps the recorded run visible.

- [ ] **Step 2: Regenerate visual baselines**

Run `bun run test:e2e --update-snapshots`, then `bun run test:e2e` without the flag. Expected: baselines updated; previously passing tests pass with one pre-existing skip.

- [ ] **Step 3: Update documentation**

Document in `README.md`: SvelteKit SPA architecture, route map, guest mode, sign-in redirect, `dist/` output and `_redirects` requirement. Update `AGENTS.md` commands/architecture accordingly, preserving existing rules.

- [ ] **Step 4: Final gates**

Run: `bun run quality`, `bun run validate`, `bun run test:e2e`, `bun run build`, `git diff --check`. Expected: exit 0 everywhere. Show the diff to the user; do not commit until explicitly asked.

## Self-Review Notes

- Spec coverage: SvelteKit migration → Task 1; auth logic → Task 2 (done); pages/headers → Task 3; deep links/PWA → Tasks 1 and 4; docs/tests → Task 4.
- All five Review Focus items have an owning test step.
- No custom router remains; SvelteKit is the only routing layer.
- No commits are built into the tasks.
