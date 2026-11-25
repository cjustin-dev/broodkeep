// Browser checks for A2.2b (docs/adult-a2-plan.md section 10): the shop's foods ("dishes") in the Feed tray, buying and undoing them in the shop, and
// the tray's layout, at 320, 360 and 390 wide, pixel ratio 1 and 2, in Kid and Adult Mode.
//
// Run: node dishes-browser.mjs --base http://127.0.0.1:4173 [--only id1,id2] [--sizes 320x568@1,360x640@2] [--modes kid,adult]
// Exit: 0 when no check failed and at least one ran; 1 when any FAIL; 2 when the script broke (a requested --only id ran zero times,
// an unknown id, a bad flag, or a crash outside a check). A check that throws or times out prints a FAIL line, never a crash.
// The saves come from gen-saves-dishes (saves/dishes-<scenario>-<mode>.json, written beforehand). Expected values are literals here, worked out by
// hand from src/data/shop.ts, src/data/foods.ts, src/data/fields.ts and tests/dishes.test.ts; the page's own functions are never used to compute them.
// The clock is frozen at T (Playwright's fake clock): to move time a check sets a new fixed time and runs the timers once (advance()).
// A button that is aria-disabled still takes a tap (the screen says why instead of ignoring it), so those are clicked with force.
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

