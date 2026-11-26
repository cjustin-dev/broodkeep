// Browser checks for A3.2 Bug Catch (docs/adult-a3-plan.md section 10, edges 1, 14, 18, 20, 21 and 23, and the pay of edges 3 and 7 seen through the screen):
// Kid Mode has no Train button, the session's clock moves only under the fake clock, Pause and a hidden page stop it, a real touch catches a bug and a tap on the empty field is a miss,
// the page behind does not move under a finger, a whole run played by touch pays what the rules say into the saved game, a reload in the middle pays nothing, Enter on a focused bug
// catches it, and everything fits at 320, 360 and 390 wide (pixel ratios 1 and 2, and 3 at 390) and on its side (740 x 360 and 844 x 390).
// Real touch events (Playwright's touchscreen and CDP Input.dispatchTouchEvent) on a mobile touch window against the built game (dist/).
//
// Run: node train-browser.mjs --base http://127.0.0.1:4173 [--only id1,id2] [--sizes 360x640@2,390x844@3] [--modes kid,adult]
// Exit: 0 when no check failed and at least one ran; 1 when any FAIL; 2 when the script broke (a requested --only id ran zero times, an unknown id, a bad flag, or a crash outside a
// check). A check that throws or times out prints a FAIL line, never a crash.
//
// The saves come from gen-saves (saves/adult-home-<mode>.json) with changes put on the creature here. Expected values are literals worked out by hand from data/training.ts and the plan:
//   - the clock is frozen at T = 2026-11-22T15:00:00Z, so the local day (the window's zone is UTC) is 20779 (1,795,359,600,000 ms / 86,400,000 = 20,779.6);
//   - a bug scores 10 and a golden bug 30, doubled from the 5th catch of a streak; a miss costs the streak only; the field's three numbers are Time (whole seconds left, 75 at the start),
//     Score and Streak;
//   - a first session of the day is a full reward: Bronze and Silver +1 Speed, Gold +2; Bond XP 10, 20, 30; discipline +1, +1, +2; the day is stored as { day: 20779, sessions: { spd: 1 } };
//   - the engine counts the time the page gives it a frame at a time (the first frame counts 0), so 10,000 ms of the fake clock leaves 65 or 66 seconds of 75, not exactly 65.
// The run is the same every time: Math.random is 0.99 for the whole page, so the seed is floor(0.99 x 2^32) and the creature stands still.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

const require = createRequire(process.env.PLAYWRIGHT_FROM ?? join(homedir(), "homelab-dashboard", "package.json"));
const { chromium } = require("playwright");

const OUT = process.env.VERIFY_OUT ?? join(tmpdir(), "broodkeep-verify");
const SAVES = join(OUT, "saves");

const T = 1795359600000; // 2026-11-22T15:00:00Z, frozen
const TODAY = 20779;
const CHECK_TIMEOUT_MS = 420_000;

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
const CHECK_MODES = {
  "train-kid": ["kid"],
  "train-clock": ["adult"],
  "train-hidden": ["adult"],
  "train-touch": ["adult"],
  "train-run": ["adult"],
  "train-reload": ["adult"],
  "train-still": ["adult"],
  "train-a11y": ["adult"],
  "train-fit": ["adult"],
};
const CHECK_SIZES = {
  "train-kid": THREE,
  "train-clock": [[360, 640, 2]],
  "train-hidden": [[360, 640, 2]],
  "train-touch": [
    [320, 568, 1],
    [360, 640, 2],
  ],
  "train-run": [...THREE, [740, 360, 2], [844, 390, 3]],
  "train-reload": [[360, 640, 2]],
  "train-still": [[360, 640, 2]],
  "train-a11y": [[360, 640, 2]],
  "train-fit": NINE,
};
const ALL_IDS = Object.keys(CHECK_MODES);
const ALL_MODES = ["kid", "adult"];
const FLAGS = ["base", "only", "sizes", "modes"];

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
// The living adult at home (Gravelhorn) in Adult Mode, with no training done; `change` edits the creature.
function adult(change = () => {}) {
  const save = load("adult-home-adult.json");
  const c = save.creature;
  if ((c.trained?.spd ?? 0) !== 0 || c.training !== undefined) throw new Error("the saved adult already has Speed training or a day count: the literals below assume none");
  change(c, save);
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

// Runs in the page: what the session shows. `phase` is the card on screen; `stats` is Time, Score and Streak as text; the field's box and every bug (the middle of its button, its box,
// its kind and its accessible name) are in CSS pixels of the window.
function snap() {
  const q = (s) => document.querySelector(s);
  const box = (el) => {
    const r = el.getBoundingClientRect();
    return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height };
  };
  const field = q(".train-field");
  const phase = q(".train-lines") ? "done" : field ? "playing" : q(".train-reward") ? "ready" : q("section.panel") ? "other" : "closed";
  return {
    phase,
    stats: [...document.querySelectorAll(".train-stats b")].map((b) => b.textContent),
    field: field ? box(field) : null,
    bugs: [...document.querySelectorAll(".bug")].map((el) => {
      const b = box(el);
      return { ...b, x: (b.l + b.r) / 2, y: (b.t + b.b) / 2, kind: el.getAttribute("data-kind"), name: el.getAttribute("aria-label") };
    }),
    paused: !!q(".train-paused"),
    pausedBox: q(".train-paused") ? box(q(".train-paused")) : null,
    lines: [...document.querySelectorAll(".train-lines li")].map((li) => li.textContent),
    reward: q(".train-reward") ? q(".train-reward").textContent : null,
    focus: document.activeElement ? (document.activeElement.textContent ?? "").trim() : null,
    scrollY: window.scrollY,
  };
}

