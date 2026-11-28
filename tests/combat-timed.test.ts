// Timed combat (A4.3, docs/adult-a4-plan.md section 10): how a tap is graded, what a grade does to a round, the foe's move shown first, the one sulk,
// the harder ladder, and that a fight that is not timed ignores all of it. The expected numbers are literals worked out by hand from the damage
// formula (str 10 against def 10 at seed 1: 15 x roll - 5 = 8, then x1.2 or x1.5, then the guard), not read back from the code.
import { describe, expect, it } from "vitest";
import { fighterPlace, playback } from "../src/art/arena";
import { combatTuning } from "../src/data/combat";
import { forms } from "../src/data/forms";
import { timingWindows } from "../src/data/rhythm";
import { startFight } from "../src/game/actions";
import { newBattle, newFighter, planFoe, playRound, sulkChance } from "../src/game/combat/battle";
import type { Battle, BattleAction, FoeChooser, Side } from "../src/game/combat/battle";
import { gradeTap, timingWord } from "../src/game/combat/timing";
import type { Timing } from "../src/game/combat/timing";
import { setRung } from "../src/game/dev";
import type { CombatStat } from "../src/game/types";
import { aliveSave, at } from "./helpers";

const stats = (o: Partial<Record<CombatStat, number>> = {}): Record<CombatStat, number> => ({ vit: 10, str: 10, def: 10, spi: 10, spd: 0, ...o });
const always = (action: BattleAction): FoeChooser => () => action;
const GRADES: Timing[] = ["normal", "good", "perfect"];

// Two made-up fighters with lots of HP (so one round never ends the fight unless a test wants that). Timed unless the test says otherwise.
function battleOf(o: { me?: Partial<Record<CombatStat, number>>; foe?: Partial<Record<CombatStat, number>>; seed?: number; sulk?: number; hp?: number; foeHp?: number; timed?: boolean } = {}): Battle {
  const me = newFighter("cragpup", stats(o.me), 1000, o.hp ?? 1000);
  const foe = newFighter("dugling", stats(o.foe), 1000, o.foeHp ?? 1000);
  return newBattle(me, foe, 3, false, o.sulk ?? 0, o.seed ?? 1, o.timed ?? true);
}
// One round of a fresh battle: the player's choice with a grade against a foe that always does `foe`.
function round(choice: BattleAction, grade: Timing, foe: BattleAction, o: Parameters<typeof battleOf>[0] = {}, meter = 0): Battle {
  const b = battleOf(o);
  b.me.meter = meter;
  playRound(b, choice, always(foe), grade);
  return b;
}
const blow = (b: Battle, actor: Side) => b.events.find((e) => e.actor === actor && (e.kind === "attack" || e.kind === "special"))!;
const dmg = (b: Battle, actor: Side): number => blow(b, actor).damage;

describe("grading a tap", () => {
  it("has the two windows at 80 and 160 ms", () => {
    expect(timingWindows).toEqual({ perfectMs: 80, goodMs: 160 });
  });

  it("grades every whole millisecond from -200 to +200: Perfect up to 80 away, Good up to 160, Normal beyond", () => {
    for (let ms = -200; ms <= 200; ms++) {
      const d = Math.abs(ms);
      expect(gradeTap(ms), `${ms} ms`).toBe(d <= 80 ? "perfect" : d <= 160 ? "good" : "normal");
    }
  });

  it("calls the edges by name, early and late alike", () => {
    expect([gradeTap(80), gradeTap(-80), gradeTap(81), gradeTap(-81)]).toEqual(["perfect", "perfect", "good", "good"]);
    expect([gradeTap(160), gradeTap(-160), gradeTap(161), gradeTap(-161)]).toEqual(["good", "good", "normal", "normal"]);
  });

  it("counts a tap that is not a number, or is a very long way off, as Normal", () => {
    for (const bad of [NaN, Infinity, -Infinity, undefined as unknown as number, 1e9, -1e9]) expect(gradeTap(bad)).toBe("normal");
  });

  it("says the grade in words: Perfect and Good name the action, Early and Late name a tap outside the Good window, a closed pad says nothing", () => {
    expect(timingWord("attack", "perfect", 10, false)).toBe("Perfect attack");
    expect(timingWord("special", "perfect", -30, false)).toBe("Perfect special");
    expect(timingWord("guard", "perfect", 0, true)).toBe("Perfect guard");
    expect(timingWord("guard", "good", 100, false)).toBe("Good guard");
    expect(timingWord("attack", "good", -120, false)).toBe("Good attack");
    expect(timingWord("attack", "normal", -300, false)).toBe("Early");
    expect(timingWord("guard", "normal", 180, false)).toBe("Late");
    expect(timingWord("attack", "normal", null, false)).toBeNull();
    expect(timingWord("attack", "normal", NaN, false)).toBeNull();
  });

  it("says nothing for a Perfect guard that had no blow to parry", () => {
    expect(timingWord("guard", "perfect", 5, false)).toBeNull();
  });
});

