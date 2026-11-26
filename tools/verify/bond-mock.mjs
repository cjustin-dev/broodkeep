// Measures where Bond could go in Adult Mode's header (adult track A3.1, docs/adult-a3-plan.md decision 7), before any screen code: three candidate places, at 320, 360 and 390 wide at pixel
// ratios 1, 2 and 3. It lays the real src/ui/app.css out on a mock page with the markup of ui/AdultHud.tsx (icons are empty boxes the size of the real ones, no game), so the figures are
// the real rules' figures. Two bags: a small one (12 coins, no material) and the worst case (99999 coins and all five materials at 999, which wrap to a second line), each with the Switch button.
//   base  the header as it is now
//   A     one more chip in the bag: icon and the level ("10"); the progress and the next unlock cannot fit a chip, so they would live in a card a tap opens
//   B     a row under the five stat cells: icon, "Bond 10", a progress bar and "2999 / 3000", as a plain row (28 px) or as a button (44 px, the touch size)
//   C     a line in the stat details card: no cost until a stat is opened, and nothing to see until then
// Run: node bond-mock.mjs   Prints one line per size, ratio and bag: the header's height for each place and what it adds, and whether B's text fits its row. No assertions; nothing is written.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(process.env.PLAYWRIGHT_FROM ?? join(homedir(), "homelab-dashboard", "package.json"));
const { chromium } = require("playwright");

const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../../src/ui/app.css"), "utf8");
const icon = (px) => `<span style="display:inline-block;width:${px}px;height:${px}px"></span>`;
const chip = (text) => `<span class="chip tight">${icon(20)}${text}</span>`;

const cell = (label) =>
  `<button class="astat"><span class="astat-label">${label}</span><span class="astat-main"><span class="astat-num">100</span></span><span class="bar"><span class="fill" style="transform:translateX(0%)"></span></span><span class="astat-span">full for 20h</span></button>`;

function header({ bag, place }) {
  const chips = bag === "small" ? [chip("12")] : [chip("99999"), ...["999", "999", "999", "999", "999"].map(chip)];
  if (place === "A") chips.push(chip("10"));
  const strip1 = `<div class="strip"><button class="strip-id strip-open"><span class="strip-name">Hollowbloom</span><span class="strip-sub">Adult · 12:05 pm</span></button><button class="btn strip-btn">${icon(24)}<span>100%</span></button><button class="btn strip-btn">${icon(24)}</button></div>`;
  const strip2 = `<div class="strip"><div class="strip-bag">${chips.join("")}</div><button class="btn strip-btn strip-who"><span class="who-name">Christopher</span><span class="who-switch">Switch</span></button></div>`;
  const stats = `<div class="astats">${["FOOD", "MOOD", "ENRG", "CLEAN", "WELL"].map(cell).join("")}</div>`;
  const rowStyle = (h) => `display:flex;align-items:center;gap:8px;min-height:${h}px;padding:0 12px;background:var(--panel);border-radius:var(--radius-md);font-size:.85rem;font-weight:700;border:0;color:inherit;font-family:inherit`;
  const rowInside = `${icon(20)}<span class="bond-name">Bond 10</span><span style="flex:1;min-width:24px;height:6px;background:var(--bg-lift);border-radius:3px"></span><span class="bond-num" style="font-variant-numeric:tabular-nums">2999 / 3000</span>`;
  let row = "";
  if (place === "B28") row = `<div style="${rowStyle(28)}">${rowInside}</div>`;
  if (place === "B44") row = `<button style="${rowStyle(44)}">${rowInside}</button>`;
  const ctx = `<p class="adult-ctx">Rest when it is dark</p>`;
  const card = place === "C" ? `<section class="astat-card"><p>Full for 20 hours.</p><p>Bond level 10, 2999 of 3000 to level 11.</p></section>` : "";
  return `<header class="adult-top">${strip1}${strip2}${stats}${row}${card}${ctx}</header>`;
}

const browser = await chromium.launch();
for (const [width, ratio] of [320, 360, 390].flatMap((w) => [1, 2, 3].map((r) => [w, r]))) {
  const page = await browser.newPage({ viewport: { width, height: 640 }, deviceScaleFactor: ratio });
  for (const bag of ["small", "worst"]) {
    const heights = {};
    let fit = "";
    for (const place of ["base", "A", "B28", "B44", "C"]) {
      await page.setContent(`<style>${css}</style><main class="app"><div style="width:${width - 32}px">${header({ bag, place })}</div></main>`);
      await page.waitForTimeout(80);
      const m = await page.evaluate(() => {
        const top = document.querySelector(".adult-top");
        const range = (el) => {
          const r = document.createRange();
          r.selectNodeContents(el);
          return r.getBoundingClientRect().width;
        };
        const bagBox = document.querySelector(".strip-bag");
        const row = document.querySelector(".bond-name");
        const num = document.querySelector(".bond-num");
        const bar = row ? row.nextElementSibling : null;
        const rowBox = row ? row.parentElement : null;
        return {
          h: top.getBoundingClientRect().height,
          scroll: document.documentElement.scrollWidth,
          bagLines: bagBox ? Math.round(bagBox.getBoundingClientRect().height) : 0,
          rowText: row && num ? range(row) + range(num) : 0,
          barWidth: bar ? bar.getBoundingClientRect().width : 0,
          rowWidth: rowBox ? rowBox.clientWidth : 0,
        };
      });
      heights[place] = m;
      if (place === "B28") fit = `B text ${m.rowText.toFixed(0)} px, bar ${m.barWidth.toFixed(0)} px of a ${m.rowWidth} px row`;
    }
    const base = heights.base.h;
    const add = (p) => `${p} +${(heights[p].h - base).toFixed(0)}`;
    const wide = Object.entries(heights).filter(([, v]) => v.scroll > width).map(([k]) => k);
    console.log(`${width}@${ratio} ${bag.padEnd(5)} base ${base.toFixed(0)} px, bag ${heights.base.bagLines} -> A ${heights.A.bagLines} px | ${add("A")}, ${add("B28")}, ${add("B44")}, ${add("C")} | ${fit}${wide.length ? " | SIDEWAYS SCROLL: " + wide.join(",") : ""}`);
  }
  await page.close();
}
await browser.close();