// Runs in the page: the box of the first element that matches, or null. `scroll` brings it to the middle of the window first: only for the Arena screen's buttons (the page scrolls as a
// whole); the overlay is never scrolled by the measuring.
function boxOf({ selector, scroll }) {
  const el = document.querySelector(selector);
  if (!el) return null;
  if (scroll) el.scrollIntoView({ block: "center", behavior: "instant" });
  const r = el.getBoundingClientRect();
  return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height, x: (r.left + r.right) / 2, y: (r.top + r.bottom) / 2 };
}

// Runs in the page: what does not fit inside `scope`. The page does not scroll sideways; no element of the scope ends past the window's width (`iw`, the width the run set: in this mobile
// window a page that overflows widens window.innerWidth, so innerWidth can never be the reference); every text line of the scope sits inside its own element's box (a Range, not scrollWidth).
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
    Math.random = () => 0.99; // the seed of every run, and the creature stands still
  });
  await page.clock.install({ time: T });
  await page.clock.setFixedTime(T);
  const stub = `${env.base}/seed`;
  await page.route(stub, (route) => route.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html><title>seed</title>" }));
  await page.goto(stub);
  await page.evaluate(seedSave, save);
  await page.goto(`${env.base}/`);
  await page.locator("canvas.room").waitFor({ timeout: 20000 });
  await freeze(page);
  await page.clock.runFor(100);
  await page.waitForTimeout(100);
  const cdp = await context.newCDPSession(page);
  return { page, cdp, errors, context };
}

// After `install` the fake clock still runs in real time; `pauseAt` holds it, so from here it moves only under `runFor` (train-clock proves it with a real-time wait). Date.now stays at T
// (setFixedTime). A reload keeps the paused clock (a second pauseAt after it throws "Cannot fast-forward to the past"), so nothing is frozen again after one.
const freeze = (page) => page.clock.pauseAt(T + 60_000);

// Run the fake clock `ms` in frames of `frame` ms (the game's timers and the overlay's animation frames both run on it).
async function run(page, ms, frame = 100) {
  for (let left = ms; left > 0; left -= frame) await page.clock.runFor(Math.min(frame, left));
}

