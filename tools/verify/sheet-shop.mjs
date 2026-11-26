// Contact sheet for the shop (A2.2a, with the hats of A2.4): one screenshot per state and window size, written to sheets-shop/<WxH>-<state>.png, to be LOOKED at before any
// check is trusted. It also prints each page's height against the window's. A state with the panel open is shot with the window as tall as the
// panel's content (the panel scrolls inside a fixed layer, which a full-page shot does not follow), and the line says how tall that was.
// Run: node sheet-shop.mjs --base http://127.0.0.1:4173
// Pixel ratio 2, UTC, en-US, frozen clock 2026-11-22T15:00:00Z, saves from saves/shop-<scenario>-<mode>.json (made by gen-saves-shop).
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
  console.error("usage: node sheet-shop.mjs --base http://127.0.0.1:<port>");
  process.exit(2);
}
const base = args[1];
const SHEETS = join(OUT, "sheets-shop");
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
  await page.evaluate(seedSave, JSON.parse(readFileSync(join(OUT, "saves", `shop-${scenario}-${mode}.json`), "utf8")));
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
// The hats are the last cards of the list: scrolled to the end, so the sheet shows them (the other panel states show the top of the list).
const openShopToEnd = async (page) => {
  await openShop(page);
  await page.locator(".shop-scroll").evaluate((el) => el.scrollTo(0, el.scrollHeight));
};
// The home with the Playroom is 1032 game pixels wide: the camera is panned to its right end (the keys stop there), then back by `back` presses to show the doorway.
const panRight = async (page, back = 0) => {
  await page.evaluate(() => { Math.random = () => 0.99; });
  await page.locator("canvas.room").focus();
  for (let i = 0; i < 30; i++) await page.keyboard.press("ArrowRight");
  for (let i = 0; i < back; i++) await page.keyboard.press("ArrowLeft");
  await page.clock.runFor(300);
};
const pick = (page, name) => page.locator(`.shop-pick[aria-label^="${name}"]`).click({ timeout: 5000 });
// A stand-in for the Switch button that shows with two or more profiles on an account (it needs a cloud session to be real): the same classes and
// two lines of text, put in the bag row, so the header can be seen at its fullest.
const addSwitchStandIn = (page) =>
  page.evaluate(() => {
    const row = document.querySelector(".strip-bag")?.parentElement;
    if (!row) throw new Error("no bag row");
    const b = document.createElement("button");
    b.className = "btn strip-btn strip-who";
    b.innerHTML = '<span class="who-name">Christopher</span><span class="who-switch">Switch</span>';
    row.appendChild(b);
  });

// state: [scenario, mode, what to do, whether the panel stays open (the shot then uses the panel's own height)]
const STATES = {
  "room-plain": ["rich", "adult", async () => {}, false],
  "room-longname": ["long-name", "adult", async () => {}, false],
  "room-switch-standin": ["rich", "adult", addSwitchStandIn, false],
  "room-all-owned": ["owned-all", "adult", async () => {}, false],
  "room-kid-owned": ["owned-all", "kid", async () => {}, false],
  "room-kid-plain": ["rich", "kid", async () => {}, false],
  "room-hat-worn": ["hat-worn", "adult", async () => {}, false],
  "room-hat-kid": ["hat-worn", "kid", async () => {}, false],
  "room-play-owned": ["room-owned", "adult", (p) => panRight(p), false],
  "room-play-kid": ["room-owned", "kid", (p) => panRight(p), false],
  "room-play-pieces": ["room-just-bought", "adult", (p) => panRight(p), false],
  "room-play-door": ["room-owned", "adult", (p) => panRight(p, 4), false],
  "shop-rich": ["rich", "adult", openShop, true],
  "shop-rich-dusk": ["rich", "adult", async (p) => { await openShop(p); await pick(p, "Wallpaper: Dusk"); }, true],
  "shop-rich-bed": ["rich", "adult", async (p) => { await openShop(p); await pick(p, "Comfy Bed"); }, true],
  "shop-rich-mat": ["rich", "adult", async (p) => { await openShop(p); await pick(p, "Feeding Mat"); }, true],
  "shop-rich-knit": ["rich", "adult", async (p) => { await openShop(p); await pick(p, "Knit Cap"); }, true],
  "shop-rich-crown": ["rich", "adult", async (p) => { await openShop(p); await pick(p, "Stone Crown"); }, true],
  "shop-longname-fisher": ["long-name", "adult", async (p) => { await openShop(p); await pick(p, "Fisher Hat"); }, true],
  "shop-hats-owned": ["hats-owned", "adult", openShopToEnd, true],
  "shop-hat-worn": ["hat-worn", "adult", openShopToEnd, true],
  "shop-rich-playroom": ["rich", "adult", async (p) => { await openShop(p); await pick(p, "Playroom"); }, true],
  "shop-room-exact": ["room-exact", "adult", async (p) => { await openShopToEnd(p); await pick(p, "Playroom"); }, true],
  "shop-room-bought": ["room-exact", "adult", async (p) => { await openShop(p); await p.locator('button[aria-label="Buy Playroom"]').click({ timeout: 5000 }); await pick(p, "Playroom"); }, true],
  "shop-room-owned": ["room-owned", "adult", openShopToEnd, true],
  "shop-poor-end": ["poor", "adult", openShopToEnd, true],
  "shop-poor": ["poor", "adult", openShop, true],
  "shop-mixed": ["mixed", "adult", openShop, true],
  "shop-owned-walls": ["owned-walls", "adult", openShop, true],
  "shop-owned-all": ["owned-all", "adult", openShop, true],
  "shop-just-bought": ["just-bought", "adult", openShop, true],
  "shop-after-buy": ["exact-meadow", "adult", async (p) => { await openShop(p); await p.locator('button[aria-label="Buy Wallpaper: Meadow"]').click({ timeout: 5000 }); }, true],
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
