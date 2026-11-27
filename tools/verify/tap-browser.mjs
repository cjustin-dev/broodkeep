// Browser checks for A3.4 Field tappables (docs/adult-a3-plan.md section 17, the edge cases as seen through the screen): a visit starts only in a field and in Adult Mode, the first thing turns up
// after the visit's first wait and not before, it is drawn where `data-tappables` says, a tap pays once (a double tap too, a reload pays nothing), each kind pays what the plan says, a bug opens a
// 10-second Bug Catch that pays Bond XP and no Speed, the hit box is at least 44 CSS pixels across, a finger that leaves a tappable pays nothing, an open panel hides them and holds their life,
// leaving the field or moving to another ends the visit, at most four show at once, Kid Mode and the home get none, and everything fits at 320, 360 and 390 wide (and on its side).
// Real touch events (Playwright's touchscreen and CDP Input.dispatchTouchEvent) on a mobile touch window against the built game (dist/).
//
// Run: node tap-browser.mjs --base http://127.0.0.1:4173 [--only id1,id2] [--sizes 360x640@2,390x844@3] [--modes kid,adult]
// Exit: 0 when no check failed and at least one ran; 1 when any FAIL; 2 when the script broke (a requested --only id ran zero times, an unknown id, a bad flag, or a crash outside a check).
// A check that throws or times out prints a FAIL line, never a crash.
//
// Time and draws. As in init-browser.mjs the fake clock is paused after load and moves only under `run`, and an init script installs a `Math.random` that reads `window.__q` (0.99 when empty) which
// the game keeps (its `tapRand` and `rand` are `Math.random` as it was when the game was built); after the page is up the global becomes a constant 0.99. A visit reads ONE draw from the queue when
// it starts (the creature's first step in a field), so a check starts the creature at HOME (no visit, the queue untouched), arms the queue, and takes it to the field through the Places tray.
// The visit's own generator is `makeRng(floor(draw x 2^32))` (mulberry32), so which kind comes first and when is a function of the draw: `firstOf` in tap-draws.mjs is a second, independent copy of
// that arithmetic written out with literals (the first wait is 20,000 + floor(r1 x 20,001) ms, the kind is r2 x 12 walked down sparkle 4, rustle 3, bug 3, pickup 2), and a check asks it for a
// draw that makes the kind it wants. What the page then shows (kind, time) is compared with it: a disagreement fails the check. The pays that depend on later draws are read from the same
// stream (`payDraws` in tap-draws.mjs: the draws a tap reads come after the visit's own): a sparkle's coin or material and a rustle's moment or gift are exact, and only what a found gift is (2 coins or
// 1 material, the initiatives' own draw) is accepted as either; the pickup's pay (1 of the field's material, and the header's chip) and the burst's pay are exact.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { drawFor, MATERIAL_IDS, MATERIAL_WORDS, payDraws } from "./tap-draws.mjs";

const require = createRequire(process.env.PLAYWRIGHT_FROM ?? join(homedir(), "homelab-dashboard", "package.json"));
const { chromium } = require("playwright");

const OUT = process.env.VERIFY_OUT ?? join(tmpdir(), "broodkeep-verify");
const SAVES = join(OUT, "saves");

