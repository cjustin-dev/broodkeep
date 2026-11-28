// The timed combat contact sheet (A4.3, docs/adult-a4-plan.md section 10.5): one full-page screenshot per state and window size in $VERIFY_OUT/sheet-combat/<state>-<W>x<H>@<ratio>.png: the fight's start, the pad with the ring
// at the start, the middle and the circle, a Perfect round, the wild creature's shown move (attack, guard, special), the Guard pad, the parry, the sulk note, a won fight's result, Kid Mode's fight, and the ring
// with reduced motion. NO ASSERTIONS: it exists so that someone looks at the pictures (stitch-combat.py joins them) before any layout check is trusted. Only a state it cannot reach is an error (exit 2).
// The ring is a CSS animation on the real clock (the fake clock does not move it), so the three ring pictures are taken after real waits of about 60, 450 and 950 ms.
//
// Run: node sheet-combat.mjs --base http://127.0.0.1:4175 [--sizes 360x640@2]
import { mkdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

const require = createRequire(process.env.PLAYWRIGHT_FROM ?? join(homedir(), "homelab-dashboard", "package.json"));
const { chromium } = require("playwright");

const OUT = process.env.VERIFY_OUT ?? join(tmpdir(), "broodkeep-verify");
const SAVES = join(OUT, "saves");
const DIR = join(OUT, "sheet-combat");
mkdirSync(DIR, { recursive: true });
const T = 1795359600000;
const SIZES = [
  [320, 568, 2],
  [360, 640, 2],
  [390, 844, 3],
  [740, 360, 2],
  [844, 390, 3],
];
const SULK = "Sulking: discipline too low. Training helps.";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const load = (file) => JSON.parse(readFileSync(join(SAVES, file), "utf8"));
function adult(change = () => {}) {
  const save = load("adult-home-adult.json");
  change(save.creature, save);
  return save;
}
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
  });
  db.close();
}
const snap = () => {
  const q = (s) => document.querySelector(s);
  const r = q(".timing-pad")?.getBoundingClientRect();
  return {
    intent: q(".arena-intent")?.textContent.replace(/\s+/g, " ").trim() ?? null,
    note: q(".reason")?.textContent ?? null,
    pad: r ? { x: (r.left + r.right) / 2, y: (r.top + r.bottom) / 2 } : null,
    result: !!q(".result"),
  };
};
const boxOf = ({ selector }) => {
  const el = document.querySelector(selector);
  if (!el) return null;
  el.scrollIntoView({ block: "center", behavior: "instant" });
  const r = el.getBoundingClientRect();
  return { x: (r.left + r.right) / 2, y: (r.top + r.bottom) / 2 };
};

