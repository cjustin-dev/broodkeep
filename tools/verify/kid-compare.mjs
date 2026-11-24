// Kid Mode look check: the same Kid save, loaded in the old build (main) and the new build (Retire), must render the same page.
//
// Run: node kid-compare.mjs --old http://127.0.0.1:4190 --new http://127.0.0.1:4191 [--selftest] [--dpr 1|2]
// Exit: 0 when differences=0 and pages>0; 1 when any difference; 2 when the script broke (an ERROR line, a selftest that did not
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

// Game time 2026-11-22T15:00:00Z (frozen), in ms.
const T = 1795359600000;
const SETTLE_MS = 300;
const PAGE_TIMEOUT_MS = 90_000;
const MAX_DIFF_LINES = 5;

const SAVE_NAMES = ["adult-home", "young-home", "kid-home", "adult-away", "egg"];
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

// The five Kid saves. Read here only to decide which screens exist for each save (the page is never asked).
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

async function loadPage(browser, base, save, [w, h], screen, inject) {
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
    if (inject) await page.addStyleTag({ content: INJECT_CSS });
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
  const tot = { pages: 0, elements: 0, styles: 0, differences: 0, ignored: 0, errors: 0, zeroDiffPages: [] };
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
          const newSide = await withTimeout(loadPage(browser, cfg.new, save, size, screen, cfg.inject), PAGE_TIMEOUT_MS, `new ${id}`);
          for (const m of oldSide.pageErrors) {
            tot.errors++;
            console.log(`ERROR ${id} old pageerror: ${m}`);
          }
          for (const m of newSide.pageErrors) {
            tot.errors++;
            console.log(`ERROR ${id} new pageerror: ${m}`);
          }
          const diffs = compareDumps(oldSide.dump, newSide.dump, counters);
          if (diffs.length === 0 && save.phase !== "egg") tot.zeroDiffPages.push(id); // the selftest needs every non-egg page to show its injected change
          for (const d of diffs.slice(0, MAX_DIFF_LINES)) {
            out(`DIFF ${name} ${screen} ${sizeText} ${d.key} ${d.prop} old=${fmt(d.old)} new=${fmt(d.new)}`);
          }
          if (oldSide.scrollWide || newSide.scrollWide) {
            out(`SCROLL ${name} ${screen} ${sizeText} old=${oldSide.scrollWide} new=${newSide.scrollWide}`);
          }
          const elements = oldSide.dump.length;
          const styles = oldSide.dump.reduce((sum, e) => sum + Object.keys(e.styles).length, 0);
          out(`PAGE ${name} ${screen} ${sizeText} elements=${elements} styles=${styles} diffs=${diffs.length}`);
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
      const st = await runComparison(browser, { old: args.old, new: args.new, inject: true }, false);
      // The injected CSS (.care gap, .dock padding) must show on EVERY page that is not an egg, and the selftest run must have no ERROR.
      if (st.differences > 0 && st.zeroDiffPages.length === 0 && st.errors === 0) {
        console.log(`SELFTEST ok: ${st.differences} differences found, on all ${st.pages} pages compared (egg pages may show none)`);
      } else {
        selftestOk = false;
        console.log(`SELFTEST FAILED: ${st.differences} differences, ${st.errors} ERROR line(s), pages with no difference: ${st.zeroDiffPages.join("; ") || "none"}`);
      }
    }
    const tot = await runComparison(browser, { old: args.old, new: args.new, inject: false }, true);
    console.log(`SUMMARY pages=${tot.pages} elements=${tot.elements} styles=${tot.styles} differences=${tot.differences} ignored=${tot.ignored}`);
    if (tot.errors > 0 || !selftestOk) code = 2;
    else if (tot.pages === 0) code = 2;
    else if (tot.differences > 0) code = 1;
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
