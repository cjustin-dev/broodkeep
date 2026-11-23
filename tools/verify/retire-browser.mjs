// Browser checks for the Retire feature (docs/adult-a1-plan.md section 3d, A1.4) in the Creature Book panel.
//
// Run: node retire-browser.mjs --base http://127.0.0.1:4173 [--only id1,id2] [--sizes 320x568@1,360x640@2] [--modes kid,adult]
// Exit: 0 when no check failed and at least one ran; 1 when any FAIL; 2 when the script broke (a requested --only id ran zero times,
// an unknown id, a bad flag, or a crash outside a check). A check that throws or times out prints a FAIL line, never a crash.
// The saves come from gen-saves (saves/<scenario>-<mode>.json, written beforehand). Expected values are literals here, copied from
// src/game/retire.ts and the plan; the page's own functions are never used to compute them.
// The double-tap check fires two synthetic .click() calls inside ONE page.evaluate, on purpose: the second must land before Preact redraws.
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

// Game time 2026-11-22T15:00:00Z (frozen), and the adult's hatch time 2026-11-12T10:00:00Z, in ms.
const T = 1795359600000;
const BORN = 1794477600000;
const MIN = 60_000;
const DAY = 86_400_000;

// Every words line, copied from src/game/retire.ts (retireText) for "Gravelhorn", plus the dates line.
const TXT = {
  heading: "This creature",
  ready: "Gravelhorn is grown up.",
  button: "Retire Gravelhorn",
  teaser: "A grown-up creature can retire here, to be kept in the Book as a completed life.",
  away: "Gravelhorn is away at Bug meadow. It can retire once it is home.",
  fight: "Finish the fight first, then Gravelhorn can retire.",
  cardTitle: "Retire Gravelhorn?",
  cardBody:
    "Gravelhorn has lived a full life. Retiring keeps it in the Book as a completed life. It will not be in your home or need care again, and a new egg starts. Your coins, bag and Book stay as they are. You cannot bring it back, and you can look at Gravelhorn under Completed lives.",
  confirm: "Retire, complete, pass on",
  keep: "Keep playing",
  done: "Gravelhorn is in your Book as a completed life. A new egg has started.",
  lives: "Completed lives",
  dates: "12 Nov to 22 Nov",
};

const ALL_IDS = [
  "sec-ready",
  "sec-teaser",
  "sec-away",
  "sec-fight",
  "sec-egg",
  "card-open",
  "card-keep",
  "card-reset",
  "confirm-record",
  "confirm-status",
  "confirm-room",
  "fit-scroll",
  "fit-clip",
  "fit-tap",
  "btn-look",
  "face-slot",
  "stale-confirm",
  "double-tap",
  "tray-reset",
  "life-unknown",
  "life-order",
];
const DEFAULT_SIZES = [
  [320, 568, 1],
  [320, 568, 2],
  [360, 640, 1],
  [360, 640, 2],
  [390, 844, 1],
  [390, 844, 2],
];
const ALL_MODES = ["kid", "adult"];
const CHECK_TIMEOUT_MS = 120_000;

// ---------- small helpers (no closures: the page functions below are sent to the browser as source) ----------

const trimAll = (list) => list.map((s) => s.trim());

