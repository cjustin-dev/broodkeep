// Kid Mode look check: the same Kid save, loaded in the old build (main) and the new build (Retire), must render the same page.
//
// Run: node kid-compare.mjs --old http://127.0.0.1:4190 --new http://127.0.0.1:4191 [--selftest] [--dpr 1|2]
// Exit: 0 when differences=0 and pages>0 (and, with --expect-home, missing=0); 1 when any difference (or, with --expect-home, a missing expected one); 2 when the script broke (an ERROR line, a selftest that did not
// see the injected change, or no page compared). A page that throws or times out prints an ERROR line and the run goes on.
//
// Per page: the same save is loaded in a fresh context in each build (service workers blocked, frozen clock 2026-11-22T15:00:00Z,
// UTC, en-US, device pixel ratio 1 unless --dpr 2), and every element under main.app is dumped: key = position path (tag:index chain) + tag +
// class (spaces in the class joined with dots); text (trimmed, in full); rect (left, top, width, height, rounded to 0.01 px); every
// attribute except class (img src, alt, aria-*, disabled, hidden, role, data-*); and every computed style property (all of
// getComputedStyle). CSS animations and transitions are paused at their start before the dump. Elements are matched by key; a key present
// in only one build is a DIFF. For a save with a creature the room's picture must name it, so a save the app could not read is an ERROR.
// SUMMARY styles = computed style values dumped from the old build, summed over all pages.
// --selftest runs the comparison once more with INJECT_CSS added to the NEW build's pages only, and requires differences > 0 on EVERY
// non-egg page and no ERROR line in that run (an egg page may show none).
// --expect-home (the Home slice H1, where the room is meant to change in Kid Mode too): a difference listed in expectedHome() is counted as expected=N and is not a
// difference; every other one is, as before. It also needs the expected ones to be THERE: the stage's centring and the picture's grid cell on every page, the keyboard and touch settings
// of the room's picture on every room page and, where a creature is in the home, the room's name in its words (missing=N otherwise), so a build that lost the change cannot pass by showing no difference. With --selftest the injected change also
// pads the stage, which no expected difference covers, and it must be reported on every page.
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

// Property names skipped in the comparison (every skipped value is counted as ignored=<n> in the SUMMARY line).
// Empty: nothing is ignored unless a value changes for a reason outside the game's styling (for example real time).
const IGNORED_PROPS = [];

// The selftest's deliberate Kid-visible change, added to the new build's pages only.
const INJECT_CSS = ".care{gap:7px !important}\n.dock{padding-left:9px !important}";
const INJECT_STAGE_CSS = ".stage{padding-left:3px !important}"; // with --expect-home --selftest: a change to the stage that the list of expected differences must not swallow

// Game time 2026-11-22T15:00:00Z (frozen), in ms.
const T = 1795359600000;
const SETTLE_MS = 300;
const PAGE_TIMEOUT_MS = 90_000;
const MAX_DIFF_LINES = Number(process.env.KID_MAX_DIFF_LINES ?? 5); // the lines printed per page; KID_MAX_DIFF_LINES=1000 prints all of them

const SAVE_NAMES = ["adult-home", "young-home", "kid-home", "kid-board", "adult-away", "egg"];
const SIZES = [
  [320, 568],
  [360, 640],
  [390, 844],
];
let DPR = 1; // --dpr 2 runs the same comparison at pixel ratio 2

// ---------- helpers (run in Node) ----------

