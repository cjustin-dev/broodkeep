// Draws one frame of the game picture: room, poop, egg or creature, thought bubble, effects.
// Reads the save but never changes it.

import { getForm } from "../data/forms";
import type { Layout } from "../data/home";
import { FOND_LEVEL, bondAtLeast } from "../game/bond";
import type { CallKind, Save } from "../game/state";
import { MINUTE, hourOf, realClock } from "../game/time";
import { tuning } from "../data/tuning";
import { MEAL, eyesClosed, foodLeft, frameOf, poseOffsets, snackCut } from "./idle";
import type { Mood, Snack, View } from "./idle";
import type { Sprite } from "./pixel";
import { ROOM, STONE_WIDTH } from "./layout";
import { blanketBox, faceSprite, isWide, pickFace } from "./face";
import { drawSprite, spriteCanvas } from "./pixel";
import { eggSprite, icons } from "./sprites";
import type { IconName } from "./sprites";
import { drawField } from "./field";
import { hatOf } from "./hat";
import { drawTappables } from "./tappables";
import { isBehind } from "./home";
import { drawMomentOver, drawMomentUnder, fillScreen } from "./moment";
import { drawHomeBack, drawHomePieces, drawRoom, lookOf } from "./room";
import { spotsOf } from "./spots";

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
    fond: bondAtLeast(save, FOND_LEVEL),
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

