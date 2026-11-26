// Browser checks for A3.3 Initiatives (docs/adult-a3-plan.md section 14, edges 1 to 21 as seen through the screen): the first offer comes after the first wait and fades on time, ignoring costs
// nothing, a play pays 2 Bond XP a toss (six at most, three taps pay 6 and not 9), a gift pays once and says so, a craving is answered by feeding and a tap on it does nothing, an open panel or
// another screen stops the offers, Kid Mode gets nothing, a tap on the bubble is tested before the creature (also while the creature hops) and a drag from it answers nothing, a reload pays
// nothing, the canvas says what is offered, everything fits at 320, 360 and 390 wide (and on its side), a creature out of the camera's view makes no offers, and the one-line picture (a field)
// works the same.
// Real touch events (Playwright's touchscreen and CDP Input.dispatchTouchEvent) on a mobile touch window against the built game (dist/).
//
// Run: node init-browser.mjs --base http://127.0.0.1:4173 [--only id1,id2] [--sizes 360x640@2,390x844@3] [--modes kid,adult]
// Exit: 0 when no check failed and at least one ran; 1 when any FAIL; 2 when the script broke (a requested --only id ran zero times, an unknown id, a bad flag, or a crash outside a check).
// A check that throws or times out prints a FAIL line, never a crash.
//
// Time and draws. The fake clock is NOT frozen with setFixedTime: the game counts `Date.now()` between its one-second ticks, so the clock has to move (it moves under `runFor` only, after the
// first `pauseAt`). The game's draws are forced through a queue: an init script installs a `Math.random` that reads `window.__q` and gives 0.99 when the queue is empty; the game keeps that
// function (its `rand` is `Math.random` as it was when the game was built); after the page is up the global is swapped for a constant 0.99 (the Stage's per-frame draws read the global each
// time), so only the game takes from the queue. The first wait is drawn at start from an empty queue: floor(0.99 x 30,001) + 60,000 = 89,700 ms, less the fake time that ran before the pause, so
// the first offer shows between 60 and 91 seconds after the pause (the rule's own range; the exact figure is printed). After that the draws come from the queue in this order: the kind (and a
// craving's food, or a gift's coin or material), then the next wait. Literals (worked out by hand; tests/initiatives.test.ts pins the rules):
//   - Gravelhorn at Bond level 1 weighs play 5, craving 4, gift 4 (total 13): a draw of 0.1 is a play, 0.5385 a craving (the middle of its slice), 0.8462 a gift. Its menu is pellet, meat, carrot,
//     worm: a food draw of 0.375 is meat (index 1). A gift draw under a third (0.1) is 2 coins; otherwise the material by a draw (fiber 0.1, herb 0.3, wood 0.5, fish 0.7, stone 0.9). A next wait
//     draw of 0 is 60,000 ms.
//   - a toss pays 2 Bond XP (six in all, 12), a craving 8, a gift 2 coins or 1 of a material; the saved Bond XP starts at 0 (none in the saved game) and the coins at 0.
//   - an offer fades 30 s after it was made; the next starts 60 s after the start of this one (with a wait draw of 0); the clock is read once a second, so each time here is good to +-1 s.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

const require = createRequire(process.env.PLAYWRIGHT_FROM ?? join(homedir(), "homelab-dashboard", "package.json"));
const { chromium } = require("playwright");

const OUT = process.env.VERIFY_OUT ?? join(tmpdir(), "broodkeep-verify");
const SAVES = join(OUT, "saves");

const T = 1795359600000; // 2026-11-22T15:00:00Z, where the fake clock starts
const CHECK_TIMEOUT_MS = 600_000;

