// The home's floor plan as numbers (docs/home-plan.md, slice H1): which tiles a creature can stand on, how it finds its way round the furniture and through the
// doorways, and where the fixed spots are in game pixels. No canvas here, so all of it is tested without a browser (tests/home.test.ts).
//
// A creature stands on an ANCHOR: the leftmost tile of its footprint and the row of its feet. The footprint is as many tiles wide as its picture needs
// (footprintOf: 1 for an egg, baby or kid, 2 for a young or adult) and one tile deep: the body above the feet overlaps the tiles behind, as in any three-quarter
// view. Walking is from anchor to neighbouring anchor.

import { BASE_ROOMS, COLS, DEAD_TILE, DOOR_ROWS, EGG_TILE, PARTITIONS, POOP_TILES, ROOMS, ROWS, START_TILE, STARTER, TILE, WALL_ROWS, bedOf, colsOf, piecesOf } from "../data/home";
import type { Layout, Piece, Placement, RoomId } from "../data/home";
import { BED_WIDTH } from "./layout";

export interface Anchor {
  col: number;
  row: number;
}

// The size of the home in force: its width follows the rooms built (`useLayout`), so it is the one object every reader holds and `w` is changed in place.
export const HOME = { w: colsOf(BASE_ROOMS) * TILE, h: ROWS * TILE };

// Which floor tiles are free for a layout and a number of rooms built: inside the rooms built, below the wall rows, not on a partition (except in its doorway), and not under a solid
// piece of furniture.
const floorOf = (layout: Layout, rooms: number): boolean[] => {
  const solid = piecesOf(layout).filter((p) => p.solid);
  const cols = colsOf(rooms);
  return Array.from({ length: COLS * ROWS }, (_, i) => {
    const col = i % COLS;
    const row = Math.floor(i / COLS);
    if (col >= cols || row < WALL_ROWS) return false;
    if (PARTITIONS.includes(col) && !DOOR_ROWS.includes(row)) return false;
    return !solid.some((p) => col >= p.col && col < p.col + p.cols && row >= p.row && row < p.row + p.rows);
  });
};

// The layout and the number of rooms the walking is done on (docs/home-plan.md sections 12 and 16): the starter layout with three rooms until the Stage calls `useLayout` with the
// saved ones. Every function below that reads the floor or the bed reads these, so a layout is tried out with `withLayout` (art/homeLayout.ts) and put back.
let LAYOUT: Layout = STARTER;
let ROOMS_BUILT = BASE_ROOMS;
let FLOOR: boolean[] = floorOf(LAYOUT, ROOMS_BUILT);

export const layoutInForce = (): Layout => LAYOUT;
export const roomsInForce = (): number => ROOMS_BUILT;
// A profile that has never moved anything has the very same starter layout at three rooms and at four, so the layout alone cannot say that the floor changed: both are compared.
export function useLayout(layout: Layout, rooms: number = BASE_ROOMS): void {
  if (layout === LAYOUT && rooms === ROOMS_BUILT) return;
  LAYOUT = layout;
  ROOMS_BUILT = rooms;
  FLOOR = floorOf(layout, rooms);
  HOME.w = colsOf(rooms) * TILE;
}
export function withLayout<T>(layout: Layout, fn: () => T, rooms: number = ROOMS_BUILT): T {
  const before = LAYOUT;
  const roomsBefore = ROOMS_BUILT;
  useLayout(layout, rooms);
  try {
    return fn();
  } finally {
    useLayout(before, roomsBefore);
  }
}

export const isFloor = (col: number, row: number): boolean => col >= 0 && col < COLS && row >= 0 && row < ROWS && FLOOR[row * COLS + col] === true;

// How many tiles wide a creature's footprint is, from the width of its picture (16 egg, 20 baby, 24 kid, 36 young, 48 adult).
export const footprintOf = (size: number): number => Math.ceil(size / TILE);

export const fits = (col: number, row: number, f: number): boolean => {
  for (let i = 0; i < f; i++) if (!isFloor(col + i, row)) return false;
  return true;
};

// The left edge of the picture and the line of its feet (its bottom edge) for a creature standing on an anchor: centred on its footprint.
export function anchorPos(a: Anchor, size: number): { x: number; y: number } {
  return { x: a.col * TILE + (footprintOf(size) * TILE - size) / 2, y: (a.row + 1) * TILE };
}

const neighbours = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;

// The closest anchor (by tiles walked, ignoring furniture) where a footprint of f tiles fits, starting from (col, row); ties go to the first found in a fixed order.
export function nearestFree(col: number, row: number, f: number): Anchor {
  const start = { col: Math.max(0, Math.min(colsOf(ROOMS_BUILT) - 1, col)), row: Math.max(0, Math.min(ROWS - 1, row)) };
  const seen = new Set<number>([start.row * COLS + start.col]);
  const queue: Anchor[] = [start];
  for (let head = 0; head < queue.length; head++) {
    const here = queue[head] as Anchor;
    if (fits(here.col, here.row, f)) return here;
    for (const [dc, dr] of neighbours) {
      const next = { col: here.col + dc, row: here.row + dr };
      const key = next.row * COLS + next.col;
      if (next.col < 0 || next.col >= COLS || next.row < 0 || next.row >= ROWS || seen.has(key)) continue;
      seen.add(key);
      queue.push(next);
    }
  }
  return start; // (unreachable: the home has free floor for every footprint)
}

