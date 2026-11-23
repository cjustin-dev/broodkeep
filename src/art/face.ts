// Faces and poses made from a creature's standing pictures:
//   the looks   open, half (heavy lids), closed, up (watching food fall), happy (an arch each), yawn, sad (worried brows, a tear)
//   drooping    (sad or sick: slumped and a bit wider, with the sad or half look, or with eyes shut, yawning or happy, so a
//                slumped creature never pops upright for those)
//   lying down  (sleeping, and after death): squashed flat and wider
//
// A drawing has no face. The engine stamps one from the pattern file (data/face-patterns.json, the same file the Python drawing
// tools read, so a contact sheet shows what the game shows) at the form's anchor: the left eye's top left pixel and the top row of
// the mouth. The right eye is the left one moved over; brows, tears and blush are mirrored; mouths are centered. See
// tools/art/paradise/lib.py (stamp_face), which this file must match pixel for pixel (tests/face.test.ts checks it).
//
// A creature has two standing drawings: `idle` and `idle2` (a second frame for idle and walking). The looks are stamped on
// whichever frame is showing; drooping and lying are always made from the first.

import patterns from "../data/face-patterns.json";
import type { Face, Form, Stage } from "../game/types";
import { MEAL, YAWN, blinking, eyesClosed } from "./idle";
import type { View } from "./idle";
import { wideWidth } from "./layout";
import type { Sprite } from "./pixel";

export type Look = "open" | "half" | "closed" | "up" | "happy" | "yawn" | "sad";
export type FaceKind =
  | "open"
  | "closed"
  | "half"
  | "up"
  | "happy"
  | "yawn"
  | "droop"
  | "droopSad"
  | "droopClosed"
  | "droopYawn"
  | "droopHappy"
  | "lie0"
  | "lie1";

// Which stamped look each picture is made from.
const lookOf: Record<FaceKind, Look> = {
  open: "open",
  closed: "closed",
  half: "half",
  up: "up",
  happy: "happy",
  yawn: "yawn",
  droop: "half", // sick: heavy lids
  droopSad: "sad",
  droopClosed: "closed",
  droopYawn: "yawn",
  droopHappy: "happy",
  lie0: "closed",
  lie1: "closed",
};

// Pictures that are wider than the standing one (lying, drooping) are drawn on a canvas that is
// wideWidth(size) across (see layout.ts). The standing picture is `size` across.
export const isWide = (kind: FaceKind): boolean => kind.startsWith("droop") || kind.startsWith("lie");

// How much a drooping body is squashed, compared with 0.33 for lying flat.
const DROOP_SQUISH = 0.15;

// ---- the pattern file ----

interface Piece {
  dx: number;
  dy: number;
  rows: string[];
}
interface MouthPiece {
  x?: number;
  dy?: number;
  rows: string[];
}
interface StylePatterns {
  eye: { w: number; h: number };
  eyes: Record<string, string[]>;
  brows: Record<string, Piece>;
  tear: Piece;
  blush: Piece | null;
  mouths: Record<string, MouthPiece>;
  looks: Record<Look, { eyes: string; mouth: string; brows?: string; tear?: boolean; blush?: boolean }>;
}
const styles = patterns.styles as unknown as Record<"kid" | "young" | "adult", StylePatterns>;
const styleOf: Record<Stage, "kid" | "young" | "adult"> = { baby: "kid", kid: "kid", young: "young", adult: "adult" };

// A face stamped on a body drawing: the new rows, and which rows and columns the stamp touched (so the slump and the lying
// picture know what to keep).
export interface Stamped {
  rows: string[];
  faceRows: number[];
  faceCols: number[];
}

// Stamp the face for a look onto a body drawing. Throws if a piece lands off the picture or a mouth is not centered: the data
// tests stamp every look of every form, so a bad anchor is found there and never while drawing.
export function stampFace(body: readonly string[], stage: Stage, face: Face, look: Look): Stamped {
  const h = body.length;
  const w = body[0]?.length ?? 0;
  const grid = body.map((row) => row.split(""));
  const rowsTouched = new Set<number>();
  const colsTouched = new Set<number>();
  const put = (x: number, y: number, letter: string): void => {
    if (x < 0 || x >= w || y < 0 || y >= h) throw new Error(`a face piece lands off the picture at (${x}, ${y})`);
    grid[y]![x] = letter;
    rowsTouched.add(y);
    colsTouched.add(x);
  };
  const paste = (rows: string[], x0: number, y0: number): void => {
    rows.forEach((row, dy) =>
      [...row].forEach((letter, dx) => {
        if (letter !== ".") put(x0 + dx, y0 + dy, letter);
      }),
    );
  };
  // A mirrored piece (brows, tear, blush) is placed at the left eye and reflected across the picture for the right one.
  const pair = (piece: Piece): void => {
    piece.rows.forEach((row, dy) =>
      [...row].forEach((letter, dx) => {
        if (letter === ".") return;
        const x = face.x + piece.dx + dx;
        const y = face.y + piece.dy + dy;
        put(x, y, letter);
        put(w - 1 - x, y, letter);
      }),
    );
  };

  const style = styles[styleOf[stage]];
  const spec = style.looks[look];
  for (const x of [face.x, w - style.eye.w - face.x]) paste(style.eyes[spec.eyes]!, x, face.y); // the right eye is the left one moved over
  if (spec.brows) pair(style.brows[spec.brows]!);
  if (spec.tear) pair(style.tear);
  if (spec.blush && style.blush) pair(style.blush);
  if (face.mouth !== null) {
    const mouth = face.mouths?.[spec.mouth] ?? style.mouths[spec.mouth]!;
    const width = Math.max(...mouth.rows.map((row) => row.length));
    const left = mouth.x ?? Math.floor((w - width) / 2);
    if (left * 2 + width !== w) throw new Error(`a ${width} wide mouth at x ${left} is not centered on a ${w} wide picture`);
    paste(mouth.rows, left, face.mouth + (mouth.dy ?? 0));
  }
  return {
    rows: grid.map((row) => row.join("")),
    faceRows: [...rowsTouched].sort((a, b) => a - b),
    faceCols: [...colsTouched].sort((a, b) => a - b),
  };
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

// The picture for a look, made once per form and reused. `frame` picks the standing drawing (0 is `idle`, 1 is `idle2`) the look
// is stamped on. The drooping and lying looks always use the first, and keep every row and column the face touched, so the face
// is never squashed or doubled.
const made = new Map<string, Sprite>();

export function faceSprite(form: Form, kind: FaceKind, frame: 0 | 1 = 0): Sprite {
  const rows = frame === 1 && !isWide(kind) ? form.idle2 : form.idle;
  const key = `${form.id}:${kind}:${rows === form.idle ? 0 : 1}`;
  const hit = made.get(key);
  if (hit) return hit;

  const stamped = stampFace(rows, form.stage, form.face, lookOf[kind]);
  const base: Sprite = { rows: stamped.rows, palette: form.palette };
  let sprite: Sprite;
  if (kind.startsWith("lie")) sprite = lieDown(base, stamped.faceRows, stamped.faceCols, kind === "lie1" ? 1 : 0);
  else if (kind.startsWith("droop")) sprite = lieDown(base, stamped.faceRows, stamped.faceCols, 0, DROOP_SQUISH);
  else sprite = base;
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
  if (slumped) return view.mood.sick ? "droop" : "droopSad"; // sick: heavy lids. Sad: worried brows, a frown and a tear
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
