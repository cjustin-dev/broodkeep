// Idle life: how the creature moves around the room when nobody is touching it.
// This is only for looks. It is never saved and does not change any stat.
// Reactions (hop for joy, head shake for "no", eating) are started by calling triggerPose
// or startEating. Feelings (sad, sick, hungry, sleepy) come in through the mood.

import type { FoodId } from "../game/types";
import { ROOM, bedSpot, standY, walkMaxX } from "./layout";
import type { Moment, Shown } from "./moment";

// "refuse" is the creature saying no: eyes shut, slow gentle head shake.
// "wobble" is the quick wiggle of a tapped egg.
// "rumble" is a hungry tummy growling, "yawn" is a tired creature yawning.
export type Pose =
  | "idle"
  | "walk"
  | "hop"
  | "happy"
  | "startle"
  | "refuse"
  | "wobble"
  | "eat"
  | "sleep"
  | "rumble"
  | "yawn";

export interface Effect {
  kind: "heart" | "sparkle";
  x: number;
  y: number;
  age: number; // seconds so far
  life: number; // seconds it lasts
}

// A bit of food on the floor while the creature eats it.
export interface Snack {
  food: FoodId;
  x: number;
  y: number;
}

export interface View {
  size: number; // width and height of the creature's standing picture (16 for an egg, 20 to 48 for a creature), set by updateView
  x: number; // left edge of the sprite
  facing: 1 | -1; // 1 = looking right
  pose: Pose;
  poseTime: number; // seconds spent in this pose
  poseLength: number; // seconds this pose lasts (idle and timed poses)
  targetX: number; // where a walk is heading
  clock: number; // seconds since the screen opened, for bobbing
  effects: Effect[];
  snack: Snack | null; // food being eaten, only while the pose is "eat"
  mood: Mood; // how it feels right now, copied in by updateView
  nextBlink: number; // clock time of the next blink
  moment: Moment | null; // a hatch or evolve scene that is playing (see moment.ts)
  shown: Shown | null; // what the screen last saw of the save, to notice a hatch or an evolution
}

export interface Mood {
  asleep: boolean;
  sad: boolean;
  sick: boolean;
  dead?: boolean;
  hungry?: boolean;
  sleepy?: boolean;
}

// How long each timed reaction lasts, in seconds.
const poseLengths: Partial<Record<Pose, number>> = {
  hop: 0.5,
  happy: 0.8,
  startle: 0.4,
  refuse: 1.3,
  wobble: 0.6,
  eat: 2.2,
  rumble: 0.9,
  yawn: 1.7,
};

// A yawn: the mouth is open from `open` to `close` seconds, with the eyes shut the whole time.
export const YAWN = { open: 0.3, close: 1.4 };

// A blink is short, and comes every few seconds.
export const BLINK = { length: 0.16, gapMin: 2.5, gapMax: 5.5 };

// A meal, in seconds from the start of the "eat" pose: the food drops in, then four bites with
// chewing between them, then a moment to swallow. Bite 4 finishes the food.
export const MEAL = { drop: 0.35, bite: 0.4, bites: 4 };

export function createView(): View {
  return {
    size: ROOM.sprite,
    x: ROOM.eggX,
    facing: 1,
    pose: "idle",
    poseTime: 0,
    poseLength: 2,
    targetX: ROOM.eggX,
    clock: 0,
    effects: [],
    snack: null,
    mood: { asleep: false, sad: false, sick: false },
    nextBlink: 2,
    moment: null,
    shown: null,
  };
}

function setPose(view: View, pose: Pose, length?: number): void {
  view.pose = pose;
  view.poseTime = 0;
  view.poseLength = length ?? poseLengths[pose] ?? 2;
}

// Start a reaction right now (called when the player does something).
export function triggerPose(view: View, pose: Pose): void {
  setPose(view, pose);
  if (pose === "startle") view.facing = view.facing === 1 ? -1 : 1;
}

// Put a piece of food on the floor in front of the creature and start eating it.
export function startEating(view: View, food: FoodId): void {
  // The food (8 pixels across) goes on the side it is facing, unless the wall or the bed is in the way there.
  const rightOk = view.x + view.size + 8 <= ROOM.bedLeft;
  const leftOk = view.x - 8 >= 0;
  if (view.facing === 1 && !rightOk) view.facing = -1;
  else if (view.facing === -1 && !leftOk) view.facing = 1;
  setPose(view, "eat");
  const x = Math.round(view.x); // whole pixels, like the creature, so the food lines up with it
  view.snack = { food, x: x + (view.facing === 1 ? view.size : -8), y: ROOM.groundY - 8 };
}

