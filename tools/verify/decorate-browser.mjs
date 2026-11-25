// Browser checks for Home slice H2b (docs/home-plan.md section 12): Decorate mode. The button over the picture, the tray in place of the care buttons, a tap that selects a piece,
// a finger that carries it on the tile grid (white where the rules allow it, red where not), the arrow keys, the Feeding Mat that only counts once owned, and what a second finger,
// a third, a cancel or a long hold on the creature do. Real touch events (CDP Input.dispatchTouchEvent), a real mouse and real keys, against the built game (dist/).
//
// Run: node decorate-browser.mjs --base http://127.0.0.1:4173 [--only id1,id2] [--sizes 320x568@2,360x640@2] [--modes kid,adult]
// Exit: 0 when no check failed and at least one ran; 1 when any FAIL; 2 when the script broke (a requested --only id ran zero times, an unknown id, a bad flag, or a crash
// outside a check). A check that throws or times out prints a FAIL line, never a crash.
//
// What it sees: the picture's own pixels (the game keeps the camera and the layout out of the page; the saved layout is read from IndexedDB, where the game writes `home`). Expected
// values are literals worked out by hand from src/data/home.ts and src/art/room.ts, never the page's own functions:
//   - the starter layout is bed (1,1), dresser (6,1), sofa (13,1) 4x2, rug (13,4) 4x3, table (17,4) 2x2, counter (23,1), fridge (30,1), mat (23,5) 3x1, bowl (24,5); a saved `home`
//     lists all nine in that order, a put-away piece as null;
//   - the sofa's seat is colour 6a8ae0 at world (340,59) in the starter home and at (430,59) once it is at column 15; wood (d9a066 or c78d52) where it was;
//   - an outline (src/art/room.ts drawOutline) is a dark pixel (1a1020) and two of the colour inside it, white (ffffff) or red (e0455b), on the piece's tile edge;
//   - the camera opens on world (384, 96) (the adult's middle); a piece out of the tray lands with its middle on the middle of the view, tile (16, 4), so the 4 x 2 sofa at (14,3);
//   - a creature stands still when a band of the picture over its first box (x 360 to 408, y 96 to 144) changes by under 25 % in 12 s (its bobbing alone: 8 to 10 %), against over 30 %
//     for the control that may walk (67 %)
//     (Math.random answers 0 on these pages, so a free creature does walk).
// Date.now is fixed at T (Playwright's setFixedTime), but the page's timers and frames are NOT paused: they run in real time between a check's steps, and runFor() jumps them
// forward on top of that. Saves come from gen-saves (saves/<scenario>-<mode>.json).
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

const require = createRequire(process.env.PLAYWRIGHT_FROM ?? join(homedir(), "homelab-dashboard", "package.json"));
const { chromium } = require("playwright");

const OUT = process.env.VERIFY_OUT ?? join(tmpdir(), "broodkeep-verify");
const SAVES = join(OUT, "saves");

const T = 1795359600000; // 2026-11-22T15:00:00Z, frozen
const CHECK_TIMEOUT_MS = 180_000;

// The windows: the picture's size in device pixels, the zoom it opens at, the largest zoom (round(2.5 x ratio)), and the arrow keys' step (round(vp / 5)).
const WINDOWS = {
  "320x568@2": { vp: 512, z: 2, max: 5 },
  "360x640@2": { vp: 640, z: 3, max: 5 },
  "390x844@3": { vp: 1024, z: 5, max: 8 },
  "360x640@1": { vp: 256, z: 1, max: 3 },
};
const PHONES = Object.keys(WINDOWS).map((k) => k.split(/[x@]/).map(Number));
const DESKTOPS = [[1024, 768, 1]];
// ---------- small helpers ----------

const oneLine = (text) => String(text).replace(/\s+/g, " ").slice(0, 600);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function withTimeout(promise, ms) {
  let timer;
  const expired = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`timed out after ${ms / 1000} s`)), ms);
  });
  return Promise.race([promise, expired]).finally(() => clearTimeout(timer));
}

