// A fixed set of fights, played and written down as short lines, so that "Kid Mode fights are the same as before A4.3" is a comparison with
// something recorded, not with the code under test. The fixture (tests/fixtures/combat-golden.json) was written by tools/verify/combat-golden.ts
// on the engine as it was on origin/main 6408759, before A4.3 changed a line of it. A new line in the fixture is a decision, not a refresh.
// The wild creature is drawn from the forms of the player's stage (fight.ts), so the fixture also records that roster: if the roster changes the
// starts and payouts change with it, and the roster test says so first.
import { forms } from "../src/data/forms";
import { specialId } from "../src/data/special";
import { endFight, startFight } from "../src/game/actions";
import { newBattle, newFighter, playRound } from "../src/game/combat/battle";
import type { BattleAction } from "../src/game/combat/battle";
import type { Battle } from "../src/game/combat/battle";
import { setRung } from "../src/game/dev";
import { aliveSave, at } from "./helpers";

const PLAN: BattleAction[] = ["attack", "guard", "attack", "special", "guard", "attack", "attack", "special"];
const SEEDS = 12;
const MAX_ROUNDS = 30;
const STAGES = ["kid", "young", "adult"] as const;
// The creature under test at each stage, by name, and a baby for the one that is too young to fight.
const CREATURE = { kid: "pebblin", young: "cragpup", adult: "gravelhorn" } as const;
const BABY = "blip";

// Every object's keys in sorted order, so a line does not depend on the order a save's fields were made in.
const stable = (x: unknown): string => JSON.stringify(x, (_k, v: unknown) => (v && typeof v === "object" && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : 1))) : v));

// The forms a wild creature can be drawn from at each stage (what beginFight picks from).
export function goldenRoster(): Record<string, string[]> {
  return Object.fromEntries(STAGES.map((stage) => [stage, Object.values(forms).filter((f) => f.stage === stage && f.id !== specialId).map((f) => f.id)]));
}

// One round as text: who (m or f) did what for how much (! a crit, K the blow that ended the fight), both HP, both meters and the random state after it.
function roundLine(b: Battle): string {
  const events = b.events.map((e) => `${e.actor[0]}-${e.kind}-${e.damage}${e.crit ? "!" : ""}${e.ko ? "K" : ""}`).join(",");
  return `${b.round}|${events}|${b.me.hp},${b.foe.hp}|${b.me.meter},${b.foe.meter}|${b.rngState}`;
}

function fightOf(seed: number, me: Battle["me"], foe: Battle["foe"], sulk: number): string[] {
  const b = newBattle(me, foe, 3, false, sulk, seed);
  const lines: string[] = [];
  for (let i = 0; i < MAX_ROUNDS && !b.over; i++) {
    playRound(b, PLAN[i % PLAN.length]!);
    lines.push(roundLine(b));
  }
  return lines;
}

// 14 fights between made-up fighters: the faster side, the speed tie, short and long fights and a sulk chance of 0 or 0.2 all come up, and the scripted
// choices are used in turn. The last two have speeds high enough that the crit chance (speed x 0.01) hits its cap of 0.25.
export function goldenFights(): string[][] {
  const fights: string[][] = [];
  for (let seed = 1; seed <= SEEDS; seed++) {
    const speed = [8, 11, 10][seed % 3]!; // the player's speed against the foe's 10: slower, faster, a tie
    const long = seed > SEEDS / 2; // the second half have about three times the HP, so the fights run for many rounds and the meters fill and empty
    const me = newFighter("cragpup", { vit: 12, str: 14, def: 9, spi: 11, spd: speed }, long ? 108 : 36);
    const foe = newFighter("dugling", { vit: 14, str: 12, def: 10, spi: 9, spd: 10 }, long ? 126 : 42);
    fights.push(fightOf(seed, me, foe, seed % 2 === 0 ? 0.2 : 0));
  }
  for (const seed of [SEEDS + 1, SEEDS + 2]) {
    const me = newFighter("cragpup", { vit: 12, str: 14, def: 9, spi: 11, spd: 40 }, 108);
    const foe = newFighter("dugling", { vit: 14, str: 12, def: 10, spi: 9, spd: 30 }, 126);
    fights.push(fightOf(seed, me, foe, 0.1));
  }
  return fights;
}

