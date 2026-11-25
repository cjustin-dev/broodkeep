// Browser checks for Home slice H1 (docs/home-plan.md sections 3 and 11): the three-room home drawn through a camera, the gestures that move it (a drag, a pinch, the arrow
// keys), the Find button, and what a touch on the creature or the egg still does. Real touch events (CDP Input.dispatchTouchEvent, a few pixels at a time), a real mouse and
// real keys, against the built game (dist/).
//
// Run: node home-browser.mjs --base http://127.0.0.1:4173 [--only id1,id2] [--sizes 320x568@2,360x640@2] [--modes kid,adult]
// Exit: 0 when no check failed and at least one ran; 1 when any FAIL; 2 when the script broke (a requested --only id ran zero times, an unknown id, a bad flag, or a crash
// outside a check). A check that throws or times out prints a FAIL line, never a crash.
//
// How it sees the camera (the game keeps it in a ref and shows no numbers): through the canvas's own pixels. The wall of the home is drawn in stripes 5 game pixels wide
// every 10 (src/art/room.ts drawHomeBack: plain wall colours 239,227,247 and 228,211,240), so
//   - the width of a stripe in device pixels is 5 x the zoom, whatever the camera does;
//   - a band across the top of the wall (world y 4 to 44) moves by exactly the finger's travel when the camera is dragged (compared pixel by pixel, no tolerance),
//     and the half-stripe shift (5 x zoom) must NOT match, so a band that looks the same everywhere cannot pass;
//   - above and below a home that fits the picture the picture is the void colour 18,12,32.
// Expected values are literals worked out by hand from the data and the rules, never the page's own functions:
//   - the picture is a square of `vp` device pixels (128 x a whole k; 512, 640, 1024, 256 at 320, 360, 390 wide at pixel ratio 2, 2, 3 and 360 wide at 1), home 768 x 192 game pixels,
//     so the home opens at floor(vp / 192) device pixels per game pixel (2, 3, 5, 1) with the home centred (32 device pixels of void above it; 64 at 512) and at most
//     round(2.5 x ratio) (5, 5, 8, 3);
//   - the adult (Gravelhorn) is 48 pixels and stands on tiles (15,5)-(16,5)... its box is x 360 to 408, y 96 to 144, so the camera opens on x 384 and the box's middle is
//     24 game pixels below the picture's middle; a kid (Pebblin, 24 pixels) stands at x 360 to 384, y 120 to 144; the egg (16 pixels) at x 124 to 140, y 128 to 144;
//   - a pet is 2 happiness (tuning.affection.pet), the first at 450 ms and one every 800 ms after; a tickle (third quick tap) 3; an egg tap shaves 0.5 minutes.
// Date.now is fixed at T (Playwright's setFixedTime), but the page's timers and frames are NOT paused: they run in real time between a check's steps, and runFor() jumps them
// forward on top of that (a creature asleep for 12 real seconds has walked to its bed with no runFor at all). So a check that needs the picture at two times reads both from ONE
// page; a second page of the same save keeps running while the first is read. Saves come from gen-saves (saves/<scenario>-<mode>.json).
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

const CHECK_MODES = {
  "home-open": ["adult", "kid"],
  "home-pan": ["adult", "kid"],
  "home-pinch": ["adult", "kid"],
  "home-find": ["adult", "kid"],
  "home-pet": ["adult", "kid"],
  "home-asleep": ["adult"],
  "home-layout": ["adult", "kid"],
  "home-keys": ["adult", "kid"],
  "home-mouse": ["adult"],
};
const ALL_IDS = Object.keys(CHECK_MODES);
const ALL_MODES = ["kid", "adult"];
const CHECK_SIZES = {
  "home-open": PHONES,
  "home-pan": PHONES,
  "home-pinch": PHONES,
  "home-find": PHONES,
  "home-pet": PHONES,
  "home-asleep": [[360, 640, 2]],
  "home-layout": PHONES,
  "home-keys": DESKTOPS,
  "home-mouse": DESKTOPS,
};
const TOUCH_CHECKS = new Set(["home-open", "home-pan", "home-pinch", "home-find", "home-pet", "home-asleep", "home-layout"]);

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
  if (extra.still !== false) await page.addInitScript(() => { Math.random = () => 0.99; });
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

// ---------- the checks: each returns a detail string, or throws ----------

const VOID = 0x120c20;
const STRIPE_A = 0xefe3f7; // the wall's plain colour (239,227,247): world x 5 to 9, 15 to 19, ...
const STRIPE_B = 0xe4d3f0; // the stripe colour (228,211,240): world x 0 to 4, 10 to 14, ...

const OPEN_STATES = [
  ["awake", "Gravelhorn is doing fine. In the living room."],
  ["kid", "Pebblin is doing fine. In the living room."],
  ["young", "Cragpup is doing fine. In the living room."],
  ["egg", "An egg. Tap it to help it hatch."],
  ["away", "Gravelhorn is out working at the Bug meadow."],
  ["dead", "Gravelhorn has passed away."],
  ["asleep", "Gravelhorn is asleep. In the living room."],
];

