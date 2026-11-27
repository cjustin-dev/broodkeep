// Draws the habitat: the outdoor map with the five gathering spots, and the creature at home or out
// working. PLACEHOLDER ART made from simple rectangles, like the room. Reads the save, never changes it.

import { getForm } from "../data/forms";
import { spotIds, spots } from "../data/habitat";
import type { SpotId } from "../data/habitat";
import type { Creature, Save } from "../game/state";
import { hourOf, realClock } from "../game/time";
import { stageOrder } from "../game/types";
import { faceSprite, isWide, pickFace } from "./face";
import { hatOf } from "./hat";
import type { HatId } from "../data/shop";
import { frameOf, poseOffsets } from "./idle";
import type { View } from "./idle";
import { ROOM } from "./layout";
import { drawSprite, spriteCanvas } from "./pixel";
import { sky } from "./room";
import { drawBubble } from "./scene";
import { icons, placeIcon } from "./sprites";

// Where each spot sits on the 128 x 128 picture (top left corner, width, height).
export const SPOT_BOXES: Record<SpotId, { x: number; y: number; w: number; h: number }> = {
  trees: { x: 6, y: 40, w: 26, h: 26 },
  pond: { x: 51, y: 52, w: 26, h: 16 },
  rocks: { x: 96, y: 40, w: 26, h: 26 },
  meadow: { x: 6, y: 80, w: 26, h: 18 },
  herbs: { x: 96, y: 80, w: 26, h: 18 },
};
// The creature stands in the middle at the bottom when it is at home. Its feet are on this line.
export const HOME = { centerX: ROOM.w / 2, feetY: 122 };

// Where a creature of a given size works at a spot: in front of it, with its feet a little below the spot's picture. A big
// creature at a spot near the edge is moved in, so it never hangs off the picture.
export function workingPlace(id: SpotId, size: number): { centerX: number; feetY: number } {
  const b = SPOT_BOXES[id];
  const half = size / 2;
  return { centerX: Math.min(ROOM.w - half, Math.max(half, b.x + b.w / 2)), feetY: Math.min(124, b.y + b.h + 4) };
}

function rect(ctx: CanvasRenderingContext2D, color: string, x: number, y: number, w: number, h: number): void {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
}

function drawGround(ctx: CanvasRenderingContext2D, hour: number): void {
  const s = sky(hour);
  rect(ctx, s.color, 0, 0, ROOM.w, 36);
  if (s.stars) {
    for (const [x, y] of [[16, 7], [40, 17], [69, 6], [93, 24], [114, 10]] as const) rect(ctx, "#ffffff", x, y, 1, 1);
  }
  rect(ctx, s.body === "sun" ? "#ffe066" : "#f5f0c8", 100, 8, 7, 7);
  rect(ctx, "#5fa35a", 0, 30, ROOM.w, 9); // far hills
  rect(ctx, "#7fc46a", 0, 36, ROOM.w, ROOM.h - 36); // grass
  for (let y = 38, row = 0; y < ROOM.h; y += 8, row++) {
    for (let x = (row % 2) * 6; x < ROOM.w; x += 12) rect(ctx, "#74b860", x, y, 3, 1);
  }
  rect(ctx, "#d9b98a", 60, 68, 8, 26); // the path from home up to the pond
  rect(ctx, "#d9b98a", 54, 94, 20, 34);
}

function drawTrees(ctx: CanvasRenderingContext2D, b: { x: number; y: number }): void {
  for (const dx of [1, 14]) {
    rect(ctx, "#8a5a3a", b.x + dx + 5, b.y + 14, 4, 10);
    rect(ctx, "#4f9a3a", b.x + dx + 1, b.y + 2, 12, 12);
    rect(ctx, "#3f8a2e", b.x + dx + 3, b.y, 8, 4);
    rect(ctx, "#5cb85c", b.x + dx + 3, b.y + 5, 3, 3);
  }
}

function drawPond(ctx: CanvasRenderingContext2D, b: { x: number; y: number; w: number; h: number }): void {
  rect(ctx, "#4aa3df", b.x + 2, b.y + 2, b.w - 4, b.h - 4);
  rect(ctx, "#4aa3df", b.x, b.y + 4, b.w, b.h - 8);
  rect(ctx, "#a8e0ff", b.x + 5, b.y + 5, 6, 1);
  rect(ctx, "#a8e0ff", b.x + 14, b.y + 9, 5, 1);
}

function drawRocks(ctx: CanvasRenderingContext2D, b: { x: number; y: number }): void {
  rect(ctx, "#6b7078", b.x + 3, b.y + 14, 20, 10);
  rect(ctx, "#9aa0a6", b.x + 4, b.y + 10, 12, 12);
  rect(ctx, "#9aa0a6", b.x + 13, b.y + 14, 9, 9);
  rect(ctx, "#c8ccd0", b.x + 6, b.y + 11, 4, 2);
  rect(ctx, "#8a8f96", b.x + 6, b.y + 3, 8, 8);
  rect(ctx, "#c8ccd0", b.x + 8, b.y + 4, 3, 2);
}

