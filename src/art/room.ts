// Draws the plain fixed room: wall, floor, a window that follows the time of day,
// a bed, a food bowl and a rug. PLACEHOLDER ART made from simple rectangles.
// Phase 4 replaces this with a room you can decorate.

import { COLS, DOOR_ROWS, PARTITIONS, ROOMS, ROWS, SHAPES, STARTER, TILE, WALL_ROWS, bedOf, piecesOf, wallOfRoom, wallRoomOf } from "../data/home";
import type { Layout, Piece, PieceKind, Placement, RoomId } from "../data/home";
import { plainWall, walls } from "../data/shop";
import type { Wall } from "../data/shop";
import type { Save } from "../game/state";
import { layoutOf } from "./homeLayout";
import { BED_WIDTH, ROOM } from "./layout";

function rect(ctx: CanvasRenderingContext2D, color: string, x: number, y: number, w: number, h: number): void {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
}

// Sky color and what hangs in it, for an hour of the day (0 to 23).
export function sky(hour: number): { color: string; body: "sun" | "moon"; stars: boolean } {
  if (hour >= 7 && hour < 17) return { color: "#8fd3ff", body: "sun", stars: false };
  if (hour >= 17 && hour < 20) return { color: "#ffb27a", body: "sun", stars: false };
  if (hour >= 5 && hour < 7) return { color: "#c9a6e8", body: "sun", stars: false };
  return { color: "#1d2b53", body: "moon", stars: true };
}

// What the shop changed in the room (data/shop.ts): the wallpaper on each room's wall (null: the plain wall; the old one-line room shows the living room's), and whether the Comfy
// Bed and the Feeding Mat are in; and, in the home, where the furniture stands (the old one-line room ignores that).
export interface Look {
  walls: Record<RoomId, string | null>;
  bed: boolean;
  mat: boolean;
  layout: Layout;
}

export const plainLook: Look = { walls: { bedroom: null, living: null, kitchen: null }, bed: false, mat: false, layout: STARTER };

const wallColours = (id: string | null): Wall => (id !== null && Object.hasOwn(walls, id) ? walls[id as keyof typeof walls] : plainWall);

export const lookOf = (save: Save): Look => ({
  walls: { bedroom: wallOfRoom(save.wall, save.home, "bedroom"), living: wallOfRoom(save.wall, save.home, "living"), kitchen: wallOfRoom(save.wall, save.home, "kitchen") },
  bed: save.owned.includes("comfy-bed"),
  mat: save.owned.includes("feeding-mat"),
  layout: layoutOf(save.home),
});