const THREE = [
  [320, 568, 1],
  [360, 640, 2],
  [390, 844, 3],
];
const NINE = [
  [320, 568, 1],
  [320, 568, 2],
  [360, 640, 1],
  [360, 640, 2],
  [390, 844, 1],
  [390, 844, 2],
  [390, 844, 3],
  [740, 360, 2],
  [844, 390, 3],
];
const ONE = [[360, 640, 2]];
const CHECK_MODES = {
  "init-appear": ["adult"],
  "init-ignore": ["adult"],
  "init-play": ["adult"],
  "init-gift": ["adult"],
  "init-craving": ["adult"],
  "init-gate": ["adult"],
  "init-kid": ["kid"],
  "init-hit": ["adult"],
  "init-reload": ["adult"],
  "init-a11y": ["adult"],
  "init-fit": ["adult"],
  "init-view": ["adult"],
  "init-field": ["adult"],
};
const CHECK_SIZES = {
  "init-appear": ONE,
  "init-ignore": ONE,
  "init-play": THREE,
  "init-gift": ONE,
  "init-craving": ONE,
  "init-gate": ONE,
  "init-kid": THREE,
  "init-hit": [
    [320, 568, 1],
    [360, 640, 2],
  ],
  "init-reload": ONE,
  "init-a11y": ONE,
  "init-fit": NINE,
  "init-view": ONE,
  "init-field": ONE,
};
const ALL_IDS = Object.keys(CHECK_MODES);
const ALL_MODES = ["kid", "adult"];
const FLAGS = ["base", "only", "sizes", "modes"];

// The draws (see the header).
const PLAY = 0.1;
const CRAVING = 0.5385;
const GIFT = 0.8462;
const MEAT = 0.375;
const COIN = 0.1;
const NOT_COIN = 0.5;
const FIBER = 0.1;
const HERB = 0.3;
const SOON = 0; // the wait to the next offer: 60,000 ms

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

function expectTrue(value, what) {
  if (value !== true) throw new Error(`${what}: expected true, got ${JSON.stringify(value)}`);
}

const load = (file) => JSON.parse(readFileSync(join(SAVES, file), "utf8"));
// The living adult at home (Gravelhorn) in Adult Mode (or Kid Mode), with no Bond; `change` edits the creature.
function living(mode, change = () => {}) {
  const save = load(`adult-home-${mode}.json`);
  const c = save.creature;
  if (c.bond !== undefined || save.coins !== 0) throw new Error("the saved game already has Bond XP or coins: the literals below assume none");
  change(c, save);
  return save;
}
const adult = (change) => living("adult", change);

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

// Runs in the page: what the canvas says about an offer, and where its bubble is in the window's pixels (the canvas's own box plus `data-bubble`, which is in CSS pixels from the canvas's top left
// corner). The canvas is brought to the middle of the window first (the page scrolls as a whole at the small sizes).
function canvasState() {
  const canvas = document.querySelector("canvas.room");
  canvas.scrollIntoView({ block: "center", behavior: "instant" });
  const rect = canvas.getBoundingClientRect();
  const raw = canvas.getAttribute("data-bubble");
  let bubble = null;
  if (raw !== null) {
    const [x, y, w, h] = raw.split(",").map(Number);
    bubble = { l: rect.left + x, t: rect.top + y, r: rect.left + x + w, b: rect.top + y + h, w, h, x: rect.left + x + w / 2, y: rect.top + y + h / 2, inCanvas: x >= -0.5 && y >= -0.5 && x + w <= rect.width + 0.5 && y + h <= rect.height + 0.5 };
  }
  return {
    kind: canvas.getAttribute("data-initiative"),
    hasKind: canvas.hasAttribute("data-initiative"),
    hasBubble: canvas.hasAttribute("data-bubble"),
    bubble,
    label: canvas.getAttribute("aria-label"),
    canvas: { l: rect.left, t: rect.top, w: rect.width, h: rect.height },
    note: document.querySelector(".reason")?.textContent ?? null,
    find: !!document.querySelector("button.find"),
  };
}

// Runs in the page: the box of the first element that matches, or null (scrolled to the middle of the window first when `scroll`).
function boxOf({ selector, scroll }) {
  const el = document.querySelector(selector);
  if (!el) return null;
  if (scroll) el.scrollIntoView({ block: "center", behavior: "instant" });
  const r = el.getBoundingClientRect();
  return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height, x: (r.left + r.right) / 2, y: (r.top + r.bottom) / 2 };
}