// Where a thought bubble over the creature is, in game pixels: over its head, kept inside the walls (the call and an initiative share the slot, and a tap on an initiative's bubble is tested against the
// very same box). `size` is the creature's picture size and `spotsW` the width of its world.
export const BUBBLE = { w: 12, h: 15 };
export function bubbleBox(view: View, size: number, spotsW: number): { x: number; y: number; w: number; h: number } {
  const off = poseOffsets(view);
  const x = Math.round(view.x + off.dx);
  const y = view.y - size + off.dy;
  return { x: Math.max(0, Math.min(x + size - 2, spotsW - BUBBLE.w)), y: Math.max(0, y - 12), w: BUBBLE.w, h: BUBBLE.h };
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

// `layout` is for Decorate mode, which draws a layout other than the saved one (the piece a finger is carrying is left out and drawn on top afterwards).
export function drawScene(ctx: CanvasRenderingContext2D, save: Save, view: View, gameNowMs: number, layout?: Layout): void {
  ctx.imageSmoothingEnabled = false;
  const c = save.creature;
  const alive = save.phase === "alive" && c;
  const home = view.world === "home";
  const spots = spotsOf(view.world);
  const look = layout ? { ...lookOf(save), layout } : lookOf(save);
  // In the home: the three rooms. In the one-line room: a living creature that is out in a field (and not away on a job) is drawn in the field, and anything else in the
  // room.
  const hour = hourOf(realClock(save, gameNowMs)); // the light follows the real clock, not the sped-up game clock
  if (home) drawHomeBack(ctx, hour, look);
  else if (!(alive && !c.job && c.place !== "home" && drawField(ctx, c.place))) drawRoom(ctx, hour, look);

  // Furniture is drawn in two layers round whatever stands in the home: the pieces whose bottom edge is at or above the feet first, then the thing, then the rest.
  // (Asleep in bed, dead, away: nothing is walking among the furniture, so all of it goes first.)
  const standing = alive && !c.job && (c.sleep === null || view.pose !== "sleep");
  const feet = save.phase === "egg" ? spots.egg.y + ROOM.sprite : standing ? view.y : Number.POSITIVE_INFINITY;
  if (home) drawHomePieces(ctx, look, (p) => isBehind(p, feet));

  // Poop on the floor.
  if (alive) {
    for (let i = 0; i < c.poop; i++) {
      const spot = spots.poop(i);
      if (spot) ctx.drawImage(icon("poop"), spot.x, spot.y);
    }
  }

  const off = poseOffsets(view);

  if (save.phase === "egg" && save.egg) {
    const egg = save.egg;
    const progress = Math.min(1, ((gameNowMs - egg.startedAt) / MINUTE + egg.shavedMinutes) / tuning.egg.minutes);
    const sprite = spriteCanvas(eggSprite(egg.pattern), `egg:${egg.pattern}`);
    const wobble = view.pose === "wobble" ? off.dx : Math.round(Math.sin(view.clock * (2 + progress * 6)) * progress * 1.4);
    const x = spots.egg.x + wobble;
    drawSprite(ctx, sprite, x, spots.egg.y);
    if (progress > 0.6) drawCracks(ctx, x, spots.egg.y, progress);
  } else if (alive && c.job) {
    // Out working in the habitat: the room is empty, with a bubble that says where it went.
    drawBubble(ctx, "tree", spots.bubble.x, spots.bubble.y);
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
      // In the home it lies down only once it has walked to the bed (its pose is "sleep" then); in the one-line room it lies on the bed at once.
      const inBed = asleep && (!home || view.pose === "sleep");
      const lying = inBed || dead;
      const kind = pickFace(view, inBed, dead);
      const size = form.idle.length;
      // Only a standing creature has two drawings to swap between (the slumped and lying ones come from the first).
      const frame = isWide(kind) ? 0 : frameOf(view);
      const hat = dead ? null : hatOf(save); // (a dead creature is drawn without it)
      const picture = faceSprite(form, kind, frame, hat);
      const sprite = spriteCanvas(picture, `form:${form.id}:${kind}:${frame}${hat ? `:${hat}` : ""}`, tint);
      const onBed = inBed && !dead;
      const bed = spots.bed(size);
      const grave = spots.dead(size);
      const x = Math.round(dead ? grave.x : onBed ? bed.x : view.x + off.dx); // whole pixels, so the tears and marks line up
      const y = (dead ? grave.y : onBed ? bed.y : view.y - size) + (dead ? 0 : off.dy);
      // The lying and slumped pictures are wider than the standing one, so they start further left to stay centered.
      const flip = view.facing === -1;
      const drawX = x - (sprite.width - size) / 2;
      drawSprite(ctx, sprite, drawX, y, { flipX: flip, height: sprite.height - (lying ? 0 : off.squash) });

      if (onBed) drawBlanket(ctx, faceSprite(form, kind, frame), drawX, y, flip); // (the blanket is fitted to the hatless picture)
      if (view.pose === "rumble" && !lying) drawRumble(ctx, x, y, size, view.poseTime);

      if (view.snack) drawSnack(ctx, view.snack, view.poseTime, view.facing);
      if (view.tappables.length > 0 && c.place !== "home") drawTappables(ctx, view, c.place); // on the ground in a field: over the creature, under its bubbles

      if (dead) {
        const stone = spots.stone(size);
        drawTombstone(ctx, stone.x, stone.y);
      } else if (inBed) drawFloatingZ(ctx, view.clock, Math.min(x + size - 4, spots.w - 8), y); // (the icon is 8 wide: keep it in the room)
      else if (c.call) {
        if (Math.floor(view.clock * 2) % 4 !== 3) {
          const at = bubbleBox(view, size, spots.w);
          drawBubble(ctx, callIcon[c.call], at.x, at.y);
        }
      } else if (view.invite) {
        // An initiative (adult track A3.3) sits in the call's slot, which the call has first: steady, with a one pixel bob (the call blinks, so the two read differently).
        const at = bubbleBox(view, size, spots.w);
        drawBubble(ctx, view.invite, at.x, at.y + (Math.floor(view.clock * 2) % 2));
      }
    }
  }

  if (home) drawHomePieces(ctx, look, (p) => !isBehind(p, feet));

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

  // Lights off: darken the room while the creature sleeps. In the home the whole picture goes dark, whatever room the creature is in or the camera looks at.
  if (alive && c.sleep) {
    ctx.fillStyle = "rgba(15, 10, 50, 0.4)";
    if (home) fillScreen(ctx);
    else ctx.fillRect(0, 0, ROOM.w, ROOM.h);
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
