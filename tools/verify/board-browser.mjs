// Browser checks for A2.3 (docs/adult-a2-plan.md section 11): the Requests tab of the Shop panel, its cards, the layout at 320, 360 and 390 wide (pixel
// ratio 1 and 2), a request finished by real taps in the room, the note over the room, the refill of a slot, and Kid Mode, which must show nothing of it.
// It also holds `shop-scroll`: the Shop panel's title, tabs and room picture stay fixed and only its list scrolls (a real mouse wheel, a real tap deep in the list),
// and `shop-touch`: the same on a phone (a mobile window with touch, real touch events sent a few pixels at a time), also on its side, and the page behind the panel never moves.
// `panel-touch` is the page-behind half of that for the other panels (Settings, Creature Book, Growth Forecast, Developer mode), in both modes where the panel exists.
// (By a run before the fix the Kid home page scrolls 358 px behind a panel at 740 x 360 and not at all on a portrait phone, so Kid Mode is tested for the page behind only on its side.)
//
// Run: node board-browser.mjs --base http://127.0.0.1:4173 [--only id1,id2] [--sizes 320x568@1,360x640@2] [--modes kid,adult]
// Exit: 0 when no check failed and at least one ran; 1 when any FAIL; 2 when the script broke (a requested --only id ran zero times,
// an unknown id, a bad flag, or a crash outside a check). A check that throws or times out prints a FAIL line, never a crash.
// The saves come from gen-saves-board (saves/board-<scenario>-<mode>.json, written beforehand). Expected values are literals here, worked out by hand from
// src/data/requests.ts, src/data/foods.ts and the scenarios in gen-saves-board.ts; the page's own functions are never used to compute them.
// The clock is frozen at T (Playwright's fake clock): to move time a check sets a new fixed time and runs the timers once (advance()).
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

const require = createRequire(process.env.PLAYWRIGHT_FROM ?? join(homedir(), "homelab-dashboard", "package.json"));
const { chromium } = require("playwright");

const OUT = process.env.VERIFY_OUT ?? join(tmpdir(), "broodkeep-verify");
const SAVES = join(OUT, "saves");

// Game time 2026-11-22T15:00:00Z (frozen), in ms.
const T = 1795359600000;
const MIN = 60_000;
const HOUR = 60 * MIN;

// Which modes each check runs in (the others are skipped for it).
const CHECK_MODES = {
  "board-tab": ["adult"],
  "board-cards": ["adult"],
  "board-fit": ["adult"],
  "board-tap": ["adult"],
  "shop-scroll": ["adult"],
  "shop-touch": ["adult"],
  "panel-touch": ["adult", "kid"],
  "board-live": ["adult"],
  "board-note": ["adult"],
  "board-kid": ["kid"],
};
const ALL_IDS = Object.keys(CHECK_MODES);
const ALL_MODES = ["kid", "adult"];
const DEFAULT_SIZES = [
  [320, 568, 1],
  [320, 568, 2],
  [360, 640, 1],
  [360, 640, 2],
  [390, 844, 1],
  [390, 844, 2],
];
// A check with windows of its own (used when --sizes is not given): the touch check also runs a phone on its side and a tall phone at ratio 3.
const CHECK_SIZES = {
  "shop-touch": [[320, 568, 2], [360, 640, 2], [390, 844, 3], [740, 360, 2], [844, 390, 3]],
  // Only windows where the home page can scroll behind the panel (a tall phone's cannot, so there is nothing to see move): two phones and one on its side.
  "panel-touch": [[320, 568, 2], [360, 640, 2], [740, 360, 2]],
};
// Checks that drive the page with a finger run in a mobile window (isMobile, hasTouch), which a desktop window is not.
const TOUCH_CHECKS = new Set(["shop-touch", "panel-touch"]);
const CHECK_TIMEOUT_MS = 120_000;

// The Requests tab as each saved game shows it: state, title, progress, note, the rewards' labels and the words shown on them ("+2", the item's name), the "+25%" mark, and the bar's translateX in percent. Worked out by hand
// from the prices (feed 2, field 3, job 3, fight 4, buy 5; a quarter more, rounded up, for the oldest past 3 days), the needs (feed 2, field 20, others 1)
// and the scenarios in gen-saves-board.ts.
const open = (title, progress, coins, bar, more = {}) => ({ state: "open", bonus: more.bonus ? "true" : "false", title, progress, note: more.note ?? null, reward: [`${coins} coins`, ...(more.item ? [`and ${more.item}`] : [])], shown: [`+${coins}`, ...(more.item ? [more.item] : [])], mark: more.bonus ? "+25%" : null, bar });
const done = (title, progress) => ({ state: "done", bonus: null, title, progress, note: null, reward: [], shown: [], mark: null, bar: null });
const empty = () => ({ state: "empty", bonus: null, title: null, progress: "A new request is on its way.", note: null, reward: [], shown: [], mark: null, bar: null });

const CARDS = {
  three: [open("Feed Meat ×2", "1 of 2 meals", 2, -50), open("20 minutes in the Sky field", "7 of 20 minutes", 3, -65), open("Finish a job at Bug meadow", "0 of 1 job", 3, -100, { item: "Stew" })],
  "types-b": [open("Win a fight", "0 of 1 win", 4, -100), open("Buy Feeding Mat", "0 of 1 purchase", 5, -100), open("Feed Pellets ×2", "0 of 2 meals", 2, -100, { item: "Wallpaper: Dusk" })],
  stale: [open("Feed Carrot ×2", "0 of 2 meals", 3, -100, { bonus: true }), open("Finish a job at Herb patch", "0 of 1 job", 3, -100), open("20 minutes in the Water field", "0 of 20 minutes", 3, -100)],
  longest: [open("Buy Wallpaper: Meadow", "0 of 1 purchase", 5, -100, { item: "Wallpaper: Dusk" }), open("20 minutes in the Water field", "0 of 20 minutes", 3, -100), open("Finish a job at Bug meadow", "0 of 1 job", 3, -100, { item: "Wallpaper: Meadow" })],
  done: [open("Feed Worm ×2", "0 of 2 meals", 2, -100), done("Done: +3 coins", "Next request in 12 min"), done("Done: +5 coins and Wallpaper: Dusk", "Next request in 1 min")],
  empty: [empty(), empty(), empty()],
  "undo-pending": [open("Buy Feeding Mat", "0 of 1 purchase", 5, -100, { note: "Bought. It counts when the undo is over." }), open("Feed Meat ×2", "0 of 2 meals", 2, -100), open("20 minutes in the Land field", "0 of 20 minutes", 3, -100)],
};
const BOARD_STATES = Object.keys(CARDS);

// ---------- small helpers (no closures in the page functions below: they are sent to the browser as source) ----------

const trimAll = (list) => list.map((s) => s.trim());

// Objects compare by content, not by the order their keys were written in.
function sortKeys(x) {
  if (Array.isArray(x)) return x.map(sortKeys);
  if (x !== null && typeof x === "object") return Object.fromEntries(Object.keys(x).sort().map((k) => [k, sortKeys(x[k])]));
  return x;
}