function expectEq(actual, expected, what) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${what}: expected ${e}, got ${a}`);
}

const load = (name, mode) => JSON.parse(readFileSync(join(SAVES, `${name}-${mode}.json`), "utf8"));
// The saved games: the living creature at home (an adult, a kid), an egg, one away on a job, and two made from the first (dead, asleep: the same edits the game's own saves hold).
const SAVE_OF = {
  awake: (mode) => load("adult-home", mode),
  kid: (mode) => load("kid-home", mode),
  young: (mode) => load("young-home", mode),
  egg: (mode) => load("egg", mode),
  away: (mode) => load("adult-away", mode),
  dead: (mode) => {
    const save = load("adult-home", mode);
    save.phase = "dead";
    return save;
  },
  asleep: (mode) => {
    const save = load("adult-home", mode);
    save.creature.sleep = "night";
    return save;
  },
  moved: (mode) => load("adult-home-moved", mode), // the sofa at column 15 and the rug at column 11 (saves.home), see gen-saves.ts
  bedMoved: (mode) => load("adult-home-bedmoved", mode), // the bed at column 17, row 1, in the living room
  bedMovedAsleep: (mode) => {
    const save = load("adult-home-bedmoved", mode);
    save.creature.sleep = "night";
    return save;
  },
};

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

// Runs in the page: the saved game as the game wrote it.
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

// Runs in the page: the picture's size and where it is on the screen (CSS pixels), and the page's own measures.
function canvasBox() {
  const c = document.querySelector("canvas.room");
  const r = c.getBoundingClientRect();
  return {
    w: c.width,
    h: c.height,
    left: r.left,
    top: r.top,
    cssW: r.width,
    cssH: r.height,
    label: c.getAttribute("aria-label"),
    tabindex: c.getAttribute("tabindex"),
    touchAction: getComputedStyle(c).touchAction,
    pageScroll: Math.round(document.scrollingElement.scrollTop),
    pageMax: Math.round(document.scrollingElement.scrollHeight - innerHeight),
    sideways: document.documentElement.scrollWidth > innerWidth,
    pageZoom: window.visualViewport ? window.visualViewport.scale : 1,
  };
}

// Runs in the page: the rows y0 to y1 (device pixels) of the picture, one number per pixel (red, green, blue packed).
function bandPixels([y0, y1]) {
  const c = document.querySelector("canvas.room");
  const d = c.getContext("2d").getImageData(0, y0, c.width, y1 - y0).data;
  const out = new Array(c.width * (y1 - y0));
  for (let i = 0; i < out.length; i++) out[i] = (d[i * 4] << 16) | (d[i * 4 + 1] << 8) | d[i * 4 + 2];
  return { w: c.width, rows: y1 - y0, px: out };
}

// Runs in the page: one pixel of the picture, packed.
function pixelAt([x, y]) {
  const c = document.querySelector("canvas.room");
  const d = c.getContext("2d").getImageData(x, y, 1, 1).data;
  return (d[0] << 16) | (d[1] << 8) | d[2];
}

// Runs in the page: how wide the wall's stripes are, in device pixels. The home's first rows (world y 0 to 4) are plain stripes whatever is below, so the rows from the first one
// that is not void down 4 zoom steps are scanned (zoom unknown here: 8 rows from the first, which are inside the first 4 game pixels at any zoom of 2 or more, and 4 at zoom 1)
// and the most common run of a stripe colour that touches neither edge is the width.
function stripeWidth() {
  const c = document.querySelector("canvas.room");
  const W = c.width;
  const H = c.height;
  const d = c.getContext("2d").getImageData(0, 0, W, H).data;
  const px = (x, y) => (d[(y * W + x) * 4] << 16) | (d[(y * W + x) * 4 + 1] << 8) | d[(y * W + x) * 4 + 2];
  const VOID = 0x120c20;
  const STRIPE = new Set([0xefe3f7, 0xe4d3f0]);
  let r0 = 0;
  while (r0 < H && px(W >> 1, r0) === VOID) r0++; // (the middle column: at zoom 1 in a picture wider than the home the sides are void too)
  const counts = new Map();
  for (let y = r0 + 1; y < Math.min(H, r0 + 4); y++) {
    let start = 0;
    for (let x = 1; x <= W; x++) {
      if (x === W || px(x, y) !== px(start, y)) {
        const colour = px(start, y);
        if (STRIPE.has(colour) && start > 0 && x < W) counts.set(x - start, (counts.get(x - start) ?? 0) + 1);
        start = x;
      }
    }
  }
  let best = 0;
  let bestN = 0;
  for (const [len, n] of counts) if (n > bestN) [best, bestN] = [len, n];
  return { width: best, runs: bestN, firstRow: r0 };
}

// What fraction of the pixels of band `a` are not where band `b` shows them, when the picture moved by `shift` device pixels to the right (negative: to the left)?
function mismatch(a, b, shift) {
  let bad = 0;
  let total = 0;
  for (let row = 0; row < a.rows; row++) {
    for (let x = 0; x < a.w; x++) {
      const nx = x + shift;
      if (nx < 0 || nx >= a.w) continue;
      total++;
      if (a.px[row * a.w + x] !== b.px[row * a.w + nx]) bad++;
    }
  }
  if (total < a.w / 2) throw new Error(`a shift of ${shift} leaves too little to compare (${total} pixels)`);
  return bad / total;
}

// ---------- the page, the fingers ----------

async function openGame(env, save, track, extra = {}) {
  const context = await env.browser.newContext({
    viewport: { width: env.w, height: env.h },
    deviceScaleFactor: env.dpr,
    ...(env.touch ? { isMobile: true, hasTouch: true } : {}),
    ...(extra.reducedMotion ? { reducedMotion: "reduce" } : {}),
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
  // The creature wanders at random (a pose lasts 1 to 3 seconds, then it walks, hops or turns), so where it stands is not known. A Math.random that always answers 0.99
  // makes every choice "stay and look around", and the creature is where the game put it unless a check sends it somewhere (the walk to the bed does not use the dice).
  const rand = extra.rand ?? 0.99; // (the dice: a creature that may move does when this is low, and stays and looks around at 0.99)
  await page.addInitScript((r) => { Math.random = () => r; }, rand);
  await page.clock.install({ time: T });
  await page.clock.setFixedTime(T);
  const stub = `${env.base}/seed`;
  await page.route(stub, (route) => route.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html><title>seed</title>" }));
  await page.goto(stub);
  await page.evaluate(seedSave, save);
  await page.goto(`${env.base}/`);
  await page.locator("canvas.room").waitFor({ timeout: 20000 });
  await page.locator("canvas.room").scrollIntoViewIfNeeded();
  await page.clock.runFor(100); // the first frames: the home is framed
  await page.waitForTimeout(100);
  const cdp = env.touch ? await context.newCDPSession(page) : null;
  return { page, cdp, errors };
}

const frame = (page, ms = 60) => page.clock.runFor(ms);

// The picture's geometry for this window, from the table above, with the page's own size checked against it.
async function geometry(env, page) {
  const win = WINDOWS[`${env.w}x${env.h}@${env.dpr}`];
  const box = await page.evaluate(canvasBox);
  if (!win) {
    const max = Math.round(2.5 * env.dpr);
    const z = Math.min(max, Math.max(1, Math.floor(box.w / 192))); // (the largest whole zoom at which the home's 192 pixels still fit, up to the largest zoom)
    return { box, vp: box.w, z, max, top: (box.w - 192 * z) / 2 };
  }
  if (box.w !== win.vp || box.h !== win.vp) throw new Error(`the picture is ${box.w} x ${box.h} device pixels, expected ${win.vp} x ${win.vp} at ${env.w} wide, ratio ${env.dpr}`);
  return { box, vp: win.vp, z: win.z, max: win.max, top: (win.vp - 192 * win.z) / 2 };
}

// A finger from (x, y) to (x2, y2) in CSS pixels of the window, in `steps` moves 16 ms apart, then up. `hold` is the time (fake clock, ms) the finger stays at the end before it lifts.
async function touchDrag(page, cdp, [x, y], [x2, y2], { steps = 12, hold = 0 } = {}) {
  const send = (type, points) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: points });
  await send("touchStart", [{ x, y }]);
  for (let i = 1; i <= steps; i++) {
    await send("touchMove", [{ x: x + ((x2 - x) * i) / steps, y: y + ((y2 - y) * i) / steps }]);
    await sleep(16);
  }
  if (hold > 0) await page.clock.runFor(hold);
  await send("touchEnd", []);
  await sleep(40);
  await frame(page);
}

// Two fingers on a line through (cx, cy), `d0` apart, moved to `d1` apart, then both up.
async function pinch(page, cdp, [cx, cy], d0, d1, steps = 10) {
  const send = (type, points) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: points });
  const two = (d) => [
    { x: cx - d / 2, y: cy, id: 1 },
    { x: cx + d / 2, y: cy, id: 2 },
  ];
  await send("touchStart", [two(d0)[0]]);
  await send("touchStart", two(d0));
  for (let i = 1; i <= steps; i++) {
    await send("touchMove", two(d0 + ((d1 - d0) * i) / steps));
    await sleep(16);
  }
  await sleep(60);
  await send("touchEnd", []);
  await sleep(40);
  await frame(page);
}

// A finger that stays: down at (x, y) (CSS pixels), the fake clock runs `ms`, up.
async function touchHold(page, cdp, [x, y], ms) {
  const send = (type, points) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: points });
  await send("touchStart", [{ x, y }]);
  let left = ms;
  while (left > 0) {
    const step = Math.min(100, left);
    await page.clock.runFor(step);
    left -= step;
  }
  await send("touchEnd", []);
  await sleep(40);
  await frame(page);
}

// A quick tap: down, 60 ms, up.
const touchTap = (page, cdp, at) => touchHold(page, cdp, at, 60);

// The saved game, once the game has written it (it waits 600 ms after a change).
async function savedGame(page) {
  await page.clock.runFor(800);
  let last = JSON.stringify(await page.evaluate(readSave));
  for (let i = 0; i < 40; i++) {
    await page.waitForTimeout(50);
    const now = JSON.stringify(await page.evaluate(readSave));
    if (now === last) return JSON.parse(now); // (the write has landed: two reads 50 ms apart agree)
    last = now;
  }
  throw new Error("the saved game kept changing for 2 seconds");
}

// Where a world point is on the screen (CSS pixels of the window), for a camera centred on (camX, camY) at zoom z.
const screenOf = (box, vp, z, dpr, cam, [wx, wy]) => [box.left + (vp / 2 + (wx - cam[0]) * z) / dpr, box.top + (vp / 2 + (wy - cam[1]) * z) / dpr];

// The band of the wall every pan check compares: world y 4 to 44, at the zoom the home is at.
const wallBand = (g, z = g.z) => [g.top + 4 * z, g.top + 44 * z];

// Throws unless band `b` is band `a` moved by `shift` device pixels (and the half-stripe shift is clearly not it, so the band says something).
function expectMoved(a, b, shift, z, what) {
  const got = mismatch(a, b, shift);
  if (got !== 0) throw new Error(`${what}: the picture did not move by ${shift} device pixels (${Math.round(got * 1000) / 10} % of the wall differs)`);
  const wrong = mismatch(a, b, shift + 5 * z);
  if (wrong < 0.2) throw new Error(`${what}: the wall looks the same moved by ${shift + 5 * z} as by ${shift} (${Math.round(wrong * 1000) / 10} % differs), so the comparison cannot tell`);
}

// The same, for the columns x0 to x1 of the bands only, with no shift.
function regionMismatch(a, b, x0, x1) {
  let bad = 0;
  let total = 0;
  for (let row = 0; row < a.rows; row++) {
    for (let x = x0; x < x1; x++) {
      total++;
      if (a.px[row * a.w + x] !== b.px[row * a.w + x]) bad++;
    }
  }
  return bad / total;
}

function expectStill(a, b, what) {
  const got = mismatch(a, b, 0);
  if (got !== 0) throw new Error(`${what}: the picture moved (${Math.round(got * 1000) / 10} % of the wall differs)`);
}

// ---------- Decorate mode: what the checks know ----------

// More saved games (gen-saves.ts): the Feeding Mat owned and out, the dresser and the mat put away, and everything but the bed put away (the mat owned in all three).
SAVE_OF.mat = (mode) => load("adult-home-mat", mode);
SAVE_OF.trayed = (mode) => load("adult-home-trayed", mode);
SAVE_OF.allTrayed = (mode) => load("adult-home-alltrayed", mode);
SAVE_OF.walls = (mode) => load("adult-home-walls", mode);
SAVE_OF.wallsSet = (mode) => load("adult-home-walls-set", mode);
SAVE_OF.room = (mode) => load("adult-home-room", mode); // the Playroom owned, the dresser put away (H3)
SAVE_OF.blocked = (mode) => load("adult-home-blocked", mode); // a table at (30, 4), no Playroom
SAVE_OF.blockedRoom = (mode) => load("adult-home-blocked-room", mode); // the same table, the Playroom owned: it is read as put away

const CHECK_MODES = {
  "decorate-open": ["adult", "kid"],
  "decorate-still": ["adult", "kid"],
  "decorate-select": ["adult", "kid"],
  "decorate-move": ["adult", "kid"],
  "decorate-tray": ["adult", "kid"],
  "decorate-mat": ["adult", "kid"],
  "decorate-fit": ["adult", "kid"],
  "decorate-gestures": ["adult", "kid"],
  "decorate-mouse": ["adult", "kid"],
  "decorate-walls": ["adult", "kid"],
  "decorate-grow": ["adult", "kid"],
};
const ALL_IDS = Object.keys(CHECK_MODES);
const ALL_MODES = ["kid", "adult"];
const CHECK_SIZES = {
  "decorate-open": PHONES,
  "decorate-still": [[360, 640, 2]],
  "decorate-select": PHONES,
  "decorate-move": PHONES,
  "decorate-tray": PHONES,
  "decorate-mat": [[360, 640, 2]],
  "decorate-fit": PHONES,
  "decorate-gestures": PHONES,
  "decorate-mouse": DESKTOPS,
  "decorate-walls": PHONES,
  "decorate-grow": PHONES,
};
const TOUCH_CHECKS = new Set(["decorate-open", "decorate-still", "decorate-select", "decorate-move", "decorate-tray", "decorate-mat", "decorate-fit", "decorate-gestures", "decorate-walls", "decorate-grow"]);

// The nine pieces at the start, in the order the game saves them (src/data/home.ts KINDS): a saved `home` lists every piece, a put-away one as null.
const START = {
  bed: { col: 1, row: 1 },
  dresser: { col: 6, row: 1 },
  sofa: { col: 13, row: 1 },
  rug: { col: 13, row: 4 },
  table: { col: 17, row: 4 },
  counter: { col: 23, row: 1 },
  fridge: { col: 30, row: 1 },
  mat: { col: 23, row: 5 },
  bowl: { col: 24, row: 5 },
};
const homeWith = (changes) => ({ pieces: { ...START, ...changes } });

const WHITE = 0xffffff;
const DARK = 0x1a1020; // the outline's outer edge (src/art/room.ts drawOutline)
const RED = 0xe0455b; // a spot the rules refuse
const SEAT = 0x6a8ae0; // the sofa's seat (x + 8 to x + w - 8, y + 26 to y + 44 of a sofa at (x, y))
const WOOD = [0xd9a066, 0xc78d52];
const WALL = [0xefe3f7, 0xe4d3f0];
const TILE_FLOOR = [0xe8e0d0, 0xcfc5ae]; // the kitchen's floor (src/art/room.ts tileFloor)
const CARPET = [0xa9d49a, 0x97c488]; // the Playroom's floor (src/art/room.ts carpetFloor)
const FRAME = 0x6d4a2a; // the doorway's frame and lintel
const TABLE_TOP = 0xc4894f; // the table's top (src/art/room.ts drawSolid)
const hex = (v) => v.toString(16).padStart(6, "0");
const OPEN_CAMERA = [384, 96]; // the camera opens on the adult's middle (home-browser.mjs, home-open)
const SEAT_OLD = [340, 59]; // the starter sofa (13, 1): seat x 320 to 400, y 50 to 68
const SEAT_NEW = [430, 59]; // a sofa at (15, 1): seat x 368 to 448

const SELECTED_LABEL = (piece) => `Decorating the home. The ${piece} is selected. The arrow keys move it.`;
const NOTHING_LABEL = "Decorating the home. Nothing is selected.";

// The game rounds the offset first, Math.round(vp / 2 - camera x zoom), and draws the world on whole device pixels from there, so the middle of a game pixel is whole + floor(zoom / 2).
const dev = (g, [camX, camY], [wx, wy]) => [Math.round(g.vp / 2 - camX * g.z) + wx * g.z + Math.floor(g.z / 2), Math.round(g.vp / 2 - camY * g.z) + wy * g.z + Math.floor(g.z / 2)];

async function probe(page, g, camera, world, want, what) {
  const [x, y] = dev(g, camera, world);
  const got = await page.evaluate(pixelAt, [x, y]);
  const ok = Array.isArray(want) ? want.includes(got) : got === want;
  if (!ok) throw new Error(`${what}: world (${world}) at device (${x}, ${y}) is ${hex(got)}, expected ${Array.isArray(want) ? want.map(hex).join(" or ") : hex(want)}`);
}

// The outline of a piece whose top left tile is (col, row) and which is `rows` tiles high: its left edge, halfway down, is a dark pixel then two of `color`.
async function ring(page, g, camera, [col, row, rows], color, what) {
  const x = col * 24;
  const y = row * 24 + rows * 12;
  await probe(page, g, camera, [x, y], DARK, `${what}: the outline's edge`);
  await probe(page, g, camera, [x + 1, y], color, `${what}: the outline's first line`);
  await probe(page, g, camera, [x + 2, y], color, `${what}: the outline's second line`);
}

async function noRing(page, g, camera, [col, row, rows], what) {
  const x = col * 24;
  const y = row * 24 + rows * 12;
  const [px, py] = dev(g, camera, [x + 1, y]);
  const got = await page.evaluate(pixelAt, [px, py]);
  if (got === WHITE || got === RED) throw new Error(`${what}: an outline is still drawn at world (${x + 1}, ${y}) (${hex(got)})`);
}

const pictureLabel = async (page) => (await page.evaluate(canvasBox)).label;
const worldPoint = async (page, g, env, camera, world) => screenOf(await page.evaluate(canvasBox), g.vp, g.z, env.dpr, camera, world); // (read again each time: a taller page scrolls)
async function tapOn(page, locator) {
  await locator.scrollIntoViewIfNeeded();
  const b = await locator.boundingBox();
  await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2);
}
const press = (env, locator) => (env.touch ? locator.tap() : locator.click());
const decorateButton = (page) => page.getByRole("button", { name: "Decorate the home" });
const doneButton = (page) => page.getByRole("button", { name: "Done decorating" });
const binButton = (page) => page.getByRole("button", { name: /^Put (the .* away|away the selected piece)$/ });
const trayNames = (page) => page.locator(".tray.pieces button").evaluateAll((els) => els.map((el) => el.getAttribute("aria-label")));

