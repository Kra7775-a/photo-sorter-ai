import { svelte } from "@sveltejs/vite-plugin-svelte";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";
// import { paraglideVitePlugin } from '@inlang/paraglide-js';

export default defineConfig({
  plugins: [
    tailwindcss(),
    svelte(),
    // paraglideVitePlugin({
    //   outdir: './src/lib/paraglide',
    //   project: './project.inlang',
    //   strategy: ['localStorage', 'preferredLanguage', 'baseLocale'],
    // }),
    VitePWA({
      registerType: "autoUpdate",
      manifest: {
        name: "AI Photo Sorter",
        short_name: "PhotoAI",
        description: "Local browser-based AI photo organizer",
        theme_color: "#171717",
        background_color: "#171717",
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
        globPatterns: ["**/*.{js,css,html,ico,png,svg,wasm}"],
        maximumFileSizeToCacheInBytes: 25 * 1024 * 1024,
      },
    }),
  ],
  worker: {
    format: "es",
  },
  resolve: {
    tsconfigPaths: true,
  },
  server: {
    open: false,
    port: 3000,
    strictPort: true,
  },
});