// Runs in the page: what does not fit inside `scope`. The page does not scroll sideways; no element of the scope ends past the window's width (`iw`, the width the run set: in this mobile window a
// page that overflows widens window.innerWidth, so innerWidth can never be the reference); every text line of the scope sits inside its own element's box (a Range, not scrollWidth).
function fitProblems({ iw, scope }) {
  const problems = [];
  const doc = document.documentElement;
  if (doc.scrollWidth > iw) problems.push(`page scrollWidth ${doc.scrollWidth} > the window's width ${iw}`);
  const root = document.querySelector(scope);
  if (!root) return { problems: [`no ${scope} on the screen`], lines: 0, elements: 0 };
  let lines = 0;
  let elements = 0;
  for (const el of [root, ...root.querySelectorAll("*")]) {
    const box = el.getBoundingClientRect();
    if (box.width === 0 && box.height === 0) continue;
    elements += 1;
    const name = `${el.tagName.toLowerCase()}.${el.getAttribute("class") ?? ""}`;
    if (box.right > iw + 0.5 || box.left < -0.5) problems.push(`${name} spans ${Math.round(box.left)} to ${Math.round(box.right)} in a window ${iw} wide`);
    const hasText = [...el.childNodes].some((n) => n.nodeType === Node.TEXT_NODE && n.textContent.trim() !== "");
    if (!hasText) continue;
    const range = document.createRange();
    range.selectNodeContents(el);
    for (const r of range.getClientRects()) {
      if (r.width === 0) continue;
      lines += 1;
      if (r.left < box.left - 0.5 || r.right > box.right + 0.5 || r.right > iw + 0.5 || r.left < -0.5) {
        problems.push(`${name} "${el.textContent.trim().slice(0, 40)}" line ends at ${Math.round(r.right)} in a box ending at ${Math.round(box.right)}`);
      }
    }
  }
  return { problems: problems.slice(0, 5), lines, elements };
}

// ---------- the page, the fingers ----------

// Opens the game with `save`; `queue` is what the game's draws will read (see the header). The clock is paused at T + 60 s and moves only under `runFor`.
async function openGame(env, save, queue, track) {
  const context = await env.browser.newContext({
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
    window.__q = [];
    Math.random = () => (window.__q.length ? window.__q.shift() : 0.99);
  });
  await page.clock.install({ time: T });
  const stub = `${env.base}/seed`;
  await page.route(stub, (route) => route.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html><title>seed</title>" }));
  await page.goto(stub);
  await page.evaluate(seedSave, save);
  await page.goto(`${env.base}/`);
  await page.locator("canvas.room").waitFor({ timeout: 20000 });
  await page.clock.pauseAt(T + 60_000);
  await arm(page, queue);
  await page.clock.runFor(100);
  await page.waitForTimeout(100);
  const cdp = await context.newCDPSession(page);
  return { page, cdp, errors, context };
}

// After a page load: the global `Math.random` is the constant the Stage's frames use, and the game's draws are queued.
const arm = (page, queue) =>
  page.evaluate((q) => {
    Math.random = () => 0.99;
    window.__q.push(...q);
  }, queue);

// Run the fake clock `ms` in frames of `frame` ms (the game's one-second timer and the animation frames both run on it).
async function run(page, ms, frame = 1000) {
  for (let left = ms; left > 0; left -= frame) await page.clock.runFor(Math.min(frame, left));
}
const runSecs = (page, s) => run(page, s * 1000);

// Seconds of the fake clock (one tick at a time) until an offer is on the canvas; throws after `limitS`.
async function untilShown(page, limitS = 130) {
  for (let s = 1; s <= limitS; s++) {
    await run(page, 1000);
    if ((await page.evaluate(canvasState)).hasKind) return s;
  }
  throw new Error(`no offer on the canvas in ${limitS} s of the fake clock`);
}

const state = (page) => page.evaluate(canvasState);

// A real touch tap at a point (CSS pixels of the window); then a hundred milliseconds of the fake clock.
async function tapAt(page, [x, y], after = 100) {
  await page.touchscreen.tap(x, y);
  await sleep(30);
  if (after > 0) await run(page, after, 50);
}

// A tap on the bubble as it is drawn now.
async function tapBubble(page, after = 100) {
  const s = await state(page);
  if (!s.bubble) throw new Error("no bubble to tap");
  await tapAt(page, [s.bubble.x, s.bubble.y], after);
  return s;
}

// A finger that goes down at `from`, moves in `steps` small moves to `to` and lifts (real touch events; a short real pause between the moves so the browser sees a drag).
async function drag(cdp, from, to, steps = 12) {
  const send = (type, points) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: points });
  await send("touchStart", [{ x: from[0], y: from[1] }]);
  for (let i = 1; i <= steps; i++) {
    await send("touchMove", [{ x: from[0] + ((to[0] - from[0]) * i) / steps, y: from[1] + ((to[1] - from[1]) * i) / steps }]);
    await sleep(12);
  }
  await send("touchEnd", []);
  await sleep(80);
}

