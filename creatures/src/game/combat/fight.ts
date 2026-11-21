// A fight against a wild creature, joined to the save: who may fight, who they meet, and what a fight changes.
// These functions work on a save that is already caught up to "now" (actions.ts does that first).

import { combatTuning } from "../../data/combat";
import { forms, getForm } from "../../data/forms";
import { spotIds, spots } from "../../data/habitat";
import type { MaterialId } from "../../data/habitat";
import { makeRng } from "../rng";
import { logEvent } from "../state";
import type { Creature, Save } from "../state";
import { stageOrder } from "../types";
import type { CombatStat, Stage } from "../types";
import { newBattle, newFighter, sulkChance } from "./battle";
import type { Battle, BattleAction } from "./battle";
import { addTrained, currentHp, maxHp, statTotal } from "./stats";

export type FightRefusal = "busy" | "asleep" | "sick" | "too-young" | "tired";

// Why this creature cannot fight right now, or null if it can. "busy" means it is away working.
export function fightRefusal(c: Creature): FightRefusal | null {
  if (c.job) return "busy";
  if (c.sleep) return "asleep";
  if (c.sick) return "sick";
  if (stageOrder.indexOf(getForm(c.formId).stage) < stageOrder.indexOf(combatTuning.minStage)) return "too-young";
  if (c.stats.energy - combatTuning.energyCost < combatTuning.energyFloor) return "tired";
  return null;
}

const STATS: CombatStat[] = ["vit", "str", "def", "spi", "spd"];

// The rung the creature fights next (1 when it has not fought yet, or just beat the boss).
export const rungOf = (c: Creature): number => Math.min(combatTuning.ladder.length, Math.max(1, c.rung ?? 1));
export const isBossRung = (rung: number): boolean => rung === combatTuning.ladder.length;

// Send the creature into a fight. The caller has already checked fightRefusal. The energy is spent now, so walking
// away from the fight costs that much and nothing else (the fight itself is never saved).
export function beginFight(save: Save, c: Creature, nowMs: number): Battle {
  const rng = makeRng(save.rngState);
  const stage = getForm(c.formId).stage;
  const rung = rungOf(c);
  const kin = Object.values(forms).filter((f) => f.stage === stage);
  const wild = rng.pick(kin);
  const scale = combatTuning.ladder[rung - 1]!;
  const wildStats = Object.fromEntries(STATS.map((s) => [s, Math.max(1, Math.round(wild.baseStats[s] * scale))])) as Record<CombatStat, number>;
  const wildHp = Math.round(wildStats.vit * combatTuning.hpPerVit);
  const myStats = Object.fromEntries(STATS.map((s) => [s, statTotal(c, s)])) as Record<CombatStat, number>;
  const seed = Math.floor(rng.next() * 0x100000000);
  save.rngState = rng.state();

  c.stats.energy -= combatTuning.energyCost;
  const me = newFighter(c.formId, myStats, maxHp(c), Math.max(1, Math.round(currentHp(c))));
  const foe = newFighter(wild.id, wildStats, wildHp);
  logEvent(save, nowMs, `Went to fight a wild ${wild.name} (rung ${rung}${isBossRung(rung) ? ", the boss" : ""})`);
  return newBattle(me, foe, rung, isBossRung(rung), sulkChance(c.stats.discipline), seed);
}

export interface FightResult {
  won: boolean;
  boss: boolean;
  coins: number;
  material: { id: MaterialId; amount: number } | null;
  trained: { stat: CombatStat; points: number } | null; // the stat that grew, and by how much (0 if it was at its cap)
}

// The stat each action trains.
const trains: Record<BattleAction, CombatStat> = { attack: "str", guard: "def", special: "spi" };

// What the player used most in this fight (ties go to attack, then guard, then special), or null if it never chose.
export function mostUsed(used: Battle["used"]): BattleAction | null {
  let best: BattleAction | null = null;
  for (const action of ["attack", "guard", "special"] as const) {
    if (used[action] > 0 && (best === null || used[action] > used[best])) best = action;
  }
  return best;
}

// Apply a finished fight to the save. A fight that is not over changes nothing (and returns null).
export function finishFight(save: Save, c: Creature, battle: Battle, nowMs: number): FightResult | null {
  if (!battle.over) return null;
  const won = battle.over === "won";
  const counters = c.counters;
  counters.battles = (counters.battles ?? 0) + 1;
  const result: FightResult = { won, boss: battle.boss, coins: 0, material: null, trained: null };

  if (!won) {
    c.hp = Math.round(maxHp(c) * combatTuning.knockedOut.hpShare);
    c.stats.energy = Math.max(0, c.stats.energy - combatTuning.knockedOut.energy);
    logEvent(save, nowMs, `Lost to the wild ${getForm(battle.foe.formId).name} and went to rest`);
    return result;
  }

  counters.wins = (counters.wins ?? 0) + 1;
  c.hp = Math.min(maxHp(c), Math.max(1, battle.me.hp));
  const rng = makeRng(save.rngState);
  const boss = battle.boss;
  result.coins = rng.int(battle.rung, battle.rung + combatTuning.coinsExtra) * (boss ? combatTuning.bossFactor : 1);
  save.coins += result.coins;
  if (rng.chance(combatTuning.materialChance)) {
    const stage: Stage = getForm(c.formId).stage;
    const open = spotIds.filter((id) => stageOrder.indexOf(stage) >= stageOrder.indexOf(spots[id].minStage));
    const id = spots[rng.pick(open)].material;
    save.inventory[id] = (save.inventory[id] ?? 0) + 1;
    result.material = { id, amount: 1 };
  }
  save.rngState = rng.state();
  const action = mostUsed(battle.used);
  if (action) {
    const stat = trains[action];
    result.trained = { stat, points: addTrained(c, stat, combatTuning.statGain * (boss ? 2 : 1)) };
  }
  c.rung = boss ? 1 : rungOf(c) + 1;
  logEvent(save, nowMs, `Beat the wild ${getForm(battle.foe.formId).name}${boss ? " (the boss)" : ""}: ${result.coins} coins`);
  return result;
}
