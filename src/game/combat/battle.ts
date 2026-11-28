// One fight, round by round. Pure rules: a Battle holds everything (both fighters, the random numbers), and
// playRound changes it. Nothing here touches the save, so a fight can be tested without a game (fight.ts joins them).
// Turn-based: the player picks an action, the wild creature picks its own, then both happen in speed order.

import { combatTuning } from "../../data/combat";
import { makeRng } from "../rng";
import type { Rng } from "../rng";
import type { CombatStat } from "../types";
import type { Timing } from "./timing";

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
  parried?: true; // timed fights: a Perfect guard turned this blow into nothing
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
  hpBefore: Record<Side, number>; // each side's HP when the last round began, so the screen can play the blows back in order
  rngState: number;
  timed: boolean; // Adult Mode: the player's taps are graded, the foe's next move is shown first, and a creature sulks at most once
  sulks: number; // how many times the player's creature has ignored a command in this fight
  foeNext?: BattleAction; // timed fights: what the wild creature will do next round, drawn ahead so the screen can show it
}

export function newFighter(formId: string, stats: Record<CombatStat, number>, maxHp: number, hp: number = maxHp): Fighter {
  return { formId, stats, hp, maxHp, meter: 0, guarding: false };
}

export function newBattle(me: Fighter, foe: Fighter, rung: number, boss: boolean, sulkChance: number, rngState: number, timed = false): Battle {
  return { me, foe, rung, boss, round: 0, used: { attack: 0, guard: 0, special: 0 }, sulkChance, over: null, events: [], hpBefore: { me: me.hp, foe: foe.hp }, rngState, timed, sulks: 0 };
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

// Draw what the wild creature will do next round, from the battle's own random numbers (a timed fight does this at its start and after every round).
export function planFoe(b: Battle, chooseFoe: FoeChooser = foeChoice): void {
  const rng = makeRng(b.rngState);
  b.foeNext = chooseFoe(b, rng);
  b.rngState = rng.state();
}

// `grade` is how well the player's own action was timed (always "normal" in a fight that is not timed): it multiplies the player's blows, and a Perfect
// guard turns the foe's blow into nothing (the parry).
function strike(b: Battle, who: Side, kind: "attack" | "special", rng: Rng, grade: Timing): void {
  const attacker = b[who];
  const target = b[other(who)];
  const move = kind === "special" ? combatTuning.special : combatTuning.attack;
  const power = kind === "special" ? attacker.stats.spi : attacker.stats.str;
  const [lo, hi] = combatTuning.variance;
  const roll = lo + rng.next() * (hi - lo);
  const crit = rng.chance(Math.min(combatTuning.crit.max, attacker.stats.spd * combatTuning.crit.perSpeed));
  let damage = Math.max(1, Math.round(power * move.power * roll - target.stats.def * move.soak));
  if (crit) damage = Math.round(damage * combatTuning.crit.factor);
  const timed = b.timed ? combatTuning.timed : null;
  if (timed && who === "me") damage = Math.round(damage * timed.grade[grade]);
  const parried = timed !== null && who === "foe" && target.guarding && grade === "perfect";
  if (parried) damage = 0;
  else if (target.guarding) {
    const share = timed && who === "foe" && grade === "good" ? timed.guardGood : combatTuning.guardFactor;
    damage = Math.max(1, Math.round(damage * share));
  }
  if (kind === "special") attacker.meter = 0;
  else if (timed && who === "me" && grade === "perfect") attacker.meter = Math.min(combatTuning.meterMax, attacker.meter + 1);
  target.hp = Math.max(0, target.hp - damage);
  target.meter = Math.min(combatTuning.meterMax, target.meter + 1 + (parried ? combatTuning.timed.parryMeter : 0));
  const ko = target.hp === 0;
  if (ko) b.over = who === "me" ? "won" : "lost";
  b.events.push({ actor: who, kind, damage, crit, ko, ...(parried ? { parried: true as const } : {}) });
}

// Play one round with the player's choice. A special without a full meter is played as an attack.
// `timing` is how well the player timed the action (a timed fight only: in any other fight it is ignored). `chooseFoe` decides the wild creature's
// moves after the first one of a timed fight. Does nothing once the fight is over.
export function playRound(b: Battle, choice: BattleAction, chooseFoe: FoeChooser = foeChoice, timing: Timing = "normal"): void {
  if (b.over) return;
  const rng = makeRng(b.rngState);
  b.events = [];
  b.hpBefore = { me: b.me.hp, foe: b.foe.hp };
  b.round += 1;

  let mine: BattleAction | "sulk" = choice === "special" && b.me.meter < combatTuning.meterMax ? "attack" : choice;
  // The roll is always drawn; a timed fight lets the creature sulk once at most.
  if (rng.chance(b.sulkChance) && !(b.timed && b.sulks >= 1)) {
    mine = "sulk";
    b.sulks += 1;
  } else b.used[mine] += 1;
  const grade: Timing = b.timed && mine !== "sulk" ? timing : "normal"; // a sulked round gets no grade effect
  const theirs = b.timed && b.foeNext ? b.foeNext : chooseFoe(b, rng);

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
    if (action === "attack" || action === "special") strike(b, who, action, rng, grade);
  }

  b.me.guarding = false;
  b.foe.guarding = false;
  if (b.timed) {
    if (b.over) delete b.foeNext;
    else b.foeNext = chooseFoe(b, rng);
  }
  b.rngState = rng.state();
}