function withTimeout(promise, ms, what) {
  let timer;
  const expired = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${what}: timed out after ${ms / 1000} s`)), ms);
  });
  return Promise.race([promise, expired]).finally(() => clearTimeout(timer));
}

function parseArgs(argv) {
  const out = { selftest: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--selftest") {
      out.selftest = true;
      continue;
    }
    if (a === "--expect-home") {
      out.expectHome = true;
      continue;
    }
    if (a === "--dpr") {
      const v = argv[i + 1];
      if (v !== "1" && v !== "2") throw new Error(`--dpr must be 1 or 2, got ${v}`);
      DPR = Number(v);
      i++;
      continue;
    }
    if (a === "--old" || a === "--new") {
      const v = argv[i + 1];
      if (!v || v.startsWith("--")) throw new Error(`${a} needs a value`);
      if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(v)) throw new Error(`${a} must be http://127.0.0.1:<port>, got ${v}`);
      out[a.slice(2)] = v;
      i++;
      continue;
    }
    throw new Error(`unknown argument ${a}`);
  }
  if (!out.old || !out.new) throw new Error("--old and --new are required");
  return out;
}

// The six Kid saves. Read here only to decide which screens exist for each save (the page is never asked).
function loadSave(name) {
  const save = JSON.parse(readFileSync(join(SAVES, `${name}-kid.json`), "utf8"));
  if (save.settings && save.settings.adultMode === true) throw new Error(`${name}-kid.json has adultMode on`);
  return save;
}

// room always; room with the Feed tray when the creature is awake and at home; habitat and arena for a living creature.
// An egg has only the room (no Nav buttons).
function screensFor(save) {
  if (save.phase === "egg") return ["room"];
  if (save.phase !== "alive") throw new Error(`unexpected phase ${save.phase}`);
  const screens = ["room"];
  const c = save.creature;
  if (c && c.sleep == null && c.job == null) screens.push("room-feed");
  screens.push("habitat", "arena");
  return screens;
}

const fmt = (v) => (v === undefined ? "missing" : String(v).replace(/\s+/g, " ").slice(0, 120));

// Flat view of one dumped element: fixed fields first, then every computed style by its CSS name.
function flatten(entry) {
  const flat = {
    text: entry.text,
    "rect.left": entry.rect.left,
    "rect.top": entry.rect.top,
    "rect.width": entry.rect.width,
    "rect.height": entry.rect.height,
  };
  for (const [name, value] of Object.entries(entry.styles)) flat[name] = value;
  for (const [name, value] of Object.entries(entry.attrs)) flat[name] = value;
  return flat;
}

function compareDumps(oldDump, newDump, counters) {
  const newByKey = new Map(newDump.map((e) => [e.key, e]));
  const oldKeys = new Set(oldDump.map((e) => e.key));
  const diffs = [];
  for (const o of oldDump) {
    const n = newByKey.get(o.key);
    if (!n) {
      diffs.push({ key: o.key, prop: "element", old: "present", new: "missing" });
      continue;
    }
    const fo = flatten(o);
    const fn = flatten(n);
    for (const prop of new Set([...Object.keys(fo), ...Object.keys(fn)])) {
      if (IGNORED_PROPS.includes(prop)) {
        counters.ignored++;
        continue;
      }
      if (fo[prop] !== fn[prop]) diffs.push({ key: o.key, prop, old: fo[prop], new: fn[prop] });
    }
  }
  for (const n of newDump) {
    if (!oldKeys.has(n.key)) diffs.push({ key: n.key, prop: "element", old: "missing", new: "present" });
  }
  return diffs;
}