const T = 1795359600000; // 2026-11-22T15:00:00Z, where the fake clock starts
const CHECK_TIMEOUT_MS = 900_000;

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
  "tap-appear": ["adult"],
  "tap-pay": ["adult"],
  "tap-pickup": ["adult"],
  "tap-rustle": ["adult"],
  "tap-burst": ["adult"],
  "tap-hit": ["adult"],
  "tap-finger": ["adult"],
  "tap-order": ["adult"],
  "tap-kid": ["kid"],
  "tap-gate": ["adult"],
  "tap-leave": ["adult"],
  "tap-four": ["adult"],
  "tap-fit": ["adult"],
};
const CHECK_SIZES = {
  "tap-appear": ONE,
  "tap-pay": ONE,
  "tap-pickup": ONE,
  "tap-rustle": ONE,
  "tap-burst": ONE,
  "tap-hit": THREE,
  "tap-finger": ONE,
  "tap-order": ONE,
  "tap-kid": ONE,
  "tap-gate": ONE,
  "tap-leave": ONE,
  "tap-four": ONE,
  "tap-fit": NINE,
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
// The living adult (Gravelhorn) at home in Adult Mode (or Kid Mode), with no coins and no Bond XP; `change` edits the creature.
function living(mode, change = () => {}) {
  const save = load(`adult-home-${mode}.json`);
  const c = save.creature;
  if (c.bond !== undefined || save.coins !== 0 || Object.keys(save.inventory ?? {}).length !== 0) throw new Error("the saved game already has Bond XP, coins or materials: the literals below assume none");
  change(c, save);
  return save;
}
const adult = (change) => living("adult", change);
const kid = (change) => living("kid", change);

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

// Runs in the page: what the canvas says about the ground. `data-tappables` is `kind:x,y,w,h` joined with `|`, in CSS pixels from the canvas's top left corner; the boxes come back in the window's
// pixels (the canvas's own box added), with their middle. The canvas is brought to the middle of the window first (the page scrolls as a whole at the small sizes).
function groundState() {
  const canvas = document.querySelector("canvas.room");
  canvas.scrollIntoView({ block: "center", behavior: "instant" });
  const rect = canvas.getBoundingClientRect();
  const raw = canvas.getAttribute("data-tappables");
  const boxes = (raw ?? "")
    .split("|")
    .filter((s) => s !== "")
    .map((s) => {
      const [kind, nums] = s.split(":");
      const [x, y, w, h] = nums.split(",").map(Number);
      return { kind, l: rect.left + x, t: rect.top + y, w, h, x: rect.left + x + w / 2, y: rect.top + y + h / 2, offX: x, offY: y }; // (l, t: the corner in the window; x, y: the middle in the window; offX, offY: the corner from the canvas's corner)
    });
  return {
    has: canvas.hasAttribute("data-tappables"),
    boxes,
    label: canvas.getAttribute("aria-label"),
    canvas: { l: rect.left, t: rect.top, w: rect.width, h: rect.height },
    note: document.querySelector(".reason")?.textContent ?? null,
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

// Runs in the page: what does not fit inside `scope` (see init-browser.mjs): the page does not scroll sideways, no element of the scope ends past the window's width `iw`, every text line sits in its box.
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

// Runs in the page: the device pixels of a rectangle of the canvas (CSS pixels from its top left corner) as a string.
function pixelsOf({ x, y, w, h }) {
  const canvas = document.querySelector("canvas.room");
  const k = canvas.width / canvas.getBoundingClientRect().width;
  const d = canvas.getContext("2d").getImageData(Math.round(x * k), Math.round(y * k), Math.round(w * k), Math.round(h * k)).data;
  return Array.from(d).join(",");
}

// Runs in the page: the Bug Catch overlay as it is.
function overlayState() {
  const q = (s) => document.querySelector(s);
  const box = (el) => {
    const r = el.getBoundingClientRect();
    return { l: r.left, t: r.top, w: r.width, h: r.height, x: r.left + r.width / 2, y: r.top + r.height / 2 };
  };
  const dialog = q('section.panel[aria-label="Bug Catch"]');
  const field = q(".train-field");
  return {
    open: !!dialog,
    phase: q(".train-lines") ? "done" : field ? "playing" : q(".train-reward") ? "ready" : dialog ? "other" : "closed",
    bugs: [...document.querySelectorAll(".bug")].map((el) => ({ ...box(el), kind: el.getAttribute("data-kind") })),
    stats: [...document.querySelectorAll(".train-stats b")].map((b) => b.textContent),
    lines: [...document.querySelectorAll(".train-lines li")].map((li) => li.textContent),
  };
}

// ---------- the page, the fingers ----------

// Opens the game with `save`; `queue` is what the game's draws will read (see the header). The clock is paused at T + 60 s and moves only under `run`.
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

const queued = (page) => page.evaluate(() => window.__q.length);

// Run the fake clock `ms` in frames of `frame` ms (the game's one-second timer and the animation frames both run on it).
async function run(page, ms, frame = 1000) {
  for (let left = ms; left > 0; left -= frame) await page.clock.runFor(Math.min(frame, left));
}
const runSecs = (page, s) => run(page, s * 1000);

const ground = (page) => page.evaluate(groundState);
const overlay = (page) => page.evaluate(overlayState);

// A real touch tap at a point (CSS pixels of the window); then `after` ms of the fake clock.
async function tapAt(page, [x, y], after = 100) {
  await page.touchscreen.tap(x, y);
  await sleep(30);
  if (after > 0) await run(page, after, 50);
}

// A finger that goes down at `from`, moves in `steps` small moves to `to` and lifts (real touch events).
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

// A mouse drag (the browser never takes a mouse drag over for scrolling; it does a finger's, in a one-line picture, and then fires `pointercancel`).
async function mouseDrag(page, from, to, steps = 8) {
  await page.mouse.move(from[0], from[1]);
  await page.mouse.down();
  await page.mouse.move(to[0], to[1], { steps });
  await page.mouse.up();
  await sleep(80);
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
const materialsOf = (save) => Object.values(save.inventory ?? {}).reduce((sum, n) => sum + n, 0);

// A tap on a button by its accessible name (scrolled into view first: the page scrolls as a whole).
async function tapButton(page, label, after = 100) {
  const box = await page.evaluate(boxOf, { selector: `button[aria-label="${label}"]`, scroll: true });
  if (!box) throw new Error(`no button "${label}" on the screen`);
  await tapAt(page, [box.x, box.y], after);
}

// The creature goes to a field through the Places tray (the Go button, then the field's button).
async function goTo(page, field) {
  await tapButton(page, "Go somewhere", 100);
  await tapButton(page, field, 300);
}

// Seconds of the fake clock (one tick at a time) until something is on the ground; throws after `limitS`.
async function untilShown(page, limitS = 60) {
  for (let s = 1; s <= limitS; s++) {
    await run(page, 1000);
    if ((await ground(page)).boxes.length > 0) return s;
  }
  throw new Error(`nothing on the ground in ${limitS} s of the fake clock`);
}

// Opens the game at home with a visit's draw queued, takes the creature to `field`, and runs until the first thing shows. Says how many seconds it took (counted from the tap on the field's
// button) and checks it against the draw's own wait: the first thing comes at the wait, from a second before it (the visit's first step also counts the tick before the creature arrived: a correct build can show it at ceil(wait) - 1 whole seconds) to four after it.
// `homeSeconds`: seconds the creature stays at home first (longer than the longest wait, for the check that proves nothing comes there).
async function visit(open, draws, { field = "Land", save = adult(), expect = null, homeSeconds = 0 } = {}) {
  const g = await open(save, draws.map((d) => d.draw));
  const before = await ground(g.page);
  expectEq([before.has, before.boxes.length], [false, 0], "the attribute with the creature at home");
  for (let s = 1; s <= homeSeconds; s++) {
    await run(g.page, 1000);
    const home = await ground(g.page);
    if (home.has) throw new Error(`data-tappables with the creature at home, ${s} s after the page opened`);
    if (home.label.includes("tap on the ground")) throw new Error(`the accessible name at home says there is something to tap, ${s} s after the page opened`);
  }
  expectEq(await queued(g.page), draws.length, "the draws queued before the creature went to a field (a visit at home reads none)");
  await goTo(g.page, field);
  const took = await untilShown(g.page);
  const first = draws[0];
  if (took < first.waitMs / 1000 - 1 || took > first.waitMs / 1000 + 4) throw new Error(`the first thing showed ${took} s after the creature reached the field: the draw's wait is ${first.waitMs} ms`);
  const s = await ground(g.page);
  expectEq(s.boxes.map((b) => b.kind), [expect ?? first.kind], "the kind that showed first (the draw says it, by its own arithmetic)");
  const k = s.boxes[0].w / 8; // CSS pixels in one game pixel
  const at = s.boxes[0];
  if (!first.tries.some(([x, y]) => Math.abs(at.offX - x * k) <= 0.6 && Math.abs(at.offY - y * k) <= 0.6)) {
    throw new Error(`the first thing is at (${at.offX}, ${at.offY}) CSS px from the canvas's corner; none of the draw's six tries puts it there (the first: ${first.x * k}, ${first.y * k})`);
  }
  expectEq(await queued(g.page), draws.length - 1, "the draws left in the queue (a visit reads one, once)");
  return { ...g, took, shown: s };
}

// The index of the draw's placement try that the page took: the first whose spot the box is at (a creature that has walked into the way of the first try makes a later one the one that was taken).
function tryOf(f, box) {
  const k = box.w / 8; // CSS pixels in one game pixel
  const i = f.tries.findIndex(([x, y]) => Math.abs(box.offX - x * k) <= 0.6 && Math.abs(box.offY - y * k) <= 0.6);
  if (i === -1) throw new Error(`the thing at (${box.offX}, ${box.offY}) is at none of the draw's six tries`);
  return i;
}

// ---------- the checks ----------

const CHECKS = {
  // A visit starts when the creature reaches a field, not before: at home nothing shows for 45 s (more than the longest first wait) and the draw is still queued; in the field the first sparkle shows at
  // its draw's wait (plus the clock's own second or two), the accessible name says so, the picture is where `data-tappables` says (the pixels of its box change when it is gone), the box is inside the
  // ground band, and it fades 90 s after it showed.
  "tap-appear": async (open) => {
    const f = drawFor("sparkle");
    const { page, errors, took, shown } = await visit(open, [f], { homeSeconds: 45 });
    const b = shown.boxes[0];
    const k = b.w / 8; // CSS pixels in one game pixel
    expectTrue(b.offX >= 12 * k - 0.5 && b.offX + b.w <= 116 * k + 0.5 && b.offY >= 96 * k - 0.5 && b.offY + b.h <= 117 * k + 0.5, `the box is inside the ground band (x 12 to 108, top y 96 to 109 game pixels): ${JSON.stringify(b)}`);
    expectTrue(shown.label.includes("Something to tap on the ground."), `the accessible name: ${shown.label}`);
    const rect = { x: b.offX, y: b.offY, w: b.w, h: b.h };
    const drawn = await page.evaluate(pixelsOf, rect);
    await runSecs(page, 89);
    expectTrue((await ground(page)).boxes.some((p) => p.offX === b.offX && p.offY === b.offY), "the first one is still there 89 s after it showed");
    await runSecs(page, 3);
    const later = await ground(page);
    expectTrue(!later.boxes.some((p) => p.offX === b.offX && p.offY === b.offY), "the first one is gone 92 s after it showed");
    const gone = await page.evaluate(pixelsOf, rect);
    const a = drawn.split(",");
    const z = gone.split(",");
    const differing = a.filter((v, i) => v !== z[i]).length / 4;
    if (differing < 8) throw new Error(`only ${differing} pixels of the box changed when the thing faded: it was not drawn where data-tappables says`);
    expectEq(errors, [], "page errors");
    return `the first sparkle showed ${took} s after the creature reached the field (its draw's wait is ${f.waitMs} ms), and ${differing} pixels of its box changed when it faded`;
  },

  // A tap pays once: a sparkle pays 1 coin or 1 material, says so, goes; a second tap at once pays nothing; a reload pays nothing and shows nothing at once (a visit is not saved).
  "tap-pay": async (open) => {
    const f = drawFor("sparkle", 26_000, 0, (d) => d.pays[0] >= 0.5); // a draw whose sparkle pays a coin (the draws a tap reads: tap-draws.mjs, payDraws)
    const { page, errors, shown } = await visit(open, [f]);
    const b = shown.boxes[0];
    const pays = payDraws(f.draw, tryOf(f, b));
    const material = pays[0] < 0.5;
    const id = MATERIAL_IDS[Math.floor(pays[1] * MATERIAL_IDS.length)];
    const before = await savedGame(page);
    await tapAt(page, [b.x, b.y], 0);
    await tapAt(page, [b.x, b.y], 100); // a second tap at the same spot, with no clock between
    const s = await ground(page);
    expectTrue(!s.boxes.some((p) => p.offX === b.offX && p.offY === b.offY), "the sparkle is gone after a tap");
    expectEq(s.note, material ? `Found some ${MATERIAL_WORDS[id]}.` : "Found 1 coin.", "the note after a sparkle (the draw says which it pays)");
    const after = await savedGame(page);
    expectEq([after.coins - before.coins, materialsOf(after) - materialsOf(before), (after.inventory?.[id] ?? 0) - (before.inventory?.[id] ?? 0)], material ? [0, 1, 1] : [1, 0, 0], "the coins, the materials and the drawn material a sparkle paid (the draw says which: once)");
    const log = after.log.filter((e) => /^Found /.test(e.text));
    expectEq(log.length, 1, "the log lines 'Found ...' after two taps");
    await page.reload();
    await page.locator("canvas.room").waitFor({ timeout: 20000 });
    await page.clock.runFor(200);
    const reloaded = await savedGame(page);
    expectEq([reloaded.coins, materialsOf(reloaded), reloaded.log.length], [after.coins, materialsOf(after), after.log.length], "the saved game after a reload (a visit pays nothing and is not saved)");
    expectEq((await ground(page)).has, false, "the attribute right after the reload (a visit is not saved)");
    expectEq(errors, [], "page errors");
    return `a sparkle paid ${material ? `1 ${id}` : "1 coin"} once (as its draw says), a second tap at the same spot paid nothing, a reload paid nothing`;
  },

  // Each field's pickup pays 1 of its own material, named: Land's acorn is Wood, Water's shell Fish, Sky's crystal Stone; the header's material chip shows it.
  "tap-pickup": async (open) => {
    const f = drawFor("pickup", 30_000);
    const wanted = [
      ["Land", "wood", "Found an acorn.", "1 Wood"],
      ["Water", "fish", "Found a shell.", "1 Fish"],
      ["Sky", "stone", "Found a crystal.", "1 Stone"],
    ];
    const seen = [];
    for (const [field, material, note, chip] of wanted) {
      const { page, errors, shown } = await visit(open, [f], { field });
      const b = shown.boxes[0];
      await tapAt(page, [b.x, b.y], 100);
      expectEq((await ground(page)).note, note, `the note of a pickup in ${field}`);
      const saved = await savedGame(page);
      expectEq([saved.inventory, saved.coins], [{ [material]: 1 }, 0], `the saved materials and coins after a pickup in ${field}`);
      // what the player sees: the header's material chip (the spec's acceptance; the saved game alone does not show it)
      const chips = await page.evaluate(() => [...document.querySelectorAll(".chip.tight[aria-label]")].map((el) => el.getAttribute("aria-label")));
      expectEq(chips.filter((c) => /^\d+ (Fiber|Herbs|Wood|Fish|Stone)$/.test(c)), [chip], `the material chips in the header after a pickup in ${field}`);
      expectEq(errors, [], `page errors in ${field}`);
      seen.push(`${field}: ${material}`);
    }
    return seen.join(", ");
  },

  // A rustle is a moment together (+3 Bond XP) or a found gift (coins or a material, as an initiative's gift pays), as its draw says: both are run, one visit each.
  "tap-rustle": async (open) => {
    const outcomes = [];
    for (const wantMoment of [true, false]) {
      const f = drawFor("rustle", 26_000, 0, (d) => d.pays[0] >= 0.5 === wantMoment); // a draw whose rustle is a moment together, then one whose rustle is a gift (the draws a tap reads: payDraws)
      const { page, errors, shown } = await visit(open, [f]);
      const b = shown.boxes[0];
      const moment = payDraws(f.draw, tryOf(f, b))[0] >= 0.5;
      const before = await savedGame(page);
      await tapAt(page, [b.x, b.y], 100);
      const s = await ground(page);
      const after = await savedGame(page);
      const d = { xp: xpOf(after) - xpOf(before), coins: after.coins - before.coins, materials: materialsOf(after) - materialsOf(before) };
      if (moment) {
        expectEq([d, s.note], [{ xp: 3, coins: 0, materials: 0 }, "A moment together: +3 Bond XP."], "a rustle whose draw says a moment together (+3 Bond XP, nothing else)");
      } else {
        // (what the gift is, 2 coins or 1 material, is the initiatives' own draw: either, with its note, and no Bond XP)
        const coins = d.xp === 0 && d.coins === 2 && d.materials === 0 && s.note === "Found 2 coins.";
        const material = d.xp === 0 && d.coins === 0 && d.materials === 1 && /^Found some (fiber|herbs|wood|fish|stone)\.$/.test(s.note ?? "");
        expectTrue(coins || material, `a rustle whose draw says a found gift must pay 2 coins or 1 material, with its note, and no Bond XP: ${JSON.stringify({ d, note: s.note })}`);
      }
      expectTrue(!(await ground(page)).boxes.some((p) => p.offX === b.offX && p.offY === b.offY), "the rustle is gone after a tap");
      expectEq(errors, [], "page errors");
      outcomes.push(moment ? "+3 Bond XP" : d.coins === 2 ? "2 coins" : "1 material");
    }
    return `a rustle paid ${outcomes.join(" and then ")} once each (as their draws say)`;
  },

  // A bug opens a Bug Catch at once that lasts 10 seconds (the check allows 9.8 to 10.7 s from the tap: literals fitted to one run on the clean build, scratch-only); with no catch it pays nothing; with catches it pays Bond XP, one for each,
  // and no Speed, no Discipline, no day count (the cap of 6 is the unit tests': two catches are all this check makes).
  "tap-burst": async (open) => {
    const f = drawFor("bug");
    const run1 = await visit(open, [f]);
    const { page, errors, shown } = run1;
    const b = shown.boxes[0];
    const before = await savedGame(page);
    await tapAt(page, [b.x, b.y], 100);
    const o = await overlay(page);
    expectEq([o.open, o.phase], [true, "playing"], "the overlay right after a tap on a bug (open, playing: no start card)");
    // two catches (taps on bugs as they come; a normal bug scores 10 and the first two have no streak bonus, so the score says how many were caught), then the rest of the 10 seconds
    let caught = 0;
    for (let t = 0; t < 10_000 && caught < 2; t += 250) {
      await page.clock.runFor(250);
      const s = await overlay(page);
      if (s.phase !== "playing") break;
      const bug = s.bugs.find((x) => x.kind === "bug");
      if (!bug) continue;
      await tapAt(page, [bug.x, bug.y], 50);
      caught = Number((await overlay(page)).stats[1]) / 10;
    }
    expectTrue(caught >= 1, "the check caught at least one bug");
    let left = 12_000;
    while ((await overlay(page)).phase === "playing" && left > 0) {
      await page.clock.runFor(250);
      left -= 250;
    }
    const done = await overlay(page);
    expectEq(done.phase, "done", "the overlay after the 10 seconds");
    expectEq(done.lines, [`Caught ${caught} ${caught === 1 ? "bug" : "bugs"}.`, `+${caught} Bond XP`], "the result card's lines (one Bond XP for each bug, no Speed line)");
    expectTrue(!done.lines.some((l) => /Speed|Discipline/.test(l)), "no Speed or Discipline line");
    const saved = await savedGame(page);
    expectEq(xpOf(saved) - xpOf(before), caught, "the Bond XP the burst paid");
    expectEq([saved.creature.trained?.spd ?? 0, saved.creature.training], [before.creature.trained?.spd ?? 0, before.creature.training], "Speed and the day's training count (a burst pays neither)");
    expectEq(saved.log.filter((e) => /^Bug burst:/.test(e.text)).length, 1, "the dev log's 'Bug burst' lines");
    // the card's Done button closes it
    const doneBtn = await page.evaluate(boxOf, { selector: "section.panel .btn.wide", scroll: false });
    if (!doneBtn) throw new Error("no Done button on the result card");
    await tapAt(page, [doneBtn.x, doneBtn.y], 300);
    expectEq((await overlay(page)).open, false, "the overlay after Done");
    // a second bug with no catches pays nothing
    const g = await visit(open, [drawFor("bug", 26_000, 1)]);
    const base = await savedGame(g.page);
    await tapAt(g.page, [g.shown.boxes[0].x, g.shown.boxes[0].y], 100);
    let ms = 100; // (the tap's own 100 ms, then steps of 100 ms until the card comes)
    while ((await overlay(g.page)).phase === "playing" && ms < 20_000) {
      await g.page.clock.runFor(100);
      ms += 100;
    }
    if (ms < 9_800 || ms > 10_700) throw new Error(`the burst with no catch ended ${ms} ms after the tap: it lasts 10,000 ms`);
    expectEq((await overlay(g.page)).lines, ["No bugs caught."], "the result card with no catch");
    const none = await savedGame(g.page);
    expectEq([xpOf(none), none.log.filter((e) => /^Bug burst:/.test(e.text)).length, none.coins, materialsOf(none)], [xpOf(base), 0, base.coins, materialsOf(base)], "the saved game after a burst with no catch (nothing paid, no log line)");
    expectEq([errors, g.errors], [[], []], "page errors");
    return `a burst of ${caught} catch(es) paid ${caught} Bond XP and no Speed; one with none lasted ${ms} ms and paid nothing`;
  },

  // The hit box is at least 44 CSS pixels across (the picture widened by 8 game pixels each side): a tap just inside its edge, on the left and below, pays; a tap just outside does not.
  "tap-hit": async (open, env) => {
    const f = drawFor("sparkle");
    // the measure, and a tap just inside on the left
    const a = await visit(open, [f]);
    const b = a.shown.boxes[0];
    const pad = b.w; // 8 game pixels as CSS pixels (the box is 8 game pixels across)
    expectTrue(b.w + 2 * pad >= 44, `the hit box is ${b.w + 2 * pad} CSS pixels across, under 44`);
    const savedA = await savedGame(a.page);
    await tapAt(a.page, [b.l - pad + 1.5, b.y], 100);
    const sa = await ground(a.page);
    expectTrue(!sa.boxes.some((p) => p.offX === b.offX && p.offY === b.offY), `a tap 1.5 CSS px inside the hit box on the left (${b.l - pad + 1.5}, ${b.y}) did not take it`);
    const afterA = await savedGame(a.page);
    expectEq(afterA.coins + materialsOf(afterA), savedA.coins + materialsOf(savedA) + 1, "the pay of the tap inside on the left");
    // just outside on the left: not taken
    const o = await visit(open, [f]);
    const ob = o.shown.boxes[0];
    const baseO = await savedGame(o.page);
    await tapAt(o.page, [ob.l - pad - 1.5, ob.y], 100);
    expectTrue((await ground(o.page)).boxes.some((p) => p.offX === ob.offX && p.offY === ob.offY), "a tap 1.5 CSS px outside the hit box on the left took it");
    const afterO = await savedGame(o.page);
    expectEq([afterO.coins, materialsOf(afterO)], [baseO.coins, materialsOf(baseO)], "the pay of a tap outside on the left");
    // just inside below, and just outside below
    const d = await visit(open, [f]);
    const db = d.shown.boxes[0];
    const baseD = await savedGame(d.page);
    await tapAt(d.page, [db.x, db.t + db.h + pad - 1.5], 100);
    expectTrue(!(await ground(d.page)).boxes.some((p) => p.offX === db.offX && p.offY === db.offY), "a tap 1.5 CSS px inside the hit box below did not take it");
    const afterD = await savedGame(d.page);
    expectEq(afterD.coins + materialsOf(afterD), baseD.coins + materialsOf(baseD) + 1, "the pay of the tap inside below");
    const u = await visit(open, [f]);
    const ub = u.shown.boxes[0];
    const baseU = await savedGame(u.page);
    await tapAt(u.page, [ub.x, ub.t + ub.h + pad + 1.5], 100);
    expectTrue((await ground(u.page)).boxes.some((p) => p.offX === ub.offX && p.offY === ub.offY), "a tap 1.5 CSS px outside the hit box below took it");
    const afterU = await savedGame(u.page);
    expectEq([afterU.coins, materialsOf(afterU)], [baseU.coins, materialsOf(baseU)], "the pay of a tap outside below");
    expectEq([a.errors, o.errors, d.errors, u.errors], [[], [], [], []], "page errors");
    return `${env.w}x${env.h}@${env.dpr}: the box is ${b.w} CSS px, the hit box ${b.w + 2 * pad}: a tap 1.5 px inside (left and below) took it, 1.5 px outside did not`;
  },

  // A finger that goes down on it and lifts elsewhere pays nothing (a finger's drag here is taken over by the page's scroll: pointercancel; a mouse drag is not), a hold with no movement pays at
  // the lift and does not pet (no Bond XP).
  "tap-finger": async (open) => {
    const f = drawFor("sparkle");
    const { page, cdp, errors, shown } = await visit(open, [f]);
    const b = shown.boxes[0];
    const dx = b.x > shown.canvas.l + shown.canvas.w / 2 ? -70 : 70; // away from the nearer edge of the picture
    const base = await savedGame(page);
    await drag(cdp, [b.x, b.y], [b.x + dx, b.y - 60]);
    await run(page, 100, 50);
    const sa = await savedGame(page);
    expectEq([sa.coins, materialsOf(sa)], [base.coins, materialsOf(base)], "the pay after a finger left the sparkle and lifted elsewhere");
    expectTrue((await ground(page)).boxes.some((p) => p.offX === b.offX && p.offY === b.offY), "the sparkle after the finger's drag");
    await mouseDrag(page, [b.x, b.y], [b.x + dx, b.y - 60]);
    await run(page, 100, 50);
    const sb = await savedGame(page);
    expectEq([sb.coins, materialsOf(sb)], [base.coins, materialsOf(base)], "the pay after a mouse drag that left the sparkle and let go elsewhere");
    expectTrue((await ground(page)).boxes.some((p) => p.offX === b.offX && p.offY === b.offY), "the sparkle after the mouse drag");
    // a hold of 1.5 s with no movement: the petting timer would pay Bond XP; a tappable's hold takes it at the lift
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: b.x, y: b.y }] });
    await run(page, 1500, 50);
    expectTrue((await ground(page)).boxes.some((p) => p.offX === b.offX && p.offY === b.offY), "the sparkle while the finger is still down on it");
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await run(page, 100, 50);
    const sc = await savedGame(page);
    expectEq(sc.coins + materialsOf(sc), base.coins + materialsOf(base) + 1, "the pay of a hold on the sparkle (taken at the lift, once)");
    expectEq(xpOf(sc), xpOf(base), "the Bond XP after a hold on a tappable (no petting)");
    expectEq(errors, [], "page errors");
    return "a finger and a mouse that left the sparkle paid nothing; a hold on it paid at the lift and did not pet";
  },

  // A touch where a tappable's hit box and the creature's own zone overlap goes to the tappable, and does not poke or pet: a sparkle just beside the creature (first try at x 92 to 96, its hit box from x 84; that the creature's zone reaches there is ASSUMED from where the saved adult stands, not measured: if it does not, the check proves the pay but not the order),
  // tapped 1.5 CSS pixels inside the hit box's left edge, pays and leaves the Bond XP as it was.
  "tap-order": async (open) => {
    const f = drawFor("sparkle", 26_000, 0, (d) => d.x >= 92 && d.x <= 96);
    const { page, errors, shown } = await visit(open, [f]);
    const b = shown.boxes[0];
    const before = await savedGame(page);
    await tapAt(page, [b.l - b.w + 1.5, b.y], 100);
    expectTrue(!(await ground(page)).boxes.some((p) => p.offX === b.offX && p.offY === b.offY), "the sparkle is gone after a tap in its hit box beside the creature");
    const after = await savedGame(page);
    expectEq(after.coins + materialsOf(after), before.coins + materialsOf(before) + 1, "the pay of a tap in the hit box beside the creature (a poke would pay no sparkle)");
    expectEq(xpOf(after), xpOf(before), "the Bond XP after that tap (a poke or a pet would pay)");
    expectEq(errors, [], "page errors");
    return `a tap ${b.w - 1.5} CSS px left of the sparkle's picture (x ${f.x} game px, beside the creature) took the sparkle`;
  },

  // Kid Mode gets none: the attribute is absent at home and in a field for 120 s, and the accessible name says nothing about the ground.
  "tap-kid": async (open) => {
    const { page, errors } = await open(kid(), []);
    for (const where of ["home", "Land"]) {
      if (where !== "home") await goTo(page, where);
      for (let s = 1; s <= 120; s++) {
        await run(page, 1000);
        const g = await ground(page);
        if (g.has) throw new Error(`data-tappables in Kid Mode (${where}, second ${s})`);
        if (g.label.includes("tap on the ground")) throw new Error(`the accessible name in Kid Mode says there is something to tap (${where}, second ${s})`);
      }
    }
    expectEq(errors, [], "page errors");
    return "Kid Mode: no attribute and no words for 120 s at home and 120 s in a field";
  },

  // A panel hides them and holds their life: with one showing, the Creature Book open for 130 s (more than its 90 s life) shows none, and when it is closed the same one is there and can be taken. A
  // tap on the ground where it was, with the panel open, is not possible (the panel covers it), so the held life is the proof.
  "tap-gate": async (open) => {
    const f = drawFor("sparkle");
    const { page, errors, shown } = await visit(open, [f]);
    const b = shown.boxes[0];
    const book = await page.evaluate(boxOf, { selector: 'button[aria-label^="Creature Book"]', scroll: true }); // (the Adult header's label goes on with the percent found)
    if (!book) throw new Error("no Creature Book button on the screen");
    await tapAt(page, [book.x, book.y], 300);
    expectTrue(await page.evaluate(() => !!document.querySelector('section.panel[aria-label="Creature Book"]')), "the Creature Book panel is open");
    for (let s = 1; s <= 130; s++) {
      await run(page, 1000);
      if ((await ground(page)).has) throw new Error(`data-tappables ${s} s after the Creature Book opened`);
    }
    const close = await page.evaluate(boxOf, { selector: "section.panel .panel-head button", scroll: false });
    if (!close) throw new Error("no Close button on the Creature Book");
    await tapAt(page, [close.x, close.y], 100);
    await run(page, 1000);
    const back = await ground(page);
    expectTrue(back.boxes.some((p) => p.offX === b.offX && p.offY === b.offY), `the first one after the panel closed (its 90 s life was held through 130 s): ${JSON.stringify(back.boxes)}`);
    const before = await savedGame(page);
    await tapAt(page, [b.x, b.y], 100);
    const after = await savedGame(page);
    expectEq(after.coins + materialsOf(after), before.coins + materialsOf(before) + 1, "the pay of a tap after the panel closed");
    expectEq(errors, [], "page errors");
    return "a panel open 130 s showed none and held the first one's life: it was there after, and paid";
  },

  // Leaving ends the visit: going home takes everything off the ground at once; another field starts a new visit with a draw of its own (a rustle in Water after a sparkle in Land); a nap ends it too.
  "tap-leave": async (open) => {
    const first = drawFor("sparkle");
    const second = drawFor("rustle");
    const { page, errors } = await visit(open, [first, second]);
    await goTo(page, "Water");
    const gone = await ground(page);
    expectEq([gone.has, gone.boxes.length], [false, 0], "the ground right after the creature moved to another field");
    const took = await untilShown(page);
    expectEq((await ground(page)).boxes.map((b) => b.kind), [second.kind], "the first thing in the second visit (its own draw: a rustle)");
    if (took < second.waitMs / 1000 - 1 || took > second.waitMs / 1000 + 4) throw new Error(`the second visit's first thing showed ${took} s after the move: its draw's wait is ${second.waitMs} ms`);
    expectEq(await queued(page), 0, "the draws left after the second visit started");
    await goTo(page, "Home");
    const home = await ground(page);
    expectEq([home.has, home.boxes.length], [false, 0], "the ground right after the creature went home");
    await run(page, 120_000, 1000);
    expectEq((await ground(page)).has, false, "the ground 120 s after the creature went home");
    // a nap in a field: a new visit, then a nap
    await page.evaluate((q) => window.__q.push(q), drawFor("sparkle").draw);
    await goTo(page, "Land");
    await untilShown(page);
    await tapButton(page, "Nap", 300);
    expectEq((await ground(page)).has, false, "the ground right after the creature went to nap");
    expectEq(errors, [], "page errors");
    return `a move to another field emptied the ground and a second draw made a ${second.kind} after ${took} s; home and a nap emptied it`;
  },

  // At most four show at once and the ones that show are apart from each other (the ground band is the unit tests' and tap-fit's); over 200 s at least four different ones come.
  "tap-four": async (open) => {
    const f = drawFor("sparkle");
    const g = await open(adult(), [f.draw]);
    const { page, errors } = g;
    await goTo(page, "Land");
    const seen = new Map();
    let most = 0;
    let apart = true;
    for (let s = 1; s <= 200; s++) {
      await run(page, 1000);
      const st = await ground(page);
      most = Math.max(most, st.boxes.length);
      for (const b of st.boxes) seen.set(`${b.kind}:${b.offX},${b.offY}`, true);
      const gap = st.boxes[0] ? st.boxes[0].w / 4 : 0; // 2 game pixels
      for (let i = 0; i < st.boxes.length; i++) {
        for (let j = i + 1; j < st.boxes.length; j++) {
          const a = st.boxes[i];
          const b = st.boxes[j];
          const dx = Math.max(a.l - (b.l + b.w), b.l - (a.l + a.w));
          const dy = Math.max(a.t - (b.t + b.h), b.t - (a.t + a.h));
          if (Math.max(dx, dy) < gap - 0.5) apart = false;
        }
      }
    }
    expectTrue(most <= 4, `${most} things showed at once`);
    expectTrue(apart, "two pictures were closer than 2 game pixels");
    if (seen.size < 4) throw new Error(`only ${seen.size} different things in 200 s (at 40 s apart there are at least four)`);
    expectEq(errors, [], "page errors");
    return `${seen.size} different things in 200 s, ${most} at most at once`;
  },

  // The note of a sparkle and the Bug Catch result card fit at every window size, and the picture's box is inside the canvas.
  "tap-fit": async (open, env) => {
    const f = drawFor("sparkle");
    const a = await visit(open, [f]);
    const b = a.shown.boxes[0];
    expectTrue(b.offX >= 0 && b.offY >= 0 && b.offX + b.w <= a.shown.canvas.w + 0.5 && b.offY + b.h <= a.shown.canvas.h + 0.5, `the picture's box is inside the canvas: ${JSON.stringify(b)} in ${JSON.stringify(a.shown.canvas)}`);
    await tapAt(a.page, [b.x, b.y], 50);
    const noteFit = await a.page.evaluate(fitProblems, { iw: env.w, scope: ".reason-box" });
    expectEq(noteFit.problems, [], "the note's fit");
    if (noteFit.lines < 1) throw new Error("the note fit check measured no text line");
    const g = await visit(open, [drawFor("bug")]);
    await tapAt(g.page, [g.shown.boxes[0].x, g.shown.boxes[0].y], 100);
    let guard = 0;
    while ((await overlay(g.page)).phase === "playing" && guard++ < 60) await g.page.clock.runFor(250);
    const card = await g.page.evaluate(fitProblems, { iw: env.w, scope: "section.panel" });
    expectEq(card.problems, [], "the result card's fit");
    if (card.lines < 2) throw new Error(`the result card fit check measured ${card.lines} text lines`);
    expectEq([a.errors, g.errors], [[], []], "page errors");
    return `${env.w}x${env.h}@${env.dpr}: the note (${noteFit.lines} lines) and the result card (${card.lines} lines, ${card.elements} elements) fit, the picture is inside the canvas`;
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
