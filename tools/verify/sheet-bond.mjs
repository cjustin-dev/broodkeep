// A contact sheet of the Bond chip and card (adult track A3.1): the Adult Mode header in each state worth looking at, at 320x568@2, 360x640@2 and 390x844@3, one PNG per state and window in
// $VERIFY_OUT/sheet-bond/. It has NO assertions: it only draws, and a person looks at the pictures before any check is trusted (the layout checks are bond-browser.mjs).
//   level-1      a creature with no Bond yet (the chip says 1, an empty bar), a small bag
//   level-3      920 XP (120 of 700), a small bag
//   level-10     15000 XP, the worst bag (99999 coins and 999 of every material)
//   worst-card   2999 XP (1499 of 1500, the widest numbers), the worst bag, the card open
//   top-card     15000 XP, the card open
//   level-up     296 XP and a hold that reaches level 2, picture taken right after (the chip is mid-pop)
//   focus        the chip with the keyboard focus on it (Tab from the page's start until it is reached)
// Run: node sheet-bond.mjs --base http://127.0.0.1:4173 [--sizes 360x640@2]   Saves: gen-saves (saves/adult-home-adult.json). Exit 0 when every picture was written, 2 when --base is missing, 1 when anything threw (an uncaught error, which Node reports as 1).
import { mkdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

const require = createRequire(process.env.PLAYWRIGHT_FROM ?? join(homedir(), "homelab-dashboard", "package.json"));
const { chromium } = require("playwright");

const OUT = process.env.VERIFY_OUT ?? join(tmpdir(), "broodkeep-verify");
const DIR = join(OUT, "sheet-bond");
const T = 1795359600000; // 2026-11-22T15:00:00Z, frozen
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const BAG = { fiber: 999, herb: 999, wood: 999, fish: 999, stone: 999 };

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
const sizes = (flag("sizes") ?? "320x568@2,360x640@2,390x844@3").split(",").map((s) => {
  const m = /^(\d+)x(\d+)@(\d+)$/.exec(s);
  if (!m) throw new Error(`bad size ${s}`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
});

function adult(xp, extra = {}) {
  const save = JSON.parse(readFileSync(join(OUT, "saves", "adult-home-adult.json"), "utf8"));
  save.creature.bond = { xp, chain: 0, at: 0 };
  Object.assign(save, extra);
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

const states = {
  "level-1": { save: () => adult(0) },
  "level-3": { save: () => adult(920) },
  "level-10": { save: () => adult(15000, { coins: 99999, inventory: BAG }) },
  "worst-card": { save: () => adult(2999, { coins: 99999, inventory: BAG }), card: true },
  "top-card": { save: () => adult(15000), card: true },
  "level-up": { save: () => adult(296), hold: true },
  focus: { save: () => adult(920), focus: true },
};

const browser = await chromium.launch({ headless: true });
mkdirSync(DIR, { recursive: true });
let written = 0;
try {
  for (const [w, h, dpr] of sizes) {
    for (const [name, state] of Object.entries(states)) {
      const context = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dpr, isMobile: true, hasTouch: true, locale: "en-US", timezoneId: "UTC", serviceWorkers: "block" });
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
      await page.clock.runFor(100);
      await page.waitForTimeout(100);
      if (state.card) {
        await page.locator(".bond-chip").click();
        await page.clock.runFor(100);
      }
      if (state.focus) {
        for (let i = 0; i < 40; i++) {
          await page.keyboard.press("Tab");
          if (await page.evaluate(() => document.activeElement?.classList.contains("bond-chip"))) break;
        }
      }
      if (state.hold) {
        const cdp = await context.newCDPSession(page);
        const box = await page.locator("canvas.room").boundingBox();
        const z = Math.min(Math.max(1, Math.round(2.5 * dpr)), Math.max(1, Math.floor((box.width * dpr) / 192)));
        const x = box.x + box.width / 2;
        const y = box.y + (box.width * dpr) / 2 / dpr + (24 * z) / dpr; // the picture's middle, 24 game pixels down: the adult's middle
        const send = (type, points) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: points });
        await send("touchStart", [{ x, y }]);
        for (let left = 3000; left > 0; left -= 100) await page.clock.runFor(100); // pets at 450, 1250, 2050, 2850 ms: 297, 298, 299, then 300 (level 2) at the fourth
        await send("touchEnd", []);
        await sleep(40);
      }
      const file = join(DIR, `${name}-${w}x${h}@${dpr}.png`);
      await page.screenshot({ path: file });
      written++;
      console.log(`wrote ${file}`);
      await context.close();
    }
  }
} finally {
  await browser.close().catch(() => {});
}
console.log(`SUMMARY ${written} pictures`);