describe("what a grade does to the player's blows", () => {
  it("hits for 8, 10 and 12 (Normal, Good, Perfect) at seed 1: x1, x1.2, x1.5 of the same roll, rounded", () => {
    expect(GRADES.map((g) => dmg(round("attack", g, "attack"), "me"))).toEqual([8, 10, 12]);
  });

  it("hits a guarding foe for 4, 5 and 6: the grade first, then the guard", () => {
    expect(GRADES.map((g) => dmg(round("attack", g, "guard"), "me"))).toEqual([4, 5, 6]);
  });

  it("does the same for a special: 18, 22 and 27 open, and 9, 11 and 14 into a guard (the graded 18, 22 and 27, halved and rounded)", () => {
    expect(GRADES.map((g) => dmg(round("special", g, "attack", {}, 3), "me"))).toEqual([18, 22, 27]);
    expect(GRADES.map((g) => dmg(round("special", g, "guard", {}, 3), "me"))).toEqual([9, 11, 14]);
  });

  it("applies the grade after a critical hit (seed 4, speed 100): 14, 17, 21 open, 7, 9, 11 into a guard", () => {
    const fast = { me: { spd: 100 }, seed: 4 };
    expect(GRADES.map((g) => dmg(round("attack", g, "attack", fast), "me"))).toEqual([14, 17, 21]);
    expect(GRADES.map((g) => dmg(round("attack", g, "guard", fast), "me"))).toEqual([7, 9, 11]);
    expect(blow(round("attack", "perfect", "attack", fast), "me").crit).toBe(true);
  });

  it("applies the grade after the crit, where the order shows in the rounding (seed 9: base 12, crit 18, Good 22 and not 21; seed 27: base 8, crit 12, Good 14 and not 15)", () => {
    const fast = (seed: number) => ({ me: { spd: 100 }, seed });
    expect(GRADES.map((g) => dmg(round("attack", g, "attack", fast(9)), "me"))).toEqual([18, 22, 27]);
    expect(GRADES.map((g) => dmg(round("attack", g, "attack", fast(27)), "me"))).toEqual([12, 14, 18]);
    expect(blow(round("attack", "good", "attack", fast(9)), "me").crit).toBe(true);
    expect(blow(round("attack", "good", "attack", fast(27)), "me").crit).toBe(true);
  });

  it("works the same way at another seed (5): 11, 13, 17 open and 6, 7, 9 into a guard", () => {
    expect(GRADES.map((g) => dmg(round("attack", g, "attack", { seed: 5 }), "me"))).toEqual([11, 13, 17]);
    expect(GRADES.map((g) => dmg(round("attack", g, "guard", { seed: 5 }), "me"))).toEqual([6, 7, 9]);
  });
});

