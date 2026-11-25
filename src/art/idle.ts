// Idle life: how the creature moves around the room when nobody is touching it.
// This is only for looks. It is never saved and does not change any stat.
// Reactions (hop for joy, head shake for "no", eating) are started by calling triggerPose
// or startEating. Feelings (sad, sick, hungry, sleepy) come in through the mood.

import { TILE } from "../data/home";
import type { FoodId } from "../game/types";
import { anchorOf, anchorPos, bedFront, findPath, foodTile, footprintOf, startAnchor, wanderPath } from "./home";
import type { Anchor } from "./home";
import { ROOM, bedSpot, walkMaxX } from "./layout";
import type { Moment, Shown } from "./moment";
import type { World } from "./spots";

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
  y: number; // the line of its feet: ROOM.groundY in the one-line room, any floor row in the home (a standing picture's top is y - size)
  world: World; // which space x and y are in: the old one-line room (and the fields) or the home (set by updateView)
  placed: World | null; // the world x and y were last put in order for (a change of world puts the creature somewhere valid in the new one)
  path: Array<{ x: number; y: number }>; // the home walk: the spots to walk to, in order (left edge, feet line)
  toBed: boolean; // asleep in the home and already on the way to the bed
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
    y: ROOM.groundY,
    world: "line",
    placed: null,
    path: [],
    toBed: false,
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
  if (view.world === "home") return startEatingHome(view, food);
  // The food (8 pixels across) goes on the side it is facing, unless the wall or the bed is in the way there.
  const rightOk = view.x + view.size + 8 <= ROOM.bedLeft;
  const leftOk = view.x - 8 >= 0;
  if (view.facing === 1 && !rightOk) view.facing = -1;
  else if (view.facing === -1 && !leftOk) view.facing = 1;
  setPose(view, "eat");
  const x = Math.round(view.x); // whole pixels, like the creature, so the food lines up with it
  view.snack = { food, x: x + (view.facing === 1 ? view.size : -8), y: ROOM.groundY - 8 };
}

// In the home the creature first stops on the tile it is at, and the food goes on the free tile beside it (foodTile): the side it faces, the other side, the tile below,
// or the tile it stands on when nothing is free. On a side the food is put right against the picture, as in the one-line room; below, it is put in the middle of the tile.
function startEatingHome(view: View, food: FoodId): void {
  const f = footprintOf(view.size);
  const here = anchorOf(view.x, view.y, view.size);
  const at = anchorPos(here, view.size);
  view.x = at.x;
  view.y = at.y;
  view.path = [];
  const { tile, own } = foodTile(here, f, view.facing);
  if (!own && tile.row === here.row) view.facing = tile.col < here.col ? -1 : 1;
  setPose(view, "eat");
  const x = Math.round(view.x);
  if (!own && tile.row !== here.row) {
    view.snack = { food, x: here.col * TILE + (f * TILE - 8) / 2, y: (tile.row + 1) * TILE - 8 }; // (the tile below, which may be the only free one: not on a wall or a counter)
    return;
  }
  view.snack = { food, x: x + (view.facing === 1 ? view.size : -8), y: view.y - 8 };
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
  addEffect(view, "heart", view.x + view.size / 4, view.y - view.size - 2);
}

// Sparkles at random spots over a standing creature's body.
export function addSparkles(view: View, count: number, rand: () => number = Math.random): void {
  for (let i = 0; i < count; i++) {
    addEffect(view, "sparkle", view.x + 2 + rand() * (view.size - 4), view.y - view.size + 2 + rand() * (view.size * 0.6));
  }
}

// Which of the two standing drawings to show: they swap every half second while it stands, hops or
// is happy, and every quarter second while it walks (a step each). Every other pose uses the first.
export function frameOf(view: View): 0 | 1 {
  const period = view.pose === "walk" ? 0.25 : view.pose === "idle" || view.pose === "hop" || view.pose === "happy" ? 0.5 : 0;
  return period > 0 && Math.floor(view.clock / period) % 2 === 1 ? 1 : 0;
}

