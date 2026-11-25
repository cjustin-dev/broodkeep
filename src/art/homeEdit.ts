// What Decorate mode does to the layout (docs/home-plan.md section 12), as pure numbers: which piece a finger is on, where a lifted piece would land, and which
// layouts the six rules (homeLayout.ts) let it keep. No canvas and no page: tests/home-edit.test.ts runs every rule on its own.

import { COLS, KINDS, ROWS, SHAPES, TILE, piecesOf } from "../data/home";
import type { Layout, PieceKind, Placement } from "../data/home";
import { problemWith } from "./homeLayout";

// The layout with `kind` at `at` (null: put away), or null when that breaks a rule. The bed cannot be put away (rule 6).
export function moved(layout: Layout, kind: PieceKind, at: Placement | null): Layout | null {
  const next: Layout = { ...layout, [kind]: at === null ? null : { col: at.col, row: at.row } };
  return problemWith(next) === null ? next : null;
}

// The pieces in the tray: the ones put away (the Feeding Mat only once it is owned), in the pieces' own order.
export const trayOf = (layout: Layout, matOwned: boolean): PieceKind[] => KINDS.filter((kind) => layout[kind] === null && (kind !== "mat" || matOwned));

// The tile a point of the home (game pixels) is on.
export const tileOf = (point: { x: number; y: number }): { col: number; row: number } => ({ col: Math.floor(point.x / TILE), row: Math.floor(point.y / TILE) });

// The piece a finger on tile (col, row) takes: a solid piece over a flat one, and of two that overlap the one drawn later (rugs and mats lie under everything). The Feeding Mat is
// only there while it is owned.
export function pieceAt(layout: Layout, matOwned: boolean, col: number, row: number): PieceKind | null {
  const over = piecesOf(layout).filter((p) => col >= p.col && col < p.col + p.cols && row >= p.row && row < p.row + p.rows && (p.kind !== "mat" || matOwned));
  const top = [...over.filter((p) => p.solid).reverse(), ...over.filter((p) => !p.solid).reverse()][0];
  return top ? top.kind : null;
}

// Where a piece brought out of the tray goes: the allowed spot whose middle is nearest the middle of the view (`near`, in tiles; two spots equally near: the upper one, then the left
// one). Null when there is no allowed spot at all.
export function nearestSpot(layout: Layout, kind: PieceKind, near: { col: number; row: number }): Placement | null {
  const { cols, rows } = SHAPES[kind];
  const spots: Array<Placement & { d: number }> = [];
  for (let row = 0; row + rows <= ROWS; row++) {
    for (let col = 0; col + cols <= COLS; col++) spots.push({ col, row, d: Math.hypot(col + cols / 2 - near.col, row + rows / 2 - near.row) });
  }
  spots.sort((a, b) => a.d - b.d || a.row - b.row || a.col - b.col);
  const found = spots.find((s) => moved(layout, kind, s) !== null);
  return found ? { col: found.col, row: found.row } : null;
}

// A piece held by a finger: where it started, where the finger's tile would put it down, and whether the rules allow that.
export interface Lift {
  kind: PieceKind;
  from: Placement;
  at: Placement;
  grip: { col: number; row: number }; // the finger's tile, from the piece's top left tile (the piece does not jump to the finger)
  valid: boolean;
}

// The finger lands on tile (col, row): the piece under it is lifted, or null when there is none.
export function lift(layout: Layout, matOwned: boolean, col: number, row: number): Lift | null {
  const kind = pieceAt(layout, matOwned, col, row);
  const from = kind ? layout[kind] : null;
  if (!kind || !from) return null;
  return { kind, from: { ...from }, at: { ...from }, grip: { col: col - from.col, row: row - from.row }, valid: true };
}

// The finger moved to tile (col, row): the piece follows on the tile grid.
export function follow(layout: Layout, held: Lift, col: number, row: number): Lift {
  const at = { col: col - held.grip.col, row: row - held.grip.row };
  if (at.col === held.at.col && at.row === held.at.row) return held;
  return { ...held, at, valid: moved(layout, held.kind, at) !== null };
}

// The finger lifted: the layout with the piece put down where it is, or null when it goes back (the spot is not allowed, or it is the spot it came from).
export function drop(layout: Layout, held: Lift): Layout | null {
  if (held.at.col === held.from.col && held.at.row === held.from.row) return null;
  return moved(layout, held.kind, held.at);
}
