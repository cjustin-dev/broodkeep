// Draws the plain fixed room: wall, floor, a window that follows the time of day,
// a bed, a food bowl and a rug. PLACEHOLDER ART made from simple rectangles.
// Phase 4 replaces this with a room you can decorate.

import { ROOM } from "./layout";

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

export function drawRoom(ctx: CanvasRenderingContext2D, hour: number): void {
  // Wall with soft stripes.
  rect(ctx, "#efe3f7", 0, 0, ROOM.w, ROOM.floorTop);
  for (let x = 0; x < ROOM.w; x += 8) rect(ctx, "#e4d3f0", x, 0, 4, ROOM.floorTop);
  rect(ctx, "#8a6bd1", 0, ROOM.floorTop - 3, ROOM.w, 3); // baseboard

  // Wooden floor.
  rect(ctx, "#d9a066", 0, ROOM.floorTop, ROOM.w, ROOM.h - ROOM.floorTop);
  for (let row = 0, y = ROOM.floorTop; y < ROOM.h; row++, y += 7) {
    rect(ctx, "#c78d52", 0, y, ROOM.w, 1);
    for (let x = (row % 2) * 12; x < ROOM.w; x += 24) rect(ctx, "#c78d52", x, y + 1, 1, 6);
  }

  // Window.
  const s = sky(hour);
  rect(ctx, "#ffffff", 9, 9, 28, 28);
  rect(ctx, s.color, 11, 11, 24, 24);
  if (s.stars) {
    rect(ctx, "#ffffff", 15, 15, 1, 1);
    rect(ctx, "#ffffff", 28, 19, 1, 1);
    rect(ctx, "#ffffff", 20, 29, 1, 1);
  }
  if (s.body === "sun") rect(ctx, "#ffe066", 26, 15, 5, 5);
  else rect(ctx, "#f5f0c8", 26, 15, 5, 5);
  rect(ctx, "#ffffff", 22, 11, 2, 24); // window bars
  rect(ctx, "#ffffff", 11, 22, 24, 2);

  // Rug.
  rect(ctx, "#e58aa5", 26, 76, 44, 18);
  rect(ctx, "#c85a7c", 28, 78, 40, 14);

  // Food bowl.
  rect(ctx, "#6a7fd1", 8, 80, 14, 6);
  rect(ctx, "#8aa0f0", 9, 80, 12, 2);
  rect(ctx, "#6a7fd1", 11, 86, 8, 1);

  // Bed.
  rect(ctx, "#8a5a3a", ROOM.bedLeft, ROOM.bedY + 10, 32, 14); // frame
  rect(ctx, "#6d86e0", 63, ROOM.bedY + 8, 30, 10); // mattress
  rect(ctx, "#ffffff", 64, ROOM.bedY + 6, 8, 6); // pillow
  rect(ctx, "#8a5a3a", 62, ROOM.bedY + 22, 3, 3);
  rect(ctx, "#8a5a3a", 91, ROOM.bedY + 22, 3, 3);
}