export function drawRoom(ctx: CanvasRenderingContext2D, hour: number, look: Look = plainLook): void {
  // Wall with soft stripes (a wallpaper changes the three colours).
  const wall = wallColours(look.walls.living);
  rect(ctx, wall.base, 0, 0, ROOM.w, ROOM.floorTop);
  for (let x = 0; x < ROOM.w; x += 10) rect(ctx, wall.stripe, x, 0, 5, ROOM.floorTop);
  rect(ctx, wall.board, 0, ROOM.floorTop - 4, ROOM.w, 4); // baseboard

  // Wooden floor.
  rect(ctx, "#d9a066", 0, ROOM.floorTop, ROOM.w, ROOM.h - ROOM.floorTop);
  for (let row = 0, y = ROOM.floorTop; y < ROOM.h; row++, y += 9) {
    rect(ctx, "#c78d52", 0, y, ROOM.w, 1);
    for (let x = (row % 2) * 16; x < ROOM.w; x += 32) rect(ctx, "#c78d52", x, y + 1, 1, 8);
  }

  // Window.
  const s = sky(hour);
  rect(ctx, "#ffffff", 12, 12, 38, 38);
  rect(ctx, s.color, 14, 14, 34, 34);
  if (s.stars) {
    rect(ctx, "#ffffff", 20, 20, 1, 1);
    rect(ctx, "#ffffff", 38, 25, 1, 1);
    rect(ctx, "#ffffff", 27, 39, 1, 1);
  }
  rect(ctx, s.body === "sun" ? "#ffe066" : "#f5f0c8", 35, 20, 7, 7);
  rect(ctx, "#ffffff", 29, 14, 3, 34); // window bars
  rect(ctx, "#ffffff", 14, 29, 34, 3);

  // Rug.
  rect(ctx, "#e58aa5", 30, 104, 58, 20);
  rect(ctx, "#c85a7c", 33, 107, 52, 14);

  // Feeding Mat, under the bowl (drawn first, so the bowl sits on it).
  if (look.mat) {
    rect(ctx, "#b98a2c", 5, 116, 28, 6);
    rect(ctx, "#f2d27a", 6, 117, 26, 4);
  }

  // Food bowl.
  rect(ctx, "#6a7fd1", 9, 108, 19, 8);
  rect(ctx, "#8aa0f0", 11, 108, 15, 3);
  rect(ctx, "#6a7fd1", 14, 116, 10, 2);

  // Bed (BED_WIDTH wide: the widest lying creature fits on it).
  const bed = ROOM.bedLeft;
  rect(ctx, "#8a5a3a", bed, ROOM.bedY + 10, BED_WIDTH, 14); // frame
  rect(ctx, "#6d86e0", bed + 1, ROOM.bedY + 8, BED_WIDTH - 2, 10); // mattress
  rect(ctx, "#ffffff", bed + 2, ROOM.bedY + 6, 10, 6); // pillow
  if (look.bed) {
    // Comfy Bed: a second pillow and a quilt, all inside the bed's own width.
    rect(ctx, "#ffe9f0", bed + 13, ROOM.bedY + 7, 8, 5);
    rect(ctx, "#e0708f", bed + 22, ROOM.bedY + 6, BED_WIDTH - 24, 11);
    rect(ctx, "#f7b3c6", bed + 22, ROOM.bedY + 9, BED_WIDTH - 24, 2);
  }
  rect(ctx, "#8a5a3a", bed, ROOM.bedY + 22, 3, 3);
  rect(ctx, "#8a5a3a", bed + BED_WIDTH - 3, ROOM.bedY + 22, 3, 3);
}

// ---------- the home (docs/home-plan.md, slice H1) ----------
// Three rooms on a 24 pixel tile grid (data/home.ts). Still PLACEHOLDER ART made from simple rectangles, in the old room's colours: Decorate mode (slice H2) will
// bring the real furniture. The back layer (walls, floors, windows, the doorways, rugs) is drawn first; the solid pieces are drawn by drawHomePieces so the scene can put
// a creature in front of or behind each one by where its feet are.

function drawWindow(ctx: CanvasRenderingContext2D, x: number, y: number, hour: number): void {
  const s = sky(hour);
  rect(ctx, "#ffffff", x, y, 38, 38);
  rect(ctx, s.color, x + 2, y + 2, 34, 34);
  if (s.stars) {
    rect(ctx, "#ffffff", x + 8, y + 8, 1, 1);
    rect(ctx, "#ffffff", x + 26, y + 13, 1, 1);
    rect(ctx, "#ffffff", x + 15, y + 27, 1, 1);
  }
  rect(ctx, s.body === "sun" ? "#ffe066" : "#f5f0c8", x + 23, y + 8, 7, 7);
  rect(ctx, "#ffffff", x + 17, y + 2, 3, 34);
  rect(ctx, "#ffffff", x + 2, y + 17, 34, 3);
}

const woodFloor = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void => {
  rect(ctx, "#d9a066", x, y, w, h);
  for (let row = 0, yy = y; yy < y + h; row++, yy += 9) {
    rect(ctx, "#c78d52", x, yy, w, 1);
    for (let xx = x + (row % 2) * 16; xx < x + w; xx += 32) rect(ctx, "#c78d52", xx, yy + 1, 1, Math.min(8, y + h - yy - 1));
  }
};