async function openGame(browser, base, w, h, dpr, save, extra = {}) {
  const context = await browser.newContext({ ...extra, viewport: { width: w, height: h }, deviceScaleFactor: dpr, isMobile: true, hasTouch: true, locale: "en-US", timezoneId: "UTC", serviceWorkers: "block" });
  const page = await context.newPage();
  await page.addInitScript(() => {
    Math.random = () => 0.99;
  });
  await page.clock.install({ time: T });
  await page.clock.setFixedTime(T);
  await page.route(`${base}/seed`, (route) => route.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html><title>seed</title>" }));
  await page.goto(`${base}/seed`);
  await page.evaluate(seedSave, save);
  await page.goto(`${base}/`);
  await page.locator("canvas.room").waitFor({ timeout: 20000 });
  await page.clock.pauseAt(T + 60_000);
  await page.clock.runFor(100);
  await page.waitForTimeout(100);
  return { page, context };
}
const run = async (page, ms, frame = 100) => {
  for (let left = ms; left > 0; left -= frame) await page.clock.runFor(Math.min(frame, left));
};
async function tapSel(page, selector) {
  const b = await page.evaluate(boxOf, { selector });
  if (!b) {
    const here = await page.evaluate(() => ({ buttons: [...document.querySelectorAll("button")].map((x) => x.getAttribute("aria-label")), note: document.querySelector(".reason")?.textContent ?? null }));
    throw new Error(`nothing matches ${selector}; the page has ${JSON.stringify(here)}`);
  }
  await page.touchscreen.tap(b.x, b.y);
  await sleep(30);
}
// The arena canvas is read back from the canvas itself (not from the picture) and printed beside the shot: a black picture with ink=true is the screenshot's doing, one with ink=false is the page's.
const ink = () => {
  const c = document.querySelector("canvas.room");
  const px = c?.getContext("2d")?.getImageData(0, 0, c.width, c.height).data;
  if (!px) return null;
  for (let i = 0; i < px.length; i += 4) if (px[i] || px[i + 1] || px[i + 2]) return true;
  return false;
};
async function shot(page, state, w, h, dpr) {
  await run(page, 40, 20); // two animation frames of the fake clock: a canvas that was just resized stays blank until the next frame, which the paused clock does not send
  console.log(`    ${state}: canvas ink=${await page.evaluate(ink)}`);
  await page.screenshot({ path: join(DIR, `${state}-${w}x${h}@${dpr}.png`), fullPage: true });
}

async function toFight(page) {
  await tapSel(page, 'button[aria-label="Arena"]');
  await run(page, 200);
  await tapSel(page, 'button[aria-label="Fight a wild creature"]');
  await run(page, 200);
}
// Choose an action and tap the pad right on the circle.
async function perfect(page, action) {
  await tapSel(page, `button[aria-label="${action}"]`);
  await run(page, 20, 20);
  const s = await page.evaluate(snap);
  await page.clock.runFor(880);
  await page.touchscreen.tap(s.pad.x, s.pad.y);
  await run(page, 20, 20);
}
const clear = (page) => run(page, 6500, 500);

async function sheet(browser, base, [w, h, dpr]) {
  const log = (state) => console.log(`  ${state}-${w}x${h}@${dpr}`);
  // the fight, the pad at three moments, a Perfect round
  let { page, context } = await openGame(browser, base, w, h, dpr, adult((c) => {
    c.trained = { vit: 5000 };
    c.rung = 5;
    c.stats.discipline = 100;
  }));
  await toFight(page);
  await shot(page, "start", w, h, dpr);
  log("start");
  // The ring is a CSS animation on the real clock; each moment is its own pad, because a screenshot between a pad opening and its tap upsets the tap.
  for (const [state, ms] of [["pad-0", 60], ["pad-mid", 450], ["pad-target", 950]]) {
    await tapSel(page, 'button[aria-label="Attack"]');
    await page.waitForTimeout(ms);
    await shot(page, state, w, h, dpr);
    await clear(page); // the pad closes by itself and the round plays as Normal
  }
  await perfect(page, "Attack");
  await shot(page, "perfect", w, h, dpr);
  log("pad-0, pad-mid, pad-target, perfect");
  await clear(page);
  // the shown move: play Attack rounds until each kind has been on the screen once; against a coming attack or special, a Guard pad (left to close by itself), then a Perfect guard on a later one
  const seen = new Set();
  let padShown = false;
  let parried = false;
  for (let i = 0; i < 80 && !(seen.size === 3 && padShown && parried); i++) {
    const s = await page.evaluate(snap);
    const kind = /^Foe next: (attack|guard|special)$/.exec(s.intent)?.[1];
    if (kind && !seen.has(kind)) {
      seen.add(kind);
      await shot(page, `intent-${kind}`, w, h, dpr);
      log(`intent-${kind}`);
    }
    if (kind && kind !== "guard" && seen.size === 3 && !padShown) {
      await tapSel(page, 'button[aria-label="Guard"]');
      await page.waitForTimeout(60);
      await shot(page, "guard-pad", w, h, dpr);
      log("guard-pad");
      padShown = true;
      await clear(page);
      continue;
    }
    if (kind && kind !== "guard" && padShown && !parried) {
      await perfect(page, "Guard");
      await shot(page, "parry", w, h, dpr);
      log("parry");
      parried = true;
      await clear(page);
      continue;
    }
    await perfect(page, "Attack");
    await clear(page);
  }
  if (seen.size < 3 || !padShown || !parried) throw new Error(`the rounds showed ${[...seen].join(", ")}, ${padShown ? "a" : "no"} Guard pad and ${parried ? "a" : "no"} parry: some state was not reached`);
  await context.close();
  // the sulk
  ({ page, context } = await openGame(browser, base, w, h, dpr, adult((c) => {
    c.trained = { vit: 5000 };
    c.rung = 5;
    c.stats.discipline = 0;
  })));
  await toFight(page);
  for (let i = 0; i < 40; i++) {
    await perfect(page, "Attack");
    if ((await page.evaluate(snap)).note === SULK) {
      await shot(page, "sulk", w, h, dpr);
      log("sulk");
      break;
    }
    await clear(page);
    if (i === 39) throw new Error("no sulk in 40 rounds");
  }
  await context.close();
  // a won fight
  ({ page, context } = await openGame(browser, base, w, h, dpr, adult((c) => {
    c.trained = { str: 5000, vit: 5000 };
    c.stats.discipline = 100;
  })));
  await toFight(page);
  for (let i = 0; i < 20; i++) {
    await perfect(page, "Attack");
    await clear(page);
    if ((await page.evaluate(snap)).result) {
      await shot(page, "won", w, h, dpr);
      log("won");
      break;
    }
    if (i === 19) throw new Error("the fight was not won in 20 rounds");
  }
  await context.close();
  // Kid Mode
  ({ page, context } = await openGame(browser, base, w, h, dpr, load("adult-home-kid.json")));
  await toFight(page);
  await shot(page, "kid", w, h, dpr);
  log("kid");
  await context.close();
  // reduced motion
  ({ page, context } = await openGame(browser, base, w, h, dpr, adult((c) => {
    c.trained = { vit: 5000 };
    c.rung = 5;
    c.stats.discipline = 100;
  }), { reducedMotion: "reduce" }));
  await toFight(page);
  await tapSel(page, 'button[aria-label="Attack"]');
  await page.waitForTimeout(100);
  await shot(page, "reduced-dim", w, h, dpr);
  await page.waitForTimeout(850);
  await shot(page, "reduced-lit", w, h, dpr);
  log("reduced-dim, reduced-lit");
  await context.close();
}

async function main() {
  const argv = process.argv.slice(2);
  const get = (flag) => (argv.includes(flag) ? argv[argv.indexOf(flag) + 1] : undefined);
  const base = (get("--base") ?? "").replace(/\/$/, "");
  if (!base) throw new Error("--base <url> is required");
  const sizes = get("--sizes")
    ? get("--sizes").split(",").map((s) => {
        const m = /^(\d+)x(\d+)@(\d+)$/.exec(s);
        if (!m) throw new Error(`bad size ${s}`);
        return [Number(m[1]), Number(m[2]), Number(m[3])];
      })
    : SIZES;
  const browser = await chromium.launch({ headless: true });
  try {
    for (const size of sizes) {
      console.log(`${size.join("x")}`);
      await sheet(browser, base, size);
    }
  } finally {
    await browser.close().catch(() => {});
  }
  console.log("SHEET done");
}
main().then(
  () => {},
  (err) => {
    console.error(`script error: ${err && err.stack ? err.stack : err}`);
    process.exitCode = 2;
  },
);
