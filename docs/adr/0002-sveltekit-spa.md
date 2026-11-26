# SvelteKit SPA with a root composition layout

We use SvelteKit 3 in SPA mode for routing and layouts: `ssr = false` in `src/routes/+layout.ts`, `@sveltejs/adapter-static` with `fallback: "index.html"` writing to `dist/`, and `public/_redirects` plus Bun's HTML fallback for deep links. `src/routes/+layout.svelte` is the composition root: it owns the single `AppController`, keeps `view` in `$state.raw`, provides both through `src/lib/app/context.ts`, registers the service worker, and renders `children`. Thin route files render page components from `src/lib/pages/`; feature UI stays in `src/lib/components/` and the leaf UI kit in `src/lib/ui/`.

Status: accepted (2026-11-25).

The user explicitly rejected a hand-written History API router as an unnecessary bicycle. SvelteKit 3.4.0 peer dependencies already matched the project (Vite 8, Svelte 5.59, TypeScript 6, `@sveltejs/vite-plugin-svelte` 7), so no application version had to change. SvelteKit config lives in `vite.config.ts` inside `withPwa()` because Kit 3 no longer supports `svelte.config.js`. The Vite commands run under Node through `bun vite` because Bun 1.4.4 cannot import `node:module.findPackageJSON`, which `@vite-pwa/sveltekit` needs; Bun remains the package manager and test runtime.

## Considered options

- **Custom History API router** — rejected by the user; removed after a brief prototype.
- **svelte-spa-router 5.1.1** — ready-made and Svelte 5 compatible, but hash URLs (`/#/app`) instead of clean deep links; rejected in favour of SvelteKit.
- **SvelteKit with SSR/server routes** — rejected: the app is local-first, the Bun Elysia server owns `/api`, and photos must never be uploaded or rendered server-side.
- **One screen with dialogs** — rejected earlier: weak navigation and no real URLs.

## Consequences

- Routes are client-rendered: `/` landing, `/sign-in` auth, `/app` sorter, `/help`, `/privacy`, `/about`, plus `+error.svelte`.
- Guests can deep-link any route without an auth redirect and with zero `/api` requests.
- better-auth's session cookie is HttpOnly, so the server also sets a readable `photo-sorter-session=1` hint cookie. The client gates its single session lookup on that hint; sign-out and account deletion clear it.
- The PWA uses `@vite-pwa/sveltekit` `withPwa()` with `injectRegister: null` and an explicit `registerSW()` in the root layout. The 26.9 MB ORT `.wasm` stays out of precache and is cached at runtime.
- `dist/` remains the static deploy target; the Bun server and Cloudflare `_redirects` must keep the HTML fallback.
- Dependency-cruiser rules `pages-scope` and `routes-scope` replace the old `app-view-scope`; domain slices remain closed.
- `bun run validate` and `bun run test:e2e` verify routes, guest mode, session redirect and state survival across navigation.
