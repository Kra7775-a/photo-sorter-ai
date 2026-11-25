# Pages, Layout and Auth Separation Design

Date: 2026-11-24
Status: approved; amended for SvelteKit on the same date

## Amendment: SvelteKit instead of a custom router

The first version of this design used a hand-written History API router. The user rejected that as an unnecessary bicycle and chose the official SvelteKit router. SvelteKit 3.4.0 peer dependencies already match the project (`vite ^8.0.12`, `svelte ^5.57.1`, `typescript ^6.0.0`, `@sveltejs/vite-plugin-svelte ^7.0.0`), so no app version changes are needed. SvelteKit runs in **SPA mode** (`ssr = false`, `adapter-static` with fallback `index.html`); file-based routes replace the custom router. Clean URLs (`/app`) and the existing Bun static fallback stay.

## Intent

The sorter works and is manually tested. The next step is to make the product developable: a public face that explains it, a dedicated sign-in screen, real navigation, and an application shell that keeps the current guest-first behavior. The user picked separate zones and, after comparing mockups, chose a **top navigation bar** over a sidebar. All three content pages were selected.

## Goals

- Public pages `/`, `/help`, `/privacy`, `/about`; dedicated `/sign-in`; sorter at `/app`.
- One shared top-navigation pattern for public and app surfaces.
- Guests can sort exactly as today; accounts are only for metadata sync.
- Use SvelteKit's file-based router and layouts instead of custom routing code.
- Preserve architecture rules, the quality gate, PWA and offline behavior.

## Non-goals

- No SSR, server routes, SvelteKit actions, or moving the Bun API into SvelteKit.
- No auth enforcement or redirect of guests away from `/app`.
- No changes to the model, ZIP contract, sync encryption, or API.
- No new colors, external marketing images, or translated English UI/categories.

## Anti-goals

- Breaking direct links to `/app` on dev, Bun static server or Cloudflare Pages.
- Duplicating the privacy statement so it drifts.
- Reimplementing routing, navigation state or layout preservation by hand.

## Constraints

- Bun only; exact dependency versions; no app version downgrades.
- Svelte 5 runes only; Tailwind v4 semantic tokens from `src/app.css`.
- Code/identifiers/comments English; UI strings English.
- `App.svelte` and `src/main.ts` are replaced by SvelteKit's `src/routes` + `src/app.html`.
- One `AppController` instance for the whole SPA lifetime; `start()`/`stop()` run once.
- Guests make zero `/api` requests on `/` and `/app` unless the server-set readable session hint cookie (`photo-sorter-session=1`) exists.
- Static output stays in `dist/` (Bun server, Dockerfile and Cloudflare rely on it).
- No `.env`, tokens or secrets; no commits without explicit approval.
- `bun run validate`, `bun run quality` and `bun run test:e2e` must pass.

## Approaches

1. **SvelteKit SPA (chosen)**: official file-based router and layouts, clean URLs, no custom routing. Costs a one-time migration of build config, PWA plugin, app entry and E2E.
2. **svelte-spa-router 5.1.1**: ready-made Svelte 5 router, minimal integration, but hash URLs (`/#/app`). Rejected because the user picked SvelteKit and clean URLs.
3. **Custom History API router**: rejected by the user as a bicycle; remove the already written prototype.
4. **One screen with dialogs**: rejected earlier — weak navigation and URLs.

## Decisions and layout

### SvelteKit SPA structure

- Dependencies: add exact `@sveltejs/kit@3.4.0`, `@sveltejs/adapter-static@4.0.1`, `@vite-pwa/sveltekit@2.0.4`; remove `vite-plugin-pwa` (replaced). Keep all existing versions.
- SvelteKit config lives in `vite.config.ts` inside `withPwa()`: keep `vitePreprocess()` and `compilerOptions.runes = true`; add `adapter: adapter({ pages: "dist", assets: "dist", fallback: "index.html" })`. No prerendered pages, so `index.html` fallback has no conflict.
- `src/app.html` replaces root `index.html`; `src/main.ts` is deleted. SvelteKit mounts the app through route files.
- `src/routes/+layout.ts`: `export const ssr = false;` (and `prerender = false`) so every route is client-rendered through the fallback.
- `src/routes/+layout.svelte`: imports `app.css` and `virtual:pwa-register`, creates the single `AppController`, holds `view` in `$state.raw`, provides it through `src/lib/app/context.ts`, runs `start()`/`stop()` once, and renders `children`.
- Route files are thin wrappers that render pages from `src/lib/pages/`: `/` → `LandingPage`, `/sign-in` → `SignInPage`, `/app` → `AppPage`, plus `/help`, `/privacy`, `/about`, and `+error.svelte` → `NotFoundPage`.
- Navigation uses normal `<a href>` and `goto()` from `$app/navigation`; no custom navigate/subscribe API.
- Cloudflare `public/_redirects` stays `/* /index.html 200`; Bun's `server/index.ts` already serves `dist/index.html` for non-API paths.

