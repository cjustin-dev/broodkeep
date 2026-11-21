// One fight, round by round. Pure rules: a Battle holds everything (both fighters, the random numbers), and
// playRound changes it. Nothing here touches the save, so a fight can be tested without a game (fight.ts joins them).
// Turn-based: the player picks an action, the wild creature picks its own, then both happen in speed order.

import { combatTuning } from "../../data/combat";
import { makeRng } from "../rng";
import type { Rng } from "../rng";
import type { CombatStat } from "../types";

export type BattleAction = "attack" | "guard" | "special";
export type Side = "me" | "foe";

export interface Fighter {
  formId: string;
  stats: Record<CombatStat, number>;
  hp: number;
  maxHp: number;
  meter: number; // the special meter, 0 up to combatTuning.meterMax
  guarding: boolean; // only true during a round
}

// What happened, in order, so the screen can play it back.
export interface BattleEvent {
  actor: Side;
  kind: BattleAction | "sulk"; // "sulk": a creature with low discipline ignored the command
  damage: number; // 0 unless it was a hit
  crit: boolean;
  ko: boolean; // this hit finished the fight
}

export interface Battle {
  me: Fighter;
  foe: Fighter;
  rung: number; // which rung of the ladder this is (1 up to the boss)
  boss: boolean;
  round: number; // rounds played so far
  used: Record<BattleAction, number>; // the player's own choices so far (a sulk is not counted)
  sulkChance: number; // chance per round that the player's creature ignores the command
  over: null | "won" | "lost";
  events: BattleEvent[]; // what happened in the last round
  rngState: number;
}

export function newFighter(formId: string, stats: Record<CombatStat, number>, maxHp: number, hp: number = maxHp): Fighter {
  return { formId, stats, hp, maxHp, meter: 0, guarding: false };
}

export function newBattle(me: Fighter, foe: Fighter, rung: number, boss: boolean, sulkChance: number, rngState: number): Battle {
  return { me, foe, rung, boss, round: 0, used: { attack: 0, guard: 0, special: 0 }, sulkChance, over: null, events: [], rngState };
}

// The chance that a creature ignores a command, from its discipline.
export function sulkChance(discipline: number): number {
  const s = combatTuning.sulk;
  return Math.min(s.max, Math.max(0, (s.below - discipline) * s.perPoint));
}

const other = (side: Side): Side => (side === "me" ? "foe" : "me");

// Who decides what the wild creature does. The default is the rule below; a test (or a later controller) can pass its own.
export type FoeChooser = (b: Battle, rng: Rng) => BattleAction;

export const foeChoice: FoeChooser = (b, rng) => {
  const f = combatTuning.foe;
  if (b.foe.meter >= combatTuning.meterMax && rng.chance(f.specialChance)) return "special";
  if (rng.chance(f.guardChance)) return "guard";
  return "attack";
};

function strike(b: Battle, who: Side, kind: "attack" | "special", rng: Rng): void {
  const attacker = b[who];
  const target = b[other(who)];
  const move = kind === "special" ? combatTuning.special : combatTuning.attack;
  const power = kind === "special" ? attacker.stats.spi : attacker.stats.str;
  const [lo, hi] = combatTuning.variance;
  const roll = lo + rng.next() * (hi - lo);
  const crit = rng.chance(Math.min(combatTuning.crit.max, attacker.stats.spd * combatTuning.crit.perSpeed));
  let damage = Math.max(1, Math.round(power * move.power * roll - target.stats.def * move.soak));
  if (crit) damage = Math.round(damage * combatTuning.crit.factor);
  if (target.guarding) damage = Math.max(1, Math.round(damage * combatTuning.guardFactor));
  if (kind === "special") attacker.meter = 0;
  target.hp = Math.max(0, target.hp - damage);
  target.meter = Math.min(combatTuning.meterMax, target.meter + 1);
  const ko = target.hp === 0;
  if (ko) b.over = who === "me" ? "won" : "lost";
  b.events.push({ actor: who, kind, damage, crit, ko });
}

// Play one round with the player's choice. A special without a full meter is played as an attack.
// Does nothing once the fight is over.
export function playRound(b: Battle, choice: BattleAction, chooseFoe: FoeChooser = foeChoice): void {
  if (b.over) return;
  const rng = makeRng(b.rngState);
  b.events = [];
  b.round += 1;

  let mine: BattleAction | "sulk" = choice === "special" && b.me.meter < combatTuning.meterMax ? "attack" : choice;
  if (rng.chance(b.sulkChance)) mine = "sulk";
  else b.used[mine] += 1;
  const theirs = chooseFoe(b, rng);

  // Guards go up first, whoever is faster, so a guard always counts against this round's blows.
  for (const [who, action] of [["me", mine], ["foe", theirs]] as const) {
    if (action === "sulk") b.events.push({ actor: who, kind: "sulk", damage: 0, crit: false, ko: false });
    if (action !== "guard") continue;
    b[who].guarding = true;
    b[who].meter = Math.min(combatTuning.meterMax, b[who].meter + 1);
    b.events.push({ actor: who, kind: "guard", damage: 0, crit: false, ko: false });
  }

  // The blows, faster first (a tie goes to the player). A creature that has been knocked out does not strike.
  const order: Side[] = b.me.stats.spd >= b.foe.stats.spd ? ["me", "foe"] : ["foe", "me"];
  for (const who of order) {
    if (b.over) break;
    const action = who === "me" ? mine : theirs;
    if (action === "attack" || action === "special") strike(b, who, action, rng);
  }

  b.me.guarding = false;
  b.foe.guarding = false;
  b.rngState = rng.state();
}