function expectEq(actual, expected, what) {
  const a = JSON.stringify(sortKeys(actual));
  const e = JSON.stringify(sortKeys(expected));
  if (a !== e) throw new Error(`${what}: expected ${e}, got ${a}`);
}

const oneLine = (text) => String(text).replace(/\s+/g, " ").slice(0, 500);

function withTimeout(promise, ms) {
  let timer;
  const expired = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`timed out after ${ms / 1000} s`)), ms);
  });
  return Promise.race([promise, expired]).finally(() => clearTimeout(timer));
}

// Runs in the page: writes the save into IndexedDB (db "broodkeep", store "kv", key "save").
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

// Runs in the page: reads the saved game back (plain JSON).
async function readSave() {
  const db = await new Promise((resolve, reject) => {
    const req = indexedDB.open("broodkeep", 1);
    req.onupgradeneeded = () => req.result.createObjectStore("kv");
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  const value = await new Promise((resolve, reject) => {
    const req = db.transaction("kv", "readonly").objectStore("kv").get("save");
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return JSON.parse(JSON.stringify(value === undefined ? null : value));
}

// Runs in the page: every card of the Requests list, as plain data (what a player sees: the words, the numbers, the reward, the bar's fill).
function readCards() {
  return [...document.querySelectorAll(".req-list > .req-card")].map((card) => {
    const text = (selector) => card.querySelector(selector)?.textContent.trim() ?? null;
    const fill = card.querySelector(".req-bar .fill");
    const m = fill ? /translateX\((-?[\d.]+)%\)/.exec(fill.getAttribute("style") ?? "") : null;
    return {
      state: card.getAttribute("data-state"),
      bonus: card.getAttribute("data-bonus"),
      title: text(".req-title"),
      progress: text(".req-progress"),
      note: text(".req-note"),
      reward: [...card.querySelectorAll(".req-reward .chip")].map((chip) => chip.getAttribute("aria-label")),
      shown: [...card.querySelectorAll(".req-reward .chip")].map((chip) => chip.textContent.trim()), // what the chip says on screen, which its label must agree with
      mark: text(".req-bonus"),
      bar: m ? Math.round(parseFloat(m[1]) * 10) / 10 : null,
    };
  });
}

// Runs in the page: the page does not scroll sideways, the panel does not either, and nothing in it ends past the window's width.
function fitScrollProblems() {
  const iw = window.innerWidth;
  const problems = [];
  const doc = document.documentElement;
  if (doc.scrollWidth > iw) problems.push(`page scrollWidth ${doc.scrollWidth} > innerWidth ${iw}`);
  const panel = document.querySelector(".panel");
  if (!panel) return ["no panel on the screen"];
  if (panel.scrollWidth > panel.clientWidth) problems.push(`panel scrollWidth ${panel.scrollWidth} > clientWidth ${panel.clientWidth}`);
  const list = document.querySelector(".shop-scroll");
  if (list && list.scrollWidth > list.clientWidth) problems.push(`list scrollWidth ${list.scrollWidth} > clientWidth ${list.clientWidth}`);
  // A box inside an element that clips its overflow (the bar's moving fill) is judged by that element, whose own box is measured; a rect ignores the clip.
  const clippedAbove = (el) => {
    for (let a = el.parentElement; a && a !== panel; a = a.parentElement) {
      const o = getComputedStyle(a).overflowX;
      if (o === "hidden" || o === "clip") return true;
    }
    return false;
  };
  for (const el of panel.querySelectorAll("*")) {
    if (clippedAbove(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.width > 0 && (r.right > iw + 0.5 || r.left < -0.5)) problems.push(`${el.tagName.toLowerCase()}.${el.getAttribute("class") ?? ""} spans ${Math.round(r.left)} to ${Math.round(r.right)} in a window ${iw} wide`);
  }
  return problems.slice(0, 5);
}

// Runs in the page: every text line of the panel's parts sits inside its own element's box (measured with a Range), inside its card, and inside the window.
function fitClipProblems() {
  const iw = window.innerWidth;
  const problems = [];
  const parts = [...document.querySelectorAll(".req-card, .shop-card, .shop-tabs, .shop-undo, .shop-wallet, .panel-head, .shop-hint")];
  if (parts.length === 0) return { problems: ["nothing to measure on the screen"], parts: 0, lines: 0 };
  let lines = 0;
  for (const part of parts) {
    const partBox = part.getBoundingClientRect();
    for (const el of [part, ...part.querySelectorAll("*")]) {
      const hasText = [...el.childNodes].some((n) => n.nodeType === Node.TEXT_NODE && n.textContent.trim() !== "");
      if (!hasText) continue;
      const box = el.getBoundingClientRect();
      const range = document.createRange();
      range.selectNodeContents(el);
      for (const r of range.getClientRects()) {
        if (r.width === 0) continue;
        lines += 1;
        if (r.left < box.left - 0.5 || r.right > box.right + 0.5 || r.right > partBox.right + 0.5 || r.left < partBox.left - 0.5 || r.right > iw + 0.5) {
          problems.push(`${el.tagName.toLowerCase()} "${el.textContent.trim().slice(0, 40)}" line ends at ${Math.round(r.right)} in a box ending at ${Math.round(box.right)}`);
        }
      }
    }
  }
  return { problems: problems.slice(0, 5), parts: parts.length, lines };
}

// Runs in the page: every button of the panel is at least 44 px high and wide; a card holds no button, link or tab stop (a card only shows the board).
function tapProblems() {
  const buttons = [...document.querySelectorAll(".panel button")];
  const problems = [];
  for (const b of buttons) {
    const r = b.getBoundingClientRect();
    if (r.height < 44 - 0.5 || r.width < 44 - 0.5) problems.push(`"${b.textContent.trim().slice(0, 30)}" is ${Math.round(r.width)} x ${Math.round(r.height)}`);
  }
  const inCards = document.querySelectorAll(".req-card button, .req-card a, .req-card [tabindex]").length;
  if (inCards > 0) problems.push(`${inCards} button(s), link(s) or tab stop(s) inside request cards`);
  return { problems: problems.slice(0, 5), buttons: buttons.length };
}

// Runs in the page: where the Shop panel's parts are (boxes in window pixels), how far its list is scrolled, and whether the panel or the page behind it scrolled.
function shopBoxes() {
  const box = (selector) => {
    const el = document.querySelector(selector);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { top: r.top, bottom: r.bottom, left: r.left, right: r.right };
  };
  const list = document.querySelector(".shop-scroll");
  const panel = document.querySelector(".panel");
  return {
    panel: box(".panel"),
    head: box(".panel-head"),
    tabs: box(".shop-tabs"),
    preview: box(".shop-preview"),
    undo: box(".shop-undo"),
    top: box(".shop-top"),
    list: box(".shop-scroll"),
    lastCard: box(".shop-scroll > ul > li:last-child, .shop-scroll > ul > .req-card:last-child"),
    lastButton: box(".shop-scroll > ul > li:last-child .card-btn"),
    listTop: list ? list.scrollTop : null,
    listMax: list ? list.scrollHeight - list.clientHeight : null,
    panelOverflow: panel ? panel.scrollHeight - panel.clientHeight : null,
    panelScroll: panel ? panel.scrollTop : null,
    pageScroll: document.scrollingElement.scrollTop,
  };
}

// ---------- page helpers (run in Node, drive the page with real clicks and keys) ----------

const navButton = (page, name) => page.locator(`.nav button[aria-label="${name}"]`);
const panel = (page) => page.locator('section[aria-label="Shop"]');
const tabButton = (page, name) => page.locator(".shop-tabs").getByRole("button", { name, exact: true });
const pressed = (page) => page.locator(".shop-tabs button").evaluateAll((bs) => bs.map((b) => [b.textContent.trim(), b.getAttribute("aria-pressed")]));
const feedButton = (page) => page.locator('button[aria-label="Feed"]');
const foodTray = (page) => page.locator('[aria-label="Choose food"]');
const note = (page) => page.locator("p.reason");
const coinChip = (page) => page.locator('.strip-bag [aria-label$=" coins"]');

// A real mouse wheel over the list, far more than it can scroll.
async function wheelList(page) {
  const b = await page.locator(".shop-scroll").boundingBox();
  await page.mouse.move(b.x + b.width / 2, b.y + Math.min(b.height / 2, 40));
  await page.mouse.wheel(0, 100000);
  // (a smooth scroll takes a moment: wait until two reads of the list's position agree)
  let last = -1;
  for (let i = 0; i < 20; i++) {
    await page.waitForTimeout(100);
    const now = await page.locator(".shop-scroll").evaluate((el) => el.scrollTop);
    if (now === last) break;
    last = now;
  }
  // A second wheel, a new gesture, with the list at its end: the first one is latched to the list whatever the rest of the delta, so only this one
  // would go on to the page behind if the list let it.
  await page.waitForTimeout(600);
  await page.mouse.wheel(0, 3000);
  await page.waitForTimeout(500);
}

async function openShop(page) {
  await navButton(page, "Shop").click({ timeout: 5000 });
  await panel(page).waitFor({ state: "visible", timeout: 5000 });
  await page.waitForTimeout(200);
}

async function openRequests(page) {
  await openShop(page);
  await tabButton(page, "Requests").click({ timeout: 5000 });
  await page.locator(".req-list").waitFor({ state: "visible", timeout: 5000 });
  await page.waitForTimeout(200);
}

// A finger on the screen, as the browser's protocol sends one (real touch events, the same a phone makes): down at (x, y), moved in steps to (x, y + dy), a short
// pause with the finger still down (so nothing flings), up. `flick`: fewer, faster steps and no pause, so the browser flings, then a wait for the fling to end.
async function touchDrag(cdp, x, y, dy, { flick = false } = {}) {
  const steps = flick ? 5 : 12;
  const gap = flick ? 8 : 16;
  const send = (type, points) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: points });
  await send("touchStart", [{ x, y }]);
  for (let i = 1; i <= steps; i++) {
    await send("touchMove", [{ x, y: y + (dy * i) / steps }]);
    await new Promise((r) => setTimeout(r, gap));
  }
  if (!flick) await new Promise((r) => setTimeout(r, 120));
  await send("touchEnd", []);
  await new Promise((r) => setTimeout(r, flick ? 1200 : 400));
}

// Throws when a box (from shopBoxes) is not where it was.
function boxMoved(a, b, what) {
  for (const k of ["top", "bottom", "left", "right"]) if (Math.abs(a[k] - b[k]) > 0.5) throw new Error(`${what} moved: ${k} ${Math.round(a[k])} to ${Math.round(b[k])}`);
}

// One meal of Pellets, by real taps: the Feed button, then the food.
async function eatPellet(page) {
  await feedButton(page).click({ timeout: 5000 });
  await foodTray(page).waitFor({ state: "visible", timeout: 5000 });
  await page.waitForTimeout(300);
  await foodTray(page).locator('button[aria-label="Pellets"]').click({ timeout: 5000 });
  await page.waitForTimeout(300);
}

// Moves the frozen game clock `ms` after T and runs the page's timers once (the one-second tick and the redraw).
async function advance(page, ms) {
  await page.clock.setFixedTime(T + ms);
  await page.clock.runFor(1000);
  await page.waitForTimeout(100);
}

// Lets the page's 600 ms save timer fire, then reads the saved game until two reads 250 ms apart agree (a write that is still on its way
// would make them differ, so a stale read cannot pass for the answer).
async function savedGame(page) {
  await page.clock.runFor(1000);
  let before = JSON.stringify(await page.evaluate(readSave));
  for (let i = 0; i < 8; i++) {
    await page.waitForTimeout(250);
    const now = JSON.stringify(await page.evaluate(readSave));
    if (now === before) return JSON.parse(now);
    before = now;
  }
  throw new Error("the saved game kept changing for two seconds");
}

const seedOf = (scenario, mode) => JSON.parse(readFileSync(join(SAVES, `board-${scenario}-${mode}.json`), "utf8"));

// Starts a game in the page's own origin: the saved game is written to IndexedDB from a stub page, then the app loads and finds it.
async function openGame(env, scenario, track) {
  const context = await env.browser.newContext({
    viewport: { width: env.w, height: env.h },
    deviceScaleFactor: env.dpr,
    ...(env.touch ? { isMobile: true, hasTouch: true } : {}),
    locale: "en-US",
    timezoneId: "UTC",
    serviceWorkers: "block",
  });
  track.push(context);
  const page = await context.newPage();
  const errors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(`console: ${msg.text()}`);
  });
  page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));
  await page.clock.install({ time: T });
  await page.clock.setFixedTime(T);
  const stub = `${env.base}/seed`;
  await page.route(stub, (route) => route.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html><title>seed</title>" }));
  await page.goto(stub);
  await page.evaluate(seedSave, seedOf(scenario, env.mode));
  await page.goto(`${env.base}/`);
  await page.getByRole("button", { name: "Habitat", exact: true }).waitFor({ timeout: 20000 });
  await page.waitForTimeout(300);
  return { page, errors };
}