// How much of the food is left, from 1 (all of it) to 0 (eaten).
export function foodLeft(poseTime: number): number {
  if (poseTime < MEAL.drop) return 1;
  const bitten = Math.min(MEAL.bites, Math.floor((poseTime - MEAL.drop) / MEAL.bite) + 1);
  return 1 - bitten / MEAL.bites;
}

// Which slice of a food picture is still there, and where it sits. Facing right, the creature is
// left of the food and bites its left edge, so the right part stays. Facing left it bites the
// right edge and the left part stays.
export function snackCut(width: number, left: number, facing: 1 | -1): { from: number; columns: number; shift: number } {
  const columns = Math.round(width * left);
  const gone = width - columns;
  return facing === 1 ? { from: gone, columns, shift: gone } : { from: 0, columns, shift: 0 };
}

// Eyes are shut while asleep (the caller knows that), saying no, chewing and yawning.
export function eyesClosed(view: View): boolean {
  return view.pose === "refuse" || view.pose === "sleep" || view.pose === "yawn" || (view.pose === "eat" && view.poseTime >= MEAL.drop);
}

export function blinking(view: View): boolean {
  return view.clock >= view.nextBlink && view.clock < view.nextBlink + BLINK.length;
}

export function addEffect(view: View, kind: Effect["kind"], x: number, y: number): void {
  view.effects.push({ kind, x, y, age: 0, life: 1.1 });
}

// A heart just above the creature's head, left of the middle.
export function addHeart(view: View): void {
  addEffect(view, "heart", view.x + view.size / 4, standY(view.size) - 2);
}

// Sparkles at random spots over a standing creature's body.
export function addSparkles(view: View, count: number, rand: () => number = Math.random): void {
  for (let i = 0; i < count; i++) {
    addEffect(view, "sparkle", view.x + 2 + rand() * (view.size - 4), standY(view.size) + 2 + rand() * (view.size * 0.6));
  }
}

// Which of the two standing drawings to show: they swap every half second while it stands, hops or
// is happy, and every quarter second while it walks (a step each). Every other pose uses the first.
export function frameOf(view: View): 0 | 1 {
  const period = view.pose === "walk" ? 0.25 : view.pose === "idle" || view.pose === "hop" || view.pose === "happy" ? 0.5 : 0;
  return period > 0 && Math.floor(view.clock / period) % 2 === 1 ? 1 : 0;
}

// Move the view forward by dt seconds. "rand" gives numbers from 0 up to 1.
export function updateView(view: View, dt: number, mood: Mood, rand: () => number, size: number = view.size): void {
  view.size = size;
  view.clock += dt;
  view.poseTime += dt;
  view.mood = mood;
  if (view.clock >= view.nextBlink + BLINK.length) view.nextBlink = view.clock + BLINK.gapMin + rand() * (BLINK.gapMax - BLINK.gapMin);
  view.effects = view.effects.filter((fx) => (fx.age += dt) < fx.life);
  if (mood.dead && view.pose === "eat") setPose(view, "idle", 2); // a meal stops if it dies halfway
  if (view.pose !== "eat") view.snack = null;

  if (mood.asleep) {
    goToBed(view, dt);
    return;
  }
  if (view.pose === "sleep") setPose(view, "idle", 1);

  const speed = mood.sad || mood.sick ? 8 : 14; // pixels per second
  switch (view.pose) {
    case "walk": {
      const dx = view.targetX - view.x;
      const step = speed * dt;
      if (Math.abs(dx) <= step) {
        view.x = view.targetX;
        setPose(view, "idle", 1 + rand() * 2);
      } else {
        view.x += Math.sign(dx) * step;
        view.facing = dx > 0 ? 1 : -1;
      }
      break;
    }
    case "idle":
      if (view.poseTime >= view.poseLength) chooseNext(view, mood, rand);
      break;
    default: // timed reactions end by themselves
      if (view.poseTime >= view.poseLength) {
        if (view.pose === "eat") {
          // A full tummy makes it happy.
          setPose(view, "happy");
          addHeart(view);
        } else setPose(view, "idle", 1 + rand() * 2);
      }
  }
  view.x = Math.min(walkMaxX(view.size), Math.max(ROOM.walkMinX, view.x));
}

