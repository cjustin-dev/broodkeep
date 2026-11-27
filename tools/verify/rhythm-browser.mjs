// Browser checks for A4.1 Rhythm Grove (docs/adult-a4-plan.md section 2, edges 20 to 27): the picker on the start card, the clock that moves the notes only under the fake clock, a tap on the beat
// read as Perfect, Good, "No note" and Miss with the right numbers, the creature's hop (its animation is none under reduced motion, the word still shows), Pause and a hidden page, a real finger that taps and a drag that moves nothing
// behind, a whole run played by touch that pays what the rules say into the saved game, the names for a screen reader and the keyboard, and everything fitting at
// 320, 360 and 390 wide (pixel ratios 1 and 2, and 3 at 390) and on its side (740 x 360 and 844 x 390). Real touch events (Playwright's touchscreen and CDP Input.dispatchTouchEvent) on a mobile touch
// window against the built game (dist/).
//
// Run: node rhythm-browser.mjs --base http://127.0.0.1:4173 [--only id1,id2] [--sizes 360x640@2,390x844@3] [--modes kid,adult]
// Exit: 0 when no check failed and at least one ran; 1 when any FAIL; 2 when the script broke (a requested --only id ran zero times, an unknown id, a bad flag, or a crash outside a
// check). A check that throws or times out prints a FAIL line, never a crash.
//
// The saves come from gen-saves (saves/adult-home-<mode>.json: Gravelhorn, a Land adult) with changes put on the creature here. Expected values are literals worked out by hand from the plan, not read
// from the game:
//   - the clock is frozen at T = 2026-11-22T15:00:00Z, so the local day (the window's zone is UTC) is 20779;
//   - Land's song is 96 beats a minute (an eighth is 312.5 ms), the lead-in is 2000 ms and the adult pattern is 1.1.1.231.1.2.33, so the notes are at 2000, 2625, 3250, 3875, 4188 (4187.5 rounded),
//     4500, 5125, 5750, 6375, 6688 ms, and the same plus 5000 for the next loop; a note is on the track from 1600 ms before it; Perfect is within 80 ms and Good within 160 ms; a Perfect scores 100,
//     a Good 60, a tap with no note near it takes 30; the song has 144 notes for an adult, so the most is 14,400;
//   - the page's song clock lags the fake clock by 0 to about 45 ms (the first frame counts 0, whole 10 ms steps, and the last frame is up to 16 ms behind a tap), so a tap is made 30 ms after a
//     note for a Perfect (the song clock reads between 15 ms before and 30 ms after), and 140 ms after a note for a Good (95 to 140 ms late);
//   - a first session of the day is a full reward: Bronze and Silver +1 Spirit, Gold +2; Bond XP 10, 20, 30; discipline +1, +1, +2; the day is stored as { day: 20779, sessions: { spi: 1 } }.
// Math.random is 0.99 for the whole page, so the creature stands still (the song itself draws nothing).
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

