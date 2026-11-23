// Draws one frame of the game picture: room, poop, egg or creature, thought bubble, effects.
// Reads the save but never changes it.

import { getForm } from "../data/forms";
import type { CallKind, Save } from "../game/state";
import { MINUTE, hourOf } from "../game/time";
import { tuning } from "../data/tuning";
import { MEAL, eyesClosed, foodLeft, frameOf, poseOffsets, snackCut } from "./idle";
import type { Mood, Snack, View } from "./idle";
import type { Sprite } from "./pixel";
import { POOP_SPOTS, ROOM, STONE_WIDTH, bedSpot, deadX, standY, stoneX } from "./layout";
import { blanketBox, faceSprite, isWide, pickFace } from "./face";
import { drawSprite, spriteCanvas } from "./pixel";
import { eggSprite, icons } from "./sprites";
import type { IconName } from "./sprites";
import { drawField } from "./field";
import { drawMomentOver, drawMomentUnder } from "./moment";
import { drawRoom } from "./room";

// What the creature is looking like it feels, from the save. Used to steer the idle movement.
export function moodOf(save: Save): Mood {
  const c = save.phase === "alive" ? save.creature : null;
  if (!c) return { asleep: false, sad: false, sick: false, dead: save.phase === "dead" };
  return {
    asleep: c.sleep !== null,
    sad: c.stats.happiness < 30,
    sick: c.sick,
    dead: false,
    hungry: c.stats.hunger < 25,
    sleepy: c.stats.energy < 25,
  };
}

// The width and height of the creature's standing picture (16 for an egg).
export function sizeOf(save: Save): number {
  return save.creature ? getForm(save.creature.formId).idle.length : ROOM.sprite;
}

const callIcon: Record<CallKind, IconName> = {
  hungry: "hunger",
  sad: "cloud",
  dirty: "poop",
  sick: "sick",
  sleepy: "zzz",
};

function icon(name: IconName): HTMLCanvasElement {
  return spriteCanvas(icons[name], `icon:${name}`);
}

// A round speech bubble above the creature with an icon inside.
export function drawBubble(ctx: CanvasRenderingContext2D, name: IconName, x: number, y: number): void {
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(x + 1, y, 10, 12);
  ctx.fillRect(x, y + 1, 12, 10);
  ctx.fillRect(x + 4, y + 12, 3, 2); // little tail
  ctx.fillStyle = "#1a1020";
  ctx.fillRect(x + 5, y + 14, 1, 1);
  ctx.drawImage(icon(name), x + 2, y + 2);
}

export function drawScene(ctx: CanvasRenderingContext2D, save: Save, view: View, gameNowMs: number): void {
  ctx.imageSmoothingEnabled = false;
  const c = save.creature;
  const alive = save.phase === "alive" && c;
  // A living creature that is out in a field (and not away on a job) is drawn in the field. Anything else is the room.
  if (!(alive && !c.job && c.place !== "home" && drawField(ctx, c.place))) drawRoom(ctx, hourOf(gameNowMs));

  // Poop on the floor.
  if (alive) {
    for (let i = 0; i < c.poop; i++) {
      const spot = POOP_SPOTS[i];
      if (spot) ctx.drawImage(icon("poop"), spot[0], spot[1]);
    }
  }

  const off = poseOffsets(view);

  if (save.phase === "egg" && save.egg) {
    const egg = save.egg;
    const progress = Math.min(1, ((gameNowMs - egg.startedAt) / MINUTE + egg.shavedMinutes) / tuning.egg.minutes);
    const sprite = spriteCanvas(eggSprite(egg.pattern), `egg:${egg.pattern}`);
    const wobble = view.pose === "wobble" ? off.dx : Math.round(Math.sin(view.clock * (2 + progress * 6)) * progress * 1.4);
    const x = ROOM.eggX + wobble;
    drawSprite(ctx, sprite, x, ROOM.eggY);
    if (progress > 0.6) drawCracks(ctx, x, ROOM.eggY, progress);
  } else if (alive && c.job) {
    // Out working in the habitat: the room is empty, with a bubble that says where it went.
    drawBubble(ctx, "tree", ROOM.w / 2 - 6, 54);
  } else if (c) {
    const form = getForm(c.formId);
    const asleep = c.sleep !== null;
    const dead = save.phase === "dead";
    // A hatch or evolve scene replaces the picture (and the usual extras) while it plays.
    if (!dead && drawMomentUnder(ctx, view, form.id)) {
      // drawn by the scene
    } else {
      const tint = dead
        ? { color: "#8a8a8a", amount: 0.75 }
        : c.sick
          ? { color: "#7bdc6a", amount: 0.4 }
          : undefined;
      // Asleep or dead: lying flat with eyes shut. Sad or sick: slumped. Otherwise the picture
      // follows what it is doing and feeling (blinking, yawning, tired eyes, and so on).
      const lying = asleep || dead;
      const kind = pickFace(view, asleep, dead);
      const size = form.idle.length;
      // Only a standing creature has two drawings to swap between (the slumped and lying ones come from the first).
      const frame = isWide(kind) ? 0 : frameOf(view);
      const picture = faceSprite(form, kind, frame);
      const sprite = spriteCanvas(picture, `form:${form.id}:${kind}:${frame}`, tint);
      const onBed = asleep && !dead;
      const bed = bedSpot(size);
      const x = Math.round(dead ? deadX(size) : onBed ? bed.x : view.x + off.dx); // whole pixels, so the tears and marks line up
      const y = (onBed ? bed.y : standY(size)) + (dead ? 0 : off.dy);
      // The lying and slumped pictures are wider than the standing one, so they start further left to stay centered.
      const flip = view.facing === -1;
      const drawX = x - (sprite.width - size) / 2;
      drawSprite(ctx, sprite, drawX, y, { flipX: flip, height: sprite.height - (lying ? 0 : off.squash) });

      if (onBed) drawBlanket(ctx, picture, drawX, y, flip);
      if (view.pose === "rumble" && !lying) drawRumble(ctx, x, y, size, view.poseTime);

      if (view.snack) drawSnack(ctx, view.snack, view.poseTime, view.facing);

      if (dead) drawTombstone(ctx, stoneX(size), ROOM.groundY - 12);
      else if (asleep) drawFloatingZ(ctx, view.clock, Math.min(x + size - 4, ROOM.w - 8), y); // (the icon is 8 wide: keep it in the room)
      else if (c.call && Math.floor(view.clock * 2) % 4 !== 3) {
        drawBubble(ctx, callIcon[c.call], x + size - 2, y - 12);
      }
    }
  }

  // Hearts and sparkles.
  for (const fx of view.effects) {
    const rise = Math.round((fx.age / fx.life) * 10);
    if (fx.kind === "heart") ctx.drawImage(icon("wellness"), Math.round(fx.x), Math.round(fx.y) - rise);
    else {
      ctx.fillStyle = "#ffe066";
      ctx.fillRect(Math.round(fx.x), Math.round(fx.y) - rise, 1, 3);
      ctx.fillRect(Math.round(fx.x) - 1, Math.round(fx.y) - rise + 1, 3, 1);
    }
  }

  // Lights off: darken the room while the creature sleeps.
  if (alive && c.sleep) {
    ctx.fillStyle = "rgba(15, 10, 50, 0.4)";
    ctx.fillRect(0, 0, ROOM.w, ROOM.h);
  }

  drawMomentOver(ctx, view); // the flash goes over everything
}

