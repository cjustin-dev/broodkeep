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
  "hat-wear": ["adult"],
  "hat-preview": ["adult"],
  "hat-places": ["adult"],
  "hat-reload": ["adult"],
  "hat-bed": ["adult"],
  "hat-kid": ["kid"],
  "room-buy": ["adult"],
  "room-undo": ["adult"],
  "room-kid": ["kid"],
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
// Where each is read. The Shop's picture is a 128 x 128 window on the room an item belongs to (previewCrop in src/art/room.ts: the corner of each window is below), and the live
// room is the home, 768 x 192 game pixels, seen through a camera. So a probe is a point of the home (a world pixel). In the picture it is read at the point minus the window's
// corner; in the live room (liveRoom below) the camera is panned to an end of the home and the point is read where the page draws it.
const CROP = { bedroom: [24, 8], living: [336, 0], kitchen: [560, 64], playroom: [848, 0] };
const WORLD_WALL_BEDROOM = [37, 10]; // the wall of the bedroom between two stripes (a wall pixel whose x ends in 5 to 9 is the base colour)
const WORLD_WALL_LIVING = [347, 2]; // the same in the living room
const WORLD_BED = [70, 58]; // the bed's quilt (the mattress where the bed has none)
const WORLD_MAT = [610, 137]; // the Feeding Mat's middle, clear of the bowl (the floor where there is none); it is on the screen at the home's right end whenever the view is 158 game pixels wide or more (768 - 610; the view is always 192 or more at the default zoom)

// The Playroom (H3): its carpet's two tones and the kitchen's floor's two tones (src/art/room.ts carpetFloor and tileFloor), as [r, g, b]; the home is 1032 game pixels wide with it built
// (43 columns of 24) and 768 without.
const CARPET = [[169, 212, 154], [151, 196, 136]]; // #a9d49a, #97c488
const KITCHEN_FLOOR = [[232, 224, 208], [207, 197, 174]]; // #e8e0d0, #cfc5ae
const WIDE = 1032;
const NARROW = 768;
const WORLD_CARPET = [900, 110]; // inside the Playroom's picture (848 to 975 across, 0 to 127 down), on the carpet (floor starts at y 48)
const WORLD_CARPET_END = [1031, 150]; // the last column of the four room home
const WORLD_KITCHEN_END = [767, 150]; // the last column of the three room home

// The hats' body colours (src/art/hat.ts; no form and no room piece draws these exactly, which the checks themselves prove with a count of 0 where no hat is on).
const KNIT = [216, 80, 79]; // #d8504f, the Knit Cap
const CROWN = [154, 163, 173]; // #9aa3ad, the Stone Crown

// What the cards say is missing (worked out from the prices in src/data/shop.ts and the wallets in gen-saves-shop.ts).
const POOR_REASONS = {
  poor: {
    "Comfy Bed": "Needs 25 more coins, 2 more Fiber and 2 more Wood.",
    "Feeding Mat": "Needs 15 more coins, 2 more Fiber and 2 more Herbs.",
    "Wallpaper: Meadow": "Needs 2 more coins and 2 more Herbs.",
    "Wallpaper: Dusk": "Needs 2 more coins and 2 more Stone.",
    Playroom: "Needs 26 more coins, 4 more Wood and 4 more Stone.",
  },
  mixed: {
    "Comfy Bed": "Needs 5 more coins, 1 more Fiber and 2 more Wood.",
    "Feeding Mat": "Needs 1 more Fiber.",
    "Wallpaper: Dusk": "Needs 1 more Stone.",
    Playroom: "Needs 6 more coins, 4 more Wood and 3 more Stone.",
  },
};

// ---------- small helpers (no closures in the page functions below: they are sent to the browser as source) ----------

const trimAll = (list) => list.map((s) => s.trim());