function expectEq(actual, expected, what) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${what}: expected ${e}, got ${a}`);
}

function sortKeys(value) {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((k) => [k, sortKeys(value[k])]),
    );
  }
  return value;
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

// Runs in the page: the panel does not scroll sideways, and nothing inside it ends past the window's width.
function fitScrollProblems() {
  const iw = window.innerWidth;
  const problems = [];
  const doc = document.documentElement;
  if (doc.scrollWidth > iw) problems.push(`page scrollWidth ${doc.scrollWidth} > innerWidth ${iw}`);
  const dialog = document.querySelector('section.panel[role="dialog"]');
  if (!dialog) return ["no dialog"];
  for (const el of dialog.querySelectorAll("*")) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.right > iw + 0.5) problems.push(`${el.tagName.toLowerCase()}.${el.getAttribute("class") ?? ""} ends at ${Math.round(r.right)}`);
  }
  return problems.slice(0, 5);
}

// Runs in the page: every text line of the section and the list sits inside its own element's box (measured with a Range).
function fitClipProblems() {
  const iw = window.innerWidth;
  const problems = [];
  const roots = [...document.querySelectorAll('section[role="dialog"] section.retire, section[role="dialog"] .book-lives')];
  for (const root of roots) {
    for (const el of [root, ...root.querySelectorAll("*")]) {
      const hasText = [...el.childNodes].some((n) => n.nodeType === Node.TEXT_NODE && n.textContent.trim() !== "");
      if (!hasText) continue;
      const box = el.getBoundingClientRect();
      const range = document.createRange();
      range.selectNodeContents(el);
      for (const r of range.getClientRects()) {
        if (r.width === 0) continue;
        if (r.left < box.left - 0.5 || r.right > box.right + 0.5 || r.right > iw + 0.5 || r.left < -0.5) {
          problems.push(`${el.tagName.toLowerCase()} "${el.textContent.trim().slice(0, 40)}" line ends at ${Math.round(r.right)} in a box ending at ${Math.round(box.right)}`);
        }
      }
    }
  }
  return problems.slice(0, 5);
}

// Runs in the page: the life rows as "Name|dates" plus how many picture elements each row has.
function lifeRows() {
  return [...document.querySelectorAll('section[role="dialog"] .book-lives .book-life')].map((el) => ({
    name: el.querySelector(".book-life-name")?.textContent.trim() ?? null,
    dates: el.querySelector(".book-life-dates")?.textContent.trim() ?? null,
    pictures: el.querySelectorAll("img, canvas, svg").length,
  }));
}

// Runs in the page: every button of the Retire section can be told from the surface behind it, and its label can be read. The surface is
// the nearest ancestor with a filled background. A button passes when its fill or its edge (an inset ring of 1 px or more, or a border) has
// contrast of 3:1 against that surface, and its label has 4.5:1 against its own fill. With `withControl` a button made like the old defect
// (the card's own fill, no edge) is added to the card first, and what was said about it comes back too: the check shows it can see the defect.
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
  // The colour of the button's own edge, or null. A shadow ring that is see-through does not count: only a solid edge is trusted here.
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
    const card = document.querySelector('section[role="dialog"] .retire-card');
    if (!card) return { problems: ["no card to put the control button in"], buttons: 0, control: null };
    const fake = document.createElement("button");
    fake.textContent = "Lazy text";
    fake.style.cssText = `appearance:none;border:0;box-shadow:none;background:${getComputedStyle(card).backgroundColor};color:${getComputedStyle(card).color}`;
    card.appendChild(fake);
    control = judge(fake);
    fake.remove();
  }
  const buttons = [...document.querySelectorAll('section[role="dialog"] section.retire button')];
  return { problems: buttons.flatMap(judge).slice(0, 5), buttons: buttons.length, control };
}

// Runs in the page: every face picture sits inside its slot, and every slot inside the row or card that holds it. The counts come back too,
// so a check that finds no face at all cannot pass: `section` is the pictures in the Retire section, `lives` those in the list.
function faceSlotProblems() {
  const problems = [];
  const counts = { slots: 0, section: 0, lives: 0 };
  for (const slot of document.querySelectorAll('section[role="dialog"] .book-life-face')) {
    counts.slots += 1;
    const s = slot.getBoundingClientRect();
    const host = slot.closest(".retire-head, .retire-who, .book-life").getBoundingClientRect();
    if (s.left < host.left - 0.5 || s.right > host.right + 0.5) problems.push(`a slot ${Math.round(s.width)} px wide ends outside its row (${Math.round(s.left)} to ${Math.round(s.right)})`);
    for (const img of slot.querySelectorAll("img")) {
      counts[slot.closest("section.retire") ? "section" : "lives"] += 1;
      const r = img.getBoundingClientRect();
      if (r.left < s.left - 0.5 || r.right > s.right + 0.5) problems.push(`a face ${Math.round(r.width)} px wide in a slot ${Math.round(s.width)} px wide`);
    }
  }
  return { problems: problems.slice(0, 5), counts };
}

// ---------- page helpers (run in Node, drive the page with real clicks) ----------

const dialog = (page) => page.locator('section.panel[role="dialog"][aria-label="Creature Book"]');
const section = (page) => dialog(page).locator("section.retire");
const cardOf = (page) => dialog(page).locator(".retire-card");
const retireButton = (page) => section(page).getByRole("button", { name: TXT.button, exact: true });
const confirmButton = (page) => cardOf(page).getByRole("button", { name: TXT.confirm, exact: true });
const keepButton = (page) => cardOf(page).getByRole("button", { name: TXT.keep, exact: true });

async function openBook(page) {
  await page.locator('button[aria-label^="Creature Book"]').first().click();
  await dialog(page).waitFor({ state: "visible", timeout: 5000 });
}

async function closeBook(page) {
  await dialog(page).getByRole("button", { name: "Close", exact: true }).click();
  await dialog(page).waitFor({ state: "detached", timeout: 5000 });
}

async function openCard(page) {
  await openBook(page);
  await retireButton(page).click();
  await cardOf(page).waitFor({ state: "visible", timeout: 5000 });
}

async function confirmRetire(page) {
  await confirmButton(page).click();
  await page.waitForTimeout(800);
}

// Starts a game in the page's own origin: the saved game is written to IndexedDB from a stub page, then the app loads and finds it.
async function openGame(env, scenario, track) {
  const context = await env.browser.newContext({
    viewport: { width: env.w, height: env.h },
    deviceScaleFactor: env.dpr,
    locale: "en-US",
    timezoneId: "UTC",
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
  const save = JSON.parse(readFileSync(join(SAVES, `${scenario}-${env.mode}.json`), "utf8"));
  const stub = `${env.base}/seed`;
  await page.route(stub, (route) => route.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html><title>seed</title>" }));
  await page.goto(stub);
  await page.evaluate(seedSave, save);
  await page.goto(`${env.base}/`);
  await page.waitForSelector('button[aria-label^="Creature Book"]', { timeout: 20000 });
  await page.waitForTimeout(300);
  return { page, errors };
}

// ---------- the checks: each returns a detail string, or throws ----------

const checks = {
  "sec-ready": async (open) => {
    const { page } = await open("adult-home");
    await openBook(page);
    expectEq(trimAll(await section(page).locator("h3").allTextContents()), [TXT.heading], "heading");
    expectEq(trimAll(await section(page).locator("p.hint").allTextContents()), [TXT.ready], "line");
    expectEq(trimAll(await section(page).locator("button").allTextContents()), [TXT.button], "button");
    return "heading, line and Retire button read as written";
  },

  "sec-teaser": async (open) => {
    const { page } = await open("young-home");
    await openBook(page);
    expectEq(trimAll(await section(page).locator("h3").allTextContents()), [TXT.heading], "heading");
    expectEq(trimAll(await section(page).locator("p.hint").allTextContents()), [TXT.teaser], "teaser line");
    expectEq(await dialog(page).getByRole("button", { name: /^Retire / }).count(), 0, "Retire buttons");
    return "teaser only, no Retire button";
  },

  "sec-away": async (open) => {
    const { page } = await open("adult-away");
    await openBook(page);
    expectEq(trimAll(await section(page).locator("p.hint").allTextContents()), [TXT.away], "away line");
    expectEq(await dialog(page).getByRole("button", { name: /^Retire / }).count(), 0, "Retire buttons");
    return "away line with Bug meadow, no Retire button";
  },

  "sec-fight": async (open) => {
    const { page } = await open("adult-fight");
    await page.getByRole("button", { name: "Arena", exact: true }).click();
    await page.locator('button[aria-label="Fight a wild creature"]').click();
    await page.locator('button[aria-label="Attack"]').waitFor({ state: "visible", timeout: 5000 });
    await openBook(page);
    expectEq(trimAll(await section(page).locator("p.hint").allTextContents()), [TXT.fight], "fight line");
    expectEq(await dialog(page).getByRole("button", { name: /^Retire / }).count(), 0, "Retire buttons");
    return "fight in progress: finish-the-fight line, no Retire button";
  },

  "sec-egg": async (open) => {
    const { page } = await open("egg");
    await openBook(page);
    expectEq(await section(page).count(), 0, "retire section count");
    expectEq(await dialog(page).getByRole("heading", { name: TXT.heading, exact: true }).count(), 0, "This creature heading");
    return "egg: no This creature section (Book open)";
  },

  "card-open": async (open) => {
    const { page } = await open("adult-home");
    await openBook(page);
    await retireButton(page).click();
    await cardOf(page).waitFor({ state: "visible", timeout: 5000 });
    expectEq(trimAll(await cardOf(page).locator("h4").allTextContents()), [TXT.cardTitle], "card title");
    expectEq(trimAll(await cardOf(page).locator("p.hint").allTextContents()), [TXT.cardBody], "card body");
    expectEq(trimAll(await cardOf(page).locator(".retire-actions button").allTextContents()), [TXT.confirm, TXT.keep], "card buttons");
    await page.waitForFunction(() => document.activeElement && document.activeElement.textContent.trim() === "Keep playing", null, { timeout: 3000 }).catch(() => {});
    const focused = await page.evaluate(() => (document.activeElement ? document.activeElement.textContent.trim() : null));
    expectEq(focused, "Keep playing", "focus");
    await page.waitForTimeout(800);
    const saved = await page.evaluate(readSave);
    expectEq(saved.phase, "alive", "saved phase");
    expectEq(saved.retired, [], "saved retired list");
    return "card title, body and two buttons as written; focus on Keep playing; game unchanged";
  },

  "card-keep": async (open) => {
    const { page } = await open("adult-home");
    await openBook(page);
    await page.waitForTimeout(800);
    const before = await page.evaluate(readSave);
    await retireButton(page).click();
    await cardOf(page).waitFor({ state: "visible", timeout: 5000 });
    await keepButton(page).click();
    await cardOf(page).waitFor({ state: "detached", timeout: 5000 });
    await page.waitForTimeout(800);
    const after = await page.evaluate(readSave);
    expectEq(JSON.stringify(sortKeys(after)), JSON.stringify(sortKeys(before)), "saved game after Keep playing");
    return "Keep playing closed the card; saved game deep-equal to before the first tap";
  },

  "card-reset": async (open) => {
    const { page } = await open("adult-home");
    await openCard(page);
    expectEq(await cardOf(page).count(), 1, "card count before closing the Book (the card is open)");
    await closeBook(page); // closed with the card still open: the card is panel-local, so it must not come back
    await openBook(page);
    expectEq(await cardOf(page).count(), 0, "card count after reopening the Book");
    expectEq(await retireButton(page).count(), 1, "Retire button after reopening");
    return "closed the Book with the card open; after reopening it, no card is shown";
  },

  "confirm-record": async (open) => {
    const { page } = await open("adult-home");
    await openCard(page);
    await confirmRetire(page);
    const saved = await page.evaluate(readSave);
    expectEq(saved.phase, "egg", "phase");
    expectEq(saved.creature, null, "creature");
    expectEq(saved.retired.length, 1, "retired records");
    expectEq(saved.retired[0].formId, "gravelhorn", "formId");
    expectEq(saved.retired[0].bornAt, BORN, "bornAt");
    expectEq(saved.retired[0].retiredAt, T, "retiredAt");
    return "phase egg, creature null, one record (gravelhorn, born 12 Nov 10:00Z, retired at frozen T)";
  },

  "confirm-status": async (open) => {
    const { page } = await open("adult-home");
    await openCard(page);
    await confirmRetire(page);
    const status = dialog(page).locator('[role="status"]');
    expectEq(await status.count(), 1, "status count");
    expectEq(trimAll(await status.allTextContents()), [TXT.done], "status line");
    expectEq(trimAll(await dialog(page).locator(".book-lives h3").allTextContents()), [TXT.lives], "list heading");
    const rows = dialog(page).locator(".book-lives .book-life");
    expectEq(trimAll(await rows.locator(".book-life-name").allTextContents()), ["Gravelhorn"], "list name");
    expectEq(trimAll(await rows.locator(".book-life-dates").allTextContents()), [TXT.dates], "list dates");
    return "status line and the completed-lives row (Gravelhorn, 12 Nov to 22 Nov) as written";
  },

  "confirm-room": async (open) => {
    const { page, errors } = await open("adult-home");
    // positive controls first: before retiring the room has a creature (a care row, no egg picture)
    expectEq(await page.locator(".care").count(), 1, "care row count before retiring");
    expectEq(await page.locator('[role="img"][aria-label^="An egg"]').count(), 0, "egg picture count before retiring");
    await openCard(page);
    await confirmRetire(page);
    await closeBook(page);
    await page.waitForTimeout(800);
    expectEq(await page.locator(".care").count(), 0, "care row count after retiring (egg in the room)");
    expectEq(await page.locator('[role="img"][aria-label^="An egg"]').count(), 1, "egg picture count after retiring");
    expectEq(errors, [], "console and page errors");
    return "the room had a care row and no egg; after closing the Book it shows the egg and no care row; no console or page error";
  },

  "fit-scroll": async (open, env) => {
    const measure = async (page, state) => {
      const problems = await page.evaluate(fitScrollProblems);
      expectEq(problems, [], `no sideways overflow (${state})`);
    };
    {
      const { page } = await open("adult-home");
      await openBook(page);
      await measure(page, "ready");
      await retireButton(page).click();
      await cardOf(page).waitFor({ state: "visible", timeout: 5000 });
      await measure(page, "card");
      await confirmRetire(page);
      await measure(page, "after retire");
    }
    {
      const { page } = await open("adult-home-lives");
      await openBook(page);
      await measure(page, "lives");
    }
    return `ready, card, after retire, lives: no sideways scroll at ${env.w}px`;
  },

  "fit-clip": async (open, env) => {
    const measure = async (page, state) => {
      const problems = await page.evaluate(fitClipProblems);
      expectEq(problems, [], `every line fits (${state})`);
    };
    {
      const { page } = await open("adult-home");
      await openBook(page);
      await measure(page, "ready");
      await retireButton(page).click();
      await cardOf(page).waitFor({ state: "visible", timeout: 5000 });
      await measure(page, "card");
      await confirmRetire(page);
      await measure(page, "after retire");
    }
    {
      const { page } = await open("adult-home-lives");
      await openBook(page);
      await measure(page, "lives");
    }
    return `ready, card, after retire, lives: every line inside its box at ${env.w}px`;
  },

  "fit-tap": async (open) => {
    const { page } = await open("adult-home");
    await openBook(page);
    const readyHeights = await section(page).locator("button").evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().height)));
    expectEq(readyHeights.length, 1, "buttons in the ready state");
    expectEq(readyHeights.every((h) => h >= 44), true, `ready button heights ${JSON.stringify(readyHeights)} (need >= 44)`);
    await retireButton(page).click();
    await cardOf(page).waitFor({ state: "visible", timeout: 5000 });
    const cardHeights = await section(page).locator("button").evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().height)));
    expectEq(cardHeights.length, 3, "buttons with the card open");
    expectEq(cardHeights.every((h) => h >= 44), true, `card button heights ${JSON.stringify(cardHeights)} (need >= 44)`);
    return `ready ${JSON.stringify(readyHeights)}, card ${JSON.stringify(cardHeights)} px: all at least 44`;
  },

  "btn-look": async (open) => {
    const { page } = await open("adult-home");
    await openBook(page);
    await page.waitForTimeout(500); // the buttons ease their colours when the mouse moves over them
    const ready = await page.evaluate(btnLookProblems, false);
    expectEq(ready.buttons, 1, "buttons in the ready state");
    expectEq(ready.problems, [], "the open button can be told from the page");
    await retireButton(page).click();
    await cardOf(page).waitFor({ state: "visible", timeout: 5000 });
    await page.waitForTimeout(500);
    const card = await page.evaluate(btnLookProblems, true);
    expectEq(card.buttons, 3, "buttons with the card open");
    if (card.control === null || card.control.length === 0) throw new Error("the check did not flag a button with the card's own fill and no edge: it cannot see the defect it is for");
    expectEq(card.problems, [], "the buttons can be told from their surfaces");
    return `1 button in the ready state and 3 with the card open: each has a fill or an edge at 3:1 against its surface and a label at 4.5:1; the control button was flagged (${card.control.length} problems)`;
  },

  "face-slot": async (open) => {
    const { page } = await open("adult-home");
    await openBook(page);
    let found = await page.evaluate(faceSlotProblems);
    expectEq(found.problems, [], "faces inside their slots (ready)");
    expectEq(found.counts, { slots: 1, section: 1, lives: 0 }, "slots and pictures (ready)");
    await retireButton(page).click();
    await cardOf(page).waitFor({ state: "visible", timeout: 5000 });
    found = await page.evaluate(faceSlotProblems);
    expectEq(found.problems, [], "faces inside their slots (card open)");
    expectEq(found.counts, { slots: 2, section: 2, lives: 0 }, "slots and pictures (card open)");
    {
      const { page: listed } = await open("adult-home-lives");
      await openBook(listed);
      found = await listed.evaluate(faceSlotProblems);
      expectEq(found.problems, [], "faces inside their slots (list)");
      // the section's face, and 4 rows of which one (the form this version does not know) has a slot and no picture
      expectEq(found.counts, { slots: 5, section: 1, lives: 3 }, "slots and pictures (list)");
    }
    return "ready 1 face, card open 2, list 3 of 4 rows (the unknown form has none): every picture inside its slot and every slot inside its row";
  },

  "stale-confirm": async (open) => {
    const { page } = await open("adult-home");
    await openCard(page);
    await page.clock.setFixedTime(T + 4 * DAY); // four days on, then the confirm tap in the same step
    await confirmButton(page).click();
    await page.waitForTimeout(800);
    const saved = await page.evaluate(readSave);
    if (saved.phase === "alive") throw new Error("creature still alive four days on, so the tap was not stale: the check does not test what it claims");
    expectEq(saved.retired, [], "retired list after the stale tap");
    expectEq(await dialog(page).locator('[role="status"]').count(), 0, "status line count");
    expectEq(await cardOf(page).count(), 0, "card count");
    return `stale tap changed nothing (phase now ${saved.phase}), card closed, no status line`;
  },

  "double-tap": async (open) => {
    const { page } = await open("adult-home");
    await openCard(page);
    await page.evaluate(() => {
      const button = [...document.querySelectorAll('section[role="dialog"] .retire-actions button')].find((b) => b.textContent.trim() === "Retire, complete, pass on");
      if (!button) throw new Error("confirm button not found");
      button.click();
      button.click();
    });
    await page.waitForTimeout(800);
    const saved = await page.evaluate(readSave);
    expectEq(saved.retired.length, 1, "records after two taps");
    expectEq(trimAll(await dialog(page).locator('[role="status"]').allTextContents()), [TXT.done], "status line after two taps");
    return "two synthetic clicks: one record, the success line";
  },

  "tray-reset": async (open) => {
    const { page } = await open("adult-home");
    await page.getByRole("button", { name: "Feed", exact: true }).click();
    await page.locator('.tray[aria-label="Choose food"]').waitFor({ state: "visible", timeout: 3000 });
    await openCard(page);
    await confirmRetire(page);
    await closeBook(page);
    expectEq((await page.evaluate(readSave)).phase, "egg", "phase before the hatch");
    await page.clock.setFixedTime(T + 31 * MIN); // the egg hatches after 30 game minutes
    let saved = null;
    for (let i = 0; i < 12; i++) {
      await page.waitForTimeout(500);
      saved = await page.evaluate(readSave);
      if (saved.phase === "alive") break;
    }
    expectEq(saved.phase, "alive", "the egg hatched");
    await page.waitForTimeout(500);
    expectEq(await page.locator(".tray").count(), 0, "open trays over the newborn");
    return `egg hatched into ${saved.creature.formId}; no tray open over it`;
  },

  "life-unknown": async (open) => {
    const { page } = await open("adult-home-lives");
    await openBook(page);
    const rows = await page.evaluate(lifeRows);
    expectEq(rows.length, 4, "life rows");
    const unknown = rows.filter((r) => r.name === "A creature");
    expectEq(unknown.length, 1, "rows named A creature");
    expectEq(unknown[0].pictures, 0, "pictures in the unknown row");
    expectEq(unknown[0].dates, "2 Nov to 5 Nov", "dates of the unknown row");
    const known = rows.filter((r) => r.name !== "A creature");
    expectEq(known.map((r) => r.name).sort(), ["Barrowbun", "Gravelhorn", "Moonlop"], "other rows");
    expectEq(
      known.every((r) => r.pictures > 0),
      true,
      "pictures in the other rows",
    );
    return "constructor row reads A creature with no picture; the other three rows render";
  },

  "life-order": async (open) => {
    const { page } = await open("adult-home-lives");
    await openBook(page);
    const rows = await page.evaluate(lifeRows);
    expectEq(
      rows.map((r) => `${r.name}|${r.dates}`),
      ["Barrowbun|6 Nov to 8 Nov", "A creature|2 Nov to 5 Nov", "Moonlop|15 Oct to 30 Oct", "Gravelhorn|1 Oct to 10 Oct"],
      "rows newest first",
    );
    return "newest first: 6 Nov, 2 Nov, 15 Oct, 1 Oct";
  },
};

// ---------- the runner ----------

async function runCheck(id, env) {
  const track = [];
  const open = (scenario) => openGame(env, scenario, track);
  try {
    return await withTimeout(checks[id](open, env), CHECK_TIMEOUT_MS);
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
    for (const mode of modes) {
      for (const [w, h, dpr] of sizes) {
        for (const id of ALL_IDS) {
          if (!ids.includes(id)) continue;
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
  const neverRan = ids.filter((id) => ran[id] === 0);
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
