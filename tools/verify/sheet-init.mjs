// A contact sheet of the creature initiatives (adult track A3.3): the ball, a craving for a food of each field, each kind of gift, a play after its first toss, the note after a gift, the Bond
// card open over a showing initiative and Kid Mode with nothing, at 320x568@2, 360x640@2, 390x844@3 and on its side at 740x360@2 and 844x390@3, one PNG per state and window in
// $VERIFY_OUT/sheet-init/. It has NO assertions: it only draws (and prints what the canvas says about the bubble), and a person looks at the pictures before any check is trusted (the
// checks are init-browser.mjs).
//   play          the ball over the creature
//   craving-land  a craving for meat (the Land adult's menu is pellet, meat, carrot, worm)
//   craving-water a craving for seaweed (a Water adult)
//   craving-sky   a craving for syrup (a Sky adult)
//   gift-coin     a coin gift
//   gift-fiber, gift-herb, gift-wood, gift-fish, gift-stone   one material gift each
//   play-tossed   the ball after the first tap: the hop and the sparkles
//   gift-note     a coin gift after the tap: the note over the picture
//   bond-card     the ball with the Bond card open in the header (does the card cover the bubble?)
//   kid           Kid Mode after 100 seconds: nothing
// How the draws are forced: the game's `rand` is the `Math.random` it found when it was built, so an init script installs one that reads `window.__q` (a queue) and gives 0.99 when it is empty, and
// after the page is up the global `Math.random` is swapped for a constant 0.99 (the Stage's own per-frame calls read the global each time), so only the game takes from the queue. The first wait is
// drawn at 0.99 by the catch-up tick at start: 89,700 ms of fake time.
// Run: node sheet-init.mjs --base http://127.0.0.1:4173 [--sizes 360x640@2] [--only play,gift-coin]   Saves: gen-saves (saves/adult-home-adult.json, saves/adult-home-kid.json).
// Exit 0 when every picture was written, 2 when --base is missing, 1 when anything threw.
import { mkdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

const require = createRequire(process.env.PLAYWRIGHT_FROM ?? join(homedir(), "homelab-dashboard", "package.json"));
const { chromium } = require("playwright");

const OUT = process.env.VERIFY_OUT ?? join(tmpdir(), "broodkeep-verify");
const DIR = join(OUT, "sheet-init");
const T = 1795359600000; // 2026-11-22T15:00:00Z, where the fake clock starts (it is then paused and moved by `runFor` only)

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? null : args[i + 1];
};
const base = (flag("base") ?? "").replace(/\/$/, "");
if (!base) {
  console.error("--base <url> is required");
  process.exit(2);
}
const sizes = (flag("sizes") ?? "320x568@2,360x640@2,390x844@3,740x360@2,844x390@3").split(",").map((s) => {
  const m = /^(\d+)x(\d+)@(\d+)$/.exec(s);
  if (!m) {
    console.error(`bad size ${s} (want WxH@ratio)`);
    process.exit(2);
  }
  return [Number(m[1]), Number(m[2]), Number(m[3])];
});
const only = flag("only")?.split(",") ?? null;

const load = (file) => JSON.parse(readFileSync(join(OUT, "saves", file), "utf8"));
const adult = (formId) => () => {
  const save = load("adult-home-adult.json");
  if (formId) save.creature.formId = formId;
  return save;
};

// The kinds' draws, from the weights of the three forms at Bond level 1 (play, craving, gift): Gravelhorn 5, 4, 4; Murkfang and Ashwing 3, 3, 2 (tests/initiatives.test.ts pins those weights as literals). A kind is the
// middle of its slice of the draw; a craving's food is the index in the menu (pellet, then three), a gift is a coin when its draw is under a third, otherwise the material by its place in the list
// (fiber, herb, wood, fish, stone).
const GRAVEL = { craving: 0.5385, gift: 0.8462 };
const OTHER = { craving: 0.5625 };
const food = (i) => (i + 0.5) / 4;
const material = (i) => (i + 0.5) / 5;
const gift = (draw) => [GRAVEL.gift, ...draw];
const states = {
  play: { save: adult(), queue: [0.1], steps: ["until-shown"] },
  "craving-land": { save: adult(), queue: [GRAVEL.craving, food(1)], steps: ["until-shown"] },
  "craving-water": { save: adult("murkfang"), queue: [OTHER.craving, food(2)], steps: ["until-shown"] },
  "craving-sky": { save: adult("ashwing"), queue: [OTHER.craving, food(3)], steps: ["until-shown"] },
  "gift-coin": { save: adult(), queue: gift([0.1]), steps: ["until-shown"] },
  "gift-fiber": { save: adult(), queue: gift([0.5, material(0)]), steps: ["until-shown"] },
  "gift-herb": { save: adult(), queue: gift([0.5, material(1)]), steps: ["until-shown"] },
  "gift-wood": { save: adult(), queue: gift([0.5, material(2)]), steps: ["until-shown"] },
  "gift-fish": { save: adult(), queue: gift([0.5, material(3)]), steps: ["until-shown"] },
  "gift-stone": { save: adult(), queue: gift([0.5, material(4)]), steps: ["until-shown"] },
  "play-tossed": { save: adult(), queue: [0.1], steps: ["until-shown", "tap-bubble", "run-100"] },
  "gift-note": { save: adult(), queue: gift([0.1]), steps: ["until-shown", "tap-bubble", "run-100"] },
  "bond-card": { save: adult(), queue: [0.1], steps: ["until-shown", "open-bond"] },
  kid: { save: () => load("adult-home-kid.json"), queue: [], steps: ["run-100-seconds"] },
};

