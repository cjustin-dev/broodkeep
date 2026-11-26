// Browser checks for A3.1 Bond (docs/adult-a3-plan.md section 4, edges 1, 2, 11, 16 to 18): the Bond chip and card in Adult Mode's header, what a held finger, a tap and three taps do
// to Bond, the level-up and the level 5 sparkles, the chip's pop (and its still ring in a window that asks for reduced motion), Kid Mode showing and changing nothing and throwing no sparkles, and the fit of the new text at 320, 360 and 390 wide at pixel ratios 1, 2 and 3.
// Real touch events (CDP Input.dispatchTouchEvent) on a mobile touch window against the built game (dist/).
//
// Run: node bond-browser.mjs --base http://127.0.0.1:4173 [--only id1,id2] [--sizes 360x640@2,390x844@3] [--modes kid,adult]
// Exit: 0 when no check failed and at least one ran; 1 when any FAIL; 2 when the script broke (a requested --only id ran zero times, an unknown id, a bad flag, or a crash outside a
// check). A check that throws or times out prints a FAIL line, never a crash.
//
// The saves come from gen-saves (saves/adult-home-<mode>.json, saves/kid-home-<mode>.json) with a `bond` put on the creature here. Expected values are literals worked out by hand from
// tuning.ts and tests/bond.test.ts, never the page's own functions:
//   - a pet is 2 happiness (the first 8 of a window are at the full rate) and 1 Bond XP up to the ninth of a chain; the first pet is at 450 ms of a hold and one more every 800 ms;
//   - a tickle (the third quick tap) is 3 XP and leaves the chain alone; a tap alone (a poke) is nothing;
//   - the levels start at 0, 300, 800, 1,500, 3,000 XP (and on to 15,000), so 296 XP is level 1 with 4 to go, 920 is level 3 with 120 of 700 to level 4, 3,100 is level 5;
//   - the adult stands where home-browser.mjs says (camera at x 384, y 96, the creature's middle at x 384, y 120).
// Date.now is fixed at T (Playwright's setFixedTime), so every pet of a hold is at the same instant (a gap of 0 chains); the page's timers run on the fake clock (runFor).
// The sparkle is drawn as the exact colour #ffe066 (src/art/scene.ts): a burst is counted as a rise in pixels of that colour. Math.random is 0.99 for the whole page (the creature stands
// still), which also puts every sparkle of a burst on the same spot, so a burst is checked as "at least one sparkle", not as how many.
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

const NINE = [320, 360, 390].flatMap((w, i) => [1, 2, 3].map((r) => [w, [568, 640, 844][i], r]));
const THREE = [
  [320, 568, 1],
  [360, 640, 2],
  [390, 844, 3],
];
const CHECK_MODES = {
  "bond-hold": ["adult"],
  "bond-card": ["adult"],
  "bond-kid": ["kid"],
  "bond-poke": ["adult"],
  "bond-burst": ["adult"],
  "bond-fit": ["adult"],
  "bond-reload": ["adult"],
  "bond-motion": ["adult"],
};
const CHECK_SIZES = {
  "bond-hold": THREE,
  "bond-card": NINE,
  "bond-kid": THREE,
  "bond-poke": THREE,
  "bond-burst": THREE,
  "bond-fit": NINE,
  "bond-reload": [[360, 640, 2]],
  "bond-motion": [[360, 640, 2]],
};
const ALL_IDS = Object.keys(CHECK_MODES);
const ALL_MODES = ["kid", "adult"];
const FLAGS = ["base", "only", "sizes", "modes"];