const tileFloor = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void => {
  rect(ctx, "#e8e0d0", x, y, w, h);
  for (let xx = x; xx < x + w; xx += 12) rect(ctx, "#cfc5ae", xx, y, 1, h);
  for (let yy = y; yy < y + h; yy += 12) rect(ctx, "#cfc5ae", x, yy, w, 1);
};

// The columns of each room's wall, in pixels: a partition belongs to the room on its left (data/home.ts wallRoomOf), so the bedroom's wall runs to the end of column 10.
const WALL_SPANS = ROOMS.map((r) => {
  const cols = Array.from({ length: COLS }, (_, col) => col).filter((col) => wallRoomOf(col, 0) === r.id);
  return { id: r.id, x0: (cols[0] as number) * TILE, x1: ((cols[cols.length - 1] as number) + 1) * TILE };
});

export function drawHomeBack(ctx: CanvasRenderingContext2D, hour: number, look: Look = plainLook): void {
  const w = COLS * TILE;
  const floorTop = WALL_ROWS * TILE;
  // The wall of each room, with its baseboard: the whole wall is painted in the room's own wallpaper inside a clip of the room's columns, so rooms with the same wallpaper
  // draw exactly what one wall across the home drew.
  for (const span of WALL_SPANS) {
    const wall = wallColours(look.walls[span.id]);
    ctx.save();
    ctx.beginPath();
    ctx.rect(span.x0, 0, span.x1 - span.x0, floorTop);
    ctx.clip();
    rect(ctx, wall.base, 0, 0, w, floorTop);
    for (let x = 0; x < w; x += 10) rect(ctx, wall.stripe, x, 0, 5, floorTop);
    rect(ctx, wall.board, 0, floorTop - 4, w, 4);
    ctx.restore();
  }
  // The floors: wood in the bedroom and the living room, tiles in the kitchen.
  for (const r of ROOMS) {
    const x = r.from * TILE;
    const width = (r.to - r.from + 1) * TILE;
    if (r.id === "kitchen") tileFloor(ctx, x, floorTop, width, ROWS * TILE - floorTop);
    else woodFloor(ctx, x, floorTop, width, ROWS * TILE - floorTop);
  }
  drawWindow(ctx, 105, 5, hour); // (a window of the bedroom, between the bed and the dresser)
  drawWindow(ctx, 418, 5, hour); // (and one of the living room, past the sofa)
  // The two partitions: a wall from the top to the bottom with a doorway two tiles high, the floor going through it.
  for (const col of PARTITIONS) {
    const wall = wallColours(look.walls[wallRoomOf(col, 0) as RoomId]);
    const x = col * TILE;
    for (let row = 0; row < ROWS; row++) {
      const y = row * TILE;
      if (DOOR_ROWS.includes(row)) {
        woodFloor(ctx, x, y, TILE, TILE);
        rect(ctx, "#6d4a2a", x, y + (row === DOOR_ROWS[0] ? 0 : TILE - 1), TILE, 1); // the door frame's edges
        continue;
      }
      rect(ctx, wall.board, x, y, TILE, TILE);
      rect(ctx, wall.base, x + 2, y, TILE - 4, row < WALL_ROWS ? TILE : TILE - 2);
    }
    rect(ctx, "#6d4a2a", x + 2, DOOR_ROWS[0] * TILE - 3, TILE - 4, 3); // the lintel above the doorway
  }
  // The flat pieces: the rugs, and the Feeding Mat.
  for (const p of piecesOf(look.layout)) if (!p.solid) drawFlat(ctx, look, p);
}

