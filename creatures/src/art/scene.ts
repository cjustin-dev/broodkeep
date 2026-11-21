// Draws one frame of the game picture: room, poop, egg or creature, thought bubble, effects.
// Reads the save but never changes it.

import { getForm } from "../data/forms";
import type { CallKind, Save } from "../game/state";
import { MINUTE, hourOf } from "../game/time";
import { tuning } from "../data/tuning";
import { MEAL, eyesClosed, foodLeft, poseOffsets, snackCut } from "./idle";
import type { Mood, Snack, View } from "./idle";
import type { Sprite } from "./pixel";
import { POOP_SPOTS, ROOM } from "./layout";
import { WIDE_WIDTH, blanketBox, eyeSpots, faceSprite, isWide, pickFace } from "./face";
import { drawSprite, spriteCanvas } from "./pixel";
import { eggSprite, icons } from "./sprites";
import type { IconName } from "./sprites";
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
function drawBubble(ctx: CanvasRenderingContext2D, name: IconName, x: number, y: number): void {
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
  drawRoom(ctx, hourOf(gameNowMs));

  const c = save.creature;
  const alive = save.phase === "alive" && c;

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
  } else if (c) {
    const form = getForm(c.formId);
    const asleep = c.sleep !== null;
    const dead = save.phase === "dead";
    const tint = dead
      ? { color: "#8a8a8a", amount: 0.75 }
      : c.sick
        ? { color: "#7bdc6a", amount: 0.4 }
        : undefined;
    // Asleep or dead: lying flat with eyes shut. Sad or sick: slumped. Otherwise the picture
    // follows what it is doing and feeling (blinking, yawning, tired eyes, and so on).
    const lying = asleep || dead;
    const kind = pickFace(view, asleep, dead);
    const sprite = spriteCanvas(faceSprite(form, kind), `form:${form.id}:${kind}`, tint);
    const onBed = asleep && !dead;
    const x = Math.round(dead ? ROOM.deadX : onBed ? ROOM.bedX : view.x + off.dx); // whole pixels, so the tears and marks line up
    const y = (onBed ? ROOM.bedY : ROOM.walkY) + (dead ? 0 : off.dy);
    // The lying and slumped pictures are wider than the standing one, so they start further left to stay centered.
    const wide = isWide(kind);
    const flip = view.facing === -1;
    const drawX = wide ? x - (WIDE_WIDTH - ROOM.sprite) / 2 : x;
    drawSprite(ctx, sprite, drawX, y, { flipX: flip, height: sprite.height - (lying ? 0 : off.squash) });

    if (onBed) drawBlanket(ctx, faceSprite(form, kind), drawX, y, flip);
    // The body is drawn one row lower on a sigh frame, so the tears move down with it.
    if (kind === "droop" && c.sick === false) drawTears(ctx, faceSprite(form, kind), drawX, y + (lying ? 0 : off.squash), flip, view.clock);
    if (view.pose === "rumble" && !lying) drawRumble(ctx, x, y, view.poseTime);

    if (view.snack) drawSnack(ctx, view.snack, view.poseTime, view.facing);

    if (dead) drawTombstone(ctx, x + 18, y + 4);
    else if (asleep) drawFloatingZ(ctx, view.clock, x, y);
    else if (c.call && Math.floor(view.clock * 2) % 4 !== 3) {
      drawBubble(ctx, callIcon[c.call], x + 14, y - 12);
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
  const left = flip ? WIDE_WIDTH - 1 - box.right : box.left;
  const right = flip ? WIDE_WIDTH - 1 - box.left : box.right;
  const top = y + box.top;
  const height = box.bottom - box.top + 2; // one pixel past its feet, over the mattress
  ctx.fillStyle = "#ff8fb3";
  ctx.fillRect(x + left, top, right - left + 1, height);
  ctx.fillStyle = "#ffc2d6"; // the folded edge
  ctx.fillRect(x + left, top, right - left + 1, 1);
  ctx.fillStyle = "#e0455b"; // the hem
  ctx.fillRect(x + left, top + height - 1, right - left + 1, 1);
}

// A tear rolls down from each eye every few seconds.
function drawTears(ctx: CanvasRenderingContext2D, droop: Sprite, x: number, y: number, flip: boolean, clock: number): void {
  const progress = (clock % 2.6) / 0.9; // 0 to 1 while the tear falls, then a pause
  if (progress >= 1) return;
  ctx.fillStyle = "#9fe0ff";
  for (const spot of eyeSpots(droop)) {
    const column = flip ? WIDE_WIDTH - 1 - spot.x : spot.x;
    ctx.fillRect(x + column, y + spot.y + 1 + Math.round(progress * 5), 1, 2);
  }
}

// Little tremble marks either side of a hungry tummy, flickering.
function drawRumble(ctx: CanvasRenderingContext2D, x: number, y: number, poseTime: number): void {
  if (Math.floor(poseTime * 10) % 2 !== 0) return;
  ctx.fillStyle = "#5b3f7a";
  for (const dy of [9, 11, 13]) {
    ctx.fillRect(x - 2, y + dy, 2, 1);
    ctx.fillRect(x + ROOM.sprite, y + dy, 2, 1);
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
  ctx.fillRect(x, y + 4, 10, 10);
  ctx.fillRect(x + 1, y + 2, 8, 2);
  ctx.fillRect(x + 2, y, 6, 2);
  ctx.fillStyle = "#6b7078";
  ctx.fillRect(x + 4, y + 4, 2, 6); // cross
  ctx.fillRect(x + 2, y + 6, 6, 2);
}

// A "z" that drifts up above a sleeping creature.
function drawFloatingZ(ctx: CanvasRenderingContext2D, clock: number, x: number, y: number): void {
  const drift = Math.floor(clock * 6) % 12;
  ctx.drawImage(icon("zzz"), x + 12, y - 4 - drift);
}
