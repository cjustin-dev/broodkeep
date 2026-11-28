// Browser checks for A4.4 (docs/adult-a4-plan.md section 14): the Book's recipe cards, the "Next to find" line, the Perfect star (the Book's cells and count line,
// the completed lives, the Growth Forecast's line, the star awarded when a creature grows up, kept when it retires), and the layout of all of them,
// at 320, 360 and 390 wide, pixel ratio 1 and 2 (and on its side, 740 x 360 and 844 x 390, for the layout checks). The layout checks run in Adult Mode only; Kid Mode's Book is held by kid-markup here and by the Kid compare (kid-compare.mjs).
//
// Run: node recipes-browser.mjs --base http://127.0.0.1:4177 [--only id1,id2] [--sizes 320x568@1,360x640@2] [--modes kid,adult]
// Exit: 0 when no check failed and at least one ran; 1 when any FAIL; 2 when the script broke (a requested --only id ran zero times,
// an unknown id, a bad flag, or a crash outside a check). A check that throws or times out prints a FAIL line, never a crash.
// The saves come from gen-saves-recipes (saves/recipes-<scenario>-<mode>.json, written beforehand). Expected values are literals here, worked out by hand from
// src/game/growth.ts, src/data/tuning.ts, src/data/fields.ts and docs/adult-a4-plan.md section 14; the page's own functions are never used to compute them. Where a
// value depends on a saved game (a form not in the Book that has a star) it is read from that save's file, not remembered.
// The clock is frozen at T (Playwright's fake clock): to move time a check sets a new fixed time and runs the timers once (advance()).
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

const require = createRequire(process.env.PLAYWRIGHT_FROM ?? join(homedir(), "homelab-dashboard", "package.json"));
const { chromium } = require("playwright");

const OUT = process.env.VERIFY_OUT ?? join(tmpdir(), "broodkeep-verify");
const SAVES = join(OUT, "saves");

// Game time 2026-11-22T15:00:00Z (frozen), in ms.
const T = 1795359600000;
const MIN = 60_000;

// Which modes each check runs in (the others are skipped for it).
const CHECK_MODES = {
  "adult-cells": ["adult"],
  "card-toggle": ["adult"],
  "card-keys": ["adult"],
  "card-texts": ["adult"],
  "card-done": ["adult"],
  "next-line": ["adult"],
  "count-line": ["adult", "kid"],
  "stars-show": ["adult"],
  "kid-markup": ["kid"],
  "lives-star": ["adult", "kid"],
  "forecast-line": ["adult", "kid"],
  "grow-star": ["adult"],
  "retire-star": ["adult"],
  "reload-keeps": ["adult"],
  "layout-cells": ["adult"],
  "layout-cards": ["adult"],
  "card-touch": ["adult"],
  "layout-forecast": ["adult"],
};
const ALL_IDS = Object.keys(CHECK_MODES);
const ALL_MODES = ["kid", "adult"];
const LANDSCAPE_IDS = new Set(["layout-cells", "layout-cards", "card-touch", "layout-forecast"]); // the other checks do not depend on the window's shape
// Checks that drive the page with a finger run in a mobile window (isMobile, hasTouch), which a desktop window is not.
const TOUCH_CHECKS = new Set(["card-touch"]);
const DEFAULT_SIZES = [
  [320, 568, 1],
  [320, 568, 2],
  [360, 640, 1],
  [360, 640, 2],
  [390, 844, 1],
  [390, 844, 2],
  [740, 360, 2],
  [844, 390, 2],
];
const CHECK_TIMEOUT_MS = 150_000;

// ---------- the words, as literals (docs/adult-a4-plan.md section 14, tuning.growth: 15 minutes a field cell, 4 cells, 6 hours, 24 hours, 48 hours, 2 servings, 5 care cells, 4 awake hours) ----------

const HATCH = "Hatch an egg.";
const babyStep = (field) =>
  `Baby: spend 60 awake minutes in the ${field} (4 cells of 15 minutes) before another field gets 4. If 6 hours pass first, the field with the most cells wins, and a tie goes to the field of the egg's pattern (speckled Land, striped Water, swirled Sky), even when that field is not in the tie.`;
const KID_MEAT = "Kid: feed it more Meat than any other food, counted in whole cells (2 servings make a cell). After 24 hours the food with the most whole cells wins.";
const KID_OTHER = "Kid: feed it pellets and treats only, or keep the top foods tied in whole cells (3 servings against 2 is a tie). After 24 hours, a tie at the top gives this one.";
const TIER = {
  1: "Young: after 48 hours, with 5 hunger cells (a feeding that fills it up), 5 happy cells (happiness reaching full) and no mistakes. Add no mistake in the baby and kid stages for a Perfect star.",
  4: "Young: after 48 hours, with 6 or more mistakes.",
};
const CARE = "A meal it eats, a clean-up when there is something to clean, medicine while it is sick, or a pet or a tickle while it is awake counts as care.";
const SPECIAL = `Leave a baby or a kid with no care for 4 awake hours. Sleep and time away on a job do not count. ${CARE}`;
const NOTE = `Keep caring as you go: a baby or a kid with no care for 4 awake hours becomes the special form instead. ${CARE}`;
const PERFECT_ON = "Perfect run: still possible. No mistake so far in this life.";
const PERFECT_KEPT = "Perfect run. It grew up with no mistake, and the Book keeps its star.";

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

// Runs in the page: every cell of the Book in Adult Mode: one li holding one button, the button's name starting with the word the cell shows, closed, with no aria-controls and no aria-pressed.
function cellFacts() {
  const problems = [];
  const ids = new Set();
  const named = [];
  let cells = 0;
  let found = 0;
  for (const ul of document.querySelectorAll(".panel .book-row")) {
    for (const child of ul.children) if (child.tagName !== "LI") problems.push(`a <${child.tagName.toLowerCase()}> is a direct child of a row's list`);
    for (const li of ul.querySelectorAll(":scope > li")) {
      cells += 1;
      const buttons = li.querySelectorAll("button");
      if (buttons.length !== 1) {
        problems.push(`a cell holds ${buttons.length} buttons`);
        continue;
      }
      const b = buttons[0];
      if (!li.classList.contains("book-cell") || !li.classList.contains("book-cell-adult") || b.parentElement !== li || !b.classList.contains("book-cell-btn")) problems.push("a cell is not li.book-cell.book-cell-adult > button.book-cell-btn");
      ids.add(b.id);
      const shown = li.querySelector(".book-name").textContent.trim();
      const label = b.getAttribute("aria-label");
      const isFound = li.getAttribute("data-found") === "true";
      if (isFound) {
        found += 1;
        named.push(label);
      }
      if (!label.startsWith(shown)) problems.push(`the button "${label}" does not start with the word shown, "${shown}"`);
      if (!isFound && (shown !== "???" || label !== "???, not raised yet")) problems.push(`an unraised cell shows "${shown}" and is named "${label}"`);
      if (isFound && !/, raised(, Perfect star)?$/.test(label)) problems.push(`the raised cell "${label}" does not end ", raised" or ", raised, Perfect star"`);
      if (b.getAttribute("aria-expanded") !== "false") problems.push(`"${label}" has aria-expanded=${b.getAttribute("aria-expanded")} with no card open`);
      if (b.hasAttribute("aria-controls")) problems.push(`"${label}" has aria-controls while closed`);
      if (b.hasAttribute("aria-pressed")) problems.push(`"${label}" has aria-pressed`);
    }
  }
  return { problems: problems.slice(0, 5), cells, found, ids: ids.size, named };
}