function drawFlat(ctx: CanvasRenderingContext2D, look: Look, p: Piece): void {
  const x = p.col * TILE;
  const y = p.row * TILE;
  if (p.kind === "rug") {
    rect(ctx, "#e58aa5", x, y, p.cols * TILE, p.rows * TILE);
    rect(ctx, "#c85a7c", x + 3, y + 3, p.cols * TILE - 6, p.rows * TILE - 6);
  } else if (p.kind === "mat" && look.mat) {
    rect(ctx, "#b98a2c", x + 2, y + 12, p.cols * TILE - 4, 10);
    rect(ctx, "#f2d27a", x + 3, y + 13, p.cols * TILE - 6, 8);
  }
}

// The solid pieces that `show` picks (the scene draws the ones behind a creature, then the creature, then the ones in front).
export function drawHomePieces(ctx: CanvasRenderingContext2D, look: Look, show: (p: Piece) => boolean): void {
  for (const p of piecesOf(look.layout)) if (p.solid && show(p)) drawSolid(ctx, look, p);
}

// One piece on its own, wherever it is: Decorate mode draws the piece a finger is carrying over everything, and each button of the tray shows its piece (at (0, 0), on a
// canvas of its own size).
export function drawPiece(ctx: CanvasRenderingContext2D, look: Look, kind: PieceKind, at: Placement): void {
  const { cols, rows, solid } = SHAPES[kind];
  const p: Piece = { kind, col: at.col, row: at.row, cols, rows, solid };
  if (solid) drawSolid(ctx, look, p);
  else drawFlat(ctx, look, p);
}

// The outline round a piece's tiles: a dark edge and two pixels of `color` inside it.
export function drawOutline(ctx: CanvasRenderingContext2D, kind: PieceKind, at: Placement, color: string): void {
  const { cols, rows } = SHAPES[kind];
  outlineRect(ctx, at.col * TILE, at.row * TILE, cols * TILE, rows * TILE, color);
}

// The same outline round a room's wall (its two rows of tiles, and the partition on its right if it has one).
export function drawWallOutline(ctx: CanvasRenderingContext2D, room: RoomId, color: string): void {
  const span = WALL_SPANS.find((s) => s.id === room) as { x0: number; x1: number };
  outlineRect(ctx, span.x0, 0, span.x1 - span.x0, WALL_ROWS * TILE, color);
}

function outlineRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string): void {
  for (const [ring, inset] of [["#1a1020", 0], [color, 1], [color, 2]] as const) {
    rect(ctx, ring, x + inset, y + inset, w - 2 * inset, 1);
    rect(ctx, ring, x + inset, y + h - 1 - inset, w - 2 * inset, 1);
    rect(ctx, ring, x + inset, y + inset + 1, 1, h - 2 * inset - 2);
    rect(ctx, ring, x + w - 1 - inset, y + inset + 1, 1, h - 2 * inset - 2);
  }
}

