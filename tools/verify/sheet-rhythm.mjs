// A contact sheet of Rhythm Grove (adult track A4.1): the start card with each game picked, the track on each field's ground at the notes' approach, a Perfect with the creature's hop, a stray, the
// pause, a kid's sparser song, and the result cards of a run left alone and of a run played with taps, at 320x568@2, 360x640@2 and 390x844@3 and on their side at 740x360@2 and 844x390@3, one PNG
// per state and window in $VERIFY_OUT/sheet-rhythm/. It has NO assertions: it only draws, and a person looks at the pictures before any check is trusted (the checks are rhythm-browser.mjs).
//   pick-bug       the start card with Bug Catch picked (the first of 3 full-reward sessions)
//   pick-rhythm    the start card with Rhythm Grove picked: its blurb, the windows in milliseconds, the Spirit line
//   pick-spent     Rhythm Grove picked with 6 Spirit sessions already counted (Bond XP only)
//   play-land      the Land song about 1.6 s in (a Land adult; Go's own 100 ms comes before the 1.5 s): the first note is about 0.4 s from the line
//   play-water     the same for a Water adult
//   play-sky       the same for a Sky adult
//   play-kid       the same for a Land kid (a sparser song)
//   perfect        a tap about 50 ms after the first note's time: the word over the line and the hop
//   stray          a tap with no note near: "No note, -30"
//   paused         the Land run after the Pause button
//   result-none    a run left alone for 75 s: no note hit
//   result-paid    a run in which a note is tapped with a real touch when it is on the line (frames of 20 ms)
// Run: node sheet-rhythm.mjs --base http://127.0.0.1:4173 [--sizes 360x640@2] [--only play-land,perfect]   Saves: gen-saves (saves/adult-home-adult.json).
// Exit 0 when every picture was written, 2 when --base is missing, 1 when anything threw.
import { mkdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

const require = createRequire(process.env.PLAYWRIGHT_FROM ?? join(homedir(), "homelab-dashboard", "package.json"));
const { chromium } = require("playwright");

const OUT = process.env.VERIFY_OUT ?? join(tmpdir(), "broodkeep-verify");
const DIR = join(OUT, "sheet-rhythm");
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

const as = (formId, change = () => {}) => () => {
  const save = load("adult-home-adult.json");
  save.creature.formId = formId; // another form of the same stage: the song is the form's field's
  change(save);
  return save;
};
const spirit = (n) => (save) => {
  save.creature.training = { day: TODAY, sessions: { spi: n } };
};

// What each state needs: the save, and how far to take the game (the steps are done in order).
const GO = ["arena", "train", "pick", "go"];
const states = {
  "pick-bug": { save: as("gravelhorn"), steps: ["arena", "train"] },
  "pick-rhythm": { save: as("gravelhorn"), steps: ["arena", "train", "pick"] },
  "pick-spent": { save: as("gravelhorn", spirit(6)), steps: ["arena", "train", "pick"] },
  "play-land": { save: as("gravelhorn"), steps: [...GO, "run-1500"] },
  "play-water": { save: as("murkfang"), steps: [...GO, "run-1500"] },
  "play-sky": { save: as("ashwing"), steps: [...GO, "run-1500"] },
  "play-kid": { save: as("pebblin", (save) => (save.creature.stageStartedAt = T - 3_600_000)), steps: [...GO, "run-1500"] }, // (a kid that is an hour into its stage: an old stage start would grow it at once)
  perfect: { save: as("gravelhorn"), steps: [...GO, "run-1950", "tap", "run-60"] },
  stray: { save: as("gravelhorn"), steps: [...GO, "run-1000", "tap", "run-60"] },
  paused: { save: as("gravelhorn"), steps: [...GO, "run-1500", "pause"] },
  "result-none": { save: as("gravelhorn"), steps: [...GO, "run-out"] },
  "result-paid": { save: as("gravelhorn"), steps: [...GO, "tap-on-line"] },
};

// Let the fake clock run `ms` in frames of `frame` ms (the game's own timers and the overlay's animation frames both run on it).
async function run(page, ms, frame = 50) {
  for (let left = ms; left > 0; left -= frame) await page.clock.runFor(Math.min(frame, left));
}

const pad = (page) => page.locator("button.rhythm-pad");
async function tapPad(page) {
  const box = await pad(page).boundingBox();
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
}

// The notes' centres against the line's, in window pixels: the tap goes when a note is within `tol` of the line.
const nearLine = (page, tol) =>
  page.evaluate((tol) => {
    const line = document.querySelector(".rhythm-line")?.getBoundingClientRect();
    if (!line) return false;
    const mid = (line.top + line.bottom) / 2;
    return [...document.querySelectorAll("[data-note]")].some((n) => {
      const r = n.getBoundingClientRect();
      return Math.abs((r.top + r.bottom) / 2 - mid) <= tol;
    });
  }, tol);

async function steps(page, list, notes) {
  for (const step of list) {
    if (step === "arena") {
      await page.locator('button[aria-label="Arena"]').click();
      await run(page, 200);
    } else if (step === "train") {
      await page.locator('button[aria-label^="Train"]').click();
      await run(page, 100);
    } else if (step === "pick") {
      await page.getByRole("button", { name: "Rhythm Grove", exact: true }).click();
      await run(page, 100);
    } else if (step === "go") {
      await page.getByRole("button", { name: "Go", exact: true }).click();
      await run(page, 100);
    } else if (step.startsWith("run-") && step !== "run-out") {
      await run(page, Number(step.slice(4)), step === "run-60" ? 20 : 50);
    } else if (step === "tap") {
      await tapPad(page);
    } else if (step === "pause") {
      await page.getByRole("button", { name: "Pause", exact: true }).click();
      await run(page, 100);
    } else if (step === "run-out") {
      await run(page, 76_000, 100);
      await page.locator(".train-lines").waitFor({ timeout: 5000 });
    } else if (step === "tap-on-line") {
      let taps = 0;
      for (let t = 0; t < 80_000; t += 20) {
        await run(page, 20, 20);
        if (await page.locator(".train-lines").count()) break;
        if (await nearLine(page, 4)) {
          await tapPad(page);
          taps += 1;
        }
      }
      await page.locator(".train-lines").waitFor({ timeout: 5000 });
      if (taps === 0) throw new Error("no tap was made: no note's centre came within 4 px of the line");
      notes.push(`${taps} taps were made when a note's centre was within 4 px of the line`);
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
        await page.screenshot({ path: file, animations: "disabled", fullPage: false });
        written++;
        console.log(`wrote ${file}${notes.length ? ` (${notes.join("; ")})` : ""}`);
      } catch (error) {
        failed++;
        await context.pages()[0]?.screenshot({ path: join(DIR, `FAILED-${name}-${w}x${h}@${dpr}.png`) }).catch(() => {}); // what the page showed when the step failed
        console.log(`FAILED ${name} ${w}x${h}@${dpr}: ${String(error).split("\n").slice(0, 3).join(" | ")}`);
      }
      await context.close();
    }
  }
} finally {
  await browser.close().catch(() => {});
}
console.log(`SUMMARY ${written} pictures, ${failed} failed`);
process.exit(failed ? 1 : 0);