const HOW = ["Hold to pet, or tap three times to tickle: both build Bond.", "Poke: gets attention."];

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
// The living adult at home (Gravelhorn) with a Bond of `xp` and no chain; the Kid Mode creature (Pebblin) with the Bond a Kid profile may carry.
function adult(xp, extra = {}) {
  const save = load("adult-home", "adult");
  save.creature.bond = { xp, chain: 0, at: 0 };
  Object.assign(save, extra);
  return save;
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

// Runs in the page: the picture's size and where it is on the screen (CSS pixels).
function canvasBox() {
  const c = document.querySelector("canvas.room");
  const r = c.getBoundingClientRect();
  return { w: c.width, left: r.left, top: r.top };
}

// Runs in the page: how many pixels of the picture are exactly this colour.
function countColour(rgb) {
  const c = document.querySelector("canvas.room");
  const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
  let n = 0;
  for (let i = 0; i < d.length; i += 4) if (d[i] === rgb[0] && d[i + 1] === rgb[1] && d[i + 2] === rgb[2] && d[i + 3] === 255) n++;
  return n;
}

// Runs in the page: the Bond chip and the card, as the player sees them.
function bondDom() {
  const chip = document.querySelector(".bond-chip");
  const card = document.querySelector(".bond-card");
  return {
    chips: document.querySelectorAll(".bond-chip").length,
    label: chip ? chip.getAttribute("aria-label") : null,
    expanded: chip ? chip.getAttribute("aria-expanded") : null,
    pop: chip ? chip.getAttribute("data-pop") : null,
    level: chip && chip.querySelector(".bond-level") ? chip.querySelector(".bond-level").textContent : null,
    fill: chip && chip.querySelector(".bond-fill") ? chip.querySelector(".bond-fill").style.width : null,
    cardLines: card ? [...card.querySelectorAll("p")].map((p) => p.textContent) : null,
    bodyHasBond: /\bBond\b/.test(document.body.innerText),
  };
}

// Runs in the page: the chip is scrolled to the middle of the window first (the page scrolls as a whole, so in a small window the header can sit above the top), then the middle and
// the edges of the chip, in CSS pixels, whether the chip with 14 pixels around it is inside the window, and whether the chip is what a finger finds 5 and 14 pixels above and below it.
function chipHit() {
  const chip = document.querySelector(".bond-chip");
  chip.scrollIntoView({ block: "center", behavior: "instant" });
  const r = chip.getBoundingClientRect();
  const x = (r.left + r.right) / 2;
  const at = (y) => {
    const el = document.elementFromPoint(x, y);
    return el ? el.closest(".bond-chip") !== null : false;
  };
  return { x, y: (r.top + r.bottom) / 2, top: r.top, bottom: r.bottom, h: r.height, visible: r.top - 14 >= 0 && r.bottom + 14 <= window.innerHeight, in5: [at(r.top - 5), at(r.bottom + 5)], in14: [at(r.top - 14), at(r.bottom + 14)] };
}

// Runs in the page: what does not fit. The page does not scroll sideways; the chip and the card sit inside the window's width; every text line of them sits inside its own box (a Range, not
// scrollWidth) and inside the window; the chip is inside the bag row or the row below it is not squeezed; no part of the header ends past the window's width.
function fitProblems(iw) {
  // `iw` is the window's width as the run set it (env.w), NOT window.innerWidth: in this mobile window a page that overflows widens innerWidth to its own width (a 360 px window read 467
  // with a 400 px bar), so innerWidth can never be smaller than the page and cannot be the reference.
  const problems = [];
  const doc = document.documentElement;
  if (doc.scrollWidth > iw) problems.push(`page scrollWidth ${doc.scrollWidth} > the window's width ${iw}`);
  const chip = document.querySelector(".bond-chip");
  if (!chip) return { problems: ["no Bond chip on the screen"], lines: 0 };
  let lines = 0;
  const parts = [chip, ...document.querySelectorAll(".bond-card")];
  for (const part of parts) {
    const partBox = part.getBoundingClientRect();
    if (partBox.right > iw + 0.5 || partBox.left < -0.5) problems.push(`${part.className} spans ${Math.round(partBox.left)} to ${Math.round(partBox.right)} in a window ${iw} wide`);
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
  for (const el of document.querySelectorAll(".adult-top *")) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && (r.right > iw + 0.5 || r.left < -0.5)) problems.push(`${el.tagName.toLowerCase()}.${el.getAttribute("class") ?? ""} spans ${Math.round(r.left)} to ${Math.round(r.right)} in a window ${iw} wide`);
  }
  return { problems: problems.slice(0, 5), lines };
}

// Runs in the page: the header's height with the Bond chip and without it (the chip hidden for a moment), so the cost of the chip is a number.
function headerCost() {
  const top = document.querySelector(".adult-top");
  const chip = document.querySelector(".bond-chip");
  const card = document.querySelector(".bond-card");
  const withIt = top.getBoundingClientRect().height;
  const shown = [chip, card].filter(Boolean).map((el) => [el, el.style.display]);
  for (const [el] of shown) el.style.display = "none";
  const without = top.getBoundingClientRect().height;
  for (const [el, was] of shown) el.style.display = was;
  return { withIt: Math.round(withIt), without: Math.round(without) };
}