// Runs in the page: the colour of one device pixel of the canvas at a point given in CSS pixels from the canvas's top left corner.
function pixelAt({ x, y }) {
  const canvas = document.querySelector("canvas.room");
  const k = canvas.width / canvas.getBoundingClientRect().width;
  const d = canvas.getContext("2d").getImageData(Math.round(x * k), Math.round(y * k), 1, 1).data;
  return [d[0], d[1], d[2]];
}

// The saved game, once the game has written it (it waits 600 ms after a change). Reading it runs the clock 800 ms.
async function savedGame(page) {
  await page.clock.runFor(800);
  let last = JSON.stringify(await page.evaluate(readSave));
  for (let i = 0; i < 40; i++) {
    await page.waitForTimeout(50);
    const now = JSON.stringify(await page.evaluate(readSave));
    if (now === last) return JSON.parse(now);
    last = now;
  }
  throw new Error("the saved game kept changing for 2 seconds");
}

const xpOf = (save) => save.creature.bond?.xp ?? 0;

// A tap on a button of the dock by its accessible name (scrolled into view first: the page scrolls as a whole).
async function tapButton(page, label) {
  const box = await page.evaluate(boxOf, { selector: `button[aria-label="${label}"]`, scroll: true });
  if (!box) throw new Error(`no button "${label}" on the screen`);
  await tapAt(page, [box.x, box.y], 100);
}

// ---------- the checks ----------

