// The save shape: everything the game remembers. It is plain data (no functions),
// so it can be stored as JSON in IndexedDB and, in Phase 5, sent to the cloud.

import { eggPatterns } from "../data/eggs";
import { tuning } from "../data/tuning";
import { makeRng } from "./rng";
import type { EggPattern, FoodId } from "./types";

export type Phase = "egg" | "alive" | "dead";
export type CallKind = "sick" | "hungry" | "dirty" | "sad" | "sleepy";

export interface Stats {
  hunger: number;
  happiness: number;
  energy: number;
  hygiene: number;
  wellness: number; // low wellness means sickness (not the same as battle HP)
  discipline: number; // not used by any rule yet (Phase 3 combat)
}

// Counters for the current stage. They reset at each evolution and decide the next form.
// Phase 1 data only needs careMistakes. foodEaten and neglectMinutes are collected now
// because the Phase 2 evolution tree reads them, and past play cannot be recounted later.
export interface Counters {
  careMistakes: number;
  foodEaten: Record<FoodId, number>;
  neglectMinutes: number;
  happinessSum: number; // add the happiness of every awake minute...
  happinessMinutes: number; // ...and count the minutes, to get the average
}

export interface Creature {
  formId: string;
  bornAt: number;
  stageStartedAt: number;
  stats: Stats;
  sleep: null | "night" | "nap";
  sick: boolean;
  poop: number;
  digestQueue: number[]; // minutes left until each meal turns into poop
  call: CallKind | null; // what the creature is asking for right now
  callMinutes: number; // awake minutes the current call has gone unanswered
  wellnessZeroMinutes: number;
  recentCandy: number[]; // times candy was eaten lately
  affection: { windowStart: number; gained: number };
  counters: Counters;
}

export interface Egg {
  pattern: EggPattern;
  startedAt: number;
  shavedMinutes: number; // time saved by tapping
}

export interface LogEntry {
  at: number;
  text: string;
}

export interface Save {
  version: 1;
  phase: Phase;
  egg: Egg | null;
  creature: Creature | null; // kept after death, so the last form can still be shown
  death: { at: number; cause: "hunger" | "sickness" | "neglect" } | null;
  lastSimulatedAt: number; // game time the simulation has reached
  clockOffsetMs: number; // dev mode shifts game time forward with this
  rngState: number;
  settings: { sleepStartHour: number; sleepEndHour: number };
  log: LogEntry[]; // event log for dev mode, newest last
}

export function freshCounters(): Counters {
  return {
    careMistakes: 0,
    foodEaten: { berry: 0, meat: 0, fish: 0, candy: 0 },
    neglectMinutes: 0,
    happinessSum: 0,
    happinessMinutes: 0,
  };
}

export function newEgg(nowMs: number, pattern?: EggPattern): Egg {
  return { pattern: pattern ?? eggPatterns[0]!, startedAt: nowMs, shavedMinutes: 0 };
}

// A brand new game: one egg, waiting to hatch.
export function newSave(nowMs: number, seed: number): Save {
  const rng = makeRng(seed);
  const save: Save = {
    version: 1,
    phase: "egg",
    egg: newEgg(nowMs, rng.pick(eggPatterns)),
    creature: null,
    death: null,
    lastSimulatedAt: nowMs,
    clockOffsetMs: 0,
    rngState: rng.state(),
    settings: { sleepStartHour: tuning.sleepDefaults.startHour, sleepEndHour: tuning.sleepDefaults.endHour },
    log: [],
  };
  logEvent(save, nowMs, "A new egg appeared");
  return save;
}

export function logEvent(save: Save, at: number, text: string): void {
  save.log.push({ at, text });
  if (save.log.length > tuning.logMax) save.log.splice(0, save.log.length - tuning.logMax);
}

export function clamp(value: number, min = 0, max = 100): number {
  return Math.min(max, Math.max(min, value));
}

// Quick check that data loaded from storage looks like a save we understand.
export function isSave(value: unknown): value is Save {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Partial<Save>;
  return (
    v.version === 1 &&
    (v.phase === "egg" || v.phase === "alive" || v.phase === "dead") &&
    typeof v.lastSimulatedAt === "number" &&
    typeof v.rngState === "number" &&
    Array.isArray(v.log)
  );
}