### PWA and worker

- `vite.config.ts` uses `sveltekit()` and `SvelteKitPWA()` with `registerType: "autoUpdate"`, `injectRegister: null`, the existing manifest, `maximumFileSizeToCacheInBytes: 25MB`, precache globs for `client/**/*`, and the existing `.wasm` CacheFirst runtime rule.
- `src/app.d.ts` references `virtual:pwa-register` types so the explicit import typechecks.
- The worker stays `new Worker(new URL("./worker.ts", import.meta.url), { type: "module" })`; Vite/SvelteKit handles it. A build must emit it under `dist/` and the model must still load in the browser.

### Controller lifecycle and auth state

- A single `AppController` lives in the root `+layout.svelte` for every route. The Worker, loaded model, IndexedDB history and sorter state survive navigation away from `/app`. Pages read `{ app, view }` via context.
- `start()` is unchanged: `getSession()` only when sync is on and the readable hint cookie is present.
- `checkSession(): Promise<void>` calls `getSession()` only when the hint is present and reuses one cached lookup per controller lifetime; it is reset on unauthorized, sign-out and account deletion. No-op for guests and after `stop()`.
- The server sets `photo-sorter-session=1` after successful sign-in/sign-up and clears it on sign-out/account deletion. better-auth's real session cookie is HttpOnly, so `document.cookie` cannot see it; the hint is only a gate for the lookup, never proof of authentication.
- `signIn()`/`signUp()` resolve without a success flag and put failures into `account.error`. `SignInPage` navigates to `/app` only when `account.email !== null && account.error === null`; the same rule covers both actions.

### Page and component structure

- `src/lib/pages/`: `LandingPage.svelte`, `SignInPage.svelte`, `AppPage.svelte`, `HelpPage.svelte`, `PrivacyPage.svelte`, `AboutPage.svelte`, `NotFoundPage.svelte`.
- `src/lib/components/SiteHeader.svelte`: logo; How it works (`/#how`), Privacy, Help, Sign in, Try free (`/app`).
- `src/lib/components/AppHeader.svelte`: logo, Sorter, History (`/app#history`, scroll after navigation), Help, account chip. Guest chip links to `/sign-in`; signed-in chip opens the existing `Dialog.svelte` with `AccountPanel`.
- `src/lib/components/AuthForm.svelte`: sign-in/sign-up form extracted from `AccountPanel` (already implemented). `AccountPanel` keeps signed-in controls and imports `PRIVACY_STATEMENT` from `src/lib/app/copy.ts` instead of its own copy.
- Dependency-cruiser: replace the `app-view-scope` rule with `routes-scope` for `src/routes/**`, allow `$app/*` and the app context/controller/copy, pages and UI kit; keep domain slices closed.

### Public pages copy (English)

- Landing: hero "Photos stay on your device", CTA "Try without account" → `/app`, secondary "Sign in" → `/sign-in`; three feature cards; "How it works" steps; privacy summary linking `/privacy`.
- `/help`: English-only categories, prompt `a photo of <label>`, ZIP contract (` (2)` dedup, `report.csv` with BOM/CRLF, skipped HEIC/TIFF), first-run ~145 MB download, offline behavior.
- `/privacy`: the single shared `PRIVACY_STATEMENT` from `copy.ts`.
- `/about`: project, stack and model limitations.
- NotFound: short message and link to `/`.

### Visual direction

Reuse semantic tokens and `Icon.svelte`; public pages use a centered reading column and a three-card feature row; the app keeps `max-w-3xl` with the header as the only new chrome. No new colors or raw hex.

## Testing strategy

- Keep controller tests (zero API for guests, `checkSession`, deduped session read) and `AuthForm` component tests.
- Unit-test only pure new logic; SvelteKit routing itself is framework code and is covered by E2E.
- E2E: existing flows start on `/app`; add landing CTA → `/app`, guest link from `/sign-in`, deep link `/app`, all content pages reachable, session redirect, failed sign-in, state survival across navigation.
- Regenerate visual baselines; verify PWA registration and a production `bun run build` output in `dist/`.

## Builder latitude

- Exact Tailwind class compositions and section spacing.
- Wording expansion of the content pages within the copy above.
- Whether the account chip uses a dialog or dropdown, provided it reuses `Dialog.svelte`.

## Deferred

- `/account` page, route params, SSR, localization, marketing assets.
