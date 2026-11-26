// A contact sheet of the training session (adult track A3.2, Bug Catch): the Arena buttons in both modes and every card and state of the overlay, at 320x568@2, 360x640@2 and 390x844@3 and on
// their side at 740x360@2 and 844x390@3, one PNG per state and window in $VERIFY_OUT/sheet-train/. It has NO assertions: it only draws, and a person looks at the pictures before any check is
// trusted (the layout checks are train-browser.mjs).
//   arena-adult   the Arena screen in Adult Mode: Fight and Train, each with its word
//   arena-kid     the Arena screen in Kid Mode: the one wide Fight button, as before
//   start-card    the start card (the first of 3 full-reward sessions)
//   start-half    the start card with 3 sessions already counted (half reward)
//   play          a run with a plain bug and a golden bug on the field (found by letting the clock run)
//   paused        the same run after the Pause button
//   result-none   a run left alone for 75 s: no bug caught
//   start-bond   the start card with 6 sessions already counted (Bond XP only)
//   result-half   3 sessions counted and only the first 3 bugs tapped (Bronze at half reward: no Speed)
//   result-paid   a run in which the first bug on the field is tapped with a real touch every 250 ms
//   result-capped the same with Speed already at the adult cap (40)
//   result-bond   the same with Bond XP at 295, so a level 2 is reached
//   result-spent  the same with 6 sessions already counted (Bond XP only)
// Run: node sheet-train.mjs --base http://127.0.0.1:4173 [--sizes 360x640@2] [--only play,paused]   Saves: gen-saves (saves/adult-home-adult.json, saves/adult-home-kid.json).
// Exit 0 when every picture was written, 2 when --base is missing, 1 when anything threw.
import { mkdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

const require = createRequire(process.env.PLAYWRIGHT_FROM ?? join(homedir(), "homelab-dashboard", "package.json"));
const { chromium } = require("playwright");

const OUT = process.env.VERIFY_OUT ?? join(tmpdir(), "broodkeep-verify");
const DIR = join(OUT, "sheet-train");
const T = 1795359600000; // 2026-11-22T15:00:00Z, frozen; the window's time zone is UTC, so the local day is floor(T / 86400000)
const TODAY = Math.floor(T / 86_400_000);

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
  if (!m) throw new Error(`bad size ${s}`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
});
const only = flag("only")?.split(",") ?? null;

const load = (file) => JSON.parse(readFileSync(join(OUT, "saves", file), "utf8"));
const adult = (change = () => {}) => {
  const save = load("adult-home-adult.json");
  change(save);
  return save;
};
const sessions = (n) => (save) => {
  save.creature.training = { day: TODAY, sessions: { spd: n } };
};

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

// What each state needs: the save, and how far to take the game (the steps are done in order).
const states = {
  "arena-adult": { save: () => adult(), steps: ["arena"] },
  "arena-kid": { save: () => load("adult-home-kid.json"), steps: ["arena"] },
  "start-card": { save: () => adult(), steps: ["arena", "train"] },
  "start-half": { save: () => adult(sessions(3)), steps: ["arena", "train"] },
  "start-bond": { save: () => adult(sessions(6)), steps: ["arena", "train"] },
  play: { save: () => adult(), steps: ["arena", "train", "go", "until-both-kinds"] },
  paused: { save: () => adult(), steps: ["arena", "train", "go", "until-both-kinds", "pause"] },
  "result-none": { save: () => adult(), steps: ["arena", "train", "go", "run-out"] },
  "result-half": { save: () => adult(sessions(3)), steps: ["arena", "train", "go", "tap-few"] },
  "result-paid": { save: () => adult(), steps: ["arena", "train", "go", "tap-all"] },
  "result-capped": { save: () => adult((s) => (s.creature.trained = { spd: 40 })), steps: ["arena", "train", "go", "tap-all"] },
  "result-bond": { save: () => adult((s) => (s.creature.bond = { xp: 295, chain: 0, at: 0 })), steps: ["arena", "train", "go", "tap-all"] },
  "result-spent": { save: () => adult(sessions(6)), steps: ["arena", "train", "go", "tap-all"] },
};

// Let the fake clock run `ms` in frames of 50 ms (the game's own timers and the overlay's animation frames both run on it).
async function run(page, ms, frame = 50) {
  for (let left = ms; left > 0; left -= frame) await page.clock.runFor(Math.min(frame, left));
}

async function steps(page, list, notes) {
  for (const step of list) {
    if (step === "arena") {
      await page.locator('button[aria-label="Arena"]').click();
      await run(page, 200);
    } else if (step === "train") {
      await page.locator('button[aria-label^="Train"]').click();
      await run(page, 100);
    } else if (step === "go") {
      await page.getByRole("button", { name: "Go", exact: true }).click();
      await run(page, 100);
    } else if (step === "until-both-kinds") {
      let found = false;
      for (let t = 0; t < 60_000 && !found; t += 250) {
        await run(page, 250);
        found = (await page.locator('.bug[data-kind="golden"]').count()) > 0 && (await page.locator('.bug[data-kind="bug"]').count()) > 0;
      }
      if (!found) notes.push("no plain and golden bug at once in 60 s");
    } else if (step === "pause") {
      await page.getByRole("button", { name: "Pause", exact: true }).click();
      await run(page, 100);
    } else if (step === "run-out") {
      await run(page, 76_000, 100);
      await page.locator(".train-lines").waitFor({ timeout: 5000 });
    } else if (step === "tap-few") {
      // tap the first 3 bugs that appear, then leave the run alone until the result card is up
      let tapped = 0;
      for (let t = 0; t < 80_000; t += 250) {
        await run(page, 250);
        if (await page.locator(".train-lines").count()) break;
        if (tapped >= 3) continue;
        const box = await page.locator(".bug").first().boundingBox({ timeout: 500 }).catch(() => null);
        if (box) {
          await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
          tapped++;
        }
      }
      await page.locator(".train-lines").waitFor({ timeout: 5000 });
    } else if (step === "tap-all") {
      // tap the first bug that is on the field, every 250 ms, until the result card is up
      for (let t = 0; t < 80_000; t += 250) {
        await run(page, 250);
        if (await page.locator(".train-lines").count()) break;
        const box = await page.locator(".bug").first().boundingBox({ timeout: 500 }).catch(() => null);
        if (box) await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
      }
      await page.locator(".train-lines").waitFor({ timeout: 5000 });
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
          Math.random = () => 0.99;
        });
        await page.clock.install({ time: T });
        await page.clock.setFixedTime(T);
        const stub = `${base}/seed`;
        await page.route(stub, (route) => route.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html><title>seed</title>" }));
        await page.goto(stub);
        await page.evaluate(seedSave, state.save());
        await page.goto(`${base}/`);
        await page.locator("canvas.room").waitFor({ timeout: 20000 });
        await page.clock.pauseAt(T + 60_000); // after install the fake clock still runs in real time: hold it, so the pictures are the same every run
        await run(page, 100);
        await steps(page, state.steps, notes);
        const file = join(DIR, `${name}-${w}x${h}@${dpr}.png`);
        // finite CSS animations (the panel's 0.2 s fade) run on the real clock, not the fake one: finish them before the shot. The Arena screens are the page itself, so they are shot full page to show the buttons below the fold; the overlay is a fixed layer, shot at the window's size.
        await page.screenshot({ path: file, animations: "disabled", fullPage: name.startsWith("arena-") });
        written++;
        console.log(`wrote ${file}${notes.length ? ` (${notes.join("; ")})` : ""}`);
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