// A real touch tap at a point (CSS pixels of the window); the clock does not move.
async function tapAt(page, [x, y]) {
  await page.touchscreen.tap(x, y);
  await sleep(30);
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

const read = (page) => page.evaluate(snap);

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

// To the Arena screen, then a real tap on Train (scrolled into view first: the Arena row is below the nav and the page scrolls).
async function openStartCard(page) {
  await page.locator('button[aria-label="Arena"]').scrollIntoViewIfNeeded();
  await tapAt(page, boxCenter(await page.evaluate(boxOf, { selector: 'button[aria-label="Arena"]', scroll: true })));
  await run(page, 200);
  const train = await page.evaluate(boxOf, { selector: 'button[aria-label^="Train"]', scroll: true });
  if (!train) throw new Error("no Train button on the Arena screen");
  await tapAt(page, boxCenter(train));
  await run(page, 100);
  expectEq((await read(page)).phase, "ready", "the card after a tap on Train");
}

const boxCenter = (b) => [b.x, b.y];

async function pressGo(page) {
  const go = await page.evaluate(boxOf, { selector: "section.panel .btn.wide", scroll: false });
  if (!go) throw new Error("no Go button on the start card");
  await tapAt(page, boxCenter(go));
  await run(page, 20, 20);
  expectEq((await read(page)).phase, "playing", "the card after a tap on Go");
}

// Run the clock in steps of 50 ms until a bug is on the field (the first spawn is at 400 ms), or `matching(bug)` holds for one of them.
async function waitForBug(page, matching = () => true, limitMs = 60_000) {
  for (let t = 0; t <= limitMs; t += 50) {
    const s = await read(page);
    const found = s.bugs.find(matching);
    if (found) return s;
    await page.clock.runFor(50);
  }
  throw new Error(`no matching bug on the field in ${limitMs / 1000} s of the fake clock`);
}

// ---------- the checks ----------

const CHECKS = {
  // Kid Mode's Arena screen: the one Fight button as before, no Train button, no Train word, no overlay.
  "train-kid": async (open, env) => {
    const { page, errors } = await open(load("adult-home-kid.json"));
    await page.locator('button[aria-label="Arena"]').click();
    await run(page, 200);
    const dom = await page.evaluate(() => ({
      train: document.querySelectorAll('button[aria-label^="Train"]').length,
      row: document.querySelectorAll(".trainbtns").length,
      fight: document.querySelectorAll('button[aria-label="Fight a wild creature"]').length,
      wideFight: document.querySelectorAll("button.btn.wide.fight").length,
      words: /\b(Train|Bug Catch)\b/.test(document.body.innerText),
      overlay: document.querySelectorAll("section.panel").length,
    }));
    expectEq(dom, { train: 0, row: 0, fight: 1, wideFight: 1, words: false, overlay: 0 }, "Kid Mode's Arena screen (Train buttons, button rows, Fight buttons, the one wide Fight button, the words, panels)");
    expectEq(errors, [], "page errors");
    return `${env.w}x${env.h}@${env.dpr}: Kid Mode's Arena has the one wide Fight button, no Train button, no Train word and no overlay`;
  },

  // The probe the plan asks for: the session's clock moves under the fake clock and not otherwise; Pause stops it; a tap on the Paused card is neither a catch nor a miss and goes on.
  "train-clock": async (open, env) => {
    const { page, errors } = await open(adult());
    await openStartCard(page);
    await pressGo(page);
    expectEq((await read(page)).stats, ["75", "0", "0"], "Time, Score and Streak at the start");
    // 2.3 s in, between the spawns at 1.8 s and 2.5 s (the adult row's gap is 0.7 s): nothing has redrawn the component since 1.8 s, so a Time that is only written when the list of bugs changes would still read 74
    await run(page, 2300);
    expectEq(Number((await read(page)).stats[0]), 73, "Time 2.3 s after Go, between two spawns (75 - 2.3 = 72.7 rounds up to 73; a number left over from the spawn at 1.8 s would read 74)");
    await run(page, 7700);
    const left = Number((await read(page)).stats[0]);
    if (left !== 65 && left !== 66) throw new Error(`Time after 10 s of the fake clock: expected 65 or 66, got ${left}`);
    await page.waitForTimeout(600); // real time, no fake clock: nothing may move
    expectEq(Number((await read(page)).stats[0]), left, "Time after 600 ms of real time with the fake clock still");
    await tapAt(page, boxCenter(await page.evaluate(boxOf, { selector: ".train-buttons .btn", scroll: false })));
    await run(page, 100);
    const paused = await read(page);
    expectEq(paused.paused, true, "the Paused card after the Pause button");
    const during = paused.stats;
    await run(page, 5000);
    expectEq((await read(page)).stats, during, "Time, Score and Streak after 5 s of the fake clock while paused");
    // a tap on the Paused card: neither a catch nor a miss (the streak is 0 and the score 0 either way, so make a catch first would change the card: not possible while paused), and it goes on
    const card = (await read(page)).pausedBox;
    await tapAt(page, [(card.l + card.r) / 2, (card.t + card.b) / 2]);
    await run(page, 100);
    const resumed = await read(page);
    expectEq(resumed.paused, false, "the Paused card after a tap on it");
    expectEq(resumed.stats.slice(1), during.slice(1), "Score and Streak after the tap on the Paused card");
    await run(page, 3000);
    const later = Number((await read(page)).stats[0]);
    if (later < left - 5 || later > left - 2) throw new Error(`Time 3 s after the resume: expected ${left - 4} to ${left - 3}, got ${later}`);
    expectEq(errors, [], "page errors");
    return `${env.w}x${env.h}@${env.dpr}: Time 75 -> ${left} after 10 s of fake clock, still ${left} after 600 ms of real time and after 5 s paused, goes on after a tap on the card (now ${later})`;
  },

  // A page that becomes hidden stops the run, and becoming visible again does not start it (the card waits for a tap). The first try is a real second page brought to the front; a headless
  // browser may keep the first page "visible", and then the same event is made by hand (and the detail says so).
  "train-hidden": async (open, env) => {
    const { page, context, errors } = await open(adult());
    await openStartCard(page);
    await pressGo(page);
    await run(page, 2000);
    const before = (await read(page)).stats;
    const second = await context.newPage();
    await second.bringToFront();
    await sleep(200);
    const real = (await page.evaluate(() => document.visibilityState)) === "hidden";
    if (!real) {
      await page.evaluate(() => {
        Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
        document.dispatchEvent(new Event("visibilitychange"));
      });
    }
    await sleep(100);
    expectEq((await read(page)).paused, true, "the Paused card once the page is hidden");
    const frozen = (await read(page)).stats;
    expectEq(frozen, before, "Time, Score and Streak when the page was hidden (no fake time passed since the look before)");
    await run(page, 3000);
    expectEq((await read(page)).stats, frozen, "Time, Score and Streak after 3 more seconds while hidden");
    if (real) await page.bringToFront();
    else await page.evaluate(() => {
      delete document.visibilityState;
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await sleep(100);
    expectEq((await read(page)).paused, true, "the Paused card once the page is visible again (it waits for a tap)");
    const card = (await read(page)).pausedBox;
    await tapAt(page, [(card.l + card.r) / 2, (card.t + card.b) / 2]);
    await run(page, 2000);
    const after = (await read(page)).stats;
    if (Number(after[0]) >= Number(frozen[0])) throw new Error(`Time did not go on after the tap on the card: ${frozen[0]} then ${after[0]}`);
    await second.close().catch(() => {});
    expectEq(errors, [], "page errors");
    return `${env.w}x${env.h}@${env.dpr}: ${real ? "a real second page hid the first" : "the second page did not hide the first in this browser; the event was made by hand"}: the run stopped (Time ${frozen[0]}), stayed stopped, and went on after a tap on the card (Time ${after[0]})`;
  },

  // A real touch on a bug catches it (10, or 30 for a golden one) on the press, a bug that moves before the finger lifts is still caught once and the lift is no miss, a tap on empty field is
  // a miss (Streak 0, Score unchanged), and a finger dragged over the overlay moves nothing behind it (after a control: the same drag moves the plain Arena page).
  "train-touch": async (open, env) => {
    const { page, cdp, errors } = await open(adult());
    await page.locator('button[aria-label="Arena"]').scrollIntoViewIfNeeded();
    await tapAt(page, boxCenter(await page.evaluate(boxOf, { selector: 'button[aria-label="Arena"]', scroll: true })));
    await run(page, 200);
    await page.evaluate(() => window.scrollTo(0, 0));
    await sleep(50);
    const top = (await read(page)).scrollY;
    await drag(cdp, [env.w / 2, env.h * 0.9], [env.w / 2, env.h * 0.3]);
    const moved = (await read(page)).scrollY;
    if (!(moved > top + 20)) throw new Error(`control: a drag on the plain Arena page moved it from ${top} to ${moved}: the page-behind check below proves nothing`);
    await openStartCard(page);
    const behind = (await read(page)).scrollY;
    const trainBox = await page.evaluate(() => {
      const r = document.querySelector('button[aria-label^="Train"]').getBoundingClientRect();
      return r.top;
    });
    await pressGo(page);
    await waitForBug(page);
    // drags on the parts of the overlay that do not scroll: the numbers row, then the field (a drag that starts on the empty field is a miss, which the check below allows for by catching first)
    const statsBox = await page.evaluate(boxOf, { selector: ".train-stats", scroll: false });
    await drag(cdp, [statsBox.x, statsBox.y], [statsBox.x, statsBox.y - 150]);
    await drag(cdp, [statsBox.x, statsBox.y], [statsBox.x, statsBox.y + 150]);
    const afterStats = await page.evaluate((sel) => ({ y: window.scrollY, top: document.querySelector(sel).getBoundingClientRect().top }), 'button[aria-label^="Train"]');
    expectEq(afterStats, { y: behind, top: trainBox }, "the page behind (scroll position, the Train button's top) after drags on the numbers row");
    // a catch by real touch
    const s0 = await waitForBug(page);
    const bug = s0.bugs[0];
    await tapAt(page, [bug.x, bug.y]);
    const s1 = await read(page);
    expectEq(s1.stats.slice(1), [bug.kind === "golden" ? "30" : "10", "1"], `Score and Streak after a tap on a ${bug.kind} bug`);
    // a drag on the field, starting on a bug-free spot, is a miss at the press and moves nothing behind
    const free = freeSpot(s1);
    await drag(cdp, free, [free[0], free[1] - 120]);
    const s2 = await read(page);
    expectEq(s2.stats.slice(1)[1], "0", "Streak after a drag that started on empty field");
    const afterField = await page.evaluate((sel) => ({ y: window.scrollY, top: document.querySelector(sel).getBoundingClientRect().top }), 'button[aria-label^="Train"]');
    expectEq(afterField, { y: behind, top: trainBox }, "the page behind after drags on the field");
    // press on a bug, the bug moves 300 ms before the finger lifts: caught on the press, no second effect, no miss at the lift
    const s3 = await waitForBug(page);
    const b2 = s3.bugs[0];
    const scoreBefore = Number(s3.stats[1]);
    const send = (type, points) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: points });
    await send("touchStart", [{ x: b2.x, y: b2.y }]);
    await sleep(30);
    const pressed = await read(page);
    expectEq(pressed.stats.slice(1), [String(scoreBefore + (b2.kind === "golden" ? 30 : 10)), "1"], `Score and Streak right after a press on a ${b2.kind} bug`);
    await run(page, 300);
    await send("touchEnd", []);
    await sleep(60);
    const lifted = await read(page);
    expectEq(lifted.stats.slice(1), pressed.stats.slice(1), "Score and Streak after the finger lifted 300 ms later (the catch happened once, the lift is no miss)");
    // a tap on empty field is a miss
    const s4 = await read(page);
    await tapAt(page, freeSpot(s4));
    expectEq((await read(page)).stats.slice(1), [lifted.stats[1], "0"], "Score and Streak after a tap on empty field (Score stays, the streak is gone)");
    expectEq(errors, [], "page errors");
    return `${env.w}x${env.h}@${env.dpr}: control drag moved the Arena page ${top} -> ${moved}; behind the overlay it stayed at ${behind}; a ${bug.kind} bug scored ${s1.stats[1]} on the press, the lift 300 ms later changed nothing, and an empty tap reset the streak`;
  },

  // A whole run, every bug tapped as soon as it is seen: the score on screen follows the rules at every tap, the result card and the saved game say what the rules pay, Done puts the overlay
  // away, and the next start card counts one session.
  "train-run": async (open, env) => {
    const base = adult((c) => {
      c.bond = { xp: 295, chain: 0, at: 0 };
    });
    const before = JSON.parse(JSON.stringify(base));
    const { page, errors } = await open(base);
    await openStartCard(page);
    const card = await read(page);
    expectEq(card.reward, "Speed: full reward, 1 of 3 today", "the start card's reward line");
    expectEq(card.focus, "Go", "the focused button on the start card");
    await pressGo(page);
    let expected = 0;
    let catches = 0;
    let goldens = 0;
    for (let t = 0; t < 80_000; t += 250) {
      await page.clock.runFor(250);
      const s = await read(page);
      if (s.phase === "done") break;
      if (s.phase !== "playing") throw new Error(`the card is "${s.phase}" in the middle of the run`);
      const bug = s.bugs[0];
      if (!bug) continue;
      catches += 1;
      if (bug.kind === "golden") goldens += 1;
      expected += (bug.kind === "golden" ? 30 : 10) * (catches >= 5 ? 2 : 1);
      await tapAt(page, [bug.x, bug.y]);
      const after = await read(page);
      expectEq(after.stats[1], String(expected), `Score after catch ${catches} (a ${bug.kind} bug)`);
      expectEq(after.stats[2], String(catches), `Streak after catch ${catches}`);
    }
    await page.locator(".train-lines").waitFor({ timeout: 5000 });
    const done = await read(page);
    const m = /^(Bronze|Silver|Gold): (\d+) points, (\d+) caught$/.exec(done.lines[0] ?? "");
    if (!m) throw new Error(`the result card's first line is not a band line: ${JSON.stringify(done.lines)}`);
    const [, band, score, caught] = m;
    expectEq([Number(score), Number(caught)], [expected, catches], "the result card's score and catches against the taps made here");
    if (catches < 10) throw new Error(`only ${catches} catches in the run: the check proves little`);
    const speed = band === "Gold" ? 2 : 1;
    const xp = { Bronze: 10, Silver: 20, Gold: 30 }[band];
    const discipline = band === "Gold" ? 2 : 1;
    expectEq(
      done.lines,
      [`${band}: ${expected} points, ${catches} caught`, `+${speed} Speed`, `+${discipline} Discipline`, `+${xp} Bond XP`, "Bond level 2"],
      "the result card's lines (a first session of the day, Bond XP 295 so any session reaches level 2)",
    );
    expectEq(done.focus, "Done", "the focused button on the result card");
    const fit = await page.evaluate(fitProblems, { iw: env.w, scope: "section.panel" });
    expectEq(fit.problems, [], "what does not fit on the result card");
    const saved = await savedGame(page);
    const c = saved.creature;
    expectEq(c.trained.spd, speed, "saved Speed training");
    expectEq(c.training, { day: TODAY, sessions: { spd: 1 } }, "saved day count");
    expectEq(c.stats.discipline, before.creature.stats.discipline + discipline, "saved discipline");
    expectEq(c.bond, { xp: 295 + xp, chain: 0, at: 0 }, "saved Bond (XP up, chain and last-pet time as they were)");
    const log = saved.log.filter((e) => /^Bug Catch:/.test(e.text));
    expectEq(
      log.map((e) => e.text),
      [`Bug Catch: ${band.toLowerCase()}, ${expected} points, ${speed} Speed, ${xp} Bond XP`],
      "the dev log's Bug Catch lines",
    );
    // Done puts it away without paying again; the next card counts one session. It must be on screen to be tapped (the five-line card is taller than the one-line one).
    const doneBox = await page.evaluate(boxOf, { selector: "section.panel .btn.wide", scroll: false });
    if (doneBox.b > env.h + 0.5 || doneBox.t < -0.5) throw new Error(`the Done button of the paid card is at ${Math.round(doneBox.t)} to ${Math.round(doneBox.b)} in a window ${env.h} tall`);
    await tapAt(page, boxCenter(doneBox));
    await run(page, 100);
    expectEq((await read(page)).phase, "closed", "the screen after Done");
    const again = await savedGame(page);
    expectEq([again.creature.trained.spd, again.creature.training, again.log.filter((e) => /^Bug Catch:/.test(e.text)).length], [speed, { day: TODAY, sessions: { spd: 1 } }, 1], "the saved game after Done (paid once)");
    await openStartCard(page);
    expectEq((await read(page)).reward, "Speed: full reward, 2 of 3 today", "the next start card's reward line");
    expectEq(errors, [], "page errors");
    return `${env.w}x${env.h}@${env.dpr}: ${catches} catches (${goldens} golden), score ${expected} on screen at every tap, ${band}: +${speed} Speed, +${discipline} Discipline, +${xp} Bond XP and level 2 saved once, the card fits, the next card says 2 of 3`;
  },

  // A reload in the middle of a run: nothing is paid, nothing is counted.
  "train-reload": async (open, env) => {
    const { page, errors } = await open(adult());
    await openStartCard(page);
    await pressGo(page);
    const s = await waitForBug(page);
    await tapAt(page, [s.bugs[0].x, s.bugs[0].y]);
    expectEq((await read(page)).stats[2], "1", "Streak after the catch");
    await run(page, 3000);
    await page.reload();
    await page.locator("canvas.room").waitFor({ timeout: 20000 });
    await run(page, 200);
    expectEq((await read(page)).phase, "closed", "the screen after the reload");
    const saved = await savedGame(page);
    expectEq([saved.creature.trained?.spd ?? 0, saved.creature.training, saved.log.filter((e) => /Bug Catch/.test(e.text)).length], [0, undefined, 0], "saved Speed, day count and Bug Catch log lines after the reload");
    expectEq(errors, [], "page errors");
    return `${env.w}x${env.h}@${env.dpr}: a reload after a catch and 3 s more leaves Speed 0, no day count and no Bug Catch line`;
  },

  // Edge 18 on the screen: with the clock held, a whole session (start, Go, a catch, a miss, a pause and its resume, Quit) leaves the saved game, its dev log and its random state exactly as they were.
  "train-still": async (open, env) => {
    const { page, errors } = await open(adult());
    const before = await savedGame(page);
    await openStartCard(page);
    await pressGo(page);
    const first = await waitForBug(page);
    await tapAt(page, [first.bugs[0].x, first.bugs[0].y]);
    expectEq(Number((await read(page)).stats[1]) > 0, true, "Score after a catch");
    await tapAt(page, freeSpot(await read(page)));
    await tapAt(page, boxCenter(await page.evaluate(boxOf, { selector: ".train-buttons .btn:first-child", scroll: false })));
    await run(page, 100);
    const card = (await read(page)).pausedBox;
    await tapAt(page, [(card.l + card.r) / 2, (card.t + card.b) / 2]);
    await run(page, 3000);
    expectEq((await read(page)).phase, "playing", "the card before Quit");
    await tapAt(page, boxCenter(await page.evaluate(boxOf, { selector: ".train-buttons .btn:last-child", scroll: false })));
    await run(page, 100);
    expectEq((await read(page)).phase, "closed", "the screen after Quit");
    const after = await savedGame(page);
    expectEq(after, before, "the saved game after a session that was quit (save, dev log and random state)");
    expectEq(errors, [], "page errors");
    return `${env.w}x${env.h}@${env.dpr}: the saved game is identical (${JSON.stringify(after).length} characters, ${after.log.length} dev-log lines) after start, Go, a catch, a miss, a pause with its resume, and Quit`;
  },

  // Names and keys: the dialog's role and name, the focus on Go, each bug's name against its kind (a golden one is seen), and Enter on a focused bug catches it.
  "train-a11y": async (open, env) => {
    const { page, errors } = await open(adult());
    await openStartCard(page);
    const dialog = await page.evaluate(() => {
      const d = document.querySelector("section.panel");
      return { role: d.getAttribute("role"), modal: d.getAttribute("aria-modal"), label: d.getAttribute("aria-label") };
    });
    expectEq(dialog, { role: "dialog", modal: "true", label: "Bug Catch" }, "the overlay's role, aria-modal and name");
    expectEq((await read(page)).focus, "Go", "the focused button on the start card");
    await pressGo(page);
    const seen = new Set();
    for (let t = 0; t < 60_000 && seen.size < 2; t += 100) {
      await page.clock.runFor(100);
      for (const b of (await read(page)).bugs) seen.add(`${b.kind}|${b.name}`);
    }
    if (seen.size < 2) throw new Error(`only ${[...seen].join(", ") || "no bug"} seen in 60 s of the fake clock: both kinds are needed`);
    expectEq([...seen].sort(), ["bug|Bug", "golden|Golden bug"], "every (kind, accessible name) pair seen on the field");
    // Enter on a focused bug: it is caught (10 or 30), whichever kind it is
    const s = await waitForBug(page);
    const bug = s.bugs[0];
    const scoreBefore = Number(s.stats[1]);
    await page.evaluate(() => document.querySelector(".bug").focus());
    await page.keyboard.press("Enter");
    await sleep(40);
    expectEq(Number((await read(page)).stats[1]), scoreBefore + (bug.kind === "golden" ? 30 : 10), `Score after Enter on a focused ${bug.kind} bug`);
    expectEq(errors, [], "page errors");
    return `${env.w}x${env.h}@${env.dpr}: dialog role/name right, Go focused, names match kinds (${[...seen].join(", ")}), Enter on a ${bug.kind} bug scored it`;
  },

  // Fit: the Arena row of two buttons, the start card, the run (the whole field on screen with no scrolling, Pause and Quit and every bug at least 44 px, every bug inside the window at
  // many moments of the first 20 s) and the result card of a run with no catch, at this window.
  "train-fit": async (open, env) => {
    const { page, errors } = await open(adult());
    await page.locator('button[aria-label="Arena"]').scrollIntoViewIfNeeded();
    await tapAt(page, boxCenter(await page.evaluate(boxOf, { selector: 'button[aria-label="Arena"]', scroll: true })));
    await run(page, 200);
    const arenaFit = await page.evaluate(fitProblems, { iw: env.w, scope: ".trainbtns" });
    expectEq(arenaFit.problems, [], "what does not fit in the Arena row");
    if (arenaFit.lines < 2) throw new Error(`only ${arenaFit.lines} text lines measured in the Arena row (expected the two words)`);
    const buttons = await page.evaluate(() => [...document.querySelectorAll(".trainbtns .btn")].map((el) => {
      const r = el.getBoundingClientRect();
      return { label: el.getAttribute("aria-label"), w: Math.round(r.width), h: Math.round(r.height) };
    }));
    expectEq(buttons.length, 2, "the buttons in the Arena row");
    for (const b of buttons) if (b.w < 44 || b.h < 44) throw new Error(`Arena row button "${b.label}" is ${b.w} x ${b.h}: under 44`);
    await openStartCard(page);
    const startFit = await page.evaluate(fitProblems, { iw: env.w, scope: "section.panel" });
    expectEq(startFit.problems, [], "what does not fit on the start card");
    if (startFit.lines < 5) throw new Error(`only ${startFit.lines} text lines measured on the start card`);
    const go = await page.evaluate(boxOf, { selector: "section.panel .btn.wide", scroll: false });
    if (go.b > env.h + 0.5 || go.t < -0.5) throw new Error(`the Go button is at ${Math.round(go.t)} to ${Math.round(go.b)} in a window ${env.h} tall`);
    await pressGo(page);
    // the run
    const playing = await page.evaluate(() => {
      const panel = document.querySelector("section.panel");
      const f = document.querySelector(".train-field").getBoundingClientRect();
      const btns = [...document.querySelectorAll(".train-buttons .btn")].map((el) => {
        const r = el.getBoundingClientRect();
        return { text: el.textContent.trim(), w: r.width, h: r.height, l: r.left, r: r.right, t: r.top, b: r.bottom };
      });
      return { scrolls: panel.scrollHeight - panel.clientHeight, field: { l: f.left, t: f.top, r: f.right, b: f.bottom, w: f.width }, btns };
    });
    expectEq(playing.scrolls <= 1, true, `the overlay needs no scrolling while playing (scrollHeight - clientHeight = ${playing.scrolls})`);
    const f = playing.field;
    if (f.l < -0.5 || f.t < -0.5 || f.r > env.w + 0.5 || f.b > env.h + 0.5) throw new Error(`the field is at ${JSON.stringify(f)}: not inside the ${env.w} x ${env.h} window`);
    expectEq(playing.btns.map((b) => b.text), ["Pause", "Quit"], "the buttons beside the field");
    for (const b of playing.btns) {
      if (b.w < 43.5 || b.h < 43.5) throw new Error(`${b.text} is ${b.w.toFixed(1)} x ${b.h.toFixed(1)}: under 44`);
      if (b.l < -0.5 || b.t < -0.5 || b.r > env.w + 0.5 || b.b > env.h + 0.5) throw new Error(`${b.text} is not inside the window: ${JSON.stringify(b)}`);
    }
    let sampled = 0;
    let smallest = Infinity;
    for (let i = 0; i < 12; i++) {
      await run(page, 1700);
      const s = await read(page);
      if (s.phase !== "playing") throw new Error(`the card is "${s.phase}" 20 s into a run`);
      for (const b of s.bugs) {
        sampled += 1;
        smallest = Math.min(smallest, b.w, b.h);
        if (b.w < 43.5 || b.h < 43.5) throw new Error(`a ${b.kind} bug is ${b.w.toFixed(1)} x ${b.h.toFixed(1)}: under 44`);
        // the target scales with the field: 15.3 percent of its width, never under 44 px (the stand-in player's model radius holds from a 288 px field up)
        const want = Math.max(44, 0.153 * s.field.w);
        if (Math.abs(b.w - want) > 1.5) throw new Error(`a ${b.kind} bug is ${b.w.toFixed(1)} px wide: expected ${want.toFixed(1)} (15.3 percent of the ${s.field.w.toFixed(0)} px field, at least 44)`);
        if (b.l < -0.5 || b.t < -0.5 || b.r > env.w + 0.5 || b.b > env.h + 0.5) throw new Error(`a ${b.kind} bug is not inside the window: ${JSON.stringify(b)}`);
      }
      const fit = await page.evaluate(fitProblems, { iw: env.w, scope: "section.panel" });
      if (fit.problems.length > 0) throw new Error(`while playing: ${fit.problems.join("; ")}`);
    }
    if (sampled < 12) throw new Error(`only ${sampled} bugs sampled in 12 looks: the check proves little`);
    // the end of a run with no catch
    await run(page, 75_000 - 20_400 + 1000);
    await page.locator(".train-lines").waitFor({ timeout: 5000 });
    const doneFit = await page.evaluate(fitProblems, { iw: env.w, scope: "section.panel" });
    expectEq(doneFit.problems, [], "what does not fit on the result card");
    expectEq((await read(page)).lines, ["No bugs caught: nothing to pay."], "the result card of a run with no catch");
    const done = await page.evaluate(boxOf, { selector: "section.panel .btn.wide", scroll: false });
    if (done.b > env.h + 0.5 || done.t < -0.5) throw new Error(`the Done button is at ${Math.round(done.t)} to ${Math.round(done.b)} in a window ${env.h} tall`);
    expectEq(errors, [], "page errors");
    return `${env.w}x${env.h}@${env.dpr}: Arena row, start card, run (field ${Math.round(f.w)} px, ${sampled} bug looks, smallest ${smallest.toFixed(1)} px) and result card all fit; the Go and Done buttons are on screen`;
  },
};

// A point on the field at least 70 px from every bug and 30 px inside the field's edge (a tap there is a miss), found on a grid of the field.
function freeSpot(s) {
  const f = s.field;
  let best = null;
  let bestDistance = -1;
  for (let i = 1; i < 12; i++) {
    for (let j = 1; j < 12; j++) {
      const x = f.l + 30 + ((f.w - 60) * i) / 12;
      const y = f.t + 30 + ((f.b - f.t - 60) * j) / 12;
      const d = Math.min(Infinity, ...s.bugs.map((b) => Math.hypot(b.x - x, b.y - y)));
      if (d > bestDistance) {
        bestDistance = d;
        best = [x, y];
      }
    }
  }
  if (bestDistance < 70) throw new Error(`no spot on the field is 70 px from every bug (best ${bestDistance.toFixed(0)} px)`);
  return best;
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
