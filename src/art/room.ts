// Draws the plain fixed room: wall, floor, a window that follows the time of day,
// a bed, a food bowl and a rug. PLACEHOLDER ART made from simple rectangles.
// Phase 4 replaces this with a room you can decorate.

import { plainWall, walls } from "../data/shop";
import type { Save } from "../game/state";
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

// What the shop changed in the room (data/shop.ts): the wallpaper on the wall (null: the plain wall), and whether the Comfy Bed and the Feeding Mat are in.
export interface Look {
  wall: string | null;
  bed: boolean;
  mat: boolean;
}

export const plainLook: Look = { wall: null, bed: false, mat: false };

export const lookOf = (save: Save): Look => ({ wall: save.wall, bed: save.owned.includes("comfy-bed"), mat: save.owned.includes("feeding-mat") });

export function drawRoom(ctx: CanvasRenderingContext2D, hour: number, look: Look = plainLook): void {
  // Wall with soft stripes (a wallpaper changes the three colours).
  const wall = look.wall !== null && Object.hasOwn(walls, look.wall) ? walls[look.wall as keyof typeof walls] : plainWall;
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
