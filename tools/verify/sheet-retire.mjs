// Contact sheet for the Retire section: one screenshot per state and window size, written to sheets/<WxH>-<state>.png, to be LOOKED at.
// Run: node sheet-retire.mjs --base http://127.0.0.1:4173
// Pixel ratio 2, UTC, en-US, frozen clock 2026-11-22T15:00:00Z, saves from saves/<scenario>-<mode>.json (made by gen-saves).
// There are no assertions here: a state that cannot be reached throws, prints "ERROR <name> <message>", and the exit code is 2.
// States: ready, card, after (status line at the top), after-lives (the list, scrolled into view), lives (several lives, one unknown form),
// teaser (a young creature), away (an adult on a job), fight (a fight is on), kid-ready and kid-card (Kid Mode).
import { mkdirSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

// Playwright is not a dependency of the game. PLAYWRIGHT_FROM names a package.json next to a node_modules that has it.
const require = createRequire(process.env.PLAYWRIGHT_FROM ?? join(homedir(), "homelab-dashboard", "package.json"));
const { chromium } = require("playwright");

// Everything these scripts make (saves, screenshots, builds, copies) goes to VERIFY_OUT, never into the repo.
const OUT = process.env.VERIFY_OUT ?? join(tmpdir(), "broodkeep-verify");
const T = 1795359600000;
const SIZES = [
  [320, 568],
  [360, 640],
  [390, 844],
];

const args = process.argv.slice(2);
if (args.length !== 2 || args[0] !== "--base" || !/^http:\/\/127\.0\.0\.1:\d+$/.test(args[1])) {
  console.error("usage: node sheet-retire.mjs --base http://127.0.0.1:<port>");
  process.exit(2);
}
const base = args[1];
const SHEETS = join(OUT, "sheets");
mkdirSync(SHEETS, { recursive: true });
// Pictures of an earlier run are removed first: a state that fails this time must not leave an old picture under its label.
for (const f of readdirSync(SHEETS)) if (f.endsWith(".png")) rmSync(join(SHEETS, f));

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

const dialog = (page) => page.locator('section.panel[role="dialog"][aria-label="Creature Book"]');

async function open(browser, scenario, mode, [w, h]) {
  const context = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, locale: "en-US", timezoneId: "UTC", serviceWorkers: "block" });
  const page = await context.newPage();
  await page.clock.install({ time: T });
  await page.clock.setFixedTime(T);
  const stub = `${base}/seed`;
  await page.route(stub, (route) => route.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html><title>seed</title>" }));
  await page.goto(stub);
  await page.evaluate(seedSave, JSON.parse(readFileSync(join(OUT, "saves", `${scenario}-${mode}.json`), "utf8")));
  await page.goto(`${base}/`);
  await page.waitForSelector('button[aria-label^="Creature Book"]', { timeout: 20000 });
  await page.waitForTimeout(300);
  return { context, page };
}

const openBook = async (page) => {
  await page.locator('button[aria-label^="Creature Book"]').first().click();
  await dialog(page).waitFor({ state: "visible", timeout: 5000 });
  await page.waitForTimeout(300);
};
const retireButton = (page) => dialog(page).locator("section.retire").getByRole("button", { name: "Retire Gravelhorn", exact: true });
const shot = (page, size, state) => page.screenshot({ path: join(SHEETS, `${size[0]}x${size[1]}-${state}.png`) });

const STATES = {
  ready: { scenario: "adult-home", mode: "adult", run: async (page) => openBook(page) },
  card: { scenario: "adult-home", mode: "adult", run: async (page) => { await openBook(page); await retireButton(page).click(); await dialog(page).locator(".retire-card").waitFor({ state: "visible", timeout: 5000 }); } },
  after: { scenario: "adult-home", mode: "adult", run: async (page) => { await openBook(page); await retireButton(page).click(); await dialog(page).getByRole("button", { name: "Retire, complete, pass on", exact: true }).click(); await dialog(page).locator('[role="status"]').waitFor({ state: "visible", timeout: 5000 }); } },
  "after-lives": { scenario: "adult-home", mode: "adult", run: async (page) => { await openBook(page); await retireButton(page).click(); await dialog(page).getByRole("button", { name: "Retire, complete, pass on", exact: true }).click(); await dialog(page).locator(".book-lives").scrollIntoViewIfNeeded(); } },
  lives: { scenario: "adult-home-lives", mode: "adult", run: async (page) => { await openBook(page); await dialog(page).locator(".book-lives").scrollIntoViewIfNeeded(); } },
  teaser: { scenario: "young-home", mode: "adult", run: async (page) => openBook(page) },
  away: { scenario: "adult-away", mode: "adult", run: async (page) => openBook(page) },
  fight: { scenario: "adult-fight", mode: "adult", run: async (page) => {
    await page.getByRole("button", { name: "Arena", exact: true }).click();
    await page.locator('button[aria-label="Fight a wild creature"]').click();
    await page.locator('button[aria-label="Attack"]').waitFor({ state: "visible", timeout: 5000 });
    await openBook(page);
  } },
  "kid-ready": { scenario: "adult-home", mode: "kid", run: async (page) => openBook(page) },
  "kid-card": { scenario: "adult-home", mode: "kid", run: async (page) => { await openBook(page); await retireButton(page).click(); await dialog(page).locator(".retire-card").waitFor({ state: "visible", timeout: 5000 }); } },
};

let browser;
try {
  browser = await chromium.launch({ headless: true });
} catch (err) {
  console.log(`ERROR launch ${err && err.message ? err.message : err}`);
  process.exit(2);
}
let failed = 0;
let taken = 0;
try {
  for (const size of SIZES) {
    for (const [state, spec] of Object.entries(STATES)) {
      let context;
      try {
        const opened = await open(browser, spec.scenario, spec.mode, size);
        context = opened.context;
        await spec.run(opened.page);
        // The panel is the scroller (.panel, position fixed). The clicks above can leave it scrolled; every state but the two that scroll
        // to the list is shown from the top of the panel, as a player sees it on opening.
        if (state !== "after-lives" && state !== "lives") await opened.page.evaluate(() => { const p = document.querySelector('section.panel[role="dialog"]'); if (p) p.scrollTop = 0; });
        await opened.page.waitForTimeout(300);
        await shot(opened.page, size, state);
        taken++;
        console.log(`SHOT ${size[0]}x${size[1]}-${state}`);
      } catch (err) {
        failed++;
        console.log(`ERROR ${size[0]}x${size[1]}-${state} ${err && err.message ? err.message : err}`);
      } finally {
        if (context) await context.close().catch(() => {});
      }
    }
  }
} finally {
  await browser.close().catch(() => {});
}
console.log(`DONE ${taken} screenshots, ${failed} errors`);
process.exitCode = failed > 0 || taken === 0 ? 2 : 0;
