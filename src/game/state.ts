// The save shape: everything the game remembers. It is plain data (no functions),
// so it can be stored as JSON in IndexedDB and, in Phase 5, sent to the cloud.

import { lineageOf } from "../data/book";
import { eggPatterns } from "../data/eggs";
import type { MaterialId, SpotId } from "../data/habitat";
import { coerceHome } from "../data/home";
import type { HomeSave } from "../data/home";
import { isItemId, isWallId } from "../data/shop";
import { tuning } from "../data/tuning";
import { freshBoard, migrateBoard } from "./board";
import type { Board } from "./board";
import { makeRng } from "./rng";
import type { CombatStat, EggPattern, FieldId, FoodId, Place } from "./types";

export type Phase = "egg" | "alive" | "dead";
export type CallKind = "sick" | "hungry" | "dirty" | "sad" | "sleepy";

export interface Stats {
  hunger: number;
  happiness: number;
  energy: number;
  hygiene: number;
  wellness: number; // low wellness means sickness (not the same as battle HP)
  discipline: number; // nothing raises it yet and nothing lowers it; only combat reads it (the chance of sulking). A newborn starts at 30
}

// Counters for the current stage. They reset at each evolution and decide the next form (game/growth.ts):
// field minutes pick the kid, servings pick the young, and cells and care mistakes pick the adult.
export interface Counters {
  fieldMinutes: Partial<Record<FieldId, number>>; // awake minutes spent in each field (the baby stage)
  servings: Partial<Record<FoodId, number>>; // meals eaten, by food (the kid stage)
  hungerCells: number; // feedings that filled the creature up, at most tuning.growth.careCellsMax (the young stage)
  happyCells: number; // times happiness reached 100, at most the same (the young stage)
  careMistakes: number; // calls left unanswered too long
  mistakeLog?: Array<{ at: number; call: CallKind }>; // when and which call, for the last few of them (tuning.calls.mistakeLogMax), newest last; the Care Log
  neglectMinutes?: number; // awake minutes since the last care (baby and kid stages); at tuning.growth.neglectHours it turns into the special
  chores?: number; // jobs finished in this stage
  battles?: number; // fights fought in this stage, won or lost
  wins?: number; // fights won in this stage
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
  eggPattern: EggPattern; // the egg it hatched from: it names the field a baby grows toward if never taken to one
  place: Place; // at home, or in one of the fields (the picture behind it, and where a baby's field minutes count)
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
  hp?: number; // battle HP right now; missing means full (it recovers by resting, see game/combat/recovery.ts)
  trained?: Partial<Record<CombatStat, number>>; // points won in fights, on top of the form's base stats
  rung?: number; // the next rung of the opponent ladder to fight (1 when missing); starts again at each evolution
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

// A creature that was retired as a completed life: what it was, when it hatched and when it retired (game time). Kept in `Save.retired`.
export interface RetiredLife {
  formId: string;
  bornAt: number;
  retiredAt: number;
}

// The one purchase that can still be undone (game/shop.ts): what, when (game time), and the wall shown before it.
export interface LastBuy {
  item: string;
  at: number;
  wall: string | null;
}

export interface Save {
  version: 3;
  phase: Phase;
  egg: Egg | null;
  creature: Creature | null; // kept after death, so the last form can still be shown
  death: { at: number; cause: "hunger" | "sickness" | "neglect" } | null;
  lastSimulatedAt: number; // game time the simulation has reached
  clockOffsetMs: number; // dev mode shifts game time forward with this
  rngState: number;
  settings: { sleepStartHour: number; sleepEndHour: number; adultMode?: boolean }; // adultMode: show the numbers (ui/AdultHud.tsx); only `true` turns it on
  log: LogEntry[]; // event log for dev mode, newest last
  coins: number;
  inventory: Partial<Record<MaterialId, number>>; // materials gathered so far
  hauls: Haul[]; // finished jobs the player has not looked at yet, oldest first
  book: string[]; // the Creature Book: ids of the forms the player has raised, in the order they were first met (game/book.ts)
  retired: RetiredLife[]; // completed lives, oldest first (game/retire.ts); no cap, a record is 73 characters
  owned: string[]; // what the player bought in the shop (data/shop.ts ids), in the order bought, no duplicates (game/shop.ts)
  wall: string | null; // the wallpaper shown in the room: an owned wallpaper, or null for the plain wall
  lastBuy: LastBuy | null; // the purchase that can still be undone, for `tuning.shop.undoSeconds`
  board: Board; // the request board (game/requests.ts): up to 3 requests and the slots of the finished ones; empty until Adult Mode has dealt it
  home?: HomeSave; // where the player put the furniture (data/home.ts); missing means the starter layout. A change replaces this object, never edits it
}

export function freshCounters(): Counters {
  return {
    fieldMinutes: {},
    servings: {},
    hungerCells: 0,
    happyCells: 0,
    careMistakes: 0,
    neglectMinutes: 0,
    chores: 0,
    battles: 0,
    wins: 0,
  };
}

export function newEgg(nowMs: number, pattern?: EggPattern): Egg {
  return { pattern: pattern ?? eggPatterns[0]!, startedAt: nowMs, shavedMinutes: 0 };
}

// A brand new game: one egg, waiting to hatch.
export function newSave(nowMs: number, seed: number): Save {
  const rng = makeRng(seed);
  const save: Save = {
    version: 3,
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
    book: [],
    retired: [],
    owned: [],
    wall: null,
    lastBuy: null,
    board: freshBoard(),
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
    v.version === 3 &&
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

function isRetiredLife(value: unknown): value is RetiredLife {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Partial<RetiredLife>;
  return typeof v.formId === "string" && typeof v.bornAt === "number" && Number.isFinite(v.bornAt) && typeof v.retiredAt === "number" && Number.isFinite(v.retiredAt);
}

function isLastBuy(value: unknown): value is LastBuy {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Partial<LastBuy>;
  return isItemId(v.item) && typeof v.at === "number" && Number.isFinite(v.at) && (v.wall === null || isWallId(v.wall));
}

// Turn data read from storage into a current save, or null if it is not one. Only version 3 is read: the Paradise growth
// rules replaced every old form, so an older save has no creature that could carry on (the owner chose a clean start, and the
// loader keeps an unreadable save under another name, see sync/local.ts).
export function migrateSave(value: unknown): Save | null {
  if (!isSave(value)) return null;
  // A save from before the Creature Book has no `book` (the version stays 3: the field is added here). It starts with the forms the living
  // creature must have been through to be what it is.
  if (!Array.isArray(value.book)) value.book = value.creature ? lineageOf(value.creature.formId) : [];
  // A save from before Retire has no `retired`. Only records of the right shape are kept (a bad one from storage or the cloud must not
  // break the Book), a record never runs backwards (its end is moved up to its start, as the action does when a clock was set back), and this
  // runs for every profile at the picker, so it must never throw.
  value.retired = Array.isArray(value.retired) ? value.retired.filter(isRetiredLife).map(({ formId, bornAt, retiredAt }) => ({ formId, bornAt, retiredAt: Math.max(retiredAt, bornAt) })) : [];
  // A save from before the shop has none of the three. Only ids the shop sells are kept (a bad one from storage or the cloud, or an item a newer
  // version added, is dropped), none twice; the wall must be an owned wallpaper; the undo must name something owned.
  value.owned = Array.isArray(value.owned) ? [...new Set(value.owned.filter(isItemId))] : [];
  value.wall = isWallId(value.wall) && value.owned.includes(value.wall) ? value.wall : null;
  value.lastBuy =
    isLastBuy(value.lastBuy) && value.owned.includes(value.lastBuy.item)
      ? {
          item: value.lastBuy.item,
          at: value.lastBuy.at,
          wall: value.lastBuy.wall !== null && value.owned.includes(value.lastBuy.wall) ? value.lastBuy.wall : null,
        }
      : null;
  // A save from before the request board has none. A bad entry is dropped and the slots are capped (game/board.ts); it must never throw.
  value.board = migrateBoard(value.board);
  // A save from before Decorate mode has no `home`. Only a well-formed one is kept (a bad one from storage or the cloud means the starter layout; whether the pieces are in
  // allowed places is `layoutOf`'s rule, art/homeLayout.ts), and this must never throw.
  const home = coerceHome(value.home);
  if (home) value.home = home;
  else delete value.home;
  return value;
}
