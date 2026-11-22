// The web app manifest: what a phone or browser reads to install Broodkeep as an app. vite.config.ts builds it into the site
// (dist/manifest.webmanifest) and tests/pwa.test.ts checks it. The icons are drawn by tools/pwa-icons.py into public/.
import type { ManifestOptions } from "vite-plugin-pwa";

// The game's --bg in src/ui/app.css: the colour of the splash screen, the phone's top bar and the icon ground.
export const THEME_COLOR = "#231a38";

export const manifest: Partial<ManifestOptions> = {
  id: "/",
  name: "Broodkeep",
  short_name: "Broodkeep",
  description: "Raise a pixel creature: feed it, keep it clean, let it sleep and watch it grow.",
  lang: "en",
  start_url: "/",
  scope: "/",
  display: "standalone",
  theme_color: THEME_COLOR,
  background_color: THEME_COLOR,
  categories: ["games"],
  icons: [
    { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
    { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
  ],
};
