// Browser checks for A2.1 (docs/adult-a2-plan.md section 6): the spot card, the job card and the honest call back on the habitat screen.
//
// Run: node habitat-browser.mjs --base http://127.0.0.1:4173 [--only id1,id2] [--sizes 320x568@1,360x640@2] [--modes kid,adult]
// Exit: 0 when no check failed and at least one ran; 1 when any FAIL; 2 when the script broke (a requested --only id ran zero times,
// an unknown id, a bad flag, or a crash outside a check). A check that throws or times out prints a FAIL line, never a crash.
// The saves come from gen-saves-habitat (saves/hab-<scenario>-<mode>.json, written beforehand). Expected values are literals here, worked
// out by hand from src/data/habitat.ts (see tests/callback.test.ts); the page's own functions are never used to compute them.
// The clock is frozen at T (Playwright's fake clock): to move time a check sets a new fixed time and runs the timers once (advance()).
// A shut spot is aria-disabled, so Playwright would wait for it to be "enabled" forever: spots are clicked with force (a real tap still
// reaches it, which is the point of the card).
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

// Playwright is not a dependency of the game. PLAYWRIGHT_FROM names a package.json next to a node_modules that has it.
const require = createRequire(process.env.PLAYWRIGHT_FROM ?? join(homedir(), "homelab-dashboard", "package.json"));
const { chromium } = require("playwright");

// Everything these scripts make (saves, screenshots, builds, copies) goes to VERIFY_OUT, never into the repo.
const OUT = process.env.VERIFY_OUT ?? join(tmpdir(), "broodkeep-verify");
const SAVES = join(OUT, "saves");

// Game time 2026-11-22T15:00:00Z (frozen), in ms.
const T = 1795359600000;
const MIN = 60_000;
const HOUR = 3_600_000;

