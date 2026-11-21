// Idle life: how the creature moves around the room when nobody is touching it.
// This is only for looks. It is never saved and does not change any stat.
// Reactions (hop for joy, shake for "no") are started by calling triggerPose.

import { ROOM } from "./layout";

export type Pose = "idle" | "walk" | "hop" | "happy" | "startle" | "refuse" | "eat" | "sleep";

export interface Effect {
  kind: "heart" | "sparkle";
  x: number;
  y: number;
  age: number; // seconds so far
  life: number; // seconds it lasts
}

export interface View {
  x: number; // left edge of the sprite
  facing: 1 | -1; // 1 = looking right
  pose: Pose;
  poseTime: number; // seconds spent in this pose
  poseLength: number; // seconds this pose lasts (idle and timed poses)
  targetX: number; // where a walk is heading
  clock: number; // seconds since the screen opened, for bobbing
  effects: Effect[];
}

export interface Mood {
  asleep: boolean;
  sad: boolean;
  sick: boolean;
}

// How long each timed reaction lasts, in seconds.
const poseLengths: Partial<Record<Pose, number>> = { hop: 0.5, happy: 0.8, startle: 0.4, refuse: 0.6, eat: 0.9 };

export function createView(): View {
  return { x: ROOM.eggX, facing: 1, pose: "idle", poseTime: 0, poseLength: 2, targetX: ROOM.eggX, clock: 0, effects: [] };
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

export function addEffect(view: View, kind: Effect["kind"], x: number, y: number): void {
  view.effects.push({ kind, x, y, age: 0, life: 1.1 });
}

// Move the view forward by dt seconds. "rand" gives numbers from 0 up to 1.
export function updateView(view: View, dt: number, mood: Mood, rand: () => number): void {
  view.clock += dt;
  view.poseTime += dt;
  view.effects = view.effects.filter((fx) => (fx.age += dt) < fx.life);

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
      if (view.poseTime >= view.poseLength) setPose(view, "idle", 1 + rand() * 2);
  }
  view.x = Math.min(ROOM.walkMaxX, Math.max(ROOM.walkMinX, view.x));
}

function chooseNext(view: View, mood: Mood, rand: () => number): void {
  const roll = rand();
  if (mood.sick || mood.sad) {
    // Low spirits: mostly sits still, wanders rarely, never hops around.
    if (roll < 0.25) startWalk(view, rand);
    else setPose(view, "idle", 2 + rand() * 3);
    return;
  }
  if (roll < 0.45) startWalk(view, rand);
  else if (roll < 0.7) setPose(view, "hop");
  else if (roll < 0.85) {
    view.facing = view.facing === 1 ? -1 : 1;
    setPose(view, "idle", 1 + rand() * 2);
  } else setPose(view, "idle", 1 + rand() * 2);
}

function startWalk(view: View, rand: () => number): void {
  view.targetX = Math.round(ROOM.walkMinX + rand() * (ROOM.walkMaxX - ROOM.walkMinX));
  setPose(view, "walk");
}

function goToBed(view: View, dt: number): void {
  const dx = ROOM.bedX - view.x;
  const step = 20 * dt;
  if (Math.abs(dx) <= step) {
    view.x = ROOM.bedX;
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
    case "refuse":
      return { dx: Math.round(2 * Math.sin(t * 40)), dy: 0, squash: 0 };
    case "eat":
      return { dx: 0, dy: 0, squash: Math.sin(t * 14) > 0 ? 1 : 0 };
    case "walk":
      return { dx: 0, dy: -(Math.floor(view.clock * 8) % 2), squash: 0 }; // little step-bounce
    case "sleep":
      return { dx: 0, dy: 0, squash: 2 };
    default:
      return { dx: 0, dy: 0, squash: Math.sin(view.clock * 3) > 0.4 ? 1 : 0 }; // gentle breathing
  }
}
