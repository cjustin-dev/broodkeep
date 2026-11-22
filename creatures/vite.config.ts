// Build settings for Vite. Vitest (the test runner) reads this same file.
//
// vite-plugin-pwa makes the installable app (Phase 7): the manifest (pwa-manifest.ts) and a service worker that keeps the game's own
// files, so it starts with no connection. Decisions and limits: docs/decisions.md and docs/known-issues.md, "Installable app".
import { VitePWA } from "vite-plugin-pwa";
import { defineConfig } from "vitest/config";
import { manifest } from "./pwa-manifest.ts"; // with the extension: Vite's config loader (Node itself) needs it

export default defineConfig({
  plugins: [
    VitePWA({
      // "prompt": a new version waits until the player taps "Update now" in Settings (src/ui/App.tsx). "autoUpdate" would reload the
      // page in the middle of play.
      registerType: "prompt",
      // The game registers the worker from its own bundle. The default "inline" would put a script in index.html, which the security
      // policy in public/_headers does not allow.
      injectRegister: false,
      manifest,
      // The plugin adds the manifest itself, and the icons come with the png pattern, so each file is listed once.
      includeManifestIcons: false,
      workbox: {
        mode: "production", // Workbox otherwise follows NODE_ENV: a build run by the tests (NODE_ENV=test) would write a different worker
        globPatterns: ["**/*.{js,css,html,png}"],
        navigateFallback: "index.html",
        // The server's own routes are never answered by the worker, so sign in and saves always reach the server.
        navigateFallbackDenylist: [/^\/api\//],
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  build: {
    // Must match pages_build_output_dir in wrangler.toml.
    outDir: "dist",
  },
  test: {
    include: ["tests/**/*.test.ts"],
  },
});