// Runs in the page: which card is open, which cell says so, and where focus is.
function toggleState() {
  const cards = [...document.querySelectorAll(".panel .book-card")];
  const expanded = [...document.querySelectorAll('.panel .book-cell-btn[aria-expanded="true"]')];
  const card = cards[0] ?? null;
  return {
    cards: cards.length,
    expanded: expanded.map((b) => b.id),
    controls: expanded.map((b) => b.getAttribute("aria-controls")),
    cardId: card ? card.id : null,
    cardIsItsId: card ? document.getElementById(card.id) === card : null,
    cardRole: card ? card.getAttribute("role") : null,
    afterItsRow: card && expanded[0] ? card.previousElementSibling !== null && card.previousElementSibling.tagName === "UL" && card.previousElementSibling.contains(expanded[0]) : null,
    withControls: document.querySelectorAll(".panel .book-cell-btn[aria-controls]").length,
    focus: document.activeElement ? document.activeElement.id : null,
  };
}

// Runs in the page: what the one open card says.
function cardFacts() {
  const cards = document.querySelectorAll(".panel .book-card");
  if (cards.length !== 1) return { count: cards.length };
  const card = cards[0];
  const steps = [...card.querySelectorAll("ol.book-steps > li.book-step")].map((li) => ({
    text: [...li.childNodes]
      .filter((n) => n.nodeType === 3)
      .map((n) => n.textContent)
      .join("")
      .trim(),
    pill: li.querySelector(".book-step-done") ? li.querySelector(".book-step-done").textContent.trim() : null,
    flag: li.getAttribute("data-done"),
  }));
  const notes = [...card.querySelectorAll(":scope > p.hint")].map((p) => p.textContent.trim());
  const raised = card.querySelector(".book-card-title > p.hint");
  const star = card.querySelector(".book-card-star");
  const close = card.querySelector(".book-card-close");
  return {
    count: 1,
    role: card.getAttribute("role"),
    label: card.getAttribute("aria-label"),
    name: card.querySelector("h4").textContent.trim(),
    raised: raised ? raised.textContent.trim() : null,
    star: star ? star.textContent.trim() : null,
    steps,
    notes,
    close: close ? close.textContent.trim() : null,
  };
}

// Runs in the page: the Book's count line, the Next line, and the stars on the cells.
function bookFacts() {
  const body = document.querySelector(".panel .panel-body");
  const count = body.querySelector(":scope > p.hint");
  const next = body.querySelector(".book-next");
  const strips = [...document.querySelectorAll(".panel .book-star-strip")];
  const starred = strips.filter((s) => s.querySelector("img")).map((s) => s.closest("button").getAttribute("aria-label"));
  return {
    count: count ? count.textContent.replace(/\s+/g, " ").trim() : null,
    next: next ? next.textContent.replace(/\s+/g, " ").trim() : null,
    strips: strips.length,
    starred,
    adultCells: document.querySelectorAll(".panel .book-cell-adult").length,
    plainCells: document.querySelectorAll(".panel li.book-cell").length,
    buttons: document.querySelectorAll(".panel .book-row button").length,
    cards: document.querySelectorAll(".panel .book-card").length,
    hints: [...document.querySelectorAll(".panel .book-hint")].map((h) => h.textContent.trim()),
    lives: [...document.querySelectorAll(".panel .book-life")].map((li) => ({
      name: li.querySelector(".book-life-name").textContent.trim(),
      star: li.querySelector(".book-life-star") ? { role: li.querySelector(".book-life-star").getAttribute("role"), label: li.querySelector(".book-life-star").getAttribute("aria-label") } : null,
    })),
  };
}

// Runs in the page: the Forecast's Perfect line and the star beside the tier.
function forecastFacts() {
  const panel = document.querySelector('section[aria-label="Growth Forecast"]');
  const line = panel.querySelector(".fc-perfect");
  const star = panel.querySelector(".fc-lead .fc-sub .fc-star");
  return {
    line: line ? { kind: line.getAttribute("data-kind"), text: line.textContent.replace(/\s+/g, " ").trim(), icons: line.querySelectorAll("img").length } : null,
    star: star ? { role: star.getAttribute("role"), label: star.getAttribute("aria-label") } : null,
    stars: panel.querySelectorAll(".fc-star").length,
    mentionsPerfect: /perfect/i.test(panel.textContent),
  };
}

// Runs in the page: the cells fit: nothing scrolls sideways, every cell is at least 44 px each way and in the window, a row's cells are one height, each star is inside a 16 px strip
// that is above the face (never on it), the face is inside the cell, and every line of a name (a Range, not scrollWidth) is inside the cell.
function cellFit() {
  const iw = window.innerWidth;
  const problems = [];
  const doc = document.documentElement;
  if (doc.scrollWidth > iw) problems.push(`page scrollWidth ${doc.scrollWidth} > innerWidth ${iw}`);
  if (doc.clientWidth !== iw) problems.push(`the page's layout width ${doc.clientWidth} is not the window's ${iw}`);
  const panel = document.querySelector(".panel");
  if (panel.scrollWidth > panel.clientWidth + 0.5) problems.push(`the panel scrolls sideways: ${panel.scrollWidth} in ${panel.clientWidth}`);
  let cells = 0;
  let stars = 0;
  let lines = 0;
  for (const ul of document.querySelectorAll(".panel .book-row")) {
    const buttons = [...ul.querySelectorAll(":scope > li > button.book-cell-btn")];
    const heights = new Set(buttons.map((b) => Math.round(b.getBoundingClientRect().height * 2) / 2));
    if (heights.size > 1) problems.push(`the cells of one row differ in height: ${[...heights].join(", ")}`);
    for (const b of buttons) {
      cells += 1;
      const r = b.getBoundingClientRect();
      const label = b.getAttribute("aria-label");
      if (r.width < 44 || r.height < 44) problems.push(`"${label}" is ${Math.round(r.width)} x ${Math.round(r.height)}`);
      if (r.left < -0.5 || r.right > iw + 0.5) problems.push(`"${label}" is at ${Math.round(r.left)} to ${Math.round(r.right)} in a window ${iw} wide`);
      const strip = b.querySelector(".book-star-strip");
      const face = b.querySelector(":scope > img.pic");
      if (!strip || !face) {
        problems.push(`"${label}" has no star strip or no face`);
        continue;
      }
      const sr = strip.getBoundingClientRect();
      const fr = face.getBoundingClientRect();
      if (Math.abs(sr.height - 16) > 0.5) problems.push(`the strip of "${label}" is ${sr.height} px high, not 16`);
      if (sr.bottom > fr.top + 0.5) problems.push(`the strip of "${label}" ends at ${sr.bottom.toFixed(1)}, below the face's top ${fr.top.toFixed(1)}`);
      // The baseline on main, Kid Mode's cells too: a face is `rows * 1.5` px (72 px for the largest drawings) and at 320 wide a quarter-width cell is 67.5 px, so the face overhangs its cell by
      // 2.25 px on each side, inside the 6 px gap between cells (origin/main's Cell has the same `px={Math.round(sprite.rows.length * 1.5)}`; a face wider than 72.5 px fails the 320 run). So: at 320 wide at most
      // 2.5 px past the cell on either side, in every wider window at most 0.5 px, and in the middle of the cell.
      const overhang = iw <= 320 ? 2.5 : 0.5; // (only the 320 wide window has one)
      if (fr.left < r.left - overhang || fr.right > r.right + overhang) problems.push(`the face of "${label}" is ${Math.round(fr.width)} px wide in a cell ${Math.round(r.width)} px wide`);
      if (Math.abs(fr.left + fr.right - r.left - r.right) > 1) problems.push(`the face of "${label}" is not in the middle of its cell (face ${fr.left.toFixed(1)} to ${fr.right.toFixed(1)}, cell ${r.left.toFixed(1)} to ${r.right.toFixed(1)})`);
      const star = strip.querySelector("img");
      if (star) {
        stars += 1;
        const st = star.getBoundingClientRect();
        if (st.top < sr.top - 0.5 || st.bottom > sr.bottom + 0.5 || st.left < r.left - 0.5 || st.right > r.right + 0.5) problems.push(`the star of "${label}" sticks out of its strip`);
        if (st.bottom > fr.top + 0.5 && st.right > fr.left + 0.5 && st.left < fr.right - 0.5) problems.push(`the star of "${label}" is on its face`);
      }
      const name = b.querySelector(".book-name");
      const range = document.createRange();
      range.selectNodeContents(name);
      for (const line of range.getClientRects()) {
        if (line.width === 0) continue;
        lines += 1;
        if (line.left < r.left - 0.5 || line.right > r.right + 0.5) problems.push(`the name in "${label}" runs outside its cell (${Math.round(line.left)} to ${Math.round(line.right)}, cell ${Math.round(r.left)} to ${Math.round(r.right)})`);
      }
    }
  }
  return { problems: problems.slice(0, 5), cells, stars, lines };
}

