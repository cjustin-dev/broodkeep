// Contact sheet for the Playroom in Decorate mode (slice H3): the saved games of the grown home, one screenshot per state and window size, written to
// sheets-grow/<WxH>@<ratio>-<state>.png, to be LOOKED at before any check is trusted. There are no assertions: a state that cannot be reached throws, prints "ERROR <name> <message>",
// and the exit code is 2; a console error or an uncaught exception on the page counts the same way.
// Run: node sheet-grow.mjs --base http://127.0.0.1:4173
// States: the three room home with a table at (30, 4) (it stands: no doorway there yet), the same save with the Playroom built (the table is read as put away: the tray offers it), the
// Playroom with Decorate mode on and the dresser in the tray, and the same panned back to show the doorway. Adult Mode, frozen clock 2026-11-22T15:00:00Z, UTC, en-US, touch.
import { mkdirSync, readFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

const require = createRequire(process.env.PLAYWRIGHT_FROM ?? join(homedir(), "homelab-dashboard", "package.json"));
const { chromium } = require("playwright");

const OUT = process.env.VERIFY_OUT ?? join(tmpdir(), "broodkeep-verify");
const T = 1795359600000;
const WINDOWS = [
  [320, 568, 2],
  [360, 640, 2],
  [390, 844, 3],
];

const args = process.argv.slice(2);
if (args.length !== 2 || args[0] !== "--base" || !/^http:\/\/127\.0\.0\.1:\d+$/.test(args[1])) {
  console.error("usage: node sheet-grow.mjs --base http://127.0.0.1:<port>");
  process.exit(2);
}
const base = args[1];
const SHEETS = join(OUT, "sheets-grow");
rmSync(SHEETS, { recursive: true, force: true });
mkdirSync(SHEETS, { recursive: true });

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
  });
  db.close();
}

// state: [saved game, Decorate mode on, arrow keys to the right (30 reach the home's end), arrow keys back to the left after that]
const STATES = {
  "three-rooms-table": ["adult-home-blocked", true, 30, 0],
  "mended-tray": ["adult-home-blocked-room", true, 30, 0],
  "playroom-tray": ["adult-home-room", true, 30, 0],
  "playroom-door": ["adult-home-room", true, 30, 4],
  "playroom-plain": ["adult-home-room", false, 30, 0],
};

async function shoot(browser, state, [save, decorate, right, back], [w, h, dpr]) {
  const context = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dpr, isMobile: true, hasTouch: true, locale: "en-US", timezoneId: "UTC", serviceWorkers: "block" });
  const page = await context.newPage();
  const errors = [];
  page.on("console", (msg) => msg.type() === "error" && errors.push(`console: ${msg.text()}`));
  page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));
  try {
    await page.addInitScript(() => {
      Math.random = () => 0.99;
    });
    await page.clock.install({ time: T });
    await page.clock.setFixedTime(T);
    await page.route(`${base}/seed`, (route) => route.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html><title>seed</title>" }));
    await page.goto(`${base}/seed`);
    await page.evaluate(seedSave, JSON.parse(readFileSync(join(OUT, "saves", `${save}-adult.json`), "utf8")));
    await page.goto(`${base}/`);
    await page.locator("canvas.room").waitFor({ timeout: 20000 });
    await page.clock.runFor(100);
    if (decorate) await page.getByRole("button", { name: "Decorate the home" }).click({ timeout: 5000 });
    await page.clock.runFor(100);
    await page.locator("canvas.room").focus();
    for (let i = 0; i < right; i++) await page.keyboard.press("ArrowRight");
    for (let i = 0; i < back; i++) await page.keyboard.press("ArrowLeft");
    await page.clock.runFor(300);
    await page.screenshot({ path: join(SHEETS, `${w}x${h}@${dpr}-${state}.png`) });
    if (errors.length > 0) throw new Error(`the page reported ${errors.length} error(s): ${errors.slice(0, 2).join(" | ")}`);
  } finally {
    await context.close().catch(() => {});
  }
}

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
  for (const win of WINDOWS) {
    for (const [state, spec] of Object.entries(STATES)) {
      try {
        await shoot(browser, state, spec, win);
        taken++;
        console.log(`SHOT ${win[0]}x${win[1]}@${win[2]}-${state}`);
      } catch (err) {
        failed++;
        console.log(`ERROR ${win[0]}x${win[1]}@${win[2]}-${state} ${err && err.message ? err.message : err}`);
      }
    }
  }
} finally {
  await browser.close().catch(() => {});
}
console.log(`DONE ${taken} screenshots, ${failed} errors`);
process.exitCode = failed > 0 || taken === 0 ? 2 : 0;