// The three wall colours (src/data/shop.ts), as the picture draws them: the stripe, the wall and the baseboard.
const WALLS = {
  plain: { stripe: 0xe4d3f0, base: 0xefe3f7, board: 0x8a6bd1 },
  meadow: { stripe: 0xcde6bd, base: 0xdff0d2, board: 0x4f8a3f },
  dusk: { stripe: 0x827eb8, base: 0x8e8ac4, board: 0x3b3570 },
};
const rgb = (v) => `rgb(${v >> 16}, ${(v >> 8) & 255}, ${v & 255})`;

// A room's wall at world column x0 (a multiple of 10: the stripes are 5 wide every 10 pixels from 0): the stripe at x0 + 2, the wall at x0 + 7 (both in the top row of tiles, above every
// piece) and the baseboard at x0 + 2, y 44 (the baseboard is y 44 to 47; a selected wall's outline takes 45 to 47, so y 44 is the one row of it that the outline never covers).
async function wallAt(page, g, camera, x0, wall, what) {
  await probe(page, g, camera, [x0 + 2, 10], wall.stripe, `${what}: the stripe`);
  await probe(page, g, camera, [x0 + 7, 10], wall.base, `${what}: the wall`);
  await probe(page, g, camera, [x0 + 2, 44], wall.board, `${what}: the baseboard`);
}

// The outline round a room's wall, on its top edge (world y 0 to 2) at world x: a dark pixel and two of `color`.
async function topRing(page, g, camera, x, color, what) {
  await probe(page, g, camera, [x, 0], DARK, `${what}: the outline's edge`);
  await probe(page, g, camera, [x, 1], color, `${what}: the outline's first line`);
  await probe(page, g, camera, [x, 2], color, `${what}: the outline's second line`);
}

async function noTopRing(page, g, camera, x, what) {
  const [px, py] = dev(g, camera, [x, 1]);
  const got = await page.evaluate(pixelAt, [px, py]);
  if (got === WHITE) throw new Error(`${what}: an outline is still drawn at world (${x}, 1)`);
}

// The arrow keys with the picture focused: the picture pans (nothing, or a wall, is selected, so they do not move a piece).
async function pan(page, key, times) {
  await page.locator("canvas.room").focus();
  for (let i = 0; i < times; i++) {
    await page.keyboard.press(key);
    await frame(page, 40);
  }
}

const swatchNames = (page) => trayNames(page);
const swatchPressed = (page) => page.locator(".tray.pieces button").evaluateAll((els) => els.map((el) => el.getAttribute("aria-pressed")));
const swatchLooks = (page) =>
  page.locator(".tray.pieces button .swatch").evaluateAll((els) =>
    els.map((el) => {
      const style = getComputedStyle(el);
      return { board: style.borderBottomColor, image: style.backgroundImage };
    }),
  );

// The swatches in the dock are the named wallpapers, in this order: each has its wallpaper's baseboard under its stripes (the wall colour first, then the stripe colour).
async function expectSwatches(page, names, what) {
  const got = await swatchLooks(page);
  expectEq(got.map((s) => s.board), names.map((n) => rgb(WALLS[n].board)), `${what}: the baseboard colours`);
  got.forEach((s, i) => {
    const wall = WALLS[names[i]];
    const base = s.image.indexOf(rgb(wall.base));
    const stripe = s.image.indexOf(rgb(wall.stripe));
    if (!(s.image.startsWith("repeating-linear-gradient(") && base > 0 && stripe > base)) throw new Error(`${what}: swatch ${i} (${names[i]}) is drawn as ${s.image}, expected the wall ${rgb(wall.base)} then the stripe ${rgb(wall.stripe)}`);
  });
}

async function enter(env, page) {
  await press(env, decorateButton(page));
  await frame(page);
  expectEq(await decorateButton(page).count(), 0, "Decorate buttons once Decorate mode is on");
  expectEq(await doneButton(page).count(), 1, "Done buttons once Decorate mode is on");
}

// A finger down at (x, y) that moves to (x2, y2) in `steps` moves and stays down. `lift()` raises it, `cancel()` has the system take it away.
async function carry(page, cdp, [x, y], [x2, y2], steps = 10) {
  const send = (type, points) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: points });
  await send("touchStart", [{ x, y }]);
  for (let i = 1; i <= steps; i++) {
    await send("touchMove", [{ x: x + ((x2 - x) * i) / steps, y: y + ((y2 - y) * i) / steps }]);
    await sleep(16);
  }
  await frame(page);
  const after = async () => {
    await sleep(40);
    await frame(page);
  };
  return {
    lift: async () => {
      await send("touchEnd", []);
      await after();
    },
    cancel: async () => {
      await send("touchCancel", []);
      await after();
    },
  };
}

// Is the thumbnail of every tray button inside its button, and drawn (a good share of its pixels are not transparent)?
const thumbsOk = (page) =>
  page.locator(".tray.pieces button").evaluateAll((buttons) =>
    buttons.map((b) => {
      const c = b.querySelector("canvas");
      const rb = b.getBoundingClientRect();
      const rc = c.getBoundingClientRect();
      const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
      let solid = 0;
      for (let i = 3; i < d.length; i += 4) if (d[i] > 0) solid++;
      return { name: b.getAttribute("aria-label"), inside: rc.left >= rb.left - 0.5 && rc.right <= rb.right + 0.5 && rc.top >= rb.top - 0.5 && rc.bottom <= rb.bottom + 0.5, w: rc.width, h: rc.height, solid: solid / (c.width * c.height) };
    }),
  );

// The dock's buttons and where they end (CSS pixels), and whether the page scrolls sideways.
const dockBox = (page) =>
  page.evaluate(() => {
    const out = [];
    for (const el of document.querySelectorAll(".dock button")) {
      const r = el.getBoundingClientRect();
      out.push({ name: el.getAttribute("aria-label"), left: r.left, right: r.right, top: r.top, bottom: r.bottom, w: r.width, h: r.height });
    }
    return { buttons: out, innerWidth, scrollWidth: document.documentElement.scrollWidth };
  });

// ---------- the checks ----------

