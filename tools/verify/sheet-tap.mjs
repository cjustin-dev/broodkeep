// A contact sheet of the field tappables (adult track A3.4): each kind (sparkle, rustle, bug, pickup) on the ground of each field (Land, Water, Sky), the note after a sparkle, the Bug Catch burst
// while it plays and its result card, the ground with several things on it, and Kid Mode in a field with nothing, at 320x568@2, 360x640@2, 390x844@3 and on its side at 740x360@2 and 844x390@3,
// one PNG per state and window in $VERIFY_OUT/sheet-tap/. It has NO assertions: it only draws (and prints what the canvas says about the ground), and a person looks at the pictures before any
// check is trusted (the checks are tap-browser.mjs).
//   <field>-<kind>  one thing of that kind on that field's ground (field: land, water, sky; kind: sparkle, rustle, bug, pickup)
//   note            a sparkle after the tap: the note over the picture
//   burst           the Bug Catch overlay a second and a half into its 10 seconds
//   burst-done      its result card after a burst with no catch
//   four            the Land ground after 150 s (up to four things, in whatever kinds the visit's draws made)
//   kid             Kid Mode in a field after 100 s: nothing
// How the draws are forced: see the header of tap-browser.mjs (a visit reads one draw from the queue when it starts, and the arithmetic is in tap-draws.mjs). The creature starts at home, the queue
// is armed, and the creature is taken to the field through the Places tray.
// Run: node sheet-tap.mjs --base http://127.0.0.1:4173 [--sizes 360x640@2] [--only land-sparkle,four]   Saves: gen-saves (saves/adult-home-adult.json, saves/adult-home-kid.json).
// Exit 0 when every picture was written, 2 when --base is missing, a size is bad or a state name is unknown, 1 when anything threw.
import { mkdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { drawFor } from "./tap-draws.mjs";

const require = createRequire(process.env.PLAYWRIGHT_FROM ?? join(homedir(), "homelab-dashboard", "package.json"));
const { chromium } = require("playwright");

const OUT = process.env.VERIFY_OUT ?? join(tmpdir(), "broodkeep-verify");
const DIR = join(OUT, "sheet-tap");
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
const fields = { land: "Land", water: "Water", sky: "Sky" };
const kinds = ["sparkle", "rustle", "bug", "pickup"];
const states = {};
for (const [id, name] of Object.entries(fields)) {
  for (const kind of kinds) states[`${id}-${kind}`] = { save: () => load("adult-home-adult.json"), queue: [drawFor(kind, 30_000).draw], field: name, steps: ["until-shown"] };
}
states.note = { save: () => load("adult-home-adult.json"), queue: [drawFor("sparkle").draw], field: "Land", steps: ["until-shown", "tap-first", "run-100"] };
states.burst = { save: () => load("adult-home-adult.json"), queue: [drawFor("bug").draw], field: "Land", steps: ["until-shown", "tap-first", "run-1500"] };
states["burst-done"] = { save: () => load("adult-home-adult.json"), queue: [drawFor("bug").draw], field: "Land", steps: ["until-shown", "tap-first", "run-12000"] };
states.four = { save: () => load("adult-home-adult.json"), queue: [drawFor("sparkle").draw], field: "Land", steps: ["run-150000"] };
states.kid = { save: () => load("adult-home-kid.json"), queue: [], field: "Land", steps: ["run-100000"] };

for (const name of only ?? []) {
  if (!Object.hasOwn(states, name)) {
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

// The ground as the canvas says it: each box in window pixels (the canvas brought into view first: on its side the picture starts below the fold).
const groundOf = (page) =>
  page.evaluate(() => {
    const canvas = document.querySelector("canvas.room");
    canvas.scrollIntoView({ block: "start", behavior: "instant" });
    const rect = canvas.getBoundingClientRect();
    const raw = canvas.getAttribute("data-tappables") ?? "";
    return raw
      .split("|")
      .filter((s) => s !== "")
      .map((s) => {
        const [kind, nums] = s.split(":");
        const [x, y, w, h] = nums.split(",").map(Number);
        return { kind, x: rect.left + x + w / 2, y: rect.top + y + h / 2 };
      });
  });

const tapButton = async (page, label) => {
  const box = await page.evaluate((l) => {
    const el = document.querySelector(`button[aria-label="${l}"]`);
    if (!el) return null;
    el.scrollIntoView({ block: "center", behavior: "instant" });
    const r = el.getBoundingClientRect();
    return { x: (r.left + r.right) / 2, y: (r.top + r.bottom) / 2 };
  }, label);
  if (!box) throw new Error(`no button "${label}"`);
  await page.touchscreen.tap(box.x, box.y);
  await run(page, 300, 50);
};

async function steps(page, state, notes) {
  if (state.field !== null) {
    await tapButton(page, "Go somewhere");
    await tapButton(page, state.field);
  }
  for (const step of state.steps) {
    if (step === "until-shown") {
      let found = false;
      for (let t = 0; t < 60_000 && !found; t += 1000) {
        await run(page, 1000);
        found = (await groundOf(page)).length > 0;
      }
      if (!found) notes.push("nothing on the ground in 60 s");
      await run(page, 100, 50);
    } else if (step === "tap-first") {
      const [first] = await groundOf(page);
      if (first) await page.touchscreen.tap(first.x, first.y);
      else notes.push("nothing to tap");
    } else if (step.startsWith("run-")) {
      await run(page, Number(step.slice(4)), step === "run-100" ? 50 : 250);
    }
  }
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
        await steps(page, state, notes);
        const seen = (await groundOf(page)).map((b) => b.kind).join(",");
        // (a fixed layer is shot at the window's size; the page scrolls as a whole, so the picture's top is brought to the top of the window first)
        const overlay = name.startsWith("burst");
        if (!overlay) {
          await page.evaluate(() => document.querySelector("canvas.room")?.scrollIntoView({ block: "start", behavior: "instant" }));
          await run(page, 100, 50);
        }
        const file = join(DIR, `${name}-${w}x${h}@${dpr}.png`);
        await page.screenshot({ path: file, animations: "disabled" });
        written++;
        console.log(`wrote ${file} [ground: ${seen || "none"}]${notes.length ? ` (${notes.join("; ")})` : ""}`);
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