const LAND_ADULT = [2000, 2625, 3250, 3875, 4188, 4500, 5125, 5750, 6375, 6688, 7000, 7625, 8250, 8875, 9188, 9500, 10125, 10750, 11375, 11688]; // the first 20 notes of Land's adult song, by hand (see the header)

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
  "rg-kid": ["kid"],
  "rg-pick": ["adult"],
  "rg-clock": ["adult"],
  "rg-beat": ["adult"],
  "rg-hop": ["adult"],
  "rg-hidden": ["adult"],
  "rg-touch": ["adult"],
  "rg-run": ["adult"],
  "rg-a11y": ["adult"],
  "rg-fit": ["adult"],
};
const CHECK_SIZES = {
  "rg-kid": THREE,
  "rg-pick": [[360, 640, 2]],
  "rg-clock": [[360, 640, 2]],
  "rg-beat": [[360, 640, 2]],
  "rg-hop": [[360, 640, 2]],
  "rg-hidden": [[360, 640, 2]],
  "rg-touch": [
    [320, 568, 1],
    [360, 640, 2],
  ],
  "rg-run": [...THREE, [740, 360, 2], [844, 390, 3]],
  "rg-a11y": [[360, 640, 2]],
  "rg-fit": NINE,
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

const load = (file) => JSON.parse(readFileSync(join(SAVES, file), "utf8"));
// The living adult at home (Gravelhorn, Land) in Adult Mode, with no training done; `change` edits the creature.
function adult(change = () => {}) {
  const save = load("adult-home-adult.json");
  const c = save.creature;
  if ((c.trained?.spi ?? 0) !== 0 || (c.trained?.spd ?? 0) !== 0 || c.training !== undefined) throw new Error("the saved adult already has training or a day count: the literals below assume none");
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

// Runs in the page: what the session shows. `phase` is the card on screen; `stats` is Time, Score and Streak as text; `notes` are the notes on the track (the middle of each and its box, in CSS pixels
// of the window); `said` is the line over the track with its data attributes; `face` is the creature's picture with whether it carries the hop and the animation it runs.
function snap() {
  const q = (s) => document.querySelector(s);
  const box = (el) => {
    const r = el.getBoundingClientRect();
    return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height, x: (r.left + r.right) / 2, y: (r.top + r.bottom) / 2 };
  };
  const track = q(".rhythm-track");
  const phase = q(".train-lines") ? "done" : track || q(".train-field") ? "playing" : q(".train-reward") ? "ready" : q("section.panel") ? "other" : "closed";
  const said = q(".rhythm-said");
  const face = q(".rhythm-face");
  return {
    phase,
    stats: [...document.querySelectorAll(".train-stats b")].map((b) => b.textContent),
    track: track ? { ...box(track), overflow: getComputedStyle(track).overflow } : null,
    notes: [...document.querySelectorAll("[data-note]")].map((el) => box(el)),
    line: q(".rhythm-line") ? box(q(".rhythm-line")) : null,
    pad: q(".rhythm-pad") ? box(q(".rhythm-pad")) : null,
    said: said ? { text: said.textContent, judge: said.dataset.judge ?? null, delta: said.dataset.delta ?? null, live: said.getAttribute("aria-live"), role: said.getAttribute("role") } : null,
    face: face ? { ...box(face), hop: face.hasAttribute("data-hop"), anim: getComputedStyle(face).animationName, mark: face.dataset.mark ?? null } : null,
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

// After `install` the fake clock still runs in real time; `pauseAt` holds it, so from here it moves only under `runFor` (rg-clock proves it with a real-time wait). Date.now stays at T
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

// Pick Rhythm Grove on the start card (the second picker button), with a real tap.
async function pickRhythm(page) {
  const b = await page.evaluate(boxOf, { selector: ".train-picker .btn:nth-child(2)", scroll: false });
  if (!b) throw new Error("no second button in the picker");
  await tapAt(page, boxCenter(b));
  await run(page, 100);
  expectEq((await read(page)).dialog, "Rhythm Grove", "the dialog's name after a tap on Rhythm Grove");
}

// From the Arena screen to a Rhythm Grove run that has just begun. The timeline `tl.at` counts the fake clock since Go (20 ms: `pressGo` runs one frame); `to` moves it to a later point.
async function startRhythm(page) {
  await openStartCard(page);
  await pickRhythm(page);
  await pressGo(page);
  return { at: 20 };
}
async function to(page, tl, ms) {
  if (ms < tl.at) throw new Error(`the timeline is at ${tl.at} ms, not before ${ms}`);
  if (ms > tl.at) await page.clock.runFor(ms - tl.at);
  tl.at = ms;
}
// A real touch tap on the pad (anywhere on the track), then one frame so the page writes what was said.
async function tapPad(page, tl) {
  const pad = (await read(page)).pad;
  if (!pad) throw new Error("no pad on the screen");
  await tapAt(page, [pad.x, pad.y]);
  await to(page, tl, tl.at + 20);
}

// ---------- the checks ----------

const num = (text) => Number(text);

const CHECKS = {
  // Kid Mode's Arena screen: the one wide Fight button as before, nothing of training anywhere.
  "rg-kid": async (open, env) => {
    const { page, errors } = await open(load("adult-home-kid.json"));
    await page.locator('button[aria-label="Arena"]').click();
    await run(page, 200);
    const dom = await page.evaluate(() => ({
      train: document.querySelectorAll('button[aria-label^="Train"]').length,
      picker: document.querySelectorAll(".train-picker").length,
      judge: document.querySelectorAll("[data-judge]").length,
      words: /\b(Train|Bug Catch|Rhythm Grove)\b/.test(document.body.innerText),
      overlay: document.querySelectorAll("section.panel").length,
    }));
    expectEq(dom, { train: 0, picker: 0, judge: 0, words: false, overlay: 0 }, "Kid Mode's Arena screen (Train buttons, pickers, data-judge elements, the words, panels)");
    expectEq(errors, [], "page errors");
    return `${env.w}x${env.h}@${env.dpr}: Kid Mode's Arena has no Train button, no picker, no data-judge element and no training word`;
  },

  // The picker on the start card: Bug Catch first, a pick changes the dialog, the blurb and the reward line (each game reads its own stat's count), the pick is kept for the next card, Go begins
  // the game on show.
  "rg-pick": async (open, env) => {
    const { page, errors } = await open(
      adult((c) => {
        c.training = { day: TODAY, sessions: { spd: 6, spi: 2 } };
      }),
    );
    await openStartCard(page);
    let s = await read(page);
    expectEq([s.dialog, s.heading], ["Bug Catch", "Bug Catch"], "the dialog's name and the heading on the first card");
    expectEq(s.pickerRole, ["group", "Training game"], "the picker's role and name");
    expectEq(s.picker.map((b) => [b.name, b.pressed]), [["Bug Catch", "true"], ["Rhythm Grove", "false"]], "the picker before a pick");
    expectEq(s.reward, "Speed: Bond XP only today", "the reward line with 6 Speed sessions counted");
    expectEq(s.focus, "Go", "the focused button on the start card");
    await pickRhythm(page);
    s = await read(page);
    expectEq(s.heading, "Rhythm Grove", "the heading after the pick");
    expectEq(s.picker.map((b) => [b.name, b.pressed]), [["Bug Catch", "false"], ["Rhythm Grove", "true"]], "the picker after the pick");
    expectEq(s.reward, "Spirit: full reward, 3 of 3 today", "the reward line with 2 Spirit sessions counted");
    expectEq(
      s.hints,
      [
        "Tap when a note reaches the line, anywhere on the track. Perfect is within 80 ms, Good within 160 ms. A tap with no note near it costs 30 points. It trains Spirit.",
        "75 seconds. You can always play, with no energy cost: after 6 Spirit sessions in a day it pays Bond XP only.",
      ],
      "the two hints with Rhythm Grove picked",
    );
    // back to Bug Catch with a real tap on the first button
    await tapAt(page, boxCenter(await page.evaluate(boxOf, { selector: ".train-picker .btn:nth-child(1)", scroll: false })));
    await run(page, 100);
    s = await read(page);
    expectEq([s.dialog, s.reward], ["Bug Catch", "Speed: Bond XP only today"], "the dialog and reward line after a pick of Bug Catch again");
    expectEq(s.hints[0], "Tap the bugs before they go. A golden bug is worth 3 times, and 5 catches in a row score double. A tap that misses costs no points. It trains Speed.", "Bug Catch's blurb");
    // Rhythm Grove again, Close, and the next card shows the pick that was kept
    await pickRhythm(page);
    await tapAt(page, boxCenter(await page.evaluate(boxOf, { selector: ".panel-head .btn", scroll: false })));
    await run(page, 100);
    expectEq((await read(page)).phase, "closed", "the screen after Close");
    await openStartCard(page);
    s = await read(page);
    expectEq([s.dialog, s.picker.map((b) => b.pressed), s.reward], ["Rhythm Grove", ["false", "true"], "Spirit: full reward, 3 of 3 today"], "the next card (the pick is kept for the visit)");
    await pressGo(page);
    s = await read(page);
    expectEq([s.track !== null, s.bugs, s.dialog], [true, 0, "Rhythm Grove"], "Go began Rhythm Grove: a track, no bugs, the dialog's name");
    await tapAt(page, boxCenter(await page.evaluate(boxOf, { selector: ".train-buttons .btn:last-child", scroll: false })));
    await run(page, 100);
    expectEq((await read(page)).phase, "closed", "the screen after Quit");
    expectEq(errors, [], "page errors");
    return `${env.w}x${env.h}@${env.dpr}: Bug Catch pressed first (Speed line from 6 Speed sessions), a pick of Rhythm Grove gives its blurb with the 80 and 160 ms windows and the Spirit line from 2 Spirit sessions, the pick is kept, Go begins it`;
  },

  // The probe the plan asks for: the notes move under the fake clock and not otherwise (not tried for this game before this check); Pause stops them; a tap on the Paused card goes on.
  "rg-clock": async (open, env) => {
    const { page, errors } = await open(adult());
    const tl = await startRhythm(page);
    let s = await read(page);
    expectEq([s.stats, s.notes.length], [["75", "0", "0"], 0], "Time, Score, Streak and notes at the start");
    await to(page, tl, 300);
    expectEq((await read(page)).notes.length, 0, "notes on the track 300 ms after Go (the first comes on at 400 ms)");
    await to(page, tl, 480);
    s = await read(page);
    expectEq(s.notes.length, 1, "notes on the track 480 ms after Go");
    const top = s.track.t;
    const height = s.track.h;
    // A note comes on with its middle on the top edge: its box starts above the track and the track clips it (the contact sheet showed a note hanging out of the rounded box).
    if (!(s.notes[0].t < s.track.t - 0.5)) throw new Error(`the first note's box starts at ${s.notes[0].t} and the track's top is ${s.track.t} 480 ms after Go: the note is expected to start above the track (it comes on with its middle on the edge)`);
    expectEq(s.track.overflow, "hidden", "the track's overflow, so the note that starts above its top edge is clipped");
    const y480 = (s.notes[0].y - top) / height;
    if (!(y480 > 0.014 && y480 < 0.04)) throw new Error(`the first note's middle is ${y480.toFixed(3)} of the track down 480 ms after Go: expected 0.016 to 0.037 (it enters at the top 1600 ms before its time and reaches the line, 0.74 down, at 2000 ms)`);
    await to(page, tl, 1500);
    s = await read(page);
    const y1500 = (s.notes[0].y - top) / height;
    if (!(y1500 > 0.485 && y1500 < 0.512)) throw new Error(`the first note's middle is ${y1500.toFixed(3)} of the track down 1500 ms after Go: expected 0.488 to 0.509, with 0.003 to spare`);
    expectEq(s.notes.length, 2, "notes on the track 1500 ms after Go (the second, due at 2625 ms, came on at 1025 ms)");
    const still = { stats: s.stats, y: s.notes.map((n) => n.y) };
    await page.waitForTimeout(600); // real time, no fake clock: nothing may move
    s = await read(page);
    expectEq({ stats: s.stats, y: s.notes.map((n) => n.y) }, still, "the numbers and the notes' places after 600 ms of real time with the fake clock still");
    await tapAt(page, boxCenter(await page.evaluate(boxOf, { selector: ".train-buttons .btn", scroll: false })));
    await run(page, 100);
    s = await read(page);
    expectEq(s.paused, true, "the Paused card after the Pause button");
    const during = { stats: s.stats, y: s.notes.map((n) => n.y) };
    await run(page, 5000);
    s = await read(page);
    expectEq({ stats: s.stats, y: s.notes.map((n) => n.y) }, during, "the numbers and the notes' places after 5 s of the fake clock while paused");
    const card = s.pausedBox;
    await tapAt(page, [card.x, card.y]);
    await run(page, 100);
    s = await read(page);
    expectEq([s.paused, s.stats.slice(1)], [false, during.stats.slice(1)], "the Paused card and Score and Streak after a tap on the card (it is no tap on the beat)");
    await run(page, 500);
    s = await read(page);
    if (!(s.notes[0].y > during.y[0] + 0.15 * height)) throw new Error(`the first note was at ${during.y[0]} and is at ${s.notes[0].y} 600 ms after the resume: it should be 0.26 to 0.28 of the track lower`);
    // About 2.1 s in: the last redraw was when the third note came on (1.65 s) and the first note is not a Miss until 2.17 s, so only the per-frame write can have moved Time to 73 (it was 74 then).
    expectEq(s.stats[0], "73", "Time about 2.1 s in, with no note coming on or judged since 1.65 s");
    expectEq(errors, [], "page errors");
    return `${env.w}x${env.h}@${env.dpr}: no note at 300 ms, one at 480 ms (${y480.toFixed(3)} down), 1500 ms ${y1500.toFixed(3)} down with two notes, nothing moved in 600 ms of real time or 5 s paused, it goes on after a tap on the card and Time counts down between redraws`;
  },

  // A tap on the beat, read in the words and numbers of edge 21: a Perfect near the first note (2000 ms), a Good late for the second (2625 ms), a stray between, a Miss for the third (3250 ms).
  "rg-beat": async (open, env) => {
    const { page, errors } = await open(adult());
    const tl = await startRhythm(page);
    await to(page, tl, 2030);
    await tapPad(page, tl);
    let s = await read(page);
    const delta1 = num(s.said.delta);
    if (s.said.judge !== "perfect" || !(delta1 >= -20 && delta1 <= 35)) throw new Error(`a tap 30 ms after the first note: ${JSON.stringify(s.said)}, expected a Perfect between 20 ms early and 35 ms late`);
    if (!/^Perfect, (\d+ ms (early|late)|on the beat)$/.test(s.said.text)) throw new Error(`the words of the Perfect: "${s.said.text}"`);
    expectEq(s.stats.slice(1), ["100", "1"], "Score and Streak after the Perfect");
    await to(page, tl, 2765);
    await tapPad(page, tl);
    s = await read(page);
    const delta2 = num(s.said.delta);
    if (s.said.judge !== "good" || !(delta2 >= 90 && delta2 <= 145)) throw new Error(`a tap 140 ms after the second note: ${JSON.stringify(s.said)}, expected a Good between 90 and 145 ms late`);
    if (!/^Good, \d+ ms late$/.test(s.said.text)) throw new Error(`the words of the Good: "${s.said.text}"`);
    expectEq(s.stats.slice(1), ["160", "2"], "Score and Streak after the Good (100 + 60)");
    await to(page, tl, 3000);
    await tapPad(page, tl);
    s = await read(page);
    expectEq([s.said.judge, s.said.delta, s.said.text], ["stray", "0", "No note, -30"], "the line after a tap between the notes");
    expectEq(s.stats.slice(1), ["130", "0"], "Score and Streak after the stray (160 - 30, the streak gone)");
    await to(page, tl, 3500);
    s = await read(page);
    expectEq([s.said.judge, s.said.text], ["miss", "Miss"], "the line after the third note passed untapped");
    expectEq(s.stats.slice(1), ["130", "0"], "Score and Streak after the Miss");
    expectEq(errors, [], "page errors");
    return `${env.w}x${env.h}@${env.dpr}: Perfect (${delta1} ms) 100/1, Good (${delta2} ms late) 160/2, "No note, -30" 130/0, then "Miss"`;
  },

  // The creature's hop: none after a stray, one after a Perfect (data-hop set and the face drawn anew on every hit), and under reduced motion the same but with the animation none (the word still shows).
  "rg-hop": async (open, env) => {
    const seen = {};
    for (const reduced of [false, true]) {
      const { page, errors } = await open(adult(), reduced ? { reducedMotion: "reduce" } : {});
      const tl = await startRhythm(page);
      await to(page, tl, 1000);
      await tapPad(page, tl);
      let s = await read(page);
      expectEq(s.said.judge, "stray", `the first tap, 1000 ms in (reduced motion ${reduced})`);
      expectEq([s.face !== null, s.face?.hop], [true, false], `the creature's face after a stray (reduced motion ${reduced}): there, and no hop`);
      await to(page, tl, 2030);
      await tapPad(page, tl);
      s = await read(page);
      expectEq(s.said.judge, "perfect", `the tap at the first note (reduced motion ${reduced})`);
      expectEq(s.face.hop, true, `the face after a Perfect (reduced motion ${reduced})`);
      const expectedAnim = reduced ? "none" : "rhythm-hop";
      expectEq(s.face.anim, expectedAnim, `the face's animation after a Perfect (reduced motion ${reduced})`);
      if (!/^Perfect/.test(s.said.text)) throw new Error(`the word after the Perfect (reduced motion ${reduced}): "${s.said.text}"`);
      // Every hit starts the hop again: the face is a new element (a mark put on this one is gone after the second hit; with the key dropped the same element stays and the animation would not restart).
      await page.evaluate(() => {
        document.querySelector(".rhythm-face").dataset.mark = "first";
      });
      s = await read(page);
      expectEq(s.face.mark, "first", `the mark put on the face before the second hit (reduced motion ${reduced})`);
      await to(page, tl, 2655);
      await tapPad(page, tl);
      s = await read(page);
      expectEq(s.said.judge, "perfect", `the tap at the second note (reduced motion ${reduced})`);
      expectEq([s.face.mark, s.face.hop], [null, true], `the face after the second Perfect (reduced motion ${reduced}): a new element, still hopping`);
      expectEq(errors, [], "page errors");
      seen[reduced ? "reduced" : "normal"] = s.face.anim;
    }
    return `${env.w}x${env.h}@${env.dpr}: no hop after a stray, a Perfect makes it (${seen.normal}) and a second one makes the face anew, under reduced motion the animation is ${seen.reduced} and the word still shows`;
  },

  // A page that becomes hidden stops the run, and becoming visible again does not start it (the card waits for a tap).
  "rg-hidden": async (open, env) => {
    const { page, context, errors } = await open(adult());
    const tl = await startRhythm(page);
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
    const frozen = { stats: s.stats, y: s.notes.map((n) => n.y) };
    expectEq(frozen, { stats: before.stats, y: before.notes.map((n) => n.y) }, "the numbers and the notes when the page was hidden (no fake time passed since the look before)");
    await run(page, 3000);
    s = await read(page);
    expectEq({ stats: s.stats, y: s.notes.map((n) => n.y) }, frozen, "the numbers and the notes after 3 more seconds while hidden");
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
    return `${env.w}x${env.h}@${env.dpr}: hidden ${real ? "(a real second page)" : "(the event made by hand: the headless page stayed visible)"} stopped the notes and the clock for 3 s, visible again waited for a tap, then Time went ${frozen.stats[0]} -> ${after.stats[0]}`;
  },

  // A real finger taps on the beat and the tap counts on the press, not the lift; a drag over the overlay moves nothing behind it (after a control: the same drag moves the plain Arena page).
  "rg-touch": async (open, env) => {
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
    await pickRhythm(page);
    await pressGo(page);
    const tl = { at: 20 };
    // a finger tap on the first note: a Perfect on the press
    await to(page, tl, 2030);
    await tapPad(page, tl);
    let s = await read(page);
    expectEq([s.said.judge, s.stats.slice(1)], ["perfect", ["100", "1"]], "a real finger tap at the first note");
    // a press at the second note that is held 300 ms: scored once on the press, the lift is no tap
    await to(page, tl, 2655);
    const pad = s.pad;
    const send = (type, points) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: points });
    await send("touchStart", [{ x: pad.x, y: pad.y }]);
    await sleep(30);
    const pressed = await read(page);
    expectEq([pressed.said.judge, pressed.stats.slice(1)], ["perfect", ["200", "2"]], "the press at the second note");
    await run(page, 300);
    await send("touchEnd", []);
    await sleep(60);
    const lifted = await read(page);
    expectEq(lifted.stats.slice(1), ["200", "2"], "Score and Streak after the finger lifted 300 ms later (one tap, the lift is no tap)");
    // drags over the numbers row and over the track: the page behind does not move (a drag that starts on the track is a tap on nothing: a stray)
    const statsBox = await page.evaluate(boxOf, { selector: ".train-stats", scroll: false });
    await drag(cdp, [statsBox.x, statsBox.y], [statsBox.x, statsBox.y - 150]);
    await drag(cdp, [statsBox.x, statsBox.y], [statsBox.x, statsBox.y + 150]);
    const afterStats = await page.evaluate(() => ({ y: window.scrollY }));
    expectEq([afterStats.y, await trainTop()], [behind, trainBox], "the page behind (scroll position, the Train button's top) after drags on the numbers row");
    await drag(cdp, [pad.x, pad.y], [pad.x, pad.y - 120]);
    s = await read(page);
    expectEq([s.said.judge, s.stats.slice(1)], ["stray", ["170", "0"]], "the drag that started on the track (a stray: 200 - 30, the streak gone)");
    expectEq([(await page.evaluate(() => window.scrollY)), await trainTop()], [behind, trainBox], "the page behind after the drag on the track");
    expectEq(errors, [], "page errors");
    return `${env.w}x${env.h}@${env.dpr}: control drag moved the Arena page ${top} -> ${moved}; behind the overlay it stayed at ${behind}; a finger tap scored a Perfect on the press and the lift 300 ms later changed nothing; a drag on the track is one stray`;
  },

  // A whole run: the first 20 notes tapped on the beat with a real touch, the rest left; the result card and the saved game say what the rules pay, Done puts the overlay away, and the next
  // start card counts one Spirit session and keeps the pick.
  "rg-run": async (open, env) => {
    const base = adult((c) => {
      c.bond = { xp: 295, chain: 0, at: 0 };
    });
    const before = JSON.parse(JSON.stringify(base));
    const { page, errors } = await open(base);
    const tl = await startRhythm(page);
    let k = 0;
    for (const note of LAND_ADULT) {
      await to(page, tl, note + 30);
      await tapPad(page, tl);
      k += 1;
      const s = await read(page);
      if (s.phase !== "playing") throw new Error(`the card is "${s.phase}" in the middle of the run, after note ${k}`);
      expectEq([s.said.judge, s.stats.slice(1)], ["perfect", [String(100 * k), String(k)]], `the line, Score and Streak after the tap on note ${k} (${note} ms)`);
    }
    for (let t = 0; t < 80_000; t += 500) {
      await page.clock.runFor(500);
      if ((await read(page)).phase === "done") break;
    }
    await page.locator(".train-lines").waitFor({ timeout: 5000 });
    const done = await read(page);
    expectEq(
      done.lines,
      ["Bronze: 2000 points, 20 notes hit", "Perfect 20, Good 0, missed 124, no note 0, best streak 20", "+1 Spirit", "+1 Discipline", "+10 Bond XP", "Bond level 2"],
      "the result card's lines (20 Perfects of 144 notes: 2000 of 14,400 is Bronze; a first session of the day; Bond XP 295 so any session reaches level 2)",
    );
    expectEq([done.focus, done.heading, done.dialog], ["Done", "Rhythm Grove", "Rhythm Grove"], "the focused button, the heading and the dialog's name on the result card");
    const fit = await page.evaluate(fitProblems, { iw: env.w, scope: "section.panel" });
    expectEq(fit.problems, [], "what does not fit on the result card");
    const saved = await savedGame(page);
    const c = saved.creature;
    expectEq(c.trained.spi, 1, "saved Spirit training");
    expectEq(c.trained.spd, undefined, "saved Speed training (untouched)");
    expectEq(c.training, { day: TODAY, sessions: { spi: 1 } }, "saved day count");
    expectEq(c.stats.discipline, before.creature.stats.discipline + 1, "saved discipline");
    expectEq(c.bond, { xp: 305, chain: 0, at: 0 }, "saved Bond (XP up, chain and last-pet time as they were)");
    expectEq(saved.log.filter((e) => /^Rhythm Grove:/.test(e.text)).map((e) => e.text), ["Rhythm Grove: bronze, 2000 points, 1 Spirit, 10 Bond XP"], "the dev log's Rhythm Grove lines");
    const doneBox = await page.evaluate(boxOf, { selector: "section.panel .btn.wide", scroll: false });
    if (doneBox.b > env.h + 0.5 || doneBox.t < -0.5) throw new Error(`the Done button is at ${Math.round(doneBox.t)} to ${Math.round(doneBox.b)} in a window ${env.h} tall`);
    await tapAt(page, boxCenter(doneBox));
    await run(page, 100);
    expectEq((await read(page)).phase, "closed", "the screen after Done");
    const again = await savedGame(page);
    expectEq([again.creature.trained.spi, again.creature.training, again.log.filter((e) => /^Rhythm Grove:/.test(e.text)).length], [1, { day: TODAY, sessions: { spi: 1 } }, 1], "the saved game after Done (paid once)");
    await openStartCard(page);
    const next = await read(page);
    expectEq([next.dialog, next.reward], ["Rhythm Grove", "Spirit: full reward, 2 of 3 today"], "the next card (the pick is kept; one Spirit session counted)");
    expectEq(errors, [], "page errors");
    return `${env.w}x${env.h}@${env.dpr}: 20 Perfects tapped, 2000 points on screen at every tap, Bronze: +1 Spirit, +1 Discipline, +10 Bond XP and level 2 saved once, the card fits, the next card counts 2 of 3`;
  },

  // The names a screen reader gets, and the keyboard: Enter on the focused pad is a tap on the beat.
  "rg-a11y": async (open, env) => {
    const { page, errors } = await open(adult());
    await openStartCard(page);
    let s = await read(page);
    expectEq([s.pickerRole, s.picker.map((b) => b.name)], [["group", "Training game"], ["Bug Catch", "Rhythm Grove"]], "the picker's role, name and buttons");
    await pickRhythm(page);
    await pressGo(page);
    const tl = { at: 20 };
    s = await read(page);
    expectEq(s.dialog, "Rhythm Grove", "the dialog's name while playing");
    await to(page, tl, 1000); // a note is on the track from 400 ms
    const names = await page.evaluate(() => {
      const pictures = [...document.querySelectorAll("[data-note] img, .rhythm-face img")];
      return {
        pad: document.querySelector("button.rhythm-pad")?.getAttribute("aria-label"),
        padTag: document.querySelector(".rhythm-pad")?.tagName,
        notePictures: document.querySelectorAll("[data-note] img").length > 0,
        facePictures: document.querySelectorAll(".rhythm-face img").length,
        alts: [...new Set(pictures.map((i) => i.getAttribute("alt")))],
        noteHidden: document.querySelector(".rhythm-line")?.getAttribute("aria-hidden"),
      };
    });
    expectEq(names, { pad: "Tap on the beat", padTag: "BUTTON", notePictures: true, facePictures: 1, alts: [""], noteHidden: "true" }, "the pad's name and kind, a picture of a note and one of the face (all with empty alt text), the line hidden from a screen reader");
    await page.locator("button.rhythm-pad").focus();
    await to(page, tl, 2030);
    await page.keyboard.press("Enter");
    await to(page, tl, tl.at + 20);
    s = await read(page);
    const d = num(s.said.delta);
    if (s.said.judge !== "perfect" || !(d >= -20 && d <= 35)) throw new Error(`Enter on the focused pad at the first note: ${JSON.stringify(s.said)}, expected a Perfect`);
    expectEq(s.stats.slice(1), ["100", "1"], "Score and Streak after Enter");
    expectEq([s.said.live, s.said.role], [null, null], "the line over the track is not a live region (four updates a second would flood a screen reader)");
    expectEq(errors, [], "page errors");
    return `${env.w}x${env.h}@${env.dpr}: the picker is a group named Training game, the dialog is named for the game, the pad is a button named "Tap on the beat", Enter on it was a Perfect (${d} ms), the line is not a live region`;
  },

  // Everything fits: the start card, the track with its notes, the creature and the Paused card, at nine windows.
  "rg-fit": async (open, env) => {
    const { page, errors } = await open(adult());
    await openStartCard(page);
    await pickRhythm(page);
    let fit = await page.evaluate(fitProblems, { iw: env.w, scope: "section.panel" });
    expectEq(fit.problems, [], "what does not fit on the start card");
    let s = await read(page);
    for (const b of s.picker) if (b.h < 43.5) throw new Error(`the picker button "${b.name}" is ${b.h.toFixed(1)} px tall`);
    const go = await page.evaluate(boxOf, { selector: "section.panel .btn.wide", scroll: false });
    if (go.h < 43.5 || go.b > env.h + 0.5) throw new Error(`the Go button is ${go.h.toFixed(1)} px tall and ends at ${Math.round(go.b)} in a window ${env.h} tall`);
    await pressGo(page);
    const tl = { at: 20 };
    await to(page, tl, 1500);
    fit = await page.evaluate(fitProblems, { iw: env.w, scope: "section.panel" });
    expectEq(fit.problems, [], "what does not fit while playing");
    s = await read(page);
    const f = s.track;
    const inside = (b, what) => {
      if (b.l < f.l - 0.5 || b.r > f.r + 0.5 || b.t < f.t - 0.5 || b.b > f.b + 0.5) throw new Error(`${what} (${Math.round(b.l)},${Math.round(b.t)} to ${Math.round(b.r)},${Math.round(b.b)}) is not inside the track (${Math.round(f.l)},${Math.round(f.t)} to ${Math.round(f.r)},${Math.round(f.b)})`);
    };
    s.notes.forEach((n, i) => inside(n, `note ${i + 1}`));
    inside(s.face, "the creature's face");
    inside(s.pad, "the pad");
    expectEq([Math.round(s.pad.w), Math.round(s.pad.h)], [Math.round(f.w), Math.round(f.h)], "the pad's size against the track's");
    for (const sel of [".train-buttons .btn:first-child", ".train-buttons .btn:last-child"]) {
      const b = await page.evaluate(boxOf, { selector: sel, scroll: false });
      if (b.h < 43.5) throw new Error(`${sel} is ${b.h.toFixed(1)} px tall`);
    }
    await tapAt(page, boxCenter(await page.evaluate(boxOf, { selector: ".train-buttons .btn", scroll: false })));
    await run(page, 100);
    s = await read(page);
    inside(s.pausedBox, "the Paused card");
    fit = await page.evaluate(fitProblems, { iw: env.w, scope: "section.panel" });
    expectEq(fit.problems, [], "what does not fit while paused");
    expectEq(errors, [], "page errors");
    return `${env.w}x${env.h}@${env.dpr}: start card, track (${Math.round(f.w)} px square) with ${s.notes.length} notes, the creature's face, the pad and the Paused card all fit; the picker, Go, Pause and Quit are at least 43.5 px tall`;
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