// ---------- the checks: each returns a detail string, or throws ----------

const checks = {
  "board-tab": async (openScenario) => {
    const { page } = await openScenario("three");
    const before = await savedGame(page);
    await openShop(page);
    // It opens on Items, as the shop always did.
    expectEq(await pressed(page), [["Items", "true"], ["Requests", "false"]], "the tabs when the shop opens");
    expectEq(await page.locator(".shop-card").count(), 14, "item cards on the Items tab");
    expectEq(await page.locator(".req-list").count(), 0, "request lists on the Items tab");
    // A tap on Requests shows the three cards and takes the item cards away.
    await tabButton(page, "Requests").click({ timeout: 5000 });
    await page.locator(".req-list").waitFor({ state: "visible", timeout: 5000 });
    expectEq(await pressed(page), [["Items", "false"], ["Requests", "true"]], "the tabs after a tap on Requests");
    expectEq(await page.locator(".req-card").count(), 3, "request cards");
    expectEq(await page.locator(".shop-card").count(), 0, "item cards on the Requests tab");
    expectEq(await page.locator('ul[aria-label="Requests"]').count(), 1, "the list's name for a screen reader");
    expectEq(await page.locator('.shop-tabs[role="group"][aria-label="Show"]').count(), 1, "the tab group's name for a screen reader");
    // Keys: Enter and Space on the focused tab buttons, and the focus stays on the button.
    await tabButton(page, "Items").focus();
    await page.keyboard.press("Enter");
    await page.locator(".shop-card").first().waitFor({ state: "visible", timeout: 5000 });
    expectEq(await pressed(page), [["Items", "true"], ["Requests", "false"]], "the tabs after Enter on Items");
    expectEq(await page.evaluate(() => document.activeElement?.textContent?.trim()), "Items", "the focused element after Enter");
    await tabButton(page, "Requests").focus();
    await page.keyboard.press("Space");
    await page.locator(".req-list").waitFor({ state: "visible", timeout: 5000 });
    expectEq(await pressed(page), [["Items", "false"], ["Requests", "true"]], "the tabs after Space on Requests");
    expectEq(await page.evaluate(() => document.activeElement?.textContent?.trim()), "Requests", "the focused element after Space");
    // Close and open again: Items first, as before.
    await page.getByRole("button", { name: "Close", exact: true }).click();
    await panel(page).waitFor({ state: "hidden", timeout: 5000 });
    await openShop(page);
    expectEq(await pressed(page), [["Items", "true"], ["Requests", "false"]], "the tabs when the shop opens again");
    // Looking at the board changes nothing in the save.
    expectEq(await savedGame(page), before, "the saved game after switching tabs");
    // The undo is on both tabs (a purchase can be a request's): it works from the Requests tab, and is gone from Items after it.
    const bought = await openScenario("undo-pending");
    await openShop(bought.page);
    expectEq(await bought.page.locator(".shop-undo").count(), 1, "undo bars on Items with a purchase 5 seconds old");
    await tabButton(bought.page, "Requests").click({ timeout: 5000 });
    await bought.page.locator(".req-list").waitFor({ state: "visible", timeout: 5000 });
    expectEq(await bought.page.locator(".shop-undo").count(), 1, "undo bars on the Requests tab");
    await bought.page.locator(".shop-undo button").click({ timeout: 5000 });
    await bought.page.locator(".shop-undo").waitFor({ state: "hidden", timeout: 5000 });
    const undone = await savedGame(bought.page);
    expectEq([undone.coins, undone.inventory.fiber, undone.inventory.herb, undone.owned, undone.lastBuy], [100, 10, 5, [], null], "the save after an Undo tapped on the Requests tab (25 coins, 3 Fiber, 2 Herbs given back)");
    expectEq(undone.board.open.map((r) => [r.id, r.have]), [[2, 0], [3, 0], [4, 0]], "the board after the undo (no request was paid or lost)");
    await tabButton(bought.page, "Items").click({ timeout: 5000 });
    await bought.page.locator(".shop-card").first().waitFor({ state: "visible", timeout: 5000 });
    expectEq(await bought.page.locator(".shop-undo").count(), 0, "undo bars on Items after the undo");
    return "the shop opens on Items (14 cards), Requests shows the 3 cards, Enter and Space switch with the focus kept, closing resets to Items, the undo is on both tabs and works from Requests, and switching tabs leaves the save untouched";
  },

  "board-cards": async (openScenario) => {
    let cards = 0;
    for (const scenario of BOARD_STATES) {
      const { page } = await openScenario(scenario);
      await openRequests(page);
      expectEq(await page.evaluate(readCards), CARDS[scenario], `${scenario}: the cards`);
      expectEq(await page.locator(".req-card .req-reward").evaluateAll((els) => els.map((e) => e.getAttribute("role") + ":" + e.getAttribute("aria-label"))), CARDS[scenario].filter((c) => c.state === "open").map(() => "group:Reward"), `${scenario}: the reward groups' names`);
      cards += CARDS[scenario].length;
    }
    return `${BOARD_STATES.length} boards, ${cards} cards: the words, the exact numbers, the coin reward and the item (each as labelled and as shown), the 25% mark, the bar's fill, the done slots with their minutes and the undo note read as literals`;
  },

  "board-fit": async (openScenario) => {
    let lines = 0;
    let panels = 0;
    const views = [...BOARD_STATES.map((s) => [s, true]), ["rich", false]]; // every Requests state, and the Items tab with its new row of tabs
    for (const [scenario, requests] of views) {
      const { page } = await openScenario(scenario);
      if (requests) await openRequests(page);
      else await openShop(page);
      const scroll = await page.evaluate(fitScrollProblems);
      if (scroll.length > 0) throw new Error(`${scenario}: ${scroll.join("; ")}`);
      const clip = await page.evaluate(fitClipProblems);
      if (clip.problems.length > 0) throw new Error(`${scenario}: ${clip.problems.join("; ")}`);
      if (clip.lines === 0) throw new Error(`${scenario}: no text was measured`);
      lines += clip.lines;
      panels += 1;
    }
    return `${panels} panels, ${lines} text lines: no sideways scroll, every line inside its own box, its card and the window`;
  },

  "board-tap": async (openScenario) => {
    let buttons = 0;
    for (const scenario of ["three", "empty", "undo-pending"]) {
      const { page } = await openScenario(scenario);
      await openShop(page);
      for (const view of ["Items", "Requests"]) {
        await tabButton(page, view).click({ timeout: 5000 });
        await page.waitForTimeout(150);
        const found = await page.evaluate(tapProblems);
        if (found.problems.length > 0) throw new Error(`${scenario} ${view}: ${found.problems.join("; ")}`);
        if (found.buttons < 3) throw new Error(`${scenario} ${view}: only ${found.buttons} button(s) measured (Close and the two tabs at least)`);
        buttons += found.buttons;
      }
    }
    return `${buttons} buttons in 6 views, each at least 44 px high and wide, and no button or tab stop inside a request card`;
  },

  "shop-scroll": async (openScenario, env) => {
    const LIST_MIN = 100; // px of list a window must show under the fixed part: a card's name and its price line at the least
    const same = (a, b, what) => {
      for (const k of ["top", "bottom", "left", "right"]) if (Math.abs(a[k] - b[k]) > 0.5) throw new Error(`${what} moved: ${k} ${Math.round(a[k])} to ${Math.round(b[k])}`);
    };
    let views = 0;
    let scrolled = 0;
    for (const scenario of ["rich", "undo-pending"]) {
      const { page } = await openScenario(scenario);
      await openShop(page);
      for (const view of ["Items", "Requests"]) {
        const at = `${scenario} ${view}`;
        if (view === "Requests") await tabButton(page, "Requests").click({ timeout: 5000 });
        await page.waitForTimeout(200);
        const before = await page.evaluate(shopBoxes);
        if (before.panelOverflow > 0.5) throw new Error(`${at}: the panel itself scrolls (${before.panelOverflow} px more than its window)`);
        expectEq([before.panel.top, before.panel.bottom], [0, env.h], `${at}: the panel's box`);
        if (before.top.bottom > before.list.top + 0.5) throw new Error(`${at}: the fixed part (ends at ${Math.round(before.top.bottom)}) overlaps the list (starts at ${Math.round(before.list.top)})`);
        if (before.list.bottom > env.h + 0.5) throw new Error(`${at}: the list ends at ${Math.round(before.list.bottom)}, past the window (${env.h})`);
        const shown = before.list.bottom - before.list.top;
        if (shown < LIST_MIN) throw new Error(`${at}: the window shows ${Math.round(shown)} px of the list, fewer than ${LIST_MIN}`);
        if ((view === "Items") !== (before.preview !== null)) throw new Error(`${at}: the room picture is ${before.preview === null ? "missing" : "shown"}`);
        if ((scenario === "undo-pending") !== (before.undo !== null)) throw new Error(`${at}: the Undo bar is ${before.undo === null ? "missing" : "shown"}`);
        if (view === "Items" && !(before.listMax > 0)) throw new Error(`${at}: the 9 items fit the list's window, so nothing was tested`);
        // A list opens at its top, also after another tab's list was scrolled (the scroller is a new box for each tab).
        if (before.listTop !== 0) throw new Error(`${at}: the list opens scrolled to ${before.listTop}, not at its top`);
        if (before.listMax > 0) {
          scrolled += 1;
          await wheelList(page);
          const after = await page.evaluate(shopBoxes);
          if (!(after.listTop > 0) || Math.abs(after.listTop - after.listMax) > 1) throw new Error(`${at}: a mouse wheel moved the list to ${after.listTop} of ${after.listMax}, not the end`);
          for (const part of ["head", "tabs", "preview", "undo"]) if (before[part] !== null) same(before[part], after[part], `${at}: the ${part}`);
          // (The page behind may already be scrolled a little, by the tap that opened the panel: the wheel must not move it further.)
          expectEq([after.panelScroll, after.pageScroll], [0, before.pageScroll], `${at}: the panel's and the page's scroll after the wheel`);
          if (after.lastCard.bottom > after.list.bottom - 16 + 0.5) throw new Error(`${at}: the last card ends at ${Math.round(after.lastCard.bottom)}, less than 16 px above the list's end (${Math.round(after.list.bottom)})`);
          if (view === "Items") {
            if (after.lastButton === null) throw new Error(`${at}: the last card has no button`);
            if (after.lastButton.top < after.list.top - 0.5 || after.lastButton.bottom > after.list.bottom - 16 + 0.5) throw new Error(`${at}: the last card's button (${Math.round(after.lastButton.top)} to ${Math.round(after.lastButton.bottom)}) is not inside the list (${Math.round(after.list.top)} to ${Math.round(after.list.bottom)})`);
          }
        }
        if (view === "Items") {
          // The point of it: from deep in the list a real tap on an item changes the room picture, which is still on the screen.
          await page.locator(".shop-card").last().locator(".shop-pick").click({ timeout: 5000 });
          await page.waitForTimeout(200);
          expectEq(await page.locator(".shop-preview").getAttribute("aria-label"), "Your room with Playroom", `${at}: the room picture after a tap on the last item (the last of the fourteen is the Playroom, a room: its picture is of the room itself)`);
          const tapped = await page.evaluate(shopBoxes);
          same(before.preview, tapped.preview, `${at}: the room picture after the tap`);
        }
        views += 1;
      }
    }
    if (scrolled < 2) throw new Error(`only ${scrolled} of ${views} views had a list that scrolls: the two Items views must`);
    return `${views} views (Items and Requests, with and without the Undo bar; ${scrolled} had a list long enough to scroll): every list opens at its top, the panel does not scroll, the list shows at least ${LIST_MIN} px, a mouse wheel scrolls only the list to its end with 16 px or more below the last card and its button inside the list, the title, tabs, room picture and Undo bar stay where they were, the page behind does not move further, and a tap on the last item changes the room picture still in view`;
  },

  "shop-touch": async (openScenario, env) => {
    const LIST_MIN = 100; // px of list a window must show: a card's name and its price line at the least (a phone on its side too)
    const PARTS = ["head", "tabs", "preview", "undo"];
    let views = 0;
    let scrolledViews = 0;
    let fixedDrags = 0;
    let skippedDrags = 0;
    let pageRoom = 0;
    for (const [scenario, view] of [["rich", "Items"], ["rich", "Requests"], ["undo-pending", "Items"]]) {
      const at = `${scenario} ${view}`;
      const { page } = await openScenario(scenario);
      const cdp = await page.context().newCDPSession(page);
      // The control: a finger dragged on the plain home page (the gutter beside the room) scrolls it, where it can scroll at all. If it did not, the tool
      // would not be driving the page, and every "did not move" below would pass for nothing.
      const room = await page.evaluate(() => document.scrollingElement.scrollHeight - innerHeight);
      if (room > 1) {
        pageRoom += 1;
        await touchDrag(cdp, 8, Math.round(env.h / 2), -Math.min(Math.round(room), 300));
        const moved = await page.evaluate(() => document.scrollingElement.scrollTop);
        if (!(moved > 0)) throw new Error(`${at}: a finger dragged up on the home page (${Math.round(room)} px longer than its window) did not scroll it: the touch tool is not driving the page`);
      }
      await navButton(page, "Shop").tap({ timeout: 5000 });
      await panel(page).waitFor({ state: "visible", timeout: 5000 });
      if (view === "Requests") {
        await tabButton(page, "Requests").tap({ timeout: 5000 });
        await page.locator(".req-list").waitFor({ state: "visible", timeout: 5000 });
      }
      await page.waitForTimeout(400);
      const before = await page.evaluate(shopBoxes);
      if (before.panelOverflow > 0.5) throw new Error(`${at}: the panel itself scrolls (${before.panelOverflow} px more than its window)`);
      if (before.list.bottom > env.h + 0.5) throw new Error(`${at}: the list ends at ${Math.round(before.list.bottom)}, past the window (${env.h})`);
      const shown = before.list.bottom - before.list.top;
      if (shown < LIST_MIN) throw new Error(`${at}: the window shows ${Math.round(shown)} px of the list, fewer than ${LIST_MIN}`);
      if ((view === "Items") !== (before.preview !== null)) throw new Error(`${at}: the room picture is ${before.preview === null ? "missing" : "shown"}`);
      if ((scenario === "undo-pending") !== (before.undo !== null)) throw new Error(`${at}: the Undo bar is ${before.undo === null ? "missing" : "shown"}`);
      if (view === "Items" && !(before.listMax > 0)) throw new Error(`${at}: the 9 items fit the list's window, so nothing was tested`);
      if (before.listTop !== 0) throw new Error(`${at}: the list opens scrolled to ${before.listTop}, not at its top`);
      const pageBase = before.pageScroll; // (the tap that opened the panel may have scrolled the page behind a little)
      const stayed = (after, what) => {
        for (const part of PARTS) if (before[part] !== null) boxMoved(before[part], after[part], `${at}: the ${part} ${what}`);
      };

      // A finger dragged up on the list scrolls the list, a step at a time, to its end; nothing else moves.
      let now = before;
      if (before.listMax > 0) {
        scrolledViews += 1;
        let guard = 0;
        while (now.listTop < now.listMax - 1) {
          if (guard++ >= 40) throw new Error(`${at}: 40 finger drags did not take the list to its end (at ${now.listTop} of ${now.listMax})`);
          const h = now.list.bottom - now.list.top;
          await touchDrag(cdp, Math.round((now.list.left + now.list.right) / 2), Math.round(now.list.bottom - 20), -Math.round(h * 0.8));
          const next = await page.evaluate(shopBoxes);
          if (!(next.listTop > now.listTop)) throw new Error(`${at}: a finger dragged up on the list did not scroll it (stayed at ${now.listTop} of ${now.listMax})`);
          now = next;
        }
        stayed(now, "after the list was scrolled by a finger");
        expectEq([now.panelScroll, now.pageScroll], [0, pageBase], `${at}: the panel's and the page's scroll after the finger drags on the list`);
        if (now.lastCard.bottom > now.list.bottom - 16 + 0.5) throw new Error(`${at}: the last card ends at ${Math.round(now.lastCard.bottom)}, less than 16 px above the list's end (${Math.round(now.list.bottom)})`);
        if (view === "Items" && (now.lastButton === null || now.lastButton.top < now.list.top - 0.5 || now.lastButton.bottom > now.list.bottom - 16 + 0.5)) throw new Error(`${at}: the last card's button is not inside the list`);
      }

      // A finger dragged on a part that never scrolls (title row, tabs, room picture, Undo bar), up and then down: the page behind the panel must not move
      // (it is scrollable in some windows, and a drag on a fixed layer is handed to it), and the parts and the list stay where they were.
      for (const part of PARTS) {
        if (before[part] === null) continue;
        const b = before[part];
        const x = Math.round((b.left + b.right) / 2);
        const y = Math.round((b.top + b.bottom) / 2);
        for (const want of [-120, 120]) {
          const dy = Math.max(1 - y, Math.min(env.h - 1 - y, want)); // (the finger stays inside the window)
          if (Math.abs(dy) < 20) {
            skippedDrags += 1; // (the part is within 20 px of the window's edge in that direction: counted, and said in the result)
            continue;
          }
          await touchDrag(cdp, x, y, dy);
          const after = await page.evaluate(shopBoxes);
          expectEq([after.pageScroll, after.panelScroll, after.listTop], [pageBase, 0, now.listTop], `${at}: the page's, the panel's and the list's scroll after a finger dragged ${dy} px on the ${part}`);
          stayed(after, `after a finger dragged ${dy} px on it`);
          fixedDrags += 1;
        }
      }

      if (view === "Items") {
        // The point of it: from deep in the list a real tap on an item changes the room picture, which is still on the screen, and nothing scrolled.
        await page.locator(".shop-card").last().locator(".shop-pick").tap({ timeout: 5000 });
        await page.waitForTimeout(300);
        expectEq(await page.locator(".shop-preview").getAttribute("aria-label"), "Your room with Playroom", `${at}: the room picture after a tap on the last item (the last of the fourteen is the Playroom, a room: its picture is of the room itself)`);
        const tapped = await page.evaluate(shopBoxes);
        expectEq([tapped.pageScroll, tapped.panelScroll], [pageBase, 0], `${at}: the page's and the panel's scroll after the tap`);
        stayed(tapped, "after the tap");
        // A quick flick down the list (a fling) moves the list and nothing else.
        const h = tapped.list.bottom - tapped.list.top;
        await touchDrag(cdp, Math.round((tapped.list.left + tapped.list.right) / 2), Math.round(tapped.list.top + 20), Math.round(h * 0.6), { flick: true });
        const flung = await page.evaluate(shopBoxes);
        if (!(flung.listTop < tapped.listTop)) throw new Error(`${at}: a quick flick down the list did not move it (stayed at ${tapped.listTop})`);
        expectEq([flung.pageScroll, flung.panelScroll], [pageBase, 0], `${at}: the page's and the panel's scroll after the flick`);
        stayed(flung, "after the flick");
      }
      views += 1;
    }
    if (scrolledViews < 2) throw new Error(`only ${scrolledViews} of ${views} views had a list that scrolls: the two Items views must`);
    return `${views} views by touch (${pageRoom} with a home page that scrolls, which a control finger scrolled first): the list shows at least ${LIST_MIN} px, a finger scrolls only the list to its end (${scrolledViews} lists), ${fixedDrags} finger drags up and down (${skippedDrags} skipped for being within 20 px of the window's edge) on the title, tabs, room picture and Undo bar leave the page behind, the panel, the list and those parts where they were, a tap on the last item changes the room picture still in view, and a flick scrolls only the list`;
  },

  "panel-touch": async (openScenario, env) => {
    // Settings, the Creature Book, the Growth Forecast (Adult Mode only) and Developer mode (seven taps on the version line in Settings) each scroll as a whole inside a
    // fixed panel. A finger dragged on one must scroll the panel and never the home page behind it, also at the panel's top and its end, where a finger hands the rest on.
    const labels = env.mode === "adult" ? ["Settings", "Creature Book", "Growth Forecast", "Developer mode"] : ["Settings", "Creature Book", "Developer mode"];
    const openSettings = (page) => page.getByRole("button", { name: "Settings", exact: true }).tap({ timeout: 5000 });
    const opens = {
      "Settings": openSettings,
      "Creature Book": (page) => page.getByRole("button", { name: /^Creature Book/ }).tap({ timeout: 5000 }),
      "Growth Forecast": (page) => page.getByRole("button", { name: /^Growth Forecast/ }).tap({ timeout: 5000 }),
      "Developer mode": async (page) => {
        await openSettings(page);
        await page.locator('section.panel[aria-label="Settings"]').waitFor({ state: "visible", timeout: 5000 });
        for (let i = 0; i < 7; i++) await page.locator("button.version").tap({ timeout: 5000 });
      },
    };
    const scrollState = () => {
      const p = document.querySelector(".panel");
      return { page: document.scrollingElement.scrollTop, pageMax: document.scrollingElement.scrollHeight - innerHeight, panel: p ? p.scrollTop : null, panelMax: p ? p.scrollHeight - p.clientHeight : null };
    };
    let withRoom = 0;
    let pageDrags = 0;
    for (const label of labels) {
      const at = `${env.mode} ${label}`;
      const { page } = await openScenario("three");
      const cdp = await page.context().newCDPSession(page);
      // The control: a finger dragged on the plain home page (the gutter beside the room) scrolls it. If it did not, the tool would not be driving the page, and every
      // "did not move" below would pass for nothing. A window where the home page cannot scroll has nothing to move: allowed in Kid Mode on a tall phone, never in Adult Mode.
      const room = await page.evaluate(() => document.scrollingElement.scrollHeight - innerHeight);
      if (room > 1) {
        withRoom += 1;
        await touchDrag(cdp, 8, Math.round(env.h / 2), -Math.min(Math.round(room), 300));
        const moved = await page.evaluate(() => document.scrollingElement.scrollTop);
        if (!(moved > 0)) throw new Error(`${at}: a finger dragged up on the home page (${Math.round(room)} px longer than its window) did not scroll it: the touch tool is not driving the page`);
      } else if (env.mode === "adult") {
        throw new Error(`${at}: the home page cannot scroll in a ${env.w} x ${env.h} window, so nothing would be tested`);
      }
      await opens[label](page);
      await page.locator(`section.panel[aria-label="${label}"]`).waitFor({ state: "visible", timeout: 5000 });
      await page.waitForTimeout(400);
      // The home page is put half-way down (so a push either way shows) after the panel opened (the tap that opened it may have scrolled the page a little).
      const opened = await page.evaluate(scrollState);
      if (!(opened.panelMax > 0)) throw new Error(`${at}: the panel's content fits its window (${opened.panelMax} px to scroll), so nothing was tested`);
      if (opened.panel !== 0) throw new Error(`${at}: the panel opens scrolled to ${opened.panel}, not at its top`);
      if (room > 1) {
        const mid = Math.round(opened.pageMax / 2);
        await page.evaluate((y) => window.scrollTo(0, y), mid);
        const set = await page.evaluate(scrollState);
        if (Math.abs(set.page - mid) > 0.5) throw new Error(`${at}: the page could not be put at ${mid} (it is at ${set.page}) before the finger drags`);
      }
      const pageBase = (await page.evaluate(scrollState)).page;
      const unmoved = (s, what) => {
        if (Math.abs(s.page - pageBase) > 0.5) throw new Error(`${at}: the page behind moved from ${Math.round(pageBase)} to ${Math.round(s.page)} ${what}`);
      };
      const x = Math.round(env.w / 2);
      const span = Math.round(env.h * 0.4);

      // A finger dragged up on the panel scrolls the panel.
      await touchDrag(cdp, x, Math.round(env.h * 0.8), -span);
      let s = await page.evaluate(scrollState);
      if (!(s.panel > 0)) throw new Error(`${at}: a finger dragged up on the panel did not scroll it (stayed at ${s.panel} of ${Math.round(s.panelMax)})`);
      unmoved(s, "after a finger dragged up on the panel");
      // At the panel's end a finger dragged further up has nothing left to scroll: it must not be handed to the page.
      await page.evaluate(() => {
        const p = document.querySelector(".panel");
        p.scrollTop = p.scrollHeight;
      });
      s = await page.evaluate(scrollState);
      if (Math.abs(s.panel - s.panelMax) > 1) throw new Error(`${at}: the panel could not be put at its end (at ${s.panel} of ${s.panelMax})`);
      await touchDrag(cdp, x, Math.round(env.h * 0.8), -span);
      s = await page.evaluate(scrollState);
      unmoved(s, "after a finger dragged up past the panel's end");
      // Likewise at its top, with a finger dragged down.
      await page.evaluate(() => {
        document.querySelector(".panel").scrollTop = 0;
      });
      s = await page.evaluate(scrollState);
      if (s.panel !== 0) throw new Error(`${at}: the panel could not be put at its top (at ${s.panel})`);
      await touchDrag(cdp, x, Math.round(env.h * 0.3), span);
      s = await page.evaluate(scrollState);
      unmoved(s, "after a finger dragged down at the panel's top");
      if (s.panel !== 0) throw new Error(`${at}: the panel moved to ${s.panel} when a finger dragged down at its top`);
      if (room > 1) pageDrags += 3; // (a page that cannot scroll cannot move: those drags only tested the panel)
    }
    return `${labels.length} panels by touch in ${env.mode} mode: a finger scrolls the panel; ${withRoom} had a home page that scrolls (a control finger scrolled it first), and on those ${pageDrags} drags (up in the panel, up past its end, down at its top) leave the page behind where it was`;
  },

  "board-live": async (openScenario) => {
    // Two real meals of Pellets finish the request for them: it pays at the second, once, and its slot waits.
    const { page } = await openScenario("live-feed");
    expectEq(await coinChip(page).first().getAttribute("aria-label"), "12 coins", "the HUD's coins before");
    await eatPellet(page);
    let saved = await savedGame(page);
    expectEq([saved.coins, saved.board.open.map((r) => [r.id, r.have]), saved.board.waits.length, saved.board.done], [12, [[5, 1]], 2, 2], "after the first meal: coins, the request, the waits, done");
    await eatPellet(page);
    expectEq(await coinChip(page).first().getAttribute("aria-label"), "14 coins", "the HUD's coins after the second meal");
    saved = await savedGame(page);
    expectEq([saved.coins, saved.board.open, saved.board.waits.length, saved.board.done, saved.board.drawn], [14, [], 3, 3, 6], "after the second meal: coins, open, waits, done, drawn");
    expectEq(saved.board.waits[2], { doneAt: T, coins: 2, item: null }, "the new wait");
    expectEq(saved.creature.stats.hunger, 100, "hunger after two pellets (60 + 20 + 20)");
    expectEq(saved.log.filter((l) => l.text === "Request done: Feed Pellets ×2, 2 coins").length, 1, "log lines that say it was paid");
    expectEq(saved.owned, [], "owned (the request paid no item)");
    // The card says done, and what it paid.
    await openRequests(page);
    expectEq(
      (await page.evaluate(readCards)).map((c) => [c.state, c.title, c.progress]),
      [["done", "Done: +0 coins", "Next request in 15 min"], ["done", "Done: +0 coins", "Next request in 15 min"], ["done", "Done: +2 coins", "Next request in 15 min"]],
      "the cards after the second meal",
    );
    // A slot that waited is drawn again 15 minutes after it was done: 12 and 1 minutes from now for these two.
    const wait = await openScenario("done");
    await advance(wait.page, 20 * MIN);
    saved = await savedGame(wait.page);
    expectEq(saved.board.open.map((r) => [r.id, r.have, r.item, r.drewAt]), [[20, 0, null, T - HOUR], [21, 0, null, T + 1 * MIN], [22, 0, null, T + 12 * MIN]], "the board 20 minutes later: the old request and the two drawn at the minutes their slots were due");
    expectEq([saved.board.waits, saved.board.drawn, saved.board.done], [[], 23, 12], "waits, drawn and done 20 minutes later");
    return "two pellets pay 2 coins once (12 to 14, the card says done, 1 log line); a slot waiting since 14 and 3 minutes ago is drawn again at +1 and +12 minutes, not before";
  },

  "board-note": async (openScenario) => {
    const { page } = await openScenario("live-feed");
    expectEq(await note(page).count(), 0, "notes before the meals");
    await eatPellet(page);
    expectEq(await note(page).count(), 0, "notes after the first meal (nothing was paid)");
    await eatPellet(page);
    expectEq(await note(page).allTextContents(), ["Request done: +2 coins"], "the note after the second meal");
    expectEq(await page.locator('.reason-box[role="status"] p.reason').count(), 1, "the note sits in the room's status box");
    await page.clock.runFor(5000); // the note stays 6 seconds
    expectEq(await note(page).count(), 1, "notes 5 seconds later");
    await page.clock.runFor(1500);
    await page.waitForTimeout(200);
    expectEq(await note(page).count(), 0, "notes 6.5 seconds later");
    return "no note after the first meal, \"Request done: +2 coins\" in the room's status box after the second, and it is gone after its 6 seconds";
  },

  "board-kid": async (openScenario) => {
    // A Kid Mode profile whose save holds a board: no Shop, no tab, no card, and no word about requests anywhere.
    const shown = await openScenario("three");
    expectEq(await navButton(shown.page, "Shop").count(), 0, "Shop buttons in Kid Mode");
    expectEq(await shown.page.locator(".shop-tabs, .req-list, .req-card").count(), 0, "board parts in Kid Mode");
    expectEq(await shown.page.evaluate(() => /request/i.test(document.body.innerText)), false, "the word 'request' anywhere on the Kid Mode screen");
    // Time passes and meals are eaten: nothing counts, nothing is paid or drawn, no note, the board is as it was.
    const seed = seedOf("live-feed", "kid");
    const { page } = await openScenario("live-feed");
    await eatPellet(page);
    await eatPellet(page);
    expectEq(await note(page).count(), 0, "notes in Kid Mode after the meals");
    let saved = await savedGame(page);
    expectEq(saved.board, seed.board, "the board after two pellets in Kid Mode");
    expectEq(saved.coins, seed.coins, "coins after two pellets in Kid Mode");
    expectEq(saved.creature.stats.hunger, 100, "hunger (the meals were eaten)");
    expectEq(saved.log.filter((l) => /Request/.test(l.text)).length, 0, "log lines about requests in Kid Mode");
    const later = await openScenario("done");
    const doneSeed = seedOf("done", "kid");
    await advance(later.page, 20 * MIN);
    saved = await savedGame(later.page);
    expectEq(saved.board, doneSeed.board, "the board 20 minutes later in Kid Mode (the slots wait, nothing is drawn)");
    return "Kid Mode: no Shop, tab, card or word about requests; two meals and 20 minutes change nothing in the saved board, the coins or the log, and no note appears";
  },
};

