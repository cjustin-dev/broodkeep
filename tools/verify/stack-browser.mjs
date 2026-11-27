// Browser checks for A4.2 Stack & Balance (docs/adult-a4-plan.md section 6, edges 22 to 29): the third picker button, the moving block that moves only under the fake clock, a drop read as Perfect, Good,
// wobble and fall with the right words and the right blocks drawn, the gap before the next block, Pause and a hidden page, a real finger that drops on the press and a drag that moves nothing behind, a
// whole run played by touch that pays what the rules say into the saved game, a stack 30 blocks high, the names for a screen reader and the keyboard, and everything fitting at 320, 360 and 390 wide
// (pixel ratios 1 and 2, and 3 at 390) and on its side (740 x 360 and 844 x 390). Real touch events (Playwright's touchscreen and CDP Input.dispatchTouchEvent) on a mobile touch window against the built
// game (dist/).
//
// Run: node stack-browser.mjs --base http://127.0.0.1:4173 [--only id1,id2] [--sizes 360x640@2,390x844@3] [--modes kid,adult]
// Exit: 0 when no check failed and at least one ran; 1 when any FAIL; 2 when the script broke (a requested --only id ran zero times, an unknown id, a bad flag, or a crash outside a
// check). A check that throws or times out prints a FAIL line, never a crash.
//
// The saves come from gen-saves (saves/adult-home-<mode>.json: Gravelhorn, a Land adult) with changes put on the creature here. Expected values are literals worked out by hand from the plan, not read
// from the game:
//   - the clock is frozen at T = 2026-11-22T15:00:00Z, so the local day (the window's zone is UTC) is 20779;
//   - an adult's block sweeps 150 to 850 at 360 units a second as a triangle wave (period 3888.9 ms): it is at 150 at 0 ms, over the base's centre (500) at 972 ms going right and at 2917, 4861 and
//     every 1944.4 ms after, at 850 at 1944 ms and back at 150 at 3889 ms. The base is 300 wide (350 to 650). A Perfect is within 40 units (within 111 ms of a crossing); a drop is Good while at
//     least 35 percent of the block (105 of 300) overlaps; a drop less than that is a bad drop, the first is forgiven and the second makes the stack fall. The next block comes 400 ms after a drop;
//   - the page's run clock lags the fake clock by 0 to about 45 ms (the first frame counts 0, whole 10 ms steps, and the last frame is up to 16 ms behind a tap), so a tap at a crossing plus 10 ms
//     lands the block within 15 units of the base's centre: a Perfect, and a run clock of at most that plus 10 ms, so a Perfect's time never passes 1,000 ms (the standing seconds below);
//   - a Perfect scores 20 and 5 more for each Perfect before it in a row (at most 5 more), a Good 10, and each whole second the stack stands (from the first block on the base) 5; a first session of
//     the day is a full reward: Bronze and Silver +1 Strength, Gold +2; Bond XP 10, 20, 30; discipline +1, +1, +2; the day is stored as { day: 20779, sessions: { str: 1 } }.
// Math.random is 0.99 for the whole page, so the creature stands still (the stack draws nothing).
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
const CHECK_TIMEOUT_MS = 600_000;

