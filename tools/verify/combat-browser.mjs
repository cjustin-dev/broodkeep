// Browser checks for A4.3 Timed combat (docs/adult-a4-plan.md section 10, edge cases 9 to 13 and 18 to 20): the timing pad that opens when Attack, Guard or Special is chosen, the word each tap earns,
// a tap in the middle of the ring, the keyboard, a fight left with the pad open, the one sulk, the numbers that wait for the blows, the wild creature's shown move, Kid Mode's untouched Arena, the result
// card that the winning tap must not put away, the notes that sit under the health bars, and everything fitting at 320, 360 and 390 wide (pixel ratios 1 and 2, and 3 at 390) and on its side (740 x 360 and 844 x 390). Real touch taps and a real keyboard against the built game (dist/).
//
// Run: node combat-browser.mjs --base http://127.0.0.1:4176 [--only id1,id2] [--sizes 360x640@2,390x844@3] [--modes kid,adult]
// Exit: 0 when no check failed and at least one ran; 1 when any FAIL; 2 when the script broke (a requested --only id ran zero times, an unknown id, a bad flag, or a crash outside a check). A check that
// throws or times out prints a FAIL line, never a crash.
//
// The saves come from gen-saves (saves/adult-home-<mode>.json: Gravelhorn, a Land adult) with changes put on the creature here. Expected values are literals from the plan, not read from the game:
//   - the clock is frozen at T (2026-11-22T15:00:00Z) and moves only under runFor; the pad reads performance.now() when it opens and when it is tapped, so a tap k ms after the ring meets the circle
//     is exactly k ms on the fake clock (no lag enters: the run clock of Rhythm Grove is not used). The ring meets the circle 900 ms after the pad opens; the pad closes by itself 200 ms later;
//   - a tap within 80 ms of the target is Perfect, within 160 ms Good, else Normal; the words are "Perfect attack", "Good attack", "Early" and "Late", and nothing for a pad nobody tapped;
//   - the long fights are played with a creature that has 5,000 trained Vitality (so the wild creature cannot knock it out in any number of rounds here) against the boss rung (so the wild creature
//     cannot be knocked out by an untrained attacker in them either): a round can be played again and again;
//   - a round plays back in under 3 seconds and a note stays over the room 6 seconds, so 6.5 seconds after a tap the picture and the note are clear again.
// Math.random is 0.99 for the whole page, so the creature stands still.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

const require = createRequire(process.env.PLAYWRIGHT_FROM ?? join(homedir(), "homelab-dashboard", "package.json"));
const { chromium } = require("playwright");

const OUT = process.env.VERIFY_OUT ?? join(tmpdir(), "broodkeep-verify");
const SAVES = join(OUT, "saves");

