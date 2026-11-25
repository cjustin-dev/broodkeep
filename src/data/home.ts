// The home (docs/home-plan.md, slice H1): three rooms in a row on a grid of 24 pixel tiles, a bedroom, a living room and a kitchen, and what stands in them
// from the start. Rooms are 10 tiles wide, with a one-tile partition (a wall with a doorway two tiles high) between them: 32 x 8 tiles, 768 x 192 game pixels.
// Slice H3 (section 16) lets the house grow: a fourth room, the Playroom, is built to the right of the kitchen when the Shop's item for it is owned, which makes the home 43 tiles wide.
// `COLS` is the width of the widest home and the stride of every grid array; `colsOf(rooms)` is the width of the home with that many rooms built.
// The top two rows of every room are its wall, the other six its floor. Furniture that is `solid` takes the floor tiles it covers; a rug or a mat does not.
// The starter layout is data; what the player has moved (Decorate mode, docs/home-plan.md section 12) is saved as `Save.home` and read back through `layoutOf`
// (art/homeLayout.ts), which checks it against the rules and falls back to the starter layout.

import { isWallId } from "./shop";
import type { ItemId } from "./shop";

export const TILE = 24;
export const COLS = 43;
export const ROWS = 8;
export const WALL_ROWS = 2;

export type RoomId = "bedroom" | "living" | "kitchen" | "playroom";

export interface RoomSpan {
  id: RoomId;
  from: number; // first column
  to: number; // last column
  item?: ItemId; // the shop item that builds the room (the first three rooms are always built)
}

export const ROOMS: RoomSpan[] = [
  { id: "bedroom", from: 0, to: 9 },
  { id: "living", from: 11, to: 20 },
  { id: "kitchen", from: 22, to: 31 },
  { id: "playroom", from: 33, to: 42, item: "room-play" },
];

export const BASE_ROOMS = 3; // the rooms every home has
export const PARTITIONS = [10, 21, 32]; // the columns of the partitions (the last one is there once the Playroom is built)

// How many rooms are built: the three base rooms, and each later room whose item is owned (in order: a room is built only after the one before it).
export function roomsBuilt(owned: readonly string[]): number {
  let n = BASE_ROOMS;
  while (n < ROOMS.length && owned.includes(ROOMS[n]?.item as string)) n++;
  return n;
}

// The columns of a home with that many rooms built (32 for three, 43 for four).
export const colsOf = (rooms: number): number => (ROOMS[Math.min(ROOMS.length, Math.max(BASE_ROOMS, rooms)) - 1] as RoomSpan).to + 1;

// Whether a room is built, for the rooms a save owns.
export const isBuilt = (room: RoomId, owned: readonly string[]): boolean => ROOMS.findIndex((r) => r.id === room) < roomsBuilt(owned);
export const DOOR_ROWS = [4, 5]; // the rows of the doorway in each partition

export type PieceKind = "bed" | "dresser" | "sofa" | "rug" | "table" | "counter" | "fridge" | "bowl" | "mat";

export interface Placement {
  col: number;
  row: number; // the top row; a piece that starts in the wall rows (row 1) reaches down onto the floor
}

export interface Shape {
  cols: number;
  rows: number;
  solid: boolean;
  wall: boolean; // stands against the wall: may start in the wall row (row 1) and reach down onto the floor; the others lie wholly on the floor
}

export interface Piece extends Placement {
  kind: PieceKind;
  cols: number;
  rows: number;
  solid: boolean;
}

// The order is the drawing order of the flat pieces (the mat is always over the rug) and of the solid ones.
export const KINDS: PieceKind[] = ["bed", "dresser", "sofa", "rug", "table", "counter", "fridge", "mat", "bowl"];

export const SHAPES: Record<PieceKind, Shape> = {
  bed: { cols: 3, rows: 2, solid: true, wall: true },
  dresser: { cols: 2, rows: 2, solid: true, wall: true },
  sofa: { cols: 4, rows: 2, solid: true, wall: true },
  rug: { cols: 4, rows: 3, solid: false, wall: false },
  table: { cols: 2, rows: 2, solid: true, wall: false }, // (columns 19 and 20 beside it stay open at the start: a 2-wide creature needs both to reach the doorway)
  counter: { cols: 6, rows: 2, solid: true, wall: true },
  fridge: { cols: 2, rows: 2, solid: true, wall: true },
  mat: { cols: 3, rows: 1, solid: false, wall: false }, // the Feeding Mat (drawn only when owned)
  bowl: { cols: 1, rows: 1, solid: true, wall: false },
};

