// Faces and poses made from a creature's one standing picture:
//   closed eyes     (sleeping, saying no, chewing, blinking)
//   heavy eyelids   (tired, sad, sick)
//   eyes looking up (watching food fall)
//   open mouth      (yawning)
//   drooping        (sad or sick: slumped and a bit wider, with heavy eyelids, or with eyes shut or
//                    yawning, so a slumped creature never pops upright for those)
//   lying down      (sleeping, and after death): squashed flat and wider
//
// The standing picture follows one rule so this works: each eye is a 2 x 2 block of
//   WW
//   WK     (white, white / white, dark pupil)
// and the mouth is the letter M. A creature with no such blocks simply keeps its standing look.
// Phase 2's real art can follow the same rules, or later get hand-drawn frames of its own.

import type { Form } from "../game/types";
import { MEAL, YAWN, blinking, eyesClosed } from "./idle";
import type { View } from "./idle";
import type { Sprite } from "./pixel";

export type FaceKind = "open" | "closed" | "half" | "up" | "yawn" | "droop" | "droopClosed" | "droopYawn" | "lie0" | "lie1";

// Pictures that are wider than the standing one (lying, drooping) are drawn on a canvas this
// wide. The standing picture is 16.
export const WIDE_WIDTH = 24;
export const isWide = (kind: FaceKind): boolean => kind.startsWith("droop") || kind.startsWith("lie");

// How much a drooping body is squashed, compared with 0.33 for lying flat.
const DROOP_SQUISH = 0.15;

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

// A copy of the picture that can be changed one letter at a time.
function editable(sprite: Sprite): { grid: string[][]; set: (x: number, y: number, letter: string) => void } {
  const grid = sprite.rows.map((row) => row.split(""));
  return {
    grid,
    set: (x, y, letter) => {
      const row = grid[y];
      if (row && x >= 0 && x < row.length) row[x] = letter;
    },
  };
}

const rebuild = (grid: string[][], sprite: Sprite): Sprite => ({ rows: grid.map((row) => row.join("")), palette: sprite.palette });

// Eyes shut: the top half of each eye becomes the body color above it, the bottom half a dark line.
export function closeEyes(sprite: Sprite): Sprite {
  const { grid, set } = editable(sprite);
  for (const { x, y } of findEyes(sprite.rows)) {
    const lid = grid[y - 1]?.[x] ?? ".";
    set(x, y, lid);
    set(x + 1, y, lid);
    set(x, y + 1, "K");
    set(x + 1, y + 1, "K");
  }
  return rebuild(grid, sprite);
}

// Heavy eyelids: a dark lid line over the top of each eye, the bottom half left open.
export function halfEyes(sprite: Sprite): Sprite {
  const { grid, set } = editable(sprite);
  for (const { x, y } of findEyes(sprite.rows)) {
    set(x, y, "K");
    set(x + 1, y, "K");
  }
  return rebuild(grid, sprite);
}

// Looking up: the pupil moves to the top row of each eye.
export function lookUp(sprite: Sprite): Sprite {
  const { grid, set } = editable(sprite);
  for (const { x, y } of findEyes(sprite.rows)) {
    set(x, y, "W");
    set(x + 1, y, "K");
    set(x, y + 1, "W");
    set(x + 1, y + 1, "W");
  }
  return rebuild(grid, sprite);
}

// A wide open mouth: a small mouth (M) becomes a rounded oval, one pixel wider on each side
// and one row taller above and two below:
//    MM
//   MMMM
//   MMMM
//    MM
// Outline (K), eye whites (W) and empty space are never painted over, so the body keeps its shape.
export function openMouth(sprite: Sprite): Sprite {
  const { grid, set } = editable(sprite);
  const free = (x: number, y: number): boolean => {
    const letter = grid[y]?.[x];
    return letter !== undefined && letter !== "." && letter !== "K" && letter !== "W";
  };
  sprite.rows.forEach((row, y) => {
    const first = row.indexOf("M");
    if (first < 0) return;
    const last = row.lastIndexOf("M");
    const grow = (rowY: number, from: number, to: number): void => {
      for (let x = from; x <= to; x++) if (free(x, rowY)) set(x, rowY, "M");
    };
    grow(y - 1, first, last);
    grow(y, first - 1, last + 1);
    grow(y + 1, first - 1, last + 1);
    grow(y + 2, first, last);
  });
  return rebuild(grid, sprite);
}

// Squash a sprite flat like a creature lying down: about a third fewer rows and a third more
// columns (squish 0.33). A smaller squish gives a slump. Rows in keepRows (the face) are never
// removed, and columns in keepCols (the eyes) are never doubled, so both eyes always look the
// same. The top and bottom outline rows and the two edge columns are never touched either. Rows
// and columns are removed or doubled at even spacing, so the shape stays the same. breath 1 keeps one more row than breath 0, and
// alternating the two looks like breathing. The bottom edge stays where it was, so a lying
// creature rests on the same floor line.
export function lieDown(sprite: Sprite, keepRows: number[], keepCols: number[], breath: 0 | 1, squish = 0.33): Sprite {
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
  const drop = Math.min(candidates.length, Math.max(0, Math.round((bottom - top + 1) * squish) - breath));
  const dropped = new Set<number>();
  for (let i = 0; i < drop; i++) dropped.add(candidates[Math.floor(((i + 0.5) * candidates.length) / drop)] as number);

  // Which columns to double (never the two edge columns, so the outline stays one pixel thick).
  const spare: number[] = [];
  for (let x = 1; x < width - 1; x++) if (!keepCols.includes(left + x)) spare.push(x);
  const extra = Math.min(Math.round(width * squish), WIDE_WIDTH - width, spare.length);
  const doubled = new Set<number>();
  for (let i = 0; i < extra; i++) doubled.add(spare[Math.floor(((i + 0.5) * spare.length) / extra)] as number);

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

  const padLeft = Math.floor((WIDE_WIDTH - (width + extra)) / 2);
  const blank = ".".repeat(WIDE_WIDTH);
  const out: string[] = [];
  for (let i = 0; i < bottom + 1 - kept.length; i++) out.push(blank); // empty rows above
  for (const line of kept) out.push(".".repeat(padLeft) + line + ".".repeat(WIDE_WIDTH - padLeft - line.length));
  while (out.length < height) out.push(blank); // empty rows below
  return { rows: out, palette: sprite.palette };
}