function expectEq(actual, expected, what) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${what}: expected ${e}, got ${a}`);
}

// A pixel is one of the tones of a floor (a tile pattern has two, and which one lies at a point depends on the tile).
function expectTone(actual, tones, what) {
  if (!tones.some((t) => JSON.stringify(t) === JSON.stringify(actual))) throw new Error(`${what}: expected one of ${JSON.stringify(tones)}, got ${JSON.stringify(actual)}`);
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

// Runs in the page: how many pixels of a canvas are exactly this colour (a count over the whole picture; the hat's cells are drawn in the palette's colours, whole pixels).
function countColour([selector, rgb]) {
  const canvas = document.querySelector(selector);
  if (!canvas) return null;
  const data = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data;
  let n = 0;
  for (let i = 0; i < data.length; i += 4) if (data[i] === rgb[0] && data[i + 1] === rgb[1] && data[i + 2] === rgb[2] && data[i + 3] === 255) n++;
  return n;
}

// Runs in the page: the first row (counted from the top of the canvas) holding a pixel of this colour (each channel within `slack`), and how many pixels of the canvas have it;
// the row is -1 when none does.
function firstRowOfColour([selector, rgb, slack]) {
  const canvas = document.querySelector(selector);
  if (!canvas) return null;
  const data = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data;
  let first = -1;
  let n = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (Math.abs(data[i] - rgb[0]) <= slack && Math.abs(data[i + 1] - rgb[1]) <= slack && Math.abs(data[i + 2] - rgb[2]) <= slack && data[i + 3] === 255) {
      n++;
      if (first === -1) first = Math.floor(i / 4 / canvas.width);
    }
  }
  return { first, n };
}

// Runs in the page: where the live room draws a world point once the camera is at the left end (the bedroom) or the right end (the kitchen) of the home: the default zoom (the
// largest whole number of device pixels per game pixel that fits the home's 192 pixel height in the square picture, at most 2.5 x the pixel ratio), the picture's middle on the
// camera's centre, a pixel in the middle of the point's block.
function worldPixelOf([selector, end, wx, wy, width = 768]) {
  const canvas = document.querySelector(selector);
  if (!canvas) return null;
  const vp = canvas.width;
  const z = Math.min(Math.max(1, Math.round(2.5 * window.devicePixelRatio)), Math.max(1, Math.floor(vp / 192)));
  const camX = end === "left" ? vp / z / 2 : width - vp / z / 2;
  const sx = Math.floor(vp / 2 + (wx - camX) * z + z / 2);
  const sy = Math.floor(vp / 2 + (wy - 96) * z + z / 2);
  if (sx < 0 || sy < 0 || sx >= vp || sy >= vp) throw new Error(`the point ${wx},${wy} is not on the screen at the ${end} end (device pixel ${sx},${sy} of ${vp}, zoom ${z})`);
  const data = canvas.getContext("2d").getImageData(sx, sy, 1, 1).data;
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

// The Shop's picture at a world point of the room it shows (a point outside that room's window is a mistake in the check, not a colour).
const preview = (page, room, world) => {
  const [x, y] = [world[0] - CROP[room][0], world[1] - CROP[room][1]];
  if (x < 0 || y < 0 || x >= 128 || y >= 128) throw new Error(`the point ${world} is outside the ${room} picture`);
  return page.evaluate(pixelOf, [".shop-preview", x, y]);
};
// A tap on a card, then a wait for the preview to be drawn again (an effect draws it a moment after the tap; the page's timers run at real speed).
const pick = async (page, name) => {
  await pickCard(page, name).click({ timeout: 5000 });
  await page.waitForTimeout(250);
};

// The live room at a world point. The camera starts framed on the creature, so it is panned to the home's left or right end with the arrow keys (20 presses cover the three room home at
// every zoom, 27 the four room one: see `width`), the frames are drawn, and the pixel is read.
async function liveRoom(page, end, world, width = NARROW) {
  // (The creature wanders in real time in these suites, so it is made to stay and look around. The pin lands inside its first idle pose, which lasts 2 seconds from the first frame
  // and ends the check's wait for the page well before that, so no walk has begun; the probes are also 150 pixels or more from where it starts.)
  await page.evaluate(() => { Math.random = () => 0.99; });
  await page.locator("canvas.room").focus();
  if (!(await page.evaluate(() => document.activeElement === document.querySelector("canvas.room")))) throw new Error("the home's picture did not take the keyboard focus, so the arrow keys cannot pan it");
  for (let i = 0; i < Math.ceil((20 * width) / NARROW); i++) await page.keyboard.press(end === "left" ? "ArrowLeft" : "ArrowRight"); // (the keys stop at the home's end: more are harmless)
  await page.clock.runFor(300);
  await page.waitForTimeout(100);
  return page.evaluate(worldPixelOf, ["canvas.room", end, ...world, width]);
}

// How many pixels of the live room (whatever it shows: the home, a field, the habitat) are this colour. The creature is made to stay still first (see liveRoom), then a few frames are drawn.
async function roomCount(page, rgb) {
  await page.evaluate(() => { Math.random = () => 0.99; });
  await page.clock.runFor(300);
  await page.waitForTimeout(100);
  return page.evaluate(countColour, ["canvas.room", rgb]);
}
// A creature asleep at night walks from the living room to the bed (20 game pixels a second) and lies down; the camera does not follow it, so Find brings the bed into view.
// (The same steps as home-browser's "home-asleep"; the timers there run in real time between steps, so the last wait is generous.)
async function toBed(page) {
  await page.clock.runFor(3000);
  await page.clock.runFor(9000);
  await page.clock.runFor(40000);
  await page.waitForTimeout(100);
  await page.locator("button.find").click({ timeout: 5000 });
  await page.clock.runFor(700);
  await page.waitForTimeout(100);
}
const previewCount = (page, rgb) => page.evaluate(countColour, [".shop-preview", rgb]);
const hatCard = (page, name) => page.locator(".shop-card", { has: page.locator(".shop-name", { hasText: name }) });
const mustBe = (n, what, zero) => {
  if (typeof n !== "number" || (zero ? n !== 0 : n <= 0)) throw new Error(`${what}: ${zero ? "expected 0" : "expected some"} pixels, got ${n}`);
  return n;
};
const closeShop = (page) => page.getByRole("button", { name: "Close", exact: true }).click({ timeout: 5000 });

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
  // (A dead creature has no Habitat button; the picture is what shows the game has loaded.)
  const ready = scenario === "hat-dead" ? page.locator("canvas.room") : page.getByRole("button", { name: "Habitat", exact: true });
  await ready.waitFor({ timeout: 20000 });
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
    expectEq(trimAll(await page.locator(".shop-name").allTextContents()), ["Comfy Bed", "Feeding Mat", "Wallpaper: Meadow", "Wallpaper: Dusk", "Hearty Bowl", "Green Bowl", "Sweet Bowl", "Stew", "Garden Mix", "Knit Cap", "Acorn Cap", "Fisher Hat", "Stone Crown", "Playroom"], "the fourteen cards, in order");
    expectEq(await page.locator(".shop-undo").count(), 0, "undo bars before any buy");
    await page.getByRole("button", { name: "Close", exact: true }).click();
    await panel(page).waitFor({ state: "hidden", timeout: 5000 });
    expectEq(await savedGame(page), before, "the saved game after opening and closing the shop");
    return "the shop opens with its fourteen cards, Close shuts it, and the saved game is exactly as it was";
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
    expectEq(await preview(page, "bedroom", WORLD_WALL_BEDROOM), MEADOW_WALL, "the preview's wall once bought");
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
    expectEq(await preview(page, "bedroom", WORLD_BED), QUILT, "the preview still shows the bed (it is the card chosen), and the card is back to Buy");
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
    expectEq([await preview(page, "bedroom", WORLD_WALL_BEDROOM), await preview(page, "bedroom", WORLD_BED)], [PLAIN_WALL, QUILT], "preview with the bed (the bedroom)");
    await pick(page, "Wallpaper: Dusk");
    expectEq(await preview(page, "living", WORLD_WALL_LIVING), DUSK_WALL, "preview with the Dusk wallpaper (the living room)");
    await pick(page, "Wallpaper: Meadow");
    expectEq(await preview(page, "living", WORLD_WALL_LIVING), MEADOW_WALL, "preview with the Meadow wallpaper (the living room)");
    await pick(page, "Feeding Mat");
    expectEq(await preview(page, "kitchen", WORLD_MAT), MAT, "preview with the mat (the kitchen)");
    await pick(page, "Hearty Bowl");
    const mat = await preview(page, "kitchen", WORLD_MAT);
    if (JSON.stringify(mat) === JSON.stringify(MAT)) throw new Error("the mat is drawn in the preview of the Hearty Bowl, where it is not owned or chosen");
    // Nothing was bought by looking.
    const saved = await savedGame(page);
    expectEq([saved.coins, saved.owned], [100, []], "the save after previewing everything");
    return "each card changes the preview's pixels (wall, quilt, mat) to the literal colours, in the room the item belongs to (bedroom, living room, kitchen); a food leaves the mat out; previewing buys nothing";
  },

  "room-looks": async (open, env) => {
    const owned = await open("owned-all");
    await owned.page.waitForTimeout(300);
    expectEq(await liveRoom(owned.page, "left", WORLD_WALL_BEDROOM), DUSK_WALL, "the live room's wall with Dusk on the wall");
    expectEq(await liveRoom(owned.page, "left", WORLD_BED), QUILT, "the live room's bed with the Comfy Bed");
    expectEq(await liveRoom(owned.page, "right", WORLD_MAT), MAT, "the live room's floor with the Feeding Mat");
    const plain = await open("rich");
    await plain.page.waitForTimeout(300);
    expectEq(await liveRoom(plain.page, "left", WORLD_WALL_BEDROOM), PLAIN_WALL, "the plain room's wall");
    expectEq(await liveRoom(plain.page, "left", WORLD_BED), MATTRESS, "the plain room's bed");
    const floor = await liveRoom(plain.page, "right", WORLD_MAT);
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
    expectEq(await liveRoom(page, "left", WORLD_WALL_BEDROOM), MEADOW_WALL, "the live room's wall after a reload");
    await openShop(page);
    expectEq(trimAll(await page.locator(".shop-card").nth(2).locator("button.card-btn").allTextContents()), ["Stop using"], "the Meadow card after a reload");
    expectEq(trimAll(await undoBar(page).locator("button").allTextContents()), ["Undo (10s)"], "the undo button after a reload inside the window");
    return "after a reload the wallpaper is still on the wall and owned, and the undo is still offered inside its window";
  },

  "hat-wear": async (open) => {
    const { page } = await open("hats-owned");
    mustBe(await roomCount(page, KNIT), "the room before any hat is on", true);
    // (The habitat is looked at before the hat goes on, so its picture of the creature is made and kept without one: a hat put on later must still show there.)
    await navButton(page, "Habitat").click({ timeout: 5000 });
    await page.waitForTimeout(300);
    mustBe(await roomCount(page, KNIT), "the habitat before any hat is on", true);
    await navButton(page, "Room").click({ timeout: 5000 });
    await page.waitForTimeout(300);
    await openShop(page);
    expectEq(trimAll(await hatCard(page, "Knit Cap").locator("button.card-btn").allTextContents()), ["Wear"], "the Knit Cap's button before");
    expectEq(await hatCard(page, "Knit Cap").locator("button.card-btn").getAttribute("aria-pressed"), "false", "its aria-pressed before");
    await hatCard(page, "Knit Cap").locator("button.card-btn").click({ timeout: 5000 });
    expectEq(trimAll(await hatCard(page, "Knit Cap").locator("button.card-btn").allTextContents()), ["Take off"], "the Knit Cap's button after Wear");
    expectEq(await hatCard(page, "Knit Cap").locator("button.card-btn").getAttribute("aria-pressed"), "true", "its aria-pressed after");
    expectEq((await savedGame(page)).hat, "hat-knit", "the saved hat after Wear");
    await closeShop(page);
    const worn = mustBe(await roomCount(page, KNIT), "the room with the Knit Cap on");
    await navButton(page, "Habitat").click({ timeout: 5000 });
    await page.waitForTimeout(300);
    mustBe(await roomCount(page, KNIT), "the habitat after Wear, which was looked at without a hat before");
    await navButton(page, "Room").click({ timeout: 5000 });
    await page.waitForTimeout(300);
    await openShop(page);
    await hatCard(page, "Stone Crown").locator("button.card-btn").click({ timeout: 5000 });
    expectEq(trimAll(await hatCard(page, "Knit Cap").locator("button.card-btn").allTextContents()), ["Wear"], "the Knit Cap's button after another hat went on");
    expectEq(trimAll(await hatCard(page, "Stone Crown").locator("button.card-btn").allTextContents()), ["Take off"], "the Stone Crown's button");
    expectEq((await savedGame(page)).hat, "hat-crown", "the saved hat after the second Wear");
    await closeShop(page);
    mustBe(await roomCount(page, KNIT), "the room after the Knit Cap was replaced", true);
    mustBe(await roomCount(page, CROWN), "the room with the Stone Crown on");
    await openShop(page);
    await hatCard(page, "Stone Crown").locator("button.card-btn").click({ timeout: 5000 });
    expectEq(trimAll(await hatCard(page, "Stone Crown").locator("button.card-btn").allTextContents()), ["Wear"], "the Stone Crown's button after Take off");
    expectEq((await savedGame(page)).hat, null, "the saved hat after Take off");
    await closeShop(page);
    mustBe(await roomCount(page, CROWN), "the room after Take off", true);
    // Buying a hat pays in one step and does not put it on: the card then offers Wear (a save with exactly 12 coins and 2 Fiber).
    const exact = await open("hat-exact");
    await openShop(exact.page);
    await buyButton(exact.page, "Knit Cap").click({ timeout: 5000 });
    const paid = await savedGame(exact.page);
    expectEq([paid.coins, paid.inventory.fiber, paid.owned, paid.hat], [0, 0, ["hat-knit"], null], "the saved game after buying the Knit Cap (coins, Fiber, owned, hat)");
    expectEq(trimAll(await hatCard(exact.page, "Knit Cap").locator("button.card-btn").allTextContents()), ["Wear"], "the Knit Cap's button after the buy");
    await closeShop(exact.page);
    mustBe(await roomCount(exact.page, KNIT), "the room after buying the Knit Cap", true);
    return `Wear puts the Knit Cap on (${worn} of its pixels in the room), another hat replaces it, Take off removes it; the buttons, aria-pressed and the saved hat follow each step; buying a hat does not put it on`;
  },

  "hat-preview": async (open) => {
    const { page } = await open("rich");
    await openShop(page);
    await pick(page, "Knit Cap");
    const knit = mustBe(await previewCount(page, KNIT), "the preview with the Knit Cap chosen");
    expectEq(await page.locator(".shop-preview").getAttribute("aria-label"), "Your creature wearing Knit Cap", "the picture's label");
    // The room behind the creature is the living room: its wall stripe (#e4d3f0) at the preview's point (4, 10), where the kitchen's picture is [207, 197, 174] (a floor tile line).
    expectEq(await page.evaluate(pixelOf, [".shop-preview", 4, 10]), [228, 211, 240], "the living room's wall in a hat's preview");
    expectEq(trimAll(await page.locator(".shop-hint").allTextContents()), ["Tap an item to see it in the room."], "the hint under a hat's preview");
    await pick(page, "Stone Crown");
    mustBe(await previewCount(page, CROWN), "the preview with the Stone Crown chosen");
    mustBe(await previewCount(page, KNIT), "the Knit Cap's colour in the Stone Crown's preview", true);
    await pick(page, "Wallpaper: Dusk");
    mustBe(await previewCount(page, KNIT), "the Knit Cap's colour in a wallpaper's preview", true);
    mustBe(await previewCount(page, CROWN), "the Stone Crown's colour in a wallpaper's preview", true);
    expectEq(await page.locator(".shop-preview").getAttribute("aria-label"), "Your room with Wallpaper: Dusk", "the picture's label for a wallpaper");
    const saved = await savedGame(page);
    expectEq([saved.coins, saved.owned, saved.hat], [100, [], null], "the save after previewing the hats (looking buys nothing and puts nothing on)");
    return `a hat's preview shows the creature wearing it (${knit} Knit Cap pixels), a wallpaper's shows none, and looking buys nothing`;
  },

  "hat-places": async (open) => {
    const worn = await open("hat-worn");
    const home = mustBe(await roomCount(worn.page, KNIT), "the home with the Knit Cap on");
    await navButton(worn.page, "Habitat").click({ timeout: 5000 });
    await worn.page.waitForTimeout(300);
    const habitat = mustBe(await roomCount(worn.page, KNIT), "the habitat with the Knit Cap on");
    // The arena is the one place (with the hatch scenes) where the creature is drawn without its hat, by choice (the plan's question 1): its picture says whose it is, no cap shows.
    await navButton(worn.page, "Arena").click({ timeout: 5000 });
    await worn.page.waitForTimeout(500);
    expectEq(await worn.page.locator("canvas.room").getAttribute("aria-label"), "The arena. Gravelhorn is ready to fight.", "the arena's picture, so the count below is of the arena");
    mustBe(await roomCount(worn.page, KNIT), "the arena's picture with the Knit Cap worn", true);
    // A sick creature is tinted green all over (scene.ts: 40% of #7bdc6a), the cap too: none of its plain colour is left, and the tinted colour is there.
    const sick = await open("hat-sick");
    const SICK_KNIT = KNIT.map((v, i) => Math.round(v * 0.6 + [123, 220, 106][i] * 0.4));
    mustBe(await roomCount(sick.page, KNIT), "the sick creature's cap in its plain colour", true);
    const tinted = await sick.page.evaluate(firstRowOfColour, ["canvas.room", SICK_KNIT, 2]);
    mustBe(tinted.n, `the sick creature's cap tinted to ${SICK_KNIT}`);
    const working = await open("hat-working");
    await navButton(working.page, "Habitat").click({ timeout: 5000 });
    await working.page.waitForTimeout(300);
    const atWork = mustBe(await roomCount(working.page, KNIT), "the habitat with the creature at work wearing the Knit Cap");
    const field = await open("hat-field");
    const inField = mustBe(await roomCount(field.page, KNIT), "the field picture with the Knit Cap on");
    const dead = await open("hat-dead");
    mustBe(await roomCount(dead.page, KNIT), "a dead creature's picture", true);
    // A dead creature is tinted grey all over (scene.ts: 75% of #8a8a8a), so a cap drawn on it would read 0.25 x its colour + 0.75 x 138, not its plain colour: that is what is counted.
    expectEq(await dead.page.locator("canvas.room").getAttribute("aria-label"), "Gravelhorn has passed away.", "the dead creature's picture, so the count below is of it");
    const DEAD_KNIT = KNIT.map((v) => Math.round(v * 0.25 + 138 * 0.75));
    mustBe((await dead.page.evaluate(firstRowOfColour, ["canvas.room", DEAD_KNIT, 2])).n, `a dead creature's picture, the cap's colour tinted grey (${DEAD_KNIT})`, true);
    return `the Knit Cap shows in the home (${home} pixels), the habitat (${habitat}), a creature at work in the habitat (${atWork}) and the field picture (${inField}), tinted green on a sick creature (${tinted.n} pixels), and not on a dead creature or in the arena`;
  },

  "hat-reload": async (open) => {
    const { page } = await open("hat-worn");
    mustBe(await roomCount(page, KNIT), "the room with the Knit Cap on");
    await savedGame(page);
    await page.reload();
    await page.getByRole("button", { name: "Habitat", exact: true }).waitFor({ timeout: 20000 });
    await page.waitForTimeout(300);
    mustBe(await roomCount(page, KNIT), "the room after a reload");
    await openShop(page);
    expectEq(trimAll(await hatCard(page, "Knit Cap").locator("button.card-btn").allTextContents()), ["Take off"], "the Knit Cap's button after a reload");
    return "after a reload the hat is still on the creature and its card still says Take off";
  },

  "hat-bed": async (open) => {
    // The blanket's top edge (#ffc2d6, drawn only by the blanket) is on the same row with the Knit Cap on as without it. A hat moves the lying picture's blanket box up two rows
    // for a Scorchlet (tests/hats.test.ts), so a blanket fitted to the hatted picture would start two game pixels higher. The hat itself is on the sleeper under the blanket.
    // Lights are off while it sleeps: the whole picture is covered by rgba(15, 10, 50, 0.4) (scene.ts), so each colour is read as 0.6 x itself + (6, 4, 20), give or take 2.
    const night = (rgb) => [Math.round(rgb[0] * 0.6 + 6), Math.round(rgb[1] * 0.6 + 4), Math.round(rgb[2] * 0.6 + 20)];
    const EDGE = night([255, 194, 214]);
    const bare = await open("hat-asleep-bare");
    await toBed(bare.page);
    const worn = await open("hat-asleep");
    await toBed(worn.page);
    const a = await bare.page.evaluate(firstRowOfColour, ["canvas.room", EDGE, 2]);
    const b = await worn.page.evaluate(firstRowOfColour, ["canvas.room", EDGE, 2]);
    if (!a || a.first < 0) throw new Error(`no blanket edge on the bare sleeper (${JSON.stringify(a)}, looking for ${EDGE})`);
    expectEq([b.first, b.n], [a.first, a.n], "the blanket's first row and size with the Knit Cap on, against without it");
    const cap = await worn.page.evaluate(firstRowOfColour, ["canvas.room", night(KNIT), 2]);
    const none = await bare.page.evaluate(firstRowOfColour, ["canvas.room", night(KNIT), 2]);
    mustBe(cap.n, "the sleeper's picture with the Knit Cap on");
    mustBe(none.n, "the bare sleeper's picture", true);
    return `the blanket edge starts on device row ${a.first} (${a.n} pixels) with the Knit Cap on and without it, and the cap shows on the sleeper (${cap.n} pixels)`;
  },

  "hat-kid": async (open) => {
    const { page } = await open("hat-worn");
    const n = mustBe(await roomCount(page, KNIT), "the Kid Mode room with a worn hat");
    expectEq(await page.getByRole("button", { name: /shop/i }).count(), 0, "buttons with Shop in their name in Kid Mode");
    return `a hat worn in Adult Mode (the saved game has it on) still shows in Kid Mode (${n} pixels) and Kid Mode still has no Shop`;
  },

  // The Playroom (H3): the last of the fourteen cards, its price, the picture of the room itself, an exact buy, "Built", and the home it makes.
  "room-buy": async (open) => {
    const { page } = await open("room-exact");
    expectTone(await liveRoom(page, "right", WORLD_KITCHEN_END), KITCHEN_FLOOR, "the live home's last column before the buy (the kitchen's floor)");
    await openShop(page);
    expectEq(await page.locator(".shop-card").count(), 14, "the number of cards");
    const card = page.locator(".shop-card").last();
    expectEq(trimAll(await card.locator(".shop-name").allTextContents()), ["Playroom"], "the last card's name");
    expectEq(trimAll(await card.locator(".shop-effect").allTextContents()), ["A fourth room, to the right of the kitchen. It starts empty."], "the Playroom's effect line");
    expectEq(await card.locator(".shop-cost [role=img]").evaluateAll((chips) => chips.map((c) => c.getAttribute("aria-label"))), ["36 coins, you have 36", "4 Wood, you have 4", "4 Stone, you have 4"], "the Playroom's price chips");
    expectEq(await buyButton(page, "Playroom").getAttribute("aria-disabled"), null, "the Buy button of a wallet that pays exactly");
    // The picture is the room itself, whether or not it is built: nothing of its carpet shows while the bed is the card chosen.
    expectEq((await previewCount(page, CARPET[0])) + (await previewCount(page, CARPET[1])), 0, "carpet pixels in the picture of the bed");
    await pick(page, "Playroom");
    expectEq(await page.locator(".shop-preview").getAttribute("aria-label"), "Your room with Playroom", "the picture's label");
    const shown = mustBe((await previewCount(page, CARPET[0])) + (await previewCount(page, CARPET[1])), "carpet pixels in the picture of the Playroom");
    expectTone(await preview(page, "playroom", WORLD_CARPET), CARPET, "the Playroom's picture at its carpet");
    expectEq((await savedGame(page)).owned, [], "owned after looking at the Playroom");
    await buyButton(page, "Playroom").click({ timeout: 5000 });
    await undoBar(page).waitFor({ state: "visible", timeout: 5000 });
    const saved = await savedGame(page);
    expectEq([saved.coins, saved.inventory.wood, saved.inventory.stone], [0, 0, 0], "coins, Wood and Stone after buying at exactly the price");
    expectEq(saved.owned, ["room-play"], "owned");
    expectEq(saved.lastBuy, { item: "room-play", at: T, wall: null }, "the undo record");
    expectEq(saved.home, undefined, "the saved home (buying a room writes none: an empty room has nothing to save)");
    expectEq(trimAll(await undoBar(page).locator("button").allTextContents()), ["Undo (10s)"], "the undo button");
    expectEq(await buyButton(page, "Playroom").count(), 0, "Buy buttons for the room just bought");
    expectEq(trimAll(await card.locator(".shop-owned").allTextContents()), ["Built"], "the owned card's words");
    expectEq(await card.locator(".shop-cost").count(), 0, "price chips on the owned card");
    expectEq(await card.locator("button.card-btn").count(), 0, "buttons on the owned card");
    expectEq(await page.locator('.shop-wallet [aria-label="0 coins"]').count(), 1, "the wallet's coins");
    mustBe((await previewCount(page, CARPET[0])) + (await previewCount(page, CARPET[1])), "carpet pixels in the picture once built");
    await closeShop(page);
    expectTone(await liveRoom(page, "right", WORLD_CARPET_END, WIDE), CARPET, "the live home's last column after the buy (the Playroom's carpet, the home 1032 wide)");
    return `the Playroom is the 14th card with its three price chips, its picture is the empty room (${shown} carpet pixels, none in the bed's), buying at exactly 36 coins + 4 Wood + 4 Stone leaves 0, 0, 0, says "Built", saves no home and the live home grows to the Playroom's carpet`;
  },

  "room-undo": async (open) => {
    const { page } = await open("room-just-bought");
    expectTone(await liveRoom(page, "right", WORLD_CARPET_END, WIDE), CARPET, "the live home's last column with the Playroom built");
    await openShop(page);
    expectEq(trimAll(await undoBar(page).locator("button").allTextContents()), ["Undo (7s)"], "the undo button 3 seconds after the buy");
    await undoBar(page).locator("button").click({ timeout: 5000 });
    await undoBar(page).waitFor({ state: "hidden", timeout: 5000 });
    const saved = await savedGame(page);
    expectEq([saved.coins, saved.inventory.wood, saved.inventory.stone], [36, 4, 4], "the refund");
    expectEq(saved.owned, ["wall-dusk"], "owned after the undo (the wallpaper stays)");
    expectEq(saved.lastBuy, null, "the undo record after the undo");
    expectEq(saved.home, { pieces: { dresser: null } }, "the saved home after the undo (the dresser in the Playroom put away, its wall entry gone)");
    expectEq(await buyButton(page, "Playroom").count(), 1, "the Buy button for the room given back");
    await closeShop(page);
    expectTone(await liveRoom(page, "right", WORLD_KITCHEN_END, NARROW), KITCHEN_FLOOR, "the live home's last column after the undo (the kitchen's floor, the home 768 wide)");
    return "the undo 3 seconds after buying the Playroom refunds 36 coins, 4 Wood and 4 Stone, keeps the wallpaper, puts the dresser that stood in the room away, drops the room's wall entry and the live home is three rooms again";
  },

  "room-kid": async (open) => {
    const { page } = await open("room-owned");
    expectTone(await liveRoom(page, "right", WORLD_CARPET_END, WIDE), CARPET, "the Kid Mode home's last column with the Playroom owned");
    expectEq(await page.getByRole("button", { name: /shop/i }).count(), 0, "buttons with Shop in their name in Kid Mode");
    return "a Playroom bought in Adult Mode (the saved game owns it) is built in Kid Mode too, and Kid Mode still has no Shop";
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
const SHOP_STATES = ["rich", "poor", "mixed", "owned-walls", "owned-all", "just-bought", "exact-meadow", "hats-owned", "hat-worn", "room-exact", "room-owned"];

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
