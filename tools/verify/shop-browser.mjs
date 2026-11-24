// Browser checks for A2.2a (docs/adult-a2-plan.md section 9): the Shop button in the nav, the shop panel, buying, the 10 second undo, the
// previews, and the room's looks (wall, bed, mat), at 320, 360 and 390 wide, pixel ratio 1 and 2.
//
// Run: node shop-browser.mjs --base http://127.0.0.1:4173 [--only id1,id2] [--sizes 320x568@1,360x640@2] [--modes kid,adult]
// Exit: 0 when no check failed and at least one ran; 1 when any FAIL; 2 when the script broke (a requested --only id ran zero times,
// an unknown id, a bad flag, or a crash outside a check). A check that throws or times out prints a FAIL line, never a crash.
// The saves come from gen-saves-shop (saves/shop-<scenario>-<mode>.json, written beforehand). Expected values are literals here, worked out by
// hand from src/data/shop.ts, src/art/room.ts and tests/shop.test.ts; the page's own functions are never used to compute them.
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
  "nav-shop": ["adult", "kid"],
  "open-close": ["adult"],
  "buy-exact": ["adult"],
  "buy-poor": ["adult"],
  "double-tap": ["adult"],
  "undo-live": ["adult"],
  "preview-room": ["adult"],
  "room-looks": ["adult", "kid"],
  "hud-bed": ["adult"],
  "reload-keeps": ["adult"],
  "fit-scroll": ["adult"],
  "fit-clip": ["adult"],
  "fit-tap": ["adult"],
  "btn-look": ["adult"],
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

// Colours as the room draws them (src/art/room.ts, src/data/shop.ts), as [r, g, b].
const PLAIN_WALL = [239, 227, 247]; // #efe3f7
const MEADOW_WALL = [223, 240, 210]; // #dff0d2
const DUSK_WALL = [142, 138, 196]; // #8e8ac4
const MATTRESS = [109, 134, 224]; // #6d86e0
const QUILT = [224, 112, 143]; // #e0708f
const MAT = [242, 210, 122]; // #f2d27a
// Where each is read, in the room's own 128 x 128 pixels: the wall between two stripes, the bed's quilt (where the mattress is without it), the mat.
const AT_WALL = [7, 2];
const AT_BED = [100, 94];
const AT_MAT = [20, 119];

// What the cards say is missing (worked out from the prices in src/data/shop.ts and the wallets in gen-saves-shop.ts).
const POOR_REASONS = {
  poor: {
    "Comfy Bed": "Needs 25 more coins, 2 more Fiber and 2 more Wood.",
    "Feeding Mat": "Needs 15 more coins, 2 more Fiber and 2 more Herbs.",
    "Wallpaper: Meadow": "Needs 2 more coins and 2 more Herbs.",
    "Wallpaper: Dusk": "Needs 2 more coins and 2 more Stone.",
  },
  mixed: {
    "Comfy Bed": "Needs 5 more coins, 1 more Fiber and 2 more Wood.",
    "Feeding Mat": "Needs 1 more Fiber.",
    "Wallpaper: Dusk": "Needs 1 more Stone.",
  },
};

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

// Runs in the page: the colour of one pixel of a canvas, read in the room's own 128 x 128 grid (the canvas may be drawn larger).
function pixelOf([selector, x, y]) {
  const canvas = document.querySelector(selector);
  if (!canvas) return null;
  const k = canvas.width / 128;
  const data = canvas.getContext("2d").getImageData(Math.floor(x * k + k / 2), Math.floor(y * k + k / 2), 1, 1).data;
  return [data[0], data[1], data[2]];
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
  for (const el of panel.querySelectorAll("*")) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && (r.right > iw + 0.5 || r.left < -0.5)) problems.push(`${el.tagName.toLowerCase()}.${el.getAttribute("class") ?? ""} spans ${Math.round(r.left)} to ${Math.round(r.right)} in a window ${iw} wide`);
  }
  return problems.slice(0, 5);
}