const CHECKS = {
  // The first offer comes in the rule's range (60 to 90 s, plus the second the clock reads in), is a play with a ball bubble, says so for a screen reader, fades 30 s after it was made, and the
  // next one starts 60 s after the first (a wait draw of 0): never two at once.
  "init-appear": async (open) => {
    const { page, errors } = await open(adult(), [PLAY, SOON]);
    const before = await state(page);
    expectEq([before.hasKind, before.hasBubble], [false, false], "the attributes before any offer");
    const first = await untilShown(page);
    if (first < 60 || first > 91) throw new Error(`the first offer came at ${first} s: the rule says 60 to 90 s (plus the clock's own second)`);
    const s = await state(page);
    expectEq(s.kind, "play", "the kind of the offer drawn at 0.1");
    if (!s.bubble || !s.bubble.inCanvas || !(s.bubble.w > 0) || !(s.bubble.h > s.bubble.w)) throw new Error(`the bubble box is odd: ${JSON.stringify(s.bubble)}`);
    expectTrue(s.label.includes("Gravelhorn is holding out a ball. Tap it to play."), `the accessible name: ${s.label}`);
    // the bubble is really drawn where the canvas says: the white of its corner (a game pixel in from the box's top left, clear of the icon) is pure white; the floor and wall are not
    const f = s.bubble.w / 12;
    const white = await page.evaluate(pixelAt, { x: s.bubble.l - s.canvas.l + 1.5 * f, y: s.bubble.t - s.canvas.t + 1.5 * f });
    expectEq(white, [255, 255, 255], "the pixel in the bubble's corner (the bubble is not drawn where the canvas says it is)");
    await runSecs(page, 28);
    expectEq((await state(page)).kind, "play", "28 s after it showed (it fades 30 s after it was made)");
    await runSecs(page, 3);
    const gone = await state(page);
    expectEq([gone.hasKind, gone.hasBubble], [false, false], "the attributes 31 s after it showed: removed, not empty");
    expectTrue(!gone.label.includes("ball"), `the accessible name after the fade: ${gone.label}`);
    await runSecs(page, 27);
    expectEq((await state(page)).hasKind, false, "58 s after the first showed (the next starts 60 s after the first)");
    await runSecs(page, 3);
    expectEq((await state(page)).hasKind, true, "61 s after the first showed");
    expectEq(errors, [], "page errors");
    return `the first offer showed at ${first} s of the fake clock, faded in 30 s, the next one came 60 s after it`;
  },

  // Ignoring everything costs nothing: 280 s with no touch, three offers come and go (none lasts past 31 s, none overlaps), and the saved game has no coins, no Bond XP and none of the lines an
  // answer writes.
  "init-ignore": async (open) => {
    const { page, errors } = await open(adult(), []);
    let starts = 0;
    let showing = false;
    let shownFor = 0;
    let longest = 0;
    for (let s = 1; s <= 280; s++) {
      await run(page, 1000);
      const now = (await state(page)).hasKind;
      if (now && !showing) starts++;
      shownFor = now ? shownFor + 1 : 0;
      longest = Math.max(longest, shownFor);
      showing = now;
    }
    if (starts < 3 || starts > 4) throw new Error(`${starts} offers in 280 s: the rule gives 3 or 4`);
    if (longest > 31) throw new Error(`an offer was on the canvas for ${longest} s: it fades after 30`);
    const save = await savedGame(page);
    expectEq([save.coins, xpOf(save)], [0, 0], "the coins and the Bond XP after ignoring everything");
    const lines = save.log.map((l) => l.text).filter((t) => /^Found |^Bond level/.test(t));
    expectEq(lines, [], "the log lines an answer would have written");
    expectEq(errors, [], "page errors");
    return `${starts} offers in 280 s, the longest on show ${longest} s, nothing paid or logged`;
  },

  // A play: each tap on the ball pays 2 Bond XP (three taps 6, not 9: no poke, no tickle), six tosses at most (12), the sixth ends it, and a seventh tap pays nothing.
  "init-play": async (open, env) => {
    const { page, errors } = await open(adult(), [PLAY, SOON]);
    await untilShown(page);
    await tapBubble(page);
    expectEq((await state(page)).kind, "play", "the play after the first toss");
    await tapBubble(page);
    await tapBubble(page);
    expectEq(xpOf(await savedGame(page)), 6, "the Bond XP after three taps on the ball (a tickle would have made it 9)");
    for (let toss = 4; toss <= 6; toss++) await tapBubble(page);
    const done = await state(page);
    expectEq([done.hasKind, done.hasBubble], [false, false], "the play after the sixth toss");
    expectEq(xpOf(await savedGame(page)), 12, "the Bond XP after six tosses");
    expectEq(errors, [], "page errors");
    return `${env.w}x${env.h}@${env.dpr}: six taps paid 12 Bond XP (6 after three), the sixth ended the play`;
  },

  // A gift: one tap pays it once (2 coins, or 1 herb), the note says what it was, the saved game has it, and a second tap on the same place adds nothing.
  "init-gift": async (open) => {
    const coin = await open(adult(), [GIFT, COIN, SOON]);
    await untilShown(coin.page);
    const s = await state(coin.page);
    expectEq(s.kind, "gift", "the kind of the offer drawn at 0.8462");
    expectTrue(s.label.includes("Gravelhorn found something. Tap it to take it."), `the accessible name: ${s.label}`);
    await tapBubble(coin.page);
    const after = await state(coin.page);
    expectEq([after.hasKind, after.note], [false, "Found 2 coins."], "the offer and the note after the tap");
    expectEq((await savedGame(coin.page)).coins, 2, "the coins after the gift");
    const bubbleAt = s.bubble;
    await tapAt(coin.page, [bubbleAt.x, bubbleAt.y]);
    expectEq((await savedGame(coin.page)).coins, 2, "the coins after a second tap on the same place");
    expectEq(coin.errors, [], "page errors");

    const herb = await open(adult(), [GIFT, NOT_COIN, HERB, SOON]);
    await untilShown(herb.page);
    await tapBubble(herb.page);
    expectEq((await state(herb.page)).note, "Found some herbs.", "the note of a herb gift");
    const save = await savedGame(herb.page);
    expectEq([save.coins, save.inventory.herb], [0, 1], "the coins and herbs after a herb gift");
    expectEq(herb.errors, [], "page errors");
    return "a coin gift paid 2 coins once with its note, a herb gift paid 1 herb";
  },

  // A craving: the bubble shows the food (a screen reader hears it), a tap and a held finger on it do nothing (the creature under its lower edge is not petted), a meal of another food pays
  // nothing, and a meal of the food asked for pays 8 Bond XP and ends it.
  "init-craving": async (open) => {
    const { page, cdp, errors } = await open(adult(), [CRAVING, MEAT, SOON]);
    await untilShown(page);
    const s = await state(page);
    expectEq(s.kind, "craving", "the kind of the offer drawn at 0.5385");
    expectTrue(s.label.includes("Gravelhorn wants meat."), `the accessible name: ${s.label}`);
    await tapBubble(page);
    expectEq(xpOf(await savedGame(page)), 0, "the Bond XP after a tap on the craving's bubble");
    // a finger held on the bubble's lower edge, where the creature's own hit zone reaches (a pet starts after 450 ms)
    const b = (await state(page)).bubble;
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: b.x, y: b.b - 2 }] });
    await run(page, 700, 50);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await run(page, 100, 50);
    const held = await state(page);
    expectEq(held.kind, "craving", "the craving after a finger held on its bubble");
    expectEq(xpOf(await savedGame(page)), 0, "the Bond XP after a finger held on the craving's bubble (a pet would pay)");
    await tapButton(page, "Feed");
    await run(page, 1500); // the tray stays open for a moment, as it does while a player picks: it must not stop the craving
    expectEq((await state(page)).kind, "craving", "the craving after the feed tray was open for 1.5 s");
    await tapButton(page, "Meat");
    const fed = await state(page);
    expectEq([fed.hasKind, fed.hasBubble], [false, false], "the craving after a meal of the food it asked for");
    expectEq(xpOf(await savedGame(page)), 8, "the Bond XP after the meal it asked for");
    expectEq(errors, [], "page errors");

    // another food: nothing is paid (the meal on the floor then stops the offers, so the craving goes with the next tick)
    const other = await open(adult(), [CRAVING, MEAT, SOON]);
    await untilShown(other.page);
    await tapButton(other.page, "Feed");
    await tapButton(other.page, "Carrot");
    await run(other.page, 2000);
    expectEq(xpOf(await savedGame(other.page)), 0, "the Bond XP after a meal of another food");
    expectEq(other.errors, [], "page errors");
    return "a tap and a hold on the craving paid nothing, another food paid nothing, the food asked for paid 8 and ended it";
  },

  // The gate: an open panel stops the offers at once and for as long as it stays (the countdown holds and goes on after it closes), and another screen drops one and makes none.
  "init-gate": async (open) => {
    const { page, errors } = await open(adult(), [PLAY, SOON]);
    await untilShown(page);
    await tapButton(page, "Settings");
    await run(page, 2000);
    expectEq((await state(page)).hasKind, false, "the offer 2 s after Settings opened");
    await runSecs(page, 130);
    expectEq((await state(page)).hasKind, false, "an offer after 130 s with Settings open");
    const close = await page.evaluate(() => {
      const b = [...document.querySelectorAll("section.panel button")].find((el) => el.textContent.trim() === "Close");
      if (!b) return null;
      const r = b.getBoundingClientRect();
      return { x: (r.left + r.right) / 2, y: (r.top + r.bottom) / 2 };
    });
    if (!close) throw new Error("no Close button on the Settings panel");
    await tapAt(page, [close.x, close.y]);
    await runSecs(page, 20);
    expectEq((await state(page)).hasKind, false, "an offer 20 s after Settings closed (the countdown was held: about 57 s were left)");
    await runSecs(page, 42);
    expectEq((await state(page)).hasKind, true, "an offer 62 s after Settings closed");
    await tapButton(page, "Habitat");
    await run(page, 200);
    expectEq((await state(page)).hasKind, false, "the offer after a tap on Habitat");
    await runSecs(page, 70);
    expectEq((await state(page)).hasKind, false, "an offer after 70 s on the Habitat screen");
    expectEq(errors, [], "page errors");
    return "an open panel and the habitat screen stopped the offers; the countdown went on after the panel closed";
  },

  // Kid Mode gets nothing: 130 s, no attribute, no offer in the accessible name; feeding works as it did.
  "init-kid": async (open, env) => {
    const { page, errors } = await open(living("kid"), [PLAY, SOON]);
    for (let s = 1; s <= 130; s += 5) {
      await run(page, 5000);
      const st = await state(page);
      expectEq([st.hasKind, st.hasBubble], [false, false], `the attributes at ${s + 4} s`);
      expectTrue(!/ball|found something|wants/.test(st.label), `the accessible name at ${s + 4} s: ${st.label}`);
    }
    await tapButton(page, "Feed");
    await tapButton(page, "Pellets");
    const save = await savedGame(page);
    expectTrue(save.creature.stats.hunger > 70, `the hunger after a meal in Kid Mode: ${save.creature.stats.hunger}`);
    expectEq(save.creature.bond, undefined, "the saved Bond in Kid Mode");
    expectEq(errors, [], "page errors");
    return `${env.w}x${env.h}@${env.dpr}: nothing offered in 130 s, no attribute, no Bond, a meal still feeds`;
  },

  // The bubble is tested before the creature: a touch on the creature beside it pays nothing, a touch on the bubble while the creature is startled (it moves up) pays, a drag that begins on the
  // ball pays nothing, a plain tap on the ball pays.
  "init-hit": async (open, env) => {
    const { page, cdp, errors } = await open(adult(), [PLAY, SOON]);
    await untilShown(page);
    const first = (await state(page)).bubble;
    const f = first.w / 12; // CSS pixels in a game pixel
    // the creature's body: left of the bubble's left edge and under its bottom edge, beyond the bubble's slack (14 CSS pixels past its box)
    await tapAt(page, [first.l - 4 * f, first.b + 16], 100);
    expectEq((await state(page)).kind, "play", "the play after a tap on the creature");
    // the poke started the creature's startle: the bubble is higher now (proof the pose is on); a tap on it where it is now pays
    const moved = (await state(page)).bubble;
    if (!(moved.t <= first.t - 2)) throw new Error(`the bubble did not move up with the startle: it was at ${first.t.toFixed(1)}, it is at ${moved.t.toFixed(1)}`);
    await tapAt(page, [moved.x, moved.y]);
    expectEq(xpOf(await savedGame(page)), 2, "the Bond XP after a tap on the creature and a tap on the bubble while it moved (4 would mean the creature's tap answered the ball)");
    // a drag that begins on the ball
    await run(page, 400, 50);
    const there = (await state(page)).bubble;
    await drag(cdp, [there.x, there.y], [there.x - 40, there.y + 50]);
    await run(page, 100, 50);
    expectEq(xpOf(await savedGame(page)), 2, "the Bond XP after a drag that began on the ball");
    expectEq((await state(page)).kind, "play", "the play after the drag");
    // a plain tap, from wherever the ball is now (the drag moved the camera)
    await tapBubble(page);
    expectEq(xpOf(await savedGame(page)), 4, "the Bond XP after a plain tap");
    expectEq(errors, [], "page errors");
    return `${env.w}x${env.h}@${env.dpr}: the creature's tap paid 0, the ball paid while it moved, the drag paid 0, the tap paid`;
  },

  // A reload with an offer showing leaves none and has paid nothing.
  "init-reload": async (open) => {
    const { page, errors } = await open(adult(), [PLAY, SOON]);
    await untilShown(page);
    await tapBubble(page);
    expectEq(xpOf(await savedGame(page)), 2, "the Bond XP after one toss");
    await page.reload();
    await page.locator("canvas.room").waitFor({ timeout: 20000 });
    await arm(page, []);
    await run(page, 500);
    const s = await state(page);
    expectEq([s.hasKind, s.hasBubble], [false, false], "the attributes after the reload");
    const save = await savedGame(page);
    expectEq([xpOf(save), save.coins], [2, 0], "the Bond XP and the coins after the reload");
    expectEq(errors, [], "page errors");
    return "a reload left no offer and paid nothing";
  },

  // The canvas says what is offered: a ball for a play, something found for a gift, the food for a craving; and says none of it with no offer.
  "init-a11y": async (open) => {
    const wants = [
      ["play", [PLAY, SOON], "Gravelhorn is holding out a ball. Tap it to play."],
      ["gift", [GIFT, COIN, SOON], "Gravelhorn found something. Tap it to take it."],
      ["craving", [CRAVING, MEAT, SOON], "Gravelhorn wants meat."],
    ];
    for (const [kind, queue, words] of wants) {
      const { page, errors } = await open(adult(), queue);
      const quiet = await state(page);
      expectEq(quiet.label, "Gravelhorn is doing fine. In the living room.", "the accessible name with no offer");
      await untilShown(page);
      const s = await state(page);
      expectEq([s.kind, s.label], [kind, `Gravelhorn is doing fine. ${words} In the living room.`], `the accessible name of a ${kind}`);
      expectEq(errors, [], "page errors");
    }
    return "the accessible name says the ball, the find and the food, and nothing with no offer";
  },

  // The note of a gift and the Bond card with its new line fit, and the bubble is inside the picture.
  "init-fit": async (open, env) => {
    const { page, errors } = await open(adult(), [GIFT, NOT_COIN, FIBER, SOON]);
    await untilShown(page);
    const s = await state(page);
    expectTrue(s.bubble.inCanvas, `the bubble is inside the picture: ${JSON.stringify(s.bubble)}`);
    await tapBubble(page, 50);
    const note = await page.evaluate(canvasState);
    expectEq(note.note, "Found some fiber.", "the longest note");
    const noteFit = await page.evaluate(fitProblems, { iw: env.w, scope: ".reason-box" });
    expectEq(noteFit.problems, [], "the note's fit");
    if (noteFit.lines < 1) throw new Error("the note fit check measured no text line");
    const chip = await page.evaluate(boxOf, { selector: "button.bond-chip", scroll: true });
    if (!chip) throw new Error("no Bond chip in the header");
    await tapAt(page, [chip.x, chip.y], 100);
    const card = await page.evaluate(fitProblems, { iw: env.w, scope: ".bond-card" });
    expectEq(card.problems, [], "the Bond card's fit");
    if (card.lines < 5) throw new Error(`the Bond card fit check measured ${card.lines} text lines, fewer than its five`);
    const text = await page.evaluate(() => document.querySelector(".bond-card").textContent);
    expectTrue(text.includes("Prefers: play, cravings."), `the Bond card says what it prefers: ${text}`);
    expectEq(errors, [], "page errors");
    return `${env.w}x${env.h}@${env.dpr}: the note (${noteFit.lines} lines) and the Bond card (${card.lines} lines, ${card.elements} elements) fit, the bubble is inside the picture`;
  },

  // A creature out of the camera's view makes no offer for as long as it stays out (the Find button is the proof it is out), and one comes within 91 s of its return.
  "init-view": async (open) => {
    const { page, cdp, errors } = await open(adult(), [PLAY, SOON]);
    const box = await page.evaluate(boxOf, { selector: "canvas.room", scroll: true });
    let out = false;
    for (let i = 0; i < 6 && !out; i++) {
      const dx = i % 2 === 0 ? 0.3 : -0.3; // alternate sides: whichever way the home has room to move the camera, one of them takes the creature out of view
      await drag(cdp, [box.x - dx * box.w, box.y], [box.x + dx * box.w, box.y]);
      await run(page, 200, 50);
      out = (await state(page)).find;
    }
    expectTrue(out, "the Find button shows after the camera was dragged away");
    await runSecs(page, 200);
    const away = await state(page);
    expectEq([away.hasKind, away.find], [false, true], "an offer after 200 s with the creature out of view");
    const find = await page.evaluate(boxOf, { selector: "button.find", scroll: false });
    await tapAt(page, [find.x, find.y], 600);
    expectEq((await state(page)).find, false, "the Find button after a tap on it");
    const back = await untilShown(page, 91);
    expectEq(errors, [], "page errors");
    return `no offer in 200 s out of view; one came ${back} s after the creature was back`;
  },

  // The one-line picture (the room while the creature is out in a field): an offer shows there, a tap on its ball pays, and a finger that leaves the ball and lifts elsewhere does not.
  "init-field": async (open) => {
    const { page, cdp, errors } = await open(adult((c) => (c.place = "land")), [PLAY, SOON]);
    await untilShown(page);
    const s = await state(page);
    expectEq(s.kind, "play", "the kind of the offer in a field");
    expectTrue(s.bubble.inCanvas, `the bubble is inside the picture: ${JSON.stringify(s.bubble)}`);
    await drag(cdp, [s.bubble.x, s.bubble.y], [s.bubble.x - 60, s.bubble.y + 60]);
    await run(page, 100, 50);
    expectEq(xpOf(await savedGame(page)), 0, "the Bond XP after a finger left the ball and lifted elsewhere");
    expectEq((await state(page)).kind, "play", "the play after that");
    await tapBubble(page);
    expectEq(xpOf(await savedGame(page)), 2, "the Bond XP after a tap on the ball");
    expectEq(errors, [], "page errors");
    return "an offer shows in a field, a tap pays 2, a finger that left the ball pays 0";
  },
};

// ---------- the run ----------

async function runCheck(id, env) {
  const contexts = [];
  const open = (save, queue = []) => openGame(env, save, queue, contexts);
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
