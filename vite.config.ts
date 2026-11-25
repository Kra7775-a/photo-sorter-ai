import adapter from "@sveltejs/adapter-static";
import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";
import tailwindcss from "@tailwindcss/vite";
import { withPwa } from "@vite-pwa/sveltekit";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    tailwindcss(),
    // @vite-pwa/sveltekit 2.x bundles sveltekit() in withPwa(); SvelteKitPWA()
    // is no longer exported by this version. SvelteKit 3 takes its config here
    // because svelte.config.js is no longer supported.
    withPwa(
      {
        preprocess: vitePreprocess(),
        compilerOptions: { runes: true },
        adapter: adapter({ pages: "dist", assets: "dist", fallback: "index.html" }),
      },
      {
        registerType: "autoUpdate",
        injectRegister: null,
        manifest: {
          name: "AI Photo Sorter",
          short_name: "PhotoAI",
          description: "Local browser-based AI photo organizer",
          theme_color: "#0f0f13",
          background_color: "#0f0f13",
          display: "standalone",
          start_url: "/",
          scope: "/",
          id: "/",
          icons: [
            { src: "pwa-192x192.png", sizes: "192x192", type: "image/png" },
            { src: "pwa-512x512.png", sizes: "512x512", type: "image/png" },
            {
              src: "pwa-maskable-512x512.png",
              sizes: "512x512",
              type: "image/png",
              purpose: "maskable",
            },
          ],
        },
        maximumFileSizeToCacheInBytes: 25 * 1024 * 1024,
        kit: { spa: true, adapterFallback: "index.html" },
        generateSW: {
          // SPA fallback only: the plugin also adds a prerendered/** glob that
          // matches nothing here, so downgrade that strict-glob error.
          globStrict: false,
          globPatterns: ["client/**/*"],
          // The ORT .wasm is cached by the CacheFirst runtime rule instead.
          globIgnores: ["**/*.wasm"],
          runtimeCaching: [
            {
              // 26.9 MB ORT runtime: too big to precache, cache it on first use instead.
              urlPattern: /\.wasm$/,
              handler: "CacheFirst",
              options: { cacheName: "ort-wasm" },
            },
          ],
        },
      },
    ),
  ],
  worker: {
    format: "es",
  },
  server: {
    open: false,
    port: 3000,
    strictPort: true,
    proxy: {
      // `bun run dev:all` serves the API on 3001; keep the browser on one origin.
      "/api": "http://localhost:3001",
    },
  },
});