// Runs in the page: every text line of the panel's parts sits inside its own element's box (measured with a Range), inside its card, and inside the window.
function fitClipProblems() {
  const iw = window.innerWidth;
  const problems = [];
  const parts = [...document.querySelectorAll(".shop-card, .shop-undo, .shop-wallet, .panel-head, .shop-hint")];
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

// Runs in the page: every button of the panel is at least 44 px high and wide.
function tapProblems() {
  const buttons = [...document.querySelectorAll(".panel button")];
  const problems = [];
  for (const b of buttons) {
    const r = b.getBoundingClientRect();
    if (r.height < 44 - 0.5 || r.width < 44 - 0.5) problems.push(`"${b.textContent.trim().slice(0, 30)}" is ${Math.round(r.width)} x ${Math.round(r.height)}`);
  }
  return { problems: problems.slice(0, 5), buttons: buttons.length };
}

// Runs in the page: the nav's four buttons are inside the window, and each button's word sits inside the button.
function navProblems() {
  const iw = window.innerWidth;
  const buttons = [...document.querySelectorAll(".nav button")];
  const problems = [];
  const words = [];
  for (const b of buttons) {
    const r = b.getBoundingClientRect();
    if (r.left < -0.5 || r.right > iw + 0.5) problems.push(`"${b.getAttribute("aria-label")}" is at ${Math.round(r.left)} to ${Math.round(r.right)} in a window ${iw} wide`);
    if (r.height < 44 - 0.5) problems.push(`"${b.getAttribute("aria-label")}" is ${Math.round(r.height)} high`);
    for (const word of b.querySelectorAll(".word")) {
      const range = document.createRange();
      range.selectNodeContents(word);
      for (const w of range.getClientRects()) {
        if (w.width > 0 && (w.left < r.left - 0.5 || w.right > r.right + 0.5)) problems.push(`the word "${word.textContent}" runs ${Math.round(w.left)} to ${Math.round(w.right)} in a button ${Math.round(r.left)} to ${Math.round(r.right)}`);
      }
    }
    words.push(b.querySelector(".word")?.textContent ?? null);
  }
  return { labels: buttons.map((b) => b.getAttribute("aria-label")), words, problems: problems.slice(0, 5) };
}

// Runs in the page: every button the selector names can be told from the surface behind it, and its label can be read. The surface is the
// nearest ancestor with a filled background. A button passes when its fill or its edge (an inset ring of 1 px or more, or a border) has
// contrast of 3:1 against that surface, and its label has 4.5:1 against its own fill. With `withControl` a button made like the old
// Retire defect (the card's own fill, no edge) is added to the carrier first, and what was said about it comes back too.
function btnLookProblems([withControl, selector, carrier]) {
  const parse = (css) => {
    const m = /rgba?\(([^)]+)\)/.exec(css);
    if (!m) return null;
    const p = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  };
  const lum = (c) => {
    const f = (v) => {
      const x = v / 255;
      return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
  };
  const ratio = (a, b) => {
    const x = lum(a);
    const y = lum(b);
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
  };
  const surfaceOf = (el) => {
    for (let e = el.parentElement; e; e = e.parentElement) {
      const c = parse(getComputedStyle(e).backgroundColor);
      if (c && c.a === 1) return c;
    }
    return null;
  };
  const edgeOf = (cs) => {
    for (const part of cs.boxShadow.split(/,(?![^(]*\))/)) {
      const color = parse(part);
      const nums = (part.replace(/rgba?\([^)]*\)/, "").match(/-?[\d.]+px/g) ?? []).map(parseFloat);
      if (color && color.a === 1 && /\binset\b/.test(part) && nums[0] === 0 && nums[1] === 0 && nums[2] === 0 && nums[3] >= 1) return color;
    }
    const border = parse(cs.borderTopColor);
    if (cs.borderTopStyle !== "none" && parseFloat(cs.borderTopWidth) >= 1 && border && border.a === 1) return border;
    return null;
  };
  const judge = (btn) => {
    const cs = getComputedStyle(btn);
    const fill = parse(cs.backgroundColor);
    const ink = parse(cs.color);
    const surface = surfaceOf(btn);
    const name = btn.textContent.trim().slice(0, 30);
    if (!fill || fill.a !== 1 || !ink || !surface) return [`"${name}": its colours cannot be read`];
    const out = [];
    const text = ratio(ink, fill);
    if (text < 4.5) out.push(`"${name}": label contrast ${text.toFixed(2)} is under 4.5`);
    const edge = edgeOf(cs);
    const fillRatio = ratio(fill, surface);
    const edgeRatio = edge ? ratio(edge, surface) : 0;
    if (fillRatio < 3 && edgeRatio < 3) out.push(`"${name}": fill ${fillRatio.toFixed(2)} and edge ${edgeRatio.toFixed(2)} against its surface, both under 3`);
    return out;
  };
  let control = null;
  if (withControl) {
    const card = document.querySelector(carrier);
    if (!card) return { problems: ["no card to put the control button in"], buttons: 0, control: null };
    const fake = document.createElement("button");
    fake.textContent = "Lazy text";
    // Its label is readable (the page's own ink), so only the fill-and-edge rule can catch it.
    fake.style.cssText = `appearance:none;border:0;box-shadow:none;background:${getComputedStyle(card).backgroundColor};color:${getComputedStyle(document.body).color}`;
    card.appendChild(fake);
    control = judge(fake);
    fake.remove();
  }
  const buttons = [...document.querySelectorAll(selector)];
  return { problems: buttons.flatMap(judge).slice(0, 5), buttons: buttons.length, control };
}

