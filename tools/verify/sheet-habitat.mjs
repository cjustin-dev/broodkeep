// Contact sheet for the habitat cards (A2.1): one full-page screenshot per state and window size, written to sheets-habitat/<WxH>-<state>.png,
// to be LOOKED at before any check is trusted. It also prints each page's height against the window's ("page H of window H") for the layout figures.
// Run: node sheet-habitat.mjs --base http://127.0.0.1:4173
// Pixel ratio 2, UTC, en-US, frozen clock 2026-11-22T15:00:00Z, saves from saves/hab-<scenario>-<mode>.json (made by gen-saves-habitat).
// There are no assertions: a state that cannot be reached throws, prints "ERROR <name> <message>", and the exit code is 2.
import { mkdirSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

// Playwright is not a dependency of the game. PLAYWRIGHT_FROM names a package.json next to a node_modules that has it.
const require = createRequire(process.env.PLAYWRIGHT_FROM ?? join(homedir(), "homelab-dashboard", "package.json"));
const { chromium } = require("playwright");

const OUT = process.env.VERIFY_OUT ?? join(tmpdir(), "broodkeep-verify");
const T = 1795359600000;
const SIZES = [
  [320, 568],
  [360, 640],
  [390, 844],
];

const args = process.argv.slice(2);
if (args.length !== 2 || args[0] !== "--base" || !/^http:\/\/127\.0\.0\.1:\d+$/.test(args[1])) {
  console.error("usage: node sheet-habitat.mjs --base http://127.0.0.1:<port>");
  process.exit(2);
}
const base = args[1];
const SHEETS = join(OUT, "sheets-habitat");
mkdirSync(SHEETS, { recursive: true });
for (const f of readdirSync(SHEETS)) if (f.endsWith(".png")) rmSync(join(SHEETS, f));

async function seedSave(save) {
  const db = await new Promise((resolve, reject) => {
    const req = indexedDB.open("broodkeep", 1);
    req.onupgradeneeded = () => req.result.createObjectStore("kv");
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  await new Promise((resolve, reject) => {
    const tx = db.transaction("kv", "readwrite");
    tx.objectStore("kv").put(save, "save");
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
  db.close();
}

async function open(browser, scenario, mode, [w, h]) {
  const context = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, locale: "en-US", timezoneId: "UTC", serviceWorkers: "block" });
  const page = await context.newPage();
  await page.clock.install({ time: T });
  await page.clock.setFixedTime(T);
  const stub = `${base}/seed`;
  await page.route(stub, (route) => route.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html><title>seed</title>" }));
  await page.goto(stub);
  await page.evaluate(seedSave, JSON.parse(readFileSync(join(OUT, "saves", `hab-${scenario}-${mode}.json`), "utf8")));
  await page.goto(`${base}/`);
  await page.waitForSelector('button[aria-label="Habitat"]', { timeout: 20000 });
  await page.getByRole("button", { name: "Habitat", exact: true }).click();
  await page.waitForSelector('[aria-label="Places to work"], .job-card, button.callback', { timeout: 5000 });
  await page.waitForTimeout(300);
  return { context, page };
}

const spot = (page, name) => page.locator(`.spots button[aria-label^="${name}"]`);
// A shut spot is aria-disabled (a real tap still reaches it, and opens its card); Playwright would wait for it to be "enabled" forever.
const tap = async (page, name) => {
  await spot(page, name).click({ force: true, timeout: 5000 });
  await page.locator(".spot-card").waitFor({ state: "visible", timeout: 5000 });
};
const callBackButton = (page) => page.locator(".job-card button.card-btn");

// state: [scenario, mode, what to do after the habitat screen is open]
const STATES = {
  spots: ["home", "adult", async () => {}],
  "card-pond": ["home", "adult", (page) => tap(page, "Pond")],
  "card-meadow": ["home", "adult", (page) => tap(page, "Bug meadow")],
  "card-herbs": ["home", "adult", (page) => tap(page, "Herb patch")],
  "card-rocks": ["home", "adult", (page) => tap(page, "Rock pile")],
  "card-young-rocks": ["young", "adult", (page) => tap(page, "Rock pile")],
  "card-baby-trees": ["baby", "adult", (page) => tap(page, "Trees")],
  "card-tired-pond": ["tired", "adult", (page) => tap(page, "Pond")],
  "card-tired-meadow": ["tired", "adult", (page) => tap(page, "Bug meadow")],
  "card-edge-pond": ["edge", "adult", (page) => tap(page, "Pond")],
  "card-nap": ["nap", "adult", (page) => tap(page, "Pond")],
  "card-sick": ["sick", "adult", (page) => tap(page, "Pond")],
  "job-pond": ["away-pond", "adult", async () => {}],
  "job-rocks": ["away-rocks", "adult", async () => {}],
  "job-start": ["away-start", "adult", async () => {}],
  "job-herbs": ["away-herbs", "adult", async () => {}],
  "haul-coin": ["away-pond", "adult", async (page) => { await callBackButton(page).click(); await page.locator(".haul").waitFor({ state: "visible", timeout: 5000 }); }],
  "haul-both": ["away-rocks", "adult", async (page) => { await callBackButton(page).click(); await page.locator(".haul").waitFor({ state: "visible", timeout: 5000 }); }],
  "kid-spots": ["home", "kid", async () => {}],
  "kid-away": ["away-rocks", "kid", async () => {}],
  "kid-haul": ["away-rocks", "kid", async (page) => { await page.locator("button.callback").click(); await page.locator(".haul").waitFor({ state: "visible", timeout: 5000 }); }],
};

let browser;
try {
  browser = await chromium.launch({ headless: true });
} catch (err) {
  console.log(`ERROR launch ${err && err.message ? err.message : err}`);
  process.exit(2);
}
let failed = 0;
let taken = 0;
try {
  for (const size of SIZES) {
    for (const [state, [scenario, mode, run]] of Object.entries(STATES)) {
      let context;
      try {
        const opened = await open(browser, scenario, mode, size);
        context = opened.context;
        const before = await opened.page.evaluate(() => document.documentElement.scrollHeight);
        await run(opened.page);
        await opened.page.waitForTimeout(400);
        const height = await opened.page.evaluate(() => document.documentElement.scrollHeight);
        await opened.page.screenshot({ path: join(SHEETS, `${size[0]}x${size[1]}-${state}.png`), fullPage: true });
        taken++;
        console.log(`SHOT ${size[0]}x${size[1]}-${state} page ${height} of window ${size[1]} (${height - before >= 0 ? "+" : ""}${height - before} against the page before the step)`);
      } catch (err) {
        failed++;
        console.log(`ERROR ${size[0]}x${size[1]}-${state} ${err && err.message ? err.message : err}`);
      } finally {
        if (context) await context.close().catch(() => {});
      }
    }
  }
} finally {
  await browser.close().catch(() => {});
}
console.log(`DONE ${taken} screenshots, ${failed} errors`);
process.exitCode = failed > 0 || taken === 0 ? 2 : 0;