function chooseNext(view: View, mood: Mood, rand: () => number): void {
  const roll = rand();
  // A hungry tummy growls and a tired creature yawns, now and then.
  let edge = 0;
  if (mood.hungry) {
    edge += 0.25;
    if (roll < edge) return setPose(view, "rumble");
  }
  if (mood.sleepy) {
    edge += 0.25;
    if (roll < edge) return setPose(view, "yawn");
  }
  // What is left of the roll after the growl and yawn chances, spread back over 0 to 1.
  const rest = (roll - edge) / (1 - edge);
  if (mood.sick || mood.sad || mood.hungry || mood.sleepy) {
    // Low spirits: mostly sits still, wanders rarely, never hops around.
    if (rest < 0.25) startWalk(view, rand);
    else setPose(view, "idle", 2 + rand() * 3);
    return;
  }
  if (rest < 0.45) startWalk(view, rand);
  else if (rest < 0.7) setPose(view, "hop");
  else if (rest < 0.85) {
    view.facing = view.facing === 1 ? -1 : 1;
    setPose(view, "idle", 1 + rand() * 2);
  } else setPose(view, "idle", 1 + rand() * 2);
}

function startWalk(view: View, rand: () => number): void {
  view.targetX = Math.round(ROOM.walkMinX + rand() * (walkMaxX(view.size) - ROOM.walkMinX));
  setPose(view, "walk");
}

function goToBed(view: View, dt: number): void {
  const bedX = bedSpot(view.size).x;
  const dx = bedX - view.x;
  const step = 20 * dt;
  if (Math.abs(dx) <= step) {
    view.x = bedX;
    if (view.pose !== "sleep") setPose(view, "sleep");
  } else {
    view.x += Math.sign(dx) * step;
    view.facing = dx > 0 ? 1 : -1;
    view.pose = "walk";
  }
}

// How far to move the sprite from its resting place this frame, for bobbing and reactions.
export function poseOffsets(view: View): { dx: number; dy: number; squash: number } {
  const t = view.poseTime;
  switch (view.pose) {
    case "hop":
      return { dx: 0, dy: -Math.round(6 * Math.sin(Math.min(1, t / view.poseLength) * Math.PI)), squash: 0 };
    case "happy": {
      const phase = (t / view.poseLength) * 2; // two hops
      return { dx: 0, dy: -Math.round(5 * Math.abs(Math.sin(phase * Math.PI))), squash: 0 };
    }
    case "startle":
      return { dx: 0, dy: -Math.round(8 * Math.sin(Math.min(1, t / view.poseLength) * Math.PI)), squash: 0 };
    case "refuse": {
      // Slow, gentle: about three sways, easing in and out, two pixels at the most.
      const ease = Math.sin(Math.min(1, t / view.poseLength) * Math.PI);
      return { dx: Math.round(2 * ease * Math.sin(t * Math.PI * 4.5)), dy: 0, squash: 0 };
    }
    case "wobble":
      return { dx: Math.round(2 * Math.sin(t * 40)), dy: 0, squash: 0 };
    case "rumble":
      return { dx: 0, dy: Math.floor(t * 16) % 2, squash: 0 }; // the whole body trembles
    case "yawn":
      return { dx: 0, dy: t >= YAWN.open && t < YAWN.close ? -1 : 0, squash: 0 }; // stretches up
    case "eat": {
      const chewing = t >= MEAL.drop && t < MEAL.drop + MEAL.bite * MEAL.bites;
      return { dx: 0, dy: 0, squash: chewing && Math.sin((t - MEAL.drop) * 16) > 0 ? 1 : 0 };
    }
    case "walk":
      return { dx: 0, dy: -(Math.floor(view.clock * 8) % 2), squash: 0 }; // little step-bounce
    case "sleep":
      return { dx: 0, dy: 0, squash: 2 };
    default: {
      if (view.mood.sick) {
        // Queasy: a slow sway, one pixel each way, and a heavy slow sigh.
        return { dx: Math.round(Math.sin(view.clock * 3.8)), dy: 0, squash: Math.sin(view.clock * 1.5) > 0.4 ? 1 : 0 };
      }
      const slow = view.mood.sad ? 1.5 : 3; // a sad creature sighs slowly
      return { dx: 0, dy: 0, squash: Math.sin(view.clock * slow) > 0.4 ? 1 : 0 }; // breathing
    }
  }
}
