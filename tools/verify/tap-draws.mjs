// The draw arithmetic of a field visit, for the browser checks and the contact sheet (tap-browser.mjs, sheet-tap.mjs). See the header of tap-browser.mjs: this is a second, independent copy of the
// arithmetic in src/game/rng.ts (mulberry32) and src/game/tappables.ts (the first wait, the kind walk), written out with literals, so a page that disagrees with it fails a check.

export function mulberry(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// The materials in the order of `materials` in src/data/habitat.ts, and the word a note uses for each ("Found some herbs."): an independent copy, so a page that reorders or renames them fails a check.
export const MATERIAL_IDS = ["fiber", "herb", "wood", "fish", "stone"];
export const MATERIAL_WORDS = { fiber: "fiber", herb: "herbs", wood: "wood", fish: "fish", stone: "stone" };
export const KIND_WEIGHTS = [
  ["sparkle", 4],
  ["rustle", 3],
  ["bug", 3],
  ["pickup", 2],
];
// What a visit started with this queue draw makes first, after how long (the first wait is 20,000 to 40,000 ms), and where its six tries put it (x 12 to 108, top y 96 to 109, in game pixels; `x` and `y`
// are the first try). A try in the creature's way is refused and the next is drawn, so the thing is at the first try that was clear; if all six are refused the spawn waits for the next step and draws a NEW
// kind, so a check uses only draws whose first try is likely clear (see `drawFor`).
export function firstOf(draw) {
  const r = mulberry(Math.floor(draw * 2 ** 32));
  const waitMs = 20_000 + Math.floor(r() * 20_001);
  let left = r() * 12;
  let kind = "pickup";
  for (const [k, w] of KIND_WEIGHTS) {
    if (left < w) {
      kind = k;
      break;
    }
    left -= w;
  }
  const tries = [];
  for (let i = 0; i < 6; i++) tries.push([12 + Math.floor(r() * 97), 96 + Math.floor(r() * 14)]);
  return { draw, waitMs, kind, x: tries[0][0], y: tries[0][1], tries, pays: payDraws(draw, 0) };
}
// The draws a tap on the visit's first thing reads, in order: they come after the visit's own (the first wait, the kind, two for each placement try up to and including the one that was taken, and
// the next wait), so `tryIndex` is the index of the try the page took (0 when the first was clear). A sparkle reads a chance (below 0.5 is a material) and then the pick of the five; a rustle reads a chance
// (below 0.5 is a found gift, otherwise a moment together). Only right while the first thing has not been joined by a second: a second spawn is 20 s or more after the first.
export function payDraws(draw, tryIndex, n = 3) {
  const r = mulberry(Math.floor(draw * 2 ** 32));
  for (let i = 0; i < 2 * tryIndex + 5; i++) r();
  return Array.from({ length: n }, () => r());
}
// A draw whose visit makes `kind` first, within `maxMs` (the soonest of 5,000 evenly spread draws, so a run is short and the same every time); `skip` takes the nth one instead; `accept` narrows the
// draws further (a check that wants the thing close to the creature).
export function drawFor(kind, maxMs = 26_000, skip = 0, accept = () => true) {
  const found = [];
  for (let i = 0; i < 5000; i++) {
    const f = firstOf((i + 0.5) / 5000);
    // (the creature walks across the picture and a first try can be in its way wherever it is; the Land adult in the saved game is ASSUMED to stand about x 37 to 83 (read off a contact sheet, not measured) and its box widened by 8 pixels to cover x 29 to 91,
    // so a first try at x 20 or less (box ends at 28) or at 92 or more is clear of it where it stands. A check compares the page with any of the six tries, so a creature that has walked is no failure)
    if (f.kind === kind && f.waitMs <= maxMs && (f.x <= 20 || f.x >= 92) && accept(f)) found.push(f);
  }
  found.sort((a, b) => a.waitMs - b.waitMs);
  if (found.length <= skip) throw new Error(`no draw makes a ${kind} within ${maxMs} ms`);
  return found[skip];
}