// The fight a save starts at each rung, for the creature of each stage: who the wild creature is, both sides' numbers, the sulk chance and the seed.
// Then the sulk chance at three disciplines (the cap, a value between, the floor), and every reason a fight is refused.
export function goldenStarts(): string[] {
  const lines: string[] = [];
  const side = (f: Battle["me"]): string => `${f.formId}:${f.stats.vit},${f.stats.str},${f.stats.def},${f.stats.spi},${f.stats.spd}:${f.hp}/${f.maxHp}`;
  for (const stage of STAGES) {
    for (let rung = 1; rung <= 5; rung++) {
      const save = aliveSave(CREATURE[stage], at(10), 4321);
      setRung(save, rung);
      const result = startFight(save, at(10));
      if (result.status !== "started") {
        lines.push(`${CREATURE[stage]}|${rung}|${result.status}`);
        continue;
      }
      const b = result.battle;
      lines.push(`${CREATURE[stage]}|${rung}|${b.rung},${b.boss}|${side(b.me)}|${side(b.foe)}|${b.sulkChance}|${b.rngState}|${save.rngState}`);
    }
  }
  for (const discipline of [10, 45, 60]) {
    const save = aliveSave(CREATURE.kid, at(10), 4321);
    save.creature!.stats.discipline = discipline;
    const result = startFight(save, at(10));
    lines.push(`discipline ${discipline}|${result.status === "started" ? result.battle.sulkChance : result.status}`);
  }
  const refused: [string, (save: ReturnType<typeof aliveSave>) => void, string][] = [
    ["tired", (s) => void (s.creature!.stats.energy = 25), CREATURE.kid],
    ["asleep", (s) => void (s.creature!.sleep = "nap"), CREATURE.kid],
    ["sick", (s) => void (s.creature!.sick = true), CREATURE.kid],
    ["baby", () => undefined, BABY],
  ];
  for (const [label, change, formId] of refused) {
    const save = aliveSave(formId, at(10), 4321);
    change(save);
    lines.push(`refused ${label}|${startFight(save, at(10)).status}`);
  }
  return lines;
}

interface Plan {
  name: string;
  choices: BattleAction[];
  charge?: boolean; // the meter is set full before every round, so a special really is one
}
const ATTACKS: Plan = { name: "attacks", choices: PLAN };
type Mode = "strong" | "weak" | "hurt";

// One finished fight and everything it changed: the creature at `formId` at `rung`, made certain to win (strong), lose (weak) or win with HP left (hurt),
// played with the plan until it is over, paid out by endFight; the line is the result and the save's numbers afterwards.
function payout(formId: string, rung: number, seed: number, mode: Mode, plan: Plan): string {
  const save = aliveSave(formId, at(10), seed);
  setRung(save, rung);
  const result = startFight(save, at(10));
  if (result.status !== "started") return `${formId}|${rung}|${result.status}`;
  const b = result.battle;
  if (mode === "strong") {
    b.me.hp = b.me.maxHp = 9999;
    b.foe.hp = b.foe.maxHp = 20;
  } else if (mode === "weak") {
    b.me.hp = b.me.maxHp = 1;
    b.foe.hp = b.foe.maxHp = 9999;
  } else {
    b.me.hp = Math.ceil(b.me.maxHp / 2);
    b.foe.hp = b.foe.maxHp = 1;
  }
  for (let i = 0; i < 200 && !b.over; i++) {
    if (plan.charge) b.me.meter = 3;
    playRound(b, plan.choices[i % plan.choices.length]!);
  }
  const hpBefore = b.me.hp;
  const paid = endFight(save, b, at(10));
  const c = save.creature!;
  return [formId, rung, mode, plan.name, b.round, b.over, stable(b.used), `hp ${hpBefore}/${b.me.maxHp} -> ${Math.round(c.hp ?? -1)}`, stable(paid), save.coins, stable(save.inventory), c.rung ?? 1, stable(c.counters), stable(c.trained ?? {}), stable(c.stats), c.sleep ?? "-", c.sick, stable(c.job ?? null), stable(save.board), save.rngState].join("|");
}

// What a finished fight pays and changes: each stage at the first rung and the boss, certain to win and certain to lose; each stage with a guard-heavy plan,
// a special-heavy one and a mix of guard and special (the stat that grows follows the action used most; the tie-break has its own test in combat.test.ts); and a win that leaves HP.
export function goldenPayouts(): string[] {
  const lines: string[] = [];
  const guards: Plan = { name: "guards", choices: ["guard", "guard", "attack"] };
  const specials: Plan = { name: "specials", choices: ["special"], charge: true };
  const mixed: Plan = { name: "mixed", choices: ["guard", "special"], charge: true };
  for (const stage of STAGES) {
    for (const rung of [1, 5]) for (const mode of ["strong", "weak"] as const) lines.push(payout(CREATURE[stage], rung, 600 + rung, mode, ATTACKS));
    for (const plan of [guards, specials, mixed]) lines.push(payout(CREATURE[stage], 1, 700, "strong", plan));
    lines.push(payout(CREATURE[stage], 1, 800, "hurt", ATTACKS));
  }
  return lines;
}

// How the coins and the dropped material come out over 20 seeds at the first rung and the boss (so a changed chance or range shows).
export function goldenThresholds(): string[] {
  const lines: string[] = [];
  for (const rung of [1, 5]) {
    for (let seed = 1; seed <= 20; seed++) {
      const save = aliveSave(CREATURE.kid, at(10), 900 + seed);
      setRung(save, rung);
      const result = startFight(save, at(10));
      if (result.status !== "started") throw new Error(result.status);
      const b = result.battle;
      b.me.hp = b.me.maxHp = 9999;
      b.foe.hp = b.foe.maxHp = 20;
      for (let i = 0; i < 200 && !b.over; i++) playRound(b, "attack");
      const paid = endFight(save, b, at(10))!;
      lines.push(`${rung}|${seed}|${paid.coins}|${paid.material?.id ?? "-"}`);
    }
  }
  return lines;
}
