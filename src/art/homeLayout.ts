// Which layouts of the home's furniture are allowed, and what a saved `home` turns into (docs/home-plan.md section 12). Pure numbers, no canvas: the rules are tested without a browser
// (tests/home-layout.test.ts). Rule 5 (everything can be walked to) is checked with the same walking code the creature uses, on the layout being tried (`withLayout`).

import { COLS, KINDS, ROOMS, ROWS, SHAPES, STARTER, WALL_ROWS, isProtected, piecesOf } from "../data/home";
import type { HomeSave, Layout } from "../data/home";
import { fits, isFloor, reachableFrom, startAnchor, withLayout } from "./home";

// Why a layout is not allowed, or null when it is. The six rules:
//  1. every placed piece is inside one room's columns (never on a partition) and inside the home; a piece that stands against the wall may start at row 1, the others lie on the floor;
//  2. two solid pieces never overlap (a rug and the mat are not solid);
//  3. a solid piece covers none of the protected tiles (the egg, the poop, the grave);
//  4. the two tiles in front of the bed are bare floor;
//  5. a creature one tile wide and a creature two tiles wide can each walk from where they start to every place they fit (no pocket is cut off, every room is open);
//  6. the bed is placed.
export function problemWith(layout: Layout): string | null {
  if (layout.bed === null) return "the bed is put away";
  const placed = piecesOf(layout);
  for (const p of placed) {
    if (!Number.isInteger(p.col) || !Number.isInteger(p.row)) return `${p.kind} is not on a whole tile`;
    if (!ROOMS.some((r) => p.col >= r.from && p.col + p.cols - 1 <= r.to)) return `${p.kind} is not inside one room`;
    if (p.row + p.rows > ROWS) return `${p.kind} is below the home`;
    if (p.row < (SHAPES[p.kind].wall ? 1 : WALL_ROWS)) return `${p.kind} is on the wall`;
  }
  const solid = placed.filter((p) => p.solid);
  for (const [i, a] of solid.entries()) {
    for (const b of solid.slice(i + 1)) {
      if (a.col < b.col + b.cols && b.col < a.col + a.cols && a.row < b.row + b.rows && b.row < a.row + a.rows) return `${a.kind} overlaps ${b.kind}`;
    }
    for (let col = a.col; col < a.col + a.cols; col++) {
      for (let row = a.row; row < a.row + a.rows; row++) if (isProtected(col, row)) return `${a.kind} covers a protected tile`;
    }
  }
  return withLayout(layout, () => {
    const bed = layout.bed as { col: number; row: number };
    if (!isFloor(bed.col + 1, bed.row + 2) || !isFloor(bed.col + 2, bed.row + 2)) return "the bed's front is not bare floor";
    for (const size of [24, 48]) {
      const f = Math.ceil(size / 24);
      const start = startAnchor(size);
      if (!fits(start.col, start.row, f)) return `no place for a creature ${f} wide to start`;
      const reached = reachableFrom(start, f);
      for (let col = 0; col < COLS; col++) {
        for (let row = 0; row < ROWS; row++) if (fits(col, row, f) && !reached.has(row * COLS + col)) return `a place a creature ${f} wide cannot walk to`;
      }
    }
    return null;
  });
}

// What a saved `home` means: the starter layout with the saved pieces put in (a missing kind stays at its starter place), or the starter layout whole when that breaks a rule. The
// same saved home gives the very same Layout object, which is what lets the Stage tell that the layout changed. A few of them are kept, keyed by what they say.
const known = new Map<string, Layout>();
export function layoutOf(home: HomeSave | undefined): Layout {
  if (!home) return STARTER;
  const key = JSON.stringify(home.pieces);
  const kept = known.get(key);
  if (kept) return kept;
  const layout: Layout = { ...STARTER };
  for (const kind of KINDS) {
    const at = home.pieces[kind];
    if (at !== undefined) layout[kind] = at === null ? null : { col: at.col, row: at.row };
  }
  const result = problemWith(layout) === null ? layout : STARTER;
  if (known.size >= 32) known.clear();
  known.set(key, result);
  return result;
}