describe("what a grade does to the player's guard", () => {
  it("takes 4, 3 and 0 of an 8-point blow (Normal, Good, Perfect) at seed 1, and 6, 4, 0 of an 11-point one at seed 5", () => {
    expect(GRADES.map((g) => dmg(round("guard", g, "attack"), "foe"))).toEqual([4, 3, 0]);
    expect(GRADES.map((g) => dmg(round("guard", g, "attack", { seed: 5 }), "foe"))).toEqual([6, 4, 0]);
  });

  it("never takes a Normal or Good guard below 1, and only a Perfect guard reaches 0", () => {
    const weak = { foe: { str: 1 } }; // 1.5 x roll - 5 is under 1, so the blow is the minimum, 1
    expect(GRADES.map((g) => dmg(round("guard", g, "attack", weak), "foe"))).toEqual([1, 1, 0]);
    expect(dmg(round("attack", "normal", "attack", weak), "foe")).toBe(1);
  });

  it("parries: the blow does nothing, the player's HP stays, and the blow is marked", () => {
    const b = round("guard", "perfect", "attack");
    expect(b.me.hp).toBe(1000);
    expect(blow(b, "foe")).toMatchObject({ damage: 0, parried: true, ko: false });
    expect(b.events.find((e) => e.kind === "guard")).toMatchObject({ actor: "me" });
  });

  it("charges the meter for a parry: the guard's 1, the blow's 1 and the parry's 1, so a full meter from empty", () => {
    expect(round("guard", "perfect", "attack").me.meter).toBe(3);
    expect(round("guard", "good", "attack").me.meter).toBe(2);
    expect(round("guard", "normal", "attack").me.meter).toBe(2);
  });

  it("leaves the foe's blow alone in a round with a Perfect Attack: the same damage as after a Normal one, and no parry", () => {
    const normal = round("attack", "normal", "attack");
    const perfect = round("attack", "perfect", "attack");
    expect(dmg(perfect, "foe")).toBe(dmg(normal, "foe"));
    expect(perfect.me.hp).toBe(normal.me.hp);
    expect(perfect.me.hp).toBeLessThan(1000);
    expect("parried" in blow(perfect, "foe")).toBe(false);
  });

  it("parries a special too, and the foe's special still empties the foe's meter", () => {
    const b = battleOf();
    b.foe.meter = 3;
    playRound(b, "guard", always("special"), "perfect");
    expect(blow(b, "foe")).toMatchObject({ kind: "special", damage: 0, parried: true });
    expect(b.foe.meter).toBe(0);
    expect(b.me.hp).toBe(1000);
  });

  it("saves a creature that is at 1 HP from a parried blow, and the fight goes on", () => {
    const b = round("guard", "perfect", "attack", { hp: 1 });
    expect(b.me.hp).toBe(1);
    expect(b.over).toBeNull();
    expect(round("guard", "normal", "attack", { hp: 1 }).over).toBe("lost");
  });

  it("gives a Perfect guard against a guarding foe only the guard's own 1 of meter, and no parry", () => {
    const b = round("guard", "perfect", "guard");
    expect(b.me.meter).toBe(1);
    expect(b.events.some((e) => e.parried)).toBe(false);
    expect(b.events.filter((e) => e.kind === "attack" || e.kind === "special")).toHaveLength(0);
    expect(b.me.hp).toBe(1000);
  });
});

describe("the special meter", () => {
  it("gets +1 from a Perfect Attack, from a meter of 0 and of 2, and nothing from a Good or Normal one", () => {
    for (const start of [0, 2]) {
      expect(round("attack", "perfect", "guard", {}, start).me.meter).toBe(start + 1);
      expect(round("attack", "good", "guard", {}, start).me.meter).toBe(start);
      expect(round("attack", "normal", "guard", {}, start).me.meter).toBe(start);
    }
  });

  it("charges the wild creature's meter the same for a Perfect Attack as for a Normal one: only the player's own meter gets the bonus", () => {
    expect(round("attack", "perfect", "attack").foe.meter).toBe(round("attack", "normal", "attack").foe.meter);
    expect(round("attack", "perfect", "attack").foe.meter).toBe(1);
  });

  it("stays full when a Perfect Attack lands on a full meter", () => {
    expect(round("attack", "perfect", "guard", {}, 3).me.meter).toBe(3);
  });

  it("is emptied by a special, and a Perfect Special gives nothing back", () => {
    for (const g of GRADES) expect(round("special", g, "guard", {}, 3).me.meter).toBe(0);
  });

  it("is never above full, however the charges add up (a parry on a meter of 2)", () => {
    expect(round("guard", "perfect", "attack", {}, 2).me.meter).toBe(3);
  });

  it("charges the foe by 1 for every blow the player lands, whatever the grade", () => {
    for (const g of GRADES) expect(round("attack", g, "guard").foe.meter).toBe(2); // its own guard, and the blow
  });
});