for (const name of only ?? []) {
  if (!(name in states)) {
    console.error(`unknown state ${name} (known: ${Object.keys(states).join(", ")})`);
    process.exit(2);
  }
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

async function run(page, ms, frame = 1000) {
  for (let left = ms; left > 0; left -= frame) await page.clock.runFor(Math.min(frame, left));
}

async function steps(page, list, notes) {
  for (const step of list) {
    if (step === "until-shown") {
      let found = false;
      for (let t = 0; t < 130_000 && !found; t += 1000) {
        await run(page, 1000);
        found = (await page.locator("canvas.room[data-initiative]").count()) > 0;
      }
      if (!found) notes.push("no initiative in 130 s");
      await run(page, 100, 50);
    } else if (step === "tap-bubble") {
      const box = await bubbleCenter(page);
      if (box) await page.touchscreen.tap(box.x, box.y);
      else notes.push("no bubble to tap");
    } else if (step === "run-100") {
      await run(page, 100, 50);
    } else if (step === "open-bond") {
      await page.locator("button.bond-chip").click();
      await run(page, 100, 50);
    } else if (step === "run-100-seconds") {
      await run(page, 100_000);
    }
  }
}

// The middle of the drawn bubble in page pixels (the canvas says where it is, in CSS pixels from its own top left corner).
async function bubbleCenter(page) {
  return page.evaluate(() => {
    const canvas = document.querySelector("canvas.room");
    const raw = canvas?.getAttribute("data-bubble");
    if (!canvas || !raw) return null;
    const [x, y, w, h] = raw.split(",").map(Number);
    const rect = canvas.getBoundingClientRect();
    return { x: rect.left + x + w / 2, y: rect.top + y + h / 2 };
  });
}

const browser = await chromium.launch({ headless: true });
mkdirSync(DIR, { recursive: true });
let written = 0;
let failed = 0;
try {
  for (const [w, h, dpr] of sizes) {
    for (const [name, state] of Object.entries(states)) {
      if (only && !only.includes(name)) continue;
      const notes = [];
      const context = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dpr, isMobile: true, hasTouch: true, locale: "en-US", timezoneId: "UTC", serviceWorkers: "block" });
      try {
        const page = await context.newPage();
        await page.addInitScript(() => {
          window.__q = [];
          Math.random = () => (window.__q.length ? window.__q.shift() : 0.99);
        });
        await page.clock.install({ time: T }); // (not setFixedTime: the game counts `Date.now()` between its ticks, so the clock has to move)
        const stub = `${base}/seed`;
        await page.route(stub, (route) => route.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html><title>seed</title>" }));
        await page.goto(stub);
        await page.evaluate(seedSave, state.save());
        await page.goto(`${base}/`);
        await page.locator("canvas.room").waitFor({ timeout: 20000 });
        await page.clock.pauseAt(T + 60_000);
        await page.evaluate((queue) => {
          Math.random = () => 0.99; // the Stage's own per-frame draws (the game kept the queue-reading one it found when it was built)
          window.__q.push(...queue);
        }, state.queue);
        await run(page, 100, 50);
        await steps(page, state.steps, notes);
        const seen = await page.evaluate(() => {
          const canvas = document.querySelector("canvas.room");
          return `${canvas?.getAttribute("data-initiative")} ${canvas?.getAttribute("data-bubble")}`;
        });
        const file = join(DIR, `${name}-${w}x${h}@${dpr}.png`);
        // (the Bond card is in the page's flow, not a fixed layer: it pushes the picture down, so the whole page shows whether the card covers the bubble)
        await page.screenshot({ path: file, animations: "disabled", fullPage: name === "bond-card" });
        written++;
        console.log(`wrote ${file} [${seen}]${notes.length ? ` (${notes.join("; ")})` : ""}`);
      } catch (error) {
        failed++;
        console.log(`FAILED ${name} ${w}x${h}@${dpr}: ${String(error).split("\n")[0]}`);
      }
      await context.close();
    }
  }
} finally {
  await browser.close().catch(() => {});
}
console.log(`SUMMARY ${written} pictures, ${failed} failed`);
process.exit(failed ? 1 : 0);