const T = 1795359600000; // 2026-11-22T15:00:00Z, frozen
const CHECK_TIMEOUT_MS = 900_000;
const RING_MS = 900; // from the pad opening to the ring meeting the circle (combatTuning.timed.ringMs)
const CLOSE_MS = 1100; // the pad closes by itself (ring + the Good window + 40)
const SULK = "Sulking: discipline too low. Training helps.";

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
  "cb-pad": ["adult"],
  "cb-words": ["adult"],
  "cb-early": ["adult"],
  "cb-keyboard": ["adult"],
  "cb-double": ["adult"],
  "cb-stale": ["adult"],
  "cb-leave": ["adult"],
  "cb-sulk": ["adult"],
  "cb-numbers": ["adult"],
  "cb-intent": ["adult"],
  "cb-kid": ["kid"],
  "cb-result": ["adult"],
  "cb-notes": ["adult"],
  "cb-layout": ["adult"],
};
const CHECK_SIZES = {
  "cb-pad": THREE,
  "cb-words": ONE,
  "cb-early": ONE,
  "cb-keyboard": ONE,
  "cb-double": ONE,
  "cb-stale": ONE,
  "cb-leave": ONE,
  "cb-sulk": ONE,
  "cb-numbers": ONE,
  "cb-intent": ONE,
  "cb-kid": THREE,
  "cb-result": ONE,
  "cb-notes": THREE,
  "cb-layout": NINE,
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
// The living adult at home (Gravelhorn, Land) in Adult Mode; `change` edits the creature. The literals below assume it has no training and has not fought.
function adult(change = () => {}) {
  const save = load("adult-home-adult.json");
  const c = save.creature;
  if (Object.values(c.trained ?? {}).some((n) => n !== 0) || c.rung !== undefined || c.hp !== undefined) throw new Error("the saved adult already has training, a rung or a hurt: the literals below assume none");
  change(c, save);
  return save;
}
// A creature for fights that go on: 5,000 trained Vitality, at the boss rung, and a discipline of 100 so it never sulks.
const bruiser = (c) => {
  c.trained = { vit: 5000 };
  c.rung = 5;
  c.stats.discipline = 100; // never sulks (the sulk check sets its own)
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

// Runs in the page: what the arena bar shows.
function snap() {
  const q = (s) => document.querySelector(s);
  const box = (el) => {
    const r = el.getBoundingClientRect();
    return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height, x: (r.left + r.right) / 2, y: (r.top + r.bottom) / 2, top: r.top + window.scrollY };
  };
  const text = (s) => (q(s) ? q(s).textContent.replace(/\s+/g, " ").trim() : null);
  const nums = text(".arena-nums");
  const m = nums ? /^You (\d+)\/(\d+)Foe (\d+)\/(\d+)Special (\d+)\/(\d+)$/.exec(nums.replace(/ (?=Foe|Special)/g, "")) : null;
  const pad = q(".timing-pad");
  const ring = q(".timing-ring");
  return {
    nums,
    hp: m ? { me: Number(m[1]), meMax: Number(m[2]), foe: Number(m[3]), foeMax: Number(m[4]), meter: Number(m[5]) } : null,
    intent: q(".arena-intent") ? { text: text(".arena-intent"), rendered: q(".arena-intent").innerText.replace(/\s+/g, " ").trim(), visibility: getComputedStyle(q(".arena-intent")).visibility } : null,
    note: text(".reason"),
    noteBox: q(".reason") ? box(q(".reason")) : null,
    pad: pad ? { ...box(pad), label: pad.getAttribute("aria-label"), word: text(".timing-word"), focused: document.activeElement === pad } : null,
    focus: document.activeElement?.getAttribute?.("aria-label") ?? document.activeElement?.tagName ?? null,
    ring: ring ? { ...box(ring), name: getComputedStyle(ring).animationName, duration: getComputedStyle(ring).animationDuration } : null,
    target: q(".timing-target") ? box(q(".timing-target")) : null,
    bar: q(".fightbtns") ? { ...box(q(".fightbtns")), timed: q(".fightbtns").classList.contains("timed") } : null,
    buttons: [...document.querySelectorAll(".fightbtns .btn")].map((b) => ({ label: b.getAttribute("aria-label"), disabled: b.disabled, h: b.getBoundingClientRect().height, w: b.getBoundingClientRect().width, l: b.getBoundingClientRect().left, r: b.getBoundingClientRect().right })),
    canvas: q("canvas.room") ? box(q("canvas.room")) : null,
    fightButton: !!q('button[aria-label="Fight a wild creature"]'),
    result: !!q(".result"),
    scrollY: window.scrollY,
  };
}

// Runs in the page: the box of the first element that matches, or null. `scroll` brings it to the middle of the window first.
function boxOf({ selector, scroll }) {
  const el = document.querySelector(selector);
  if (!el) return null;
  if (scroll) el.scrollIntoView({ block: "center", behavior: "instant" });
  const r = el.getBoundingClientRect();
  return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height, x: (r.left + r.right) / 2, y: (r.top + r.bottom) / 2 };
}

// Runs in the page: what does not fit inside `scope`: the page does not scroll sideways, no element of the scope ends past the window's width (`iw`), and every text line sits inside its own element's box.
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
  await page.clock.pauseAt(T + 60_000); // from here the fake clock moves only under runFor
  await page.clock.runFor(100);
  await page.waitForTimeout(100);
  return { page, errors, context };
}

// Run the fake clock `ms` in frames of `frame` ms.
async function run(page, ms, frame = 100) {
  for (let left = ms; left > 0; left -= frame) await page.clock.runFor(Math.min(frame, left));
}

const boxCenter = (b) => [b.x, b.y];
const read = (page) => page.evaluate(snap);

// A real touch tap at a point (CSS pixels of the window); the clock does not move.
async function tapAt(page, point) {
  await page.touchscreen.tap(point[0], point[1]);
  await sleep(30);
}

// A real tap on the first element that matches (scrolled into the middle of the window first).
async function tapSel(page, selector) {
  const b = await page.evaluate(boxOf, { selector, scroll: true });
  if (!b) throw new Error(`nothing matches ${selector}`);
  await tapAt(page, boxCenter(b));
}

async function goArena(page) {
  await tapSel(page, 'button[aria-label="Arena"]');
  await run(page, 200);
}
async function startFight(page, expectTimed = true) {
  await tapSel(page, 'button[aria-label="Fight a wild creature"]');
  await run(page, 200);
  const s = await read(page);
  if (expectTimed && s.nums === null) throw new Error("no numbers row after a tap on Fight: the timed fight did not start");
  return s;
}