// ---------- page helpers (run in Node, drive the page with real clicks) ----------

const navButton = (page, name) => page.locator(`.nav button[aria-label="${name}"]`);
const panel = (page) => page.locator('section[aria-label="Shop"]');
const buyButton = (page, name) => page.locator(`button[aria-label="Buy ${name}"]`);
const undoBar = (page) => page.locator(".shop-undo");
const pickCard = (page, name) => page.locator(`.shop-pick[aria-label^="${name}"]`);
const reasons = async (page) => Object.fromEntries(await page.locator(".shop-card").evaluateAll((cards) => cards.map((c) => [c.querySelector(".shop-name").textContent.trim(), c.querySelector(".shop-reason")?.textContent.trim() ?? null])));

async function openShop(page) {
  await navButton(page, "Shop").click({ timeout: 5000 });
  await panel(page).waitFor({ state: "visible", timeout: 5000 });
  await page.waitForTimeout(200);
}

const preview = (page, x, y) => page.evaluate(pixelOf, [".shop-preview", x, y]);
// A tap on a card, then a wait for the preview to be drawn again (an effect draws it a moment after the tap; the page's timers run at real speed).
const pick = async (page, name) => {
  await pickCard(page, name).click({ timeout: 5000 });
  await page.waitForTimeout(250);
};
const room = (page, x, y) => page.evaluate(pixelOf, ["canvas.room", x, y]);

// Moves the frozen game clock `ms` after T and runs the page's timers once (the one-second tick and the redraw).
async function advance(page, ms) {
  await page.clock.setFixedTime(T + ms);
  await page.clock.runFor(1000);
  await page.waitForTimeout(100);
}

// (A saved game the game never wrote again is the seeded one, which has no `job` key at all: callers read a missing job as null.)
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
  const save = JSON.parse(readFileSync(join(SAVES, `shop-${scenario}-${env.mode}.json`), "utf8"));
  const stub = `${env.base}/seed`;
  await page.route(stub, (route) => route.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html><title>seed</title>" }));
  await page.goto(stub);
  await page.evaluate(seedSave, save);
  await page.goto(`${env.base}/`);
  await page.getByRole("button", { name: "Habitat", exact: true }).waitFor({ timeout: 20000 });
  await page.waitForTimeout(300);
  return { page, errors };
}

// ---------- the checks: each returns a detail string, or throws ----------

