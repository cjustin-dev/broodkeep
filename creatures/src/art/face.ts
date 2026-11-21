// Faces and poses made from a creature's one standing picture:
//   closed eyes  (sleeping, refusing food, chewing)
//   lying down   (sleeping, and after death): squashed flat and a bit wider
//
// The standing picture follows one rule so this works: each eye is a 2 x 2 block, written
//   WW
//   WK     (white, white / white, dark pupil)
// A creature with no such block simply keeps its open eyes. Phase 2's real art can follow the
// same rule, or later get hand-drawn frames of its own.

import type { Form } from "../game/types";
import type { Sprite } from "./pixel";

export type FaceKind = "open" | "closed" | "lie0" | "lie1";

// The lying picture is drawn on a canvas this wide (the standing one is 16), because it is wider.
export const LIE_WIDTH = 24;

export function findEyes(rows: string[]): Array<{ x: number; y: number }> {
  const eyes: Array<{ x: number; y: number }> = [];
  rows.forEach((row, y) => {
    const below = rows[y + 1] ?? "";
    for (let x = 0; x < row.length - 1; x++) {
      if (row[x] === "W" && row[x + 1] === "W" && below[x] === "W" && below[x + 1] === "K") eyes.push({ x, y });
    }
  });
  return eyes;
}

// Eyes shut: the top half of each eye becomes the body color above it, the bottom half a dark line.
export function closeEyes(sprite: Sprite): Sprite {
  const grid = sprite.rows.map((row) => row.split(""));
  const set = (x: number, y: number, letter: string): void => {
    const row = grid[y];
    if (row) row[x] = letter;
  };
  for (const { x, y } of findEyes(sprite.rows)) {
    const lid = grid[y - 1]?.[x] ?? ".";
    set(x, y, lid);
    set(x + 1, y, lid);
    set(x, y + 1, "K");
    set(x + 1, y + 1, "K");
  }
  return { rows: grid.map((row) => row.join("")), palette: sprite.palette };
}

// Squash flat like a creature lying down: about a third fewer rows and a third more columns.
// Rows in keepRows (the face) are never removed, and neither is the top or bottom outline.
// Rows and columns are removed or doubled at even spacing, so the shape stays the same.
// breath 1 keeps one more row than breath 0, and alternating the two looks like breathing.
// The bottom edge stays where it was, so a lying creature rests on the same floor line.
export function lieDown(sprite: Sprite, keepRows: number[], breath: 0 | 1): Sprite {
  const rows = sprite.rows;
  const height = rows.length;
  const filled = rows.map((row) => /[^.]/.test(row));
  const top = filled.indexOf(true);
  const bottom = filled.lastIndexOf(true);
  if (top < 0) return sprite;

  let left = Infinity;
  let right = -1;
  for (const row of rows) {
    const first = row.search(/[^.]/);
    if (first >= 0) left = Math.min(left, first);
    right = Math.max(right, row.search(/[^.]\.*$/));
  }
  const width = right - left + 1;

  // Which rows to drop.
  const candidates: number[] = [];
  for (let y = top + 1; y < bottom; y++) if (!keepRows.includes(y)) candidates.push(y);
  const drop = Math.min(candidates.length, Math.max(0, Math.round((bottom - top + 1) * 0.33) - breath));
  const dropped = new Set<number>();
  for (let i = 0; i < drop; i++) dropped.add(candidates[Math.floor(((i + 0.5) * candidates.length) / drop)] as number);

  // Which columns to double (never the two edge columns, so the outline stays one pixel thick).
  const extra = Math.min(Math.round(width * 0.33), LIE_WIDTH - width, Math.max(0, width - 2));
  const doubled = new Set<number>();
  for (let i = 0; i < extra; i++) doubled.add(1 + Math.floor(((i + 0.5) * (width - 2)) / extra));

  const kept: string[] = [];
  for (let y = top; y <= bottom; y++) {
    if (dropped.has(y)) continue;
    let line = "";
    for (let x = 0; x < width; x++) {
      const letter = (rows[y] ?? "")[left + x] ?? ".";
      line += doubled.has(x) ? letter + letter : letter;
    }
    kept.push(line);
  }

  const padLeft = Math.floor((LIE_WIDTH - (width + extra)) / 2);
  const blank = ".".repeat(LIE_WIDTH);
  const out: string[] = [];
  for (let i = 0; i < bottom + 1 - kept.length; i++) out.push(blank); // empty rows above
  for (const line of kept) out.push(".".repeat(padLeft) + line + ".".repeat(LIE_WIDTH - padLeft - line.length));
  while (out.length < height) out.push(blank); // empty rows below
  return { rows: out, palette: sprite.palette };
}

const made = new Map<string, Sprite>();

// The creature's picture for each look. Made once per form, then reused.
export function faceSprite(form: Form, kind: FaceKind): Sprite {
  const key = `${form.id}:${kind}`;
  const hit = made.get(key);
  if (hit) return hit;

  const open: Sprite = { rows: form.idle, palette: form.palette };
  let sprite = open;
  if (kind !== "open") {
    sprite = closeEyes(open);
    if (kind !== "closed") {
      const face = [
        ...findEyes(form.idle).map((eye) => eye.y + 1), // the closed-eye line
        ...form.idle.map((row, y) => (row.includes("M") ? y : -1)).filter((y) => y >= 0), // the mouth
      ];
      sprite = lieDown(sprite, face, kind === "lie1" ? 1 : 0);
    }
  }
  made.set(key, sprite);
  return sprite;
}