// Move the view forward by dt seconds. "rand" gives numbers from 0 up to 1.
export function updateView(view: View, dt: number, mood: Mood, rand: () => number, size: number = view.size, world: World = view.world): void {
  view.size = size;
  view.world = world;
  if (view.placed !== world) enterWorld(view);
  view.clock += dt;
  view.poseTime += dt;
  view.mood = mood;
  if (view.clock >= view.nextBlink + BLINK.length) view.nextBlink = view.clock + BLINK.gapMin + rand() * (BLINK.gapMax - BLINK.gapMin);
  view.effects = view.effects.filter((fx) => (fx.age += dt) < fx.life);
  if (mood.dead && view.pose === "eat") setPose(view, "idle", 2); // a meal stops if it dies halfway
  if (view.pose !== "eat") view.snack = null;

  if (mood.asleep) {
    if (world === "home") sleepHome(view, dt);
    else goToBed(view, dt);
    return;
  }
  if (view.pose === "sleep") {
    setPose(view, "idle", 1);
    if (world === "home") wakeHome(view);
  }
  if (view.toBed) {
    // Woken (the lights were put back on) before it got to the bed: the walk is called off, and the next nap starts a new one from wherever it stands.
    view.toBed = false;
    view.path = [];
    if (view.pose === "walk") setPose(view, "idle", 1);
  }

  const speed = mood.sad || mood.sick ? 8 : 14; // pixels per second
  switch (view.pose) {
    case "walk": {
      if (world === "home") {
        if (followPath(view, speed * dt)) setPose(view, "idle", 1 + rand() * 2);
        break;
      }
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
  if (world === "line") view.x = Math.min(walkMaxX(view.size), Math.max(ROOM.walkMinX, view.x));
}

// The creature is put somewhere valid in the world it is now in: the one-line room (on the ground line, inside the walking area) or the home (on its starting tile).
function enterWorld(view: View): void {
  view.placed = view.world;
  view.path = [];
  view.toBed = false;
  view.effects = []; // (a heart or a sparkle is a place in the old world: it would float at the same numbers in the new one)
  if (view.pose === "walk") setPose(view, "idle", 1);
  if (view.world === "home") {
    const at = anchorPos(startAnchor(view.size), view.size);
    view.x = at.x;
    view.y = at.y;
  } else {
    view.y = ROOM.groundY;
    view.x = Math.min(walkMaxX(view.size), Math.max(ROOM.walkMinX, view.x));
    view.targetX = view.x;
  }
}

// The home: walk along view.path, `step` pixels. Returns true when the walk is over. A walk starts from a spot that may be part way between two tiles, so the
// first stretch can be a short diagonal.
function followPath(view: View, step: number): boolean {
  let left = step;
  while (left > 0) {
    const to = view.path[0];
    if (!to) return true;
    const dx = to.x - view.x;
    const dy = to.y - view.y;
    const d = Math.hypot(dx, dy);
    if (dx !== 0) view.facing = dx > 0 ? 1 : -1;
    if (d <= left) {
      view.x = to.x;
      view.y = to.y;
      view.path.shift();
      left -= d;
    } else {
      view.x += (dx / d) * left;
      view.y += (dy / d) * left;
      left = 0;
    }
  }
  return view.path.length === 0;
}

// The tile a walking creature is on or on its way to: where a new walk is worked out from, so it never turns round in the middle of a step.
function walkStart(view: View): { from: Anchor; first: Array<{ x: number; y: number }> } {
  const next = view.path[0];
  if (view.pose === "walk" && next) return { from: anchorOf(next.x, next.y, view.size), first: [next] };
  return { from: anchorOf(view.x, view.y, view.size), first: [] };
}

function walkTo(view: View, first: Array<{ x: number; y: number }>, steps: Anchor[]): void {
  view.path = [...first, ...steps.map((a) => anchorPos(a, view.size))];
}

// Asleep in the home: walk to the front of the bed, then lie down (the picture is then drawn on the bed, scene.ts).
function sleepHome(view: View, dt: number): void {
  if (view.pose === "sleep") return;
  if (!view.toBed) {
    const { from, first } = walkStart(view);
    walkTo(view, first, findPath(from, bedFront(view.size), footprintOf(view.size)) ?? []);
    view.toBed = true;
  }
  view.pose = "walk";
  if (followPath(view, 20 * dt)) {
    const at = anchorPos(bedFront(view.size), view.size);
    view.x = at.x;
    view.y = at.y;
    setPose(view, "sleep");
  }
}

// It wakes up in front of the bed.
function wakeHome(view: View): void {
  const at = anchorPos(bedFront(view.size), view.size);
  view.x = at.x;
  view.y = at.y;
  view.path = [];
  view.toBed = false;
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
  if (view.world === "home") {
    const from = anchorOf(view.x, view.y, view.size);
    const steps = wanderPath(from, footprintOf(view.size), rand);
    if (steps.length === 0) return setPose(view, "idle", 2 + rand() * 3);
    walkTo(view, [], steps);
    return setPose(view, "walk");
  }
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