describe("the same random numbers whatever the grade", () => {
  const SCRIPT: BattleAction[] = ["attack", "guard", "attack", "attack", "guard", "special", "attack", "guard", "guard", "attack", "special", "attack"];
  const trace = (grade: Timing, foeHp: number): { states: number[]; overAt: number | null } => {
    const b = battleOf({ foeHp });
    planFoe(b);
    const states: number[] = [];
    let overAt: number | null = null;
    for (const choice of SCRIPT) {
      playRound(b, choice, undefined, grade);
      states.push(b.rngState);
      if (b.over && overAt === null) overAt = b.round;
    }
    return { states, overAt };
  };

  it("leaves the random state the same after every round of a long fight, Normal, Good or Perfect", () => {
    const [n, g, p] = GRADES.map((grade) => trace(grade, 1000));
    expect(n!.overAt).toBeNull();
    expect(g!.states).toEqual(n!.states);
    expect(p!.states).toEqual(n!.states);
  });

  it("is the same up to the round in which a fight ends (a knocked-out foe does not strike, so that round may differ)", () => {
    const [n, , p] = GRADES.map((grade) => trace(grade, 30));
    const end = Math.min(n!.overAt ?? SCRIPT.length + 1, p!.overAt ?? SCRIPT.length + 1);
    expect(end).toBeLessThanOrEqual(SCRIPT.length); // the fight really does end in the script, so the comparison below is not the whole script
    expect(end).toBeGreaterThan(1);
    expect(p!.states.slice(0, end - 1)).toEqual(n!.states.slice(0, end - 1));
  });
});

describe("the wild creature's move is shown first", () => {
  it("is drawn by planFoe with the chooser it is given, and again after every round that does not end it, by that round's chooser", () => {
    const b = battleOf();
    expect(b.foeNext).toBeUndefined();
    planFoe(b, always("attack"));
    expect(b.foeNext).toBe("attack");
    playRound(b, "attack", always("guard"));
    expect(b.foeNext).toBe("guard"); // drawn again, by the chooser this round was given
    playRound(b, "attack", always("attack"));
    expect(b.foeNext).toBe("attack");
  });

  it("is exactly what the wild creature then does, in every round of a long fight", () => {
    const b = battleOf();
    planFoe(b);
    for (let i = 0; i < 40; i++) {
      const shown = b.foeNext!;
      playRound(b, (["attack", "guard", "attack"] as const)[i % 3]!);
      const did = b.events.filter((e) => e.actor === "foe").map((e) => e.kind);
      expect(did, `round ${i + 1}`).toEqual([shown]);
    }
  });

  it("uses the chooser given to planFoe for the first move and the chooser given to playRound for every later one", () => {
    const b = battleOf();
    planFoe(b, always("guard"));
    expect(b.foeNext).toBe("guard");
    playRound(b, "attack", always("attack"));
    expect(b.events.filter((e) => e.actor === "foe").map((e) => e.kind)).toEqual(["guard"]);
    expect(b.foeNext).toBe("attack");
    playRound(b, "attack", always("guard"));
    expect(b.events.filter((e) => e.actor === "foe").map((e) => e.kind)).toEqual(["attack"]);
    expect(b.foeNext).toBe("guard");
  });

  it("is dropped when the fight ends", () => {
    const b = battleOf({ foeHp: 1 });
    planFoe(b);
    playRound(b, "attack");
    expect(b.over).toBe("won");
    expect(b.foeNext).toBeUndefined();
  });

  it("is never set in a fight that is not timed, which draws the foe's move each round as it always did", () => {
    const b = battleOf({ timed: false });
    for (let i = 0; i < 10; i++) playRound(b, "attack");
    expect(b.foeNext).toBeUndefined();
  });

  it("is the same for the same save: two fights from equal saves are equal", () => {
    const make = () => {
      const save = aliveSave(adultId(), at(10), 99);
      save.settings.adultMode = true;
      return startFight(save, at(10));
    };
    expect(JSON.stringify(make())).toBe(JSON.stringify(make()));
    const r = make();
    expect(r.status === "started" && r.battle.foeNext !== undefined).toBe(true);
  });
});