// Which modes each check runs in (the others are skipped for it).
const CHECK_MODES = {
  "tray-row": ["adult", "kid"],
  "tray-none": ["adult", "kid"],
  "tray-one-dish": ["adult", "kid"],
  "dish-feed": ["adult", "kid"],
  "dish-full": ["adult", "kid"],
  "dish-stale": ["adult", "kid"],
  "shop-buy-shows": ["adult"],
  "shop-undo-hides": ["adult"],
  "shop-preview-food": ["adult"],
  "reload-keeps": ["adult"],
  "fit-tray": ["adult", "kid"],
  "shop-foods-states": ["adult"],
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
const CHECK_TIMEOUT_MS = 120_000;

// Colours as the room draws them (src/art/room.ts), as [r, g, b]; read at these points of the home (768 x 192 game pixels, world pixels). The live room is the home seen
// through a camera that is panned to an end of it (liveRoom below); the Shop's picture of a food is the 128 x 128 window on the kitchen that starts at the corner below.
const PLAIN_WALL = [239, 227, 247]; // #efe3f7
const MATTRESS = [109, 134, 224]; // #6d86e0 (the bed's mattress, where the Comfy Bed's quilt would be)
const MAT = [242, 210, 122]; // #f2d27a (the Feeding Mat)
const WORLD_WALL_BEDROOM = [37, 10]; // the wall between two stripes (a wall pixel whose x ends in 5 to 9 is the base colour)
const WORLD_BED = [70, 58]; // the bed's quilt (the mattress where the bed has none)
const WORLD_MAT = [610, 137]; // the Feeding Mat's middle, clear of the bowl (the floor where there is none); it is on the screen at the home's right end whenever the view is 158 game pixels wide or more (768 - 610; the view is always 192 or more at the default zoom)
const KITCHEN_CROP = [560, 64];

// The tray's buttons, by field (the names are data/foods.ts; the order is the field's plan, filling then light then sweet).
const FOOD_LABELS = { pebblin: ["Pellets", "Meat", "Carrot", "Worm", "Treat"] };
const DISH_LABELS = {
  pebblin: ["Hearty Bowl: Meat, counts 2 servings", "Green Bowl: Carrot, counts 2 servings", "Sweet Bowl: Worm, counts 2 servings", "Stew: Meat and Carrot, 1 serving of each", "Garden Mix: Carrot and Worm, 1 serving of each"],
  drizzle: ["Hearty Bowl: Seafood, counts 2 servings", "Green Bowl: Seaweed, counts 2 servings", "Sweet Bowl: Shrimp, counts 2 servings", "Stew: Seafood and Seaweed, 1 serving of each", "Garden Mix: Seaweed and Shrimp, 1 serving of each"],
  cinderling: ["Hearty Bowl: Chicken, counts 2 servings", "Green Bowl: Corn, counts 2 servings", "Sweet Bowl: Syrup, counts 2 servings", "Stew: Chicken and Corn, 1 serving of each", "Garden Mix: Corn and Syrup, 1 serving of each"],
};
// What each button shows in its corner: a booster the text x2 and one picture (the food); a recipe no text, and two pictures (the food, the second food).
const MARKS = [
  { count: "×2", badge: 0, icons: 1 },
  { count: "×2", badge: 0, icons: 1 },
  { count: "×2", badge: 0, icons: 1 },
  { count: null, badge: 1, icons: 2 },
  { count: null, badge: 1, icons: 2 },
];

// ---------- small helpers (no closures in the page functions below: they are sent to the browser as source) ----------

const trimAll = (list) => list.map((s) => s.trim());

function expectEq(actual, expected, what) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
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

// Runs in the page: the colour of one pixel of the Shop's picture, read in its own 128 x 128 grid (the canvas may be drawn larger).
function pixelOf([selector, x, y]) {
  const canvas = document.querySelector(selector);
  if (!canvas) return null;
  const k = canvas.width / 128;
  const data = canvas.getContext("2d").getImageData(Math.floor(x * k + k / 2), Math.floor(y * k + k / 2), 1, 1).data;
  return [data[0], data[1], data[2]];
}

// Runs in the page: where the live room draws a world point once the camera is at the left end (the bedroom) or the right end (the kitchen) of the home: the default zoom (the
// largest whole number of device pixels per game pixel that fits the home's 192 pixel height in the square picture, at most 2.5 x the pixel ratio), the picture's middle on the
// camera's centre, a pixel in the middle of the point's block.
function worldPixelOf([selector, end, wx, wy]) {
  const canvas = document.querySelector(selector);
  if (!canvas) return null;
  const vp = canvas.width;
  const z = Math.min(Math.max(1, Math.round(2.5 * window.devicePixelRatio)), Math.max(1, Math.floor(vp / 192)));
  const camX = end === "left" ? vp / z / 2 : 768 - vp / z / 2;
  const sx = Math.floor(vp / 2 + (wx - camX) * z + z / 2);
  const sy = Math.floor(vp / 2 + (wy - 96) * z + z / 2);
  if (sx < 0 || sy < 0 || sx >= vp || sy >= vp) throw new Error(`the point ${wx},${wy} is not on the screen at the ${end} end (device pixel ${sx},${sy} of ${vp}, zoom ${z})`);
  const data = canvas.getContext("2d").getImageData(sx, sy, 1, 1).data;
  return [data[0], data[1], data[2]];
}

// Runs in the page: what each dish button shows in its corner, and its pictures.
function marksOf() {
  return [...document.querySelectorAll('[aria-label="Choose a dish"] button')].map((b) => ({
    count: b.querySelector(".count")?.textContent.trim() ?? null,
    badge: b.querySelectorAll(".badge img").length,
    icons: b.querySelectorAll("img").length,
  }));
}

// How far past its own box the plain food row already runs on `main`, by window width. At 320 its five 52 px columns and four 8 px gaps are 292 px in a
// 288 px box, so the buttons end 4 px past the box; at 360 and 390 they fit. Read off the build of origin/main (2f4bc0b) on 2026-11-24 with a scratch
// probe, scratch-only and not kept (food buttons at x = 16, 76, 136, 196, 256, each 52 wide, at 320). A baseline, not a defect of this slice (the care
// row's comment in app.css names the same cause: a plain 1fr will not shrink below its button). The dish row has no such overflow.
const FOOD_ROW_OVERFLOW = { 320: 4 };

// Runs in the page: the tray's rows fit the window: nothing scrolls sideways, every button is inside the window and at least 44 px high and wide, the
// dish row's box is the food row's box, the dish buttons are the food buttons' size and on one row, and each one is in its own column of a five-column
// grid laid out on the FOOD row's box (not the dish row's own, which would move with a shifted row). The food row's own overflow at 320 is a separate,
// literal baseline. Each corner mark (and its text, measured with a Range) is inside its button.
function trayProblems(baseline) {
  const iw = window.innerWidth;
  const problems = [];
  const doc = document.documentElement;
  if (doc.scrollWidth > iw) problems.push(`page scrollWidth ${doc.scrollWidth} > innerWidth ${iw}`);
  if (doc.clientWidth !== iw) problems.push(`the page's layout width ${doc.clientWidth} is not the window's ${iw} (a scrollbar takes room, and the measures below assume it does not)`);
  const food = [...document.querySelectorAll('[aria-label="Choose food"] button')];
  const dishes = [...document.querySelectorAll('[aria-label="Choose a dish"] button')];
  if (food.length === 0 || dishes.length === 0) return { problems: ["no food row or no dish row on the screen"], dishes: 0, foods: 0, marks: 0 };
  const foodBox = food[0].getBoundingClientRect();
  const trayBox = document.querySelector('[aria-label="Choose a dish"]').getBoundingClientRect();
  const foodRow = document.querySelector('[aria-label="Choose food"]');
  const foodRowBox = foodRow.getBoundingClientRect();
  const gap = parseFloat(getComputedStyle(foodRow).columnGap);
  if (!Number.isFinite(gap)) return { problems: [`the food row's column gap is "${getComputedStyle(foodRow).columnGap}", not a length`], dishes: dishes.length, foods: food.length, marks: 0 };
  const column = (foodRowBox.width - 4 * gap) / 5; // five equal columns across the food row's box
  const foodOverflow = food[food.length - 1].getBoundingClientRect().right - foodRowBox.right;
  if (Math.abs(trayBox.left - foodRowBox.left) > 1 || Math.abs(trayBox.width - foodRowBox.width) > 1) {
    problems.push(`the dish row's box is ${trayBox.left.toFixed(1)} to ${trayBox.right.toFixed(1)}, the food row's ${foodRowBox.left.toFixed(1)} to ${foodRowBox.right.toFixed(1)}`);
  }
  const allowed = baseline[iw] ?? 0;
  if (Math.abs(foodOverflow - allowed) > 0.5) problems.push(`the food row's last button ends ${foodOverflow.toFixed(1)} px from its box's right edge (positive: past it), main's baseline at ${iw} wide is ${allowed}`);
  let marks = 0;
  for (const b of [...food, ...dishes]) {
    const r = b.getBoundingClientRect();
    if (r.left < -0.5 || r.right > iw + 0.5) problems.push(`"${b.getAttribute("aria-label")}" is at ${Math.round(r.left)} to ${Math.round(r.right)} in a window ${iw} wide`);
    if (r.height < 44 || r.width < 44) problems.push(`"${b.getAttribute("aria-label")}" is ${Math.round(r.width)} x ${Math.round(r.height)}`);
  }
  const top = dishes[0].getBoundingClientRect().top;
  dishes.forEach((b, i) => {
    const r = b.getBoundingClientRect();
    if (Math.abs(r.width - foodBox.width) > 1 || Math.abs(r.height - foodBox.height) > 1 || Math.abs(r.width - column) > 0.5) {
      problems.push(`dish ${i} is ${r.width.toFixed(1)} x ${r.height.toFixed(1)}, a food button is ${foodBox.width.toFixed(1)} x ${foodBox.height.toFixed(1)} and a column ${column.toFixed(1)} wide`);
    }
    if (Math.abs(r.top - top) > 1) problems.push(`dish ${i} is not on the first dish's row (${r.top.toFixed(1)} against ${top.toFixed(1)})`);
    const columnLeft = foodRowBox.left + i * (column + gap);
    if (Math.abs(r.left - columnLeft) > 1) problems.push(`dish ${i} starts at ${r.left.toFixed(1)}, column ${i} of the food row's box starts at ${columnLeft.toFixed(1)}`);
    if (r.left < trayBox.left - 0.5 || r.right > trayBox.right + 0.5) problems.push(`dish ${i} is at ${r.left.toFixed(1)} to ${r.right.toFixed(1)}, outside its row's box ${trayBox.left.toFixed(1)} to ${trayBox.right.toFixed(1)}`);
    for (const mark of b.querySelectorAll(".count, .badge, img")) {
      const m = mark.getBoundingClientRect();
      marks += 1;
      if (m.left < r.left - 0.5 || m.right > r.right + 0.5 || m.top < r.top - 0.5 || m.bottom > r.bottom + 0.5) problems.push(`a mark in dish ${i} sticks out of its button`);
    }
    const count = b.querySelector(".count");
    if (count) {
      const box = count.getBoundingClientRect();
      const range = document.createRange();
      range.selectNodeContents(count);
      for (const line of range.getClientRects()) if (line.width > 0 && (line.left < box.left - 0.5 || line.right > box.right + 0.5)) problems.push(`the x2 text of dish ${i} runs outside its mark`);
    }
  });
  return { problems: problems.slice(0, 5), dishes: dishes.length, foods: food.length, marks };
}

// Runs in the page: the height of the area that holds the tray and the care row, and whether every care button can be reached: scrolled into view it is
// inside the window and the topmost thing at its centre is the button itself (nothing, such as the nav, covers it).
function careReach() {
  const problems = [];
  const buttons = [...document.querySelectorAll(".actions > .care button")];
  if (buttons.length === 0) return { problems: ["no care buttons on the screen"], buttons: 0, height: 0 };
  for (const b of buttons) {
    b.scrollIntoView({ block: "nearest" });
    const r = b.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    if (r.top < -0.5 || r.bottom > window.innerHeight + 0.5) problems.push(`"${b.getAttribute("aria-label")}" is at ${Math.round(r.top)} to ${Math.round(r.bottom)} in a window ${window.innerHeight} high`);
    if (!hit || !(hit === b || b.contains(hit))) problems.push(`"${b.getAttribute("aria-label")}" is covered by ${hit ? hit.tagName.toLowerCase() + "." + hit.className : "nothing"}`);
  }
  return { problems: problems.slice(0, 5), buttons: buttons.length, height: document.querySelector(".actions").getBoundingClientRect().height };
}

// Runs in the page: every shop card fits the window, and every text line of its parts (measured with a Range) is inside its own element and its card.
function cardsFit() {
  const iw = window.innerWidth;
  const problems = [];
  let lines = 0;
  if (document.documentElement.scrollWidth > iw) problems.push(`page scrollWidth ${document.documentElement.scrollWidth} > innerWidth ${iw}`);
  const cards = [...document.querySelectorAll(".shop-card")];
  for (const card of cards) {
    const cb = card.getBoundingClientRect();
    const name = card.querySelector(".shop-name")?.textContent ?? "?";
    if (cb.left < -0.5 || cb.right > iw + 0.5) problems.push(`the ${name} card is at ${Math.round(cb.left)} to ${Math.round(cb.right)} in a window ${iw} wide`);
    for (const part of card.querySelectorAll(".shop-name, .shop-effect, .shop-reason, .shop-owned, .card-btn, .chip")) {
      const pb = part.getBoundingClientRect();
      const range = document.createRange();
      range.selectNodeContents(part);
      for (const line of range.getClientRects()) {
        if (line.width === 0) continue;
        lines += 1;
        if (line.left < pb.left - 0.5 || line.right > pb.right + 0.5 || line.left < cb.left - 0.5 || line.right > cb.right + 0.5 || line.right > iw + 0.5) {
          problems.push(`a line of the ${name} card (${part.className}) runs outside its box: ${Math.round(line.left)} to ${Math.round(line.right)}`);
        }
      }
    }
  }
  return { problems: problems.slice(0, 5), cards: cards.length, lines };
}

// ---------- page helpers (run in Node, drive the page with real clicks) ----------

const feedButton = (page) => page.locator('button[aria-label="Feed"]');
const foodTray = (page) => page.locator('[aria-label="Choose food"]');
const dishTray = (page) => page.locator('[aria-label="Choose a dish"]');
const dishButtons = (page) => dishTray(page).locator("button");
const dishButton = (page, name) => dishTray(page).locator(`button[aria-label^="${name}"]`);
const foodLabels = (page) => foodTray(page).locator("button").evaluateAll((bs) => bs.map((b) => b.getAttribute("aria-label")));
const dishLabels = (page) => dishButtons(page).evaluateAll((bs) => bs.map((b) => b.getAttribute("aria-label")));
const navButton = (page, name) => page.locator(`.nav button[aria-label="${name}"]`);
const panel = (page) => page.locator('section[aria-label="Shop"]');
const buyButton = (page, name) => page.locator(`button[aria-label="Buy ${name}"]`);
const undoBar = (page) => page.locator(".shop-undo");
const pickCard = (page, name) => page.locator(`.shop-pick[aria-label^="${name}"]`);
// The Shop's picture of a food (the kitchen window) at a world point of the kitchen (a point outside the window is a mistake in the check, not a colour).
const preview = (page, world) => {
  const [x, y] = [world[0] - KITCHEN_CROP[0], world[1] - KITCHEN_CROP[1]];
  if (x < 0 || y < 0 || x >= 128 || y >= 128) throw new Error(`the point ${world} is outside the kitchen picture`);
  return page.evaluate(pixelOf, [".shop-preview", x, y]);
};
// The live room at a world point. The camera starts framed on the creature, so it is panned to the home's left or right end with the arrow keys (20 presses cover the home at
// every zoom), the frames are drawn, and the pixel is read.
async function liveRoom(page, end, world) {
  // (The creature wanders in real time in these suites, so it is made to stay and look around. The pin lands inside its first idle pose, which lasts 2 seconds from the first frame
  // and ends the check's wait for the page well before that, so no walk has begun; the probes are also 150 pixels or more from where it starts.)
  await page.evaluate(() => { Math.random = () => 0.99; });
  await page.locator("canvas.room").focus();
  if (!(await page.evaluate(() => document.activeElement === document.querySelector("canvas.room")))) throw new Error("the home's picture did not take the keyboard focus, so the arrow keys cannot pan it");
  for (let i = 0; i < 20; i++) await page.keyboard.press(end === "left" ? "ArrowLeft" : "ArrowRight");
  await page.clock.runFor(300);
  await page.waitForTimeout(100);
  return page.evaluate(worldPixelOf, ["canvas.room", end, ...world]);
}
const note = (page) => page.locator("p.reason");

async function openTray(page) {
  await feedButton(page).click({ timeout: 5000 });
  await foodTray(page).waitFor({ state: "visible", timeout: 5000 });
  await page.waitForTimeout(300);
}

async function openShop(page) {
  await navButton(page, "Shop").click({ timeout: 5000 });
  await panel(page).waitFor({ state: "visible", timeout: 5000 });
  await page.waitForTimeout(200);
}

async function closeShop(page) {
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await panel(page).waitFor({ state: "hidden", timeout: 5000 });
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

// Starts a game in the page's own origin: the saved game is written to IndexedDB from a stub page, then the app loads and finds it.
async function openGame(env, scenario, track) {
  const context = await env.browser.newContext({
    viewport: { width: env.w, height: env.h },
    deviceScaleFactor: env.dpr,
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
  const save = JSON.parse(readFileSync(join(SAVES, `dishes-${scenario}-${env.mode}.json`), "utf8"));
  const stub = `${env.base}/seed`;
  await page.route(stub, (route) => route.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html><title>seed</title>" }));
  await page.goto(stub);
  await page.evaluate(seedSave, save);
  await page.goto(`${env.base}/`);
  await page.getByRole("button", { name: "Habitat", exact: true }).waitFor({ timeout: 20000 });
  await page.waitForTimeout(300);
  return { page, errors };
}

// A tap on a dish in the open tray, then the saved game once it has been written.
async function eatDish(page, name) {
  await openTray(page);
  await dishButton(page, name).click({ timeout: 5000 });
  await page.waitForTimeout(300);
  return savedGame(page);
}

// ---------- the checks: each returns a detail string, or throws ----------

const checks = {
  "tray-row": async (open) => {
    for (const [scenario, form] of [["kid-all", "pebblin"], ["water-all", "drizzle"], ["sky-all", "cinderling"]]) {
      const { page } = await open(scenario);
      await openTray(page);
      expectEq(await dishLabels(page), DISH_LABELS[form], `${scenario}: the dish buttons' labels, in order`);
      expectEq(await page.evaluate(marksOf), MARKS, `${scenario}: what each dish shows in its corner`);
      if (form === "pebblin") expectEq(await foodLabels(page), FOOD_LABELS.pebblin, "the food row above it");
      expectEq(await foodTray(page).locator("button").count(), 5, `${scenario}: the food row's buttons`);
    }
    return "a Land, a Water and a Sky kid each show five dish buttons named with the field's own foods and the right corner marks, under the five foods";
  },

  "tray-none": async (open) => {
    // Nothing owned (a kid), or owned but never offered (a baby, a young, an adult, the special): the tray is the food row alone, with no empty group and no extra gap.
    for (const scenario of ["kid-none", "baby-all", "young-all", "adult-all", "special-all"]) {
      const { page } = await open(scenario);
      await openTray(page);
      expectEq(await dishTray(page).count(), 0, `${scenario}: dish rows`);
      expectEq(await page.locator(".actions > .tray").count(), 1, `${scenario}: rows of the tray`);
      const gap = await page.evaluate(() => {
        const tray = document.querySelector(".actions > .tray").getBoundingClientRect();
        const care = document.querySelector(".actions > .care").getBoundingClientRect();
        return Math.round((care.top - tray.bottom) * 10) / 10;
      });
      expectEq(gap, 12, `${scenario}: the gap between the tray and the care row`);
    }
    return "with nothing owned, or a creature that is not a kid (baby, young, adult, special), the tray is one row of foods, 12 px above the care row, and no dish group is on the page";
  },

  "tray-one-dish": async (open) => {
    const { page } = await open("kid-hearty");
    await openTray(page);
    expectEq(await dishLabels(page), [DISH_LABELS.pebblin[0]], "the one dish");
    const [dish, food] = await Promise.all([dishButtons(page).first().boundingBox(), foodTray(page).locator("button").first().boundingBox()]);
    if (!dish || !food) throw new Error("a button has no box");
    if (Math.abs(dish.width - food.width) > 1 || Math.abs(dish.height - food.height) > 1) throw new Error(`the one dish is ${dish.width} x ${dish.height}, a food button ${food.width} x ${food.height}`);
    if (Math.abs(dish.x - food.x) > 1) throw new Error(`the one dish starts at ${dish.x}, the food row at ${food.x}`);
    return "a single dish is as big as a food button and sits under the first one, not stretched across the row";
  },

  "dish-feed": async (open) => {
    // [scenario, dish, servings counted, hunger after (a tap is a meal of the food's own numbers: 60 + 35 for the filling food, 60 + 20 light)]
    const cases = [
      ["kid-all", "Hearty Bowl", { meat: 2 }, 95],
      ["kid-all", "Garden Mix", { carrot: 1, worm: 1 }, 80],
      ["kid-stew", "Stew", { meat: 1, carrot: 1 }, 95],
      ["water-all", "Hearty Bowl", { seafood: 2 }, 95],
      ["sky-all", "Green Bowl", { corn: 2 }, 80],
    ];
    for (const [scenario, dish, servings, hunger] of cases) {
      const { page } = await open(scenario);
      const saved = await eatDish(page, dish);
      expectEq(saved.creature.counters.servings, servings, `${scenario} ${dish}: servings counted`);
      expectEq(saved.creature.stats.hunger, hunger, `${scenario} ${dish}: hunger after the meal`);
      expectEq(saved.log.at(-1).text, `Ate ${dish}`, `${scenario} ${dish}: the log line`);
      expectEq(saved.coins, 5, `${scenario} ${dish}: coins (eating costs nothing)`);
      expectEq(await foodTray(page).count(), 0, `${scenario} ${dish}: the tray after the tap`);
    }
    return "tapping a dish eats a meal of the field's food, counts its servings in the saved game (2 for a booster, 1 and 1 for a recipe), names it in the log and closes the tray";
  },

  "dish-full": async (open, env) => {
    // In Adult Mode a full creature cannot open the tray at all (the Feed button is refused), so a dish tap at full is reachable only in Kid Mode: the adult
    // half of this check is the Feed button's refusal, and the words a dish tap would get at full are covered by tests/dishes.test.ts (feedRefusal).
    const { page } = await open("kid-all-hungry");
    const first = await eatDish(page, "Hearty Bowl");
    expectEq([first.creature.counters.servings, first.creature.stats.hunger], [{ meat: 2 }, 100], "after the first meal at hunger 65");
    if (env.mode === "adult") {
      // The Feed button itself is refused when full (availability.ts feedButtonRefusal): no tray opens, the reason is said over the room.
      await feedButton(page).click({ timeout: 5000, force: true });
      await note(page).waitFor({ state: "visible", timeout: 5000 });
      expectEq(trimAll(await note(page).allTextContents()), ["Not hungry: food is 100 of 100. It refuses food at 95 or more."], "the reason said over the room");
      expectEq(await foodTray(page).count(), 0, "the tray after a refused Feed tap");
    } else {
      // Kid Mode has no pre-check: the tray opens and the dish tap is refused by the action (the creature shakes its head).
      await openTray(page);
      await dishButton(page, "Hearty Bowl").click({ timeout: 5000 });
    }
    const second = await savedGame(page);
    expectEq(second.creature.counters.servings, { meat: 2 }, "servings after the refused second meal");
    expectEq(second.creature.stats.hunger, 100, "hunger after the refused second meal");
    return env.mode === "adult" ? "a full creature's Feed tap says why over the room and eats nothing" : "a dish tap on a full creature is refused: no second meal, no servings";
  },

  "dish-stale": async (open, env) => {
    // The creature grows up while the tray is open. A dish button from before is held and tapped after (the DOM button is gone, its handler is not).
    const { page } = await open("kid-ending");
    await openTray(page);
    expectEq((await dishLabels(page)).length, 5, "the dish buttons while it is a kid");
    const held = await dishButtons(page).first().elementHandle();
    await advance(page, 3 * MIN);
    expectEq(await dishTray(page).count(), 0, "dish rows once it is a young");
    const grown = await savedGame(page);
    if (grown.creature.formId === "pebblin") throw new Error("the creature did not grow up: the check did not reach its state");
    expectEq(await note(page).count(), 0, "lines over the room before the stale tap (an older line must not pass for the answer)");
    await held.evaluate((button) => button.click());
    if (env.mode === "adult") {
      await note(page).waitFor({ state: "visible", timeout: 5000 });
      expectEq(trimAll(await note(page).allTextContents()), ["That food is not on its menu."], "the words for a stale dish tap");
    } else {
      // Kid Mode has no pre-check and no words: the tap does nothing, as a stale food tap does today.
      await page.waitForTimeout(600);
      expectEq(await note(page).count(), 0, "lines over the room after a stale dish tap in Kid Mode");
    }
    const after = await savedGame(page);
    expectEq(after.creature.counters.servings, grown.creature.counters.servings, "servings after the stale tap");
    expectEq(after.creature.stats.hunger, grown.creature.stats.hunger, "hunger after the stale tap");
    return env.mode === "adult" ? "a dish tap that arrives after the kid grew up says \"That food is not on its menu.\" and eats nothing" : "a dish tap that arrives after the kid grew up does nothing: no words, no meal";
  },

  "shop-buy-shows": async (open) => {
    const { page } = await open("exact-hearty");
    await openShop(page);
    await buyButton(page, "Hearty Bowl").click({ timeout: 5000 });
    await undoBar(page).waitFor({ state: "visible", timeout: 5000 });
    const saved = await savedGame(page);
    expectEq([saved.coins, saved.inventory.fish], [0, 0], "coins and fish after buying at exactly the price");
    expectEq(saved.owned, ["hearty-bowl"], "owned");
    expectEq(saved.wall, null, "the wall (a food does not change it)");
    expectEq(saved.lastBuy, { item: "hearty-bowl", at: T, wall: null }, "the undo record");
    expectEq(trimAll(await page.locator(".shop-card").nth(4).locator(".shop-owned").allTextContents()), ["Owned: find it under Feed"], "the Hearty Bowl card's line");
    await closeShop(page);
    await openTray(page);
    expectEq(await dishLabels(page), [DISH_LABELS.pebblin[0]], "the dish row after the buy");
    return "buying the Hearty Bowl at exactly 25 coins and 3 Fish leaves 0 and 0, owns it, says where to find it, and the Feed tray offers it";
  },

  "shop-undo-hides": async (open) => {
    const { page } = await open("just-bought-stew");
    await openShop(page);
    await undoBar(page).locator("button").click({ timeout: 5000 });
    await page.waitForTimeout(300);
    const saved = await savedGame(page);
    expectEq(saved.owned, [], "owned after the undo");
    expectEq([saved.coins, saved.inventory.wood, saved.inventory.stone, saved.inventory.fiber, saved.inventory.herb, saved.inventory.fish], [100, 5, 5, 5, 5, 5], "the refund: coins 65 + 35, wood 3 + 2, stone 3 + 2");
    expectEq(saved.lastBuy, null, "the undo record");
    await closeShop(page);
    await openTray(page);
    expectEq(await dishTray(page).count(), 0, "dish rows after the undo");
    return "undoing the Stew gives back exactly its price and the dish leaves the tray at once";
  },

  "shop-preview-food": async (open) => {
    const { page } = await open("rich");
    expectEq([await liveRoom(page, "left", WORLD_WALL_BEDROOM), await liveRoom(page, "left", WORLD_BED)], [PLAIN_WALL, MATTRESS], "the live room's wall and bed with nothing owned");
    const floor = await liveRoom(page, "right", WORLD_MAT);
    if (JSON.stringify(floor) === JSON.stringify(MAT)) throw new Error("the live room has the mat's colour where the mat would be, with nothing owned");
    await openShop(page);
    for (const name of ["Hearty Bowl", "Stew", "Garden Mix"]) {
      await pickCard(page, name).click({ timeout: 5000 });
      await page.waitForTimeout(250);
      expectEq(await preview(page, WORLD_MAT), floor, `the kitchen preview with ${name} chosen, at the mat's place, against the live room`);
    }
    return "choosing a food card shows the kitchen with the floor where the mat would be, exactly as the live room is (a food adds nothing to the room)";
  },

  "reload-keeps": async (open) => {
    const { page } = await open("rich");
    await openShop(page);
    await buyButton(page, "Stew").click({ timeout: 5000 });
    await undoBar(page).waitFor({ state: "visible", timeout: 5000 });
    await savedGame(page);
    await page.reload();
    await page.getByRole("button", { name: "Habitat", exact: true }).waitFor({ timeout: 20000 });
    await page.waitForTimeout(300);
    await openTray(page);
    expectEq(await dishLabels(page), [DISH_LABELS.pebblin[3]], "the dish row after a reload");
    return "after a reload the Stew is still owned and still in the Feed tray";
  },

  "fit-tray": async (open) => {
    // The open tray without dishes (nothing owned) and with five: the second row adds exactly one button row (a 64 px button and the 12 px gap), measured here.
    const without = await open("kid-none");
    await openTray(without.page);
    const base = await without.page.evaluate(careReach);
    if (base.problems.length > 0) throw new Error(`kid-none: ${base.problems.join("; ")}`);
    let dishes = 0;
    let marks = 0;
    let buttons = base.buttons;
    for (const scenario of ["kid-all", "water-all", "sky-all"]) {
      const { page } = await open(scenario);
      await openTray(page);
      const found = await page.evaluate(trayProblems, FOOD_ROW_OVERFLOW);
      if (found.problems.length > 0) throw new Error(`${scenario}: ${found.problems.join("; ")}`);
      expectEq([found.foods, found.dishes], [5, 5], `${scenario}: food and dish buttons measured`);
      dishes += found.dishes;
      marks += found.marks;
      const reach = await page.evaluate(careReach);
      if (reach.problems.length > 0) throw new Error(`${scenario}: ${reach.problems.join("; ")}`);
      buttons += reach.buttons;
      expectEq(reach.height - base.height, 76, `${scenario}: the height the dish row adds to the open tray area`);
    }
    if (dishes === 0 || marks === 0) throw new Error("no dish button or mark was measured");
    return `${dishes} dish buttons and ${marks} marks and pictures in 3 open trays: inside the window, 44 px or more, the food buttons' size, each in its own column of a row as wide as the food row, no sideways scroll; the row adds 76 px and ${buttons} care buttons stay reachable`;
  },

  "shop-foods-states": async (open) => {
    // The five food cards in every state the shop can show them: the reasons (literal sentences, in the material order of data/habitat.ts), owned, and fit.
    const reasons = [
      ["one-short-hearty", "Hearty Bowl", "Needs 1 more Fish."],
      ["poor", "Hearty Bowl", "Needs 15 more coins and 3 more Fish."],
      ["poor", "Green Bowl", "Needs 15 more coins and 3 more Herbs."],
      ["poor", "Sweet Bowl", "Needs 15 more coins and 2 more Fiber."],
      ["poor", "Stew", "Needs 25 more coins, 2 more Wood and 2 more Stone."],
      ["poor", "Garden Mix", "Needs 25 more coins, 2 more Fish and 2 more Stone."],
    ];
    const card = (page, name) => page.locator(".shop-card", { has: page.locator(".shop-name", { hasText: name }) });
    for (const [scenario, name, words] of reasons) {
      const { page } = await open(scenario);
      await openShop(page);
      expectEq(trimAll(await card(page, name).locator(".shop-reason").allTextContents()), [words], `${scenario}: the ${name} card's reason`);
      expectEq(await buyButton(page, name).getAttribute("aria-disabled"), "true", `${scenario}: the ${name} Buy button`);
      await buyButton(page, name).click({ timeout: 5000, force: true });
      const saved = await savedGame(page);
      expectEq([saved.coins, saved.owned, saved.lastBuy], [scenario === "poor" ? 10 : 25, [], null], `${scenario}: the save after a tap on a Buy that is short`);
    }
    const owned = await open("owned-foods");
    await openShop(owned.page);
    expectEq(trimAll(await owned.page.locator(".shop-card .shop-owned").allTextContents()), ["Owned: find it under Feed", "Owned: find it under Feed", "Owned: find it under Feed", "Owned: find it under Feed", "Owned: find it under Feed"], "the five food cards when owned");
    for (const name of ["Hearty Bowl", "Green Bowl", "Sweet Bowl", "Stew", "Garden Mix"]) expectEq(await buyButton(owned.page, name).count(), 0, `a Buy button for the owned ${name}`);
    let lines = 0;
    for (const scenario of ["rich", "poor", "one-short-hearty", "owned-foods"]) {
      const { page } = await open(scenario);
      await openShop(page);
      const found = await page.evaluate(cardsFit);
      if (found.problems.length > 0) throw new Error(`${scenario}: ${found.problems.join("; ")}`);
      expectEq(found.cards, 9, `${scenario}: the cards on the screen`);
      lines += found.lines;
    }
    if (lines === 0) throw new Error("no text line was measured");
    return `the five food cards: ${reasons.length} reasons read literally with Buy refused and nothing charged, all five Owned lines, no Buy for an owned food, and ${lines} text lines inside their cards in 4 shop states`;
  },
};

// ---------- the runner ----------

async function runCheck(id, env) {
  const track = [];
  const pages = [];
  const open = async (scenario) => {
    const opened = await openGame(env, scenario, track);
    pages.push(opened);
    return opened;
  };
  try {
    const detail = await withTimeout(checks[id](open, env), CHECK_TIMEOUT_MS);
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
    : DEFAULT_SIZES;

  const browser = await chromium.launch({ headless: true });
  const ran = Object.fromEntries(ALL_IDS.map((id) => [id, 0]));
  let n = 0;
  let f = 0;
  try {
    for (const [w, h, dpr] of sizes) {
      for (const id of ALL_IDS) {
        if (!ids.includes(id)) continue;
        for (const mode of CHECK_MODES[id]) {
          if (!modes.includes(mode)) continue;
          const label = `[${mode} ${w}x${h}@${dpr}]`;
          let line;
          try {
            const detail = await runCheck(id, { browser, base, mode, w, h, dpr });
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
