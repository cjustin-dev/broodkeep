// A contact sheet of Stack & Balance (adult track A4.2): the start card with the game picked, the field at the start, after a Perfect, a Good and a wobble, a tall stack, a kid's field, the pause, and the
// result cards of a run left alone, of one Perfect and then nothing, and of a stack that fell, at 320x568@2, 360x640@2 and 390x844@3 and on their side at 740x360@2 and 844x390@3, one PNG per state
// and window in $VERIFY_OUT/sheet-stack/. It has NO assertions: it only draws, and a person looks at the pictures before any check is trusted (the checks are stack-browser.mjs).
//   pick-stack     the start card with Stack & Balance picked (the first of 3 full-reward sessions)
//   pick-spent     Stack & Balance picked with 6 Strength sessions already counted (Bond XP only)
//   play-start     just after Go: the base alone, the moving block at the far left
//   perfect        a drop over the base's centre: "Perfect, combo 1", two blocks, the moving block gone until the next comes
//   good           a Perfect and then a Good: the cut-off block, "Good, trimmed N percent"
//   wobble         a bad drop at the start: the wobble line
//   tall           16 Perfects in a row: the stack scrolled so the top block is where it always is
//   play-kid       the same field for a kid (a slower block)
//   paused         the run after the Pause button
//   result-none    a run left alone for 75 s: no block landed
//   result-paid    one Perfect and then nothing: the stack stood for 74 seconds
//   result-fell    a Perfect, a wobble (the block at the far right) and a second bad drop (at the far left): the stack fell
// Run: node sheet-stack.mjs --base http://127.0.0.1:4173 [--sizes 360x640@2] [--only perfect,tall]   Saves: gen-saves (saves/adult-home-adult.json).
// Exit 0 when every picture was written, 2 when --base is missing, 1 when anything threw.
import { mkdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

const require = createRequire(process.env.PLAYWRIGHT_FROM ?? join(homedir(), "homelab-dashboard", "package.json"));
const { chromium } = require("playwright");

const OUT = process.env.VERIFY_OUT ?? join(tmpdir(), "broodkeep-verify");
const DIR = join(OUT, "sheet-stack");
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
  save.creature.formId = formId; // another form of the same stage: the stage sets the block's speed
  change(save);
  return save;
};
const strength = (n) => (save) => {
  save.creature.training = { day: TODAY, sessions: { str: n } };
};

// What each state needs: the save, and how far to take the game (the steps are done in order). The times are rough: the page's run clock is a little behind the fake clock, and Go's own 100 ms is
// counted in the first run step.
const GO = ["arena", "train", "pick", "go"];
const states = {
  "pick-stack": { save: as("gravelhorn"), steps: ["arena", "train", "pick"] },
  "pick-spent": { save: as("gravelhorn", strength(6)), steps: ["arena", "train", "pick"] },
  "play-start": { save: as("gravelhorn"), steps: [...GO, "run-20"] },
  perfect: { save: as("gravelhorn"), steps: [...GO, "run-860", "tap", "run-60"] },
  good: { save: as("gravelhorn"), steps: [...GO, "run-860", "tap", "run-540", "tap", "run-60"] },
  wobble: { save: as("gravelhorn"), steps: [...GO, "run-200", "tap", "run-60"] },
  tall: { save: as("gravelhorn"), steps: [...GO, "run-860", "tap", "tall-15"] },
  "play-kid": { save: as("pebblin", (save) => (save.creature.stageStartedAt = T - 3_600_000)), steps: [...GO, "run-1250", "tap", "run-60"] }, // (a kid that is an hour into its stage: an old stage start would grow it at once)
  paused: { save: as("gravelhorn"), steps: [...GO, "run-860", "tap", "run-400", "pause"] },
  "result-none": { save: as("gravelhorn"), steps: [...GO, "run-out"] },
  "result-paid": { save: as("gravelhorn"), steps: [...GO, "run-860", "tap", "run-out"] },
  "result-fell": { save: as("gravelhorn"), steps: [...GO, "run-860", "tap", "run-1040", "tap", "run-1700", "tap", "run-300"] },
};

// Let the fake clock run `ms` in frames of `frame` ms (the game's own timers and the overlay's animation frames both run on it).
async function run(page, ms, frame = 20) {
  for (let left = ms; left > 0; left -= frame) await page.clock.runFor(Math.min(frame, left));
}

const pad = (page) => page.locator("button.stack-pad");
async function tapPad(page) {
  const box = await pad(page).boundingBox();
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
}

async function steps(page, list) {
  for (const step of list) {
    if (step === "arena") {
      await page.locator('button[aria-label="Arena"]').click();
      await run(page, 200);
    } else if (step === "train") {
      await page.locator('button[aria-label^="Train"]').click();
      await run(page, 100);
    } else if (step === "pick") {
      await page.getByRole("button", { name: "Stack & Balance", exact: true }).click();
      await run(page, 100);
    } else if (step === "go") {
      await page.getByRole("button", { name: "Go", exact: true }).click();
      await run(page, 100);
    } else if (step === "tap") {
      await tapPad(page);
    } else if (step === "pause") {
      await page.getByRole("button", { name: "Pause", exact: true }).click();
      await run(page, 100);
    } else if (step === "run-out") {
      await run(page, 76_000, 100);
      await page.locator(".train-lines").waitFor({ timeout: 5000 });
    } else if (step.startsWith("tall-")) {
      // `n` more Perfects: the block passes the base's centre every 1944 ms, a tap each time (the first one came before this step)
      for (let k = 0; k < Number(step.slice(5)); k++) {
        await run(page, 1944, 20);
        await tapPad(page);
      }
      await run(page, 60);
    } else if (step.startsWith("run-")) {
      await run(page, Number(step.slice(4)));
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
        await steps(page, state.steps);
        const file = join(DIR, `${name}-${w}x${h}@${dpr}.png`);
        // finite CSS animations (the panel's 0.2 s fade) run on the real clock, not the fake one: finish them before the shot
        await page.screenshot({ path: file, animations: "disabled", fullPage: false });
        written++;
        console.log(`wrote ${file}`);
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