// Which modes each check runs in (the others are skipped for it).
const CHECK_MODES = {
  "card-lines": ["adult"],
  "card-switch": ["adult"],
  "send-second-tap": ["adult"],
  "send-button": ["adult"],
  "double-send": ["adult"],
  "shut-reasons": ["adult"],
  "card-live": ["adult"],
  "in-view": ["adult"],
  "job-live": ["adult"],
  "callback-pays": ["adult"],
  "callback-coin-only": ["adult"],
  "callback-nothing": ["adult"],
  "callback-twice": ["adult"],
  "fit-scroll": ["adult"],
  "fit-clip": ["adult"],
  "fit-tap": ["adult"],
  "btn-look": ["adult"],
  "kid-flow": ["kid"],
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

// The five spots as the page names them (the button's aria-label) with the card's literal lines.
const SPOTS = {
  "Bug meadow": { title: "Bug meadow: Fiber", cost: "3 min, 5 energy", haul: "Haul: 1 to 2 coins, 1 to 2 Fiber" },
  "Herb patch": { title: "Herb patch: Herbs", cost: "3 min, 5 energy", haul: "Haul: 1 to 2 coins, 1 to 2 Herbs" },
  Trees: { title: "Trees: Wood", cost: "5 min, 10 energy", haul: "Haul: 2 to 3 coins, 1 to 2 Wood" },
  Pond: { title: "Pond: Fish", cost: "6 min, 10 energy", haul: "Haul: 2 to 4 coins, 1 to 2 Fish" },
  "Rock pile": { title: "Rock pile: Stone", cost: "8 min, 15 energy", haul: "Haul: 3 to 5 coins, 1 to 3 Stone" },
};

// Why a shut spot is shut: [scenario, spot, the card's reason]. (Worked out from game/reasons.ts and the saves in gen-saves-habitat.ts:
// Cragpup is a young creature, Blip a baby, the tired one has 29.5 energy shown as 29, the nap save has 40.)
const SHUT = [
  ["young", "Rock pile", "Too young for Rock pile: it opens at Adult (now: Young)."],
  ["baby", "Trees", "Too young for Trees: it opens at Young (now: Baby)."],
  ["baby", "Pond", "Too young for Pond: it opens at Young (now: Baby)."],
  ["tired", "Pond", "Too tired for Pond: it needs energy 30 to go (it has 29)."],
  ["tired", "Rock pile", "Too tired for Rock pile: it needs energy 35 to go (it has 29)."],
  ["edge", "Rock pile", "Too tired for Rock pile: it needs energy 35 to go (it has 30)."],
  ["nap", "Pond", "Napping: wakes when rested (energy 40 of 100)."],
  ["sick", "Pond", "Sick: it needs medicine before it can work."],
];

// The word under a spot the creature is too young for (Adult Mode writes the stage it opens at under the icon).
const STAGE_WORD = { "young/Rock pile": "Adult", "baby/Trees": "Young", "baby/Pond": "Young" };

// ---------- small helpers (no closures in the page functions below: they are sent to the browser as source) ----------

const trimAll = (list) => list.map((s) => s.trim());

function expectEq(actual, expected, what) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${what}: expected ${e}, got ${a}`);
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

// Runs in the page: the page does not scroll sideways, and nothing on the habitat screen ends past the window's width.
function fitScrollProblems() {
  const iw = window.innerWidth;
  const problems = [];
  const doc = document.documentElement;
  if (doc.scrollWidth > iw) problems.push(`page scrollWidth ${doc.scrollWidth} > innerWidth ${iw}`);
  for (const el of document.querySelectorAll("main.app *")) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.right > iw + 0.5) problems.push(`${el.tagName.toLowerCase()}.${el.getAttribute("class") ?? ""} ends at ${Math.round(r.right)}`);
  }
  return problems.slice(0, 5);
}

// Runs in the page: every text line of every card sits inside its own element's box (measured with a Range), and inside the card.
function fitClipProblems() {
  const iw = window.innerWidth;
  const problems = [];
  const cards = [...document.querySelectorAll(".habitat-card")];
  if (cards.length === 0) return { problems: ["no card on the screen"], cards: 0, lines: 0 };
  let lines = 0;
  for (const card of cards) {
    const cardBox = card.getBoundingClientRect();
    for (const el of [card, ...card.querySelectorAll("*")]) {
      const hasText = [...el.childNodes].some((n) => n.nodeType === Node.TEXT_NODE && n.textContent.trim() !== "");
      if (!hasText) continue;
      const box = el.getBoundingClientRect();
      const range = document.createRange();
      range.selectNodeContents(el);
      for (const r of range.getClientRects()) {
        if (r.width === 0) continue;
        lines += 1;
        if (r.left < box.left - 0.5 || r.right > box.right + 0.5 || r.right > cardBox.right + 0.5 || r.left < cardBox.left - 0.5 || r.right > iw + 0.5) {
          problems.push(`${el.tagName.toLowerCase()} "${el.textContent.trim().slice(0, 40)}" line ends at ${Math.round(r.right)} in a box ending at ${Math.round(box.right)}`);
        }
      }
    }
  }
  return { problems: problems.slice(0, 5), cards: cards.length, lines };
}

// Runs in the page: every button of the cards is at least 44 px high and wide.
function tapProblems() {
  const buttons = [...document.querySelectorAll(".habitat-card button")];
  const problems = [];
  for (const b of buttons) {
    const r = b.getBoundingClientRect();
    if (r.height < 44 - 0.5 || r.width < 44 - 0.5) problems.push(`"${b.textContent.trim().slice(0, 30)}" is ${Math.round(r.width)} x ${Math.round(r.height)}`);
  }
  return { problems: problems.slice(0, 5), buttons: buttons.length };
}

// Runs in the page: every button of the cards can be told from the surface behind it, and its label can be read. The surface is the
// nearest ancestor with a filled background. A button passes when its fill or its edge (an inset ring of 1 px or more, or a border) has
// contrast of 3:1 against that surface, and its label has 4.5:1 against its own fill. With `withControl` a button made like the old
// Retire defect (the card's own fill, no edge) is added to the card first, and what was said about it comes back too.
function btnLookProblems(withControl) {
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
    const card = document.querySelector(".habitat-card");
    if (!card) return { problems: ["no card to put the control button in"], buttons: 0, control: null };
    const fake = document.createElement("button");
    fake.textContent = "Lazy text";
    // Its label is readable (the page's own ink), so only the fill-and-edge rule can catch it.
    fake.style.cssText = `appearance:none;border:0;box-shadow:none;background:${getComputedStyle(card).backgroundColor};color:${getComputedStyle(document.body).color}`;
    card.appendChild(fake);
    control = judge(fake);
    fake.remove();
  }
  const buttons = [...document.querySelectorAll(".habitat-card button")];
  return { problems: buttons.flatMap(judge).slice(0, 5), buttons: buttons.length, control };
}

// Runs in the page: where the card's top and bottom are against the window, and the call back button's.
function viewFigures() {
  const card = document.querySelector(".habitat-card");
  if (!card) return null;
  const r = card.getBoundingClientRect();
  return { top: Math.round(r.top), bottom: Math.round(r.bottom), windowHeight: window.innerHeight, scrollHeight: document.documentElement.scrollHeight };
}

// ---------- page helpers (run in Node, drive the page with real clicks) ----------

const spotButton = (page, name) => page.locator(`.spots button[aria-label^="${name}"]`);
const card = (page) => page.locator(".spot-card");
const jobCard = (page) => page.locator(".job-card");
const callBackButton = (page) => jobCard(page).locator("button");
const haul = (page) => page.locator(".haul");

// A tap on a spot (force: a shut spot is aria-disabled and Playwright would wait for it for ever).
const tapSpot = (page, name) => spotButton(page, name).click({ force: true, timeout: 5000 });

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
  const save = JSON.parse(readFileSync(join(SAVES, `hab-${scenario}-${env.mode}.json`), "utf8"));
  const stub = `${env.base}/seed`;
  await page.route(stub, (route) => route.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html><title>seed</title>" }));
  await page.goto(stub);
  await page.evaluate(seedSave, save);
  await page.goto(`${env.base}/`);
  await page.getByRole("button", { name: "Habitat", exact: true }).waitFor({ timeout: 20000 });
  await page.getByRole("button", { name: "Habitat", exact: true }).click();
  await page.waitForSelector('[aria-label="Places to work"], .job-card, button.callback', { timeout: 5000 });
  await page.waitForTimeout(300);
  return { page, errors };
}

// ---------- the checks: each returns a detail string, or throws ----------

// Opens one scenario and puts its cards on screen, for the layout checks. Every state a player can reach: each spot's card, each shut reason,
// each job card, and each haul card.
const LAYOUT_STATES = [
  ...Object.keys(SPOTS).map((name) => ({ scenario: "home", run: (page) => tapSpot(page, name), label: `card ${name}` })),
  ...SHUT.map(([scenario, name]) => ({ scenario, run: (page) => tapSpot(page, name), label: `${scenario} ${name}` })),
  ...["away-pond", "away-rocks", "away-start", "away-herbs"].map((scenario) => ({ scenario, run: async () => {}, label: scenario })),
];

async function eachLayoutState(open, body) {
  const found = [];
  for (const state of LAYOUT_STATES) {
    const { page } = await open(state.scenario);
    await state.run(page);
    await page.waitForSelector(".habitat-card", { timeout: 5000 });
    await page.waitForTimeout(250);
    found.push({ label: state.label, value: await body(page) });
  }
  return found;
}

// The three layout checks read one measured report per window size and mode (measuring every state three times would be three times slower).
const layoutCache = new Map();
async function layoutReport(open, env) {
  const key = `${env.mode} ${env.w}x${env.h}@${env.dpr}`;
  if (!layoutCache.has(key)) {
    layoutCache.set(
      key,
      await eachLayoutState(open, async (page) => ({
        scroll: await page.evaluate(fitScrollProblems),
        clip: await page.evaluate(fitClipProblems),
        tap: await page.evaluate(tapProblems),
      })),
    );
  }
  return layoutCache.get(key);
}

const checks = {
  "card-lines": async (open) => {
    const { page } = await open("home");
    for (const [name, lines] of Object.entries(SPOTS)) {
      await tapSpot(page, name);
      await card(page).waitFor({ state: "visible", timeout: 5000 });
      expectEq(await card(page).count(), 1, `${name}: cards on screen`);
      expectEq(trimAll(await card(page).locator("h4").allTextContents()), [lines.title], `${name}: title`);
      expectEq(trimAll(await card(page).locator(".card-line").allTextContents()), [lines.cost, lines.haul], `${name}: cost and haul`);
      expectEq(trimAll(await card(page).locator("button").allTextContents()), ["Send"], `${name}: buttons`);
      expectEq(await card(page).locator(".card-reason").count(), 0, `${name}: reasons`);
      expectEq(await spotButton(page, name).getAttribute("aria-pressed"), "true", `${name}: pressed`);
    }
    expectEq(await jobCard(page).count(), 0, "job cards");
    const saved = await savedGame(page);
    expectEq(saved.creature.job ?? null, null, "no job started by looking");
    expectEq(saved.creature.stats.energy, 90, "energy untouched by looking");
    return "all five cards read as written, one at a time, with a Send button and the spot pressed; looking starts nothing";
  },

  "card-switch": async (open) => {
    const { page } = await open("home");
    await tapSpot(page, "Pond");
    await tapSpot(page, "Trees");
    await card(page).waitFor({ state: "visible", timeout: 5000 });
    expectEq(await card(page).count(), 1, "cards on screen");
    expectEq(trimAll(await card(page).locator("h4").allTextContents()), ["Trees: Wood"], "title after switching");
    expectEq(await spotButton(page, "Pond").getAttribute("aria-pressed"), "false", "Pond pressed");
    expectEq(await spotButton(page, "Trees").getAttribute("aria-pressed"), "true", "Trees pressed");
    expectEq((await savedGame(page)).creature.job ?? null, null, "nothing started by switching");
    return "a tap on another spot moves the card; two taps on different spots send nothing";
  },

  "send-second-tap": async (open) => {
    const { page } = await open("home");
    await tapSpot(page, "Pond");
    await card(page).waitFor({ state: "visible", timeout: 5000 });
    await tapSpot(page, "Pond");
    await jobCard(page).waitFor({ state: "visible", timeout: 5000 });
    expectEq(await card(page).count(), 0, "spot cards after sending");
    const saved = await savedGame(page);
    expectEq(saved.creature.job, { spot: "pond", startedAt: T, endsAt: T + 6 * MIN }, "saved job");
    expectEq(saved.creature.stats.energy, 80, "energy after the trip");
    return "a second tap on the same spot sends: job card shown, saved job is the Pond for six minutes, energy 90 to 80";
  },

  "send-button": async (open) => {
    const { page } = await open("home");
    await tapSpot(page, "Rock pile");
    await card(page).locator("button", { hasText: "Send" }).click();
    await jobCard(page).waitFor({ state: "visible", timeout: 5000 });
    const saved = await savedGame(page);
    expectEq(saved.creature.job, { spot: "rocks", startedAt: T, endsAt: T + 8 * MIN }, "saved job");
    expectEq(saved.creature.stats.energy, 75, "energy after the trip");
    return "Send starts the job: saved job is the Rock pile for eight minutes, energy 90 to 75";
  },

  "double-send": async (open) => {
    const { page } = await open("home");
    await tapSpot(page, "Pond");
    await card(page).waitFor({ state: "visible", timeout: 5000 });
    // Two synthetic clicks inside ONE evaluate, on purpose: the second must land before Preact redraws.
    await page.evaluate(() => {
      const send = [...document.querySelectorAll(".spot-card button")].find((b) => b.textContent.trim() === "Send");
      send.click();
      send.click();
    });
    await jobCard(page).waitFor({ state: "visible", timeout: 5000 });
    const saved = await savedGame(page);
    expectEq(saved.creature.stats.energy, 80, "energy after two quick taps on Send");
    expectEq(saved.creature.job.spot, "pond", "saved job");
    return "two quick taps on Send start one job: energy 90 to 80, not 70";
  },

  "shut-reasons": async (open) => {
    const done = [];
    for (const [scenario, name, reason] of SHUT) {
      const { page } = await open(scenario);
      await tapSpot(page, name);
      await card(page).waitFor({ state: "visible", timeout: 5000 });
      expectEq(trimAll(await card(page).locator(".card-reason").allTextContents()), [reason], `${scenario} ${name}: reason`);
      if (STAGE_WORD[`${scenario}/${name}`]) expectEq(trimAll(await spotButton(page, name).locator(".word").allTextContents()), [STAGE_WORD[`${scenario}/${name}`]], `${scenario} ${name}: the word under the shut spot`);
      expectEq(await card(page).locator("button").count(), 0, `${scenario} ${name}: buttons on a shut card`);
      await tapSpot(page, name); // the second tap on a shut spot sends nothing
      await page.waitForTimeout(200);
      expectEq(await jobCard(page).count(), 0, `${scenario} ${name}: job card after a second tap`);
      expectEq((await savedGame(page)).creature.job ?? null, null, `${scenario} ${name}: saved job`);
      done.push(`${scenario}/${name}`);
    }
    // And the open side of each boundary: Pond at exactly 30 energy and Bug meadow at 29 have a Send button.
    const edge = await open("edge");
    await tapSpot(edge.page, "Pond");
    expectEq(trimAll(await card(edge.page).locator("button").allTextContents()), ["Send"], "Pond at energy 30");
    const tired = await open("tired");
    await tapSpot(tired.page, "Bug meadow");
    expectEq(trimAll(await card(tired.page).locator("button").allTextContents()), ["Send"], "Bug meadow at energy 29");
    return `${done.length} shut cards read their reason, have no Send, and a second tap sends nothing; Send is there at the boundaries`;
  },

  "card-live": async (open) => {
    const { page } = await open("home");
    await tapSpot(page, "Pond");
    await card(page).locator("button", { hasText: "Send" }).waitFor({ state: "visible", timeout: 5000 });
    await advance(page, 5 * HOUR + 5 * MIN); // 20:05, past the sleeping hour
    await card(page).locator(".card-reason").waitFor({ state: "visible", timeout: 5000 });
    const reason = trimAll(await card(page).locator(".card-reason").allTextContents())[0];
    if (!/^Asleep/.test(reason)) throw new Error(`the card should say the creature is asleep, got "${reason}"`);
    expectEq(await card(page).locator("button").count(), 0, "buttons on the card once it is night");
    return `an open card follows the live creature: at night the Send button is gone and it reads "${reason}"`;
  },

  "in-view": async (open, env) => {
    const { page } = await open("home");
    await tapSpot(page, "Rock pile");
    await card(page).waitFor({ state: "visible", timeout: 5000 });
    await page.waitForTimeout(300);
    const seen = await page.evaluate(viewFigures);
    if (seen.top < 0 || seen.bottom > seen.windowHeight + 0.5) throw new Error(`the spot card is not fully in the window: top ${seen.top}, bottom ${seen.bottom}, window ${seen.windowHeight}`);
    await card(page).locator("button", { hasText: "Send" }).click();
    await jobCard(page).waitFor({ state: "visible", timeout: 5000 });
    await page.waitForTimeout(300);
    const job = await page.evaluate(viewFigures);
    if (job.top < 0 || job.bottom > job.windowHeight + 0.5) throw new Error(`the job card is not fully in the window: top ${job.top}, bottom ${job.bottom}, window ${job.windowHeight}`);
    return `the spot card (${seen.top} to ${seen.bottom}) and the job card (${job.top} to ${job.bottom}) are fully in a ${seen.windowHeight} px window; page ${seen.scrollHeight} / ${job.scrollHeight}`;
  },

  "job-live": async (open) => {
    const { page } = await open("away-pond");
    await jobCard(page).waitFor({ state: "visible", timeout: 5000 });
    // Waits for the countdown to show what is expected before reading (the redraw is not instant), then reads everything at once.
    const read = async (what, back) => {
      await jobCard(page).locator(".card-back", { hasText: back }).waitFor({ state: "visible", timeout: 5000 });
      return {
      title: trimAll(await jobCard(page).locator("h4").allTextContents()),
      back: trimAll(await jobCard(page).locator(".card-back").allTextContents()),
      lines: trimAll(await jobCard(page).locator(".card-line").allTextContents()),
      button: trimAll(await jobCard(page).locator("button").allTextContents()),
      bar: await jobCard(page).locator('[role="progressbar"]').getAttribute("aria-valuenow"),
      what,
      };
    };
    const lines = ["Haul: 2 to 4 coins, 1 to 2 Fish", "Spent 10 energy, which does not come back."];
    // Two minutes of six are done at T: a third (coins 3 x 1/3 = 1, fish 1.5 x 1/3 = 0.5 pays 0).
    expectEq(await read("at T", "back in 4:00"), { title: ["Pond: Fish"], back: ["back in 4:00"], lines, button: ["Call back now: 1 coin"], bar: "33", what: "at T" }, "job card at T");
    // Half a minute: no game minute has passed, so only the card's own one-second redraw can move the countdown and the bar.
    await advance(page, 30_000); // 150 s of 360 s: bar 41.7 -> 42; coins 3 x 150/360... = 1.25 -> 1, fish 0.625 -> 0
    expectEq(await read("+30 s", "back in 3:30"), { title: ["Pond: Fish"], back: ["back in 3:30"], lines, button: ["Call back now: 1 coin"], bar: "42", what: "+30 s" }, "job card half a minute later");
    await advance(page, 1 * MIN); // three of six: coins 1.5 -> 1, fish 0.75 -> 0
    expectEq(await read("+1 min", "back in 3:00"), { title: ["Pond: Fish"], back: ["back in 3:00"], lines, button: ["Call back now: 1 coin"], bar: "50", what: "+1 min" }, "job card a minute later");
    await advance(page, 3 * MIN); // five of six: coins 2.5 -> 2, fish 1.25 -> 1
    expectEq(await read("+3 min", "back in 1:00"), { title: ["Pond: Fish"], back: ["back in 1:00"], lines, button: ["Call back now: 2 coins, 1 Fish"], bar: "83", what: "+3 min" }, "job card three minutes later");
    return "the job card at T, +30 s, +1 min and +3 min: the countdown, the bar and the button's words move as written; the haul and spent lines stay";
  },

  "callback-pays": async (open) => {
    const { page } = await open("away-rocks"); // half way: 4 of 8 minutes: coins 4 x 1/2 = 2, stone 2 x 1/2 = 1
    expectEq(trimAll(await callBackButton(page).allTextContents()), ["Call back now: 2 coins, 1 Stone"], "button words");
    await callBackButton(page).click();
    await haul(page).waitFor({ state: "visible", timeout: 5000 });
    expectEq(trimAll(await haul(page).locator(".haul-num").allTextContents()), ["+2", "+1"], "welcome back rows");
    expectEq(await haul(page).locator("button").getAttribute("aria-label"), "Back from the Rock pile: 2 coins and 1 Stone. Tap to collect.", "card label");
    expectEq(await jobCard(page).count(), 0, "job card after calling back");
    await haul(page).locator("button").click();
    await haul(page).waitFor({ state: "detached", timeout: 5000 });
    const saved = await savedGame(page);
    expectEq(saved.coins, 2, "saved coins");
    expectEq(saved.inventory.stone, 1, "saved stone");
    expectEq(saved.creature.job ?? null, null, "saved job");
    expectEq(saved.creature.stats.energy, 75, "energy not given back and not taken again (90 less the Rock pile's 15)");
    expectEq(saved.hauls, [], "hauls after collecting");
    return "Call back now: 2 coins, 1 Stone, then +2 and +1 on the welcome-back card, and the save holds 2 coins and 1 Stone, the same energy and no job";
  },

  "callback-coin-only": async (open) => {
    const { page } = await open("away-pond"); // a third of six minutes: 1 coin, no fish
    await callBackButton(page).click();
    await haul(page).waitFor({ state: "visible", timeout: 5000 });
    expectEq(trimAll(await haul(page).locator(".haul-num").allTextContents()), ["+1"], "welcome back rows");
    expectEq(await haul(page).locator("button").getAttribute("aria-label"), "Back from the Pond: 1 coin. Tap to collect.", "card label");
    const saved = await savedGame(page);
    expectEq(saved.coins, 1, "saved coins");
    expectEq(saved.inventory.fish ?? 0, 0, "saved fish");
    expectEq(saved.hauls.length, 1, "hauls waiting");
    return "a call back worth a coin and no fish shows one row (+1), reads '1 coin' (not '1 coins') and saves 1 coin";
  },

  "callback-nothing": async (open) => {
    const { page } = await open("away-start"); // 30 seconds of three minutes: nothing yet
    expectEq(trimAll(await callBackButton(page).allTextContents()), ["Call back now: nothing earned yet"], "button words");
    await callBackButton(page).click();
    await page.getByRole("group", { name: "Places to work" }).waitFor({ state: "visible", timeout: 5000 });
    expectEq(await haul(page).count(), 0, "welcome back cards");
    expectEq(await jobCard(page).count(), 0, "job cards");
    const saved = await savedGame(page);
    expectEq(saved.coins, 0, "saved coins");
    expectEq(saved.hauls, [], "saved hauls");
    expectEq(saved.creature.job ?? null, null, "saved job");
    return "a call back that earned nothing brings the creature home with no welcome-back card and no coins";
  },

  "callback-twice": async (open) => {
    const { page } = await open("away-rocks");
    // Two synthetic clicks inside ONE evaluate, on purpose: the second must land before Preact redraws.
    await page.evaluate(() => {
      const b = document.querySelector(".job-card button");
      b.click();
      b.click();
    });
    await haul(page).waitFor({ state: "visible", timeout: 5000 });
    const saved = await savedGame(page);
    expectEq(saved.coins, 2, "saved coins after two quick taps");
    expectEq(saved.inventory.stone, 1, "saved stone after two quick taps");
    expectEq(saved.hauls.length, 1, "hauls after two quick taps");
    return "two quick taps on Call back pay once: 2 coins, 1 Stone, one welcome-back card";
  },

  "fit-scroll": async (open, env) => {
    const report = await layoutReport(open, env);
    for (const { label, value } of report) if (value.scroll.length > 0) throw new Error(`${label}: ${value.scroll.join("; ")}`);
    return `${report.length} card states do not scroll sideways or end past the window`;
  },

  "fit-clip": async (open, env) => {
    const report = await layoutReport(open, env);
    let lines = 0;
    for (const { label, value } of report) {
      if (value.clip.cards !== 1) throw new Error(`${label}: expected one card, found ${value.clip.cards}`);
      if (value.clip.problems.length > 0) throw new Error(`${label}: ${value.clip.problems.join("; ")}`);
      if (value.clip.lines === 0) throw new Error(`${label}: no text line was measured`);
      lines += value.clip.lines;
    }
    return `${report.length} card states, ${lines} text lines measured: every one sits inside its own box and the card`;
  },

  "fit-tap": async (open, env) => {
    const report = await layoutReport(open, env);
    let total = 0;
    for (const { label, value } of report) {
      if (value.tap.problems.length > 0) throw new Error(`${label}: ${value.tap.problems.join("; ")}`);
      total += value.tap.buttons;
    }
    if (total === 0) throw new Error("no button was measured");
    return `${report.length} card states, ${total} buttons, all at least 44 px high and wide`;
  },

  "btn-look": async (open) => {
    let buttons = 0;
    for (const scenario of ["home", "away-rocks"]) {
      const { page } = await open(scenario);
      if (scenario === "home") await tapSpot(page, "Pond");
      await page.waitForSelector(".habitat-card", { timeout: 5000 });
      const found = await page.evaluate(btnLookProblems, true);
      if (found.problems.length > 0) throw new Error(found.problems.join("; "));
      if (found.buttons === 0) throw new Error("no button was judged");
      // The control: a button made like the old defect (the card's own fill, no edge) must be caught, or this check cannot see the defect.
      if (!found.control || found.control.length === 0) throw new Error("the lazy-text control button was not caught: the check cannot see the defect");
      buttons += found.buttons;
    }
    return `${buttons} card buttons have their own fill or a 3:1 edge and a readable label, and a button with neither is caught`;
  },

  "kid-flow": async (open) => {
    const home = await open("home");
    await tapSpot(home.page, "Pond"); // one tap sends, no card
    await home.page.locator("button.callback").waitFor({ state: "visible", timeout: 5000 });
    expectEq(await home.page.locator(".habitat-card").count(), 0, "cards in Kid Mode after sending");
    const sent = await savedGame(home.page);
    expectEq(sent.creature.job, { spot: "pond", startedAt: T, endsAt: T + 6 * MIN }, "saved job after one tap");
    expectEq(sent.creature.stats.energy, 80, "energy after one tap");

    const away = await open("away-rocks");
    expectEq(await away.page.locator(".habitat-card").count(), 0, "cards in Kid Mode while away");
    expectEq(await away.page.locator("button.callback").count(), 1, "house buttons while away");
    expectEq(trimAll(await away.page.locator("button.callback").allTextContents()), [""], "the house button has no words");
    await away.page.locator("button.callback").click();
    await haul(away.page).waitFor({ state: "visible", timeout: 5000 });
    expectEq(trimAll(await haul(away.page).locator(".haul-num").allTextContents()), ["+2", "+1"], "welcome back rows in Kid Mode");
    const saved = await savedGame(away.page);
    expectEq(saved.coins, 2, "saved coins");
    expectEq(saved.inventory.stone, 1, "saved stone");
    return "Kid Mode: one tap sends, no cards anywhere, the house icon has no words, and its call back pays the same 2 coins and 1 Stone";
  },
};

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
