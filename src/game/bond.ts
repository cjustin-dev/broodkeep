// Bond: what petting builds (docs/adult-a3-plan.md section 4). Adult Mode only. A creature has XP, earns it from pets and tickles, and the XP gives a level from 1 to 10 that never goes down.
// This file is the rules and nothing else: `touch` (actions.ts) calls `earnBond`, the screen reads `bondInfo`, and `migrateSave` (state.ts) calls `coerceBond`.

import { tuning } from "../data/tuning";
import type { Bond, Creature, Save } from "./state";

const b = tuning.bond;
const LAST_LEVEL = b.levelAt.length;
const XP_MAX = b.levelAt[LAST_LEVEL - 1] as number;

// The same rule as `isAdultMode` in hud.ts, which this file cannot import (hud.ts reaches the combat code, and requests.ts says the same); tests/bond.test.ts checks that the two agree.
export const isAdultSave = (save: Save): boolean => save.settings.adultMode === true;

// The level (1 to 10) that an amount of XP reaches.
export function levelOf(xp: number): number {
  let level = 1;
  for (let n = 1; n < LAST_LEVEL; n++) if (xp >= (b.levelAt[n] as number)) level = n + 1;
  return level;
}

// Where an amount of XP stands: the level, the XP earned inside it, the XP that level takes (0 at the last level) and the next level (null at the last).
export interface BondInfo {
  level: number;
  into: number;
  span: number;
  next: number | null;
}
export function bondInfo(xp: number): BondInfo {
  const level = levelOf(xp);
  const from = b.levelAt[level - 1] as number;
  if (level === LAST_LEVEL) return { level, into: xp - from, span: 0, next: null };
  return { level, into: xp - from, span: (b.levelAt[level] as number) - from, next: level + 1 };
}

// What a level gives that the game really has (decision 3 of the plan: the screen names only these). Each later slice adds its own.
// Level 2: a creature in a good mood now and then bounces for joy on its own (art/idle.ts). Level 5: a pet shows a bigger burst (ui/Stage.tsx). Both are Adult Mode only.
export const FOND_LEVEL = 2;
export const BIG_BURST_LEVEL = 5;
const unlocks: Record<number, string> = {
  [FOND_LEVEL]: "a happy bounce of its own now and then",
  [BIG_BURST_LEVEL]: "a bigger burst when petted",
};
export const unlockAt = (level: number): string | null => unlocks[level] ?? null;
// The next level above `level` that unlocks something, with what it unlocks; null when there is none.
export function nextUnlock(level: number): { level: number; text: string } | null {
  for (let n = level + 1; n <= LAST_LEVEL; n++) {
    const text = unlockAt(n);
    if (text) return { level: n, text };
  }
  return null;
}

// What a creature's Bond is now (level 1 with nothing earned when it has none).
export const bondOf = (c: Creature): Bond => c.bond ?? { xp: 0, chain: 0, at: 0 };
export const bondLevel = (c: Creature): number => levelOf(bondOf(c).xp);
// The living creature has reached `level` in Adult Mode. Kid Mode never has it, whatever `bond` data the save carries.
export const bondAtLeast = (save: Save, level: number): boolean => save.phase === "alive" && save.creature !== null && isAdultSave(save) && bondLevel(save.creature) >= level;

// A pet or a tickle earns XP. A pet goes on the chain when it comes 0 to `chainGapMs` after the last one (a clock that went back restarts it) and is worth more from the `streakFrom`th;
// a tickle is a fixed amount and leaves the chain alone. Returns the level just reached, or null when there is no new level.
export function earnBond(c: Creature, kind: "pet" | "tickle", now: number): number | null {
  const before = bondOf(c);
  let chain = before.chain;
  let at = before.at;
  let gain: number = b.xpTickle;
  if (kind === "pet") {
    const gap = now - before.at;
    chain = before.chain > 0 && gap >= 0 && gap <= b.chainGapMs ? Math.min(b.streakFrom, before.chain + 1) : 1;
    at = now;
    gain = chain >= b.streakFrom ? b.xpPetStreak : b.xpPet;
  }
  c.bond = { xp: before.xp, chain, at };
  return addBondXp(c, gain);
}

// Add XP to a creature's Bond (never past the cap), leaving the pet chain and the last pet time as they are. Returns the level just reached, or null when there is no new level.
// A pet or a tickle goes through here (`earnBond`), and so does a training session (game/training.ts).
export function addBondXp(c: Creature, amount: number): number | null {
  const before = bondOf(c);
  const xp = Math.min(XP_MAX, before.xp + amount);
  c.bond = { xp, chain: before.chain, at: before.at };
  const after = levelOf(xp);
  return after > levelOf(before.xp) ? after : null;
}

// The happiness a pet or a tickle gives under the taper: the full amount while the window's gained points are under `full`, half while under `half`, a quarter after.
export function taper(want: number, gainedInWindow: number): number {
  const t = b.taper;
  const factor = gainedInWindow < t.full ? 1 : gainedInWindow < t.half ? t.halfFactor : t.quarterFactor;
  return want * factor;
}

// A Bond read from storage or the cloud: the three numbers when each is of the right kind, otherwise nothing at all (never half of it). Other keys are ignored, so a later version
// that adds one does not make this one throw away the XP.
export function coerceBond(value: unknown): Bond | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  const v = value as Record<string, unknown>;
  const { xp, chain, at } = v;
  if (!Object.hasOwn(v, "xp") || !Object.hasOwn(v, "chain") || !Object.hasOwn(v, "at")) return undefined;
  if (typeof xp !== "number" || !Number.isInteger(xp) || xp < 0 || xp > XP_MAX) return undefined;
  if (typeof chain !== "number" || !Number.isInteger(chain) || chain < 0 || chain > b.streakFrom) return undefined;
  if (typeof at !== "number" || !Number.isFinite(at) || at < 0) return undefined;
  return { xp, chain, at };
}
