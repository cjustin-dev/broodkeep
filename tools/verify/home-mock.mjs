// H0 of docs/home-plan.md: shoots the three-room home mock (home-mock.html, served by vite) at tile 16 and 24, three phone widths (pixel ratio 2) and four zooms, as PNG contact sheets in
// $VERIFY_OUT/sheets-home/. No assertions: it is the picture the tile size and the default zoom are chosen from.
// Run: node home-mock.mjs --base http://127.0.0.1:4174
import { createRequire } from "node:module";
import { mkdirSync, rmSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

const require = createRequire(process.env.PLAYWRIGHT_FROM ?? join(homedir(), "homelab-dashboard", "package.json"));
const { chromium } = require("playwright");

const base = process.argv[process.argv.indexOf("--base") + 1];
if (!base || !base.startsWith("http")) {
  console.error("usage: node home-mock.mjs --base http://127.0.0.1:4174");
  process.exit(2);
}
const OUT = join(process.env.VERIFY_OUT ?? join(tmpdir(), "broodkeep-verify"), "sheets-home");
mkdirSync(OUT, { recursive: true });

let browser;
try {
  browser = await chromium.launch();
} catch (e) {
  console.log(`FAIL could not start the browser: ${String(e.message).split("\n")[0]}`);
  process.exit(1);
}
const sheets = [
  { name: "tile16-square", query: "tile=16&shape=square" },
  { name: "tile24-square", query: "tile=24&shape=square" },
  { name: "tile16-wide", query: "tile=16&shape=wide&zooms=1,2,3" },
  { name: "tile24-wide", query: "tile=24&shape=wide&zooms=1,2,3" },
];
let failed = 0;
for (const sheet of sheets) {
  const file = join(OUT, `home-${sheet.name}.png`);
  rmSync(file, { force: true }); // (a sheet left by an earlier run must not pass for this one)
  const errors = [];
  let context;
  try {
    context = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 });
    const page = await context.newPage();
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(`${base}/tools/verify/home-mock.html?${sheet.query}`);
    await page.waitForFunction(() => document.title === "ready", null, { timeout: 30000 });
    await page.screenshot({ path: file, fullPage: true });
    console.log(`wrote ${file}${errors.length ? ` (page errors: ${errors.join(" | ")})` : ""}`);
    if (errors.length) failed++;
  } catch (e) {
    console.log(`FAIL ${sheet.name}: ${String(e.message).split("\n")[0]}${errors.length ? ` (page errors: ${errors.join(" | ")})` : ""}`);
    failed++;
  }
  await context?.close().catch(() => {});
}
await browser.close();
console.log(`SUMMARY ${sheets.length} sheets, ${failed} failed`);
process.exit(failed ? 1 : 0);