// Where every piece is, or null when it is put away. Always complete.
export type Layout = Record<PieceKind, Placement | null>;

export const STARTER: Layout = {
  bed: { col: 1, row: 1 },
  dresser: { col: 6, row: 1 },
  sofa: { col: 13, row: 1 },
  rug: { col: 13, row: 4 },
  table: { col: 17, row: 4 },
  counter: { col: 23, row: 1 },
  fridge: { col: 30, row: 1 },
  mat: { col: 23, row: 5 },
  bowl: { col: 24, row: 5 },
};

// The pieces that are placed, in drawing order.
export const piecesOf = (layout: Layout): Piece[] =>
  KINDS.flatMap((kind) => {
    const at = layout[kind];
    const shape = SHAPES[kind];
    return at ? [{ kind, col: at.col, row: at.row, cols: shape.cols, rows: shape.rows, solid: shape.solid }] : [];
  });

export const PIECES: Piece[] = piecesOf(STARTER); // the starter layout's pieces

// What the tray and a screen reader call each piece.
export const PIECE_NAMES: Record<PieceKind, string> = {
  bed: "Bed",
  dresser: "Dresser",
  sofa: "Sofa",
  rug: "Rug",
  table: "Table",
  counter: "Counter",
  fridge: "Fridge",
  mat: "Feeding mat",
  bowl: "Bowl",
};

// What is saved in `Save.home`: the pieces the player has moved or put away (null). A kind that is missing is at its starter place. `walls` is the wallpaper a room has been given in
// Decorate mode (an owned wallpaper's id, or null for the plain wall); a room that is not in it shows the wall of the whole home, `Save.wall` (the Shop sets that one).
export interface HomeSave {
  pieces: Partial<Record<PieceKind, Placement | null>>;
  walls?: Partial<Record<RoomId, string | null>>;
}

// The wallpaper a room shows: its own entry when it has one, else `whole`, the wall of the whole home.
export const wallOfRoom = (whole: string | null, home: HomeSave | undefined, room: RoomId): string | null => (home?.walls && Object.hasOwn(home.walls, room) ? (home.walls[room] ?? null) : whole);

// The room whose wall a tile belongs to, or null when it is not a wall tile (the wall is the top WALL_ROWS rows) or lies beyond the rooms built (`rooms`: the three base rooms unless said). A
// partition belongs to the room on its left.
export function wallRoomOf(col: number, row: number, rooms: number = BASE_ROOMS): RoomId | null {
  if (row < 0 || row >= WALL_ROWS || col < 0 || col >= colsOf(rooms)) return null;
  const room = ROOMS.find((r) => col >= r.from && col <= r.to);
  if (room) return room.id;
  return (ROOMS.filter((r) => r.to < col).pop() as RoomSpan).id;
}

// The home without the room entries that name wallpaper `id` (it is no longer owned). Gives the very same object when there is nothing to drop.
export function withoutWall(home: HomeSave | undefined, id: string): HomeSave | undefined {
  if (!home?.walls || !Object.values(home.walls).includes(id)) return home;
  const walls = Object.fromEntries(Object.entries(home.walls).filter(([, v]) => v !== id)) as NonNullable<HomeSave["walls"]>;
  return Object.keys(walls).length > 0 ? { pieces: home.pieces, walls } : { pieces: home.pieces };
}

// The home without a room that is no longer owned (the Shop's undo): every piece the save has inside it is put away (`null`: a missing key would put it back on its starter place) and its
// wallpaper entry is dropped. Gives the very same object when there is nothing to change.
export function withoutRoom(home: HomeSave | undefined, id: RoomId): HomeSave | undefined {
  const room = ROOMS.find((r) => r.id === id);
  if (!home || !room) return home;
  const inside = KINDS.filter((kind) => {
    const at = home.pieces[kind];
    return at !== undefined && at !== null && at.col >= room.from;
  });
  const hasWall = home.walls !== undefined && Object.hasOwn(home.walls, id);
  if (inside.length === 0 && !hasWall) return home;
  const pieces = { ...home.pieces, ...Object.fromEntries(inside.map((kind) => [kind, null])) };
  const walls = Object.fromEntries(Object.entries(home.walls ?? {}).filter(([key]) => key !== id)) as NonNullable<HomeSave["walls"]>;
  return Object.keys(walls).length > 0 ? { pieces, walls } : { pieces };
}

