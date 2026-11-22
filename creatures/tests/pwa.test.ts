// The installable app (Phase 7): the manifest, the icons, the page's tags, the security headers and what the build produces.
// The worker itself (offline start, the update notice, the reload) is not run here: it was checked in a real browser by hand (progress.md).
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "vite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { THEME_COLOR, manifest } from "../pwa-manifest";

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (rel: string): string => readFileSync(join(root, rel), "utf8");
const pngSize = (file: string): { width: number; height: number } | null => {
  const bytes = readFileSync(file);
  if (bytes.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") return null; // not a PNG
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
};

// public/_headers as { "/path": ["Header-Name: value", ...] }: a line with no indent starts a rule, indented lines belong to it.
function headerRules(): Record<string, string[]> {
  const rules: Record<string, string[]> = {};
  let current: string[] | null = null;
  for (const line of read("public/_headers").split("\n")) {
    if (line.trim() === "" || line.trim().startsWith("#")) continue;
    if (/^\s/.test(line)) current?.push(line.trim());
    else current = rules[line.trim()] = [];
  }
  return rules;
}

describe("the manifest", () => {
  it("names the game and opens it at the site root like an app, not a browser tab", () => {
    expect(manifest.name).toBe("Broodkeep");
    expect(manifest.short_name).toBe("Broodkeep");
    expect(manifest.start_url).toBe("/");
    expect(manifest.scope).toBe("/");
    expect(manifest.id).toBe("/");
    expect(manifest.display).toBe("standalone");
  });

  it("uses the game's dusk colour for the phone's top bar and the start screen, the same one the page, the stylesheet and the icon script's ground use", () => {
    expect(THEME_COLOR).toBe("#231a38");
    expect(manifest.theme_color).toBe("#231a38");
    expect(manifest.background_color).toBe("#231a38");
    expect(read("src/ui/app.css")).toMatch(/--bg:\s*#231a38;/);
    expect(read("index.html")).toContain('<meta name="theme-color" content="#231a38" />');
    expect(read("tools/pwa-icons.py")).toMatch(/^BG = "#231a38"/m);
  });

  it("lists a 192 and a 512 icon for any launcher, and a 512 icon made for round and rounded masks", () => {
    const icons = manifest.icons ?? [];
    const summary = icons.map((icon) => `${icon.purpose} ${icon.sizes} ${icon.type}`).sort();
    expect(summary).toEqual(["any 192x192 image/png", "any 512x512 image/png", "maskable 512x512 image/png"]);
  });

  it("points every icon at a PNG in public/ that is exactly the size the manifest says", () => {
    for (const icon of manifest.icons ?? []) {
      expect(icon.src.startsWith("/"), icon.src).toBe(true);
      const size = pngSize(join(root, "public", icon.src.slice(1)));
      const [width, height] = String(icon.sizes).split("x").map(Number);
      expect(size, icon.src).toEqual({ width, height });
    }
  });
});

describe("the page", () => {
  const html = read("index.html");

  it("has a tab icon and an iPhone home screen icon that exist, the second one 180 by 180", () => {
    expect(html).toContain('<link rel="icon" type="image/png" href="/favicon.png" />');
    expect(html).toContain('<link rel="apple-touch-icon" href="/apple-touch-icon.png" />');
    expect(pngSize(join(root, "public/favicon.png"))).toEqual({ width: 48, height: 48 });
    expect(pngSize(join(root, "public/apple-touch-icon.png"))).toEqual({ width: 180, height: 180 });
  });

  it("tells phones to open it as an app, with its own name", () => {
    expect(html).toContain('<meta name="mobile-web-app-capable" content="yes" />');
    expect(html).toContain('<meta name="apple-mobile-web-app-capable" content="yes" />');
    expect(html).toContain('<meta name="apple-mobile-web-app-title" content="Broodkeep" />');
  });

  it("has no inline script and no style attribute, which the security policy does not allow", () => {
    expect(html).not.toMatch(/<script(?![^>]*\bsrc=)/i);
    expect(html).not.toMatch(/\sstyle=/i);
  });
});

describe("the security headers", () => {
  it("still allow only the site's own files: no inline or eval script, and nothing from elsewhere", () => {
    const csp = (headerRules()["/*"] ?? []).find((line) => line.startsWith("Content-Security-Policy:")) ?? "";
    expect(csp).toContain("default-src 'self'");
    expect(csp).not.toMatch(/unsafe-inline|unsafe-eval|https?:|\*/);
    expect(csp).not.toContain("script-src"); // so the worker and the manifest fall back to 'self' too
  });

  it("make the browser check the worker script again on every visit", () => {
    expect(headerRules()["/sw.js"]).toEqual(["Cache-Control: no-cache"]);
  });

  it("still keep the server's answers out of every cache", () => {
    expect(headerRules()["/api/*"]).toEqual(["Cache-Control: no-store"]);
  });
});

describe("the built site", () => {
  let out: string;
  let html: string;
  let sw: string;
  let js: string;
  let precached: string[];

  beforeAll(async () => {
    out = mkdtempSync(join(tmpdir(), "broodkeep-pwa-"));
    await build({ root, logLevel: "silent", build: { outDir: out, emptyOutDir: true } });
    html = readFileSync(join(out, "index.html"), "utf8");
    sw = readFileSync(join(out, "sw.js"), "utf8");
    const bundle = /src="\/(assets\/index-[^"]+\.js)"/.exec(html)?.[1] ?? "";
    js = readFileSync(join(out, bundle), "utf8");
    precached = [...sw.matchAll(/"?url"?:\s*"([^"]+)"/g)].map((match) => match[1]!);
  }, 60_000);
  afterAll(() => rmSync(out, { recursive: true, force: true }));

  it("links the manifest, loads one script (the game's own, which registers the worker) and has no inline script", () => {
    expect(html).toMatch(/<link rel="manifest" href="\/manifest\.webmanifest"[^>]*>/);
    expect(html).not.toMatch(/<script(?![^>]*\bsrc=)/i);
    expect(html.match(/<script\b/g)).toHaveLength(1); // a second one would be a second way of registering the worker
  });

  it("writes the manifest from pwa-manifest.ts", () => {
    expect(JSON.parse(readFileSync(join(out, "manifest.webmanifest"), "utf8"))).toMatchObject(manifest);
  });

  it("carries the worker registration (the words serviceWorker and /sw.js) in the game's own script, since the page may not carry one", () => {
    expect(js).toContain("serviceWorker");
    expect(js).toContain("/sw.js");
  });

  it("keeps the page, its script and style, the icons and the manifest for offline use, each once", () => {
    const script = /src="\/(assets\/index-[^"]+\.js)"/.exec(html)?.[1];
    const style = /href="\/(assets\/index-[^"]+\.css)"/.exec(html)?.[1];
    expect(script).toBeDefined();
    expect(style).toBeDefined();
    for (const file of ["index.html", script!, style!, "manifest.webmanifest", "icon-192.png", "icon-512.png", "icon-maskable-512.png", "apple-touch-icon.png", "favicon.png"]) {
      expect(precached.filter((url) => url === file), file).toHaveLength(1);
    }
    expect(new Set(precached).size).toBe(precached.length);
  });

  it("keeps nothing of the server's in the offline files, and tells the worker to leave /api/ out of the fallback page", () => {
    expect(precached.filter((url) => url.startsWith("_headers") || url.startsWith("api/"))).toEqual([]);
    expect(sw).toMatch(/denylist:\s*\[\s*\/\^\\\/api\\\/\/\s*\]/); // a page that is not a file (a path typed in) gets index.html, except under /api/
  });

  it("skips waiting only when told to by a message from the page, and does not call the worker library's clientsClaim", () => {
    expect(sw).toMatch(/SKIP_WAITING[\s\S]{0,60}self\.skipWaiting\(\)/);
    expect(sw.match(/skipWaiting\(/g)).toHaveLength(1);
    expect(sw).not.toContain("clientsClaim");
  });

  it("asks the plugin for the update mode that waits for a tap (registerType prompt in vite.config.ts; what the game then does is checked in a browser)", () => {
    // The built worker is the same either way: the mode only changes what the game's script does (reload by itself, or show the notice).
    expect(read("vite.config.ts")).toMatch(/registerType:\s*"prompt"/);
  });

  it("asks the worker library to clear the files of older versions (the call is in the worker)", () => {
    expect(sw).toContain("cleanupOutdatedCaches");
  });
});