// Runs in the page: the open card fits: nothing scrolls sideways, every element of the panel is inside the window (a clipping box hides overflow from scrollWidth), the card is under its
// own row, every line of its text (a Range) is inside its element and the card, the Close button is 44 px each way, each Done pill is inside its step, and the top of the card is in the
// part of the panel that shows (all of it when it is short enough to fit).
function cardFit() {
  const iw = window.innerWidth;
  const problems = [];
  const card = document.querySelector(".panel .book-card");
  if (!card) return { problems: ["no card on the screen"], lines: 0, elements: 0 };
  const cb = card.getBoundingClientRect();
  const doc = document.documentElement;
  if (doc.scrollWidth > iw) problems.push(`page scrollWidth ${doc.scrollWidth} > innerWidth ${iw}`);
  if (doc.clientWidth !== iw) problems.push(`the page's layout width ${doc.clientWidth} is not the window's ${iw}`);
  const panel = document.querySelector(".panel");
  const pb = panel.getBoundingClientRect();
  if (panel.scrollWidth > panel.clientWidth + 0.5) problems.push(`the panel scrolls sideways: ${panel.scrollWidth} in ${panel.clientWidth}`);
  const row = card.previousElementSibling;
  if (!row || row.tagName !== "UL" || !row.classList.contains("book-row")) problems.push("the card does not follow a row's list");
  else if (cb.top < row.getBoundingClientRect().bottom - 0.5) problems.push(`the card starts at ${Math.round(cb.top)}, above the end of its row (${Math.round(row.getBoundingClientRect().bottom)})`);
  let elements = 0;
  for (const el of panel.querySelectorAll("*")) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) continue;
    elements += 1;
    if (r.left < -0.5 || r.right > iw + 0.5) problems.push(`<${el.tagName.toLowerCase()} class="${el.className}"> is at ${Math.round(r.left)} to ${Math.round(r.right)} in a window ${iw} wide`);
  }
  let lines = 0;
  for (const part of card.querySelectorAll("h4, p, li.book-step, .book-step-done, .book-card-close")) {
    const box = part.getBoundingClientRect();
    const range = document.createRange();
    range.selectNodeContents(part);
    for (const line of range.getClientRects()) {
      if (line.width === 0) continue;
      lines += 1;
      if (line.left < box.left - 0.5 || line.right > box.right + 0.5 || line.left < cb.left - 0.5 || line.right > cb.right + 0.5) problems.push(`a line of <${part.tagName.toLowerCase()} class="${part.className}"> runs outside its box: ${Math.round(line.left)} to ${Math.round(line.right)}`);
    }
  }
  const close = card.querySelector(".book-card-close");
  const cr = close.getBoundingClientRect();
  if (cr.width < 44 || cr.height < 44) problems.push(`the Close button is ${Math.round(cr.width)} x ${Math.round(cr.height)}`);
  for (const pill of card.querySelectorAll(".book-step-done")) {
    const r = pill.getBoundingClientRect();
    const li = pill.closest("li").getBoundingClientRect();
    if (r.left < li.left - 0.5 || r.right > li.right + 0.5 || r.top < li.top - 0.5 || r.bottom > li.bottom + 0.5) problems.push("a Done mark sticks out of its step");
  }
  if (cb.top < pb.top - 0.5 || cb.top > pb.bottom - 44) problems.push(`the card starts at ${Math.round(cb.top)}, outside the part of the panel that shows (${Math.round(pb.top)} to ${Math.round(pb.bottom)})`);
  if (cb.height <= pb.height && cb.bottom > pb.bottom + 0.5) problems.push(`the card is ${Math.round(cb.height)} high, fits the panel's ${Math.round(pb.height)}, but ends at ${Math.round(cb.bottom)}, below the panel's end ${Math.round(pb.bottom)}`);
  return { problems: problems.slice(0, 5), lines, elements, top: cb.top, bottom: cb.bottom, panelTop: pb.top, panelBottom: pb.bottom };
}

// Runs in the page: the Forecast fits: nothing scrolls sideways, every element is inside the window, the Perfect line's text lines are inside it, and the lead's star is inside the lead
// card and on its tier line.
function forecastFit() {
  const iw = window.innerWidth;
  const problems = [];
  const doc = document.documentElement;
  if (doc.scrollWidth > iw) problems.push(`page scrollWidth ${doc.scrollWidth} > innerWidth ${iw}`);
  const panel = document.querySelector('section[aria-label="Growth Forecast"]');
  if (panel.scrollWidth > panel.clientWidth + 0.5) problems.push(`the panel scrolls sideways: ${panel.scrollWidth} in ${panel.clientWidth}`);
  let elements = 0;
  for (const el of panel.querySelectorAll("*")) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) continue;
    elements += 1;
    if (r.left < -0.5 || r.right > iw + 0.5) problems.push(`<${el.tagName.toLowerCase()} class="${el.className}"> is at ${Math.round(r.left)} to ${Math.round(r.right)} in a window ${iw} wide`);
  }
  let lines = 0;
  const perfect = panel.querySelector(".fc-perfect");
  if (perfect) {
    const pb = perfect.getBoundingClientRect();
    const range = document.createRange();
    range.selectNodeContents(perfect.querySelector("span"));
    for (const line of range.getClientRects()) {
      if (line.width === 0) continue;
      lines += 1;
      if (line.left < pb.left - 0.5 || line.right > pb.right + 0.5) problems.push(`a line of the Perfect run text runs outside its box: ${Math.round(line.left)} to ${Math.round(line.right)}`);
    }
    const mark = perfect.querySelector("img");
    if (mark) {
      const icon = mark.getBoundingClientRect();
      if (icon.left < pb.left - 0.5 || icon.right > pb.right + 0.5 || icon.top < pb.top - 0.5 || icon.bottom > pb.bottom + 0.5) problems.push("the star of the Perfect run line sticks out of it");
    }
  }
  const star = panel.querySelector(".fc-lead .fc-star");
  if (star) {
    const lead = panel.querySelector(".fc-lead").getBoundingClientRect();
    const sub = panel.querySelector(".fc-lead .fc-sub");
    const sr = star.getBoundingClientRect();
    const subBox = sub.getBoundingClientRect();
    if (sr.left < lead.left - 0.5 || sr.right > lead.right + 0.5 || sr.top < lead.top - 0.5 || sr.bottom > lead.bottom + 0.5) problems.push("the star beside the tier sticks out of the lead card");
    if (sr.top < subBox.top - 0.5 || sr.bottom > subBox.bottom + 0.5) problems.push(`the star beside the tier is not on the tier line (star ${Math.round(sr.top)} to ${Math.round(sr.bottom)}, line ${Math.round(subBox.top)} to ${Math.round(subBox.bottom)})`);
    const name = panel.querySelector(".fc-lead .fc-name").getBoundingClientRect();
    if (sr.top < name.bottom - 0.5) problems.push("the star beside the tier is not below the name");
    // level with the tier's own words: its centre is inside the last line of the text before it
    const words = [...sub.childNodes].find((n) => n.nodeType === 3);
    const range = document.createRange();
    range.selectNodeContents(words);
    const rects = [...range.getClientRects()].filter((r) => r.width > 0);
    const last = rects[rects.length - 1];
    const centre = (sr.top + sr.bottom) / 2;
    if (!last || centre < last.top - 1 || centre > last.bottom + 1) problems.push(`the star beside the tier is not level with the tier's words (its centre ${Math.round(centre)}, the words ${last ? Math.round(last.top) + " to " + Math.round(last.bottom) : "not found"})`);
  }
  return { problems: problems.slice(0, 5), lines, elements, star: star ? 1 : 0, perfect: perfect ? 1 : 0 };
}

