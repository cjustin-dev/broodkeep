// Hats (adult track A2.4, docs/adult-a2-plan.md section 12): one rule puts a hat on any picture of any form, in any pose, from the finished pixel grid alone (no data
// per form). The "crown row" is the first row whose filled span is at least 40% of the widest row's (and at least 3 cells), so ears, horns and spikes that stand above
// the head are left beside the hat. The hat's last row lies on that row, centred on its span; a hat that would start above the picture moves down; cells outside the
// picture are dropped. A baby and a kid get the small hat, a young and an adult the large one. The hat uses the digits 1 to 5 as its own palette letters (no form uses a
// digit), and `withHat` builds a new picture: the one it is given (the cached, hatless one) is never changed. Pure: no canvas.

import { isHatId } from "../data/shop";
import type { HatId } from "../data/shop";
import type { Save } from "../game/state";
import type { Stage } from "../game/types";
import type { Sprite } from "./pixel";

export interface HatArt {
  palette: Record<string, string>; // 1 outline, 2 body, 3 light, 4 shade, 5 trim
  small: string[]; // baby and kid: 7 wide
  large: string[]; // young and adult: 13 wide
}

// The grids are finished (outlined). Their last row sits on the head, so it has no outline below it.
export const hatArt: Record<HatId, HatArt> = {
  // Knit Cap: red, a cream pom-pom and band.
  "hat-knit": {
    palette: { "1": "#2f1b26", "2": "#d8504f", "3": "#f08a80", "4": "#a53a3f", "5": "#fbf3e6" },
    small: [
      "..111..",
      ".15551.",
      ".12221.",
      "1322241",
      "1555551",
    ],
    large: [
      ".....111.....",
      "....15551....",
      "...1555551...",
      "....15551....",
      "...1322241...",
      "..132222241..",
      ".13222222241.",
      "1322222222241",
      "1555555555551",
    ],
  },
  // Acorn Cap: a brown cap with a crosshatch and a stem.
  "hat-acorn": {
    palette: { "1": "#2f1b26", "2": "#b07a3c", "3": "#d9a45c", "4": "#7a4f26", "5": "#5a3a1c" },
    small: [
      "...1...",
      "..151..",
      ".13231.",
      "1323231",
      "1444441",
    ],
    large: [
      "......1......",
      ".....151.....",
      "....11511....",
      "...1323231...",
      "..132323231..",
      ".13232323231.",
      "1232323232321",
      "1444444444441",
    ],
  },
  // Fisher Hat: yellow, a dome on a wide brim.
  "hat-fisher": {
    palette: { "1": "#2f2a1b", "2": "#f2c230", "3": "#ffe27a", "4": "#c48f10", "5": "#8a6a0c" },
    small: [
      "..111..",
      ".12221.",
      ".13221.",
      "1344441",
    ],
    large: [
      ".....111.....",
      "....12221....",
      "...1322221...",
      "..132222241..",
      ".11555555511.",
      "1322222222241",
      "1444444444441",
    ],
  },
  // Stone Crown: grey, three points and a blue gem.
  "hat-crown": {
    palette: { "1": "#232830", "2": "#9aa3ad", "3": "#c9d0d8", "4": "#6b737d", "5": "#4aa8e8" },
    small: [
      ".1.1.1.",
      "1212121",
      "1222221",
      "1345441",
    ],
    large: [
      ".1....1....1.",
      "121..121..121",
      "1221122211221",
      "1222222222221",
      "1322225222241",
      "1344444444441",
    ],
  },
};

// The hat the player's creature wears, or null (a save only ever holds an owned hat id, but this reads it as the type).
export const hatOf = (save: Save): HatId | null => (isHatId(save.hat) ? save.hat : null);

export const hatSizeOf = (stage: Stage): "small" | "large" => (stage === "baby" || stage === "kid" ? "small" : "large");

const MIN_SHARE = 0.4; // of the widest row
const MIN_CELLS = 3;
const MAX_HOP = 2; // how far the hat may be from where it sits on the form's first drawing, in rows and in columns
const within = (value: number, around: number): number => Math.min(around + MAX_HOP, Math.max(around - MAX_HOP, value));

// The row a hat sits on and the middle of that row's span, or null for a picture that has no row wide enough (an empty one).
export function crownRow(rows: readonly string[]): { row: number; centre: number } | null {
  const spans = rows.map((row) => {
    const first = row.search(/[^.]/);
    return first < 0 ? null : { first, last: row.search(/[^.]\.*$/) };
  });
  const widest = Math.max(0, ...spans.map((span) => (span ? span.last - span.first + 1 : 0)));
  if (widest === 0) return null;
  const need = Math.max(MIN_CELLS, Math.round(widest * MIN_SHARE));
  const row = spans.findIndex((span) => span !== null && span.last - span.first + 1 >= need);
  const span = spans[row];
  return span ? { row, centre: (span.first + span.last) / 2 } : null;
}

// The picture with the hat on it: the same size, a new rows array and a new palette. A picture the rule finds no crown row in comes back as it is. `first` is the same form's
// first drawing, for its second one: a form that lifts a claw or an ear above its head in the second drawing would carry the hat up with it, so the hat stays within `MAX_HOP`
// of where it sits on the first.
export function withHat(sprite: Sprite, hat: HatId, stage: Stage, first?: Sprite): Sprite {
  let crown = crownRow(sprite.rows);
  if (!crown) return sprite;
  const home = first ? crownRow(first.rows) : null;
  if (home) crown = { row: within(crown.row, home.row), centre: within(crown.centre, home.centre) };
  const art = hatArt[hat];
  const grid = hatSizeOf(stage) === "small" ? art.small : art.large;
  const top = Math.max(0, crown.row + 1 - grid.length);
  const left = Math.floor(crown.centre - grid[0]!.length / 2 + 0.5); // (round half up)
  const rows = sprite.rows.map((row, y) => {
    const hatRow = grid[y - top];
    if (hatRow === undefined) return row;
    const cells = row.split("");
    for (let x = 0; x < hatRow.length; x++) {
      const col = left + x;
      if (hatRow[x] !== "." && col >= 0 && col < cells.length) cells[col] = hatRow[x]!;
    }
    return cells.join("");
  });
  return { rows, palette: { ...sprite.palette, ...art.palette } };
}