// The differences the home makes in Kid Mode on purpose (docs/home-plan.md section 3.4, CLAUDE.md section 12). What does NOT change, and so is not listed: any element's
// position or size, any text, any other element or style. `screen` is the page: room, room-feed, habitat or arena.
const ROOM_SCREENS = ["room", "room-feed"];
function expectedHome(screen, d) {
  const stage = d.key.endsWith("|div|stage");
  const canvas = d.key.endsWith("|canvas|room");
  // The stage centres its one cell (`place-content: center`) and the picture sits in that cell (`grid-area: 1 / 1`): the values the browser resolves for the tracks and the
  // cell change on every page, and the rectangles do not (they are compared as before).
  if (stage) {
    if (d.prop === "justify-content" || d.prop === "align-content") return d.old === "normal" && d.new === "center";
    // (one track of a width in pixels each: the old one as wide as the stage, the new one as wide as the picture)
    if (d.prop === "grid-template-columns" || d.prop === "grid-template-rows") return /^[\d.]+px$/.test(String(d.old)) && /^[\d.]+px$/.test(String(d.new));
    return false;
  }
  if (!canvas) return false;
  if (d.prop === "grid-row-start" || d.prop === "grid-column-start") return d.old === "auto" && d.new === "1";
  if (!ROOM_SCREENS.includes(screen)) return false;
  // The home's picture takes the finger and the keys, and names the room the creature is in.
  if (d.prop === "touch-action") return d.old === "manipulation" && d.new === "none";
  if (d.prop === "attr:tabindex") return d.old === undefined && d.new === "0";
  if (d.prop === "attr:style") return typeof d.old === "string" && d.new === `${d.old} touch-action: none;`;
  if (d.prop === "attr:aria-label") {
    return typeof d.old === "string" && typeof d.new === "string" && d.new.startsWith(`${d.old} In the `) && /^(bedroom|living room|kitchen)\.$/.test(d.new.slice(d.old.length + " In the ".length));
  }
  return false;
}

// ---------- page functions (serialized into the browser: self-contained) ----------

// Writes the save into IndexedDB (db "broodkeep", store "kv", key "save"), as the app reads it.
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

// Dumps every element under main.app (descendants of the root, not the root itself).
function dumpPage() {
  const root = document.querySelector("main.app");
  if (!root) throw new Error("no main.app root");
  const r2 = (x) => Math.round(x * 100) / 100;
  const out = [];
  const walk = (el, path) => {
    [...el.children].forEach((child, i) => {
      const tag = child.tagName.toLowerCase();
      const childPath = `${path}>${tag}:${i}`;
      const cls = (child.getAttribute("class") ?? "").trim().split(/\s+/).filter(Boolean).join(".");
      const r = child.getBoundingClientRect();
      const cs = getComputedStyle(child);
      const styles = {};
      for (let k = 0; k < cs.length; k++) styles[cs[k]] = cs.getPropertyValue(cs[k]);
      // every attribute except class (class is in the key): an icon's src, alt, aria-*, disabled, hidden, role, title, data-*
      const attrs = {};
      for (const a of child.attributes) if (a.name !== "class") attrs[`attr:${a.name}`] = a.value;
      out.push({
        key: `${childPath}|${tag}|${cls}`,
        text: child.textContent.trim(),
        rect: { left: r2(r.left), top: r2(r.top), width: r2(r.width), height: r2(r.height) },
        styles,
        attrs,
      });
      walk(child, childPath);
    });
  };
  walk(root, "main.app");
  return out;
}

// ---------- one page in one build ----------