// ---------- page helpers (run in Node, drive the page with real clicks) ----------

const bookButton = (page) => page.locator('button[aria-label^="Creature Book"]').first();
const bookDialog = (page) => page.locator('section[aria-label="Creature Book"]');
const forecastDialog = (page) => page.locator('section[aria-label="Growth Forecast"]');
const pageSection = (page, title) => bookDialog(page).locator(".book-page", { has: page.locator(`h3:text-is("${title}")`) });
// Cell numbers of a field page: 0 is the kid, 1 to 4 the four young, 5 to 8 the tier 1 adults, 9 to 12 tier 2, 13 to 16 tier 3, 17 to 20 tier 4 (each in the order of the young).
const cellBtn = (page, title, n) => pageSection(page, title).locator(".book-cell-btn").nth(n);

async function openBook(page, how = "click") {
  await bookButton(page)[how]({ timeout: 5000 }); // how: "click" (a mouse) or "tap" (a finger, in a touch window)
  await bookDialog(page).waitFor({ state: "visible", timeout: 5000 });
  await page.waitForTimeout(300);
}

async function openForecast(page) {
  await page.locator('button[aria-label^="Growth Forecast"]').click({ timeout: 5000 });
  await forecastDialog(page).waitFor({ state: "visible", timeout: 5000 });
  await page.waitForTimeout(300);
}

async function tapCell(page, title, n, how = "click") {
  const b = cellBtn(page, title, n);
  await b.scrollIntoViewIfNeeded({ timeout: 5000 });
  await b[how]({ timeout: 5000 });
  await page.waitForTimeout(250);
}

// Taps a cell as tapCell does and says how far the panel scrolled while its card opened (the cell is scrolled into view first, as a finger would have it).
async function tapCellMeasured(page, title, n, how = "click") {
  // a card that is still open above would shrink the page when it closes and move scrollTop by its own height: close it first, so only the new card's own scroll is measured
  const closer = bookDialog(page).locator(".book-card-close");
  if ((await closer.count()) > 0) {
    await closer[how]({ timeout: 5000 });
    await page.waitForTimeout(200);
  }
  const b = cellBtn(page, title, n);
  await b.scrollIntoViewIfNeeded({ timeout: 5000 });
  const before = await page.evaluate(() => document.querySelector(".panel").scrollTop);
  await b[how]({ timeout: 5000 });
  await page.waitForTimeout(250);
  return (await page.evaluate(() => document.querySelector(".panel").scrollTop)) - before;
}

// True when the card was already wholly in view before the panel scrolled by `delta` and the panel scrolled anyway (a card that needs no scrolling must not move the panel).
const overscrolled = (f, delta) => f.top + delta >= f.panelTop - 0.5 && f.bottom + delta <= f.panelBottom + 0.5 && Math.abs(delta) > 1;

// A finger on the screen, as the browser's protocol sends one (real touch events, the same a phone makes): down at (x, y), moved in steps to (x, y + dy), a short
// pause with the finger still down (so nothing flings), up.
async function touchDrag(cdp, x, y, dy) {
  const steps = 12;
  const send = (type, points) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: points });
  await send("touchStart", [{ x, y }]);
  for (let i = 1; i <= steps; i++) {
    await send("touchMove", [{ x, y: y + (dy * i) / steps }]);
    await new Promise((r) => setTimeout(r, 16));
  }
  await new Promise((r) => setTimeout(r, 120));
  await send("touchEnd", []);
  await new Promise((r) => setTimeout(r, 400));
}

// Moves the frozen game clock `ms` after T and runs the page's timers once (the one-second tick and the redraw).
async function advance(page, ms) {
  await page.clock.setFixedTime(T + ms);
  await page.clock.runFor(1000);
  await page.waitForTimeout(100);
}

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

const seedOf = (scenario, mode) => JSON.parse(readFileSync(join(SAVES, `recipes-${scenario}-${mode}.json`), "utf8"));

