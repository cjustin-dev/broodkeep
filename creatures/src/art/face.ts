// Faces and poses made from a creature's one standing picture:
//   closed eyes     (sleeping, saying no, chewing, blinking)
//   heavy eyelids   (tired, sad, sick)
//   eyes looking up (watching food fall)
//   happy eyes      (a little arch each, the way a smiling face shuts its eyes: for joyful moments)
//   open mouth      (yawning)
//   drooping        (sad or sick: slumped and a bit wider, with heavy eyelids, or with eyes shut,
//                    yawning or happy, so a slumped creature never pops upright for those)
//   lying down      (sleeping, and after death): squashed flat and wider
//
// A creature has two standing drawings: `idle` and, for every form but the two babies, `idle2` (a
// second frame for idle and walking). The eye, blink, happy and yawn pictures are made from
// whichever frame is showing; drooping and lying are always made from the first.
//
// The standing picture follows one rule so this works: each eye is a 2 x 2 block of
//   WW
//   WK     (white, white / white, dark pupil)
// and the mouth is the letter M. A creature with no such blocks simply keeps its standing look.
// All 20 creatures follow these rules (a test checks it), so every emote works on every form.

import type { Form } from "../game/types";
import { MEAL, YAWN, blinking, eyesClosed } from "./idle";
import type { View } from "./idle";
import { wideWidth } from "./layout";
import type { Sprite } from "./pixel";

export type FaceKind = "open" | "closed" | "half" | "up" | "happy" | "yawn" | "droop" | "droopClosed" | "droopYawn" | "droopHappy" | "lie0" | "lie1";

// Pictures that are wider than the standing one (lying, drooping) are drawn on a canvas that is
// wideWidth(size) across (see layout.ts). The standing picture is `size` across.
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

// Happy eyes: each eye becomes a small arch, two pixels on the top row of the eye with a foot one
// pixel out on each side of the row below:
//    KK
//   K  K
// The arch is dark (K) unless the body is too dark for that to show, then it takes the creature's
// eye color (W), which is bright on those forms. Under the arch is the body color beside the eye
// (the pixel above the eye can be outline), taken from the side toward the middle of the picture so
// that the two eyes of a face agree. A foot only goes on a body pixel (outline, mouth and
// empty space are left alone, and an outline pixel already is dark, so it works as the foot).
const MIN_ARCH_CONTRAST = 3;

// Brightness of a "#rrggbb" color from 0 (black) to 1 (white), or null for any other format.
function brightness(color: string | undefined): number | null {
  const hex = /^#([0-9a-f]{6})$/i.exec(color ?? "");
  if (!hex) return null;
  const n = parseInt(hex[1]!, 16);
  const channel = (value: number): number => {
    const c = value / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
}

export function happyEyes(sprite: Sprite): Sprite {
  const { grid, set } = editable(sprite);
  const isBody = (letter: string | undefined): letter is string => letter !== undefined && !".KWM".includes(letter);
  const middle = (sprite.rows[0]?.length ?? 0) / 2;
  for (const { x, y } of findEyes(sprite.rows)) {
    const sides = x + 1 < middle ? [x + 2, x - 1] : [x - 1, x + 2]; // the inner side first
    const beside = sides.map((col) => sprite.rows[y + 1]?.[col]).find(isBody);
    const fill = beside ?? grid[y - 1]?.[x] ?? ".";
    const dark = brightness(sprite.palette.K);
    const body = brightness(sprite.palette[fill]);
    const showsDark = dark === null || body === null || (Math.max(dark, body) + 0.05) / (Math.min(dark, body) + 0.05) >= MIN_ARCH_CONTRAST;
    const arch = showsDark ? "K" : "W";
    set(x, y, arch);
    set(x + 1, y, arch);
    set(x, y + 1, fill);
    set(x + 1, y + 1, fill);
    for (const foot of [x - 1, x + 2]) if (isBody(sprite.rows[y + 1]?.[foot])) set(foot, y + 1, arch);
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
// creature rests on the same floor line. The picture grows to wideWidth(its width) columns.
export function lieDown(sprite: Sprite, keepRows: number[], keepCols: number[], breath: 0 | 1, squish = 0.33): Sprite {
  const rows = sprite.rows;
  const height = rows.length;
  const wide = wideWidth(rows[0]?.length ?? 0);
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
  const extra = Math.min(Math.round(width * squish), wide - width, spare.length);
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

  const padLeft = Math.floor((wide - (width + extra)) / 2);
  const blank = ".".repeat(wide);
  const out: string[] = [];
  for (let i = 0; i < bottom + 1 - kept.length; i++) out.push(blank); // empty rows above
  for (const line of kept) out.push(".".repeat(padLeft) + line + ".".repeat(wide - padLeft - line.length));
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

// The creature's picture for each look. Made once per form, then reused. `frame` picks the
// standing drawing (0 is `idle`, 1 is `idle2`) that the look is made from. Forms with no second
// drawing, and the drooping and lying looks, always use the first.
export function faceSprite(form: Form, kind: FaceKind, frame: 0 | 1 = 0): Sprite {
  const rows = frame === 1 && form.idle2 && !isWide(kind) ? form.idle2 : form.idle;
  const key = `${form.id}:${kind}:${rows === form.idle ? 0 : 1}`;
  const hit = made.get(key);
  if (hit) return hit;

  const open: Sprite = { rows, palette: form.palette };
  const eyes = findEyes(rows);
  const mouthRows = rows.flatMap((row, y) => (row.includes("M") ? [y] : []));
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
    case "happy":
      sprite = happyEyes(open);
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
    case "droopHappy": // both rows of each arch stay, and the columns of its feet are never doubled
      sprite = slump(happyEyes(open), eyes.flatMap((eye) => [eye.y, eye.y + 1]), [...eyeCols, ...eyes.flatMap((eye) => [eye.x - 1, eye.x + 2])]);
      break;
    default: // lying: the shut-eye line and the mouth stay
      sprite = lieDown(closeEyes(open), [...eyes.map((eye) => eye.y + 1), ...mouthRows], eyeCols, kind === "lie1" ? 1 : 0);
  }
  made.set(key, sprite);
  return sprite;
}

// Which picture to draw this frame. A sad or sick creature stays slumped whatever it is doing
// (yawning, chewing, saying no, being happy), and does not blink.
export function pickFace(view: View, asleep: boolean, dead: boolean): FaceKind {
  if (dead || asleep) return !dead && Math.floor(view.clock / 1.4) % 2 === 1 ? "lie1" : "lie0";
  const slumped = view.mood.sick || view.mood.sad;
  if (view.pose === "yawn") {
    if (view.poseTime >= YAWN.open && view.poseTime < YAWN.close) return slumped ? "droopYawn" : "yawn";
    return slumped ? "droopClosed" : "closed";
  }
  if (eyesClosed(view)) return slumped ? "droopClosed" : "closed";
  if (view.pose === "happy") return slumped ? "droopHappy" : "happy"; // fed, petted, cleaned, cured, hatched, evolved
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
