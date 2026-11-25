// The home (docs/home-plan.md, slice H1): three rooms in a row on a grid of 24 pixel tiles, a bedroom, a living room and a kitchen, and what stands in them
// from the start. Rooms are 10 tiles wide, with a one-tile partition (a wall with a doorway two tiles high) between them: 32 x 8 tiles, 768 x 192 game pixels.
// The top two rows of every room are its wall, the other six its floor. Furniture that is `solid` takes the floor tiles it covers; a rug or a mat does not.
// Nothing here is saved: the starter layout is data, and Decorate mode (slice H2) will save a layout of its own.

export const TILE = 24;
export const COLS = 32;
export const ROWS = 8;
export const WALL_ROWS = 2;

export type RoomId = "bedroom" | "living" | "kitchen";

export interface RoomSpan {
  id: RoomId;
  from: number; // first column
  to: number; // last column
}

export const ROOMS: RoomSpan[] = [
  { id: "bedroom", from: 0, to: 9 },
  { id: "living", from: 11, to: 20 },
  { id: "kitchen", from: 22, to: 31 },
];

export const PARTITIONS = [10, 21]; // the columns of the two partitions
export const DOOR_ROWS = [4, 5]; // the rows of the doorway in each partition

export type PieceKind = "bed" | "dresser" | "sofa" | "rug" | "table" | "counter" | "fridge" | "bowl" | "mat";

export interface Piece {
  kind: PieceKind;
  col: number;
  row: number; // the top row; a piece that starts in the wall rows (row 1) reaches down onto the floor
  cols: number;
  rows: number;
  solid: boolean;
}

export const PIECES: Piece[] = [
  { kind: "bed", col: 1, row: 1, cols: 3, rows: 2, solid: true },
  { kind: "dresser", col: 6, row: 1, cols: 2, rows: 2, solid: true },
  { kind: "sofa", col: 13, row: 1, cols: 4, rows: 2, solid: true },
  { kind: "rug", col: 13, row: 4, cols: 4, rows: 3, solid: false },
  { kind: "table", col: 17, row: 4, cols: 2, rows: 2, solid: true }, // (columns 19 and 20 beside it stay open: a 2-wide creature needs both to reach the doorway)
  { kind: "counter", col: 23, row: 1, cols: 6, rows: 2, solid: true },
  { kind: "fridge", col: 30, row: 1, cols: 2, rows: 2, solid: true },
  { kind: "mat", col: 23, row: 5, cols: 3, rows: 1, solid: false }, // the Feeding Mat (drawn only when owned)
  { kind: "bowl", col: 24, row: 5, cols: 1, rows: 1, solid: true },
];

// The bed's art (room.ts draws it from these): the left edge, and `bedY`, the top of a 16 pixel creature lying on it. A lying creature is centred on it.
export const BED = { left: 32, y: 47, front: { col: 2, row: 3 } }; // `front`: the tile in front of it that a creature walks to before it lies down

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