// Where the adult's block is over the base's centre going right (972.2 ms) and every 1944.4 ms after, in milliseconds since Go; a Perfect tap is made 10 ms after one.
const crossing = (k) => Math.round(972.2 + 1944.4 * k);
const PERFECT_AT = (k) => crossing(k) + 10;

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
  "sb-kid": ["kid"],
  "sb-pick": ["adult"],
  "sb-clock": ["adult"],
  "sb-drop": ["adult"],
  "sb-hidden": ["adult"],
  "sb-touch": ["adult"],
  "sb-run": ["adult"],
  "sb-a11y": ["adult"],
  "sb-fit": ["adult"],
};
const CHECK_SIZES = {
  "sb-kid": THREE,
  "sb-pick": [[360, 640, 2]],
  "sb-clock": [[360, 640, 2]],
  "sb-drop": [[360, 640, 2]],
  "sb-hidden": [[360, 640, 2]],
  "sb-touch": [
    [320, 568, 1],
    [360, 640, 2],
  ],
  "sb-run": [...THREE, [740, 360, 2], [844, 390, 3]],
  "sb-a11y": [[360, 640, 2]],
  "sb-fit": NINE,
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

// A number within `tol` of `want`, or the check fails with the number.
function expectNear(actual, want, tol, what) {
  if (!(Math.abs(actual - want) <= tol)) throw new Error(`${what}: expected ${want} within ${tol}, got ${actual}`);
}

const load = (file) => JSON.parse(readFileSync(join(SAVES, file), "utf8"));
// The living adult at home (Gravelhorn, Land) in Adult Mode, with no training done; `change` edits the creature.
function adult(change = () => {}) {
  const save = load("adult-home-adult.json");
  const c = save.creature;
  if ((c.trained?.str ?? 0) !== 0 || (c.trained?.spi ?? 0) !== 0 || (c.trained?.spd ?? 0) !== 0 || c.training !== undefined) throw new Error("the saved adult already has training or a day count: the literals below assume none");
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

// Runs in the page: what the session shows. `phase` is the card on screen; `stats` is Time, Score and Height as text; `blocks` are the stack's blocks on the field, the top one first (each box in CSS
// pixels of the window); `mover` is the moving block with whether it is visible; `said` is the line over the field with its data attribute.
function snap() {
  const q = (s) => document.querySelector(s);
  const box = (el) => {
    const r = el.getBoundingClientRect();
    return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height, x: (r.left + r.right) / 2, y: (r.top + r.bottom) / 2 };
  };
  const field = q(".stack-field");
  const phase = q(".train-lines") ? "done" : field ? "playing" : q(".train-reward") ? "ready" : q("section.panel") ? "other" : "closed";
  const said = q(".stack-said");
  const mover = q(".stack-mover");
  return {
    phase,
    stats: [...document.querySelectorAll(".train-stats b")].map((b) => b.textContent),
    statLabels: [...document.querySelectorAll(".train-stats span")].map((s) => s.firstChild.textContent.trim()),
    field: field ? { ...box(field), overflow: getComputedStyle(field).overflow } : null,
    blocks: [...document.querySelectorAll(".stack-block")].map((el) => ({ ...box(el), base: el.hasAttribute("data-base"), hidden: el.getAttribute("aria-hidden") })),
    mover: mover ? { ...box(mover), visibility: getComputedStyle(mover).visibility, hidden: mover.getAttribute("aria-hidden") } : null,
    pad: q(".stack-pad") ? box(q(".stack-pad")) : null,
    said: said ? { text: said.textContent, judge: said.dataset.judge ?? null, live: said.getAttribute("aria-live"), role: said.getAttribute("role"), box: box(said) } : null,
    paused: !!q(".train-paused"),
    pausedBox: q(".train-paused") ? box(q(".train-paused")) : null,
    lines: [...document.querySelectorAll(".train-lines li")].map((li) => li.textContent),
    reward: q(".train-reward") ? q(".train-reward").textContent : null,
    picker: [...document.querySelectorAll(".train-picker .btn")].map((b) => ({ name: b.textContent.trim(), pressed: b.getAttribute("aria-pressed"), h: b.getBoundingClientRect().height })),
    pickerRole: q(".train-picker") ? [q(".train-picker").getAttribute("role"), q(".train-picker").getAttribute("aria-label")] : null,
    dialog: q("section.panel") ? q("section.panel").getAttribute("aria-label") : null,
    heading: q("section.panel h2") ? q("section.panel h2").textContent : null,
    hints: [...document.querySelectorAll("section.panel .hint")].map((p) => p.textContent),
    bugs: document.querySelectorAll(".bug").length,
    focus: document.activeElement ? (document.activeElement.textContent ?? document.activeElement.getAttribute("aria-label") ?? "").trim() : null,
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

// A box in the field's own units (1000 across the field, as the engine counts): left edge, right edge, width, and the top edge's share of the field's height.
function inUnits(b, f) {
  return { left: ((b.l - f.l) / f.w) * 1000, right: ((b.r - f.l) / f.w) * 1000, w: (b.w / f.w) * 1000, top: (b.t - f.t) / f.h };
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
    Math.random = () => 0.99; // the creature stands still
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

// After `install` the fake clock still runs in real time; `pauseAt` holds it, so from here it moves only under `runFor` (sb-clock proves it with a real-time wait). Date.now stays at T
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

// Pick Stack & Balance on the start card (the third picker button), with a real tap.
async function pickStack(page) {
  const b = await page.evaluate(boxOf, { selector: ".train-picker .btn:nth-child(3)", scroll: false });
  if (!b) throw new Error("no third button in the picker");
  await tapAt(page, boxCenter(b));
  await run(page, 100);
  expectEq((await read(page)).dialog, "Stack & Balance", "the dialog's name after a tap on Stack & Balance");
}

// From the Arena screen to a Stack & Balance run that has just begun. The timeline `tl.at` counts the fake clock since Go (20 ms: `pressGo` runs one frame); `to` moves it to a later point.
async function startStack(page) {
  await openStartCard(page);
  await pickStack(page);
  await pressGo(page);
  return { at: 20 };
}
async function to(page, tl, ms) {
  if (ms < tl.at) throw new Error(`the timeline is at ${tl.at} ms, not before ${ms}`);
  if (ms > tl.at) await page.clock.runFor(ms - tl.at);
  tl.at = ms;
}
// A real touch tap on the pad (anywhere on the field), then one frame so the page writes what was said.
async function tapPad(page, tl) {
  const pad = (await read(page)).pad;
  if (!pad) throw new Error("no pad on the screen");
  await tapAt(page, [pad.x, pad.y]);
  await to(page, tl, tl.at + 20);
}

// ---------- the checks ----------

const CHECKS = {
  // Kid Mode's Arena screen: the one wide Fight button as before, nothing of training anywhere.
  "sb-kid": async (open, env) => {
    const { page, errors } = await open(load("adult-home-kid.json"));
    await page.locator('button[aria-label="Arena"]').click();
    await run(page, 200);
    const dom = await page.evaluate(() => ({
      train: document.querySelectorAll('button[aria-label^="Train"]').length,
      picker: document.querySelectorAll(".train-picker").length,
      judge: document.querySelectorAll("[data-judge]").length,
      stack: document.querySelectorAll(".stack-field, .stack-pad, .stack-block, .stack-mover, .stack-said").length,
      words: /\b(Train|Bug Catch|Rhythm Grove|Stack)\b/.test(document.body.innerText),
      overlay: document.querySelectorAll("section.panel").length,
    }));
    expectEq(dom, { train: 0, picker: 0, judge: 0, stack: 0, words: false, overlay: 0 }, "Kid Mode's Arena screen (Train buttons, pickers, data-judge elements, stack elements, the words, panels)");
    expectEq(errors, [], "page errors");
    return `${env.w}x${env.h}@${env.dpr}: Kid Mode's Arena has no Train button, no picker, no data-judge element, no stack element and no training word`;
  },

  // The picker on the start card: the third button is Stack & Balance; a pick changes the dialog, the blurb (with the adult's 111 ms window) and the reward line (Strength's own count), the pick is kept
  // for the next card, Go begins the game on show.
  "sb-pick": async (open, env) => {
    const { page, errors } = await open(
      adult((c) => {
        c.training = { day: TODAY, sessions: { spd: 6, spi: 2, str: 4 } };
      }),
    );
    await openStartCard(page);
    let s = await read(page);
    expectEq([s.dialog, s.heading], ["Bug Catch", "Bug Catch"], "the dialog's name and the heading on the first card");
    expectEq(s.pickerRole, ["group", "Training game"], "the picker's role and name");
    expectEq(s.picker.map((b) => [b.name, b.pressed]), [["Bug Catch", "true"], ["Rhythm Grove", "false"], ["Stack & Balance", "false"]], "the picker before a pick");
    expectEq(s.focus, "Go", "the focused button on the start card");
    await pickStack(page);
    s = await read(page);
    expectEq(s.heading, "Stack & Balance", "the heading after the pick");
    expectEq(s.picker.map((b) => [b.name, b.pressed]), [["Bug Catch", "false"], ["Rhythm Grove", "false"], ["Stack & Balance", "true"]], "the picker after the pick");
    expectEq(s.reward, "Strength: half reward, 2 of 3 today", "the reward line with 4 Strength sessions counted (3 full, then the first half)");
    expectEq(
      s.hints,
      [
        "Tap to drop the block onto the stack. Perfect is within 111 ms of lining up (less on a narrow block) and keeps the block wide; two in a row make it wider again. A good drop is trimmed to what overlaps. One bad drop is forgiven; a second makes the stack fall and ends the run. The longer it stands, the more it scores. It trains Strength.",
        "75 seconds. You can always play, with no energy cost: after 6 Strength sessions in a day it pays Bond XP only.",
      ],
      "the two hints with Stack & Balance picked",
    );
    // the other two keep their own counts: Rhythm Grove says Spirit with 2 counted, Bug Catch says Speed with 6
    await tapAt(page, boxCenter(await page.evaluate(boxOf, { selector: ".train-picker .btn:nth-child(2)", scroll: false })));
    await run(page, 100);
    s = await read(page);
    expectEq([s.dialog, s.reward], ["Rhythm Grove", "Spirit: full reward, 3 of 3 today"], "the dialog and reward line after a pick of Rhythm Grove");
    await tapAt(page, boxCenter(await page.evaluate(boxOf, { selector: ".train-picker .btn:nth-child(1)", scroll: false })));
    await run(page, 100);
    s = await read(page);
    expectEq([s.dialog, s.reward], ["Bug Catch", "Speed: Bond XP only today"], "the dialog and reward line after a pick of Bug Catch");
    // Stack & Balance again, Close, and the next card shows the pick that was kept
    await pickStack(page);
    await tapAt(page, boxCenter(await page.evaluate(boxOf, { selector: ".panel-head .btn", scroll: false })));
    await run(page, 100);
    expectEq((await read(page)).phase, "closed", "the screen after Close");
    await openStartCard(page);
    s = await read(page);
    expectEq([s.dialog, s.picker.map((b) => b.pressed), s.reward], ["Stack & Balance", ["false", "false", "true"], "Strength: half reward, 2 of 3 today"], "the next card (the pick is kept for the visit)");
    await pressGo(page);
    s = await read(page);
    expectEq([s.field !== null, s.bugs, s.dialog, s.statLabels], [true, 0, "Stack & Balance", ["Time", "Score", "Height"]], "Go began Stack & Balance: a field, no bugs, the dialog's name, the three numbers");
    await tapAt(page, boxCenter(await page.evaluate(boxOf, { selector: ".train-buttons .btn:last-child", scroll: false })));
    await run(page, 100);
    expectEq((await read(page)).phase, "closed", "the screen after Quit");
    expectEq(errors, [], "page errors");
    return `${env.w}x${env.h}@${env.dpr}: the third button is Stack & Balance, its blurb has the 111 ms window and the Strength line comes from 4 Strength sessions, the other two keep their own counts, the pick is kept, Go begins it`;
  },

  // The probe the plan asks for: the block moves under the fake clock and not otherwise (not tried for this game before this check); Pause stops it; a tap on the Paused card goes on and is no drop.
  "sb-clock": async (open, env) => {
    const { page, errors } = await open(adult());
    const tl = await startStack(page);
    let s = await read(page);
    expectEq([s.stats, s.blocks.length, s.said.text, s.mover.visibility], [["75", "0", "0"], 1, "", "visible"], "Time, Score, Height, the blocks, the words and the moving block at the start");
    expectEq(s.blocks[0].base, true, "the one block on the field is the base");
    const f = s.field;
    // 20 ms after Go the run clock is 0 to 20 ms (the first frame counts 0), and the block moves 0.36 units a millisecond: its left edge is 0 to 7.2
    expectNear(inUnits(s.mover, f).left, 4, 4, "the moving block's left edge at the start (centre 150, 300 wide: its left edge is at 0, and at most 7.2 after 20 ms)");
    expectNear(inUnits(s.mover, f).w, 300, 3, "the moving block's width at the start (a full block, 300 wide)");
    await to(page, tl, 500);
    s = await read(page);
    const at500 = inUnits(s.mover, f).left;
    // 500 ms in, the run clock is 455 to 500 ms: the centre is at 314 to 330 and the left edge (300 wide) at 164 to 180
    if (!(at500 > 160 && at500 < 184)) throw new Error(`the moving block's left edge is ${at500.toFixed(1)} units across 500 ms after Go: expected 164 to 180, with 4 to spare`);
    await to(page, tl, 1500);
    s = await read(page);
    expectEq(s.stats[0], "74", "Time 1500 ms after Go (the run clock is 1455 to 1500 ms: 73.5 seconds left, shown as 74)");
    const still = { stats: s.stats, left: s.mover.l };
    await page.waitForTimeout(600); // real time, no fake clock: nothing may move
    s = await read(page);
    expectEq({ stats: s.stats, left: s.mover.l }, still, "the numbers and the moving block's place after 600 ms of real time with the fake clock still");
    await tapAt(page, boxCenter(await page.evaluate(boxOf, { selector: ".train-buttons .btn", scroll: false })));
    await run(page, 100);
    s = await read(page);
    expectEq(s.paused, true, "the Paused card after the Pause button");
    const during = { stats: s.stats, left: s.mover.l };
    await run(page, 5000);
    s = await read(page);
    expectEq({ stats: s.stats, left: s.mover.l }, during, "the numbers and the moving block's place after 5 s of the fake clock while paused");
    const card = s.pausedBox;
    await tapAt(page, [card.x, card.y]);
    await run(page, 100);
    s = await read(page);
    expectEq([s.paused, s.stats.slice(1), s.said.text, s.blocks.length], [false, during.stats.slice(1), "", 1], "the Paused card, Score, Height, the words and the blocks after a tap on the card (it is no drop)");
    await run(page, 500);
    s = await read(page);
    const moved = inUnits(s.mover, f).left - inUnits({ ...s.mover, l: during.left, r: during.left + s.mover.w }, f).left;
    // the pause was at a run clock of 1455 to 1500 ms (centre 674 to 690) and the block turns at 1944 ms, so 600 ms later its centre is 850 less 0.36 a ms past 1944: a net move of 104 or more, not
    // 216; a block that stood still would have moved 0
    if (!(Math.abs(moved) > 50)) throw new Error(`the moving block was at ${during.left} and is at ${s.mover.l} 600 ms after the resume: it should have moved at least 50 units (104 or more by the sweep, 0 if it stood still)`);
    expectEq(errors, [], "page errors");
    return `${env.w}x${env.h}@${env.dpr}: at 0 the block's left edge is 0 and at 500 ms ${at500.toFixed(0)}, Time 74 at 1500 ms, nothing moved in 600 ms of real time or 5 s paused, it goes on after a tap on the card (no drop) and moved ${Math.abs(moved).toFixed(0)} units in 600 ms`;
  },

  // A drop read in the words and the picture of edges 22 to 24: a wobble at the start (the block is at the far left), a Perfect over the base, a drop in the gap that changes nothing (and the moving block
  // hidden there), a Good, and a second bad drop that ends the run on the result card.
  "sb-drop": async (open, env) => {
    const { page, errors } = await open(adult());
    const tl = await startStack(page);
    await to(page, tl, 300);
    await tapPad(page, tl); // run clock 255 to 300 ms: the centre is at 242 to 258, the block spans about 92 to 408 and the base 350 to 650: overlap under 58 of 300, a bad drop
    let s = await read(page);
    expectEq([s.said.judge, s.said.text, s.stats.slice(1), s.blocks.length], ["wobble", "Wobble, steadied. One more and it falls", ["0", "0"], 1], "the wobble: the words, Score and Height, nothing added to the stack");
    expectEq(s.mover.visibility, "hidden", "the moving block right after a drop (the next block has not come)");
    await to(page, tl, 1002);
    s = await read(page);
    expectEq(s.mover.visibility, "visible", "the moving block 700 ms after the drop (the gap is 400 ms)");
    await tapPad(page, tl); // run clock 957 to 1002: the centre is at 495 to 511 (over the base at 972), within 40 units: a Perfect
    s = await read(page);
    expectEq([s.said.judge, s.said.text, s.stats.slice(1), s.blocks.length], ["perfect", "Perfect, combo 1", ["20", "1"], 2], "the Perfect: the words, Score 20, Height 1, two blocks drawn");
    const f = s.field;
    const top = inUnits(s.blocks[0], f);
    expectNear(top.left, 350, 3, "the Perfect block's left edge (snapped over the base, 300 wide)");
    expectNear(top.right, 650, 3, "the Perfect block's right edge");
    expectEq([s.blocks[0].base, s.blocks[1].base], [false, true], "the top block is the new one and the other is the base");
    expectEq(s.mover.visibility, "hidden", "the moving block right after the Perfect");
    await to(page, tl, 1200);
    await tapPad(page, tl); // inside the gap (the next block comes 400 ms after the drop, at 1357 to 1402 ms on the run clock): nothing happens
    s = await read(page);
    expectEq([s.said.text, s.stats.slice(1), s.blocks.length, s.mover.visibility], ["Perfect, combo 1", ["20", "1"], 2, "hidden"], "a tap inside the gap: the words, Score and Height as they were, the moving block still hidden");
    await to(page, tl, 1470);
    s = await read(page);
    expectEq(s.mover.visibility, "visible", "the moving block once the gap is over (the next block came at 1357 to 1402 ms on the run clock; the run clock is now 1425 to 1470)");
    await tapPad(page, tl); // run clock 1425 to 1470 ms: the centre is at 663 to 679, 163 to 179 right of the base's centre: more than 40, and 105 or more of 300 overlap: a Good
    s = await read(page);
    expectEq([s.said.judge, s.stats.slice(1), s.blocks.length], ["good", ["30", "2"], 3], "the Good: Score 30 (20 and 10), Height 2, three blocks drawn");
    const good = inUnits(s.blocks[0], f);
    expectNear(good.right, 650, 3, "the Good block's right edge (cut off at the base's right edge, 650)");
    if (!(good.w > 117 && good.w < 141)) throw new Error(`the Good block is ${good.w.toFixed(1)} units wide: expected 120 to 136 (650 less the block's left edge, 513 to 529, rounded down to even)`);
    const percent = /^Good, trimmed (\d+) percent$/.exec(s.said.text);
    if (!percent) throw new Error(`the words of the Good: "${s.said.text}"`);
    expectNear(good.w, 3 * (100 - Number(percent[1])), 4.5, `the Good block's width against the words (trimmed ${percent[1]} percent of 300)`);
    await to(page, tl, 3300);
    await tapPad(page, tl); // run clock 3255 to 3300 ms: the centre is at 362 to 378 on the way back, the block (120 to 136 wide) ends at 446 at the most and the top block starts at 513 or more: no overlap, a second bad drop
    // the frame after the drop ends the run and pays it
    await to(page, tl, tl.at + 100);
    s = await read(page);
    expectEq(s.phase, "done", "the card after the second bad drop (the stack fell)");
    expectEq(
      s.lines,
      ["Bronze: 40 points, 2 blocks high", "Perfect 1, Good 1, bad drops 2, best combo 1", "The stack stood 2 seconds, then fell.", "+1 Strength", "+1 Discipline", "+10 Bond XP"],
      "the result card's lines (30 block points and 2 whole seconds from the first block, 10 each: 40, Bronze)",
    );
    const saved = await savedGame(page);
    expectEq(saved.log.filter((e) => /^Stack & Balance:/.test(e.text)).map((e) => e.text), ["Stack & Balance: bronze, 40 points, 1 Strength, 10 Bond XP"], "the dev log's Stack & Balance lines");
    expectEq(errors, [], "page errors");
    return `${env.w}x${env.h}@${env.dpr}: wobble at 300 ms, Perfect 20/1 at 1002 ms (a block over the base: ${top.left.toFixed(0)} to ${top.right.toFixed(0)}), a tap in the gap changed nothing, Good ${good.w.toFixed(0)} wide ("${percent[0]}"), the second bad drop ended it: Bronze 40, stood 2 seconds`;
  },

  // A page that becomes hidden stops the run, and becoming visible again does not start it (the card waits for a tap).
  "sb-hidden": async (open, env) => {
    const { page, context, errors } = await open(adult());
    const tl = await startStack(page);
    await to(page, tl, 1500);
    const before = await read(page);
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
    let s = await read(page);
    expectEq(s.paused, true, "the Paused card once the page is hidden");
    const frozen = { stats: s.stats, left: s.mover.l };
    expectEq(frozen, { stats: before.stats, left: before.mover.l }, "the numbers and the moving block when the page was hidden (no fake time passed since the look before)");
    await run(page, 3000);
    s = await read(page);
    expectEq({ stats: s.stats, left: s.mover.l }, frozen, "the numbers and the moving block after 3 more seconds while hidden");
    if (real) await page.bringToFront();
    else
      await page.evaluate(() => {
        delete document.visibilityState;
        document.dispatchEvent(new Event("visibilitychange"));
      });
    await sleep(100);
    s = await read(page);
    expectEq(s.paused, true, "the Paused card once the page is visible again (it waits for a tap)");
    await tapAt(page, [s.pausedBox.x, s.pausedBox.y]);
    await run(page, 2000);
    const after = await read(page);
    if (Number(after.stats[0]) >= Number(frozen.stats[0])) throw new Error(`Time did not go on after the tap on the card: ${frozen.stats[0]} then ${after.stats[0]}`);
    await second.close().catch(() => {});
    expectEq(errors, [], "page errors");
    return `${env.w}x${env.h}@${env.dpr}: hidden ${real ? "(a real second page)" : "(the event made by hand: the headless page stayed visible)"} stopped the block and the clock for 3 s, visible again waited for a tap, then Time went ${frozen.stats[0]} -> ${after.stats[0]}`;
  },

  // A real finger drops on the press, not the lift; a drag over the overlay moves nothing behind it (after a control: the same drag moves the plain Arena page).
  "sb-touch": async (open, env) => {
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
    const trainTop = () => page.evaluate(() => document.querySelector('button[aria-label^="Train"]').getBoundingClientRect().top);
    const trainBox = await trainTop();
    await pickStack(page);
    await pressGo(page);
    const tl = { at: 20 };
    // a finger tap over the base: a Perfect on the press
    await to(page, tl, PERFECT_AT(0));
    await tapPad(page, tl);
    let s = await read(page);
    expectEq([s.said.judge, s.stats.slice(1)], ["perfect", ["20", "1"]], "a real finger tap over the base");
    // a press at the Good time, held 500 ms: judged once on the press, the lift is no drop (the next block came at 1,825 to 1,870 ms on the run clock, before the lift at 1,925 to 1,970, so a lift
    // that dropped again would be judged: at the far right, a bad drop)
    await to(page, tl, 1470);
    const pad = s.pad;
    const send = (type, points) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: points });
    await send("touchStart", [{ x: pad.x, y: pad.y }]);
    await sleep(30);
    const pressed = await read(page);
    expectEq([pressed.said.judge, pressed.stats.slice(1)], ["good", ["30", "2"]], "the press at the Good time");
    await to(page, tl, 1970);
    await send("touchEnd", []);
    await sleep(60);
    const lifted = await read(page);
    expectEq([lifted.said.judge, lifted.stats[2], lifted.blocks.length], ["good", "2", 3], "the words, Height and blocks after the finger lifted 500 ms later (one drop, the lift is no drop)");
    // drags over the numbers row: the page behind does not move and nothing is dropped
    const statsBox = await page.evaluate(boxOf, { selector: ".train-stats", scroll: false });
    await drag(cdp, [statsBox.x, statsBox.y], [statsBox.x, statsBox.y - 150]);
    await drag(cdp, [statsBox.x, statsBox.y], [statsBox.x, statsBox.y + 150]);
    const afterStats = await page.evaluate(() => ({ y: window.scrollY }));
    expectEq([afterStats.y, await trainTop(), (await read(page)).stats[2]], [behind, trainBox, "2"], "the page behind (scroll position, the Train button's top) and Height after drags on the numbers row");
    // a drag that starts on the field is one drop (the press): at 2400 ms (run clock 2355 to 2400) the block's centre is at 686 to 702 on its way back, its left edge 620 to 636 against the top block's
    // right edge at 650: an overlap of 30 or less of 120 to 136, under 35 percent, so a bad drop; the stack has stood 1.35 to 1.45 seconds, one whole second: Score 35 (30 and 5)
    await to(page, tl, 2400);
    await drag(cdp, [pad.x, pad.y], [pad.x, pad.y - 120]);
    s = await read(page);
    expectEq([s.said.judge, s.stats.slice(1), s.blocks.length], ["wobble", ["35", "2"], 3], "the drag that started on the field (one bad drop, nothing added, one second of standing)");
    expectEq([await page.evaluate(() => window.scrollY), await trainTop()], [behind, trainBox], "the page behind after the drag on the field");
    expectEq(errors, [], "page errors");
    return `${env.w}x${env.h}@${env.dpr}: control drag moved the Arena page ${top} -> ${moved}; behind the overlay it stayed at ${behind}; a finger tap dropped on the press and the lift 500 ms later changed nothing; a drag on the field is one drop`;
  },

  // A whole run: three Perfects dropped by real touch, then nothing; the result card and the saved game say what the rules pay, Done puts the overlay away, and the next start card counts one Strength
  // session and keeps the pick.
  "sb-run": async (open, env) => {
    const base = adult((c) => {
      c.bond = { xp: 295, chain: 0, at: 0 };
    });
    const before = JSON.parse(JSON.stringify(base));
    const { page, errors } = await open(base);
    const tl = await startStack(page);
    // the Score after each Perfect is the blocks (20, then 25 and 30 more) plus 5 for each whole second since the first one: 20, 45 + 5 (1.9 s), 75 + 15 (3.9 s)
    // The second Perfect is tapped 40 ms before the block is over the base (centre 14 to 31 units short of it, inside the 40) so the Score read 20 ms later is 1.87 to 1.96 seconds after the first
    // block on any lag, not 1.965 plus a lag difference that could reach 2: 50, never 55.
    const perfectTaps = [PERFECT_AT(0), crossing(1) - 40, PERFECT_AT(2)];
    const want = [["20", "1"], ["50", "2"], ["90", "3"]];
    for (let k = 0; k < 3; k++) {
      await to(page, tl, perfectTaps[k]);
      await tapPad(page, tl);
      const s = await read(page);
      if (s.phase !== "playing") throw new Error(`the card is "${s.phase}" in the middle of the run, after Perfect ${k + 1}`);
      expectEq([s.said.judge, s.said.text, s.stats.slice(1)], ["perfect", `Perfect, combo ${k + 1}`, want[k]], `the line, Score and Height after Perfect ${k + 1} (at ${perfectTaps[k]} ms)`);
    }
    // no drop since 4891 ms: at 7300 ms (run clock 7255 to 7300) 67.7 seconds are left, shown as 68, and the stack has stood 6.27 to 6.36 seconds from the first block (937 to 982 ms): 6 whole
    // seconds, 30 points on top of the blocks' 75. Only the per-frame write of Time and Score shows these (nothing was dropped to draw the page again).
    await to(page, tl, 7300);
    const between = await read(page);
    expectEq([between.stats[0], between.stats[1], between.stats[2]], ["68", "105", "3"], "Time, Score and Height 7300 ms in, with no drop since the third Perfect");
    for (let t = 0; t < 80_000; t += 500) {
      await page.clock.runFor(500);
      if ((await read(page)).phase === "done") break;
    }
    await page.locator(".train-lines").waitFor({ timeout: 5000 });
    const done = await read(page);
    expectEq(
      done.lines,
      ["Bronze: 445 points, 3 blocks high", "Perfect 3, Good 0, bad drops 0, best combo 3", "The stack stood for 74 seconds.", "+1 Strength", "+1 Discipline", "+10 Bond XP", "Bond level 2"],
      "the result card's lines (3 Perfects: 20 + 25 + 30 = 75, and 74 whole seconds from the first block, 370: 445 is Bronze; a first session of the day; Bond XP 295 so any session reaches level 2)",
    );
    expectEq([done.focus, done.heading, done.dialog], ["Done", "Stack & Balance", "Stack & Balance"], "the focused button, the heading and the dialog's name on the result card");
    const fit = await page.evaluate(fitProblems, { iw: env.w, scope: "section.panel" });
    expectEq(fit.problems, [], "what does not fit on the result card");
    const saved = await savedGame(page);
    const c = saved.creature;
    expectEq(c.trained.str, 1, "saved Strength training");
    expectEq([c.trained.spd, c.trained.spi], [undefined, undefined], "saved Speed and Spirit training (untouched)");
    expectEq(c.training, { day: TODAY, sessions: { str: 1 } }, "saved day count");
    expectEq(c.stats.discipline, before.creature.stats.discipline + 1, "saved discipline");
    expectEq(c.bond, { xp: 305, chain: 0, at: 0 }, "saved Bond (XP up, chain and last-pet time as they were)");
    expectEq(saved.log.filter((e) => /^Stack & Balance:/.test(e.text)).map((e) => e.text), ["Stack & Balance: bronze, 445 points, 1 Strength, 10 Bond XP"], "the dev log's Stack & Balance lines");
    const doneBox = await page.evaluate(boxOf, { selector: "section.panel .btn.wide", scroll: false });
    if (doneBox.b > env.h + 0.5 || doneBox.t < -0.5) throw new Error(`the Done button is at ${Math.round(doneBox.t)} to ${Math.round(doneBox.b)} in a window ${env.h} tall`);
    await tapAt(page, boxCenter(doneBox));
    await run(page, 100);
    expectEq((await read(page)).phase, "closed", "the screen after Done");
    const again = await savedGame(page);
    expectEq([again.creature.trained.str, again.creature.training, again.log.filter((e) => /^Stack & Balance:/.test(e.text)).length], [1, { day: TODAY, sessions: { str: 1 } }, 1], "the saved game after Done (paid once)");
    await openStartCard(page);
    const next = await read(page);
    expectEq([next.dialog, next.reward], ["Stack & Balance", "Strength: full reward, 2 of 3 today"], "the next card (the pick is kept; one Strength session counted)");
    expectEq(errors, [], "page errors");
    return `${env.w}x${env.h}@${env.dpr}: 3 Perfects dropped by touch, Score 20, 50 and 90 on screen, Bronze 445: +1 Strength, +1 Discipline, +10 Bond XP and level 2 saved once, the card fits, the next card counts 2 of 3`;
  },

  // The names a screen reader gets, and the keyboard: Enter on the focused pad is a drop.
  "sb-a11y": async (open, env) => {
    const { page, errors } = await open(adult());
    await openStartCard(page);
    let s = await read(page);
    expectEq([s.pickerRole, s.picker.map((b) => b.name)], [["group", "Training game"], ["Bug Catch", "Rhythm Grove", "Stack & Balance"]], "the picker's role, name and buttons");
    await pickStack(page);
    await pressGo(page);
    const tl = { at: 20 };
    s = await read(page);
    expectEq(s.dialog, "Stack & Balance", "the dialog's name while playing");
    await to(page, tl, 300);
    const names = await page.evaluate(() => ({
      pad: document.querySelector("button.stack-pad")?.getAttribute("aria-label"),
      padTag: document.querySelector(".stack-pad")?.tagName,
      blocksHidden: [...document.querySelectorAll(".stack-block")].every((b) => b.getAttribute("aria-hidden") === "true"),
      moverHidden: document.querySelector(".stack-mover")?.getAttribute("aria-hidden"),
      pictures: document.querySelectorAll(".stack-field img").length,
    }));
    expectEq(names, { pad: "Drop the block", padTag: "BUTTON", blocksHidden: true, moverHidden: "true", pictures: 0 }, "the pad's name and kind, the blocks and the moving block hidden from a screen reader (they are plain boxes)");
    await page.locator("button.stack-pad").focus();
    await to(page, tl, PERFECT_AT(0));
    await page.keyboard.press("Enter");
    await to(page, tl, tl.at + 20);
    s = await read(page);
    expectEq([s.said.judge, s.said.text, s.stats.slice(1)], ["perfect", "Perfect, combo 1", ["20", "1"]], "Enter on the focused pad over the base (a Perfect)");
    expectEq([s.said.live, s.said.role], [null, null], "the line over the field is not a live region (a drop every few seconds is still the player's own action, and the result card says the rest)");
    expectEq(errors, [], "page errors");
    return `${env.w}x${env.h}@${env.dpr}: the picker is a group named Training game, the dialog is named for the game, the pad is a button named "Drop the block", the blocks and the moving block are hidden from a screen reader, Enter on the pad was a Perfect, the line is not a live region`;
  },

  // Everything fits: the start card, the field with the longest words, a stack 30 blocks high (14 drawn, the top one at the same height as ever) and the Paused card, at nine windows.
  "sb-fit": async (open, env) => {
    const { page, errors } = await open(adult());
    await openStartCard(page);
    await pickStack(page);
    let fit = await page.evaluate(fitProblems, { iw: env.w, scope: "section.panel" });
    expectEq(fit.problems, [], "what does not fit on the start card");
    let s = await read(page);
    for (const b of s.picker) if (b.h < 43.5) throw new Error(`the picker button "${b.name}" is ${b.h.toFixed(1)} px tall`);
    const go = await page.evaluate(boxOf, { selector: "section.panel .btn.wide", scroll: false });
    if (go.h < 43.5 || go.b > env.h + 0.5) throw new Error(`the Go button is ${go.h.toFixed(1)} px tall and ends at ${Math.round(go.b)} in a window ${env.h} tall`);
    await pressGo(page);
    const tl = { at: 20 };
    const f0 = (await read(page)).field;
    const inside = (b, what) => {
      if (b.l < f0.l - 0.5 || b.r > f0.r + 0.5 || b.t < f0.t - 0.5 || b.b > f0.b + 0.5) throw new Error(`${what} (${Math.round(b.l)},${Math.round(b.t)} to ${Math.round(b.r)},${Math.round(b.b)}) is not inside the field (${Math.round(f0.l)},${Math.round(f0.t)} to ${Math.round(f0.r)},${Math.round(f0.b)})`);
    };
    // the longest words: the wobble line, with the moving block on the field
    await to(page, tl, 300);
    await tapPad(page, tl);
    fit = await page.evaluate(fitProblems, { iw: env.w, scope: "section.panel" });
    expectEq(fit.problems, [], "what does not fit with the wobble line showing");
    s = await read(page);
    expectEq(s.said.text, "Wobble, steadied. One more and it falls", "the words on the field");
    inside(s.said.box, "the words over the field");
    inside(s.mover, "the moving block");
    s.blocks.forEach((b, i) => inside(b, `block ${i + 1}`));
    // a stack 30 blocks high: 30 Perfects in a row (one every 1944 ms)
    for (let k = 0; k < 30; k++) {
      await to(page, tl, PERFECT_AT(k));
      await tapPad(page, tl);
      if (k === 0 || k === 6 || k === 12) {
        s = await read(page);
        expectEq([s.said.judge, s.stats[2]], ["perfect", String(k + 1)], `the line and Height after Perfect ${k + 1}`);
        fit = await page.evaluate(fitProblems, { iw: env.w, scope: "section.panel" });
        expectEq(fit.problems, [], `what does not fit with a stack ${k + 1} high`);
      }
    }
    s = await read(page);
    expectEq([s.said.judge, s.said.text, s.stats[2], s.blocks.length], ["perfect", "Perfect, combo 30", "30", 14], "the 30th Perfect: the words, Height 30, and 14 blocks drawn (the field has room for 14)");
    s.blocks.forEach((b, i) => inside(b, `block ${i + 1} of the tall stack`));
    inside(s.mover, "the moving block above the tall stack");
    inside(s.pad, "the pad");
    expectEq([Math.round(s.pad.w), Math.round(s.pad.h)], [Math.round(s.field.w), Math.round(s.field.h)], "the pad's size against the field's");
    // the top block sits where it always does (300 of 1000 down) and the moving block above it
    const topBlock = inUnits(s.blocks[0], s.field);
    expectNear(topBlock.top, 0.3, 0.01, "the tall stack's top block (its upper edge as a share of the field's height)");
    if (!(s.mover.b <= s.blocks[0].t + 0.5)) throw new Error(`the moving block ends at ${Math.round(s.mover.b)} and the top block starts at ${Math.round(s.blocks[0].t)}: they overlap`);
    expectEq(s.blocks.filter((b) => b.base).length, 0, "the base is scrolled out of the field in a tall stack");
    for (const sel of [".train-buttons .btn:first-child", ".train-buttons .btn:last-child"]) {
      const b = await page.evaluate(boxOf, { selector: sel, scroll: false });
      if (b.h < 43.5) throw new Error(`${sel} is ${b.h.toFixed(1)} px tall`);
    }
    fit = await page.evaluate(fitProblems, { iw: env.w, scope: "section.panel" });
    expectEq(fit.problems, [], "what does not fit with the tall stack");
    await tapAt(page, boxCenter(await page.evaluate(boxOf, { selector: ".train-buttons .btn", scroll: false })));
    await run(page, 100);
    s = await read(page);
    inside(s.pausedBox, "the Paused card");
    fit = await page.evaluate(fitProblems, { iw: env.w, scope: "section.panel" });
    expectEq(fit.problems, [], "what does not fit while paused");
    expectEq(errors, [], "page errors");
    return `${env.w}x${env.h}@${env.dpr}: start card, the wobble line, a stack 30 high (14 blocks drawn, top at 0.30 of the field), the moving block, the pad and the Paused card all fit; the picker, Go, Pause and Quit are at least 43.5 px tall`;
  },
};

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
