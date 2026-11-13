import { svelte } from "@sveltejs/vite-plugin-svelte";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    tailwindcss(),
    svelte(),
    VitePWA({
      registerType: "autoUpdate",
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
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg}"],
        maximumFileSizeToCacheInBytes: 25 * 1024 * 1024,
        runtimeCaching: [
          {
            // 26.9 MB ORT runtime: too big to precache, cache it on first use instead.
            urlPattern: /\.wasm$/,
            handler: "CacheFirst",
            options: { cacheName: "ort-wasm" },
          },
        ],
      },
    }),
  ],
  worker: {
    format: "es",
  },
  server: {
    open: false,
    port: 3000,
    strictPort: true,
  },
});
