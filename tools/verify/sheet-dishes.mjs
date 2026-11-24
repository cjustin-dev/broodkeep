// Contact sheet for the shop's foods, "dishes" (A2.2b): one screenshot per state and window size, written to sheets-dishes/<WxH>-<state>.png, to be
// LOOKED at before any check is trusted. It also prints each page's height against the window's. A state with the panel open is shot with the window
// as tall as the panel's content (the panel scrolls inside a fixed layer, which a full-page shot does not follow), and the line says how tall that was.
// Run: node sheet-dishes.mjs --base http://127.0.0.1:4173
// Pixel ratio 2, UTC, en-US, frozen clock 2026-11-22T15:00:00Z, saves from saves/dishes-<scenario>-<mode>.json (made by gen-saves-dishes).
// There are no assertions: a state that cannot be reached throws, prints "ERROR <name> <message>", and the exit code is 2.
import { mkdirSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

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
  console.error("usage: node sheet-dishes.mjs --base http://127.0.0.1:<port>");
  process.exit(2);
}
const base = args[1];
const SHEETS = join(OUT, "sheets-dishes");
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
  await page.evaluate(seedSave, JSON.parse(readFileSync(join(OUT, "saves", `dishes-${scenario}-${mode}.json`), "utf8")));
  await page.goto(`${base}/`);
  await page.waitForSelector('button[aria-label="Habitat"]', { timeout: 20000 });
  await page.waitForTimeout(300);
  return { context, page };
}

const shopButton = (page) => page.locator('button[aria-label="Shop"]');
const openShop = async (page) => {
  await shopButton(page).click({ timeout: 5000 });
  await page.locator('section[aria-label="Shop"]').waitFor({ state: "visible", timeout: 5000 });
};
const pick = (page, name) => page.locator(`.shop-pick[aria-label^="${name}"]`).click({ timeout: 5000 });
const feedButton = (page) => page.locator('button[aria-label="Feed"]');
const openTray = async (page) => {
  await feedButton(page).click({ timeout: 5000 });
  await page.locator('[aria-label="Choose food"]').waitFor({ state: "visible", timeout: 5000 });
  await page.waitForTimeout(300);
};
const tapDish = async (page, name) => {
  await openTray(page);
  await page.locator(`[aria-label="Choose a dish"] button[aria-label^="${name}"]`).click({ timeout: 5000 });
  await page.waitForTimeout(500);
};

// state: [scenario, mode, what to do, whether the panel stays open (the shot then uses the panel's own height)]
const STATES = {
  "room-kid-none": ["kid-none", "adult", async () => {}, false],
  "tray-none-adult": ["kid-none", "adult", openTray, false],
  "tray-none-kid": ["kid-none", "kid", openTray, false],
  "tray-hearty-adult": ["kid-hearty", "adult", openTray, false],
  "tray-hearty-kid": ["kid-hearty", "kid", openTray, false],
  "tray-all-land-adult": ["kid-all", "adult", openTray, false],
  "tray-all-land-kid": ["kid-all", "kid", openTray, false],
  "tray-all-water-adult": ["water-all", "adult", openTray, false],
  "tray-all-sky-adult": ["sky-all", "adult", openTray, false],
  "tray-young-adult": ["young-all", "adult", openTray, false],
  "tray-special-adult": ["special-all", "adult", openTray, false],
  "tray-full-adult": ["kid-all-full", "adult", async (p) => { await feedButton(p).click({ timeout: 5000, force: true }); }, false], // (aria-disabled, so a plain click waits for it to be enabled)
  "after-dish-meal": ["kid-all", "adult", async (p) => { await tapDish(p, "Hearty Bowl"); }, false],
  "after-stew-meal": ["kid-all", "adult", async (p) => { await tapDish(p, "Stew"); }, false],
  "shop-rich": ["rich", "adult", openShop, true],
  "shop-rich-hearty": ["rich", "adult", async (p) => { await openShop(p); await pick(p, "Hearty Bowl"); }, true],
  "shop-rich-stew": ["rich", "adult", async (p) => { await openShop(p); await pick(p, "Stew"); }, true],
  "shop-poor": ["poor", "adult", openShop, true],
  "shop-owned-foods": ["owned-foods", "adult", openShop, true],
  "shop-just-bought": ["just-bought-stew", "adult", openShop, true],
  "shop-after-buy": ["exact-hearty", "adult", async (p) => { await openShop(p); await p.locator('button[aria-label="Buy Hearty Bowl"]').click({ timeout: 5000 }); }, true],
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
    for (const [state, [scenario, mode, run, panelOpen]] of Object.entries(STATES)) {
      let context;
      try {
        const opened = await open(browser, scenario, mode, size);
        context = opened.context;
        const { page } = opened;
        await run(page);
        await page.waitForTimeout(400);
        let height;
        if (panelOpen) {
          height = await page.evaluate(() => document.querySelector(".panel").scrollHeight);
          await page.setViewportSize({ width: size[0], height: Math.max(size[1], height) });
          await page.waitForTimeout(200);
        } else {
          height = await page.evaluate(() => document.documentElement.scrollHeight);
        }
        await page.screenshot({ path: join(SHEETS, `${size[0]}x${size[1]}-${state}.png`), fullPage: true });
        taken++;
        console.log(`SHOT ${size[0]}x${size[1]}-${state} ${panelOpen ? "panel" : "page"} ${height} of window ${size[1]}`);
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