// Starts a game in the page's own origin: the saved game is written to IndexedDB from a stub page, then the app loads and finds it.
async function openGame(env, scenario, track) {
  const context = await env.browser.newContext({
    viewport: { width: env.w, height: env.h },
    deviceScaleFactor: env.dpr,
    ...(env.touch ? { isMobile: true, hasTouch: true } : {}),
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
  const stub = `${env.base}/seed`;
  await page.route(stub, (route) => route.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html><title>seed</title>" }));
  await page.goto(stub);
  await page.evaluate(seedSave, seedOf(scenario, env.mode));
  await page.goto(`${env.base}/`);
  await bookButton(page).waitFor({ timeout: 20000 }); // (an egg has no Habitat button, every game has the Book)
  await page.waitForTimeout(300);
  return { page, errors };
}

// ---------- the checks: each returns a detail string, or throws ----------

const checks = {
  "adult-cells": async (open) => {
    const { page } = await open("kid");
    await openBook(page);
    const f = await page.evaluate(cellFacts);
    if (f.problems.length > 0) throw new Error(f.problems.join("; "));
    expectEq([f.cells, f.ids, f.found], [65, 65, 2], "cells, distinct buttons, raised");
    expectEq(f.named, ["Blip, raised", "Pebblin, raised"], "the names of the two raised creatures");
    expectEq(await pageSection(page, "Baby").locator(".book-cell-btn").count(), 1, "cells on the Baby page");
    return "65 cells, each one li with one button (65 distinct ids), the name starting with the word shown, closed with no aria-controls and no aria-pressed; Blip and Pebblin are the two raised";
  },

  "card-toggle": async (open) => {
    const { page } = await open("kid");
    await openBook(page);
    expectEq(await page.evaluate(toggleState).then((s) => [s.cards, s.expanded, s.withControls]), [0, [], 0], "before any tap");
    // a tap opens the card of that cell, under that cell's row
    await tapCell(page, "Land", 1);
    const idA = await cellBtn(page, "Land", 1).getAttribute("id");
    let s = await page.evaluate(toggleState);
    expectEq([s.cards, s.expanded, s.cardRole, s.cardIsItsId, s.afterItsRow, s.withControls, s.focus], [1, [idA], "group", true, true, 1, idA], "after a tap on a young");
    expectEq(s.controls, [s.cardId], "the cell's aria-controls names the card");
    expectEq([idA.startsWith("book-cell-"), s.cardId === idA.replace("book-cell-", "book-card-")], [true, true], "the ids are book-cell-<form> and book-card-<form>");
    // Close closes it and puts focus back on the cell
    await bookDialog(page).locator(".book-card-close").click({ timeout: 5000 });
    await page.waitForTimeout(250);
    s = await page.evaluate(toggleState);
    expectEq([s.cards, s.expanded, s.withControls, s.focus], [0, [], 0, idA], "after Close");
    // a second tap on the same cell closes it, focus stays on the cell
    await tapCell(page, "Land", 1);
    await tapCell(page, "Land", 1);
    s = await page.evaluate(toggleState);
    expectEq([s.cards, s.expanded, s.withControls, s.focus], [0, [], 0, idA], "after a second tap on the same cell");
    // a tap on another cell, on another page, moves the one card
    await tapCell(page, "Land", 1);
    await tapCell(page, "Water", 0);
    const idB = await cellBtn(page, "Water", 0).getAttribute("id");
    s = await page.evaluate(toggleState);
    expectEq([s.cards, s.expanded, s.cardIsItsId, s.afterItsRow, s.withControls], [1, [idB], true, true, 1], "after a tap on a cell of another page");
    expectEq(await pageSection(page, "Water").locator(".book-card").count(), 1, "the card is on the Water page");
    expectEq(await pageSection(page, "Land").locator(".book-card").count(), 0, "no card is left on the Land page");
    // a tap on another cell of the same row moves it too
    await tapCell(page, "Land", 2);
    await tapCell(page, "Land", 3);
    s = await page.evaluate(toggleState);
    expectEq([s.cards, s.expanded.length, s.afterItsRow], [1, 1, true], "after a tap on a neighbour in the same row");
    return "a tap opens one card under its own row (aria-expanded, aria-controls to a real id, role group), Close and a second tap close it with focus back on the cell, and a tap elsewhere moves the one card";
  },

  "card-keys": async (open) => {
    const { page } = await open("kid");
    await openBook(page);
    const cell = cellBtn(page, "Land", 5);
    await cell.scrollIntoViewIfNeeded();
    await cell.focus();
    const id = await cell.getAttribute("id");
    const state = async () => page.evaluate(toggleState).then((s) => [s.cards, s.expanded.length, s.focus]);
    expectEq(await state(), [0, 0, id], "focused, nothing open");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(200);
    expectEq(await state(), [1, 1, id], "after Enter");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(200);
    expectEq(await state(), [0, 0, id], "after a second Enter");
    await page.keyboard.press("Space");
    await page.waitForTimeout(200);
    expectEq(await state(), [1, 1, id], "after Space");
    await page.keyboard.press("Space");
    await page.waitForTimeout(200);
    expectEq(await state(), [0, 0, id], "after a second Space");
    // Tab reaches each cell in the order of the page: from the first young, four presses go through the rest of its row and into the next
    await cellBtn(page, "Land", 1).focus();
    for (const n of [2, 3, 4, 5]) {
      await page.keyboard.press("Tab");
      expectEq(await cellBtn(page, "Land", n).evaluate((el) => el === document.activeElement), true, `Tab ${n - 1} from the first young reaches Land cell ${n}`);
    }
    return "Enter and Space open and close a card from the keyboard, focus stays on the cell, and Tab reaches the cells of a row and the next row in order";
  },

  "card-texts": async (open) => {
    const { page } = await open("kid");
    await openBook(page);
    // every form's name, from the repo's own data (written by gen-saves-recipes), and the two that the "kid" save has raised
    const names = JSON.parse(readFileSync(join(SAVES, "recipes-names.json"), "utf8"));
    if (names.length !== 65) throw new Error(`the names file holds ${names.length} names, not 65`);
    const raisedNames = new Set(["Blip", "Pebblin"]);
    const read = async (title, n) => {
      await tapCell(page, title, n);
      const words = new Set((await bookDialog(page).innerText()).split(/[^A-Za-z]+/));
      const leaked = names.filter((name) => !raisedNames.has(name) && words.has(name));
      if (leaked.length > 0) throw new Error(`${title} cell ${n}: the open Book's text names ${leaked.join(", ")}, which is not raised`);
      return page.evaluate(cardFacts);
    };
    const expectCard = (c, want, what) => {
      expectEq(
        [c.count, c.role, c.label, c.name, c.raised, c.star, c.steps.map((x) => x.text), c.notes, c.close],
        [1, "group", want.name, want.name, want.raised, want.star, want.steps, want.notes, "Close"],
        what,
      );
    };
    expectCard(await read("Baby", 0), { name: "Blip", raised: "Raised", star: null, steps: [HATCH], notes: [] }, "the baby's card");
    expectCard(await read("Land", 0), { name: "Pebblin", raised: "Raised", star: null, steps: [HATCH, babyStep("Land")], notes: [NOTE] }, "the Land kid's card");
    expectCard(await read("Land", 1), { name: "Not raised yet", raised: null, star: null, steps: [HATCH, babyStep("Land"), KID_MEAT], notes: [NOTE] }, "the first Land young's card");
    expectCard(await read("Land", 4), { name: "Not raised yet", raised: null, star: null, steps: [HATCH, babyStep("Land"), KID_OTHER], notes: [NOTE] }, "the fourth Land young's card");
    expectCard(await read("Land", 5), { name: "Not raised yet", raised: null, star: null, steps: [HATCH, babyStep("Land"), KID_MEAT, TIER[1]], notes: [NOTE] }, "a Land tier 1 adult's card");
    expectCard(await read("Water", 20), { name: "Not raised yet", raised: null, star: null, steps: [HATCH, babyStep("Water"), KID_OTHER, TIER[4]], notes: [NOTE] }, "a Water tier 4 adult's card");
    expectCard(await read("Special", 0), { name: "Not raised yet", raised: null, star: null, steps: [HATCH, SPECIAL], notes: [] }, "the special's card");
    return "seven cards read literally (baby, Land kid, a young, the fourth young, a tier 1 and a tier 4 adult, the special), the note only where the plan says, and none of the 63 names of creatures that are not raised in the open Book's text with any of them open";
  },

  "card-done": async (open) => {
    const { page } = await open("kid");
    await openBook(page);
    const doneOf = async (p, title, n) => {
      await tapCell(p, title, n);
      const c = await p.evaluate(cardFacts);
      return c.steps.map((s) => [s.flag, s.pill]);
    };
    expectEq(await doneOf(page, "Land", 5), [["true", "Done"], ["true", "Done"], ["false", null], ["false", null]], "Done marks on a Land tier 1 adult (Blip and Pebblin are raised)");
    expectEq(await doneOf(page, "Water", 0), [["true", "Done"], ["false", null]], "Done marks on a Water kid");
    expectEq(await doneOf(page, "Special", 0), [["true", "Done"], ["false", null]], "Done marks on the special");
    expectEq(await doneOf(page, "Baby", 0), [["true", "Done"]], "Done marks on the baby");
    const egg = await open("egg");
    await openBook(egg.page);
    expectEq(await doneOf(egg.page, "Land", 5), [["false", null], ["false", null], ["false", null], ["false", null]], "no step is Done with nothing raised");
    const full = await open("full");
    await openBook(full.page);
    expectEq(await doneOf(full.page, "Land", 5), [["true", "Done"], ["true", "Done"], ["true", "Done"], ["true", "Done"]], "every step is Done with everything raised");
    return "a step is Done when the form it makes is in the Book: two of four for a Land adult with Blip and Pebblin raised, none with nothing raised, all with everything raised";
  },

  "next-line": async (open) => {
    const NEXT = "Next to find: ";
    const want = {
      egg: `${NEXT}the baby. ${HATCH}`,
      kid: `${NEXT}a young in the Land. ${KID_MEAT}`,
      bottom: `${NEXT}a tier 4 adult in the Sky. ${TIER[4]}`,
      full: "Every creature is raised.",
    };
    for (const [scenario, text] of Object.entries(want)) {
      const { page } = await open(scenario);
      await openBook(page);
      expectEq((await page.evaluate(bookFacts)).next, text, `the Next line with the "${scenario}" save`);
    }
    return "the Next line reads literally for an empty Book, a baby and a kid raised, a Book missing only the last Sky adult, and a full Book";
  },

  "count-line": async (open, env) => {
    const star = ", 5 with a Perfect star";
    const adult = env.mode === "adult";
    const want = {
      egg: "0 of 65 creatures raised",
      kid: "2 of 65 creatures raised",
      stars: `43 of 65 creatures raised${adult ? star : ""}`,
      full: `65 of 65 creatures raised${adult ? star : ""}`,
      "growing-mistake": "3 of 65 creatures raised",
    };
    for (const [scenario, text] of Object.entries(want)) {
      const { page } = await open(scenario);
      await openBook(page);
      expectEq((await page.evaluate(bookFacts)).count, text, `the count line with the "${scenario}" save`);
    }
    return `the count line reads literally in ${env.mode} mode for five Books${adult ? ", the star count only for the forms that are in the Book (the save lists a sixth that is not)" : ", with no word of stars"}`;
  },

  "stars-show": async (open) => {
    const { page } = await open("stars");
    await openBook(page);
    const f = await page.evaluate(bookFacts);
    expectEq(f.strips, 65, "star strips (one for each cell)");
    expectEq(f.starred.length, 5, "stars on the cells");
    for (const label of f.starred) if (!/^.+, raised, Perfect star$/.test(label)) throw new Error(`a starred cell is named "${label}"`);
    // the four tier 1 adults of the Land page and the Water kid
    for (const n of [5, 6, 7, 8]) expectEq((await cellBtn(page, "Land", n).getAttribute("aria-label")).endsWith(", raised, Perfect star"), true, `Land cell ${n} is starred`);
    expectEq((await cellBtn(page, "Water", 0).getAttribute("aria-label")).endsWith(", raised, Perfect star"), true, "the Water kid is starred");
    expectEq(await cellBtn(page, "Land", 5).getAttribute("aria-label"), "Gravelhorn, raised, Perfect star", "the first tier 1 adult's name");
    for (const n of [0, 1, 4, 9]) expectEq((await cellBtn(page, "Land", n).getAttribute("aria-label")).includes("Perfect"), false, `Land cell ${n} has no star`);
    // a star the save holds for a real form that is not in the Book shows nowhere
    const seed = seedOf("stars", "adult");
    const hidden = seed.perfect.filter((id) => !seed.book.includes(id));
    expectEq(hidden.length, 1, "stars in the seed for forms that are not in the Book");
    const cell = page.locator(`#book-cell-${hidden[0]}`);
    expectEq(await cell.getAttribute("aria-label"), "???, not raised yet", "the cell of the form with a star that is not in the Book");
    expectEq(await cell.locator(".book-star-strip img").count(), 0, "a star on the cell of a form that is not in the Book");
    // an open card of a starred one says so, and of a plain one does not
    await tapCell(page, "Land", 5);
    let c = await page.evaluate(cardFacts);
    expectEq([c.name, c.raised, c.star], ["Gravelhorn", "Raised", "Perfect star"], "the starred card");
    await tapCell(page, "Land", 1);
    c = await page.evaluate(cardFacts);
    expectEq(c.star, null, "the card of an unraised creature");
    return "five stars (four Land tier 1 adults and the Water kid) on raised cells, none on others, none for a form not in the Book, and the card says Perfect star only for a starred one";
  },

  "kid-markup": async (open) => {
    const { page } = await open("stars");
    await openBook(page);
    const f = await page.evaluate(bookFacts);
    expectEq([f.plainCells, f.adultCells, f.buttons, f.strips, f.next, f.cards, f.starred], [65, 0, 0, 0, null, 0, []], "Kid Mode's Book (cells, Adult cells, buttons, star strips, Next line, cards, stars)");
    expectEq(f.count, "43 of 65 creatures raised", "Kid Mode's count line");
    // a tap on a cell does nothing
    await pageSection(page, "Land").locator("li.book-cell").nth(5).click({ timeout: 5000 });
    await page.waitForTimeout(250);
    expectEq((await page.evaluate(bookFacts)).cards, 0, "cards after a tap on a Kid cell");
    // the hints are still there
    const kid = await open("kid");
    await openBook(kid.page);
    const hints = (await kid.page.evaluate(bookFacts)).hints;
    if (hints.length === 0) throw new Error("no hint in Kid Mode's Book");
    if (!hints.includes("Leave a baby or kid alone for hours")) throw new Error(`the special's hint is missing from ${JSON.stringify(hints)}`);
    return "Kid Mode's Book keeps 65 plain cells with their hints: no button, star strip, Next line, card or star, and a tap does nothing";
  },

  "lives-star": async (open, env) => {
    const { page } = await open("lives");
    await openBook(page);
    const f = await page.evaluate(bookFacts);
    expectEq(f.lives.map((l) => l.name), ["A creature", "Mossheap", "Hollowbloom"], "the completed lives, newest first");
    if (env.mode === "adult") {
      expectEq(f.lives.map((l) => l.star), [null, null, { role: "img", label: "Perfect star" }], "the star on the completed lives");
    } else {
      expectEq(f.lives.map((l) => l.star), [null, null, null], "the star on the completed lives in Kid Mode");
    }
    return `three completed lives, newest first${env.mode === "adult" ? ", the star only on the perfect one (an image named Perfect star)" : ", no star in Kid Mode"}`;
  },

  "forecast-line": async (open, env) => {
    if (env.mode === "kid") {
      const { page } = await open("baby");
      expectEq(await page.locator('button[aria-label^="Growth Forecast"]').count(), 0, "Forecast buttons in Kid Mode");
      return "Kid Mode has no Growth Forecast to carry the line";
    }
    const want = {
      baby: { line: { kind: "on", text: PERFECT_ON, icons: 0 }, star: null },
      "baby-mistake": { line: null, star: null },
      young: { line: { kind: "on", text: PERFECT_ON, icons: 0 }, star: null },
      "young-unknown": { line: null, star: null },
      "adult-perfect": { line: { kind: "kept", text: PERFECT_KEPT, icons: 1 }, star: { role: "img", label: "Perfect star" } },
      "adult-plain": { line: null, star: null },
      special: { line: null, star: null },
    };
    for (const [scenario, w] of Object.entries(want)) {
      const { page } = await open(scenario);
      await openForecast(page);
      const f = await page.evaluate(forecastFacts);
      expectEq([f.line, f.star], [w.line, w.star], `the Forecast with the "${scenario}" save`);
      if (!w.line && f.mentionsPerfect) throw new Error(`the Forecast with the "${scenario}" save says something about a perfect run when it should say nothing`);
      expectEq(f.stars, w.star ? 1 : 0, `stars on the "${scenario}" Forecast`);
    }
    return "the Perfect line reads on for a baby and a young with a known clean record, kept (with a star by the tier) for a perfect adult, and nothing at all after a mistake, for an unknown record, for a plain adult and for the special";
  },

  "grow-star": async (open) => {
    const cases = {
      "growing-perfect": { perfect: true, past: 0, count: "4 of 65 creatures raised, 1 with a Perfect star", label: "Hollowbloom, raised, Perfect star" },
      "growing-mistake": { perfect: false, past: 1, count: "4 of 65 creatures raised", label: "Hollowbloom, raised" },
      "growing-unknown": { perfect: false, past: undefined, count: "4 of 65 creatures raised", label: "Hollowbloom, raised" },
    };
    for (const [scenario, w] of Object.entries(cases)) {
      const { page } = await open(scenario);
      const before = await savedGame(page);
      expectEq(before.perfect, [], `${scenario}: the star list before it grows`);
      const stage = before.creature.formId;
      await advance(page, 2 * MIN);
      const saved = await savedGame(page);
      if (saved.creature.formId === stage) throw new Error(`${scenario}: the creature did not grow up in two minutes`);
      expectEq(saved.creature.perfect, w.perfect ? true : undefined, `${scenario}: the creature's star flag`);
      expectEq(saved.perfect, w.perfect ? [saved.creature.formId] : [], `${scenario}: the Book's star list`);
      expectEq(saved.creature.pastMistakes, w.past, `${scenario}: the record of the earlier stages`);
      expectEq(saved.log.some((l) => l.text === "Hollowbloom grew up as a perfect run"), w.perfect, `${scenario}: the log line`);
      await openBook(page);
      const f = await page.evaluate(bookFacts);
      expectEq(f.count, w.count, `${scenario}: the count line`);
      expectEq(await cellBtn(page, "Land", 8).getAttribute("aria-label"), w.label, `${scenario}: the adult's cell`);
    }
    // the Book left open while it grows up shows the star without being opened again
    const watching = await open("growing-perfect");
    await openBook(watching.page);
    expectEq((await watching.page.evaluate(bookFacts)).count, "3 of 65 creatures raised", "the count line before it grows, Book open");
    await advance(watching.page, 2 * MIN);
    expectEq((await watching.page.evaluate(bookFacts)).count, "4 of 65 creatures raised, 1 with a Perfect star", "the count line, the Book left open while it grew up");
    expectEq(await cellBtn(watching.page, "Land", 8).getAttribute("aria-label"), "Hollowbloom, raised, Perfect star", "the adult's cell, the Book left open while it grew up");
    return "a young a minute from growing up becomes a tier 1 adult in the real game loop, in a Book that was open too: with a clean record it gets the flag, the Book's list entry, a log line and a star in the Book; with one earlier mistake, or no record, it grows up with none of them";
  },

  "retire-star": async (open) => {
    const seed = seedOf("full", "adult");
    for (const scenario of ["full", "adult-plain"]) {
      const perfect = scenario === "full";
      const { page } = await open(scenario);
      await openBook(page);
      await bookDialog(page).locator("section.retire").getByRole("button", { name: /^Retire /, exact: false }).first().click({ timeout: 5000 });
      await bookDialog(page).getByRole("button", { name: "Retire, complete, pass on", exact: true }).click({ timeout: 5000 });
      await page.waitForTimeout(300);
      const saved = await savedGame(page);
      expectEq(saved.retired.length, 1, `${scenario}: completed lives`);
      expectEq("perfect" in saved.retired[0], perfect, `${scenario}: the life carries the flag`);
      if (perfect) expectEq(saved.retired[0].perfect, true, `${scenario}: the flag's value`);
      expectEq(saved.creature, null, `${scenario}: the creature after retiring`);
      expectEq(saved.perfect, perfect ? seed.perfect : [], `${scenario}: the Book's star list after retiring`);
      const f = await page.evaluate(bookFacts);
      expectEq(f.lives.length, 1, `${scenario}: lives on the screen`);
      expectEq(f.lives[0].star, perfect ? { role: "img", label: "Perfect star" } : null, `${scenario}: the star on the new life`);
      if (perfect) expectEq(await cellBtn(page, "Land", 8).getAttribute("aria-label"), "Hollowbloom, raised, Perfect star", "the Book keeps the cell's star");
    }
    return "retiring a perfect adult puts the star on its completed life and leaves the Book's list as it was; a plain adult retires with no flag and no star";
  },

  "reload-keeps": async (open) => {
    const seed = seedOf("stars", "adult");
    const { page } = await open("stars");
    await openBook(page);
    const first = await page.evaluate(bookFacts);
    expectEq(first.count, "43 of 65 creatures raised, 5 with a Perfect star", "the count line before the reload");
    await page.reload();
    await bookButton(page).waitFor({ timeout: 20000 }); // (an egg has no Habitat button, every game has the Book)
    await page.waitForTimeout(300);
    await openBook(page);
    const second = await page.evaluate(bookFacts);
    expectEq([second.count, second.starred], [first.count, first.starred], "the count line and the stars after a reload");
    expectEq(second.count, "43 of 65 creatures raised, 5 with a Perfect star", "the count line after the reload");
    expectEq(second.starred.length, 5, "stars after a reload");
    const saved = await savedGame(page);
    expectEq([...saved.perfect].sort(), [...seed.perfect].sort(), "the saved star list after a reload (the one for a form not in the Book is kept)");
    return "the stars and the count line survive a reload, and the saved list keeps every id it was given, the one for a form that is not in the Book too";
  },

  "layout-cells": async (open) => {
    let cells = 0;
    let stars = 0;
    let lines = 0;
    for (const scenario of ["stars", "full"]) {
      const { page } = await open(scenario);
      await openBook(page);
      const f = await page.evaluate(cellFit);
      if (f.problems.length > 0) throw new Error(`${scenario}: ${f.problems.join("; ")}`);
      expectEq(f.cells, 65, `${scenario}: cells measured`);
      cells += f.cells;
      stars += f.stars;
      lines += f.lines;
    }
    if (stars === 0 || lines === 0) throw new Error("no star or no name line was measured");
    return `${cells} cells in 2 Books: each at least 44 px, in the window, one height to a row, every face in the middle of its cell and inside it (at 320 wide: at most 2.5 px past it), a 16 px strip above the face with ${stars} stars never on a face, and ${lines} name lines inside their cells`;
  },

  "layout-cards": async (open, env) => {
    let lines = 0;
    let elements = 0;
    let cards = 0;
    let inView = 0; // cards that were wholly in view before they opened (the panel must not have moved for them)
    const { page } = await open("kid");
    await openBook(page);
    for (const [title, n] of [["Baby", 0], ["Land", 0], ["Land", 1], ["Land", 4], ["Land", 5], ["Water", 20], ["Special", 0]]) {
      const delta = await tapCellMeasured(page, title, n);
      const f = await page.evaluate(cardFit);
      if (f.problems.length > 0) throw new Error(`${title} cell ${n}: ${f.problems.join("; ")}`);
      if (overscrolled(f, delta)) throw new Error(`${title} cell ${n}: the card was wholly in view, and the panel scrolled ${Math.round(delta)} px anyway`);
      if (f.top + delta >= f.panelTop - 0.5 && f.bottom + delta <= f.panelBottom + 0.5) inView += 1;
      lines += f.lines;
      elements += f.elements;
      cards += 1;
    }
    // an egg's Book has a short Next line and no "This creature" part, so the baby's card is short and high up: it needs no scrolling, and the panel must not move for it
    const egg = await open("egg");
    await openBook(egg.page);
    const eggDelta = await tapCellMeasured(egg.page, "Baby", 0);
    const eggCard = await egg.page.evaluate(cardFit);
    if (eggCard.problems.length > 0) throw new Error(`the baby's card in an egg's Book: ${eggCard.problems.join("; ")}`);
    if (overscrolled(eggCard, eggDelta)) throw new Error(`the baby's card in an egg's Book was wholly in view, and the panel scrolled ${Math.round(eggDelta)} px anyway`);
    if (eggCard.top + eggDelta >= eggCard.panelTop - 0.5 && eggCard.bottom + eggDelta <= eggCard.panelBottom + 0.5) inView += 1;
    cards += 1;
    lines += eggCard.lines;
    if (env.h >= 600 && inView === 0) throw new Error("no card opened wholly in view, so the panel's rest was never measured");
    // a starred card, and the row at the very bottom of the panel (the panel is what scrolls, so the card must be brought into view)
    const stars = await open("stars");
    await openBook(stars.page);
    await tapCell(stars.page, "Land", 5);
    const starred = await stars.page.evaluate(cardFit);
    if (starred.problems.length > 0) throw new Error(`the starred card: ${starred.problems.join("; ")}`);
    cards += 1;
    lines += starred.lines;
    const bottom = await open("bottom");
    await openBook(bottom.page);
    for (const [title, n] of [["Sky", 20], ["Special", 0]]) {
      await bottom.page.evaluate(() => (document.querySelector(".panel").scrollTop = document.querySelector(".panel").scrollHeight));
      await tapCell(bottom.page, title, n);
      const last = await bottom.page.evaluate(cardFit);
      if (last.problems.length > 0) throw new Error(`the card of ${title} cell ${n} (a row at the end of the panel): ${last.problems.join("; ")}`);
      cards += 1;
      lines += last.lines;
    }
    if (lines === 0 || elements === 0) throw new Error("nothing was measured");
    return `${cards} cards: under their own row, ${lines} text lines inside their boxes, no element of the panel past the window, Close at least 44 px, Done marks inside their steps, and the card's top on screen (the rows at the end of the panel too)`;
  },

  // Opening a card by a finger (docs/adult-a4-plan.md 14.3 item 11): the same measures as layout-cards, in a window that has touch, with real taps. The shop's list once passed with a mouse and
  // failed on a phone, so the control comes first: a real finger drag must move this panel, or nothing below it says anything.
  "card-touch": async (open, env) => {
    // Every touch window: really a touch window, and a counter of the touchstart events that reach the page, so a "tap" that was a mouse click cannot pass.
    // One finger tap (Playwright's locator.tap) and one touchDrag each send exactly ONE touchstart; `counted` reads the counter around a step and fails unless it grew by that.
    const touchWindow = async (page) => {
      if (!(await page.evaluate(() => matchMedia("(pointer: coarse)").matches))) throw new Error("the window is not a touch window (pointer: coarse is false)");
      await page.evaluate(() => {
        window.__touchStarts = 0;
        document.addEventListener("touchstart", () => (window.__touchStarts += 1), { capture: true, passive: true });
      });
    };
    const touchStarts = (page) => page.evaluate(() => window.__touchStarts);
    const counted = async (page, what, step) => {
      const before = await touchStarts(page);
      const result = await step();
      const after = await touchStarts(page);
      if (typeof before !== "number" || typeof after !== "number" || after - before !== 1) throw new Error(`${what}: ${typeof before === "number" && typeof after === "number" ? after - before : "no counter"} touchstart events reached the page (1 expected), so it was not one real touch`);
      return result;
    };
    let fingers = 0; // every touch step, counted by `counted`: the Book buttons, the control drag, the cell taps
    let cellTaps = 0;
    let cards = 0;
    let inView = 0; // cards that were wholly in view before they opened (the panel must not have moved for them)
    let lines = 0;
    // an egg's Book has a short Next line, so the baby's card is short and high up: it needs no scrolling, and the panel must not move for it
    const egg = await open("egg");
    await touchWindow(egg.page);
    await counted(egg.page, "the Book button in an egg's game", () => openBook(egg.page, "tap"));
    fingers += 1;
    const eggDelta = await counted(egg.page, "the baby's cell in an egg's game", () => tapCellMeasured(egg.page, "Baby", 0, "tap"));
    fingers += 1;
    cellTaps += 1;
    const eggCard = await egg.page.evaluate(cardFit);
    if (eggCard.problems.length > 0) throw new Error(`the baby's card in an egg's Book, by a finger: ${eggCard.problems.join("; ")}`);
    if (overscrolled(eggCard, eggDelta)) throw new Error(`the baby's card in an egg's Book, by a finger, was wholly in view, and the panel scrolled ${Math.round(eggDelta)} px anyway`);
    if (eggCard.top + eggDelta >= eggCard.panelTop - 0.5 && eggCard.bottom + eggDelta <= eggCard.panelBottom + 0.5) inView += 1;
    cards += 1;
    lines += eggCard.lines;
    if (env.h >= 600 && inView === 0) throw new Error("the baby's card did not open wholly in view, so the panel's rest was never measured");
    // the rows at the very end of the panel: the panel is scrolled there by a finger, and the card must be brought into the window
    const { page } = await open("bottom");
    await touchWindow(page);
    const cdp = await page.context().newCDPSession(page);
    await counted(page, "the Book button in the bottom game", () => openBook(page, "tap"));
    fingers += 1;
    const scrollTop = () => page.evaluate(() => document.querySelector(".panel").scrollTop);
    const geometry = () =>
      page.evaluate(() => {
        const el = document.querySelector(".panel");
        const r = el.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height * 0.9, h: r.height, max: el.scrollHeight - el.clientHeight };
      });
    const panel = await geometry();
    if (panel.max < 200) throw new Error(`the panel has only ${Math.round(panel.max)} px to scroll, so the control cannot move it`);
    const s0 = await scrollTop();
    await counted(page, "the control drag", () => touchDrag(cdp, panel.x, panel.y, -Math.round(panel.h * 0.75)));
    fingers += 1;
    const moved = (await scrollTop()) - s0;
    if (moved < 40) throw new Error(`control: a finger drag of ${Math.round(panel.h * 0.75)} px moved the panel only ${Math.round(moved)} px`);
    let endDrags = 0; // the finger drags that took the panel on to its end after the control drag (the cell is then scrolled into view as a finger would have it)
    // drag up until the panel stops (at most 60 drags): it must stop at its end, which is where the last rows' cards need the scroll
    const scrollToEnd = async () => {
      for (let i = 0; i < 60; i++) {
        const g = await geometry();
        if ((await scrollTop()) >= g.max - 1) return;
        await counted(page, "a drag towards the end", () => touchDrag(cdp, g.x, g.y, -Math.round(g.h * 0.75)));
        fingers += 1;
        endDrags += 1;
      }
      const g = await geometry();
      if ((await scrollTop()) < g.max - 1) throw new Error(`60 finger drags did not bring the panel to its end (${Math.round(await scrollTop())} of ${Math.round(g.max)} px)`);
    };
    let end = 0;
    for (const [title, n] of [["Sky", 20], ["Special", 0]]) {
      await scrollToEnd();
      await counted(page, `the cell ${title} ${n}`, () => tapCell(page, title, n, "tap"));
      fingers += 1;
      cellTaps += 1;
      end += 1;
      const last = await page.evaluate(cardFit);
      if (last.problems.length > 0) throw new Error(`the card of ${title} cell ${n} by a finger (a row at the end of the panel): ${last.problems.join("; ")}`);
      cards += 1;
      lines += last.lines;
    }
    if (endDrags === 0) throw new Error("the control drag already took the panel to its end, so no finger drag was needed to get there");
    return `a finger drag moved the panel ${Math.round(moved)} px (control); ${fingers} finger steps each sent exactly one touchstart; ${cards} cards opened by ${cellTaps} real cell taps, ${inView} wholly in view without moving the panel, ${end} at the end of the panel (${endDrags} finger drags took it there) brought into the window, ${lines} lines measured`;
  },

  "layout-forecast": async (open) => {
    let lines = 0;
    let stars = 0;
    let perfect = 0;
    for (const scenario of ["baby", "young", "adult-perfect", "adult-plain"]) {
      const { page } = await open(scenario);
      await openForecast(page);
      const f = await page.evaluate(forecastFit);
      if (f.problems.length > 0) throw new Error(`${scenario}: ${f.problems.join("; ")}`);
      lines += f.lines;
      stars += f.star;
      perfect += f.perfect;
    }
    expectEq([stars, perfect], [1, 3], "stars by the tier, and Perfect lines, measured in four Forecasts");
    if (lines === 0) throw new Error("no line of the Perfect text was measured");
    return `the Forecast with and without the Perfect line: nothing past the window, ${lines} lines of the Perfect text inside its box, and the star beside the tier on the tier line, below the name, inside the lead`;
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
        if (w > h && !LANDSCAPE_IDS.has(id) && !args.sizes) continue; // the default list's windows on their side are for the layout checks only
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
