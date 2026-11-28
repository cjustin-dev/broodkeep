// Contact sheet for the Book's recipes and the Perfect star (A4.4, docs/adult-a4-plan.md section 14): one screenshot per state and window size, written to
// sheets-recipes/<WxH>-<state>.png, to be LOOKED at before any check is trusted. The Book and the Forecast are fixed layers that scroll inside themselves, so each
// shot is the window's own size (not the full page), after the panel has been scrolled to the part the state is about.
// Run: node sheet-recipes.mjs --base http://127.0.0.1:4173
// Pixel ratio 2, UTC, en-US, frozen clock 2026-11-22T15:00:00Z, saves from saves/recipes-<scenario>-<mode>.json (made by gen-saves-recipes).
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
  console.error("usage: node sheet-recipes.mjs --base http://127.0.0.1:<port>");
  process.exit(2);
}
const base = args[1];
const SHEETS = join(OUT, "sheets-recipes");
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
  await page.evaluate(seedSave, JSON.parse(readFileSync(join(OUT, "saves", `recipes-${scenario}-${mode}.json`), "utf8")));
  await page.goto(`${base}/`);
  await page.waitForSelector('button[aria-label="Habitat"], button[aria-label="Creature Book"], button[aria-label^="Creature Book"]', { timeout: 20000 });
  await page.waitForTimeout(300);
  return { context, page };
}

const bookButton = (page) => page.locator('button[aria-label^="Creature Book"]').first();
const openBook = async (page) => {
  await bookButton(page).click({ timeout: 5000 });
  await page.locator('section[aria-label="Creature Book"]').waitFor({ state: "visible", timeout: 5000 });
  await page.waitForTimeout(300);
};
const openForecast = async (page) => {
  await page.locator('button[aria-label^="Growth Forecast"]').click({ timeout: 5000 });
  await page.locator('section[aria-label="Growth Forecast"]').waitFor({ state: "visible", timeout: 5000 });
  await page.waitForTimeout(300);
};
// Scrolls the Book to the page (section) with this title, its title at the top of the window.
const scrollToPage = (page, title) =>
  page.evaluate((t) => {
    const h = [...document.querySelectorAll(".panel .book-page h3")].find((x) => x.textContent.trim() === t);
    if (!h) throw new Error(`no Book page called ${t}`);
    h.scrollIntoView({ block: "start" });
  }, title);
// Taps a cell by its place in the page: the nth cell button of the page with this title.
const tapCell = async (page, title, n) => {
  const sections = page.locator(".panel .book-page", { has: page.locator(`h3:text-is("${title}")`) });
  await sections.locator(".book-cell-btn").nth(n).click({ timeout: 5000 });
  await page.waitForTimeout(300);
};
const scrollToEnd = (page) => page.evaluate(() => (document.querySelector(".panel").scrollTop = document.querySelector(".panel").scrollHeight));
const scrollToTop = (page) => page.evaluate(() => (document.querySelector(".panel").scrollTop = 0));

// state: [scenario, mode, what to do]. Cell numbers of a field page: 0 is the kid, 1 to 4 the four young, 5 to 8 the tier 1 adults, 9 to 12 tier 2, 13 to 16 tier 3, 17 to 20 tier 4.
const STATES = {
  "book-egg-top": ["egg", "adult", async (p) => { await openBook(p); }],
  "book-kid-top": ["kid", "adult", async (p) => { await openBook(p); }],
  "book-kid-card-baby": ["kid", "adult", async (p) => { await openBook(p); await tapCell(p, "Baby", 0); }],
  "book-kid-card-kid": ["kid", "adult", async (p) => { await openBook(p); await scrollToPage(p, "Land"); await tapCell(p, "Land", 0); }],
  "book-kid-card-young": ["kid", "adult", async (p) => { await openBook(p); await scrollToPage(p, "Land"); await tapCell(p, "Land", 4); }],
  "book-kid-card-adult-t1": ["kid", "adult", async (p) => { await openBook(p); await scrollToPage(p, "Land"); await tapCell(p, "Land", 8); }],
  "book-kid-card-adult-t4": ["kid", "adult", async (p) => { await openBook(p); await scrollToPage(p, "Water"); await tapCell(p, "Water", 20); }],
  "book-kid-card-special": ["kid", "adult", async (p) => { await openBook(p); await scrollToPage(p, "Special"); await tapCell(p, "Special", 0); }],
  "book-stars-top": ["stars", "adult", async (p) => { await openBook(p); }],
  "book-stars-land": ["stars", "adult", async (p) => { await openBook(p); await scrollToPage(p, "Land"); }],
  "book-stars-card": ["stars", "adult", async (p) => { await openBook(p); await scrollToPage(p, "Land"); await tapCell(p, "Land", 5); }],
  "book-bottom-card": ["bottom", "adult", async (p) => { await openBook(p); await scrollToEnd(p); await tapCell(p, "Sky", 20); }],
  "book-lives": ["lives", "adult", async (p) => { await openBook(p); await scrollToEnd(p); }],
  "book-full-top": ["full", "adult", async (p) => { await openBook(p); }],
  "book-full-sky": ["full", "adult", async (p) => { await openBook(p); await scrollToPage(p, "Sky"); }],
  "book-kid-mode-top": ["kid", "kid", async (p) => { await openBook(p); }],
  "book-kid-mode-land": ["stars", "kid", async (p) => { await openBook(p); await scrollToPage(p, "Land"); }],
  "fc-baby": ["baby", "adult", openForecast],
  "fc-baby-mistake": ["baby-mistake", "adult", openForecast],
  "fc-young": ["young", "adult", openForecast],
  "fc-young-unknown": ["young-unknown", "adult", openForecast],
  "fc-adult-perfect": ["adult-perfect", "adult", openForecast],
  "fc-adult-plain": ["adult-plain", "adult", openForecast],
  "fc-special": ["special", "adult", openForecast],
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
        const { page } = opened;
        await run(page);
        await page.waitForTimeout(400);
        await page.screenshot({ path: join(SHEETS, `${size[0]}x${size[1]}-${state}.png`) });
        taken++;
        console.log(`SHOT ${size[0]}x${size[1]}-${state}`);
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