describe("a grade in a fight that is not timed", () => {
  it("is ignored: a Perfect guard does not parry, a Perfect Attack is not x1.5, and it gives no meter", () => {
    const plain = (grade: Timing, choice: BattleAction, foe: BattleAction): Battle => {
      const b = battleOf({ timed: false });
      playRound(b, choice, always(foe), grade);
      return b;
    };
    for (const [choice, foe] of [["guard", "attack"], ["attack", "attack"], ["attack", "guard"]] as const) {
      expect(JSON.stringify(plain("perfect", choice, foe))).toBe(JSON.stringify(plain("normal", choice, foe)));
      expect(JSON.stringify(plain("good", choice, foe))).toBe(JSON.stringify(plain("normal", choice, foe)));
    }
    const b = plain("perfect", "guard", "attack");
    expect(dmg(b, "foe")).toBe(4);
    expect(b.events.some((e) => e.parried)).toBe(false);
  });
});

describe("the one sulk", () => {
  const FIGHTS = 200;
  const ROUNDS = 30;
  const sulksOf = (timed: boolean, seed: number): { sulks: number; rounds: number } => {
    const b = battleOf({ sulk: 0.3, seed, timed });
    if (timed) planFoe(b);
    let sulks = 0;
    for (let i = 0; i < ROUNDS; i++) {
      playRound(b, "attack");
      sulks += b.events.filter((e) => e.kind === "sulk").length;
    }
    return { sulks, rounds: b.round };
  };

  it("lets a timed creature sulk exactly once in 30 rounds, in each of 200 fights, at a sulk chance of 0.3", () => {
    for (let seed = 1; seed <= FIGHTS; seed++) expect(sulksOf(true, seed), `seed ${seed}`).toEqual({ sulks: 1, rounds: ROUNDS });
  });

  it("draws the sulk roll even when the cap stops the sulk, so the rest of the round is the same as with no chance of one", () => {
    const capped = battleOf({ sulk: 0.3, seed: 7 });
    capped.sulks = 1;
    const free = battleOf({ sulk: 0, seed: 7 });
    playRound(capped, "attack", always("attack"), "perfect");
    playRound(free, "attack", always("attack"), "perfect");
    expect(capped.events).toEqual(free.events);
    expect(capped.rngState).toBe(free.rngState);
    expect(capped.sulks).toBe(1);
  });

  it("still lets a creature in a fight that is not timed sulk many times (the cap does not leak), in nearly every one of the same 200 fights", () => {
    let many = 0;
    for (let seed = 1; seed <= FIGHTS; seed++) if (sulksOf(false, seed).sulks > 1) many++;
    expect(many).toBeGreaterThan(190);
  });

  it("never sulks at discipline 100, and the chance at discipline 0 is 0.3, the highest of any discipline", () => {
    expect(sulkChance(100)).toBe(0);
    expect(sulkChance(0)).toBe(0.3);
    for (let d = 1; d <= 100; d++) expect(sulkChance(d)).toBeLessThanOrEqual(sulkChance(d - 1));
    for (let seed = 1; seed <= 50; seed++) {
      const b = battleOf({ sulk: sulkChance(100), seed });
      planFoe(b);
      for (let i = 0; i < 30; i++) playRound(b, "attack");
      expect(b.sulks).toBe(0);
    }
  });

  it("gives a sulked round no grade effect: Perfect and Normal play the same round, and a Perfect Attack in the next round counts again", () => {
    const sulked = (grade: Timing): Battle => {
      const b = battleOf({ sulk: 1 });
      planFoe(b);
      playRound(b, "attack", undefined, grade);
      return b;
    };
    expect(sulked("perfect").events.some((e) => e.kind === "sulk")).toBe(true);
    expect(JSON.stringify(sulked("perfect"))).toBe(JSON.stringify(sulked("normal")));
    // the chance is still 1 in the next round, but the one sulk is used up, so the grade counts again: a Perfect Attack hits harder and charges the meter
    const next = (grade: Timing): Battle => {
      const b = sulked("perfect");
      playRound(b, "attack", always("attack"), grade);
      return b;
    };
    expect(next("perfect").sulks).toBe(1);
    expect(dmg(next("perfect"), "me")).toBeGreaterThan(dmg(next("normal"), "me"));
    expect(next("perfect").me.meter).toBe(next("normal").me.meter + 1);
  });
});