// ---------- the runner ----------

async function runCheck(id, env) {
  const track = [];
  const pages = [];
  const openScenario = async (scenario) => {
    const opened = await openGame(env, scenario, track);
    pages.push(opened);
    return opened;
  };
  try {
    const detail = await withTimeout(checks[id](openScenario, env), CHECK_TIMEOUT_MS);
    // A page that logged an error or threw during the check fails it, even when the screen looks right.
    const errors = pages.flatMap((p) => p.errors);
    if (errors.length > 0) throw new Error(`the page reported ${errors.length} error(s): ${errors.slice(0, 2).join(" | ")}`);
    return detail;
  } finally {
    for (const context of track) await context.close().catch(() => {});
  }
}

const FLAGS = ["base", "only", "sizes", "modes"];

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (!flag.startsWith("--")) throw new Error(`unexpected argument ${flag}`);
    const name = flag.slice(2);
    if (!FLAGS.includes(name)) throw new Error(`unknown flag ${flag} (known: ${FLAGS.map((f) => "--" + f).join(", ")})`);
    if (i + 1 >= argv.length || argv[i + 1] === "" || argv[i + 1].startsWith("--")) throw new Error(`${flag} needs a non-empty value`);
    out[name] = argv[i + 1];
    i++;
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.base) throw new Error("--base <url> is required");
  const base = args.base.replace(/\/$/, "");
  const ids = args.only ? args.only.split(",") : ALL_IDS;
  for (const id of ids) if (!ALL_IDS.includes(id)) throw new Error(`unknown check id: ${id}`);
  const modes = args.modes ? args.modes.split(",") : ALL_MODES;
  for (const m of modes) if (!ALL_MODES.includes(m)) throw new Error(`unknown mode: ${m}`);
  const sizes = args.sizes
    ? args.sizes.split(",").map((s) => {
        const match = /^(\d+)x(\d+)@(\d+)$/.exec(s);
        if (!match) throw new Error(`bad size ${s} (want WxH@ratio)`);
        return [Number(match[1]), Number(match[2]), Number(match[3])];
      })
    : [...new Map([...DEFAULT_SIZES, ...Object.values(CHECK_SIZES).flat()].map((z) => [z.join("x"), z])).values()];

  const browser = await chromium.launch({ headless: true });
  const ran = Object.fromEntries(ALL_IDS.map((id) => [id, 0]));
  let n = 0;
  let f = 0;
  try {
    for (const [w, h, dpr] of sizes) {
      for (const id of ALL_IDS) {
        if (!ids.includes(id)) continue;
        if (!(args.sizes ? sizes : (CHECK_SIZES[id] ?? DEFAULT_SIZES)).some((z) => z[0] === w && z[1] === h && z[2] === dpr)) continue;
        for (const mode of CHECK_MODES[id]) {
          if (!modes.includes(mode)) continue;
          const label = `[${mode} ${w}x${h}@${dpr}]`;
          let line;
          try {
            const detail = await runCheck(id, { browser, base, mode, w, h, dpr, touch: TOUCH_CHECKS.has(id) });
            line = `PASS ${id} ${label} ${oneLine(detail)}`;
          } catch (err) {
            f++;
            line = `FAIL ${id} ${label} ${oneLine(err && err.message ? err.message : err)}`;
          }
          n++;
          ran[id]++;
          console.log(line);
        }
      }
    }
  } finally {
    await browser.close().catch(() => {});
  }
  console.log(`SUMMARY ${n} checks, ${f} failed`);
  // Without --only, an id that only runs in a mode that was not asked for is not "requested" (--modes kid has no adult ids to run).
  const requested = args.only ? ids : ids.filter((id) => CHECK_MODES[id].some((m) => modes.includes(m)));
  const neverRan = requested.filter((id) => ran[id] === 0);
  if (neverRan.length > 0) {
    console.error(`requested check id(s) ran zero times: ${neverRan.join(", ")}`);
    return 2;
  }
  if (n === 0) return 2;
  return f > 0 ? 1 : 0;
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (err) => {
    console.error(`script error: ${err && err.stack ? err.stack : err}`);
    console.log("SUMMARY script error (no result)");
    process.exitCode = 2;
  },
);