const checks = {
  // The button over the picture's top right corner, the tray in place of the care buttons, Done, and the other phases.
  "decorate-open": async (open, env) => {
    const { page } = await open(SAVE_OF.awake(env.mode));
    const g = await geometry(env, page);
    const box = await page.evaluate(canvasBox);
    expectEq(await decorateButton(page).count(), 1, "Decorate buttons when the home opens");
    const rect = await decorateButton(page).evaluate((el) => {
      const r = el.getBoundingClientRect();
      return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, w: r.width, h: r.height };
    });
    if (rect.w < 44 || rect.h < 44) throw new Error(`the Decorate button is ${rect.w} x ${rect.h} CSS pixels, under 44`);
    const gapRight = box.left + box.cssW - rect.right;
    const gapTop = rect.top - box.top;
    if (gapRight < 0 || gapRight > 16 || gapTop < 0 || gapTop > 16) throw new Error(`the Decorate button is not on the picture's top right corner: ${gapRight} CSS pixels from the right edge, ${gapTop} from the top`);
    expectEq(await page.locator(".care").count(), 1, "care rows before Decorate mode");
    expectEq(await page.locator(".nav").count(), 1, "nav rows before Decorate mode");

    await enter(env, page);
    expectEq(await pictureLabel(page), NOTHING_LABEL, "the picture's label in Decorate mode");
    expectEq(await page.locator(".care").evaluateAll((els) => els.map((el) => el.getAttribute("aria-label"))), ["Decorate"], "the dock's button rows in Decorate mode (the care row is gone, and the nav)");
    expectEq(await page.locator(".nav").count(), 0, "nav rows in Decorate mode");
    expectEq(await page.locator(".tray.pieces").count(), 0, "tray rows when nothing is put away");
    const labels = (await dockBox(page)).buttons.map((b) => b.name);
    expectEq(labels, ["Put away the selected piece", "Done decorating"], "the dock's buttons in Decorate mode");
    const bin = binButton(page);
    if (env.mode === "kid") {
      expectEq(await bin.isDisabled(), true, "the bin with nothing selected (Kid Mode: disabled)");
      expectEq(await page.locator(".dock .word").count(), 0, "words in the Kid Mode dock");
    } else {
      expectEq(await bin.getAttribute("aria-disabled"), "true", "the bin with nothing selected (Adult Mode: aria-disabled)");
      expectEq(await page.locator(".dock .word").evaluateAll((els) => els.map((el) => el.textContent)), ["Put away", "Done"], "the words in the Adult Mode dock");
    }
    for (const b of (await dockBox(page)).buttons) if (b.w < 44 || b.h < 44) throw new Error(`${b.name} is ${b.w} x ${b.h} CSS pixels, under 44`);

    await press(env, doneButton(page));
    await frame(page);
    expectEq(await decorateButton(page).count(), 1, "Decorate buttons after Done");
    expectEq(await pictureLabel(page), "Gravelhorn is doing fine. In the living room.", "the picture's label after Done");
    expectEq(await page.locator(".care").count(), 1, "care rows after Done");
    expectEq(await page.locator(".nav").count(), 1, "nav rows after Done");

    // The egg and a creature that has died are in the home too: Decorate mode opens for them, and the death card comes back after Done.
    const { page: egg } = await open(SAVE_OF.egg(env.mode));
    expectEq(await decorateButton(egg).count(), 1, "Decorate buttons on the egg's home");
    await enter(env, egg);
    expectEq(await pictureLabel(egg), NOTHING_LABEL, "the egg's label in Decorate mode");
    const { page: dead } = await open(SAVE_OF.dead(env.mode));
    expectEq(await dead.locator(".death").count(), 1, "death cards before Decorate mode");
    await enter(env, dead);
    expectEq(await dead.locator(".death").count(), 0, "death cards in Decorate mode");
    await press(env, doneButton(dead));
    await frame(dead);
    expectEq(await dead.locator(".death").count(), 1, "death cards after Done");
    return `the button is ${Math.round(rect.w)} x ${Math.round(rect.h)} CSS pixels, ${gapRight} from the right and ${gapTop} from the top of the picture; Decorate mode swaps the care row and the nav for the bin and Done (${env.mode === "kid" ? "icons only, bin disabled" : "words Put away and Done, bin aria-disabled"}); Done restores them; the egg and the dead creature's home open it too`;
  },

  // The creature stands where it is while Decorate mode is on (a walk begun is called off, and none starts), awake and on its way to bed.
  "decorate-still": async (open, env) => {
    // Math.random answers 0 here, so a creature that may move does: the control page proves the dice send it walking.
    const measure = async (save, decorate) => {
      const { page } = await open(save, { rand: 0 });
      const g = await geometry(env, page);
      if (decorate) await enter(env, page);
      const rows = () => page.evaluate(bandPixels, [g.top + 96 * g.z, g.top + 144 * g.z]);
      const x0 = Math.round(g.vp / 2 - 384 * g.z) + 360 * g.z; // the adult's first box: x 360 to 408, y 96 to 144
      const a = await rows();
      await page.clock.runFor(12000);
      await page.waitForTimeout(100);
      return regionMismatch(a, await rows(), x0, x0 + 48 * g.z);
    };
    const free = await measure(SAVE_OF.awake(env.mode), false);
    const stood = await measure(SAVE_OF.awake(env.mode), true);
    if (free < 0.3) throw new Error(`the control creature left its place in 12 s only by ${Math.round(free * 1000) / 10} % of its box: the dice do not send it walking, so the check cannot tell`);
    if (stood > 0.25) throw new Error(`the creature moved in Decorate mode: ${Math.round(stood * 1000) / 10} % of its box differs after 12 s (the control: ${Math.round(free * 1000) / 10} %)`);
    const sleepFree = await measure(SAVE_OF.asleep(env.mode), false);
    const sleepStood = await measure(SAVE_OF.asleep(env.mode), true);
    if (sleepFree < 0.3) throw new Error(`the control sleeper left its place in 12 s only by ${Math.round(sleepFree * 1000) / 10} %: it does not walk to the bed, so the check cannot tell`);
    if (sleepStood > 0.25) throw new Error(`the sleepy creature walked to its bed in Decorate mode: ${Math.round(sleepStood * 1000) / 10} % of its box differs after 12 s (the control: ${Math.round(sleepFree * 1000) / 10} %)`);
    return `after 12 s the creature's box differs by ${Math.round(free * 1000) / 10} % free and ${Math.round(stood * 1000) / 10} % in Decorate mode; a sleepy one ${Math.round(sleepFree * 1000) / 10} % free and ${Math.round(sleepStood * 1000) / 10} % in Decorate mode`;
  },

  // A tap on a piece selects it (an outline, the picture's label, the bin), a tap on bare floor lets go, a finger on the creature takes the piece under it, and the bed cannot be put away.
  "decorate-select": async (open, env) => {
    const { page, cdp } = await open(SAVE_OF.awake(env.mode));
    const g = await geometry(env, page);
    const at = (world, camera = OPEN_CAMERA) => worldPoint(page, g, env, camera, world);
    await enter(env, page);
    // the sofa: columns 13 to 16, rows 1 and 2; a point on its seat's tile (14, 1)
    await noRing(page, g, OPEN_CAMERA, [13, 1, 2], "before any tap");
    await touchTap(page, cdp, await at([348, 36]));
    expectEq(await pictureLabel(page), SELECTED_LABEL("sofa"), "the picture's label after a tap on the sofa");
    await ring(page, g, OPEN_CAMERA, [13, 1, 2], WHITE, "the selected sofa");
    const bin = binButton(page);
    expectEq(await bin.getAttribute("aria-label"), "Put the sofa away", "the bin's name with the sofa selected");
    if (env.mode === "kid") expectEq(await bin.isDisabled(), false, "the bin with the sofa selected (Kid Mode: disabled)");
    else expectEq(await bin.getAttribute("aria-disabled"), null, "the bin with the sofa selected (Adult Mode: aria-disabled)");
    // bare floor: tile (12, 5), x 288 to 312, y 120 to 144, which no piece covers
    await touchTap(page, cdp, await at([300, 132]));
    expectEq(await pictureLabel(page), NOTHING_LABEL, "the picture's label after a tap on bare floor");
    await noRing(page, g, OPEN_CAMERA, [13, 1, 2], "after a tap on bare floor");
    // the table, then the creature: it stands on tiles (15, 5) and (16, 5), which the rug covers, so the rug is what a finger on the creature takes
    await touchTap(page, cdp, await at([420, 108]));
    expectEq(await pictureLabel(page), SELECTED_LABEL("table"), "the picture's label after a tap on the table");
    await ring(page, g, OPEN_CAMERA, [17, 4, 2], WHITE, "the selected table");
    await noRing(page, g, OPEN_CAMERA, [13, 1, 2], "the sofa after the table was tapped");
    await touchTap(page, cdp, await at([384, 120]));
    expectEq(await pictureLabel(page), SELECTED_LABEL("rug"), "the picture's label after a tap on the creature (the rug under it is taken)");
    // Escape lets go of the piece
    await page.locator("canvas.room").focus();
    await page.keyboard.press("Escape");
    await frame(page);
    expectEq(await pictureLabel(page), NOTHING_LABEL, "the picture's label after Escape");
    await noRing(page, g, OPEN_CAMERA, [13, 4, 3], "after Escape");
    // nothing was changed: no tap writes the layout
    expectEq((await savedGame(page)).home, undefined, "the saved layout after taps only");
    // the bed (columns 1 to 3, rows 1 and 2): pan to the bedroom end with the arrow keys (nothing is selected, so they pan)
    await page.locator("canvas.room").focus();
    for (let i = 0; i < 8; i++) {
      await page.keyboard.press("ArrowLeft");
      await frame(page, 40);
    }
    const bedCamera = [g.vp / (2 * g.z), 96];
    await touchTap(page, cdp, await at([60, 36], bedCamera));
    expectEq(await pictureLabel(page), SELECTED_LABEL("bed"), "the picture's label after a tap on the bed");
    await ring(page, g, bedCamera, [1, 1, 2], WHITE, "the selected bed");
    if (env.mode === "kid") expectEq(await bin.isDisabled(), true, "the bin with the bed selected (Kid Mode: disabled)");
    else {
      expectEq(await bin.getAttribute("aria-disabled"), "true", "the bin with the bed selected (Adult Mode: aria-disabled)");
      await tapOn(page, bin); // (a real tap: Playwright's own tap() will not touch an aria-disabled button)
      await frame(page);
      expectEq(await page.locator(".reason").textContent(), "The bed has to stay: your creature sleeps in it.", "the note after the bin on the bed");
    }
    expectEq(await pictureLabel(page), SELECTED_LABEL("bed"), "the picture's label after the bin on the bed (it stays)");
    expectEq((await savedGame(page)).home, undefined, "the saved layout after the bed was refused");
    return `a tap selects the sofa, the table, the rug under the creature and the bed (label, outline, bin); a tap on bare floor and Escape let go; the bin refuses the bed (${env.mode === "kid" ? "disabled" : "aria-disabled, with the note"}); no tap wrote the layout`;
  },

  // Carrying a piece: it follows the finger (white where it may go, red where not), stays when put down on a good spot, goes back from a refused one, is saved, and survives a reload.
  "decorate-move": async (open, env) => {
    const { page, cdp } = await open(SAVE_OF.awake(env.mode));
    const g = await geometry(env, page);
    const at = (world) => worldPoint(page, g, env, OPEN_CAMERA, world);
    await probe(page, g, OPEN_CAMERA, SEAT_OLD, SEAT, "the starter sofa's seat");
    await enter(env, page);
    const wall = () => page.evaluate(bandPixels, [g.top + 4 * g.z, g.top + 20 * g.z]); // (world y 4 to 20: above every piece in the opening view)
    const wall0 = await wall();
    // a finger that lands on the sofa's left edge (world x 313, tile 13) and moves 3 CSS pixels left, which is under the slop (8) but crosses into tile 12 at every zoom, is a tap: the sofa is
    // selected and does not move (its seat at world (390, 59) is the seat of a sofa at column 13, not of one at column 12)
    const [jx, jy] = await at([313, 36]);
    const jitter = await carry(page, cdp, [jx, jy], [jx - 3, jy], 3);
    await probe(page, g, OPEN_CAMERA, [390, 59], SEAT, "the sofa's seat while a finger that stays within the slop is down on it");
    expectEq(await pictureLabel(page), SELECTED_LABEL("sofa"), "the picture's label while a finger within the slop is down on the sofa");
    await jitter.lift();
    await probe(page, g, OPEN_CAMERA, [390, 59], SEAT, "the sofa's seat after a finger that stayed within the slop lifted");
    expectEq((await savedGame(page)).home, undefined, "the saved layout after a finger that never left the slop");
    // carried up from tile (14, 1) to (14, 0): the sofa would be at (13,0), in the wall's top row (row 0, which no piece may cover): red, and nothing saved
    const wallRow = await carry(page, cdp, await at([348, 36]), await at([348, 12]));
    await ring(page, g, OPEN_CAMERA, [13, 0, 2], RED, "the sofa carried into the wall's top row");
    await wallRow.lift();
    await probe(page, g, OPEN_CAMERA, SEAT_OLD, SEAT, "the sofa's seat after a drop in the wall's top row");
    expectEq((await savedGame(page)).home, undefined, "the saved layout after a drop in the wall's top row");
    // carry the sofa two tiles right (13 to 15): the finger from tile (14, 1) to tile (16, 1)
    const moving = await carry(page, cdp, await at([348, 36]), await at([396, 36]));
    await ring(page, g, OPEN_CAMERA, [15, 1, 2], WHITE, "the sofa carried to column 15");
    await probe(page, g, OPEN_CAMERA, SEAT_NEW, SEAT, "the carried sofa's seat");
    await probe(page, g, OPEN_CAMERA, SEAT_OLD, WOOD, "where the sofa was, while it is carried");
    await moving.lift();
    await probe(page, g, OPEN_CAMERA, SEAT_NEW, SEAT, "the sofa's seat after it was put down");
    await probe(page, g, OPEN_CAMERA, SEAT_OLD, WOOD, "where the sofa was, after it was put down");
    await ring(page, g, OPEN_CAMERA, [15, 1, 2], WHITE, "the sofa after it was put down (still selected)");
    expectEq(await pictureLabel(page), SELECTED_LABEL("sofa"), "the picture's label after the sofa was put down");
    expectStill(wall0, await wall(), "the picture after a piece was carried (the home does not pan under the finger)");
    const moved = homeWith({ sofa: { col: 15, row: 1 } });
    expectEq((await savedGame(page)).home, moved, "the saved layout after the sofa was put down");

    // carried onto the table: red, and back where it was when the finger lifts
    const refused = await carry(page, cdp, await at([396, 36]), await at([444, 132])); // tile (16, 1) to (18, 5): the sofa at (17, 5) lies on the table
    await ring(page, g, OPEN_CAMERA, [17, 5, 2], RED, "the sofa carried onto the table");
    await refused.lift();
    await probe(page, g, OPEN_CAMERA, SEAT_NEW, SEAT, "the sofa's seat after a refused drop");
    expectEq((await savedGame(page)).home, moved, "the saved layout after a refused drop");
    // a finger that goes down on the piece and comes up on the same tile changes nothing
    const same = await carry(page, cdp, await at([396, 36]), await at([398, 38]), 2);
    await same.lift();
    expectEq((await savedGame(page)).home, moved, "the saved layout after a drop on the tile it came from");
    expectEq(await pictureLabel(page), SELECTED_LABEL("sofa"), "the picture's label after a drop on its own tile (it stays selected)");

    // a finger on bare floor still pans the picture, whatever is selected
    const before = await page.evaluate(bandPixels, [g.top + 4 * g.z, g.top + 44 * g.z]);
    const [px, py] = await at([300, 132]);
    await touchDrag(page, cdp, [px, py], [px - 60, py]);
    const after = await page.evaluate(bandPixels, [g.top + 4 * g.z, g.top + 44 * g.z]);
    expectMoved(before, after, Math.round(-60 * env.dpr), g.z, "a drag on bare floor in Decorate mode");

    // Decorate mode is not saved, the layout is: after a reload the sofa is where it was put and the mode is off
    await page.goto(`${env.base}/`);
    await page.locator("canvas.room").waitFor({ timeout: 20000 });
    await frame(page, 100);
    await page.waitForTimeout(100);
    expectEq(await decorateButton(page).count(), 1, "Decorate buttons after a reload (the mode is not kept)");
    await probe(page, g, OPEN_CAMERA, SEAT_NEW, SEAT, "the sofa's seat after a reload");
    await probe(page, g, OPEN_CAMERA, SEAT_OLD, WOOD, "where the sofa was, after a reload");
    return `a sofa carried from column 13 to 15 shows a white outline while carried, is put down and saved ({sofa: (15,1)} among the nine pieces), goes back from the table's spot (red outline), changes nothing when dropped on its own tile, does not pan the picture, and is still at column 15 after a reload with Decorate mode off`;
  },

  // The tray: a piece put away is in it, comes out near the middle of the view and is selected with the keyboard on the picture; the arrow keys move it; a bin puts it away again.
  "decorate-tray": async (open, env) => {
    const { page, cdp } = await open(SAVE_OF.awake(env.mode));
    const g = await geometry(env, page);
    const at = (world) => worldPoint(page, g, env, OPEN_CAMERA, world);
    await enter(env, page);
    // put the sofa, the table and the rug away, one tap and one bin each (the rug by its lower left tile (13, 6): the creature stands on the others)
    for (const [world, piece] of [[[348, 36], "sofa"], [[420, 108], "table"], [[324, 156], "rug"]]) {
      await touchTap(page, cdp, await at(world));
      expectEq(await pictureLabel(page), SELECTED_LABEL(piece), `the picture's label after a tap on the ${piece}`);
      await press(env, binButton(page));
      await frame(page);
      expectEq(await pictureLabel(page), NOTHING_LABEL, `the picture's label after the ${piece} was put away`);
    }
    expectEq(await trayNames(page), ["Put out the sofa", "Put out the rug", "Put out the table"], "the tray (the pieces' own order)");
    expectEq((await savedGame(page)).home, homeWith({ sofa: null, rug: null, table: null }), "the saved layout with three pieces put away");
    const thumbs = await thumbsOk(page);
    for (const t of thumbs) {
      if (!t.inside) throw new Error(`${t.name}: its picture is not inside its button`);
      if (t.solid < 0.2) throw new Error(`${t.name}: only ${Math.round(t.solid * 100)} % of its picture is drawn`);
    }
    await probe(page, g, OPEN_CAMERA, SEAT_OLD, WOOD, "where the sofa was, with the sofa in the tray");
    // out of the tray: the sofa (4 x 2 tiles) lands with its middle on the middle of the view, tile (16, 4): at (14, 3)
    await press(env, page.getByRole("button", { name: "Put out the sofa" }));
    await frame(page);
    expectEq(await pictureLabel(page), SELECTED_LABEL("sofa"), "the picture's label after the sofa came out of the tray");
    expectEq(await page.evaluate(() => document.activeElement && document.activeElement.className), "room", "the focused element after a piece came out (the picture)");
    expectEq(await trayNames(page), ["Put out the rug", "Put out the table"], "the tray after the sofa came out");
    expectEq((await savedGame(page)).home, homeWith({ sofa: { col: 14, row: 3 }, rug: null, table: null }), "the saved layout after the sofa came out");
    await ring(page, g, OPEN_CAMERA, [14, 3, 2], WHITE, "the sofa out of the tray");
    // the arrow keys move the selected piece one tile (and not the picture); a refused step changes nothing
    const wall = () => page.evaluate(bandPixels, [g.top + 4 * g.z, g.top + 20 * g.z]);
    const wall0 = await wall();
    const key = async (name, want, what) => {
      await page.keyboard.press(name);
      await frame(page);
      expectEq((await savedGame(page)).home, homeWith({ sofa: want, rug: null, table: null }), what);
    };
    await key("ArrowDown", { col: 14, row: 4 }, "the saved layout after ArrowDown");
    await key("ArrowUp", { col: 14, row: 3 }, "the saved layout after ArrowUp");
    await key("ArrowUp", { col: 14, row: 2 }, "the saved layout after a second ArrowUp");
    await key("ArrowUp", { col: 14, row: 1 }, "the saved layout after a third ArrowUp (the top of the wall piece's range)");
    await key("ArrowUp", { col: 14, row: 1 }, "the saved layout after a fourth ArrowUp (row 0 is refused)");
    expectStill(wall0, await wall(), "the picture while the arrow keys moved a piece");
    // Escape lets go; with nothing selected the arrow keys pan the picture by a fifth of its width
    await page.keyboard.press("Escape");
    await frame(page);
    expectEq(await pictureLabel(page), NOTHING_LABEL, "the picture's label after Escape");
    const step = Math.round(g.vp / 5);
    await page.keyboard.press("ArrowLeft");
    await frame(page);
    expectMoved(wall0, await wall(), step, g.z, "ArrowLeft with nothing selected");
    // the bin puts a selected piece back in the tray, in the pieces' own order
    await touchTap(page, cdp, await worldPoint(page, g, env, [384 - step / g.z, 96], [14 * 24 + 12, 36])); // (the arrow key moved the camera left by `step` device pixels, so it is no longer at world x 384)
    expectEq(await pictureLabel(page), SELECTED_LABEL("sofa"), "the picture's label after a tap on the sofa again");
    await press(env, binButton(page));
    await frame(page);
    expectEq(await trayNames(page), ["Put out the sofa", "Put out the rug", "Put out the table"], "the tray after the bin");
    // the picture is panned now: a piece out of the tray lands near the middle of what it shows, not of the home. The camera is at world x 384 - step / z (333, 341.3, 343 and 333 in the four windows),
    // so the table (2 x 2) has its middle at tile column 13.9 to 14.3 and lands at (13,3); with the home's middle (column 16) it would land at (15,3).
    await press(env, page.getByRole("button", { name: "Put out the table" }));
    await frame(page);
    expectEq(await pictureLabel(page), SELECTED_LABEL("table"), "the picture's label after the table came out of the tray");
    expectEq((await savedGame(page)).home, homeWith({ sofa: null, rug: null, table: { col: 13, row: 3 } }), "the saved layout after the table came out with the picture panned");
    expectEq(await trayNames(page), ["Put out the sofa", "Put out the rug"], "the tray after the table came out");
    return `three pieces put away show as three buttons, in order, each with its drawn picture inside it; the sofa comes out at (14,3), the nearest spot to the view's middle, selected with the picture focused; the arrow keys move it one tile at a time and stop at the wall (rows 4 down to 1 saved) without moving the picture; Escape lets go and the arrows pan; the bin puts it back; with the picture panned left a table out of the tray lands at (13,3), by the view's middle and not the home's`;
  },

  // The Feeding Mat is the one piece that depends on what is owned: a touch and the tray know it only once it is owned.
  "decorate-mat": async (open, env) => {
    const { page, cdp } = await open(SAVE_OF.mat(env.mode));
    const g = await geometry(env, page);
    const kitchen = [768 - g.vp / (2 * g.z), 96]; // the camera at the kitchen end (the arrow keys, eight presses, stop there)
    const tap = async (p, world) => touchTap(p, cdp, await worldPoint(p, g, env, kitchen, world));
    const toKitchen = async (p) => {
      await p.locator("canvas.room").focus();
      for (let i = 0; i < 8; i++) {
        await p.keyboard.press("ArrowRight");
        await frame(p, 40);
      }
    };
    await enter(env, page);
    await toKitchen(page);
    // the mat is columns 23 to 25 of row 5, the bowl is on its middle tile (24, 5)
    await tap(page, [23 * 24 + 12, 5 * 24 + 12]);
    expectEq(await pictureLabel(page), SELECTED_LABEL("feeding mat"), "the picture's label after a tap on the mat (owned)");
    await tap(page, [24 * 24 + 12, 5 * 24 + 12]);
    expectEq(await pictureLabel(page), SELECTED_LABEL("bowl"), "the picture's label after a tap on the bowl, which lies over the mat");
    // not owned: the same tap on the mat's end finds nothing
    const bare = SAVE_OF.mat(env.mode);
    bare.owned = [];
    const { page: without, cdp: withoutCdp } = await open(bare);
    await enter(env, without);
    await toKitchen(without);
    await touchTap(without, withoutCdp, await worldPoint(without, g, env, kitchen, [23 * 24 + 12, 5 * 24 + 12]));
    expectEq(await pictureLabel(without), NOTHING_LABEL, "the picture's label after a tap on the mat's tile when the mat is not owned");
    // the tray: the dresser and the mat were put away; the mat is offered only when owned
    const { page: owned } = await open(SAVE_OF.trayed(env.mode));
    await enter(env, owned);
    expectEq(await trayNames(owned), ["Put out the dresser", "Put out the feeding mat"], "the tray when the Feeding Mat is owned");
    for (const t of await thumbsOk(owned)) if (!t.inside || t.solid < 0.2) throw new Error(`${t.name}: its picture is not drawn inside its button (${Math.round(t.solid * 100)} % drawn, inside ${t.inside})`);
    const unowned = SAVE_OF.trayed(env.mode);
    unowned.owned = [];
    const { page: notOwned } = await open(unowned);
    await enter(env, notOwned);
    expectEq(await trayNames(notOwned), ["Put out the dresser"], "the tray when the Feeding Mat is not owned");
    return `the owned mat is taken by a tap on its end tile and the bowl over its middle tile; unowned, the same tap finds nothing; the tray lists the mat only when owned (dresser and mat, then the dresser alone)`;
  },

  // A wallpaper for each room (H2c, docs/home-plan.md section 14): a tap on a room's bare wall selects it (an outline round the wall, swatches in the dock in place of the furniture
  // tray), a swatch gives that room the wallpaper and no other, a tap on the floor, on a piece or Escape lets go of the wall, a partition belongs to the room on its left, a room with no
  // wallpaper of its own follows the whole home's, and what was chosen is saved and still there after a reload. Colours are read from the picture (see wallAt).
  "decorate-walls": async (open, env) => {
    const { page, cdp } = await open(SAVE_OF.walls(env.mode));
    const g = await geometry(env, page);
    const step = Math.round(g.vp / 5);
    const eastCamera = [384 + step / g.z, 96]; // (one ArrowRight from the opening view: the partition at column 21 is on the picture)
    const kitchenCamera = [768 - g.vp / (2 * g.z), 96];
    const bedCamera = [g.vp / (2 * g.z), 96];
    const tap = async (camera, world) => touchTap(page, cdp, await worldPoint(page, g, env, camera, world));
    const label = (room) => `Decorating the home. The ${room} wall is selected. Pick a wallpaper below.`;
    const swatch = (name, room) => page.getByRole("button", { name: `Put the ${name} wallpaper on the ${room} wall` });
    const names = (room, kinds) => kinds.map((k) => `Put the ${k} wallpaper on the ${room} wall`);
    const bin = binButton(page);
    const saved = async () => (await savedGame(page)).home;
    await enter(env, page);

    // the living room, in the opening view: plain, then selected
    await wallAt(page, g, OPEN_CAMERA, 300, WALLS.plain, "the living room's wall before any change");
    await tap(OPEN_CAMERA, [300, 12]);
    expectEq(await pictureLabel(page), label("living room"), "the picture's label after a tap on the living room's bare wall");
    await topRing(page, g, OPEN_CAMERA, 350, WHITE, "the selected living room wall");
    expectEq(await swatchNames(page), names("living room", ["plain", "meadow", "dusk"]), "the swatches for the living room wall");
    expectEq(await swatchPressed(page), ["true", "false", "false"], "the swatch on the wall (plain)");
    await expectSwatches(page, ["plain", "meadow", "dusk"], "the swatches for the living room wall");
    for (const b of (await dockBox(page)).buttons) if (b.w < 44 || b.h < 44) throw new Error(`${b.name} is ${b.w} x ${b.h} CSS pixels, under 44`);
    if (env.mode === "kid") expectEq(await bin.isDisabled(), true, "the bin with a wall selected (Kid Mode: disabled)");
    else expectEq(await bin.getAttribute("aria-disabled"), "true", "the bin with a wall selected (Adult Mode: aria-disabled)");
    expectEq((await savedGame(page)).home, undefined, "the saved layout after a wall was only selected");

    // Meadow on the living room wall: the swatch on the wall changes, the other rooms do not, and Escape lets go at once (the focus is back on the picture)
    await press(env, swatch("meadow", "living room"));
    await frame(page);
    await wallAt(page, g, OPEN_CAMERA, 300, WALLS.meadow, "the living room's wall after Meadow");
    expectEq(await pictureLabel(page), label("living room"), "the picture's label after a swatch (the wall stays selected)");
    expectEq(await swatchPressed(page), ["false", "true", "false"], "the swatch on the wall (Meadow)");
    expectEq(await saved(), { ...homeWith({}), walls: { living: "wall-meadow" } }, "the saved home after Meadow on the living room (the nine pieces, and the wall)");
    await page.keyboard.press("Escape");
    await frame(page);
    expectEq(await pictureLabel(page), NOTHING_LABEL, "the picture's label after Escape, straight after a swatch");
    await noTopRing(page, g, OPEN_CAMERA, 350, "after Escape");

    // a tap on bare floor lets go; a tap on a piece selects the piece (the sofa stands on the wall), and a tap on the bare wall then takes the selection from the piece
    await tap(OPEN_CAMERA, [300, 12]);
    expectEq(await pictureLabel(page), label("living room"), "the picture's label after a tap on the bare wall again");
    await tap(OPEN_CAMERA, [300, 132]);
    expectEq(await pictureLabel(page), NOTHING_LABEL, "the picture's label after a tap on bare floor");
    await noTopRing(page, g, OPEN_CAMERA, 350, "after a tap on bare floor");
    expectEq(await page.locator(".tray.pieces").count(), 0, "tray rows with nothing selected and nothing put away");
    await tap(OPEN_CAMERA, [348, 36]);
    expectEq(await pictureLabel(page), SELECTED_LABEL("sofa"), "the picture's label after a tap on the sofa");
    await noTopRing(page, g, OPEN_CAMERA, 350, "with the sofa selected");
    await tap(OPEN_CAMERA, [300, 12]);
    expectEq(await pictureLabel(page), label("living room"), "the picture's label after a tap on the bare wall beside the sofa");
    await noRing(page, g, OPEN_CAMERA, [13, 1, 2], "the sofa once the wall is selected");

    // the sofa put away: with the wall selected the dock offers the wallpapers only, not the sofa in the tray
    await tap(OPEN_CAMERA, [348, 36]);
    expectEq(await pictureLabel(page), SELECTED_LABEL("sofa"), "the picture's label after a tap on the sofa with the wall selected before it");
    expectEq(await page.locator(".tray.pieces").count(), 0, "the dock with the sofa selected after a wall (no swatches, and nothing put away: no tray)");
    await press(env, bin);
    await frame(page);
    expectEq(await trayNames(page), ["Put out the sofa"], "the tray with the sofa put away and nothing selected");
    await tap(OPEN_CAMERA, [300, 12]);
    expectEq(await swatchNames(page), names("living room", ["plain", "meadow", "dusk"]), "the dock with the wall selected and the sofa in the tray (the wallpapers only)");
    expectEq(await saved(), { ...homeWith({ sofa: null }), walls: { living: "wall-meadow" } }, "the saved home after the sofa was put away (the wall stays)");

    // the partition at column 21 belongs to the living room: its wall and its edges are Meadow, the outline of the living room's wall runs to its far edge, and a tap on it selects it
    await pan(page, "ArrowRight", 1);
    await probe(page, g, eastCamera, [516, 10], WALLS.meadow.base, "the partition at column 21 (the living room's wall)");
    await probe(page, g, eastCamera, [505, 10], WALLS.meadow.board, "the partition's edge");
    await probe(page, g, eastCamera, [525, 24], WHITE, "the living room wall's outline, its second line at the partition");
    await probe(page, g, eastCamera, [526, 24], WHITE, "the living room wall's outline, its first line at the partition");
    await page.keyboard.press("Escape");
    await frame(page);
    await tap(eastCamera, [516, 12]);
    expectEq(await pictureLabel(page), label("living room"), "the picture's label after a tap on the partition (it belongs to the room on its left)");
    await page.keyboard.press("Escape");
    await frame(page);

    // the kitchen: Dusk, then the plain wall (written as null), then Dusk again; the living room keeps Meadow
    await pan(page, "ArrowRight", 8);
    await wallAt(page, g, kitchenCamera, 700, WALLS.plain, "the kitchen's wall before any change");
    await tap(kitchenCamera, [620, 12]);
    expectEq(await pictureLabel(page), label("kitchen"), "the picture's label after a tap on the kitchen's bare wall");
    await topRing(page, g, kitchenCamera, 620, WHITE, "the selected kitchen wall");
    expectEq(await swatchNames(page), names("kitchen", ["plain", "meadow", "dusk"]), "the swatches for the kitchen wall");
    await press(env, swatch("dusk", "kitchen"));
    await frame(page);
    await wallAt(page, g, kitchenCamera, 700, WALLS.dusk, "the kitchen's wall after Dusk");
    expectEq(await saved(), { ...homeWith({ sofa: null }), walls: { living: "wall-meadow", kitchen: "wall-dusk" } }, "the saved home after Dusk on the kitchen");
    await press(env, swatch("plain", "kitchen"));
    await frame(page);
    await wallAt(page, g, kitchenCamera, 700, WALLS.plain, "the kitchen's wall after the plain wall");
    expectEq(await saved(), { ...homeWith({ sofa: null }), walls: { living: "wall-meadow", kitchen: null } }, "the saved home after the plain wall on the kitchen (null is saved)");
    await press(env, swatch("dusk", "kitchen"));
    await frame(page);
    await wallAt(page, g, kitchenCamera, 700, WALLS.dusk, "the kitchen's wall after Dusk again");

    // the bedroom was never touched: plain, and the plain swatch on it does nothing
    await pan(page, "ArrowLeft", 16);
    await wallAt(page, g, bedCamera, 0, WALLS.plain, "the bedroom's wall, never changed");
    await tap(bedCamera, [60, 12]);
    expectEq(await pictureLabel(page), label("bedroom"), "the picture's label after a tap on the bedroom's bare wall");
    await topRing(page, g, bedCamera, 60, WHITE, "the selected bedroom wall");
    await probe(page, g, bedCamera, [0, 24], DARK, "the bedroom wall's outline, its edge at the left end of the home");
    await probe(page, g, bedCamera, [1, 24], WHITE, "the bedroom wall's outline, its first line at the left end");
    expectEq(await swatchPressed(page), ["true", "false", "false"], "the swatch on the bedroom's wall (plain)");
    await press(env, swatch("plain", "bedroom"));
    await frame(page);
    expectEq(await saved(), { ...homeWith({ sofa: null }), walls: { living: "wall-meadow", kitchen: "wall-dusk" } }, "the saved home after the plain swatch on a room that was plain (nothing changes)");

    // after a reload: Decorate mode is off and every wall is as it was left
    await page.goto(`${env.base}/`);
    await page.locator("canvas.room").waitFor({ timeout: 20000 });
    await frame(page, 100);
    await page.waitForTimeout(100);
    expectEq(await decorateButton(page).count(), 1, "Decorate buttons after a reload (the mode is not kept)");
    await wallAt(page, g, OPEN_CAMERA, 300, WALLS.meadow, "the living room's wall after a reload");
    await pan(page, "ArrowRight", 8);
    await wallAt(page, g, kitchenCamera, 700, WALLS.dusk, "the kitchen's wall after a reload");

    // a home that was saved with a whole-home wall (Dusk), Meadow in the bedroom and the plain wall in the kitchen: the living room, with no wall of its own, follows Dusk
    // (Decorate mode, to read which swatch is on each wall: the one the room shows, whether it is the room's own entry or the whole home's wall)
    const { page: set, cdp: setCdp } = await open(SAVE_OF.wallsSet(env.mode));
    const setTap = async (camera, world) => touchTap(set, setCdp, await worldPoint(set, g, env, camera, world));
    await wallAt(set, g, OPEN_CAMERA, 300, WALLS.dusk, "the living room's wall (no wall of its own: the whole home's Dusk)");
    await enter(env, set);
    await setTap(OPEN_CAMERA, [300, 12]);
    expectEq(await swatchPressed(set), ["false", "false", "true"], "the swatch on the living room's wall (it follows the whole home's Dusk)");
    await pan(set, "ArrowLeft", 8);
    await wallAt(set, g, bedCamera, 0, WALLS.meadow, "the bedroom's wall (its own Meadow)");
    await setTap(bedCamera, [60, 12]);
    expectEq(await swatchPressed(set), ["false", "true", "false"], "the swatch on the bedroom's wall (its own Meadow)");
    await pan(set, "ArrowRight", 16);
    await wallAt(set, g, kitchenCamera, 700, WALLS.plain, "the kitchen's wall (its own plain wall, over the whole home's Dusk)");
    await setTap(kitchenCamera, [620, 12]);
    expectEq(await swatchPressed(set), ["true", "false", "false"], "the swatch on the kitchen's wall (its own plain wall, over the whole home's Dusk)");

    // no wallpaper owned: the wall can be selected and offers only the plain wall
    const { page: none, cdp: noneCdp } = await open(SAVE_OF.awake(env.mode));
    await enter(env, none);
    await touchTap(none, noneCdp, await worldPoint(none, g, env, OPEN_CAMERA, [300, 12]));
    expectEq(await swatchNames(none), names("living room", ["plain"]), "the swatches with no wallpaper owned");
    expectEq(await swatchPressed(none), ["true"], "the swatch on the wall with no wallpaper owned");
    return `a tap on a room's bare wall selects it (outline, swatches in place of the furniture tray: the plain wall and each owned wallpaper, bin off); a swatch changes that room only (living room Meadow, kitchen Dusk, plain written as null, the bedroom never touched) and is saved with the nine pieces; the floor, a piece and Escape let go; the partition at column 21 is the living room's; a reload keeps it; a home with a whole-home Dusk, Meadow in the bedroom and plain in the kitchen shows each room's own wall; with no wallpaper owned only the plain swatch is offered`;
  },

  // Everything put away: eight pieces in the tray, two rows, all inside the window, every button at least 44 pixels.
  // The house grows (H3, docs/home-plan.md section 16). Without the Playroom the home ends at column 31 (world x 768); with it, a partition at column 32 (x 768 to 791) with a doorway in rows 4
  // and 5 (y 96 to 143), then the Playroom, columns 33 to 42 (x 792 to 1031): a carpet, a window at x 893, the plain wall. A piece out of the tray lands in it; a drop that straddles the
  // partition or closes the doorway is red and goes back; a tap on its wall selects it. A table at (30, 4) that closes the doorway is read as put away once the room is built.
  "decorate-grow": async (open, env) => {
    const openGrow = async (save) => {
      const { page, cdp } = await open(save);
      const g = await geometry(env, page);
      return { page, cdp, g, stepWorld: Math.round(g.vp / 5) / g.z };
    };
    const eastOf = (g, world) => [world - g.vp / (2 * g.z), 96]; // (the arrow keys stop the camera at the home's edge: the picture's right edge is the home's last column)
    const savedHome = async (page) => (await savedGame(page)).home;

    // 1. three rooms: with the camera at its right limit the picture's last column is the kitchen's floor, not a carpet; and the fridge may close the east end (no doorway there yet)
    {
      const { page, cdp, g } = await openGrow(SAVE_OF.awake(env.mode));
      await pan(page, "ArrowRight", 24);
      const east = eastOf(g, 768);
      await probe(page, g, east, [767, 150], TILE_FLOOR, "the last column of a three room home (the kitchen's floor)");
      await probe(page, g, east, [767, 10], WALL, "the last column of the wall of a three room home");
      await enter(env, page);
      const from = await worldPoint(page, g, env, east, [732, 36]); // the fridge's top left tile (30, 1)
      const drag = await carry(page, cdp, from, await worldPoint(page, g, env, east, [732, 108])); // to tile (30, 4): columns 30 and 31, rows 4 and 5
      await ring(page, g, east, [30, 4, 2], WHITE, "the fridge carried to (30, 4) in a three room home (nothing to close)");
      await drag.lift();
      expectEq((await savedHome(page)).pieces.fridge, { col: 30, row: 4 }, "the fridge put down at (30, 4) in a three room home");
    }

    // 2. four rooms: the camera's limit is the Playroom's carpet, and the Playroom, its window, the partition and its doorway are where the plan says
    {
      const { page, cdp, g, stepWorld } = await openGrow(SAVE_OF.room(env.mode));
      await pan(page, "ArrowRight", 24);
      const east = eastOf(g, 1032);
      await probe(page, g, east, [1031, 150], CARPET, "the last column of a four room home (the Playroom's carpet)");
      await probe(page, g, east, [1031, 10], WALL, "the last column of the Playroom's wall");
      await wallAt(page, g, east, 940, WALLS.plain, "the Playroom's wall");
      await probe(page, g, east, [893, 20], WHITE, "the Playroom's window frame");
      await probe(page, g, east, [895, 20], [0x8fd3ff, 0xffb27a, 0xc9a6e8, 0x1d2b53], "the Playroom's window (the sky)");

      // 3. Decorate mode with the view on the Playroom: the dresser out of the tray lands in it, on the whole tile nearest the middle of the view
      await enter(env, page);
      expectEq(await trayNames(page), ["Put out the dresser"], "the tray of a home with the Playroom and the dresser put away");
      const col = Math.round(east[0] / 24) - 1; // (its middle, col + 1, is the whole tile nearest the view's middle; its row is 3: the middle row of the view is 4)
      await press(env, page.getByRole("button", { name: "Put out the dresser" }));
      await frame(page);
      expectEq((await savedHome(page)).pieces.dresser, { col, row: 3 }, "the dresser out of the tray, with the view on the Playroom");
      expectEq(await pictureLabel(page), SELECTED_LABEL("dresser"), "the picture's label with the dresser out and selected");
      await ring(page, g, east, [col, 3, 2], WHITE, "the dresser in the Playroom");
      await press(env, binButton(page));
      await frame(page);
      expectEq(await trayNames(page), ["Put out the dresser"], "the tray after the dresser was put away again");

      // 4. the partition and its doorway, with the camera back from the end by whole key presses until it is at 800 or less (nothing is selected: the arrow keys pan)
      const back = Math.ceil((east[0] - 800) / stepWorld);
      await pan(page, "ArrowLeft", back);
      const mid = [east[0] - back * stepWorld, 96];
      await probe(page, g, mid, [769, 80], 0x8a6bd1, "the partition's edge on a floor row (the baseboard colour edges every partition row except the doorway's)");
      await probe(page, g, mid, [780, 80], WALL[0], "the partition's wall");
      await probe(page, g, mid, [780, 94], FRAME, "the lintel over the doorway");
      await probe(page, g, mid, [780, 96], FRAME, "the doorway's top frame");
      await probe(page, g, mid, [780, 110], WOOD, "the doorway's floor");
      await probe(page, g, mid, [780, 143], FRAME, "the doorway's bottom frame");
      await probe(page, g, mid, [780, 150], WALL[0], "the partition's wall below the doorway");
      await probe(page, g, mid, [760, 110], TILE_FLOOR, "the kitchen's floor beside the doorway");
      await probe(page, g, mid, [800, 110], CARPET, "the Playroom's carpet beside the doorway");

      // 5. the fridge (30, 1) carried: over the partition (31, 1) is red, onto the doorway's approach (30, 4) is red (it would close it), into the Playroom (33, 1) is white and stays
      const at = (world) => worldPoint(page, g, env, mid, world);
      const fridge = await at([732, 36]);
      const over = await carry(page, cdp, fridge, await at([756, 36]));
      await ring(page, g, mid, [31, 1, 2], RED, "the fridge carried over the partition (columns 31 to 32)");
      await over.lift();
      expectEq((await savedHome(page)).pieces.fridge, { col: 30, row: 1 }, "the saved fridge after a drop over the partition");
      const closing = await carry(page, cdp, fridge, await at([732, 108]));
      await ring(page, g, mid, [30, 4, 2], RED, "the fridge carried onto the doorway's approach (it would close the doorway)");
      await closing.lift();
      expectEq((await savedHome(page)).pieces.fridge, { col: 30, row: 1 }, "the saved fridge after a drop that would close the doorway");
      const into = await carry(page, cdp, fridge, await at([804, 36]));
      await ring(page, g, mid, [33, 1, 2], WHITE, "the fridge carried into the Playroom (columns 33 and 34)");
      await into.lift();
      expectEq((await savedHome(page)).pieces.fridge, { col: 33, row: 1 }, "the fridge put down in the Playroom");
      await ring(page, g, mid, [33, 1, 2], WHITE, "the fridge in the Playroom, still selected");

      // 6. the Playroom's wall: a tap on its bare wall selects it, Dusk goes on it and on no other room (the partition is the kitchen's: still plain)
      await page.keyboard.press("Escape"); // (the fridge is selected: Escape lets go of it)
      await frame(page);
      await pan(page, "ArrowRight", 24);
      await touchTap(page, cdp, await worldPoint(page, g, env, east, [1000, 12]));
      expectEq(await pictureLabel(page), "Decorating the home. The playroom wall is selected. Pick a wallpaper below.", "the picture's label after a tap on the Playroom's bare wall");
      const swatchWords = ["plain", "meadow", "dusk"].map((k) => `Put the ${k} wallpaper on the playroom wall`);
      expectEq(await swatchNames(page), swatchWords, "the swatches for the Playroom's wall");
      await press(env, page.getByRole("button", { name: swatchWords[2] }));
      await frame(page);
      await wallAt(page, g, east, 940, WALLS.dusk, "the Playroom's wall after Dusk");
      expectEq((await savedHome(page)).walls, { playroom: "wall-dusk" }, "the saved walls after Dusk on the Playroom (the one room)");
      await pan(page, "ArrowLeft", back);
      await probe(page, g, mid, [780, 80], WALL[0], "the partition's wall after Dusk on the Playroom (it is the kitchen's, still plain)");
      // ...and on no other room: the kitchen's wall is in view at `mid`; the bedroom's and the living room's are brought into view from the home's left end by whole key presses
      await wallAt(page, g, mid, 700, WALLS.plain, "the kitchen's wall after Dusk on the Playroom");
      await pan(page, "ArrowLeft", 24);
      const half = g.vp / (2 * g.z);
      await wallAt(page, g, [half, 96], 0, WALLS.plain, "the bedroom's wall after Dusk on the Playroom");
      const toLiving = Math.max(0, Math.ceil((309 - 2 * half) / stepWorld)); // (the living room's probe points, x 302 to 309, must be inside the view)
      if (toLiving * stepWorld > 302) throw new Error(`${toLiving} key presses of ${stepWorld} world pixels pass the living room's wall at x 302`);
      await pan(page, "ArrowRight", toLiving);
      await wallAt(page, g, [half + toLiving * stepWorld, 96], 300, WALLS.plain, "the living room's wall after Dusk on the Playroom");
    }

    // 7. a table at (30, 4) closes the doorway: with the Playroom it is read as put away (and nothing is saved by opening the game); without it, it stands where it was put
    for (const [what, save, standing] of [
      ["without the Playroom", SAVE_OF.blocked(env.mode), true],
      ["with the Playroom", SAVE_OF.blockedRoom(env.mode), false],
    ]) {
      const { page, g, stepWorld } = await openGrow(save);
      await pan(page, "ArrowRight", 24);
      const limit = eastOf(g, standing ? 768 : 1032);
      const back = Math.max(0, Math.ceil((limit[0] - 780) / stepWorld));
      await pan(page, "ArrowLeft", back);
      const cam = [limit[0] - back * stepWorld, 96];
      const colour = await page.evaluate(pixelAt, dev(g, cam, [740, 115])); // (inside the table's top, x 724 to 764, y 105 to 122: the table, or the kitchen's tiles where it was)
      if (standing ? colour !== TABLE_TOP : !TILE_FLOOR.includes(colour)) throw new Error(`world (740, 115) ${what} is ${hex(colour)}, expected ${standing ? `the table's top ${hex(TABLE_TOP)}` : "the kitchen's bare floor"}`);
      await enter(env, page);
      if (standing) expectEq(await page.locator(".tray.pieces").count(), 0, `the tray ${what} (nothing put away)`);
      else expectEq(await trayNames(page), ["Put out the table"], `the tray ${what} (the table is read as put away)`);
      expectEq((await savedGame(page)).home, save.home, `the saved home ${what} after opening it and entering Decorate mode (nothing was written)`);
    }
    return "three rooms end at the kitchen's floor and four in the Playroom's carpet (window, partition, doorway where the plan says); the dresser out of the tray lands in it; pieces over the partition or on the doorway's approach are red, one inside it white; a tap on its wall selects it and Dusk goes on it alone; a table that closes the doorway is read as put away with the room and stands without it, and nothing was written by reading it";
  },

  "decorate-fit": async (open, env) => {
    // The picture's place on the page (whatever the page has scrolled to) and the dock's height. The stage takes the spare height of a tall window and centres the picture in it, so a taller
    // dock moves the picture up by half of the growth; a page with no spare height scrolls instead and the picture's place on the page stays.
    const documentTop = (p) => p.evaluate(() => document.querySelector("canvas.room").getBoundingClientRect().top + window.scrollY);
    const dockHeight = (p) => p.evaluate(() => document.querySelector(".dock").getBoundingClientRect().height);
    // Two pieces in the tray (one row): the dock is no taller than the nav and care buttons it replaces, so the picture does not move.
    const { page: few } = await open(SAVE_OF.trayed(env.mode));
    const fewTop0 = await documentTop(few);
    const fewDock0 = await dockHeight(few);
    await enter(env, few);
    const fewMoved = (await documentTop(few)) - fewTop0;
    const fewDock1 = await dockHeight(few);
    if (Math.abs(fewMoved) > 0.5) throw new Error(`the picture moved ${fewMoved} CSS pixels on the page when Decorate mode opened with two pieces in the tray (the dock went from ${fewDock0} to ${fewDock1})`);
    const { page } = await open(SAVE_OF.allTrayed(env.mode));
    const top0 = await documentTop(page);
    const dock0 = await dockHeight(page);
    await enter(env, page);
    const moved = (await documentTop(page)) - top0; // (negative: up)
    const growth = (await dockHeight(page)) - dock0;
    if (growth <= 0.5) throw new Error(`the dock did not grow when Decorate mode opened with eight pieces in the tray (${dock0} to ${dock0 + growth}): the check cannot tell where the picture goes`);
    if (moved > 0.5 || moved < -growth / 2 - 0.5) throw new Error(`the picture moved ${moved} CSS pixels on the page when Decorate mode opened with eight pieces in the tray; it may move up by at most half of the dock's growth, ${growth / 2}`);
    // The 844 pixel tall window has more spare height than the dock grows by (the page does not scroll), so there the stage centres the picture again and it goes up by exactly half.
    if (env.h === 844 && Math.abs(moved + growth / 2) > 1) throw new Error(`the picture moved ${moved} CSS pixels when the dock grew ${growth}; in a window with spare height it moves up by half of the growth, ${growth / 2}`);
    expectEq(await trayNames(page), ["Put out the dresser", "Put out the sofa", "Put out the rug", "Put out the table", "Put out the counter", "Put out the fridge", "Put out the feeding mat", "Put out the bowl"], "the tray with eight pieces");
    const dock = await dockBox(page);
    if (dock.scrollWidth > dock.innerWidth) throw new Error(`the page scrolls sideways: ${dock.scrollWidth} wide in a window ${dock.innerWidth} wide`);
    for (const b of dock.buttons) {
      if (b.left < -0.5 || b.right > dock.innerWidth + 0.5) throw new Error(`${b.name} runs past the window: ${b.left} to ${b.right} of ${dock.innerWidth}`);
      if (b.w < 44 || b.h < 44) throw new Error(`${b.name} is ${b.w} x ${b.h} CSS pixels, under 44`);
    }
    const rows = new Set(dock.buttons.filter((b) => b.name.startsWith("Put out")).map((b) => Math.round(b.top)));
    expectEq(rows.size, 2, "rows of the tray with eight pieces");
    const thumbs = await thumbsOk(page);
    for (const t of thumbs) if (!t.inside || t.solid < 0.2) throw new Error(`${t.name}: its picture is not drawn inside its button (${Math.round(t.solid * 100)} % drawn, inside ${t.inside}, ${Math.round(t.w)} x ${Math.round(t.h)})`);
    const widest = Math.max(...thumbs.map((t) => t.w));
    return `eight pieces in ${rows.size} rows: no sideways scroll, every dock button inside the ${dock.innerWidth} pixel window and at least 44 x 44, every picture inside its button (widest ${Math.round(widest)} pixels), and the picture stays put with two pieces in the tray (${fewDock0} to ${fewDock1} pixels of dock) and moves ${Math.round(moved * 10) / 10} pixels with eight (the dock grows ${Math.round(growth * 10) / 10}; the picture goes up by at most half of that, and by exactly half in the 844 pixel tall window)`;
  },

  // Two fingers, a third, and a finger the system takes away: the piece goes back and nothing is saved.
  "decorate-gestures": async (open, env) => {
    const { page, cdp } = await open(SAVE_OF.awake(env.mode));
    const g = await geometry(env, page);
    const at = (world) => worldPoint(page, g, env, OPEN_CAMERA, world);
    await enter(env, page);
    const send = (type, points) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: points });
    // a second finger while the sofa is carried: the sofa is back where it was, and the fingers pinch (the zoom changes)
    const stripe0 = (await page.evaluate(stripeWidth)).width;
    const [x, y] = await at([348, 36]);
    const [x2, y2] = await at([396, 36]);
    await send("touchStart", [{ x, y, id: 1 }]);
    for (let i = 1; i <= 6; i++) {
      await send("touchMove", [{ x: x + ((x2 - x) * i) / 6, y: y + ((y2 - y) * i) / 6, id: 1 }]);
      await sleep(16);
    }
    await frame(page);
    await ring(page, g, OPEN_CAMERA, [15, 1, 2], WHITE, "the sofa carried by one finger");
    const [sx, sy] = await at([300, 150]);
    await send("touchStart", [{ x: x2, y: y2, id: 1 }, { x: sx, y: sy, id: 2 }]);
    await frame(page);
    await probe(page, g, OPEN_CAMERA, SEAT_OLD, SEAT, "the sofa's seat after a second finger came down (it is back)");
    await probe(page, g, OPEN_CAMERA, SEAT_NEW, WOOD, "the carried place after a second finger came down");
    await send("touchStart", [{ x: x2, y: y2, id: 1 }, { x: sx, y: sy, id: 2 }, { x: sx + 40, y: sy - 40, id: 3 }]); // a third finger: the sofa stays back and the two fingers still pinch (the stripes below)
    await frame(page);
    await probe(page, g, OPEN_CAMERA, SEAT_OLD, SEAT, "the sofa's seat after a third finger came down");
    for (let i = 1; i <= 8; i++) {
      await send("touchMove", [{ x: x2 + 3 * i, y: y2, id: 1 }, { x: sx - 12 * i, y: sy, id: 2 }, { x: sx + 40, y: sy - 40, id: 3 }]);
      await sleep(16);
    }
    await send("touchEnd", []);
    await sleep(60);
    await frame(page);
    if ((await page.evaluate(stripeWidth)).width === stripe0) throw new Error(`the stripes are still ${stripe0} device pixels wide: the two fingers did not pinch`);
    expectEq((await savedGame(page)).home, undefined, "the saved layout after a second and third finger");
    // a finger the system takes away: the sofa is back, nothing saved, and the next drag works
    const { page: page2, cdp: cdp2 } = await open(SAVE_OF.awake(env.mode));
    await enter(env, page2);
    const at2 = (world) => worldPoint(page2, g, env, OPEN_CAMERA, world);
    const lost = await carry(page2, cdp2, await at2([348, 36]), await at2([396, 36]));
    await ring(page2, g, OPEN_CAMERA, [15, 1, 2], WHITE, "the sofa carried before the cancel");
    await lost.cancel();
    await probe(page2, g, OPEN_CAMERA, SEAT_OLD, SEAT, "the sofa's seat after the cancel");
    await probe(page2, g, OPEN_CAMERA, SEAT_NEW, WOOD, "the carried place after the cancel");
    expectEq((await savedGame(page2)).home, undefined, "the saved layout after a cancel");
    const again = await carry(page2, cdp2, await at2([348, 36]), await at2([396, 36]));
    await again.lift();
    expectEq((await savedGame(page2)).home, homeWith({ sofa: { col: 15, row: 1 } }), "the saved layout after a drag that follows a cancel");
    // the creature is not petted in Decorate mode: put the rug away so that nothing covers it, hold a finger on it for 700 ms (a pet comes at 450 ms outside Decorate mode)
    await touchTap(page2, cdp2, await at2([324, 156]));
    await press(env, binButton(page2));
    await frame(page2);
    const before = JSON.stringify((await savedGame(page2)).creature);
    await touchHold(page2, cdp2, await at2([384, 120]), 700);
    const after = JSON.stringify((await savedGame(page2)).creature);
    expectEq(after, before, "the creature after a 700 ms hold in Decorate mode (no pet)");
    // the control: the same hold outside Decorate mode is a pet, which changes the creature's save (else the hold above could not tell)
    const { page: control, cdp: controlCdp } = await open(SAVE_OF.awake(env.mode));
    const controlBefore = JSON.stringify((await savedGame(control)).creature);
    await touchHold(control, controlCdp, await worldPoint(control, g, env, OPEN_CAMERA, [384, 120]), 700);
    const controlAfter = JSON.stringify((await savedGame(control)).creature);
    if (controlAfter === controlBefore) throw new Error("the control: a 700 ms hold on the creature outside Decorate mode did not change it, so the Decorate mode hold above proves nothing");
    return `a second finger while the sofa is carried puts it back and pinches (stripes ${stripe0} pixels before, changed after); with a third finger down the sofa stays back and the pinch still works; a cancelled finger puts it back and the next drag works; nothing was saved by any of them; a 700 ms hold on the creature in Decorate mode does not pet it, while the same hold outside Decorate mode does (the control)`;
  },

  // The mouse: the main button carries a piece and drops it, the right button does nothing, the arrow keys move it.
  "decorate-mouse": async (open, env) => {
    const { page } = await open(SAVE_OF.awake(env.mode));
    const g = await geometry(env, page);
    const at = (world) => worldPoint(page, g, env, OPEN_CAMERA, world);
    await enter(env, page);
    const m = page.mouse;
    const [x, y] = await at([348, 36]);
    const [x2, y2] = await at([396, 36]);
    await m.move(x, y);
    await m.down({ button: "right" });
    for (let i = 1; i <= 10; i++) await m.move(x + ((x2 - x) * i) / 10, y + ((y2 - y) * i) / 10);
    await m.up({ button: "right" });
    await frame(page);
    await probe(page, g, OPEN_CAMERA, SEAT_OLD, SEAT, "the sofa's seat after a drag with the right button");
    expectEq((await savedGame(page)).home, undefined, "the saved layout after a drag with the right button");
    await m.move(x, y);
    await m.down();
    for (let i = 1; i <= 10; i++) await m.move(x + ((x2 - x) * i) / 10, y + ((y2 - y) * i) / 10);
    await frame(page);
    await ring(page, g, OPEN_CAMERA, [15, 1, 2], WHITE, "the sofa carried with the mouse");
    await m.up();
    await frame(page);
    expectEq((await savedGame(page)).home, homeWith({ sofa: { col: 15, row: 1 } }), "the saved layout after a drag with the main button");
    await page.keyboard.press("ArrowDown");
    await frame(page);
    expectEq((await savedGame(page)).home, homeWith({ sofa: { col: 15, row: 2 } }), "the saved layout after ArrowDown");
    return `the right button's drag changes nothing; the main button carries the sofa to column 15 (white outline) and saves it; ArrowDown then moves it to row 2`;
  },
};

// ---------- the runner ----------

async function runCheck(id, env) {
  const track = [];
  const pages = [];
  let over = false; // set when the check is over (finished or timed out): a check that is still running then cannot open pages nobody will close
  const open = async (save, extra) => {
    if (over) throw new Error("the check was stopped");
    const opened = await openGame(env, save, track, extra);
    pages.push(opened);
    return opened;
  };
  try {
    const detail = await withTimeout(checks[id](open, env), CHECK_TIMEOUT_MS);
    const errors = pages.flatMap((p) => p.errors);
    if (errors.length > 0) throw new Error(`the page reported ${errors.length} error(s): ${errors.slice(0, 2).join(" | ")}`);
    return detail;
  } finally {
    over = true;
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
    : null;

  const browser = await chromium.launch({ headless: true });
  const ran = Object.fromEntries(ALL_IDS.map((id) => [id, 0]));
  let n = 0;
  let f = 0;
  try {
    for (const id of ALL_IDS) {
      if (!ids.includes(id)) continue;
      for (const [w, h, dpr] of sizes ?? CHECK_SIZES[id]) {
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