function drawSolid(ctx: CanvasRenderingContext2D, look: Look, p: Piece): void {
  const x = p.col * TILE;
  const y = p.row * TILE;
  const w = p.cols * TILE;
  const h = p.rows * TILE;
  switch (p.kind) {
    case "bed":
      drawBed(ctx, look, p);
      break;
    case "dresser":
      rect(ctx, "#4a2f1c", x + 2, y + 4, w - 4, h - 6);
      rect(ctx, "#8a5a3a", x + 3, y + 5, w - 6, h - 9);
      rect(ctx, "#a8734a", x + 3, y + 5, w - 6, 4);
      for (const dy of [14, 28]) {
        rect(ctx, "#6d4326", x + 6, y + dy, w - 12, 1);
        rect(ctx, "#f2d27a", x + w / 2 - 2, y + dy + 4, 4, 2);
      }
      break;
    case "sofa":
      rect(ctx, "#2f3f78", x + 2, y + 6, w - 4, h - 8);
      rect(ctx, "#4a6ab0", x + 3, y + 7, w - 6, 18); // the back
      rect(ctx, "#6a8ae0", x + 8, y + 26, w - 16, 18); // the seat
      rect(ctx, "#4a6ab0", x + 3, y + 22, 8, 22); // the arms
      rect(ctx, "#4a6ab0", x + w - 11, y + 22, 8, 22);
      break;
    case "table":
      rect(ctx, "#4a2f1c", x + 3, y + 8, w - 6, 26);
      rect(ctx, "#c4894f", x + 4, y + 9, w - 8, 18); // the top
      rect(ctx, "#8a5a3a", x + 5, y + 34, 4, h - 34); // two legs
      rect(ctx, "#8a5a3a", x + w - 9, y + 34, 4, h - 34);
      break;
    case "counter":
      rect(ctx, "#4a4a5a", x + 1, y + 6, w - 2, h - 8);
      rect(ctx, "#d8d8e0", x + 2, y + 7, w - 4, 8); // the worktop
      rect(ctx, "#8a8a9a", x + 2, y + 16, w - 4, h - 19);
      for (let dx = 24; dx < w - 4; dx += 24) rect(ctx, "#6a6a7a", x + dx, y + 18, 1, h - 22);
      break;
    case "fridge":
      rect(ctx, "#5a5e70", x + 2, y + 2, w - 4, h - 3);
      rect(ctx, "#c8ccd8", x + 3, y + 3, w - 6, h - 6);
      rect(ctx, "#8a8ea0", x + 3, y + 18, w - 6, 1); // the door between the freezer and the fridge
      rect(ctx, "#5a5e70", x + w - 9, y + 8, 2, 8);
      rect(ctx, "#5a5e70", x + w - 9, y + 24, 2, 12);
      break;
    case "bowl":
      rect(ctx, "#6a7fd1", x + 2, y + 8, 19, 8);
      rect(ctx, "#8aa0f0", x + 4, y + 8, 15, 3);
      rect(ctx, "#6a7fd1", x + 7, y + 16, 10, 2);
      break;
    default:
      break;
  }
}

// The bed (BED_WIDTH wide: the widest lying creature fits on it), with the same shapes as the old room's, from the bed's left edge and `bedY` in data/home.ts.
function drawBed(ctx: CanvasRenderingContext2D, look: Look, at: Placement): void {
  const { left: bed, y } = bedOf(at);
  rect(ctx, "#8a5a3a", bed, y + 10, BED_WIDTH, 14); // frame
  rect(ctx, "#6d86e0", bed + 1, y + 8, BED_WIDTH - 2, 10); // mattress
  rect(ctx, "#ffffff", bed + 2, y + 6, 10, 6); // pillow
  if (look.bed) {
    rect(ctx, "#ffe9f0", bed + 13, y + 7, 8, 5);
    rect(ctx, "#e0708f", bed + 22, y + 6, BED_WIDTH - 24, 11);
    rect(ctx, "#f7b3c6", bed + 22, y + 9, BED_WIDTH - 24, 2);
  }
  rect(ctx, "#8a5a3a", bed, y + 22, 3, 3);
  rect(ctx, "#8a5a3a", bed + BED_WIDTH - 3, y + 22, 3, 3);
}

// The part of the home the Shop's picture shows for an item: a 128 x 128 window (the picture's canvas, unscaled) on the room it belongs to, on the starter layout.
const previewCrop: Record<RoomId, { x: number; y: number }> = {
  bedroom: { x: 24, y: 8 }, // the bed and the bedroom's window
  living: { x: 336, y: 0 }, // the sofa, the window and the wall, which the wallpapers colour
  kitchen: { x: 560, y: 64 }, // the bowl and the Feeding Mat
};

export function drawHomePreview(ctx: CanvasRenderingContext2D, hour: number, look: Look, room: RoomId): void {
  const crop = previewCrop[room];
  const shown: Look = { ...look, layout: STARTER }; // the crops are fixed on the starter layout, wherever the player has put things
  ctx.save();
  ctx.translate(-crop.x, -crop.y);
  drawHomeBack(ctx, hour, shown);
  drawHomePieces(ctx, shown, () => true);
  ctx.restore();
}