function drawMeadow(ctx: CanvasRenderingContext2D, b: { x: number; y: number; w: number; h: number }): void {
  rect(ctx, "#8fd47a", b.x, b.y + 2, b.w, b.h - 2);
  for (const [dx, dy, color] of [[3, 4, "#ff8fb3"], [9, 9, "#ffd25a"], [15, 3, "#ffffff"], [20, 10, "#ff8fb3"], [6, 13, "#ffffff"], [22, 5, "#ffd25a"]] as const) {
    rect(ctx, color, b.x + dx, b.y + dy, 2, 2);
    rect(ctx, "#4f9a3a", b.x + dx, b.y + dy + 2, 1, 2);
  }
}

function drawHerbs(ctx: CanvasRenderingContext2D, b: { x: number; y: number; w: number; h: number }): void {
  rect(ctx, "#8a5a3a", b.x, b.y + 2, b.w, b.h - 2);
  for (const dy of [4, 11]) {
    rect(ctx, "#6a4428", b.x + 1, b.y + dy + 3, b.w - 2, 1);
    for (let dx = 2; dx < b.w - 3; dx += 5) {
      rect(ctx, "#5cb85c", b.x + dx, b.y + dy, 3, 3);
      rect(ctx, "#3f8a2e", b.x + dx + 1, b.y + dy + 2, 1, 2);
    }
  }
}

const drawers: Record<SpotId, (ctx: CanvasRenderingContext2D, b: { x: number; y: number; w: number; h: number }) => void> = {
  trees: drawTrees,
  pond: drawPond,
  rocks: drawRocks,
  meadow: drawMeadow,
  herbs: drawHerbs,
};

// Is the creature too young for this spot? (the picture dims it and shows a lock)
export function isLocked(c: Creature, id: SpotId): boolean {
  return stageOrder.indexOf(getForm(c.formId).stage) < stageOrder.indexOf(spots[id].minStage);
}

function drawCreature(ctx: CanvasRenderingContext2D, c: Creature, view: View, centerX: number, feetY: number, working: boolean, hat: HatId | null): void {
  const form = getForm(c.formId);
  const size = form.idle.length;
  const kind = pickFace(view, false, false);
  const frame = isWide(kind) ? 0 : frameOf(view);
  const picture = faceSprite(form, kind, frame, hat);
  const tint = c.sick ? { color: "#7bdc6a", amount: 0.4 } : undefined;
  const sprite = spriteCanvas(picture, `form:${form.id}:${kind}:${frame}${hat ? `:${hat}` : ""}`, tint);
  const off = poseOffsets(view);
  // A working creature hops in place, a little at a time.
  const bob = working && Math.floor(view.clock * 6) % 2 === 1 ? -1 : 0;
  const x = Math.round(centerX - sprite.width / 2);
  const y = feetY - size + off.dy + bob;
  drawSprite(ctx, sprite, x, y, { flipX: view.facing === -1, height: sprite.height - off.squash });
}

export function drawHabitat(ctx: CanvasRenderingContext2D, save: Save, view: View, gameNowMs: number): void {
  ctx.imageSmoothingEnabled = false;
  const hour = hourOf(realClock(save, gameNowMs)); // the light follows the real clock, not the sped-up game clock
  drawGround(ctx, hour);
  const c = save.creature;
  if (save.phase !== "alive" || !c) return;

  for (const id of spotIds) {
    const b = SPOT_BOXES[id];
    drawers[id](ctx, b);
    if (isLocked(c, id)) {
      rect(ctx, "rgba(20, 16, 40, 0.5)", b.x, b.y, b.w, b.h);
      ctx.drawImage(spriteCanvas(icons.lock, "icon:lock"), b.x + Math.round((b.w - 8) / 2), b.y + Math.round((b.h - 8) / 2));
    }
  }

  const job = c.job;
  if (job) {
    const b = SPOT_BOXES[job.spot];
    const progress = Math.min(1, Math.max(0, (gameNowMs - job.startedAt) / (job.endsAt - job.startedAt)));
    const place = workingPlace(job.spot, getForm(c.formId).idle.length);
    drawCreature(ctx, c, view, place.centerX, place.feetY, true, hatOf(save));
    // The progress bar goes on top, because a big creature covers the whole spot.
    rect(ctx, "#1a1020", b.x, b.y - 4, b.w, 4);
    rect(ctx, "#ffd25a", b.x + 1, b.y - 3, Math.round((b.w - 2) * progress), 2);
  } else if (c.sleep) {
    // In bed at home: the habitat is empty, with a bubble that says where it went.
    drawBubble(ctx, "house", HOME.centerX - 6, 80);
  } else if (c.place !== "home") {
    // Out in a field: the habitat is empty too, with a bubble that says where it is.
    drawBubble(ctx, placeIcon[c.place], HOME.centerX - 6, 80);
  } else {
    drawCreature(ctx, c, view, HOME.centerX, HOME.feetY, false, hatOf(save));
  }

  if (sky(hour).stars) rect(ctx, "rgba(15, 10, 50, 0.35)", 0, 0, ROOM.w, ROOM.h); // night
}
