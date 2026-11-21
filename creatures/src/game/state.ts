// The save shape: everything the game remembers. It is plain data (no functions),
// so it can be stored as JSON in IndexedDB and, in Phase 5, sent to the cloud.

import { eggPatterns } from "../data/eggs";
import type { MaterialId, SpotId } from "../data/habitat";
import { tuning } from "../data/tuning";
import { makeRng } from "./rng";
import type { LaterMetric } from "./metrics";
import type { EggPattern, FoodId } from "./types";

export type Phase = "egg" | "alive" | "dead";
export type CallKind = "sick" | "hungry" | "dirty" | "sad" | "sleepy";

export interface Stats {
  hunger: number;
  happiness: number;
  energy: number;
  hygiene: number;
  wellness: number; // low wellness means sickness (not the same as battle HP)
  discipline: number; // nothing raises it yet; only the evolution rules read it (Phase 3 combat will use it)
}

// Counters for the current stage. They reset at each evolution and decide the next form.
// `later` holds the numbers of systems that do not exist yet (training, battles, jobs, trained
// stats). Nothing but dev mode writes to it. It is optional so saves made before Phase 2 still load.
export interface Counters {
  careMistakes: number;
  foodEaten: Record<FoodId, number>;
  neglectMinutes: number;
  happinessSum: number; // add the happiness of every awake minute...
  happinessMinutes: number; // ...and count the minutes, to get the average
  later?: Partial<Record<LaterMetric, number>>;
  chores?: number; // jobs finished in this stage (optional so older saves still load)
}

// A creature out working at a habitat spot. It is back when game time reaches endsAt.
export interface Job {
  spot: SpotId;
  startedAt: number;
  endsAt: number;
}

// What a finished job brought home. Kept until the player has seen it.
export interface Haul {
  spot: SpotId;
  at: number;
  coins: number;
  material: MaterialId;
  amount: number;
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
  job?: Job | null; // set while the creature is away working (optional so older saves still load)
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
  version: 2;
  phase: Phase;
  egg: Egg | null;
  creature: Creature | null; // kept after death, so the last form can still be shown
  death: { at: number; cause: "hunger" | "sickness" | "neglect" } | null;
  lastSimulatedAt: number; // game time the simulation has reached
  clockOffsetMs: number; // dev mode shifts game time forward with this
  rngState: number;
  settings: { sleepStartHour: number; sleepEndHour: number };
  log: LogEntry[]; // event log for dev mode, newest last
  coins: number;
  inventory: Partial<Record<MaterialId, number>>; // materials gathered so far
  hauls: Haul[]; // finished jobs the player has not looked at yet, oldest first
}

export function freshCounters(): Counters {
  return {
    careMistakes: 0,
    foodEaten: { berry: 0, meat: 0, fish: 0, candy: 0 },
    neglectMinutes: 0,
    happinessSum: 0,
    happinessMinutes: 0,
    chores: 0,
  };
}

export function newEgg(nowMs: number, pattern?: EggPattern): Egg {
  return { pattern: pattern ?? eggPatterns[0]!, startedAt: nowMs, shavedMinutes: 0 };
}

// A brand new game: one egg, waiting to hatch.
export function newSave(nowMs: number, seed: number): Save {
  const rng = makeRng(seed);
  const save: Save = {
    version: 2,
    phase: "egg",
    egg: newEgg(nowMs, rng.pick(eggPatterns)),
    creature: null,
    death: null,
    lastSimulatedAt: nowMs,
    clockOffsetMs: 0,
    rngState: rng.state(),
    settings: { sleepStartHour: tuning.sleepDefaults.startHour, sleepEndHour: tuning.sleepDefaults.endHour },
    log: [],
    coins: 0,
    inventory: {},
    hauls: [],
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
    v.version === 2 &&
    (v.phase === "egg" || v.phase === "alive" || v.phase === "dead") &&
    typeof v.lastSimulatedAt === "number" &&
    typeof v.rngState === "number" &&
    Array.isArray(v.log) &&
    typeof v.coins === "number" &&
    typeof v.inventory === "object" &&
    v.inventory !== null &&
    Array.isArray(v.hauls)
  );
}

// Turn data read from storage into a current save, or null if it is not one. A version 1 save
// (made before the habitat) gets an empty purse, an empty bag and no finished jobs.
export function migrateSave(value: unknown): Save | null {
  if (typeof value === "object" && value !== null && (value as { version?: unknown }).version === 1) {
    const old = value as Record<string, unknown>;
    value = { ...old, version: 2, coins: 0, inventory: {}, hauls: [] };
  }
  return isSave(value) ? value : null;
}