// The anchor nearest to a position (left edge x, feet line y) of a picture of the given size.
export function anchorOf(x: number, y: number, size: number): Anchor {
  const f = footprintOf(size);
  return nearestFree(Math.round((x - (f * TILE - size) / 2) / TILE), Math.round(y / TILE) - 1, f);
}

// Where a creature first stands in the home.
export const startAnchor = (size: number): Anchor => nearestFree(START_TILE.col, START_TILE.row, footprintOf(size));

// A shortest walk from one anchor to another over anchors where the footprint fits, one tile at a time: the anchors to visit, not counting the start. null when
// there is no way (or the goal does not fit).
export function findPath(from: Anchor, to: Anchor, f: number): Anchor[] | null {
  if (!fits(to.col, to.row, f)) return null;
  const via = walkTree(from, f);
  if (!via.has(to.row * COLS + to.col)) return null;
  return pathTo(via, from, to);
}

// A breadth-first search from `from`: for every anchor reached, the one it was reached from.
function walkTree(from: Anchor, f: number): Map<number, number> {
  const startKey = from.row * COLS + from.col;
  const via = new Map<number, number>([[startKey, startKey]]);
  const queue: Anchor[] = [from];
  for (let head = 0; head < queue.length; head++) {
    const here = queue[head] as Anchor;
    for (const [dc, dr] of neighbours) {
      const next = { col: here.col + dc, row: here.row + dr };
      const key = next.row * COLS + next.col;
      if (via.has(key) || !fits(next.col, next.row, f)) continue;
      via.set(key, here.row * COLS + here.col);
      queue.push(next);
    }
  }
  return via;
}

// Every anchor a creature with a footprint of f tiles can walk to from `from` (as keys, row * COLS + col), `from` included.
export const reachableFrom = (from: Anchor, f: number): Set<number> => new Set(walkTree(from, f).keys());

function pathTo(via: Map<number, number>, from: Anchor, to: Anchor): Anchor[] {
  const out: Anchor[] = [];
  let key = to.row * COLS + to.col;
  const startKey = from.row * COLS + from.col;
  while (key !== startKey) {
    out.push({ col: key % COLS, row: Math.floor(key / COLS) });
    key = via.get(key) as number;
  }
  return out.reverse();
}

// A walk to a random anchor anywhere in the home that can be reached from here (so through a doorway if need be): `rand` gives 0 up to 1. [] when there is nowhere to go.
export function wanderPath(from: Anchor, f: number, rand: () => number): Anchor[] {
  const via = walkTree(from, f);
  const startKey = from.row * COLS + from.col;
  const goals = [...via.keys()].filter((k) => k !== startKey).sort((a, b) => a - b);
  if (goals.length === 0) return [];
  const pick = goals[Math.min(goals.length - 1, Math.floor(rand() * goals.length))] as number;
  return pathTo(via, from, { col: pick % COLS, row: Math.floor(pick / COLS) });
}

export function roomOf(x: number): RoomId {
  const col = Math.max(0, Math.min(colsOf(ROOMS_BUILT) - 1, Math.floor(x / TILE))); // (the last column of the rooms built: with three rooms a position past the home is the kitchen's)
  const room = ROOMS.find((r) => col >= r.from && col <= r.to);
  if (room) return room.id;
  return col < (ROOMS[1] as { from: number }).from ? "bedroom" : "kitchen"; // (a partition column: the first belongs to the bedroom, the second to the kitchen)
}

// The tile to put food on, beside a creature standing on `a` (a footprint of f tiles) and facing left or right: the side it faces, then the other side, then the tile
// below it. When none of them is free floor, the tile it stands on (`own`).
export function foodTile(a: Anchor, f: number, facing: 1 | -1): { tile: Anchor; own: boolean } {
  const right = { col: a.col + f, row: a.row };
  const left = { col: a.col - 1, row: a.row };
  const order = facing === 1 ? [right, left] : [left, right];
  for (const t of [...order, { col: a.col, row: a.row + 1 }]) if (isFloor(t.col, t.row)) return { tile: t, own: false };
  return { tile: a, own: true };
}

// Is a piece of furniture drawn before (behind) a creature whose feet are at `feet`? Its bottom edge is at or above the feet line. A creature that is not walking among the
// furniture (asleep in bed, dead, away) has no feet line: pass Infinity and every piece is behind it.
export const isBehind = (p: Piece, feet: number): boolean => (p.row + p.rows) * TILE <= feet;

// Fixed spots, in game pixels. A lying creature (asleep in the bed, or dead) is drawn from the left edge `x` and the top `y`.
const bedNow = (): ReturnType<typeof bedOf> => bedOf((LAYOUT.bed ?? STARTER.bed) as Placement); // (a layout always has its bed: layoutOf's rule 6)
export const bedLying = (size: number): { x: number; y: number } => ({ x: bedNow().left + BED_WIDTH / 2 - size / 2, y: bedNow().y + 16 - size });
export const bedFront = (size: number): Anchor => nearestFree(bedNow().front.col, bedNow().front.row, footprintOf(size));
export const eggSpot = (): { x: number; y: number } => ({ x: EGG_TILE.col * TILE + (TILE - 16) / 2, y: (EGG_TILE.row + 1) * TILE - 16 });
export const deadCenter = (): number => DEAD_TILE.col * TILE + TILE / 2;
export const deadFeet = (): number => (DEAD_TILE.row + 1) * TILE;
export const poopSpot = (i: number): { x: number; y: number } | null => {
  const t = POOP_TILES[i];
  return t ? { x: t.col * TILE + (TILE - 8) / 2, y: (t.row + 1) * TILE - 10 } : null;
};
