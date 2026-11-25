// Big moments: an egg hatching and a creature evolving. Looks only: never saved, and nothing here
// changes the game. The scene starts when the screen sees the save change (egg to creature, or one
// form to another), including a change that happened while the app was closed.
//
//   hatch:  the egg shakes and cracks, a flash, the shell flies apart and the baby hops out
//   evolve: the old form flickers white while sparkles circle it, a flash, then the new form
//           fades in from white and hops

import { getForm } from "../data/forms";
import type { Save } from "../game/state";
import type { EggPattern } from "../game/types";
import { faceSprite } from "./face";
import { EGG_TILE, TILE } from "../data/home";
import { anchorOf, anchorPos } from "./home";
import { addEffect, triggerPose } from "./idle";
import type { View } from "./idle";
import { ROOM, walkMaxX } from "./layout";
import { drawSprite, spriteCanvas } from "./pixel";
import { spotsOf } from "./spots";
import { eggSprite } from "./sprites";

// What the screen last saw, to notice a change.
export type Shown = { phase: "egg"; pattern: EggPattern } | { phase: "alive"; formId: string } | { phase: "other" };

export interface Moment {
  kind: "hatch" | "evolve";
  time: number; // seconds since it started
  pattern?: EggPattern; // hatch: the egg that is breaking
  from?: string; // evolve: the form it is leaving
}

// Seconds. `pop` is when the egg breaks and the baby appears. `swap` is when the old form is
// replaced by the new one.
export const HATCH = { pop: 1.4, flashIn: 0.25, flashOut: 0.35, shells: 1.0, length: 2.6 };
export const EVOLVE = { swap: 1.4, flashIn: 0.25, flashOut: 0.35, fade: 0.5, length: 3.0 };

const FLASH_STRENGTH = 0.8;

export function shownOf(save: Save): Shown {
  if (save.phase === "egg" && save.egg) return { phase: "egg", pattern: save.egg.pattern };
  if (save.phase === "alive" && save.creature) return { phase: "alive", formId: save.creature.formId };
  return { phase: "other" };
}

// Where a creature of this size stands when it hatches: on the egg (the one-line room's egg spot, or the tile the egg sits on in the home).
function standOnEgg(view: View, size: number): void {
  if (view.world === "home") {
    const at = anchorPos(anchorOf(EGG_TILE.col * TILE + (TILE - size) / 2, (EGG_TILE.row + 1) * TILE, size), size);
    view.x = at.x;
    view.y = at.y;
    view.path = [];
    return;
  }
  view.x = ROOM.eggX;
}

// Called every frame before the view moves. Starts a scene when the save changed, and runs it.
export function stepMoment(view: View, save: Save, dt: number): void {
  const now = shownOf(save);
  const before = view.shown;
  view.shown = now;
  if (now.phase !== "alive") view.moment = null; // erased, dead or a new egg: no scene on top of that

  if (before?.phase === "egg" && now.phase === "alive") {
    view.moment = { kind: "hatch", time: 0, pattern: before.pattern };
    standOnEgg(view, getForm(now.formId).idle.length);
    view.facing = 1;
  } else if (before?.phase === "alive" && now.phase === "alive" && before.formId !== now.formId && save.creature?.sleep === null) {
    // (A creature that evolves in its sleep just changes: the scene stands it up, and it is in bed.)
    view.moment = { kind: "evolve", time: 0, from: before.formId };
    // The new form may be a different size: keep the middle of the creature where it was, inside the walking area.
    const was = getForm(before.formId).idle.length;
    const size = getForm(now.formId).idle.length;
    if (view.world === "home") {
      // The new footprint may not fit where the old one stood (a doorway, furniture): it moves to the nearest tile where it does.
      const at = anchorPos(anchorOf(view.x + (was - size) / 2, view.y, size), size);
      view.x = at.x;
      view.y = at.y;
      view.path = [];
    } else view.x = Math.min(walkMaxX(size), Math.max(ROOM.walkMinX, view.x + (was - size) / 2));
    view.size = size;
    view.pose = "idle"; // stand still for the scene
    view.poseTime = 0;
    view.poseLength = EVOLVE.length;
  }

  const moment = view.moment;
  if (!moment) return;
  const was = moment.time;
  moment.time += dt;
  const spec = moment.kind === "hatch" ? HATCH : EVOLVE;
  const turn = moment.kind === "hatch" ? HATCH.pop : EVOLVE.swap;
  if (was < turn && moment.time >= turn) {
    if (moment.kind === "hatch") standOnEgg(view, view.size); // it may have wandered while hidden
    triggerPose(view, "happy");
    // (Spots around a 16 pixel creature, spread out to the size it has now.)
    for (const [dx, dy] of [[0, 6], [15, 4], [4, -2], [11, -2], [8, 12], [-2, 10], [17, 10]] as const) {
      addEffect(view, "sparkle", view.x + Math.round((dx * view.size) / 16), view.y - view.size + Math.round((dy * view.size) / 16));
    }
  }
  if (moment.time >= spec.length) view.moment = null;
}

// How white the whole room is, from 0 to 1: a ramp up to the moment of the change, then a fade.
export function flashAlpha(moment: Moment): number {
  const spec = moment.kind === "hatch" ? HATCH : EVOLVE;
  const peak = moment.kind === "hatch" ? HATCH.pop : EVOLVE.swap;
  const t = moment.time;
  if (t < peak - spec.flashIn) return 0;
  if (t < peak) return ((t - (peak - spec.flashIn)) / spec.flashIn) * FLASH_STRENGTH;
  return Math.max(0, 1 - (t - peak) / spec.flashOut) * FLASH_STRENGTH;
}

