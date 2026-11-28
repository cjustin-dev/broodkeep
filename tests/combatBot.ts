// The stand-in player for timed combat (docs/adult-a4-plan.md section 10.5): plays whole fights through the game's own startFight and playRound, with a quality
// of play. Used by tools/verify/combat-bands.ts to set the Adult ladder and by the tests that need a fight played to its end. Not a model of any real person.
//
//  - passive: the spec's player: presses Attack, Guard, Special in turn, never taps the pad (every grade Normal), ignores the foe's shown move.
//  - good, perfect: tap the pad with an offset drawn from a normal distribution around the target (spread 110 ms and 40 ms), graded by gradeTap, and answer the
//    foe's shown move with one rule that reads only what the screen shows.
import { land } from "../src/data/forms/land";
import { sky } from "../src/data/forms/sky";
import { water } from "../src/data/forms/water";
import { startFight } from "../src/game/actions";
import { foeChoice, playRound } from "../src/game/combat/battle";
import type { Battle, BattleAction } from "../src/game/combat/battle";
import { gradeTap } from "../src/game/combat/timing";
import type { Timing } from "../src/game/combat/timing";
import { setRung } from "../src/game/dev";
import { makeRng } from "../src/game/rng";
import type { Rng } from "../src/game/rng";
import type { Save } from "../src/game/state";
import { aliveSave, at } from "./helpers";

export type Quality = "passive" | "good" | "perfect";
export const QUALITIES: Quality[] = ["passive", "good", "perfect"];
// The spread (standard deviation, ms) of where the stand-in's tap lands around the target; null: it never taps.
export const SPREAD: Record<Quality, number | null> = { passive: null, good: 110, perfect: 40 };
// The first adult form of each field, by name of the field's list: the creatures the matrix is played with.
export const ADULTS: string[] = [land, water, sky].map((list) => list.find((f) => f.stage === "adult")!.id);

const NOW = at(10);

// One normal number with mean 0 and spread 1 (Box-Muller from two uniform ones).
function gauss(rng: Rng): number {
  const u = 1 - rng.next();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng.next());
}

// A saved game with this creature, `trained` points in each of the five stats, the given discipline, at `rung`, in Adult Mode (timed fights) or not (the old rules).
export function cellSave(formId: string, trained: number, rung: number, adult: boolean, discipline = 70): Save {
  const save = aliveSave(formId, NOW, 1);
  const c = save.creature!;
  c.trained = { vit: trained, str: trained, def: trained, spi: trained, spd: trained };
  c.stats.discipline = discipline;
  save.settings.adultMode = adult;
  setRung(save, rung);
  return save;
}

// What the screen shows the player when it chooses: its own HP and meter and the foe's next move.
export function choose(quality: Quality, b: Battle): BattleAction {
  if (quality === "passive") return (["attack", "guard", "special"] as const)[b.round % 3]!;
  if (b.me.meter >= 3) return "special";
  if (b.foeNext === "special" || (b.foeNext === "attack" && b.me.hp < b.me.maxHp * 0.5)) return "guard";
  return "attack";
}

// Play the fight the save starts at its rung with this seed, to its end. "won" or "lost" (and the rounds it took).
export function playFight(save: Save, seed: number, quality: Quality): { result: "won" | "lost"; rounds: number } {
  save.rngState = seed;
  save.creature!.stats.energy = 100;
  delete save.creature!.hp;
  const started = startFight(save, NOW);
  if (started.status !== "started") throw new Error(`the fight did not start: ${started.status}`);
  const b = started.battle;
  const rng = makeRng(seed * 7919 + 13);
  const spread = SPREAD[quality];
  for (let i = 0; i < 400 && !b.over; i++) {
    const grade: Timing = spread === null ? "normal" : gradeTap(gauss(rng) * spread);
    playRound(b, choose(quality, b), foeChoice, grade);
  }
  if (!b.over) throw new Error("a fight went past 400 rounds");
  return { result: b.over, rounds: b.round };
}

// How many of `fights` fights (battle seeds 1 up to `fights`) are won.
export function wins(formId: string, trained: number, rung: number, quality: Quality, fights: number, adult = true, discipline = 70): number {
  const save = cellSave(formId, trained, rung, adult, discipline);
  let won = 0;
  for (let seed = 1; seed <= fights; seed++) if (playFight(save, seed, quality).result === "won") won++;
  return won;
}