describe("the parried blow on the screen", () => {
  it("does not make its target recoil, and an ordinary blow still does", () => {
    const at0 = fighterPlace("me", 32, null, 0).x;
    const parried = battleOf();
    playRound(parried, "guard", always("attack"), "perfect");
    const hit = battleOf();
    playRound(hit, "guard", always("attack"), "normal");
    const t = 0.65; // just after the foe's blow lands (the guard's 0.4 s of calm, then 0.2 s to the hit at 0.6 s)
    const play = (b: Battle) => playback(b.events, false);
    expect(fighterPlace("me", 32, play(parried), t).x).toBe(at0);
    expect(fighterPlace("me", 32, play(hit), t).x).not.toBe(at0);
  });
});

function adultId(): string {
  return Object.values(forms).filter((f) => f.stage === "adult")[0]!.id;
}

describe("the harder ladder", () => {
  it("has as many rungs as the Kid ladder, rising, and a first rung within 15 percent of the Kid ladder's", () => {
    expect(combatTuning.ladder).toEqual([0.7, 0.85, 1.0, 1.15, 1.4]);
    expect(combatTuning.adultLadder).toEqual([0.8, 1.2, 1.65, 2.4, 3.3]); // the literal, so a changed number is a decision made on purpose (tools/verify/combat-bands.ts says what it does to the win rates)
    expect(combatTuning.adultLadder).toHaveLength(5);
    for (let i = 1; i < 5; i++) expect(combatTuning.adultLadder[i]!).toBeGreaterThan(combatTuning.adultLadder[i - 1]!);
    expect(combatTuning.adultLadder[0]!).toBeGreaterThanOrEqual(0.7);
    expect(combatTuning.adultLadder[0]!).toBeLessThanOrEqual(0.805);
  });

  it("meets the same wild creature at each rung, stronger in total and in no stat weaker in a timed fight (adultLadder) than in a Kid one (ladder), and builds each from its own ladder", () => {
    for (let rung = 1; rung <= 5; rung++) {
      const fight = (adult: boolean) => {
        const save = aliveSave(adultId(), at(10), 4321);
        save.settings.adultMode = adult;
        setRung(save, rung);
        const r = startFight(save, at(10));
        if (r.status !== "started") throw new Error(`no fight: ${r.status}`);
        return r.battle;
      };
      const kid = fight(false);
      const adult = fight(true);
      expect(kid.timed).toBe(false);
      expect(adult.timed).toBe(true);
      expect(adult.foe.formId).toBe(kid.foe.formId);
      const base = forms[kid.foe.formId]!.baseStats;
      const total = (b: Battle) => (["vit", "str", "def", "spi", "spd"] as const).reduce((n, s) => n + b.foe.stats[s], 0);
      expect(total(adult)).toBeGreaterThan(total(kid));
      for (const s of ["vit", "str", "def", "spi", "spd"] as const) {
        expect(kid.foe.stats[s]).toBe(Math.max(1, Math.round(base[s] * [0.7, 0.85, 1.0, 1.15, 1.4][rung - 1]!)));
        expect(adult.foe.stats[s]).toBe(Math.max(1, Math.round(base[s] * combatTuning.adultLadder[rung - 1]!)));
        expect(adult.foe.stats[s]).toBeGreaterThanOrEqual(kid.foe.stats[s]);
      }
    }
  });

  it("starts a timed fight only in Adult Mode: a save without the setting, or with it off, gets a Kid fight", () => {
    const save = aliveSave(adultId(), at(10), 5);
    const r = startFight(save, at(10));
    expect(r.status === "started" && r.battle.timed === false && r.battle.foeNext === undefined).toBe(true);
    const off = aliveSave(adultId(), at(10), 5);
    off.settings.adultMode = false; // what the settings switch writes when the owner turns Adult Mode off again
    const r1 = startFight(off, at(10));
    expect(r1.status === "started" && r1.battle.timed === false && r1.battle.foeNext === undefined).toBe(true);
    const on = aliveSave(adultId(), at(10), 5);
    on.settings.adultMode = true;
    const r2 = startFight(on, at(10));
    expect(r2.status === "started" && r2.battle.timed === true).toBe(true);
  });
});