// Runs in the page: the chip's pop, the name of its animation, and whether it shows the 2 px inset ring (the box-shadow of the chip while its card is open, and of its pop in a window that
// asks for less motion; bond-motion never opens the card).
function chipStyle() {
  const chip = document.querySelector(".bond-chip");
  const s = getComputedStyle(chip);
  return { pop: chip.getAttribute("data-pop"), animation: s.animationName, ring: / 0px 0px 0px 2px inset$/.test(s.boxShadow) };
}

// ---------- the page, the fingers ----------

// `extra` is more window options (reducedMotion, for one check).
async function openGame(env, save, track, extra = {}) {
  const context = await env.browser.newContext({
    ...extra,
    viewport: { width: env.w, height: env.h },
    deviceScaleFactor: env.dpr,
    isMobile: true,
    hasTouch: true,
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
  await page.addInitScript(() => {
    Math.random = () => 0.99; // every choice is "stay and look around": the creature is where the game put it
  });
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
  const cdp = await context.newCDPSession(page);
  return { page, cdp, errors };
}

const frame = (page, ms = 60) => page.clock.runFor(ms);

// The picture's zoom (device pixels per game pixel): the largest whole number that fits the home's 192 pixels in the square picture, at most round(2.5 x ratio).
async function geometry(env, page) {
  const box = await page.evaluate(canvasBox);
  const z = Math.min(Math.max(1, Math.round(2.5 * env.dpr)), Math.max(1, Math.floor(box.w / 192)));
  return { box, vp: box.w, z };
}

// Where a world point is on the screen (CSS pixels of the window), for a camera centred on (camX, camY) at zoom z.
const screenOf = (box, vp, z, dpr, cam, [wx, wy]) => [box.left + (vp / 2 + (wx - cam[0]) * z) / dpr, box.top + (vp / 2 + (wy - cam[1]) * z) / dpr];

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

// The saved game, once the game has written it (it waits 600 ms after a change). Reading it runs the clock 800 ms.
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

const creatureAt = (env, g) => screenOf(g.box, g.vp, g.z, env.dpr, [384, 96], [384, 120]);

// ---------- the checks ----------

const CHECKS = {
  // A held finger earns Bond one XP a pet, the level-up comes at the pet that reaches 300, the chip says so and pops, and the log says it once.
  "bond-hold": async (open, env) => {
    const { page, cdp, errors } = await open(adult(296));
    const g = await geometry(env, page);
    const [cx, cy] = creatureAt(env, g);
    const dom = () => page.evaluate(bondDom);
    expectEq((await dom()).label, "Bond level 1, 296 of 300 to level 2", "the chip at the start");
    expectEq((await dom()).level, "1", "the level on the chip at the start");
    expectEq([(await dom()).fill, (await dom()).pop], ["98%", "false"], "the chip's bar (296 of 300 is 98 percent, floor) and its pop at the start");
    await touchHold(page, cdp, [cx, cy], 700); // one pet, at 450 ms
    expectEq((await dom()).label, "Bond level 1, 297 of 300 to level 2", "the chip after one pet");
    expectEq([(await dom()).fill, (await dom()).pop], ["99%", "false"], "the chip's bar (297 of 300) and its pop after one pet (no new level)");
    await touchHold(page, cdp, [cx, cy], 2900); // pets at 450, 1250, 2050 and 2850 ms: 298, 299, 300 (level 2), 301
    const after = await dom();
    expectEq(after.label, "Bond level 2, 1 of 500 to level 3", "the chip after the level-up");
    expectEq(after.level, "2", "the level on the chip after the level-up");
    expectEq(after.pop, "true", "the chip's pop right after the level-up");
    expectEq(after.fill, "0%", "the chip's bar after the level-up (1 of 500 is 0 percent, floor)");
    await page.clock.runFor(2000);
    expectEq((await dom()).pop, "false", "the chip's pop 2 seconds later");
    const saved = await savedGame(page);
    expectEq(saved.creature.bond.xp, 301, "saved Bond XP (296 + 5 pets)");
    expectEq(saved.creature.bond.chain, 5, "saved chain (five pets at the same instant chain)");
    expectEq(saved.creature.affection.gained, 10, "saved happiness gained (5 pets at the full rate of 2)");
    expectEq(saved.log.filter((e) => e.text === "Bond level 2").length, 1, "the level-up in the log");
    expectEq(errors, [], "page errors");
    return `${env.w}x${env.h}@${env.dpr}: a 700 ms hold is one pet (296 to 297), 2900 ms more is four (301), level 2 is reached once (log, chip label, pop for under 2 s), happiness gained 10`;
  },

  // The chip opens a card and closes it again; the card has the lines worked out by hand; the chip's finger target reaches past the chip (found 5 px out, not 14 px out: the
  // stylesheet's 6 px is not measured to the pixel).
  "bond-card": async (open, env) => {
    const { page, cdp } = await open(adult(920));
    const dom = () => page.evaluate(bondDom);
    expectEq((await dom()).label, "Bond level 3, 120 of 700 to level 4", "the chip's label");
    expectEq((await dom()).expanded, "false", "the chip before it is tapped");
    expectEq((await dom()).cardLines, null, "the card before the chip is tapped");
    const hit = await page.evaluate(chipHit);
    if (hit.h >= 44) throw new Error(`the chip is ${hit.h} px tall: the finger-target check below proves nothing (it must be under 44 px with a larger target)`);
    expectEq(hit.visible, true, "the chip with 14 px around it is inside the window (the finger-target checks below need that)");
    expectEq(hit.in5, [true, true], "the chip is what a finger finds 5 px above and 5 px below it");
    expectEq(hit.in14, [false, false], "the chip is NOT what a finger finds 14 px above and 14 px below it");
    await touchTap(page, cdp, [hit.x, hit.y]);
    const open1 = await dom();
    expectEq(open1.expanded, "true", "the chip after a tap");
    expectEq(open1.cardLines, ["Bond level 3 of 10.", "120 of 700 to level 4.", "Level 5: a bigger burst when petted.", ...HOW], "the card's lines");
    await touchTap(page, cdp, [hit.x, hit.y]);
    const closed = await dom();
    expectEq([closed.expanded, closed.cardLines], ["false", null], "the chip and the card after a second tap");
    // a finger 5 px above the chip opens it too (the target is larger than the chip)
    await touchTap(page, cdp, [hit.x, hit.top - 5]);
    expectEq((await dom()).expanded, "true", "the chip after a tap 5 px above it");
    return `${env.w}x${env.h}@${env.dpr}: the chip (${hit.h.toFixed(0)} px tall) is found 5 px above and below, not 14; a tap opens the card with its five lines and a second closes it`;
  },

  // Kid Mode: no chip, no card, no word Bond anywhere, a hold changes the saved Bond data not at all (the old rule: 2 happiness a pet), and a pet throws no sparkles although the
  // Bond data it carries is level 5 (an Adult profile throws 3 more a pet there).
  "bond-kid": async (open, env) => {
    const SPARKLE = [255, 224, 102]; // #ffe066
    const save = load("kid-home", "kid");
    save.creature.bond = { xp: 3100, chain: 4, at: T };
    const { page, cdp } = await open(save);
    const g = await geometry(env, page);
    const [cx, cy] = screenAtKid(env, g);
    const dom = await page.evaluate(bondDom);
    expectEq([dom.chips, dom.cardLines, dom.bodyHasBond], [0, null, false], "chips, card and the word Bond in Kid Mode");
    const before = await page.evaluate(countColour, SPARKLE);
    await touchHold(page, cdp, [cx, cy], 700); // one pet, at 450 ms; the sparkles of a burst last 1.1 s
    const rise = (await page.evaluate(countColour, SPARKLE)) - before;
    expectEq(rise, 0, "the rise in sparkle pixels after a Kid pet with level 5 Bond data");
    const saved = await savedGame(page);
    expectEq(saved.creature.affection.gained, 2, "the Kid pet's happiness (the old rule)");
    expectEq(saved.creature.bond, { xp: 3100, chain: 4, at: T }, "the Bond data a Kid profile carries, after a pet");
    expectEq(saved.log.filter((e) => /Bond/.test(e.text)).length, 0, "Bond lines in the Kid log");
    const after = await page.evaluate(bondDom);
    expectEq([after.chips, after.bodyHasBond], [0, false], "the chip and the word Bond after the pet");
    return `${env.w}x${env.h}@${env.dpr}: a Kid profile with Bond data shows no chip, card or the word Bond, and a pet leaves the data as it was (3100, chain 4), throws no sparkle pixels and gains 2 happiness`;
  },

  // A tap alone is a poke (nothing), the third quick tap is a tickle (3 XP, the chain alone).
  "bond-poke": async (open, env) => {
    const { page, cdp } = await open(adult(920));
    const g = await geometry(env, page);
    const [cx, cy] = creatureAt(env, g);
    await touchTap(page, cdp, [cx, cy]);
    let saved = await savedGame(page);
    expectEq([saved.creature.bond.xp, saved.creature.affection.gained], [920, 0], "Bond XP and happiness gained after one tap (a poke)");
    await page.clock.runFor(1300); // the 1,200 ms of taps run out
    for (let i = 0; i < 3; i++) {
      await touchTap(page, cdp, [cx, cy]);
      await page.clock.runFor(100);
    }
    saved = await savedGame(page);
    expectEq([saved.creature.bond.xp, saved.creature.bond.chain, saved.creature.affection.gained], [923, 0, 3], "Bond XP, chain and happiness gained after three quick taps (a tickle)");
    expectEq((await page.evaluate(bondDom)).label, "Bond level 3, 123 of 700 to level 4", "the chip after the tickle");
    return `${env.w}x${env.h}@${env.dpr}: one tap earns nothing (920, 0 gained); three quick taps earn 3 (923) and happiness 3, the chain stays 0`;
  },

  // The sparkles: a pet at level 4 throws none (only the heart), a pet at level 5 throws some, and so does the pet that reaches level 2.
  "bond-burst": async (open, env) => {
    const SPARKLE = [255, 224, 102]; // #ffe066
    const run = async (xp, what) => {
      const { page, cdp } = await open(adult(xp));
      const g = await geometry(env, page);
      const [cx, cy] = creatureAt(env, g);
      const before = await page.evaluate(countColour, SPARKLE);
      await touchHold(page, cdp, [cx, cy], 700); // one pet, at 450 ms; the sparkles last 1.1 s
      const after = await page.evaluate(countColour, SPARKLE);
      return { rise: after - before, z: g.z, what };
    };
    const level4 = await run(2900, "level 4, no level-up");
    const level5 = await run(3100, "level 5, no level-up");
    const levelUp = await run(299, "level 1 to 2");
    expectEq(level4.rise, 0, "the rise in sparkle pixels after a pet at level 4");
    const one = 5 * level5.z * level5.z; // one sparkle: a vertical bar of 3 and a horizontal bar of 3 that share a pixel, 5 game pixels, z x z device pixels each
    if (level5.rise < one) throw new Error(`a pet at level 5 raised the sparkle pixels by ${level5.rise}, under one sparkle (${one})`);
    if (levelUp.rise < one) throw new Error(`the pet that reaches level 2 raised the sparkle pixels by ${levelUp.rise}, under one sparkle (${one})`);
    return `${env.w}x${env.h}@${env.dpr}: sparkle pixels rise by 0 (level 4), ${level5.rise} (level 5) and ${levelUp.rise} (the level-up) after one pet; one sparkle is ${one}`;
  },

  // The pop's motion (the stylesheet's rules: the one under "motion preferences" that stops every animation in such a window, and the chip's own ring): in a normal window the chip pops with its animation; in a window that asks for reduced motion it has no animation and
  // shows a 2 px ring instead. Both are read right after the pet that reaches level 2 (one pet, at 450 ms, from 299 XP).
  "bond-motion": async (open, env) => {
    const read = async (extra, what) => {
      const { page, cdp } = await open(adult(299), extra);
      const g = await geometry(env, page);
      const [cx, cy] = creatureAt(env, g);
      const before = await page.evaluate(chipStyle);
      await touchHold(page, cdp, [cx, cy], 700);
      const after = await page.evaluate(chipStyle);
      expectEq([before.pop, after.pop], ["false", "true"], `the chip's pop before and right after the level-up (${what})`);
      return { before, after };
    };
    const normal = await read({}, "a normal window");
    const reduced = await read({ reducedMotion: "reduce" }, "a window that asks for reduced motion");
    expectEq([normal.before.animation, normal.before.ring], ["none", false], "the chip at rest in a normal window: its animation and ring");
    expectEq([normal.after.animation, normal.after.ring], ["bond-pop", false], "the chip popping in a normal window: its animation and ring");
    expectEq([reduced.before.animation, reduced.before.ring], ["none", false], "the chip at rest in a window that asks for reduced motion: its animation and ring");
    expectEq([reduced.after.animation, reduced.after.ring], ["none", true], "the chip popping in a window that asks for reduced motion: its animation and ring");
    return `${env.w}x${env.h}@${env.dpr}: the pop declares the bond-pop animation with no ring in a normal window, and in a window that asks for reduced motion it declares none and shows a 2 px ring`;
  },

  // Fit: the worst bag (99999 coins and 999 of everything) and the longest label; the chip and the card inside the window's width, no sideways scroll, every line inside its box.
  "bond-fit": async (open, env) => {
    const bag = { fiber: 999, herb: 999, wood: 999, fish: 999, stone: 999 };
    const out = [];
    for (const [xp, label, lines] of [
      [2999, "Bond level 4, 1499 of 1500 to level 5", ["Bond level 4 of 10.", "1499 of 1500 to level 5.", "Level 5: a bigger burst when petted.", ...HOW]],
      [15000, "Bond level 10, the top level", ["Bond level 10 of 10.", "The top level.", ...HOW]],
    ]) {
      const { page, cdp } = await open(adult(xp, { coins: 99999, inventory: bag }));
      const dom = () => page.evaluate(bondDom);
      expectEq((await dom()).label, label, `the chip at ${xp} XP`);
      let fit = await page.evaluate(fitProblems, env.w);
      expectEq(fit.problems, [], `what does not fit with the chip at ${xp} XP, card closed`);
      const cost = await page.evaluate(headerCost);
      const hit = await page.evaluate(chipHit);
      await touchTap(page, cdp, [hit.x, hit.y]);
      expectEq((await dom()).cardLines, lines, `the card's lines at ${xp} XP`);
      fit = await page.evaluate(fitProblems, env.w);
      expectEq(fit.problems, [], `what does not fit with the card open at ${xp} XP`);
      if (fit.lines < 4) throw new Error(`only ${fit.lines} text lines were measured at ${xp} XP: the clip check did not look at the card`);
      const open2 = await page.evaluate(headerCost);
      out.push(`${xp} XP: header ${cost.without} px without the chip, ${cost.withIt} with (+${cost.withIt - cost.without}), card open +${open2.withIt - cost.withIt}`);
    }
    return `${env.w}x${env.h}@${env.dpr}: no sideways scroll, no clipped line, chip and card inside the window's width; ${out.join("; ")}`;
  },

  // A new page seeded with the game the first page saved says what was saved (the check does not reload: it reads the saved game out and opens a fresh window on it).
  "bond-reload": async (open, env) => {
    const first = await open(adult(296));
    const g = await geometry(env, first.page);
    const [cx, cy] = creatureAt(env, g);
    await touchHold(first.page, first.cdp, [cx, cy], 700);
    const saved = await savedGame(first.page);
    expectEq(saved.creature.bond.xp, 297, "saved Bond XP before the reload");
    const second = await open(saved); // a fresh page with that saved game: what a reload finds
    expectEq((await second.page.evaluate(bondDom)).label, "Bond level 1, 297 of 300 to level 2", "the chip after the reload");
    return `${env.w}x${env.h}@${env.dpr}: after a pet and a fresh page on the saved game the chip says 297 of 300`;
  },
};

// The Kid Mode creature (Pebblin, 24 pixels) stands at x 360 to 384, y 120 to 144: its middle is (372, 132) with the camera on (372, 96).
function screenAtKid(env, g) {
  return screenOf(g.box, g.vp, g.z, env.dpr, [372, 96], [372, 132]);
}

// ---------- the run ----------

async function runCheck(id, env) {
  const contexts = [];
  const open = (save, extra) => openGame(env, save, contexts, extra);
  try {
    return await withTimeout(CHECKS[id](open, env), CHECK_TIMEOUT_MS);
  } finally {
    for (const c of contexts) await c.close().catch(() => {});
  }
}

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