// Choose an action (`Attack`, `Guard`, `Special`), wait `offset` ms from the ring meeting the circle and tap the pad there (a real tap); an `offset` past the pad's closing means no tap: the pad
// closes by itself. Returns what the screen says right after (the note over the room, the numbers). The clock then runs 6.5 s so the picture and the note are clear for the next round.
async function playRound(page, action, offset, { clear = true } = {}) {
  await tapSel(page, `button[aria-label="${action}"]`);
  await run(page, 20, 20);
  const open = await read(page);
  if (!open.pad) throw new Error(`no timing pad after a tap on ${action}`);
  const tap = offset <= CLOSE_MS - RING_MS - 20; // the pad closes 200 ms after the target: a tap 20 ms before that still finds it, a later one finds it closed
  if (tap) {
    await page.clock.runFor(RING_MS + offset - 20);
    await tapAt(page, boxCenter(open.pad));
    await run(page, 20, 20);
  } else {
    await page.clock.runFor(CLOSE_MS + 100 - 20);
  }
  const after = await read(page);
  if (!tap && after.pad) throw new Error(`the pad was still open ${CLOSE_MS + 100} ms after it opened (it closes by itself at ${CLOSE_MS})`);
  if (clear) await run(page, 6500, 500);
  return after;
}

// ---------- the checks ----------