// The creature (or egg) while the scene is replacing it. Returns false once the normal picture
// should be drawn again (the baby after the pop, the new form once it has faded in).
export function drawMomentUnder(ctx: CanvasRenderingContext2D, view: View, newFormId: string): boolean {
  const moment = view.moment;
  if (!moment) return false;
  const t = moment.time;

  if (moment.kind === "hatch") {
    if (t >= HATCH.pop || !moment.pattern) return false;
    // A shake that grows, with the cracks all showing.
    const shake = Math.round(Math.sin(t * 45) * (0.8 + (2.2 * t) / HATCH.pop));
    const egg = spotsOf(view.world).egg;
    const x = egg.x + shake;
    drawSprite(ctx, spriteCanvas(eggSprite(moment.pattern), `egg:${moment.pattern}`), x, egg.y);
    ctx.fillStyle = "#1a1020";
    for (const [dx, dy] of [[7, 4], [8, 5], [7, 6], [8, 7], [9, 8], [5, 9], [6, 8], [4, 5], [3, 6]] as const) {
      ctx.fillRect(x + dx, egg.y + dy, 1, 1);
    }
    return true;
  }

  // The old form is drawn centered where the new one will stand, whatever its size.
  const middle = Math.round(view.x) + view.size / 2;
  if (t < EVOLVE.swap) {
    // Flickers between its own colors and white, a little faster as it goes (2 to 5 times a second).
    const phase = 2 * t + (1.5 * t * t) / EVOLVE.swap;
    const white = Math.floor(phase * 2) % 2 === 1;
    const form = getForm(moment.from ?? newFormId);
    const kind = "open" as const;
    const tint = white ? { color: "#ffffff", amount: 1 } : undefined;
    const size = form.idle.length;
    drawSprite(ctx, spriteCanvas(faceSprite(form, kind), `form:${form.id}:${kind}:0`, tint), middle - size / 2, view.y - size, { flipX: view.facing === -1 });
    return true;
  }
  if (t < EVOLVE.swap + EVOLVE.fade) {
    const amount = 1 - (t - EVOLVE.swap) / EVOLVE.fade; // white fading out
    const steps = Math.ceil(amount * 4) / 4; // four steps keeps the number of pictures made small
    const form = getForm(newFormId);
    const kind = "open" as const;
    const tint = { color: "#ffffff", amount: steps };
    drawSprite(ctx, spriteCanvas(faceSprite(form, kind), `form:${form.id}:${kind}:0`, tint), middle - view.size / 2, view.y - view.size, { flipX: view.facing === -1 });
    return true;
  }
  return false;
}

// Fills the whole canvas (the picture on the screen) in the current fill colour, whatever the camera is looking at.
export function fillScreen(ctx: CanvasRenderingContext2D): void {
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.restore();
}

// Things drawn on top of everything: the flying shell, the circling sparkles and the flash.
export function drawMomentOver(ctx: CanvasRenderingContext2D, view: View): void {
  const moment = view.moment;
  if (!moment) return;
  const t = moment.time;

  if (moment.kind === "hatch" && moment.pattern && t >= HATCH.pop && t < HATCH.pop + HATCH.shells) {
    // The top half of the egg flies up and away, the bottom half hops aside and drops.
    const s = t - HATCH.pop;
    const egg = spriteCanvas(eggSprite(moment.pattern), `egg:${moment.pattern}`);
    const half = egg.height / 2;
    const fade = 1 - s / HATCH.shells;
    const spot = spotsOf(view.world).egg;
    ctx.globalAlpha = Math.min(1, fade * 2);
    ctx.drawImage(egg, 0, 0, egg.width, half, Math.round(spot.x - 14 * s), Math.round(spot.y - 22 * s + 30 * s * s), egg.width, half);
    ctx.drawImage(egg, 0, half, egg.width, half, Math.round(spot.x + 10 * s), Math.round(spot.y + half - 10 * s + 30 * s * s), egg.width, half);
    ctx.globalAlpha = 1;
  }

  if (moment.kind === "evolve" && t < EVOLVE.swap) {
    // Six sparkles circle the creature, closing in. (The ring is sized for a 16 pixel creature, and grows with the size.)
    const close = 1 - t / EVOLVE.swap;
    const scale = view.size / 16;
    ctx.fillStyle = "#ffe066";
    for (let i = 0; i < 6; i++) {
      const angle = (i * Math.PI) / 3 + t * 5;
      const sx = Math.round(view.x + view.size / 2 + Math.cos(angle) * (8 + 8 * close) * scale);
      const sy = Math.round(view.y - view.size + view.size / 2 + Math.sin(angle) * (6 + 7 * close) * scale);
      ctx.fillRect(sx, sy - 1, 1, 3);
      ctx.fillRect(sx - 1, sy, 3, 1);
    }
  }

  const alpha = flashAlpha(moment);
  if (alpha > 0) {
    ctx.fillStyle = `rgba(255, 255, 255, ${alpha.toFixed(3)})`;
    if (view.world === "home") fillScreen(ctx); // the flash covers the whole picture, not the corner of the home it happens in
    else ctx.fillRect(0, 0, ROOM.w, ROOM.h);
  }
}