// The slumped version of a picture. Its face rows (the eye rows and every row with a mouth in it)
// are kept, and so are the eye columns.
function slump(base: Sprite, eyeRows: number[], eyeCols: number[]): Sprite {
  const mouthRows = base.rows.flatMap((row, y) => (row.includes("M") ? [y] : []));
  return lieDown(base, [...eyeRows, ...mouthRows], eyeCols, 0, DROOP_SQUISH);
}

const made = new Map<string, Sprite>();

// The creature's picture for each look. Made once per form, then reused.
export function faceSprite(form: Form, kind: FaceKind): Sprite {
  const key = `${form.id}:${kind}`;
  const hit = made.get(key);
  if (hit) return hit;

  const open: Sprite = { rows: form.idle, palette: form.palette };
  const eyes = findEyes(form.idle);
  const mouthRows = form.idle.flatMap((row, y) => (row.includes("M") ? [y] : []));
  const eyeCols = eyes.flatMap((eye) => [eye.x, eye.x + 1]);
  let sprite: Sprite;
  switch (kind) {
    case "open":
      sprite = open;
      break;
    case "closed":
      sprite = closeEyes(open);
      break;
    case "half":
      sprite = halfEyes(open);
      break;
    case "up":
      sprite = lookUp(open);
      break;
    case "yawn":
      sprite = openMouth(closeEyes(open));
      break;
    case "droop": // both rows of each eye stay: the lid line and the open half
      sprite = slump(halfEyes(open), eyes.flatMap((eye) => [eye.y, eye.y + 1]), eyeCols);
      break;
    case "droopClosed": // slumped with the eyes shut: the shut-eye line stays
      sprite = slump(closeEyes(open), eyes.map((eye) => eye.y + 1), eyeCols);
      break;
    case "droopYawn":
      sprite = slump(openMouth(closeEyes(open)), eyes.map((eye) => eye.y + 1), eyeCols);
      break;
    default: // lying: the shut-eye line and the mouth stay
      sprite = lieDown(closeEyes(open), [...eyes.map((eye) => eye.y + 1), ...mouthRows], eyeCols, kind === "lie1" ? 1 : 0);
  }
  made.set(key, sprite);
  return sprite;
}

// Which picture to draw this frame. A sad or sick creature stays slumped whatever it is doing
// (yawning, chewing, saying no), and does not blink.
export function pickFace(view: View, asleep: boolean, dead: boolean): FaceKind {
  if (dead || asleep) return !dead && Math.floor(view.clock / 1.4) % 2 === 1 ? "lie1" : "lie0";
  const slumped = view.mood.sick || view.mood.sad;
  if (view.pose === "yawn") {
    if (view.poseTime >= YAWN.open && view.poseTime < YAWN.close) return slumped ? "droopYawn" : "yawn";
    return slumped ? "droopClosed" : "closed";
  }
  if (eyesClosed(view)) return slumped ? "droopClosed" : "closed";
  if (view.pose === "eat" && view.poseTime < MEAL.drop * 0.6 && !slumped) return "up"; // watching the food fall
  if (slumped) return "droop";
  if (blinking(view)) return "closed";
  return view.mood.sleepy ? "half" : "open";
}

// Where the blanket goes on a lying picture: from the mouth down (so the eyes peek out), one
// pixel wider than the body each side. null if the picture is empty.
export function blanketBox(sprite: Sprite): { left: number; right: number; top: number; bottom: number } | null {
  const filled = sprite.rows.flatMap((row, y) => (/[^.]/.test(row) ? [y] : []));
  const first = filled[0];
  const last = filled[filled.length - 1];
  if (first === undefined || last === undefined) return null;
  let left = Infinity;
  let right = -1;
  for (const row of sprite.rows) {
    const start = row.search(/[^.]/);
    if (start >= 0) left = Math.min(left, start);
    right = Math.max(right, row.search(/[^.]\.*$/));
  }
  const mouth = sprite.rows.findIndex((row) => row.includes("M"));
  const fallback = first + Math.ceil((last - first + 1) * 0.55);
  const top = Math.min(last, Math.max(first + 1, mouth >= 0 ? mouth : fallback));
  return { left: left - 1, right: right + 1, top, bottom: last };
}

// Where a tear can start: the left end of each white run of an eye. Used on the drooping picture.
export function eyeSpots(sprite: Sprite): Array<{ x: number; y: number }> {
  const spots: Array<{ x: number; y: number }> = [];
  sprite.rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) if (row[x] === "W" && row[x - 1] !== "W") spots.push({ x, y });
  });
  return spots;
}