// The food on the floor. It drops in, then loses a quarter in each bite, from the side the
// creature is eating from.
function drawSnack(ctx: CanvasRenderingContext2D, snack: Snack, poseTime: number, facing: 1 | -1): void {
  const picture = icon(snack.food);
  const left = foodLeft(poseTime);
  const { from, columns, shift } = snackCut(picture.width, left, facing);
  if (columns <= 0) return;
  const fall = Math.round(14 * (1 - Math.min(1, poseTime / MEAL.drop)) ** 2); // pixels above the floor
  ctx.drawImage(picture, from, 0, columns, picture.height, snack.x + shift, snack.y - fall, columns, picture.height);
}

// A blanket tucked up to the creature's chin, so only its face shows.
function drawBlanket(ctx: CanvasRenderingContext2D, lying: Sprite, x: number, y: number, flip: boolean): void {
  const box = blanketBox(lying);
  if (!box) return;
  const width = lying.rows[0]?.length ?? 0;
  const left = flip ? width - 1 - box.right : box.left;
  const right = flip ? width - 1 - box.left : box.right;
  const top = y + box.top;
  const height = box.bottom - box.top + 2; // one pixel past its feet, over the mattress
  ctx.fillStyle = "#ff8fb3";
  ctx.fillRect(x + left, top, right - left + 1, height);
  ctx.fillStyle = "#ffc2d6"; // the folded edge
  ctx.fillRect(x + left, top, right - left + 1, 1);
  ctx.fillStyle = "#e0455b"; // the hem
  ctx.fillRect(x + left, top + height - 1, right - left + 1, 1);
}

// Little tremble marks either side of a hungry tummy, flickering. The three marks sit at 9, 11 and
// 13 rows down a 16 pixel creature, and further down a bigger one.
function drawRumble(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, poseTime: number): void {
  if (Math.floor(poseTime * 10) % 2 !== 0) return;
  ctx.fillStyle = "#5b3f7a";
  for (const rows of [9, 11, 13]) {
    const dy = Math.round((rows * size) / 16);
    ctx.fillRect(x - 2, y + dy, 2, 1);
    ctx.fillRect(x + size, y + dy, 2, 1);
  }
}

function drawCracks(ctx: CanvasRenderingContext2D, x: number, y: number, progress: number): void {
  ctx.fillStyle = "#1a1020";
  ctx.fillRect(x + 7, y + 4, 1, 1);
  ctx.fillRect(x + 8, y + 5, 1, 1);
  ctx.fillRect(x + 7, y + 6, 1, 1);
  if (progress > 0.85) {
    ctx.fillRect(x + 8, y + 7, 1, 1);
    ctx.fillRect(x + 9, y + 8, 1, 1);
    ctx.fillRect(x + 5, y + 9, 1, 1);
    ctx.fillRect(x + 6, y + 8, 1, 1);
  }
}

function drawTombstone(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  ctx.fillStyle = "#9aa0a6";
  ctx.fillRect(x, y + 4, STONE_WIDTH, 10);
  ctx.fillRect(x + 1, y + 2, STONE_WIDTH - 2, 2);
  ctx.fillRect(x + 2, y, STONE_WIDTH - 4, 2);
  ctx.fillStyle = "#6b7078";
  ctx.fillRect(x + 4, y + 4, 2, 6); // cross
  ctx.fillRect(x + 2, y + 6, 6, 2);
}

// A "z" that drifts up above a sleeping creature.
function drawFloatingZ(ctx: CanvasRenderingContext2D, clock: number, x: number, y: number): void {
  const drift = Math.floor(clock * 6) % 12;
  ctx.drawImage(icon("zzz"), x, y - 4 - drift);
}
