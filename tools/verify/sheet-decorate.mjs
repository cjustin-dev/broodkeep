// Contact sheet for Decorate mode (slices H2b and H2c): the whole page in each state of the mode, in both modes, at 320, 360 and 390 wide, as sheets-decorate-h2b/<mode>-<W>x<H>@<ratio>-<n>-<state>.png
// (the pieces) and sheets-decorate-h2b/<mode>-<W>x<H>@<ratio>-walls-<n>-<state>.png (the wallpapers of the rooms).
// To be LOOKED at before any check is trusted. There are no assertions: a state that cannot be reached throws, prints "ERROR <name> <message>", and the exit code is 2; a console
// error or an uncaught exception on the page counts the same way, even when the picture looks right.
// Run: node sheet-decorate.mjs --base http://127.0.0.1:4173
// States, in order: the button, the mode on, the sofa selected, three pieces in the tray (sofa, rug, table), the sofa out of the tray, the sofa carried over free floor (white outline), the
// sofa carried into the wall's top row (red outline), after that drop, and the sofa carried onto the partition between two rooms (red outline). The Feeding Mat is owned. Frozen clock 2026-11-22T15:00:00Z, UTC, en-US, Math.random pinned (0.99).
// Walls, in order: the mode on, the living room's wall selected, Meadow on it, the sofa put away and the wall selected again (the dock offers the wallpapers only), the partition's
// tap (the living room's wall, outlined up to the partition), the kitchen's wall selected, Dusk on it, the bedroom's wall selected, and Done (three rooms, three walls). The save has
// both wallpapers owned (adult-home-walls).
// The points are worked out by hand for a camera at world (384, 96), the adult's middle: the sofa is columns 13 to 16, rows 1 and 2; the table is at (17,4); the rug at (13,4), 4 x 3 tiles;
// a sofa put out of the tray lands at (14,3), world x 336 to 432, y 72 to 120. The picture's box is read again before every point (a taller page scrolls).
import { mkdirSync, readFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

const require = createRequire(process.env.PLAYWRIGHT_FROM ?? join(homedir(), "homelab-dashboard", "package.json"));
const { chromium } = require("playwright");

const OUT = process.env.VERIFY_OUT ?? join(tmpdir(), "broodkeep-verify");
const T = 1795359600000;
const WINDOWS = [
  [320, 568, 2],
  [360, 640, 2],
  [390, 844, 3],
];

const args = process.argv.slice(2);
if (args.length !== 2 || args[0] !== "--base" || !/^http:\/\/127\.0\.0\.1:\d+$/.test(args[1])) {
  console.error("usage: node sheet-decorate.mjs --base http://127.0.0.1:<port>");
  process.exit(2);
}
const base = args[1];
const SHEETS = join(OUT, "sheets-decorate-h2b");
rmSync(SHEETS, { recursive: true, force: true });
mkdirSync(SHEETS, { recursive: true });

const SAVES = { pieces: "adult-home-mat", walls: "adult-home-walls" };
const load = (mode, kind) => JSON.parse(readFileSync(join(OUT, "saves", `${SAVES[kind]}-${mode}.json`), "utf8"));

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

async function sheet(browser, mode, [w, h, dpr], kind) {
  const tag = `${mode}-${w}x${h}@${dpr}${kind === "walls" ? "-walls" : ""}`;
  const context = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dpr, isMobile: true, hasTouch: true, locale: "en-US", timezoneId: "UTC", serviceWorkers: "block" });
  const page = await context.newPage();
  const errors = [];
  page.on("console", (msg) => msg.type() === "error" && errors.push(`console: ${msg.text()}`));
  page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));
  try {
    await page.addInitScript(() => {
      Math.random = () => 0.99;
    });
    await page.clock.install({ time: T });
    await page.clock.setFixedTime(T);
    await page.route(`${base}/seed`, (route) => route.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html><title>seed</title>" }));
    await page.goto(`${base}/seed`);
    await page.evaluate(seedSave, load(mode, kind));
    await page.goto(`${base}/`);
    await page.locator("canvas.room").waitFor({ timeout: 20000 });
    await page.clock.runFor(100);
    const box = () =>
      page.evaluate(() => {
        const c = document.querySelector("canvas.room");
        const r = c.getBoundingClientRect();
        return { w: c.width, left: r.left, top: r.top, css: r.width };
      });
    const at = async ([wx, wy], [cx, cy] = [384, 96]) => {
      const g = await box();
      const z = Math.min(Math.max(1, Math.round(2.5 * dpr)), Math.max(1, Math.floor(g.w / 192)));
      const k = g.css / g.w;
      return [g.left + (Math.round(g.w / 2 - cx * z) + wx * z) * k, g.top + (Math.round(g.w / 2 - cy * z) + wy * z) * k];
    };
    // The camera after n arrow-key steps from the opening view: a step is a fifth of the picture's width in device pixels, and the view stops at the home's ends.
    const cameraAfter = async (steps) => {
      const g = await box();
      const z = Math.min(Math.max(1, Math.round(2.5 * dpr)), Math.max(1, Math.floor(g.w / 192)));
      const half = g.w / (2 * z);
      return [Math.min(Math.max(384 + (steps * Math.round(g.w / 5)) / z, half), 768 - half), 96];
    };
    let n = 0;
    const snap = async (state) => {
      await page.clock.runFor(100);
      await page.screenshot({ path: join(SHEETS, `${tag}-${++n}-${state}.png`) });
    };
    const click = async (world) => page.mouse.click(...(await at(world)));
    const bin = page.getByRole("button", { name: /^Put (the .* away|away the selected piece)$/ });
    // A state that is not the one meant (a drag that grabbed nothing, a tap that missed) must stop the run, not be photographed: the canvas's own words say what is selected.
    const expectLabel = async (want) => {
      await page.clock.runFor(100);
      const got = await page.evaluate(() => document.querySelector("canvas.room").getAttribute("aria-label"));
      if (got !== want) throw new Error(`the picture's label is "${got}", expected "${want}"`);
    };
    const NOTHING = "Decorating the home. Nothing is selected.";
    const SOFA = "Decorating the home. The sofa is selected. The arrow keys move it.";
    const WALL = (room) => `Decorating the home. The ${room} wall is selected. Pick a wallpaper below.`;
    const swatch = (name, room) => page.getByRole("button", { name: `Put the ${name} wallpaper on the ${room} wall` });
    const pan = async (key, times) => {
      await page.locator("canvas.room").focus();
      for (let i = 0; i < times; i++) {
        await page.keyboard.press(key);
        await page.clock.runFor(60);
      }
    };
    const clickAt = async (world, steps) => page.mouse.click(...(await at(world, await cameraAfter(steps))));
    if (kind === "pieces") {
      await snap("button");
      await page.getByRole("button", { name: "Decorate the home" }).click();
      await expectLabel(NOTHING);
      await snap("on");
      await click([348, 36]); // the sofa
      await expectLabel(SOFA);
      await snap("sofa-selected");
      for (const world of [[348, 36], [420, 108], [324, 156]]) {
        await click(world); // the sofa, the table, the rug (its lower left tile: the creature stands on the others)
        await bin.click();
      }
      await snap("tray");
      await page.getByRole("button", { name: "Put out the sofa" }).click();
      await snap("sofa-out");
      await page.mouse.move(...(await at([396, 84]))); // (396 is the middle of tile 16; 384 is its edge)
      await page.mouse.down();
      await expectLabel(SOFA); // (a finger on a piece selects it)
      await page.mouse.move(...(await at([396, 140])), { steps: 6 });
      await snap("carried-white");
      await page.mouse.move(...(await at([396, 12])), { steps: 6 }); // tile (16, 0): the sofa (grip 2) would be at (14,0), in the wall's top row
      await snap("carried-red-wall");
      await page.mouse.up();
      await snap("after-red-drop");
      await page.mouse.move(...(await at([396, 84])));
      await page.mouse.down();
      await expectLabel(SOFA); // (the refused drop put the sofa back at (14,3): this finger is on it)
      await page.mouse.move(...(await at([300, 84])), { steps: 6 }); // tile (12, 3): the sofa would be at (10,3), over the partition column 10
      await snap("carried-red-partition");
      await page.mouse.up();
    } else {
      await page.getByRole("button", { name: "Decorate the home" }).click();
      await expectLabel(NOTHING);
      await snap("on");
      await click([300, 12]); // the living room's bare wall
      await expectLabel(WALL("living room"));
      await snap("living-selected");
      await swatch("meadow", "living room").click();
      await snap("living-meadow");
      await click([348, 36]); // the sofa
      await expectLabel(SOFA);
      await bin.click();
      await click([300, 12]);
      await expectLabel(WALL("living room"));
      await snap("sofa-away-wall-selected");
      await pan("ArrowRight", 1);
      await page.keyboard.press("Escape");
      await clickAt([516, 12], 1); // the partition
      await expectLabel(WALL("living room"));
      await snap("partition-tap");
      await page.keyboard.press("Escape");
      await pan("ArrowRight", 8);
      await clickAt([620, 12], 9); // the kitchen's bare wall
      await expectLabel(WALL("kitchen"));
      await snap("kitchen-selected");
      await swatch("dusk", "kitchen").click();
      await snap("kitchen-dusk");
      await pan("ArrowLeft", 16);
      await clickAt([60, 12], -7); // the bedroom's bare wall
      await expectLabel(WALL("bedroom"));
      await snap("bedroom-selected");
      await page.getByRole("button", { name: "Done decorating" }).click();
      await snap("done");
    }
  } catch (err) {
    errors.push(`${err.message}`);
  } finally {
    await context.close();
  }
  if (errors.length > 0) throw new Error(errors.slice(0, 2).join(" | "));
}

const browser = await chromium.launch({ headless: true });
let failed = 0;
for (const mode of ["adult", "kid"]) {
  for (const win of WINDOWS) {
    for (const kind of ["pieces", "walls"]) {
      const name = `${mode}-${win[0]}x${win[1]}@${win[2]}-${kind}`;
      try {
        await sheet(browser, mode, win, kind);
        console.log(`OK ${name}`);
      } catch (err) {
        failed++;
        console.log(`ERROR ${name} ${String(err.message).replace(/\s+/g, " ").slice(0, 400)}`);
      }
    }
  }
}
await browser.close();
console.log(`SUMMARY ${failed} of ${WINDOWS.length * 4} sheets failed, pictures in ${SHEETS}`);
process.exit(failed > 0 ? 2 : 0);