const checks = {
  "home-open": async (open, env) => {
    for (const [name, label] of OPEN_STATES) {
      const { page } = await open(SAVE_OF[name](env.mode));
      const g = await geometry(env, page);
      const at = `${name}`;
      expectEq(g.box.label, label, `${at}: what the picture says`);
      if (g.box.sideways) throw new Error(`${at}: the page scrolls sideways`);
      expectEq(g.box.pageZoom, 1, `${at}: the page's zoom`);
      expectEq(g.box.touchAction, "none", `${at}: the picture's touch-action (the browser must not take the finger)`);
      expectEq(g.box.tabindex, "0", `${at}: the picture's tabindex (it takes the arrow keys)`);
      // The home fits the picture's height: void above and below, the wall right under it, and the stripes at the zoom it opens at.
      const mid = Math.round(g.vp / 2);
      const col = async (y) => page.evaluate(pixelAt, [mid, y]);
      // (A sleeping creature darkens the whole picture, the void too: there it is the same above and below, and not the plain void colour.)
      const outside = [await col(g.top - 1), await col(g.top + 192 * g.z)];
      if (name === "asleep") {
        if (outside[0] !== outside[1] || outside[0] === VOID) throw new Error(`${at}: the void above and below should be one darkened colour, got ${outside.map((v) => v.toString(16))}`);
      } else expectEq(outside, [VOID, VOID], `${at}: the picture just above and just below the home`);
      const inside = [await col(g.top), await col(g.top + 192 * g.z - 1)];
      if (inside.some((v) => v === outside[0])) throw new Error(`${at}: the home's first or last row is the void colour (${inside.map((v) => v.toString(16))})`);
      if (name !== "asleep") {
        // (a sleeping creature darkens the wall too, so its stripes are not the plain colours)
        const stripes = await page.evaluate(stripeWidth);
        expectEq([stripes.width, stripes.firstRow], [5 * g.z, g.top], `${at}: the wall's stripe width and the first row of the home (zoom ${g.z})`);
      }
      // Everything is in view when the home opens: no Find button.
      expectEq(await page.locator("button.find").count(), 0, `${at}: Find buttons when the home opens`);
    }
    return `${OPEN_STATES.length} saved games open with their words, the home opens at ${WINDOWS[`${env.w}x${env.h}@${env.dpr}`].z} device pixels per game pixel, centred up and down (stripes ${5 * WINDOWS[`${env.w}x${env.h}@${env.dpr}`].z} wide), void above and below, no Find button, touch-action none, tabindex 0, no sideways page, page zoom 1`;
  },

  "home-pan": async (open, env) => {
    const { page, cdp } = await open(SAVE_OF.awake(env.mode));
    const g = await geometry(env, page);
    const dpr = env.dpr;
    const { box } = g;
    const start = [box.left + box.cssW * 0.8, box.top + box.cssH * 0.3]; // empty wall and floor, away from the creature
    const dragBy = (dx, dy, opt) => touchDrag(page, cdp, start, [start[0] + dx, start[1] + dy], opt);
    const band = () => page.evaluate(bandPixels, wallBand(g));
    const at = (what) => `${env.mode} ${env.w}x${env.h}@${dpr} ${what}`;
    let a = await band();
    // A drag of the finger by 100 CSS pixels moves the picture by exactly that, and the first step counts from where the finger landed.
    await dragBy(-100, 0);
    let b = await band();
    expectMoved(a, b, -100 * dpr, g.z, at("a drag 100 left"));
    a = b;
    await dragBy(60, 0);
    b = await band();
    expectMoved(a, b, 60 * dpr, g.z, at("a drag 60 right"));
    a = b;
    // Under the 8 CSS pixel slop nothing moves; just over it, the whole travel counts (the picture does not jump behind the finger).
    await dragBy(5, 0);
    b = await band();
    expectStill(a, b, at("a 5 pixel wiggle"));
    await dragBy(12, 0);
    b = await band();
    expectMoved(a, b, 12 * dpr, g.z, at("a 12 pixel drag"));
    a = b;
    // There and back in one touch is no movement.
    {
      const send = (type, points) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: points });
      await send("touchStart", [{ x: start[0], y: start[1] }]);
      for (let i = 1; i <= 6; i++) {
        await send("touchMove", [{ x: start[0] - 10 * i, y: start[1] }]);
        await sleep(16);
      }
      for (let i = 1; i <= 6; i++) {
        await send("touchMove", [{ x: start[0] - 60 + 10 * i, y: start[1] }]);
        await sleep(16);
      }
      await send("touchEnd", []);
      await sleep(40);
      await frame(page);
      b = await band();
      expectStill(a, b, at("60 left then 60 right in one touch"));
    }
    // The home fits the picture's height at this zoom, so a vertical drag moves nothing.
    await dragBy(0, 100);
    b = await band();
    expectStill(a, b, at("a vertical drag"));
    // The edges: a long drag to the right of the picture stops with the bedroom's left wall at the picture's left edge, and no further drag moves it; likewise at the right end.
    const mid = (v) => Math.round(v);
    const ends = {};
    for (const [name, dx, edge] of [["left", 0.7 * box.cssW, 0], ["right", -0.7 * box.cssW, g.vp - 1]]) {
      const from = [box.left + box.cssW * (dx > 0 ? 0.1 : 0.9), box.top + box.cssH * 0.3];
      for (let i = 0; i < 8; i++) await touchDrag(page, cdp, from, [from[0] + dx, from[1]], { steps: 6 });
      const first = await page.evaluate(bandPixels, wallBand(g));
      await touchDrag(page, cdp, from, [from[0] + dx, from[1]], { steps: 6 });
      const second = await page.evaluate(bandPixels, wallBand(g));
      expectStill(first, second, at(`one more drag at the ${name} end`));
      const x = mid(edge);
      for (const y of [g.top + 10 * g.z, g.top + 40 * g.z]) {
        const colour = await page.evaluate(pixelAt, [x, y]);
        if (colour === VOID) throw new Error(`${at(`the ${name} end`)}: void shows at the picture's ${name} edge (x ${x}, y ${y}): the camera went past the home`);
      }
      // And the wall is exactly at the edge, not short of it: the stripes are 5 game pixels wide from x 0 (stripe colour 0 to 4, plain 5 to 9, ...), so at the left end the first
      // 5 x zoom device pixels are the stripe colour and the next one is not; at the right end (world x 768) the last 3 x zoom (765 to 767) are plain and the one before is a stripe.
      const row = g.top + 10 * g.z;
      const probe = name === "left" ? [[0, STRIPE_B], [5 * g.z - 1, STRIPE_B], [5 * g.z, STRIPE_A]] : [[g.vp - 1, STRIPE_A], [g.vp - 3 * g.z, STRIPE_A], [g.vp - 3 * g.z - 1, STRIPE_B]];
      for (const [px, want] of probe) {
        const colour = await page.evaluate(pixelAt, [px, row]);
        if (colour !== want) throw new Error(`${at(`the ${name} end`)}: the pixel at x ${px} is ${colour.toString(16)}, expected ${want.toString(16)}: the home's wall is not at the picture's edge`);
      }
      ends[name] = true;
    }
    // The page behind does not follow a finger dragged on the picture (touch-action none). Only meaningful where the page can scroll.
    await page.evaluate(() => window.scrollTo(0, 0));
    await frame(page);
    const top = await page.evaluate(canvasBox);
    let pageNote = "the page cannot scroll in this window (not tested here)";
    let moved = 0;
    if (top.pageMax > 0) {
      // The control (a finger can scroll the page here at all): a drag up that starts above the picture moves the page.
      const above = [top.left + top.cssW * 0.5, top.top * 0.5];
      await touchDrag(page, cdp, above, [above[0], above[1] - 40]);
      moved = (await page.evaluate(canvasBox)).pageScroll;
      if (!(moved > 0)) throw new Error(`${at("the control")}: a finger dragged up above the picture did not scroll the page (${moved}), so a page that stays put under the picture proves nothing`);
      await page.evaluate(() => window.scrollTo(0, 0));
      await frame(page);
      const from = [top.left + top.cssW * 0.5, top.top + top.cssH * 0.8];
      await touchDrag(page, cdp, from, [from[0], from[1] - Math.min(80, top.top + top.cssH * 0.8 - 20)]);
      const after = await page.evaluate(canvasBox);
      if (after.pageScroll !== top.pageScroll) throw new Error(`${at("a finger dragged up on the picture")}: the page behind moved from ${top.pageScroll} to ${after.pageScroll}`);
      pageNote = `the page behind (${top.pageMax} px to scroll, ${moved} moved by a finger above the picture as a control) stayed put under a finger dragged up on the picture`;
    } else if ((env.w === 320 || env.w === 360) && env.dpr === 2 && env.mode === "adult") {
      throw new Error(`${at("the page")}: expected a page that scrolls in this window, so the touch-action check has something to see`);
    }
    return `${env.w}x${env.h}@${dpr}: drags of 100 left, 60 right, 12 (over the slop) move the wall by exactly the finger's travel; 5 (under it), a vertical drag and 60 left + 60 right in one touch move nothing; both ends stop at the home's walls (no void, and the wall's stripes start exactly at the picture's edge); ${pageNote}`;
  },
  "home-pinch": async (open, env) => {
    // Two fingers spread or close around the middle of the picture: the zoom follows, and settles on a whole number of device pixels per game pixel, between 1 and
    // round(2.5 x pixel ratio). Hand-worked, one row after the other (each pinch starts from the zoom the row before left): the zoom times the fingers' distance ratio, rounded
    // (at 360 wide: 3 x 1.333 = 4.0 -> 4, then 4 x 1.2 = 4.8 -> 5, then 5 x 2 = 10 -> 5 (the largest), then 5 x 0.45 = 2.25 -> 2, then 2 x 0.1 = 0.2 -> 1).
    const PINCHES = {
      "320x568@2": [[60, 84, 3], [60, 96, 5], [60, 120, 5], [160, 72, 2], [160, 16, 1]],
      "360x640@2": [[60, 80, 4], [60, 72, 5], [60, 120, 5], [160, 72, 2], [160, 16, 1]],
      "390x844@3": [[60, 84, 7], [60, 120, 8], [160, 72, 4], [160, 32, 1]],
      "360x640@1": [[60, 114, 2], [60, 120, 3], [160, 64, 1]],
    };
    const { page, cdp } = await open(SAVE_OF.awake(env.mode));
    const g = await geometry(env, page);
    const { box } = g;
    const centre = [box.left + box.cssW / 2, box.top + box.cssH / 2];
    const seen = [];
    for (const [d0, d1, expected] of PINCHES[`${env.w}x${env.h}@${env.dpr}`]) {
      await pinch(page, cdp, centre, d0, d1);
      // Show the top of the wall (three drags down push the picture down until the camera is at the home's top), then measure the stripes.
      for (let i = 0; i < 3; i++) await touchDrag(page, cdp, [centre[0], box.top + box.cssH * 0.15], [centre[0], box.top + box.cssH * 0.9], { steps: 6 });
      const stripes = await page.evaluate(stripeWidth);
      expectEq(stripes.width, 5 * expected, `after fingers ${d0} to ${d1} apart: the wall's stripe width (zoom ${expected})`);
      const now = await page.evaluate(canvasBox);
      expectEq([now.w, now.h, now.sideways, now.pageZoom], [g.vp, g.vp, false, 1], `after fingers ${d0} to ${d1} apart: the picture's size, the page scrolling sideways, the page's own zoom`);
      seen.push(expected);
    }
    // A pinch is never a pet or a tap.
    const saved = await savedGame(page);
    expectEq(saved.creature.affection.gained, 0, "happiness gained by petting after the pinches (the fingers were on the creature)");
    return `${env.w}x${env.h}@${env.dpr}: fingers spreading and closing leave the wall at zoom ${seen.join(", ")} (whole numbers between 1 and ${g.max}), the page's own zoom at 1, the picture the same size, and nothing petted`;
  },

  "home-find": async (open, env) => {
    // The Find button shows while the creature (or the egg, or the bubble of one that is away) is not wholly in the picture, and brings the camera back to it.
    const cases = [
      ["awake", "Find Gravelhorn", true],
      ["egg", "Find the egg", true],
      ["dead", "Find Gravelhorn", true],
      ["away", "Find Gravelhorn", true],
      ["kid", "Find Pebblin", true],
    ];
    for (const [name, accessible] of cases) {
      const { page, cdp } = await open(SAVE_OF[name](env.mode));
      const g = await geometry(env, page);
      const { box } = g;
      const at = `${name}`;
      const first = await page.evaluate(bandPixels, wallBand(g));
      expectEq(await page.locator("button.find").count(), 0, `${at}: Find buttons when the home opens`);
      // Take the picture to the kitchen end: the creature, the egg and the bubble are all at or left of x 408, and the view there starts at 768 minus the picture's width in game pixels.
      const from = [box.left + box.cssW * 0.9, box.top + box.cssH * 0.3];
      for (let i = 0; i < 8; i++) await touchDrag(page, cdp, from, [box.left + box.cssW * 0.1, from[1]], { steps: 6 });
      const find = page.locator("button.find");
      expectEq(await find.count(), 1, `${at}: Find buttons once the picture is at the kitchen end`);
      expectEq(await find.getAttribute("aria-label"), accessible, `${at}: the Find button's name`);
      const geo = await page.evaluate(() => {
        const b = document.querySelector("button.find").getBoundingClientRect();
        const c = document.querySelector("canvas.room").getBoundingClientRect();
        return { w: b.width, h: b.height, inside: b.left >= c.left - 0.5 && b.right <= c.right + 0.5 && b.top >= c.top - 0.5 && b.bottom <= c.bottom + 0.5, text: document.querySelector("button.find").textContent.trim(), icon: document.querySelectorAll("button.find svg, button.find canvas, button.find img").length };
      });
      if (geo.w < 44 - 0.5 || geo.h < 44 - 0.5) throw new Error(`${at}: the Find button is ${geo.w} x ${geo.h} (at least 44 x 44 is wanted)`);
      if (!geo.inside) throw new Error(`${at}: the Find button is not inside the picture`);
      expectEq([geo.text, geo.icon > 0], ["", true], `${at}: the Find button's words (none: it is an icon) and whether it holds a picture`);
      // A click on it: the camera glides (still on its way 100 ms later, so the button is still there), and arrives (gone, and the wall where it was at the start).
      // (A click, not a touch tap: the emulated phone does not hand the click of a touch tap to the page until the next touch comes, for a button that has no touch-action of its own.)
      await find.click({ timeout: 5000 });
      await page.clock.runFor(100);
      expectEq(await find.count(), 1, `${at}: Find buttons 100 ms after the tap (the camera glides)`);
      await page.clock.runFor(600);
      expectEq(await find.count(), 0, `${at}: Find buttons after the glide`);
      const back = await page.evaluate(bandPixels, wallBand(g));
      expectStill(first, back, `${at}: the picture after Find against the start`);
    }
    // Asked for less motion, it jumps: the next frame has the camera there.
    const { page } = await open(SAVE_OF.awake(env.mode), { reducedMotion: true });
    const cdp = await page.context().newCDPSession(page);
    const g = await geometry(env, page);
    const { box } = g;
    const first = await page.evaluate(bandPixels, wallBand(g));
    const from = [box.left + box.cssW * 0.9, box.top + box.cssH * 0.3];
    for (let i = 0; i < 8; i++) await touchDrag(page, cdp, from, [box.left + box.cssW * 0.1, from[1]], { steps: 6 });
    await page.locator("button.find").click({ timeout: 5000 });
    await page.clock.runFor(40);
    expectEq(await page.locator("button.find").count(), 0, "reduced motion: Find buttons 40 ms after the tap (it jumps)");
    expectStill(first, await page.evaluate(bandPixels, wallBand(g)), "reduced motion: the picture after Find against the start");
    return `${env.w}x${env.h}@${env.dpr}: Find is absent at the start, appears (named, 48 wide and high, inside the picture, no words) when the picture is taken to the kitchen end for ${cases.map((c) => c[0]).join(", ")}, glides back on a tap (still there 100 ms on, gone after, the wall as at the start), and jumps when less motion is asked for`;
  },

  "home-pet": async (open, env) => {
    // What a touch on the creature or the egg still does in the home. The first pet is at 450 ms and one more every 800 ms (2 happiness each); the third quick tap in 1200 ms is a
    // tickle (3). The camera is at x 384, y 96 on the adult (box x 360 to 408, y 96 to 144), x 372 on the kid (x 360 to 384, y 120 to 144), x 132 on the egg (x 124 to 140, y 128 to 144).
    const pose = (box, g, cam, centre) => screenOf(box, g.vp, g.z, env.dpr, cam, centre);
    const gained = async (page) => (await savedGame(page)).creature.affection.gained;
    {
      const { page, cdp } = await open(SAVE_OF.awake(env.mode));
      const g = await geometry(env, page);
      const { box } = g;
      const [cx, cy] = pose(box, g, [384, 96], [384, 120]);
      const half = (24 * g.z) / env.dpr;
      const band = () => page.evaluate(bandPixels, wallBand(g));
      expectEq(await gained(page), 0, "adult: happiness gained by petting at the start");
      await touchHold(page, cdp, [cx, cy], 700);
      expectEq(await gained(page), 2, "adult: after holding the creature 700 ms (one pet)");
      await touchHold(page, cdp, [cx + half + 22, cy], 700);
      expectEq(await gained(page), 2, "adult: after holding 22 CSS pixels past its edge (past the 14 pixel slack)");
      await touchHold(page, cdp, [cx + half + 8, cy], 700);
      expectEq(await gained(page), 4, "adult: after holding 8 CSS pixels past its edge (inside the slack)");
      {
        const send = (type, points) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: points });
        await send("touchStart", [{ x: cx, y: cy }]);
        await send("touchMove", [{ x: cx + 5, y: cy }]); // (under the 8 pixel slop: still a hold)
        await page.clock.runFor(700);
        await send("touchEnd", []);
        await sleep(40);
        await frame(page);
      }
      expectEq(await gained(page), 6, "adult: after a 700 ms hold with the finger 5 CSS pixels off where it landed");
      await touchHold(page, cdp, [cx, cy], 1400);
      expectEq(await gained(page), 10, "adult: after a 1400 ms hold (pets at 450 and 1250 ms)");
      // Reading the saved game runs the clock 800 ms, so the two counts are two separate runs of taps with the 1200 ms window let run out between them.
      for (let i = 0; i < 2; i++) {
        await touchTap(page, cdp, [cx, cy]);
        await page.clock.runFor(100);
      }
      expectEq(await gained(page), 10, "adult: after two quick taps (a startle each, nothing gained: the tickle is the third)");
      await page.clock.runFor(1300);
      for (let i = 0; i < 3; i++) {
        await touchTap(page, cdp, [cx, cy]);
        await page.clock.runFor(100);
      }
      expectEq(await gained(page), 13, "adult: after three quick taps (a tickle, 3)");
      // A second finger ends a hold at once: nothing is petted (a pet now would take it to 15).
      {
        const send = (type, points) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: points });
        await send("touchStart", [{ x: cx, y: cy, id: 1 }]);
        await page.clock.runFor(200);
        await send("touchStart", [{ x: cx, y: cy, id: 1 }, { x: box.left + 30, y: box.top + 30, id: 2 }]);
        await page.clock.runFor(1000);
        await send("touchEnd", []);
        await sleep(40);
        await frame(page);
      }
      expectEq(await gained(page), 13, "adult: after a hold with a second finger put down 200 ms in");
      // A finger that starts on the creature and drags pans the picture, and is not a pet however long it stays down.
      const before = await band();
      await touchDrag(page, cdp, [cx, cy], [cx - 48, cy], { steps: 6, hold: 800 });
      expectEq(await gained(page), 13, "adult: after a finger dragged 48 CSS pixels from the creature and kept down 800 ms");
      expectMoved(before, await band(), -48 * env.dpr, g.z, "a drag that starts on the creature");
    }
    {
      const { page, cdp } = await open(SAVE_OF.kid(env.mode));
      const g = await geometry(env, page);
      const [cx, cy] = pose(g.box, g, [372, 96], [372, 132]);
      const half = (12 * g.z) / env.dpr;
      await touchHold(page, cdp, [cx, cy], 700);
      expectEq(await gained(page), 2, "kid creature: after holding it 700 ms");
      await touchHold(page, cdp, [cx + half + 22, cy], 700);
      expectEq(await gained(page), 2, "kid creature: after holding 22 CSS pixels past its edge");
      await touchHold(page, cdp, [cx + half + 8, cy], 700);
      expectEq(await gained(page), 4, "kid creature: after holding 8 CSS pixels past its edge");
    }
    {
      const { page, cdp } = await open(SAVE_OF.egg(env.mode));
      const g = await geometry(env, page);
      const [cx, cy] = pose(g.box, g, [132, 96], [132, 136]);
      const half = (8 * g.z) / env.dpr;
      const shaved = async () => (await savedGame(page)).egg.shavedMinutes;
      expectEq(await shaved(), 0, "egg: minutes shaved at the start");
      for (let i = 0; i < 3; i++) {
        await touchTap(page, cdp, [cx, cy]);
        await page.clock.runFor(100);
      }
      expectEq(await shaved(), 1.5, "egg: after three taps on it (0.5 each)");
      await touchTap(page, cdp, [cx + half + 22, cy]);
      expectEq(await shaved(), 1.5, "egg: after a tap 22 CSS pixels past its edge");
      await touchHold(page, cdp, [cx, cy], 1000);
      expectEq(await shaved(), 2, "egg: after holding it a second (a hold is one tap on release, never a pet)");
    }
    return `${env.w}x${env.h}@${env.dpr}: a hold pets (2, then 2 more each 800 ms), a miss past the 14 pixel slack does not, a jitter under 8 pixels still does, three quick taps tickle (3), a second finger or a drag ends the hold, the kid creature answers a hold, a miss and a near miss the same way, and the egg shaves 0.5 minutes a tap (3 taps 1.5, a miss nothing)`;
  },
  "home-asleep": async (open, env) => {
    // A sleeping creature walks to its bed (20 game pixels a second, from x 384 in the living room to the bed in the bedroom) and lies down. The camera does not follow it, so the
    // Find button appears. The words for a screen reader name the room it is in.
    const { page } = await open(SAVE_OF.asleep(env.mode), { still: false });
    expectEq((await page.evaluate(canvasBox)).label, "Gravelhorn is asleep. In the living room.", "words at the start");
    expectEq(await page.locator("button.find").count(), 0, "Find buttons at the start");
    await page.clock.runFor(3000);
    expectEq((await page.evaluate(canvasBox)).label, "Gravelhorn is asleep. In the living room.", "words after 3 s (60 pixels walked: its middle is at x 324)");
    await page.clock.runFor(9000);
    expectEq((await page.evaluate(canvasBox)).label, "Gravelhorn is asleep. In the bedroom.", "words after 12 s (240 pixels: past the doorway)");
    await page.clock.runFor(40000);
    await page.waitForTimeout(100);
    const box = await page.evaluate(canvasBox);
    expectEq(box.label, "Gravelhorn is asleep. In the bedroom.", "words after 52 s");
    expectEq(await page.locator("button.find").count(), 1, "Find buttons once it is in the bedroom, out of the picture");
    await page.locator("button.find").click({ timeout: 5000 });
    await page.clock.runFor(700);
    expectEq(await page.locator("button.find").count(), 0, "Find buttons after Find (the bed is in view)");
    // It is LYING in the bed, not standing in front of it: the picture round the bed against the same save a moment after the start (the creature still in the living room, the
    // picture taken to the bedroom end by the keys). Over the bed (x 36 to 84, y 15 to 63, where a creature of 48 lies) the two differ; in front of the bed (x 48 to 96, y 72 to 96,
    // where it would stand) they are the same. Both are darkened alike, being asleep. After Find the camera is at the bedroom end too, so the wall to the right of the bed (world x 96
    // on, its window included) is the same in both; the bed's own columns are not compared there, a creature lies in them.
    const g = await geometry(env, page);
    const pic = (p, y0, y1) => p.evaluate(bandPixels, [g.top + y0 * g.z, g.top + y1 * g.z]);
    const wallA = await page.evaluate(bandPixels, wallBand(g));
    const bedA = await pic(page, 15, 63);
    const frontA = await pic(page, 72, 96);
    const { page: start } = await open(SAVE_OF.asleep(env.mode), { still: false });
    await start.locator("canvas.room").focus();
    for (let i = 0; i < 8; i++) {
      await start.keyboard.press("ArrowLeft");
      await frame(start, 40);
    }
    const wallStart = await start.evaluate(bandPixels, wallBand(g));
    const camera = regionMismatch(wallA, wallStart, 96 * g.z, g.vp);
    if (camera !== 0) throw new Error(`after Find: the wall right of the bed is not where the keys put it (${Math.round(camera * 1000) / 10} % differs): the camera is not at the bedroom end`);
    const over = regionMismatch(bedA, await pic(start, 15, 63), 36 * g.z, 84 * g.z);
    if (over < 0.05) throw new Error(`over the bed the picture is the same with the creature in bed as with the bed empty (${Math.round(over * 1000) / 10} % differs): it is not lying there`);
    const before = regionMismatch(frontA, await pic(start, 72, 96), 48 * g.z, 96 * g.z);
    if (before !== 0) throw new Error(`in front of the bed the picture differs with the creature in bed (${Math.round(before * 1000) / 10} %): it is standing there`);
    await start.keyboard.press("ArrowRight"); // control: one key press away from the bedroom end, the same columns do differ
    await frame(start, 40);
    const moved = regionMismatch(wallA, await start.evaluate(bandPixels, wallBand(g)), 96 * g.z, g.vp);
    if (moved < 0.2) throw new Error(`the wall right of the bed looks the same a key press away (${Math.round(moved * 1000) / 10} % differs), so the comparison cannot tell`);
    return "a sleeping creature leaves the living room (the words say so at 3 s), is in the bedroom by 12 s and, at 52 s, lies in the bed (the picture over the bed differs from the empty bed, in front of it is the same); Find appears while it is out of the picture and brings the bed end into view";
  },

  "home-layout": async (open, env) => {
    // The layout in the save (docs/home-plan.md section 12): the home is drawn, and walked, from `save.home`. Two saved games (gen-saves.ts) move pieces of the starter home:
    // the sofa two tiles right (columns 13 to 16 become 15 to 18) and the rug two tiles left (13 to 16 become 11 to 14), and the bed from the bedroom to the living room
    // (columns 17 to 19, rows 1 and 2). The starter game is the control for every probe: a probe that reads the same colour in both would prove nothing.
    // The points are worked out by hand from src/art/room.ts (a tile is 24 pixels): the sofa's seat is the rectangle x + 8 to x + w - 8, y + 26 to y + 44 of a sofa at (x, y), colour
    // 6a8ae0; the rug's inner rectangle, colour c85a7c, starts 3 pixels inside it; the bed's pillow, white, is at x + 2 to x + 12, y + 6 to y + 12 of the bed's picture, whose left
    // edge is 8 pixels right of its column and whose y is 23 below its row; the wood floor is d9a066 with c78d52 lines. A sleeping creature darkens everything, so the colours are
    // read on awake saves, and the lying creature is found by comparing two sleeping pictures (as home-asleep does).
    const SEAT_OLD = [340, 59]; // the starter sofa (13, 1): x 312 to 408, seat 320 to 400, y 50 to 68; the moved sofa starts at 360
    const SEAT_NEW = [430, 59]; // the moved sofa (15, 1): x 360 to 456, seat 368 to 448
    const RUG_OLD = [372, 156]; // the starter rug (13, 4): x 312 to 408, y 96 to 168; the adult stands on its upper rows, so a point below its feet
    const RUG_NEW = [300, 132]; // the moved rug (11, 4): x 264 to 360, y 96 to 168 (inside the picture at every window: the camera's left edge is world 277 at 360 wide, ratio 2)
    const PILLOW_NEW = [422, 56]; // the bed at (17, 1): left 416, y 47: the pillow x 418 to 428, y 53 to 59
    const PILLOW_OLD = [38, 56]; // the bed at (1, 1): left 32, y 47: the pillow x 34 to 44
    const OPEN_CAMERA = 384; // the camera opens on the adult's middle (home-open's note)
    const SEAT = 0x6a8ae0;
    const RUG = 0xc85a7c;
    const WHITE = 0xffffff;
    const WOOD = [0xd9a066, 0xc78d52];
    const hex = (v) => v.toString(16).padStart(6, "0");
    // (the game rounds the offset first, Math.round(vp / 2 - camera x zoom), and draws the world on whole device pixels from there, so the middle of a game pixel is whole + floor(zoom / 2))
    const dev = (g, camera, [wx, wy]) => [Math.round(g.vp / 2 - camera * g.z) + wx * g.z + Math.floor(g.z / 2), g.top + wy * g.z + Math.floor(g.z / 2)];
    const probe = async (page, g, camera, world, want, what) => {
      const [x, y] = dev(g, camera, world);
      const got = await page.evaluate(pixelAt, [x, y]);
      const ok = Array.isArray(want) ? want.includes(got) : got === want;
      if (!ok) throw new Error(`${what}: world (${world}) at device (${x}, ${y}) is ${hex(got)}, expected ${Array.isArray(want) ? want.map(hex).join(" or ") : hex(want)}`);
    };
    const toBedroomEnd = async (page) => {
      await page.locator("canvas.room").focus();
      for (let i = 0; i < 8; i++) {
        await page.keyboard.press("ArrowLeft");
        await frame(page, 40);
      }
    };
    const WORDS = "Gravelhorn is doing fine. In the living room.";

    // The starter home (the control), then the same points with the sofa and the rug moved.
    const { page: plain } = await open(SAVE_OF.awake(env.mode));
    const g = await geometry(env, plain);
    await probe(plain, g, OPEN_CAMERA, SEAT_OLD, SEAT, "the starter sofa's seat");
    await probe(plain, g, OPEN_CAMERA, SEAT_NEW, WOOD, "the starter home where the moved sofa will be");
    await probe(plain, g, OPEN_CAMERA, RUG_OLD, RUG, "the starter rug");
    await probe(plain, g, OPEN_CAMERA, RUG_NEW, WOOD, "the starter home where the moved rug will be");
    await probe(plain, g, OPEN_CAMERA, PILLOW_NEW, WOOD, "the starter home where the moved bed will be");
    await toBedroomEnd(plain);
    await probe(plain, g, g.vp / (2 * g.z), PILLOW_OLD, WHITE, "the starter bed's pillow");

    const { page: moved } = await open(SAVE_OF.moved(env.mode));
    expectEq((await moved.evaluate(canvasBox)).label, WORDS, "the moved home's words");
    await probe(moved, g, OPEN_CAMERA, SEAT_OLD, WOOD, "the moved home where the sofa was");
    await probe(moved, g, OPEN_CAMERA, SEAT_NEW, SEAT, "the moved sofa's seat");
    await probe(moved, g, OPEN_CAMERA, RUG_OLD, WOOD, "the moved home where the rug was");
    await probe(moved, g, OPEN_CAMERA, RUG_NEW, RUG, "the moved rug");
    expectEq(await moved.locator("button.find").count(), 0, "Find buttons when the moved home opens (the camera is on the creature)");

    // The bed: in the living room, and gone from the bedroom.
    const { page: bed } = await open(SAVE_OF.bedMoved(env.mode));
    await probe(bed, g, OPEN_CAMERA, PILLOW_NEW, WHITE, "the moved bed's pillow");
    await toBedroomEnd(bed);
    await probe(bed, g, g.vp / (2 * g.z), PILLOW_OLD, WOOD, "the bedroom where the bed was");

    // A sleeping creature walks to the bed where it is now (20 pixels a second: about 6 s from tile (15, 5) to the tile in front of the bed, (18, 3)) and lies down in it. It never
    // leaves the picture, so there is no Find button. It lies over the bed (x 420 to 468, y 15 to 63, as a creature of 48 lies on a bed whose left edge is 416) and does not
    // stand in front of it (x 432 to 480, y 72 to 96): the picture 20 s on against the same page's first picture (the camera is the same: nothing touches it).
    const { page: sleeper } = await open(SAVE_OF.bedMovedAsleep(env.mode), { still: false });
    const rows = (p, y0, y1) => p.evaluate(bandPixels, [g.top + y0 * g.z, g.top + y1 * g.z]);
    const overStart = await rows(sleeper, 15, 63); // (the start: the creature has had a moment, a few pixels of its walk, and is nowhere near the bed or the tile in front of it)
    const frontStart = await rows(sleeper, 72, 96);
    expectEq((await sleeper.evaluate(canvasBox)).label, "Gravelhorn is asleep. In the living room.", "words at the start");
    await sleeper.clock.runFor(20000);
    await sleeper.waitForTimeout(100);
    expectEq((await sleeper.evaluate(canvasBox)).label, "Gravelhorn is asleep. In the living room.", "words after 20 s");
    expectEq(await sleeper.locator("button.find").count(), 0, "Find buttons after 20 s (the bed is in the picture)");
    const cols = (x0, x1) => [dev(g, OPEN_CAMERA, [x0, 0])[0], dev(g, OPEN_CAMERA, [x1, 0])[0]];
    const over = regionMismatch(overStart, await rows(sleeper, 15, 63), ...cols(420, 468));
    if (over < 0.05) throw new Error(`over the moved bed the picture is the same with the creature asleep for 20 s as at its first frame (${Math.round(over * 1000) / 10} % differs): it is not lying there`);
    const before = regionMismatch(frontStart, await rows(sleeper, 72, 96), ...cols(432, 480));
    if (before !== 0) throw new Error(`in front of the moved bed the picture differs from the first frame (${Math.round(before * 1000) / 10} %): the creature is standing there`);
    return "the sofa, the rug and the bed are drawn where the save puts them and not where the starter home has them (each probe reads the other game's colour: sofa seat 6a8ae0, rug c85a7c, pillow ffffff, against wood floor); a sleeper walks to the bed in the living room, lies over it and not in front of it, and Find is not shown at the open or after 20 s (it never leaves the picture: the words say the living room)";
  },

  "home-keys": async (open, env) => {
    // The picture takes the arrow keys (a fifth of its width a press, round(vp / 5) device pixels), plus and minus (one whole zoom step) when it has focus.
    const { page } = await open(SAVE_OF.awake(env.mode));
    const g = await geometry(env, page);
    const { box } = g;
    const step = Math.round(g.vp / 5);
    const canvas = page.locator("canvas.room");
    await canvas.focus();
    expectEq(await page.evaluate(() => document.activeElement === document.querySelector("canvas.room")), true, "the picture takes focus");
    const band = () => page.evaluate(bandPixels, wallBand(g));
    const press = async (key) => {
      await page.keyboard.press(key);
      await frame(page);
    };
    let a = await band();
    await press("ArrowRight");
    let b = await band();
    expectMoved(a, b, -step, g.z, "ArrowRight");
    a = b;
    await press("ArrowLeft");
    b = await band();
    expectMoved(a, b, step, g.z, "ArrowLeft");
    a = b;
    await press("ArrowUp");
    b = await band();
    expectStill(a, b, "ArrowUp (the home fits the picture's height)");
    await press("ArrowDown");
    expectStill(a, await band(), "ArrowDown (the home fits the picture's height)");
    await press("a");
    expectStill(a, await band(), "a key that is not the picture's");
    // The browser's own keys are left alone: Ctrl and + (its zoom), Meta and + and Alt and an arrow (its back button) do nothing to the picture, one test per modifier.
    for (const combo of ["Control+=", "Meta+=", "Alt+ArrowLeft", "Control+ArrowRight"]) {
      await press(combo);
      expectStill(a, await band(), `${combo} (the browser's own key)`);
    }
    // Zoom: plus goes up whole steps to the largest, minus down to 1.
    const widths = [];
    const zoomNow = async () => {
      for (let i = 0; i < 5; i++) await press("ArrowUp"); // (the top of the wall, where the stripes are clean)
      return (await page.evaluate(stripeWidth)).width / 5;
    };
    for (const key of ["+", "+", "+", "-", "-", "-", "-"]) {
      await press(key);
      widths.push(await zoomNow());
    }
    const up = [Math.min(g.max, g.z + 1), Math.min(g.max, g.z + 2), Math.min(g.max, g.z + 3)];
    const down = [1, 2, 3, 4].map((k) => Math.max(1, up[2] - k));
    expectEq(widths, [...up, ...down], `the zoom after + + + - - - - from ${g.z} (largest ${g.max}, smallest 1)`);
    return `${env.w}x${env.h}@${env.dpr}: the focused picture pans by ${step} device pixels a press (right, left; up and down do nothing while the home fits), ignores other keys, and zooms by whole steps ${widths.join(", ")}`;
  },

  "home-mouse": async (open, env) => {
    // The mouse is a finger too: a drag pans, a hold pets, the right button does nothing.
    const { page } = await open(SAVE_OF.awake(env.mode));
    const g = await geometry(env, page);
    const { box } = g;
    const [cx, cy] = screenOf(box, g.vp, g.z, env.dpr, [384, 96], [384, 120]);
    const band = () => page.evaluate(bandPixels, wallBand(g));
    const m = page.mouse;
    const gained = async () => (await savedGame(page)).creature.affection.gained;
    let a = await band();
    const from = [box.left + box.cssW * 0.8, box.top + box.cssH * 0.3];
    await m.move(...from);
    await m.down();
    for (let i = 1; i <= 10; i++) await m.move(from[0] - 10 * i, from[1]);
    await m.up();
    await frame(page);
    let b = await band();
    expectMoved(a, b, -100 * env.dpr, g.z, "a mouse drag of 100 pixels");
    // The home is where the drag left it: the creature is 100 pixels to the left of where it was.
    const [px, py] = [cx - 100 / env.dpr * env.dpr, cy];
    await m.move(px, py);
    await m.down();
    await page.clock.runFor(700);
    await m.up();
    expectEq(await gained(), 2, "after holding the creature with the mouse for 700 ms");
    await m.move(px, py);
    await m.down({ button: "right" });
    await page.clock.runFor(1000);
    await m.up({ button: "right" });
    expectEq(await gained(), 2, "after the right button held on the creature for a second");
    a = await band();
    await m.move(...from);
    await m.down({ button: "right" });
    for (let i = 1; i <= 10; i++) await m.move(from[0] - 10 * i, from[1]);
    await m.up({ button: "right" });
    await frame(page);
    expectStill(a, await band(), "a drag with the right button");
    return `the mouse's main button drags the wall by the pointer's travel (100 pixels) and pets after a 700 ms hold (2); the right button does nothing`;
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