const CHECKS = {
  // The pad: what it shows, what it is called, where focus goes, how big it is, and the ring that shrinks (and does not move for a player who asked for no motion).
  "cb-pad": async (open, env) => {
    const { page, errors } = await open(adult(bruiser));
    await goArena(page);
    const before = await startFight(page);
    expectEq(before.buttons.map((b) => b.label), ["Attack", "Guard", "Special (not charged yet)", "Run away"], "the four buttons of a timed fight");
    expectEq(before.buttons.map((b) => b.disabled), [false, false, true, false], "which of them can be pressed");
    expectEq(before.bar.timed, true, "the button row of a timed fight");
    await tapSel(page, 'button[aria-label="Guard"]');
    await run(page, 50, 25);
    const s = await read(page);
    if (!s.pad) throw new Error("no pad after a tap on Guard");
    expectEq(s.pad.label, "Guard: tap when the ring meets the circle", "the pad's name");
    expectEq(s.pad.focused, true, "focus on the pad");
    expectEq(s.pad.word, "Guard", "the word on the pad");
    if (s.pad.h < 43.5) throw new Error(`the pad is ${s.pad.h.toFixed(1)} px tall`);
    if (Math.abs(s.pad.l - before.buttons[0].l) > 1 || Math.abs(s.pad.r - before.buttons[2].r) > 1) {
      throw new Error(`the pad runs from ${s.pad.l.toFixed(1)} to ${s.pad.r.toFixed(1)}, the three buttons it replaces from ${before.buttons[0].l.toFixed(1)} to ${before.buttons[2].r.toFixed(1)}`);
    }
    expectEq(s.buttons.map((b) => b.label), ["Run away"], "the buttons beside the pad");
    expectEq([s.ring.name, s.ring.duration], ["timing-ring", "0.9s"], "the ring's animation and its length");
    for (const [what, b] of [["circle", s.target], ["ring", s.ring]]) {
      if (Math.abs(b.x - s.pad.x) > 1 || Math.abs(b.y - s.pad.y) > 1) throw new Error(`the ${what} is not in the middle of the pad`);
    }
    expectEq(errors, [], "page errors");
    // a player who asked for no motion: the ring does not shrink, it lights up
    const reduced = await open(adult(bruiser), { reducedMotion: "reduce" });
    await goArena(reduced.page);
    await startFight(reduced.page);
    await tapSel(reduced.page, 'button[aria-label="Attack"]');
    await run(reduced.page, 50, 25);
    const r = await read(reduced.page);
    expectEq([r.ring.name, r.ring.duration], ["timing-lit", "0.9s"], "the ring's animation with reduced motion");
    expectEq(reduced.errors, [], "page errors with reduced motion");
    return `${env.w}x${env.h}@${env.dpr}: four buttons (Special not charged), a pad named for its action (and the word on it) that takes focus, as wide as the three buttons it replaces, ${Math.round(s.pad.w)} x ${Math.round(s.pad.h)} px, the ring and circle centred, a 0.9 s shrinking ring, and a lit ring instead with reduced motion`;
  },

  // The word each tap earns, by how far from the moment the ring meets the circle: the sign, the windows, a tap after the pad closed, and five taps right on it.
  "cb-words": async (open, env) => {
    const { page, errors } = await open(adult(bruiser));
    await goArena(page);
    await startFight(page);
    const cases = [
      [-300, "Early"],
      [-120, "Good attack"],
      [-40, "Perfect attack"],
      [0, "Perfect attack"],
      [40, "Perfect attack"],
      [120, "Good attack"],
      [180, "Late"],
      [300, null],
    ];
    for (const [offset, want] of cases) expectEq((await playRound(page, "Attack", offset)).note, want, `the words for a tap ${offset} ms from the target`);
    for (let i = 0; i < 5; i++) expectEq((await playRound(page, "Attack", 0)).note, "Perfect attack", `tap ${i + 1} of 5 right on the target`);
    expectEq(errors, [], "page errors");
    return `${env.w}x${env.h}@${env.dpr}: -300 Early, -120 Good, -40 0 and +40 Perfect, +120 Good, +180 Late, +300 nothing (the pad had closed), and five taps at 0 all Perfect`;
  },

  // A tap in the middle of the ring plays the round at once, as a Normal one, and says Early.
  "cb-early": async (open, env) => {
    const { page, errors } = await open(adult(bruiser));
    await goArena(page);
    await startFight(page);
    await tapSel(page, 'button[aria-label="Attack"]');
    await run(page, 300, 100); // 300 ms into a ring that takes 900
    const s = await read(page);
    await tapAt(page, boxCenter(s.pad));
    await run(page, 20, 20);
    const after = await read(page);
    expectEq([after.pad, after.note], [null, "Early"], "the pad and the note right after a tap 600 ms before the target");
    expectEq(after.buttons.map((b) => b.disabled), [true, true, true, false], "the buttons while that round plays (all wait but Run away)");
    expectEq(errors, [], "page errors");
    return `${env.w}x${env.h}@${env.dpr}: a tap 300 ms into the ring closed the pad at once, said Early and the round began`;
  },

  // The keyboard: Enter held down on Attack opens the pad and the repeats of the held key play nothing, Space is graded at its keydown, Enter at +40 ms, a click with no pointer (a screen reader's)
  // is a tap, and focus comes back to the action just played.
  "cb-keyboard": async (open, env) => {
    const { page, errors } = await open(adult(bruiser));
    await goArena(page);
    await startFight(page);
    // Enter held down on the Attack button opens the pad (its click) and focus goes to the pad: a held key then repeats into the pad, and a repeat is not a tap
    await page.focus('button[aria-label="Attack"]');
    await page.keyboard.down("Enter");
    await run(page, 50, 25);
    let s = await read(page);
    expectEq([!!s.pad, s.pad?.focused], [true, true], "the pad after Enter went down on Attack, and focus on it");
    for (let i = 0; i < 2; i++) {
      await page.keyboard.down("Enter"); // the key is already down: Playwright sends it as a repeat
      await run(page, 100, 50);
    }
    s = await read(page);
    expectEq([!!s.pad, s.note], [true, null], "the pad and the note after the held Enter repeated twice");
    await page.keyboard.up("Enter");
    await page.clock.runFor(RING_MS - 250); // 250 ms in so far: the ring meets the circle now
    await page.keyboard.down("Space");
    await run(page, 20, 20);
    s = await read(page);
    expectEq([s.pad, s.note], [null, "Perfect attack"], "the pad and the note after Space went down at the target");
    // Space stays down after the tap, through the round and on: the focus goes back to Attack when the round is over, and the repeats and the release must not open a pad nobody chose
    await run(page, 3000, 250);
    for (let i = 0; i < 2; i++) {
      await page.keyboard.down("Space"); // already down: sent as a repeat, and now it reaches Attack
      await run(page, 100, 50);
    }
    await page.keyboard.up("Space");
    await run(page, 100, 50);
    s = await read(page);
    expectEq([!!s.pad, s.focus], [false, "Attack"], "a pad opened by the Space still held when the round ended, and what has focus (the action just played)");
    await run(page, 6500, 500);
    await page.focus('button[aria-label="Attack"]');
    await page.keyboard.press("Enter");
    await run(page, 20, 20);
    await page.clock.runFor(RING_MS + 40 - 20);
    await page.keyboard.down("Enter");
    await run(page, 20, 20);
    s = await read(page);
    expectEq([s.pad, s.note], [null, "Perfect attack"], "the pad and the note after Enter went down 40 ms after the target");
    await page.keyboard.up("Enter");
    await run(page, 6500, 500);
    await page.focus('button[aria-label="Attack"]');
    await page.keyboard.press("Enter");
    await run(page, 20, 20);
    await page.clock.runFor(RING_MS - 20);
    await page.evaluate(() => document.querySelector(".timing-pad").click()); // a click that no pointer made: what a screen reader sends (detail 0)
    await run(page, 20, 20);
    s = await read(page);
    expectEq([s.pad, s.note], [null, "Perfect attack"], "the pad and the note after a click with no pointer (assistive technology) at the target");
    expectEq(errors, [], "page errors");
    return `${env.w}x${env.h}@${env.dpr}: Enter held on Attack opened the pad, focus went to it and two repeats of the held key played nothing; Space down at the target and Enter down at +40 ms were both Perfect and closed the pad; a click with no pointer at the target was Perfect too; focus came back to Attack after the round, and a Space still held then opened no pad`;
  },

  // One round for one prompt: a second tap on the same spot while the round plays opens nothing and plays nothing, and neither do two pointerdowns in one frame.
  "cb-double": async (open, env) => {
    const { page, errors } = await open(adult(bruiser));
    await goArena(page);
    const start = await startFight(page);
    const shown = /^Foe next: (attack|guard)$/.exec(start.intent.text)?.[1]; // the first move can only be one of these (a special needs a full meter)
    if (!shown) throw new Error(`the first shown move reads "${start.intent.text}"`);
    await tapSel(page, 'button[aria-label="Attack"]');
    await run(page, 20, 20);
    const s = await read(page);
    await page.clock.runFor(RING_MS - 20);
    await tapAt(page, boxCenter(s.pad));
    await tapAt(page, boxCenter(s.pad)); // a second tap on the same spot, straight away
    await run(page, 20, 20);
    let after = await read(page);
    expectEq([after.pad, after.note], [null, "Perfect attack"], "the pad and the note after two taps on the pad");
    const attack = after.buttons[0];
    if (!attack.disabled) throw new Error("Attack can be pressed while the round plays");
    await tapSel(page, 'button[aria-label="Attack"]'); // a real tap on the disabled button
    await run(page, 200, 100);
    after = await read(page);
    expectEq(after.pad, null, "no pad opened by a tap on Attack while the round plays");
    await run(page, 6000, 500);
    after = await read(page);
    expectEq(after.pad, null, "no pad after the round has played");
    // One round: a Perfect Attack charges Special by 1 and a blow taken by 1 more (the foe's shown move was an attack: 2; a guard: 1). A second round would add at least 1.
    expectEq(after.hp.meter, shown === "attack" ? 2 : 1, `Special after one round against a shown "${shown}"`);
    expectEq(errors, [], "page errors");
    // Two fingers can raise two pointerdowns in one frame, before the screen has drawn the pad away: two events in one task, the second reaching the same pad. Still one round.
    const two = await open(adult(bruiser));
    await goArena(two.page);
    const fresh = await startFight(two.page);
    const shown2 = /^Foe next: (attack|guard)$/.exec(fresh.intent.text)?.[1];
    if (!shown2) throw new Error(`the first shown move reads "${fresh.intent.text}"`);
    await tapSel(two.page, 'button[aria-label="Attack"]');
    await run(two.page, 20, 20);
    await two.page.clock.runFor(RING_MS - 20);
    // a right-button and a middle-button press on the pad are not taps (a touch, the pen's tip and the mouse's main button are button 0)
    await two.page.evaluate(() => {
      const pad = document.querySelector(".timing-pad");
      for (const button of [2, 1]) pad.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true, button }));
    });
    const pressed = await read(two.page);
    expectEq([!!pressed.pad, pressed.note], [true, null], "the pad and the note after a right-button and a middle-button press on it");
    await two.page.evaluate(() => {
      const pad = document.querySelector(".timing-pad");
      for (let i = 0; i < 2; i++) pad.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true }));
    });
    await run(two.page, 6500, 500);
    const both = await read(two.page);
    expectEq(both.hp.meter, shown2 === "attack" ? 2 : 1, `Special after two pointerdowns in one frame against a shown "${shown2}" (one round)`);
    expectEq(two.errors, [], "page errors (two pointerdowns)");
    return `${env.w}x${env.h}@${env.dpr}: two taps on the pad played one round (Special at ${after.hp.meter} against a shown ${shown}), and so did two pointerdowns in one frame (Special at ${both.hp.meter} against a shown ${shown2}); a tap on Attack while it played opened no pad, and none came after`;
  },

  // The pad's clock stops when its round is played: a pad opened soon after a round that took only 0.4 s is not closed by the old pad's clock.
  "cb-stale": async (open, env) => {
    // rngState 4 makes the first move shown a guard (found by running startFight over states 1 to 40: 4, 11, 12, 16, 17 ... are guards); a guard against a guard is a round with no blow, 0.4 s long
    const { page, errors } = await open(adult((c, save) => {
      bruiser(c);
      save.rngState = 4;
    }));
    await goArena(page);
    const start = await startFight(page);
    expectEq(start.intent.text, "Foe next: guard", "the first move shown (rngState 4 should make it a guard)");
    await tapSel(page, 'button[aria-label="Guard"]'); // the pad opens now (time 0)
    await run(page, 100, 50);
    const open1 = await read(page);
    await tapAt(page, boxCenter(open1.pad)); // 100 ms in: an early tap, the round plays at once
    await run(page, 500, 100); // the round takes 0.4 s
    let s = await read(page);
    expectEq([s.pad, s.buttons.map((b) => b.disabled)], [null, [false, false, true, false]], "the pad and the buttons 0.5 s after the tap (the calm round has played)");
    await tapSel(page, 'button[aria-label="Attack"]'); // a new pad, 600 ms after the first one opened (100 ms to the tap, 500 for the round)
    await run(page, 800, 100); // now 1.4 s after the first pad opened: past the old pad's closing time (1.1 s), before the new one's (1.7 s)
    s = await read(page);
    expectEq(s.pad?.label, "Attack: tap when the ring meets the circle", "the pad 1.4 s after the first one opened (the old pad's clock must not have closed it)");
    expectEq(errors, [], "page errors");
    return `${env.w}x${env.h}@${env.dpr}: a Guard pad tapped early, a 0.4 s round, then an Attack pad opened 600 ms after the first one: still open and unplayed at 1.4 s`;
  },

  // A fight left with the pad open: the pad's clock stops with it. A new fight begun at once is not played into by the old pad.
  "cb-leave": async (open, env) => {
    const { page, errors } = await open(adult(bruiser));
    await goArena(page);
    await startFight(page);
    await tapSel(page, 'button[aria-label="Attack"]');
    await run(page, 20, 20);
    expectEq(!!(await read(page)).pad, true, "the pad before Run away");
    await tapSel(page, 'button[aria-label="Run away"]');
    await run(page, 100, 50);
    let s = await read(page);
    expectEq([s.pad, s.nums, s.fightButton], [null, null, true], "the pad, the numbers and the Fight button after Run away");
    const fresh = await startFight(page); // at once, 120 ms after the old pad opened
    await run(page, 1500, 100); // past the old pad's closing time
    await run(page, 3000, 250); // and long enough for a round to have played back: the numbers wait for the blows, so a round played into this fight shows in the HP only after them
    s = await read(page);
    expectEq([s.hp.me, s.hp.foe, s.note, s.pad], [fresh.hp.me, fresh.hp.foe, null, null], "the new fight's HP, the note and the pad 4.7 s after the tap on Fight (the old pad must not have played a round into it)");
    expectEq(errors, [], "page errors");
    return `${env.w}x${env.h}@${env.dpr}: Run away with the pad open left the fight; a new fight begun at once was not played into when the old pad's time ran out`;
  },

  // The sulk: at most once in a fight, said in words, and the round has no grade word.
  "cb-sulk": async (open, env) => {
    const { page, errors } = await open(
      adult((c) => {
        bruiser(c);
        c.stats.discipline = 0; // a sulk chance of 0.3 every round
      }),
    );
    await goArena(page);
    await startFight(page);
    let sulks = 0;
    let first = null;
    const notes = [];
    for (let i = 1; i <= 40; i++) {
      const note = (await playRound(page, "Attack", 0)).note;
      notes.push(note);
      if (note === SULK) {
        sulks++;
        first ??= i;
      }
    }
    expectEq(sulks, 1, `rounds with the sulk note out of 40 (the first in round ${first}; at 0.3 a sulk is nearly sure before round 15, and it would come again and again without the cap)`);
    if (first === null || first > 25) throw new Error(`the first sulk came in round ${first}`);
    expectEq(notes.filter((n) => n !== SULK && n !== "Perfect attack").length, 0, "every other round was a Perfect attack");
    expectEq(errors, [], "page errors");
    return `${env.w}x${env.h}@${env.dpr}: at discipline 0, 40 rounds had one sulk (round ${first}) with the words "${SULK}", and every other round was a Perfect attack`;
  },

  // The numbers wait for the blows like the bars do, then change.
  "cb-numbers": async (open, env) => {
    const { page, errors } = await open(adult(bruiser));
    await goArena(page);
    const start = await startFight(page);
    expectEq([start.hp.me, start.hp.meMax, start.hp.foe === start.hp.foeMax, start.hp.meter], [start.hp.meMax, start.hp.meMax, true, 0], "the numbers at the start (full HP both sides, no charge)");
    const during = await playRound(page, "Attack", 0, { clear: false }); // read 20 ms after the tap
    expectEq([during.hp.me, during.hp.foe], [start.hp.me, start.hp.foe], "the HP shown while the round plays back (the numbers from before it)");
    expectEq(during.intent.visibility, "hidden", "the foe's next move while the round plays");
    await run(page, 3000, 250);
    const after = await read(page);
    if (!(after.hp.foe < start.hp.foe)) throw new Error(`the foe's HP is ${after.hp.foe} after the round and was ${start.hp.foe}`);
    if (!(after.hp.meter >= 1)) throw new Error(`Special is ${after.hp.meter} of 3 after a Perfect attack`);
    expectEq(after.intent.visibility, "visible", "the foe's next move once the round has played");
    expectEq(errors, [], "page errors");
    return `${env.w}x${env.h}@${env.dpr}: the numbers stayed at "${start.nums}" while the round played back, then the foe went from ${start.hp.foe} to ${after.hp.foe} and Special charged to ${after.hp.meter}; the next move was hidden while it played`;
  },

  // The wild creature's shown move is the one it makes: a Perfect guard says "Perfect guard" exactly when the shown move is an attack or a special.
  "cb-intent": async (open, env) => {
    const { page, errors } = await open(adult(bruiser));
    await goArena(page);
    await startFight(page);
    const seen = { blow: 0, guard: 0 };
    for (let i = 1; i <= 30; i++) {
      const s = await read(page);
      const shown = /^Foe next: (attack|guard|special)$/.exec(s.intent.text)?.[1];
      if (!shown) throw new Error(`round ${i}: the intent line reads "${s.intent.text}"`);
      expectEq(s.intent.rendered, `Foe next: ${shown[0].toUpperCase()}${shown.slice(1)}`, `round ${i}: the intent line as drawn (innerText follows text-transform)`);
      const word = (await playRound(page, "Guard", 0)).note;
      const blow = shown === "attack" || shown === "special";
      expectEq(word, blow ? "Perfect guard" : null, `round ${i}: a Perfect guard when the foe's shown move was "${shown}"`);
      seen[blow ? "blow" : "guard"]++;
    }
    if (seen.blow < 5 || seen.guard < 1) throw new Error(`the 30 rounds showed ${seen.blow} blows and ${seen.guard} guards: too few of one kind to say the shown move was the real one`);
    expectEq(errors, [], "page errors");
    return `${env.w}x${env.h}@${env.dpr}: over 30 rounds the shown move was a blow ${seen.blow} times and a guard ${seen.guard} times, and a Perfect guard parried exactly when a blow was shown`;
  },

  // Kid Mode's Arena: the old buttons, no pad, no numbers row, one tap for a round.
  "cb-kid": async (open, env) => {
    const { page, errors } = await open(load("adult-home-kid.json"));
    await goArena(page);
    const s = await startFight(page, false);
    expectEq([s.nums, s.intent, s.pad, s.bar.timed], [null, null, null, false], "a Kid fight's numbers row, intent row, pad and timed bar");
    expectEq(s.buttons.map((b) => b.label), ["Attack", "Guard", "Special (not charged yet)", "Run away"], "Kid Mode's four buttons");
    await tapSel(page, 'button[aria-label="Attack"]');
    await run(page, 50, 25);
    const after = await read(page);
    expectEq(after.pad, null, "no pad after one tap on Attack in Kid Mode");
    expectEq(after.buttons.map((b) => b.disabled), [true, true, true, false], "the buttons while the Kid round plays (one tap began it)");
    await run(page, 5000, 250);
    const later = await read(page);
    expectEq([later.pad, later.nums], [null, null], "no pad and no numbers once the Kid round has played");
    expectEq(errors, [], "page errors");
    // A won Kid fight: its result card is put away by a tap at once, the click guard of a timed fight is not for it.
    const strong = load("adult-home-kid.json");
    strong.creature.trained = { str: 5000, vit: 5000 }; // one attack ends the fight
    strong.creature.stats.discipline = 100; // and a Kid fight can sulk in any round (the once-a-fight cap is for timed fights), so no sulk
    const k = await open(strong);
    await goArena(k.page);
    await startFight(k.page, false);
    await tapSel(k.page, 'button[aria-label="Attack"]');
    await run(k.page, 300, 50);
    expectEq((await read(k.page)).result, true, "the result card of a won Kid fight 300 ms after the tap on Attack");
    await tapSel(k.page, ".result");
    await run(k.page, 100, 50);
    const left = await read(k.page);
    expectEq([left.result, left.fightButton], [false, true], "a won Kid fight's result card and the Fight button after a tap on the card 300 ms in");
    expectEq(k.errors, [], "page errors (the won Kid fight)");
    return `${env.w}x${env.h}@${env.dpr}: Kid Mode's Arena has its four icon buttons, no numbers, no pad, and one tap on Attack began a round; a won Kid fight's result card was put away by a tap 300 ms in`;
  },

  // The result card: the tap on the pad that wins the fight must not put the card away (the click that touch makes lands on the card, which is already on the screen); a deliberate tap later does.
  "cb-result": async (open, env) => {
    const { page, errors } = await open(
      adult((c) => {
        c.trained = { str: 5000, vit: 5000 }; // one Perfect attack ends the fight
        c.stats.discipline = 100;
      }),
    );
    await goArena(page);
    await startFight(page);
    const won = await playRound(page, "Attack", 0, { clear: false }); // read 20 ms after the tap
    expectEq(won.result, true, "the result card 20 ms after the tap that won the fight (that tap's own click must not put it away)");
    await run(page, 280, 20);
    expectEq((await read(page)).result, true, "the result card 300 ms after the winning tap");
    await tapSel(page, ".result"); // inside the first 600 ms: ignored
    await run(page, 20, 20);
    const early = await read(page);
    expectEq([early.result, early.fightButton], [true, false], "the result card and the Fight button after a deliberate tap 320 ms in (inside the 600 ms guard)");
    await run(page, 430, 50); // 750 ms after the winning tap
    const label = await page.locator(".result").getAttribute("aria-label");
    if (!/^You won! .*Tap to continue\.$/.test(label ?? "")) throw new Error(`the result card is labelled "${label}"`);
    await tapSel(page, ".result");
    await run(page, 100, 50);
    const left = await read(page);
    expectEq([left.result, left.fightButton], [false, true], "the result card and the Fight button after a tap 750 ms in");
    expectEq(errors, [], "page errors");
    return `${env.w}x${env.h}@${env.dpr}: the tap that won the fight left the result card up (20 and 300 ms on), a tap 320 ms in was ignored, a tap 750 ms in put it away; label "${label}"`;
  },

  // The notes: in the arena the top of the picture is the two health bars and the pips (drawn down to row 18 of the picture's 128), so a note sits below row 18 and inside the picture. The sulk is the longest.
  "cb-notes": async (open, env) => {
    const { page, errors } = await open(
      adult((c) => {
        bruiser(c);
        c.stats.discipline = 0; // the one sulk comes early
      }),
    );
    await goArena(page);
    await startFight(page);
    const seen = new Map();
    for (let i = 1; i <= 40 && seen.size < 2; i++) {
      await playRound(page, "Attack", 0, { clear: false });
      await run(page, 280, 20); // past the note's 0.2 s rise
      const s = await read(page);
      if (s.note && !seen.has(s.note)) {
        const n = s.noteBox;
        const c = s.canvas;
        const need = (c.h * 18) / 128;
        if (n.t - c.t < need - 0.5) throw new Error(`the note "${s.note}" starts ${(n.t - c.t).toFixed(1)} px below the top of the picture; the bars and pips end ${need.toFixed(1)} px down`);
        if (n.b > c.b + 0.5 || n.l < c.l - 0.5 || n.r > c.r + 0.5) throw new Error(`the note "${s.note}" spans ${Math.round(n.l)},${Math.round(n.t)} to ${Math.round(n.r)},${Math.round(n.b)} and the picture ${Math.round(c.l)},${Math.round(c.t)} to ${Math.round(c.r)},${Math.round(c.b)}`);
        seen.set(s.note, `${(n.t - c.t).toFixed(0)} to ${(n.b - c.t).toFixed(0)} px of ${c.h.toFixed(0)}`);
      }
      await run(page, 6200, 500);
    }
    if (!seen.has("Perfect attack") || !seen.has(SULK)) throw new Error(`the notes seen were ${JSON.stringify([...seen.keys()])}: both "Perfect attack" and the sulk are needed`);
    expectEq(errors, [], "page errors");
    return `${env.w}x${env.h}@${env.dpr}: both notes sat below the bars and inside the picture (${[...seen].map(([k, v]) => `"${k}" ${v}`).join("; ")})`;
  },

  // Everything fits: before a choice, with the pad open, and while a round plays; the row and the picture do not move when the pad opens.
  "cb-layout": async (open, env) => {
    const { page, errors } = await open(adult(bruiser));
    await goArena(page);
    const start = await startFight(page);
    const scope = ".actions";
    const check = async (what) => {
      const s = await read(page);
      const fit = await page.evaluate(fitProblems, { iw: env.w, scope });
      expectEq(fit.problems, [], `what does not fit ${what}`);
      for (const b of s.buttons) if (b.h < 43.5 || b.w < 43.5) throw new Error(`${what}: the button "${b.label}" is ${b.w.toFixed(1)} x ${b.h.toFixed(1)} px`);
      return { s, fit };
    };
    const a = await check("before a choice");
    await tapSel(page, 'button[aria-label="Attack"]');
    await run(page, 50, 25);
    const b = await check("with the pad open");
    if (!b.s.pad || b.s.pad.h < 43.5) throw new Error(`the pad is ${b.s.pad ? b.s.pad.h.toFixed(1) + " px tall" : "missing"}`);
    for (const key of ["top", "h", "l", "w"]) {
      if (Math.abs(a.s.bar[key] - b.s.bar[key]) > 0.5) throw new Error(`the button row's ${key} was ${a.s.bar[key]} and is ${b.s.bar[key]} with the pad open`);
      if (Math.abs(a.s.canvas[key] - b.s.canvas[key]) > 0.5) throw new Error(`the picture's ${key} was ${a.s.canvas[key]} and is ${b.s.canvas[key]} with the pad open`);
    }
    await page.clock.runFor(RING_MS - 50);
    await tapAt(page, boxCenter(b.s.pad));
    await run(page, 400, 100);
    const c = await check("while a round plays");
    expectEq(errors, [], "page errors");
    return `${env.w}x${env.h}@${env.dpr}: the numbers, the next move, the buttons and the pad fit (${a.fit.lines + b.fit.lines + c.fit.lines} text lines measured); every button at least 43.5 px; the button row and the picture did not move when the pad opened (pad ${Math.round(b.s.pad.w)} x ${Math.round(b.s.pad.h)}, numbers "${start.nums}")`;
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