const checks = {
  "nav-shop": async (open, env) => {
    const { page } = await open("rich");
    const found = await page.evaluate(navProblems);
    if (found.problems.length > 0) throw new Error(found.problems.join("; "));
    if (env.mode === "kid") {
      expectEq(found.labels, ["Room", "Habitat", "Arena"], "Kid Mode nav buttons");
      expectEq(await page.getByRole("button", { name: /shop/i }).count(), 0, "buttons with Shop in their name in Kid Mode");
      return "Kid Mode has the three nav buttons and no Shop button anywhere";
    }
    expectEq(found.labels, ["Room", "Habitat", "Arena", "Shop"], "Adult Mode nav buttons");
    expectEq(found.words, ["Room", "Habitat", "Arena", "Shop"], "the words under the icons");
    expectEq(await page.locator('.strip button[aria-label="Shop"]').count(), 0, "Shop buttons in the header");
    return "Adult Mode: four nav buttons with their words inside them, all 44 px high and inside the window, none in the header";
  },

  "open-close": async (open) => {
    const { page } = await open("rich");
    const before = await savedGame(page);
    await openShop(page);
    expectEq(trimAll(await page.locator(".shop-name").allTextContents()), ["Comfy Bed", "Feeding Mat", "Wallpaper: Meadow", "Wallpaper: Dusk", "Hearty Bowl", "Green Bowl", "Sweet Bowl", "Stew", "Garden Mix"], "the nine cards, in order");
    expectEq(await page.locator(".shop-undo").count(), 0, "undo bars before any buy");
    await page.getByRole("button", { name: "Close", exact: true }).click();
    await panel(page).waitFor({ state: "hidden", timeout: 5000 });
    expectEq(await savedGame(page), before, "the saved game after opening and closing the shop");
    return "the shop opens with its nine cards, Close shuts it, and the saved game is exactly as it was";
  },

  "buy-exact": async (open) => {
    const { page } = await open("exact-meadow");
    await openShop(page);
    await buyButton(page, "Wallpaper: Meadow").click({ timeout: 5000 });
    await undoBar(page).waitFor({ state: "visible", timeout: 5000 });
    const saved = await savedGame(page);
    expectEq([saved.coins, saved.inventory.herb], [0, 0], "coins and herbs after buying at exactly the price");
    expectEq(saved.owned, ["wall-meadow"], "owned");
    expectEq(saved.wall, "wall-meadow", "the wall");
    expectEq(saved.lastBuy, { item: "wall-meadow", at: T, wall: null }, "the undo record");
    expectEq(trimAll(await undoBar(page).locator("button").allTextContents()), ["Undo (10s)"], "the undo button");
    expectEq(await page.locator('button[aria-label="Buy Wallpaper: Meadow"]').count(), 0, "Buy buttons for the item just bought");
    expectEq(trimAll(await page.locator(".shop-card").nth(2).locator("button.card-btn").allTextContents()), ["Stop using"], "the Meadow card's button");
    expectEq(await page.locator('.shop-wallet [aria-label="0 coins"]').count(), 1, "the wallet's coins");
    expectEq(await preview(page, ...AT_WALL), MEADOW_WALL, "the preview's wall once bought");
    return "buying at exactly 12 coins and 2 Herbs leaves 0 and 0, owns the wallpaper, puts it on the wall and offers the undo with 10 seconds";
  },

  "buy-poor": async (open) => {
    const one = await open("one-short-meadow");
    await openShop(one.page);
    expectEq(await buyButton(one.page, "Wallpaper: Meadow").getAttribute("aria-disabled"), "true", "the Meadow Buy button one coin short");
    expectEq((await reasons(one.page))["Wallpaper: Meadow"], "Needs 1 more coin.", "the reason");
    await buyButton(one.page, "Wallpaper: Meadow").click({ force: true, timeout: 5000 });
    await one.page.waitForTimeout(300);
    const saved = await savedGame(one.page);
    expectEq([saved.coins, saved.inventory.herb, saved.owned, saved.lastBuy], [11, 2, [], null], "the save after a tap on a Buy button that is one coin short");
    expectEq(await undoBar(one.page).count(), 0, "undo bars after a refused tap");
    for (const scenario of ["poor", "mixed"]) {
      const { page } = await open(scenario);
      await openShop(page);
      const said = await reasons(page);
      for (const [name, reason] of Object.entries(POOR_REASONS[scenario])) expectEq(said[name], reason, `${scenario}: the reason on ${name}`);
      if (scenario === "mixed") expectEq(said["Wallpaper: Meadow"], null, "mixed: a card that can be bought says nothing is missing");
    }
    return "a Buy one coin short is aria-disabled, says what is missing, and a tap on it changes nothing; the reasons read as literal sentences";
  },

  "double-tap": async (open) => {
    const { page } = await open("exact-meadow");
    await openShop(page);
    // Two clicks in one script task: the second reaches the same Buy button before the screen has redrawn.
    await page.evaluate(() => {
      const button = document.querySelector('button[aria-label="Buy Wallpaper: Meadow"]');
      button.click();
      button.click();
    });
    await undoBar(page).waitFor({ state: "visible", timeout: 5000 });
    const saved = await savedGame(page);
    expectEq([saved.coins, saved.inventory.herb, saved.owned], [0, 0, ["wall-meadow"]], "two taps on one Buy");
    return "two taps on one Buy charge once (0 coins, 0 Herbs, one owned item)";
  },

  "undo-live": async (open) => {
    const { page } = await open("just-bought");
    await openShop(page);
    expectEq(trimAll(await undoBar(page).locator("button").allTextContents()), ["Undo (7s)"], "the undo button 3 seconds after the buy");
    await advance(page, 5000);
    expectEq(trimAll(await undoBar(page).locator("button").allTextContents()), ["Undo (2s)"], "the undo button 8 seconds after the buy");
    await advance(page, 6000);
    expectEq(trimAll(await undoBar(page).locator("button").allTextContents()), ["Undo (1s)"], "the undo button 9 seconds after the buy");
    await undoBar(page).locator("button").click({ timeout: 5000 });
    await undoBar(page).waitFor({ state: "hidden", timeout: 5000 });
    const saved = await savedGame(page);
    expectEq([saved.coins, saved.inventory.fiber, saved.inventory.wood, saved.owned, saved.lastBuy], [100, 5, 5, [], null], "the save after the undo");
    expectEq(await preview(page, ...AT_BED), QUILT, "the preview still shows the bed (it is the card chosen), and the card is back to Buy");
    expectEq(await buyButton(page, "Comfy Bed").count(), 1, "the Buy button for the item given back");

    const late = await open("just-bought");
    await openShop(late.page);
    await advance(late.page, 8000); // 11 seconds after the buy
    await late.page.waitForTimeout(300);
    expectEq(await undoBar(late.page).count(), 0, "undo bars 11 seconds after the buy");
    expectEq((await savedGame(late.page)).owned, ["comfy-bed"], "owned after the window has gone");
    return "the countdown reads 7 s then 2 s, Undo at 9 s refunds 35 coins, 3 Fiber and 2 Wood exactly, and at 11 s the bar is gone and the bed stays";
  },

  "preview-room": async (open) => {
    const { page } = await open("rich");
    await openShop(page);
    expectEq(await pickCard(page, "Comfy Bed").getAttribute("aria-pressed"), "true", "the first card is the one previewed");
    expectEq([await preview(page, ...AT_WALL), await preview(page, ...AT_BED)], [PLAIN_WALL, QUILT], "preview with the bed");
    await pick(page, "Wallpaper: Dusk");
    expectEq([await preview(page, ...AT_WALL), await preview(page, ...AT_BED)], [DUSK_WALL, MATTRESS], "preview with the Dusk wallpaper (no bed)");
    await pick(page, "Wallpaper: Meadow");
    expectEq(await preview(page, ...AT_WALL), MEADOW_WALL, "preview with the Meadow wallpaper");
    await pick(page, "Feeding Mat");
    expectEq([await preview(page, ...AT_WALL), await preview(page, ...AT_MAT)], [PLAIN_WALL, MAT], "preview with the mat");
    await pick(page, "Comfy Bed");
    const mat = await preview(page, ...AT_MAT);
    if (JSON.stringify(mat) === JSON.stringify(MAT)) throw new Error("the mat is drawn in the preview of the bed, where it is not owned or chosen");
    // Nothing was bought by looking.
    const saved = await savedGame(page);
    expectEq([saved.coins, saved.owned], [100, []], "the save after previewing everything");
    return "each card changes the preview's pixels (wall, quilt, mat) to the literal colours, and previewing buys nothing";
  },

  "room-looks": async (open, env) => {
    const owned = await open("owned-all");
    await owned.page.waitForTimeout(300);
    expectEq(await room(owned.page, ...AT_WALL), DUSK_WALL, "the live room's wall with Dusk on the wall");
    expectEq(await room(owned.page, ...AT_BED), QUILT, "the live room's bed with the Comfy Bed");
    expectEq(await room(owned.page, ...AT_MAT), MAT, "the live room's floor with the Feeding Mat");
    const plain = await open("rich");
    await plain.page.waitForTimeout(300);
    expectEq(await room(plain.page, ...AT_WALL), PLAIN_WALL, "the plain room's wall");
    expectEq(await room(plain.page, ...AT_BED), MATTRESS, "the plain room's bed");
    const floor = await room(plain.page, ...AT_MAT);
    if (JSON.stringify(floor) === JSON.stringify(MAT)) throw new Error("the plain room has the mat's colour where the mat would be");
    return `${env.mode} Mode: the room shows what the save owns (Dusk wall, quilt, mat) and, with nothing owned, the plain wall, the plain bed and no mat`;
  },

  "hud-bed": async (open) => {
    const lines = {};
    for (const scenario of ["owned-all", "rich"]) {
      const { page } = await open(scenario);
      await page.locator('.astat[aria-label^="MOOD"]').click({ timeout: 5000 });
      await page.locator(".astat-card").waitFor({ state: "visible", timeout: 5000 });
      lines[scenario] = (await page.locator(".astat-card p").first().textContent()).trim();
    }
    expectEq(lines["owned-all"], "Falls 5 an hour awake and 0.6 an hour asleep.", "the Mood card with the Comfy Bed");
    expectEq(lines.rich, "Falls 5 an hour awake and 1.3 an hour asleep.", "the Mood card without it");
    return "the Mood card says 0.6 an hour asleep with the Comfy Bed and 1.3 without";
  },

  "reload-keeps": async (open) => {
    const { page } = await open("exact-meadow");
    await openShop(page);
    await buyButton(page, "Wallpaper: Meadow").click({ timeout: 5000 });
    await undoBar(page).waitFor({ state: "visible", timeout: 5000 });
    await savedGame(page);
    await page.reload();
    await page.getByRole("button", { name: "Habitat", exact: true }).waitFor({ timeout: 20000 });
    await page.waitForTimeout(300);
    expectEq(await room(page, ...AT_WALL), MEADOW_WALL, "the live room's wall after a reload");
    await openShop(page);
    expectEq(trimAll(await page.locator(".shop-card").nth(2).locator("button.card-btn").allTextContents()), ["Stop using"], "the Meadow card after a reload");
    expectEq(trimAll(await undoBar(page).locator("button").allTextContents()), ["Undo (10s)"], "the undo button after a reload inside the window");
    return "after a reload the wallpaper is still on the wall and owned, and the undo is still offered inside its window";
  },

  "fit-scroll": async (open) => {
    let panels = 0;
    for (const scenario of SHOP_STATES) {
      const { page } = await open(scenario);
      await openShop(page);
      const problems = await page.evaluate(fitScrollProblems);
      if (problems.length > 0) throw new Error(`${scenario}: ${problems.join("; ")}`);
      panels += 1;
    }
    return `${panels} shop panels: no sideways scroll and nothing past the window's edge`;
  },

  "fit-clip": async (open) => {
    let lines = 0;
    for (const scenario of SHOP_STATES) {
      const { page } = await open(scenario);
      await openShop(page);
      const found = await page.evaluate(fitClipProblems);
      if (found.problems.length > 0) throw new Error(`${scenario}: ${found.problems.join("; ")}`);
      if (found.lines === 0) throw new Error(`${scenario}: no text was measured`);
      lines += found.lines;
    }
    return `${SHOP_STATES.length} shop panels, ${lines} text lines, every one inside its own box, its card and the window`;
  },

  "fit-tap": async (open) => {
    let buttons = 0;
    for (const scenario of SHOP_STATES) {
      const { page } = await open(scenario);
      await openShop(page);
      const found = await page.evaluate(tapProblems);
      if (found.problems.length > 0) throw new Error(`${scenario}: ${found.problems.join("; ")}`);
      buttons += found.buttons;
    }
    return `${buttons} buttons in ${SHOP_STATES.length} shop panels, each at least 44 px high and wide`;
  },

  "btn-look": async (open) => {
    let buttons = 0;
    for (const scenario of SHOP_STATES) {
      const { page } = await open(scenario);
      await openShop(page);
      const found = await page.evaluate(btnLookProblems, [true, ".shop-card .btn.card-btn:not([aria-disabled='true']), .shop-undo .btn.card-btn", ".shop-card"]);
      if (found.problems.length > 0) throw new Error(`${scenario}: ${found.problems.join("; ")}`);
      // The control: a button made like the old defect (the card's own fill, no edge) must be caught, or this check cannot see the defect.
      if (!found.control || !found.control.some((m) => /both under 3/.test(m))) throw new Error(`${scenario}: the lazy-text control button was not caught by the fill-and-edge rule: the check cannot see the defect (${JSON.stringify(found.control)})`);
      buttons += found.buttons;
    }
    if (buttons === 0) throw new Error("no lit shop button was found in any state: the check measured nothing");
    return `${buttons} lit shop buttons have their own fill or a 3:1 edge and a readable label, and a button with neither is caught`;
  },
};

// The panels the layout checks look at: every wallet and ownership state the sheet shows.
const SHOP_STATES = ["rich", "poor", "mixed", "owned-walls", "owned-all", "just-bought", "exact-meadow"];

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
