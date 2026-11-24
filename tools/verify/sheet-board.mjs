// Contact sheet for the request board (A2.3): one screenshot per state and window size, written to sheets-board/<WxH>-<state>.png, to be LOOKED at before any
// check is trusted. It also prints each page's height against the window's. A state with the panel open is shot with the window as tall as the
// panel's content (the panel scrolls inside a fixed layer, which a full-page shot does not follow), and the line says how tall that was.
// Run: node sheet-board.mjs --base http://127.0.0.1:4173
// Pixel ratio 2, UTC, en-US, frozen clock 2026-11-22T15:00:00Z, saves from saves/board-<scenario>-<mode>.json (made by gen-saves-board).
// There are no assertions: a state that cannot be reached throws, prints "ERROR <name> <message>", and the exit code is 2. A console error or an uncaught
// exception on the page during a state counts the same way, even when the screenshot looks right.
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
  console.error("usage: node sheet-board.mjs --base http://127.0.0.1:<port>");
  process.exit(2);
}
const base = args[1];
const SHEETS = join(OUT, "sheets-board");
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
  try {
    const page = await context.newPage();
    const errors = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(`console: ${msg.text()}`);
    });
    page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));
    await page.clock.install({ time: T });
    await page.clock.setFixedTime(T);
    const stub = `${base}/seed`;
    await page.route(stub, (route) => route.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html><title>seed</title>" }));
    await page.goto(stub);
    await page.evaluate(seedSave, JSON.parse(readFileSync(join(OUT, "saves", `board-${scenario}-${mode}.json`), "utf8")));
    await page.goto(`${base}/`);
    await page.waitForSelector('button[aria-label="Habitat"]', { timeout: 20000 });
    await page.waitForTimeout(300);
    return { context, page, errors };
  } catch (err) {
    await context.close().catch(() => {}); // a state that cannot be opened must not leave its window open
    throw err;
  }
}

const shopButton = (page) => page.locator('button[aria-label="Shop"]');
const openShop = async (page) => {
  await shopButton(page).click({ timeout: 5000 });
  await page.locator('section[aria-label="Shop"]').waitFor({ state: "visible", timeout: 5000 });
};
const openRequests = async (page) => {
  await openShop(page);
  await page.locator(".shop-tabs").getByRole("button", { name: "Requests", exact: true }).click({ timeout: 5000 });
  await page.locator(".req-list").waitFor({ state: "visible", timeout: 5000 });
};

// state: [scenario, mode, what to do, whether the panel stays open (the shot then uses the panel's own height)]
const STATES = {
  "items-default": ["rich", "adult", openShop, true],
  "req-three": ["three", "adult", openRequests, true],
  "req-types-b": ["types-b", "adult", openRequests, true],
  "req-stale": ["stale", "adult", openRequests, true],
  "req-longest": ["longest", "adult", openRequests, true],
  "req-done": ["done", "adult", openRequests, true],
  "req-empty": ["empty", "adult", openRequests, true],
  "req-undo-pending": ["undo-pending", "adult", openRequests, true],
  "room-adult-board": ["three", "adult", async () => {}, false],
  "room-kid-board": ["three", "kid", async () => {}, false],
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
        const { page, errors } = opened;
        await run(page);
        await page.waitForTimeout(400);
        if (errors.length > 0) throw new Error(`the page reported ${errors.length} error(s): ${errors.slice(0, 2).join(" | ")}`);
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
