// Build settings for Vite. Vitest (the test runner) reads this same file.
//
// vite-plugin-pwa is installed but not switched on yet. It gets wired in during
// Phase 7 (installable app), together with the manifest and icons.
import { defineConfig } from "vitest/config";

export default defineConfig({
  build: {
    // Must match pages_build_output_dir in wrangler.toml.
    outDir: "dist",
  },
  test: {
    include: ["tests/**/*.test.ts"],
  },
});
