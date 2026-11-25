// Contact sheet for the home (slice H1): the picture of the home in every state a saved game can be in, and with the camera moved (the kitchen end, the bedroom end, the
// largest zoom, the smallest), at 320, 360 and 390 wide (pixel ratio 2), as sheets-home-h1/<WxH>-<state>.png (the picture's canvas), plus the whole page for Adult and Kid Mode.
// To be LOOKED at before any check is trusted. There are no assertions: a state that cannot be reached throws, prints "ERROR <name> <message>", and the exit code is 2; a
// console error or an uncaught exception on the page during a state counts the same way, even when the screenshot looks right.
// Run: node sheet-home.mjs --base http://127.0.0.1:4173
// Pixel ratio 2, UTC, en-US, frozen clock 2026-11-22T15:00:00Z, saves from saves/<scenario>-<mode>.json (made by gen-saves). Math.random is pinned (0.99), so the creature stands
// where the game put it.
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
  console.error("usage: node sheet-home.mjs --base http://127.0.0.1:<port>");
  process.exit(2);
}
const base = args[1];
const SHEETS = join(OUT, "sheets-home-h1");
mkdirSync(SHEETS, { recursive: true });
for (const f of readdirSync(SHEETS)) if (f.endsWith(".png")) rmSync(join(SHEETS, f));

const load = (name, mode) => JSON.parse(readFileSync(join(OUT, "saves", `${name}-${mode}.json`), "utf8"));
const edit = (name, mode, fn) => {
  const save = load(name, mode);
  fn(save);
  return save;
};

// Each state: the save to start from, and what is done on the page before the picture is shot (`keys` pressed on the focused picture, `run` ms of the page's clock).
const STATES = {
  awake: { save: () => load("adult-home", "adult") },
  kid: { save: () => load("kid-home", "adult") },
  young: { save: () => load("young-home", "adult") },
  egg: { save: () => load("egg", "adult") },
  away: { save: () => load("adult-away", "adult") },
  dead: { save: () => edit("adult-home", "adult", (s) => (s.phase = "dead")) },
  calls: { save: () => edit("adult-home", "adult", (s) => Object.assign(s.creature, { call: "hungry", poop: 5 })) },
  "asleep-walking": { save: () => edit("adult-home", "adult", (s) => (s.creature.sleep = "night")), run: 6000 },
  "asleep-in-bed": { save: () => edit("adult-home", "adult", (s) => (s.creature.sleep = "night")), run: 52000 },
  "kitchen-end": { save: () => load("adult-home", "adult"), keys: ["ArrowRight", "ArrowRight", "ArrowRight", "ArrowRight", "ArrowRight", "ArrowRight", "ArrowRight", "ArrowRight"] },
  "bedroom-end": { save: () => load("adult-home", "adult"), keys: ["ArrowLeft", "ArrowLeft", "ArrowLeft", "ArrowLeft", "ArrowLeft", "ArrowLeft", "ArrowLeft", "ArrowLeft"] },
  "zoom-largest": { save: () => load("adult-home", "adult"), keys: ["+", "+", "+", "+", "+", "+"] },
  "zoom-smallest": { save: () => load("adult-home", "adult"), keys: ["-", "-", "-", "-", "-", "-"] },
  "kid-mode": { save: () => load("kid-home", "kid") },
};

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

async function shoot(browser, name, [w, h]) {
  const state = STATES[name];
  const context = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: "en-US", timezoneId: "UTC", serviceWorkers: "block" });
  try {
    const page = await context.newPage();
    const errors = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(`console: ${msg.text()}`);
    });
    page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));
    await page.addInitScript(() => {
      Math.random = () => 0.99;
    });
    await page.clock.install({ time: T });
    await page.clock.setFixedTime(T);
    const stub = `${base}/seed`;
    await page.route(stub, (route) => route.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html><title>seed</title>" }));
    await page.goto(stub);
    await page.evaluate(seedSave, state.save());
    await page.goto(`${base}/`);
    const canvas = page.locator("canvas.room");
    await canvas.waitFor({ timeout: 20000 });
    await canvas.scrollIntoViewIfNeeded();
    await page.clock.runFor(100);
    if (state.keys) {
      await canvas.focus();
      for (const key of state.keys) {
        await page.keyboard.press(key);
        await page.clock.runFor(40);
      }
    }
    if (state.run) await page.clock.runFor(state.run);
    await page.clock.runFor(100);
    await page.waitForTimeout(150);
    await canvas.screenshot({ path: join(SHEETS, `${w}x${h}-${name}.png`) });
    if (name === "awake" || name === "kid-mode") await page.screenshot({ path: join(SHEETS, `${w}x${h}-page-${name === "awake" ? "adult" : "kid"}.png`), fullPage: true });
    if (errors.length > 0) throw new Error(`the page reported ${errors.length} error(s): ${errors.slice(0, 2).join(" | ")}`);
  } finally {
    await context.close().catch(() => {});
  }
}

const browser = await chromium.launch({ headless: true });
let bad = 0;
try {
  for (const size of SIZES) {
    for (const name of Object.keys(STATES)) {
      try {
        await shoot(browser, name, size);
      } catch (err) {
        bad++;
        console.log(`ERROR ${size.join("x")} ${name} ${String(err && err.message ? err.message : err).slice(0, 300)}`);
      }
    }
  }
} finally {
  await browser.close().catch(() => {});
}
console.log(`sheets: ${readdirSync(SHEETS).filter((f) => f.endsWith(".png")).length} pictures, ${bad} errors`);
process.exit(bad > 0 ? 2 : 0);