// The bed's art (room.ts draws it from these) for a bed at `at`: the left edge, and `y`, the top of a 16 pixel creature lying on it (a lying creature is centred on it), and
// `front`, the tile in front of it that a creature walks to before it lies down. The starter bed at (1, 1) gives 32, 47 and (2, 3).
export const bedOf = (at: Placement): { left: number; y: number; front: { col: number; row: number } } => ({ left: at.col * TILE + 8, y: at.row * TILE + 23, front: { col: at.col + 1, row: at.row + 2 } });
export const BED = bedOf(STARTER.bed as Placement); // the starter bed

// Where things are put: tiles (col, row) on the floor. The egg and a dead creature are in the bedroom, poop on five tiles of the living room, and a creature away on a
// job leaves a bubble over the middle of the living room.
export const EGG_TILE = { col: 5, row: 5 };
export const DEAD_TILE = { col: 7, row: 5 };
export const POOP_TILES: Array<{ col: number; row: number }> = [
  { col: 12, row: 6 },
  { col: 14, row: 7 },
  { col: 17, row: 7 },
  { col: 19, row: 6 },
  { col: 20, row: 5 },
];
export const START_TILE = { col: 15, row: 5 }; // where a creature first stands in the home (nearest free anchor to it)
export const AWAY_BUBBLE = { x: 16 * TILE, y: 3 * TILE };

// The spots a solid piece may not cover, so the egg, the poop and the grave are always on bare floor (a rug or the mat may lie on them): the egg's tile, the five poop tiles and
// the block the largest creature lying at the grave takes with its tombstone (art at x 156 to 216, y 96 to 144, which whole tiles round out to columns 6 to 8, rows 4 and 5).
export const MEMORIAL = { col: 6, row: 4, cols: 3, rows: 2 };
export const isProtected = (col: number, row: number): boolean =>
  (col === EGG_TILE.col && row === EGG_TILE.row) ||
  POOP_TILES.some((t) => t.col === col && t.row === row) ||
  (col >= MEMORIAL.col && col < MEMORIAL.col + MEMORIAL.cols && row >= MEMORIAL.row && row < MEMORIAL.row + MEMORIAL.rows);

// The home with only the room entries a player can still show: a wallpaper that is not owned (it was undone, or the save is damaged) is dropped; null (the plain wall) is kept.
export function ownedWalls(home: HomeSave, owned: readonly string[]): HomeSave {
  const walls = Object.fromEntries(Object.entries(home.walls ?? {}).filter(([, id]) => id === null || owned.includes(id))) as NonNullable<HomeSave["walls"]>;
  return Object.keys(walls).length > 0 ? { pieces: home.pieces, walls } : { pieces: home.pieces };
}

// The saved form of a layout: every piece's place, or null for a put-away one (a saved `home` is read back by `layoutOf`, art/homeLayout.ts). The rooms' walls are carried over.
export const homeOf = (layout: Layout, walls?: HomeSave["walls"]): HomeSave => ({
  pieces: Object.fromEntries(KINDS.map((kind) => [kind, layout[kind] ? { col: layout[kind].col, row: layout[kind].row } : null])),
  ...(walls && Object.keys(walls).length > 0 ? { walls: { ...walls } } : {}),
});

const isPlacement = (value: unknown): value is Placement =>
  typeof value === "object" && value !== null && Number.isInteger((value as Placement).col) && Number.isInteger((value as Placement).row);

// The shape check of a `home` read from storage or the cloud (it must never throw): an object with a `pieces` object whose known kinds are each a placement of whole numbers or null.
// Anything else, or one bad entry, gives undefined (the starter layout); the rules about WHERE a piece may be are `layoutOf`'s (art/homeLayout.ts).
export function coerceHome(value: unknown): HomeSave | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  const raw = (value as { pieces?: unknown }).pieces;
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return undefined;
  const pieces: HomeSave["pieces"] = {};
  for (const kind of KINDS) {
    if (!Object.hasOwn(raw, kind)) continue;
    const at = (raw as Record<string, unknown>)[kind];
    if (at === null) pieces[kind] = null;
    else if (isPlacement(at)) pieces[kind] = { col: at.col, row: at.row };
    else return undefined;
  }
  const walls = coerceWalls((value as { walls?: unknown }).walls);
  return walls ? { pieces, walls } : { pieces };
}

// The rooms' wallpapers of a saved `home`: an object whose keys are room ids and whose values are null or a wallpaper id. Anything else is no walls at all (the pieces are kept).
function coerceWalls(value: unknown): HomeSave["walls"] | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  const walls: NonNullable<HomeSave["walls"]> = {};
  for (const [key, id] of Object.entries(value)) {
    const room = ROOMS.find((r) => r.id === key);
    if (!room || !(id === null || isWallId(id))) return undefined;
    walls[room.id] = id;
  }
  return Object.keys(walls).length > 0 ? walls : undefined;
}