async function loadPage(browser, base, save, [w, h], screen, inject, expectHome = false) {
  const context = await browser.newContext({
    viewport: { width: w, height: h },
    deviceScaleFactor: DPR,
    locale: "en-US",
    timezoneId: "UTC",
    serviceWorkers: "block",
  });
  try {
    const page = await context.newPage();
    const pageErrors = [];
    page.on("pageerror", (err) => pageErrors.push(err.message));
    await page.clock.install({ time: T });
    await page.clock.setFixedTime(T);
    const stub = `${base}/seed`;
    await page.route(stub, (route) => route.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html><title>seed</title>" }));
    await page.goto(stub);
    await page.evaluate(seedSave, save);
    await page.goto(`${base}/`);
    await page.waitForSelector('button[aria-label^="Creature Book"]', { timeout: 20000 });
    // The app starts a fresh game when it cannot read the seeded save, and the header button exists then too: for a save with a creature,
    // the room's picture must name that creature (its form id with a capital: gravelhorn -> Gravelhorn). An egg save looks like a fresh
    // game by design, so it has no marker (known limit: a rejected egg save would go unnoticed, and would compare as a fresh egg).
    if (save.creature) {
      const wanted = save.creature.formId.charAt(0).toUpperCase() + save.creature.formId.slice(1);
      const label = await page.locator('[role="img"][aria-label]').first().getAttribute("aria-label");
      if (!label || !label.includes(wanted)) throw new Error(`the seeded save was not loaded: the room's picture says "${label}", expected it to name ${wanted}`);
    }
    if (inject) await page.addStyleTag({ content: INJECT_CSS + (expectHome ? `\n${INJECT_STAGE_CSS}` : "") });
    if (screen === "room-feed") {
      await page.locator('button[aria-label="Feed"]').click();
      await page.locator('.tray[aria-label="Choose food"]').waitFor({ state: "visible", timeout: 5000 });
    } else if (screen === "habitat" || screen === "arena") {
      const label = screen === "habitat" ? "Habitat" : "Arena";
      await page.locator(`button[aria-label="${label}"]`).click();
      await page.locator(`button[aria-label="${label}"][aria-pressed="true"]`).waitFor({ state: "attached", timeout: 5000 });
    }
    await page.waitForTimeout(SETTLE_MS);
    // Freeze every CSS animation and transition at its start, so a build caught mid-movement cannot differ from one at rest by timing alone.
    // The declarations themselves (animation-*, transition-*) stay in the computed styles and are still compared.
    await page.evaluate(() => document.getAnimations().forEach((a) => { a.pause(); a.currentTime = 0; }));
    const dump = await page.evaluate(dumpPage);
    const scrollWide = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    return { dump, scrollWide, pageErrors };
  } finally {
    await context.close().catch(() => {});
  }
}

// ---------- the comparison over every page ----------

async function runComparison(browser, cfg, print) {
  const tot = { pages: 0, elements: 0, styles: 0, differences: 0, ignored: 0, errors: 0, zeroDiffPages: [], expected: 0, missing: 0, stageUnswallowed: 0 };
  const counters = { ignored: 0 };
  const out = (line) => {
    if (print) console.log(line);
  };
  for (const name of SAVE_NAMES) {
    const save = loadSave(name);
    for (const size of SIZES) {
      for (const screen of screensFor(save)) {
        const sizeText = `${size[0]}x${size[1]}`;
        const id = `${name} ${screen} ${sizeText}`;
        try {
          const oldSide = await withTimeout(loadPage(browser, cfg.old, save, size, screen, false), PAGE_TIMEOUT_MS, `old ${id}`);
          const newSide = await withTimeout(loadPage(browser, cfg.new, save, size, screen, cfg.inject, cfg.expectHome), PAGE_TIMEOUT_MS, `new ${id}`);
          for (const m of oldSide.pageErrors) {
            tot.errors++;
            console.log(`ERROR ${id} old pageerror: ${m}`);
          }
          for (const m of newSide.pageErrors) {
            tot.errors++;
            console.log(`ERROR ${id} new pageerror: ${m}`);
          }
          const all = compareDumps(oldSide.dump, newSide.dump, counters);
          // With --expect-home the differences the home makes on purpose are set aside (and counted); the rest are the differences.
          const diffs = cfg.expectHome ? all.filter((d) => !expectedHome(screen, d)) : all;
          const expected = all.length - diffs.length;
          if (cfg.expectHome && !cfg.inject) {
            // ... and they must all be there: on every page the stage centres its cell (both axes, and the track width) and the picture takes cell 1 / 1; on every room page
            // the picture takes the keys and the finger, and, when a creature is in the home (not away on a job, not an egg), its words name the room. (The stage's row
            // track is left out: on 4 of the 60 pages it was already as tall as the picture.)
            const there = (prop) => all.some((d) => d.prop === prop && expectedHome(screen, d));
            const inHome = save.phase === "alive" && save.creature != null && save.creature.job == null;
            const need = [
              "justify-content",
              "align-content",
              "grid-template-columns",
              "grid-row-start",
              "grid-column-start",
              ...(ROOM_SCREENS.includes(screen) ? ["attr:tabindex", "touch-action", "attr:style", ...(inHome ? ["attr:aria-label"] : [])] : []),
            ];
            const lost = need.filter((prop) => !there(prop));
            if (lost.length > 0) {
              tot.missing++;
              out(`MISSING ${name} ${screen} ${sizeText} the expected difference(s) ${lost.join(", ")} are not there`);
            }
          }
          if (cfg.expectHome && cfg.inject && diffs.some((d) => d.key.endsWith("|div|stage") && d.prop === "padding-left")) tot.stageUnswallowed++;
          tot.expected += expected;
          if (diffs.length === 0 && save.phase !== "egg") tot.zeroDiffPages.push(id); // the selftest needs every non-egg page to show its injected change
          for (const d of diffs.slice(0, MAX_DIFF_LINES)) {
            out(`DIFF ${name} ${screen} ${sizeText} ${d.key} ${d.prop} old=${fmt(d.old)} new=${fmt(d.new)}`);
          }
          if (oldSide.scrollWide || newSide.scrollWide) {
            out(`SCROLL ${name} ${screen} ${sizeText} old=${oldSide.scrollWide} new=${newSide.scrollWide}`);
          }
          const elements = oldSide.dump.length;
          const styles = oldSide.dump.reduce((sum, e) => sum + Object.keys(e.styles).length, 0);
          out(`PAGE ${name} ${screen} ${sizeText} elements=${elements} styles=${styles} diffs=${diffs.length}${cfg.expectHome ? ` expected=${expected}` : ""}`);
          tot.pages++;
          tot.elements += elements;
          tot.styles += styles;
          tot.differences += diffs.length;
        } catch (err) {
          tot.errors++;
          console.log(`ERROR ${id} ${err && err.message ? err.message : err}`);
        }
      }
    }
  }
  tot.ignored = counters.ignored;
  return tot;
}

// ---------- main ----------

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const browser = await chromium.launch({ headless: true });
  let code = 0;
  try {
    let selftestOk = true;
    if (args.selftest) {
      const st = await runComparison(browser, { old: args.old, new: args.new, inject: true, expectHome: args.expectHome }, false);
      // The injected CSS (.care gap, .dock padding) must show on EVERY page that is not an egg, and the selftest run must have no ERROR.
      const stageOk = !args.expectHome || st.stageUnswallowed === st.pages; // every page, an egg's too: the stage is padded on all of them
      if (st.differences > 0 && st.zeroDiffPages.length === 0 && st.errors === 0 && stageOk) {
        console.log(`SELFTEST ok: ${st.differences} differences found, on all ${st.pages} pages compared (egg pages may show none)${args.expectHome ? `; the stage's padding reported on ${st.stageUnswallowed} of ${st.pages}` : ""}`);
      } else {
        selftestOk = false;
        console.log(`SELFTEST FAILED: ${st.differences} differences, ${st.errors} ERROR line(s), pages with no difference: ${st.zeroDiffPages.join("; ") || "none"}${args.expectHome ? `, the stage's padding reported on ${st.stageUnswallowed} of ${st.pages}` : ""}`);
      }
    }
    const tot = await runComparison(browser, { old: args.old, new: args.new, inject: false, expectHome: args.expectHome }, true);
    console.log(`SUMMARY pages=${tot.pages} elements=${tot.elements} styles=${tot.styles} differences=${tot.differences} ignored=${tot.ignored}${args.expectHome ? ` expected=${tot.expected} missing=${tot.missing}` : ""}`);
    if (tot.errors > 0 || !selftestOk) code = 2;
    else if (tot.pages === 0) code = 2;
    else if (tot.differences > 0 || tot.missing > 0) code = 1;
  } finally {
    await browser.close().catch(() => {});
  }
  return code;
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (err) => {
    console.log(`ERROR script ${err && err.message ? err.message : err}`);
    console.error(err && err.stack ? err.stack : err);
    process.exitCode = 2;
  },
);
