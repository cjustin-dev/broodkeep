// Combat: stats and HP, resting, one fight round by round, and what a fight changes in the save.
import { describe, expect, it } from "vitest";
import { combatTuning } from "../src/data/combat";
import { forms, getForm } from "../src/data/forms";
import { endFight, startFight } from "../src/game/actions";
import { newBattle, newFighter, playRound, sulkChance } from "../src/game/combat/battle";
import type { Battle, BattleAction } from "../src/game/combat/battle";
import { beginFight, fightRefusal, finishFight, isBossRung, mostUsed, rungOf } from "../src/game/combat/fight";
import { stepRecovery } from "../src/game/combat/recovery";
import { addTrained, currentHp, maxHp, statTotal } from "../src/game/combat/stats";
import { forceEvolve, killCreature, rungNumber, setHpPercent, setRung } from "../src/game/dev";
import { simulateTo } from "../src/game/sim";
import type { Creature, Save } from "../src/game/state";
import { MINUTE } from "../src/game/time";
import type { CombatStat, Stage } from "../src/game/types";
import { aliveSave, at } from "./helpers";

const DAY = at(10);
const tune = combatTuning;
const hatched = (formId: string, seed = 1234): Save => aliveSave(formId, DAY, seed);
const stats = (o: Partial<Record<CombatStat, number>> = {}): Record<CombatStat, number> => ({ vit: 10, str: 10, def: 10, spi: 10, spd: 0, ...o });
const copy = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

// A battle between two made-up fighters with lots of HP, so one round never ends it unless the test wants that.
function battleOf(me: Partial<Record<CombatStat, number>> = {}, foe: Partial<Record<CombatStat, number>> = {}, o: { seed?: number; sulk?: number; rung?: number; boss?: boolean; hp?: number; foeHp?: number } = {}): Battle {
  return newBattle(newFighter("cragpup", stats(me), 1000, o.hp ?? 1000), newFighter("dugling", stats(foe), 1000, o.foeHp ?? 1000), o.rung ?? 3, o.boss ?? false, o.sulk ?? 0, o.seed ?? 1);
}
const always = (action: BattleAction) => (): BattleAction => action;
const FIXED_FOE = { guard: always("guard"), attack: always("attack"), special: always("special") };

// Damage limits for a hit, worked out from the numbers in the data (no crits: the tests keep speed at 0 for that).
function limits(power: number, def: number, kind: "attack" | "special" = "attack"): { min: number; max: number } {
  const m = kind === "special" ? tune.special : tune.attack;
  const [lo, hi] = tune.variance;
  return { min: Math.max(1, Math.round(power * m.power * lo - def * m.soak)), max: Math.max(1, Math.round(power * m.power * hi - def * m.soak)) };
}

describe("combat stats and HP", () => {
  it("adds trained points to the form's base stats, and HP follows vitality", () => {
    const c = hatched("cragpup").creature!;
    const base = getForm("cragpup").baseStats;
    expect(statTotal(c, "str")).toBe(base.str);
    c.trained = { str: 4, vit: 2 };
    expect(statTotal(c, "str")).toBe(base.str + 4);
    expect(statTotal(c, "def")).toBe(base.def);
    expect(maxHp(c)).toBe(Math.round((base.vit + 2) * tune.hpPerVit));
  });

  it("treats a creature that was never hurt as full, and never reports more than full or less than nothing", () => {
    const c = hatched("cragpup").creature!;
    expect(currentHp(c)).toBe(maxHp(c));
    c.hp = maxHp(c) + 50;
    expect(currentHp(c)).toBe(maxHp(c));
    c.hp = -5;
    expect(currentHp(c)).toBe(0);
    c.hp = 7;
    expect(currentHp(c)).toBe(7);
  });

  it("never trains past the cap for the stage, and says how many points were really added", () => {
    const stages: Stage[] = ["baby", "kid", "young", "adult"];
    const formFor: Record<Stage, string> = { baby: "blip", kid: "pebblin", young: "cragpup", adult: "gravelhorn" };
    for (const stage of stages) {
      const c = hatched(formFor[stage]).creature!;
      const cap = tune.trainedCap[stage];
      expect(addTrained(c, "str", cap - 1), stage).toBe(Math.max(0, cap - 1));
      expect(addTrained(c, "str", 5), stage).toBe(cap > 0 ? 1 : 0); // only one point of room is left
      expect(c.trained?.str ?? 0, stage).toBe(cap);
      expect(addTrained(c, "str", 1), stage).toBe(0);
      expect(addTrained(c, "def", 1), stage).toBe(cap > 0 ? 1 : 0); // each stat has its own room
    }
  });
});

describe("resting", () => {
  const hurt = (formId: string, share: number, edit: (c: Creature) => void = () => {}): Creature => {
    const c = hatched(formId).creature!;
    c.hp = maxHp(c) * share;
    edit(c);
    return c;
  };

  it("does nothing to a creature that was never hurt, and forgets the number once it is full again", () => {
    const c = hatched("cragpup").creature!;
    stepRecovery(c);
    expect(c.hp).toBeUndefined();
    c.hp = maxHp(c) - 0.1;
    stepRecovery(c);
    expect(c.hp).toBeUndefined();
  });

  it("refills from empty in the time in the data, and never goes past full", () => {
    const c = hurt("cragpup", 0);
    for (let m = 0; m < tune.recoverMinutes - 1; m++) stepRecovery(c);
    expect(c.hp).toBeLessThan(maxHp(c));
    stepRecovery(c);
    expect(c.hp).toBeUndefined();
  });

  it("is twice as fast asleep, and half as fast while hungry or dirty", () => {
    const gain = (edit: (c: Creature) => void): number => {
      const c = hurt("cragpup", 0.2, edit);
      const before = c.hp!;
      stepRecovery(c);
      return c.hp! - before;
    };
    const awake = gain(() => {});
    expect(gain((c) => (c.sleep = "night"))).toBeCloseTo(awake * tune.asleepFactor, 9);
    expect(gain((c) => (c.stats.hunger = tune.neglectBelow - 1))).toBeCloseTo(awake * tune.neglectFactor, 9);
    expect(gain((c) => (c.stats.hygiene = tune.neglectBelow - 1))).toBeCloseTo(awake * tune.neglectFactor, 9);
    expect(gain((c) => (c.stats.hunger = tune.neglectBelow))).toBeCloseTo(awake, 9); // exactly at the line is not neglected
    expect(gain((c) => { c.sleep = "nap"; c.stats.hunger = 0; })).toBeCloseTo(awake * tune.asleepFactor * tune.neglectFactor, 9);
  });

  it("goes on while the app is closed: a hurt creature is whole again an hour later", () => {
    const save = hatched("cragpup");
    setHpPercent(save, 10);
    simulateTo(save, DAY + 60 * MINUTE);
    expect(currentHp(save.creature!)).toBe(maxHp(save.creature!));
  });
});

describe("one round of a fight", () => {
  it("gives the same fight every time from the same seed, and plays whole fights to an end", () => {
    const play = (): Battle => {
      const b = battleOf({ str: 12, spd: 7 }, { str: 11, spd: 7 }, { seed: 99, hp: 60, foeHp: 60 });
      for (let i = 0; i < 40 && !b.over; i++) playRound(b, i % 3 === 0 ? "guard" : "attack");
      return b;
    };
    expect(play()).toEqual(play());
    expect(play().over).not.toBeNull();
  });

  it("hits for the attack formula: strength against defense, with the random spread", () => {
    const { min, max } = limits(12, 7);
    expect(min).toBeLessThan(max);
    const seen = new Set<number>();
    for (let seed = 1; seed <= 200; seed++) {
      const b = battleOf({ str: 12 }, { def: 7 }, { seed });
      playRound(b, "attack", FIXED_FOE.guard);
      const hit = b.events.find((e) => e.actor === "me" && e.kind === "attack")!;
      // The foe is guarding, so the hit is halved: it must sit inside the halved limits.
      expect(hit.damage).toBeGreaterThanOrEqual(Math.max(1, Math.round(min * tune.guardFactor)));
      expect(hit.damage).toBeLessThanOrEqual(Math.max(1, Math.round(max * tune.guardFactor)));
      seen.add(hit.damage);
      expect(b.foe.hp).toBe(1000 - hit.damage);
    }
    expect(seen.size).toBeGreaterThan(1); // the spread is real
  });

  it("always hurts at least 1, even against a huge defense", () => {
    for (let seed = 1; seed <= 50; seed++) {
      const b = battleOf({ str: 1 }, { def: 500 }, { seed });
      playRound(b, "attack", FIXED_FOE.attack);
      expect(b.events.find((e) => e.actor === "me")!.damage).toBe(1);
    }
  });

  it("halves a blow when the target guards, and a guard goes up even if the other side is faster", () => {
    const open = limits(10, 10);
    const guarded = Math.max(1, Math.round(open.max * tune.guardFactor));
    expect(guarded).toBeLessThan(open.min); // so the two cases cannot be confused
    for (let seed = 1; seed <= 100; seed++) {
      const b = battleOf({ spd: 1 }, { spd: 50 }, { seed }); // the foe is far faster and strikes first
      playRound(b, "guard", FIXED_FOE.attack);
      const hit = b.events.find((e) => e.actor === "foe" && e.kind === "attack")!;
      expect(hit.damage).toBeLessThanOrEqual(Math.round(guarded * tune.crit.factor)); // (a crit is possible at speed 50)
      expect(b.me.guarding).toBe(false); // the guard lasts one round
    }
    const b2 = battleOf({}, {}, { seed: 3 });
    playRound(b2, "attack", FIXED_FOE.attack);
    expect(b2.events.find((e) => e.actor === "foe")!.damage).toBeGreaterThanOrEqual(open.min);
  });

  it("lets the faster creature strike first, and the player go first on a tie", () => {
    const first = (me: number, foe: number): string => {
      const b = battleOf({ spd: me }, { spd: foe });
      playRound(b, "attack", FIXED_FOE.attack);
      return b.events.map((e) => e.actor).join(",");
    };
    expect(first(5, 10)).toBe("foe,me");
    expect(first(10, 5)).toBe("me,foe");
    expect(first(7, 7)).toBe("me,foe");
  });

  it("stops a knocked-out creature from striking back", () => {
    const win = battleOf({ spd: 5 }, { spd: 1 }, { foeHp: 1 });
    playRound(win, "attack", FIXED_FOE.attack);
    expect(win.over).toBe("won");
    expect(win.events).toHaveLength(1);
    expect(win.events[0]).toMatchObject({ actor: "me", ko: true });
    expect(win.foe.hp).toBe(0);

    const lose = battleOf({ spd: 1 }, { spd: 5 }, { hp: 1 });
    playRound(lose, "attack", FIXED_FOE.attack);
    expect(lose.over).toBe("lost");
    expect(lose.events).toHaveLength(1);
    expect(lose.events[0]).toMatchObject({ actor: "foe", ko: true });
  });

  it("remembers each side's HP from before the round, so the screen can replay the blows in order", () => {
    const b = battleOf({ str: 20 }, { str: 20 });
    playRound(b, "attack", FIXED_FOE.attack);
    expect(b.hpBefore).toEqual({ me: 1000, foe: 1000 });
    const lost = (side: "me" | "foe"): number => b.events.filter((e) => e.actor !== side).reduce((sum, e) => sum + e.damage, 0);
    expect([b.me.hp, b.foe.hp]).toEqual([1000 - lost("me"), 1000 - lost("foe")]);
    const afterOne = { me: b.me.hp, foe: b.foe.hp };
    playRound(b, "attack", FIXED_FOE.attack);
    expect(b.hpBefore).toEqual(afterOne);
  });

  it("does nothing once the fight is over", () => {
    const b = battleOf({ spd: 5 }, { spd: 1 }, { foeHp: 1 });
    playRound(b, "attack", FIXED_FOE.attack);
    const after = copy(b);
    playRound(b, "attack", FIXED_FOE.attack);
    expect(b).toEqual(after);
  });

  it("charges the special meter by guarding and by being hit, never past full", () => {
    const b = battleOf();
    playRound(b, "guard", FIXED_FOE.guard);
    expect([b.me.meter, b.foe.meter]).toEqual([1, 1]);
    playRound(b, "attack", FIXED_FOE.attack); // both hit each other
    expect([b.me.meter, b.foe.meter]).toEqual([2, 2]);
    for (let i = 0; i < 5; i++) playRound(b, "guard", FIXED_FOE.attack);
    expect(b.me.meter).toBe(tune.meterMax);

    // Two guards raise the meter and nothing hits it down again, so only the guard's own cap holds it at full.
    const both = battleOf();
    for (let i = 0; i < 5; i++) playRound(both, "guard", FIXED_FOE.guard);
    expect([both.me.meter, both.foe.meter]).toEqual([tune.meterMax, tune.meterMax]);
  });

  it("plays a special as an attack when the meter is not full, and a full meter makes a real special that empties it", () => {
    const b = battleOf();
    playRound(b, "special", FIXED_FOE.guard);
    expect(b.events.find((e) => e.actor === "me")!.kind).toBe("attack");
    expect(b.used).toEqual({ attack: 1, guard: 0, special: 0 });

    const full = battleOf({ str: 1, spi: 40 }, { def: 0 }, { seed: 5 });
    full.me.meter = tune.meterMax;
    playRound(full, "special", FIXED_FOE.guard);
    const hit = full.events.find((e) => e.actor === "me")!;
    expect(hit.kind).toBe("special");
    expect(full.me.meter).toBe(0);
    expect(full.used.special).toBe(1);
    const spirit = limits(40, 0, "special");
    expect(hit.damage).toBeGreaterThanOrEqual(Math.max(1, Math.round(spirit.min * tune.guardFactor)));
    expect(hit.damage).toBeLessThanOrEqual(Math.max(1, Math.round(spirit.max * tune.guardFactor)));
    expect(hit.damage).toBeGreaterThan(limits(1, 0).max); // spirit, not strength, decides a special
  });

  it("lets a creature with low discipline ignore a command, without counting it as a choice", () => {
    const b = battleOf({}, {}, { sulk: 1 });
    playRound(b, "attack", FIXED_FOE.attack);
    expect(b.events[0]).toMatchObject({ actor: "me", kind: "sulk", damage: 0 });
    expect(b.events.some((e) => e.actor === "me" && e.kind === "attack")).toBe(false);
    expect(b.used).toEqual({ attack: 0, guard: 0, special: 0 });
    expect(b.events.some((e) => e.actor === "foe" && e.kind === "attack")).toBe(true); // the wild one still fights

    const calm = battleOf({}, {}, { sulk: 0 });
    for (let i = 0; i < 20; i++) playRound(calm, "attack", FIXED_FOE.guard);
    expect(calm.events.every((e) => e.kind !== "sulk")).toBe(true);
  });

  it("works out the sulk chance from discipline: none at 50 or more, more below, never above the maximum", () => {
    expect(sulkChance(50)).toBe(0);
    expect(sulkChance(80)).toBe(0);
    expect(sulkChance(100)).toBe(0);
    expect(sulkChance(49)).toBeCloseTo(tune.sulk.perPoint, 9);
    expect(sulkChance(40)).toBeCloseTo(10 * tune.sulk.perPoint, 9);
    expect(sulkChance(0)).toBe(tune.sulk.max);
  });

  it("lands critical hits at about the speed-based chance, never above the maximum", () => {
    let hits = 0;
    let crits = 0;
    let smallestCrit = Infinity;
    let largestPlain = 0;
    for (let seed = 1; seed <= 600; seed++) {
      const b = battleOf({ spd: 100 }, { spd: 0 }, { seed }); // speed 100 would be a 100 percent chance without the maximum
      playRound(b, "attack", FIXED_FOE.attack);
      const hit = b.events.find((e) => e.actor === "me")!;
      hits++;
      if (hit.crit) {
        crits++;
        smallestCrit = Math.min(smallestCrit, hit.damage);
      } else largestPlain = Math.max(largestPlain, hit.damage);
    }
    expect(crits / hits).toBeGreaterThan(tune.crit.max - 0.08);
    expect(crits / hits).toBeLessThan(tune.crit.max + 0.08);
    const plain = limits(10, 10);
    expect(largestPlain).toBeLessThanOrEqual(plain.max);
    expect(smallestCrit).toBeGreaterThanOrEqual(Math.round(plain.min * tune.crit.factor)); // a critical hit is a plain one made bigger
    const none = battleOf({ spd: 0 }, { spd: 0 }, { seed: 4 });
    for (let i = 0; i < 30; i++) playRound(none, "attack", FIXED_FOE.attack);
    expect(none.events.every((e) => !e.crit)).toBe(true); // no speed, no crits
  });

  it("makes the wild creature special when its meter is full, sometimes guard, and otherwise attack", () => {
    const kinds = new Set<string>();
    for (let seed = 1; seed <= 300; seed++) {
      const b = battleOf({}, {}, { seed });
      b.foe.meter = tune.meterMax;
      playRound(b, "guard"); // the default chooser
      for (const e of b.events) if (e.actor === "foe") kinds.add(e.kind);
    }
    expect([...kinds].sort()).toEqual(["attack", "guard", "special"]);
    const calm = battleOf({}, {}, { seed: 2 });
    for (let i = 0; i < 50 && !calm.over; i++) {
      calm.foe.meter = 0; // an empty meter can never make a special
      playRound(calm, "guard");
      expect(calm.events.some((e) => e.actor === "foe" && e.kind === "special")).toBe(false);
    }
  });
});

describe("who may fight", () => {
  it("lets any creature from the youngest allowed stage up fight when it is awake, well and rested", () => {
    for (const id of ["pebblin", "cragpup", "gravelhorn", "cindermane"]) expect(fightRefusal(hatched(id).creature!), id).toBeNull();
  });

  it("keeps babies out, and anyone who is away, asleep or sick", () => {
    expect(fightRefusal(hatched("blip").creature!)).toBe("too-young");
    const c = hatched("cragpup").creature!;
    c.sleep = "nap";
    expect(fightRefusal(c)).toBe("asleep");
    c.sleep = null;
    c.sick = true;
    expect(fightRefusal(c)).toBe("sick");
    c.sick = false;
    c.job = { spot: "meadow", startedAt: DAY, endsAt: DAY + 3 * MINUTE };
    expect(fightRefusal(c)).toBe("busy");
  });

  it("needs the energy for the fight and the floor after it: just enough goes, a hair less is too tired", () => {
    const c = hatched("cragpup").creature!;
    c.stats.energy = tune.energyCost + tune.energyFloor;
    expect(fightRefusal(c)).toBeNull();
    c.stats.energy -= 0.5;
    expect(fightRefusal(c)).toBe("tired");
  });

  it("is told through startFight: a battle for a fit creature, the reason otherwise, and unavailable for an egg or the dead", () => {
    const save = hatched("cragpup");
    const before = save.creature!.stats.energy;
    const r = startFight(save, DAY);
    expect(r.status).toBe("started");
    expect(save.creature!.stats.energy).toBe(before - tune.energyCost);

    const baby = hatched("blip");
    expect(startFight(baby, DAY)).toEqual({ status: "too-young" });
    expect(baby.creature!.stats.energy).toBe(100); // a refused fight costs nothing

    const dead = hatched("cragpup");
    killCreature(dead, DAY);
    expect(startFight(dead, DAY)).toEqual({ status: "unavailable" });
  });
});

describe("the wild creature", () => {
  it("is always a creature of the player's stage, and varies from fight to fight when the stage has more than one", () => {
    for (const id of ["pebblin", "cragpup", "gravelhorn", "cindermane"]) {
      const stage = getForm(id).stage;
      const seen = new Set<string>();
      for (let seed = 1; seed <= 80; seed++) {
        const save = hatched(id, seed);
        const b = beginFight(save, save.creature!, DAY);
        expect(getForm(b.foe.formId).stage, id).toBe(stage);
        seen.add(b.foe.formId);
      }
      const kin = Object.values(forms).filter((f) => f.stage === stage).length; // (a stage with a single form can only show that one)
      if (kin > 1) expect(seen.size, id).toBeGreaterThan(1);
      else expect(seen.size, id).toBe(1);
    }
  });

  it("is as strong as the rung says: base stats times the rung's number, and the last rung is the boss", () => {
    for (let rung = 1; rung <= tune.ladder.length; rung++) {
      const save = hatched("cragpup");
      save.creature!.rung = rung;
      const b = beginFight(save, save.creature!, DAY);
      const base = getForm(b.foe.formId).baseStats;
      for (const s of ["vit", "str", "def", "spi", "spd"] as const) expect(b.foe.stats[s], `rung ${rung} ${s}`).toBe(Math.max(1, Math.round(base[s] * tune.ladder[rung - 1]!)));
      expect(b.foe.maxHp).toBe(Math.round(b.foe.stats.vit * tune.hpPerVit));
      expect(b.foe.hp).toBe(b.foe.maxHp);
      expect(b.rung).toBe(rung);
      expect(b.boss).toBe(rung === tune.ladder.length);
    }
    expect(isBossRung(tune.ladder.length)).toBe(true);
    expect(isBossRung(tune.ladder.length - 1)).toBe(false);
  });

  it("starts at the first rung, and a rung number outside the ladder is kept inside it", () => {
    const c = hatched("cragpup").creature!;
    expect(rungOf(c)).toBe(1);
    c.rung = 0;
    expect(rungOf(c)).toBe(1);
    c.rung = 99;
    expect(rungOf(c)).toBe(tune.ladder.length);
  });

  it("brings the player's own stats, HP and sulk chance into the fight, and uses up the save's random numbers", () => {
    const save = hatched("cragpup");
    const c = save.creature!;
    c.trained = { str: 3 };
    c.stats.discipline = 30;
    setHpPercent(save, 50);
    const rngBefore = save.rngState;
    const b = beginFight(save, c, DAY);
    expect(b.me.stats.str).toBe(getForm("cragpup").baseStats.str + 3);
    expect(b.me.stats.def).toBe(getForm("cragpup").baseStats.def);
    expect(b.me.maxHp).toBe(maxHp(c));
    expect(b.me.hp).toBe(Math.round(currentHp(c)));
    expect(b.sulkChance).toBeCloseTo(20 * tune.sulk.perPoint, 9);
    expect(save.rngState).not.toBe(rngBefore);
    expect(c.job ?? null).toBeNull();
  });

  it("gives the same wild creature and the same fight to the same save", () => {
    const a = hatched("cragpup", 77);
    const b = hatched("cragpup", 77);
    expect(beginFight(a, a.creature!, DAY)).toEqual(beginFight(b, b.creature!, DAY));
  });

  it("goes into a fight at 1 HP at least, however hurt it was", () => {
    const save = hatched("cragpup");
    save.creature!.hp = 0;
    expect(beginFight(save, save.creature!, DAY).me.hp).toBe(1);
  });
});

// A fight that has ended, ready to be put into the save.
function ended(save: Save, over: "won" | "lost", o: { used?: Battle["used"]; hp?: number; rung?: number; boss?: boolean } = {}): Battle {
  const c = save.creature!;
  const b = beginFight(save, c, DAY);
  b.over = over;
  b.rung = o.rung ?? b.rung;
  b.boss = o.boss ?? b.boss;
  b.me.hp = o.hp ?? 5;
  b.used = o.used ?? { attack: 2, guard: 1, special: 0 };
  return b;
}

describe("what a fight changes", () => {
  it("changes nothing for a fight that is not over", () => {
    const save = hatched("cragpup");
    const b = beginFight(save, save.creature!, DAY);
    const before = copy(save);
    expect(finishFight(save, save.creature!, b, DAY)).toBeNull();
    expect(save).toEqual(before);
    expect(endFight(save, b, DAY)).toBeNull();
  });

  it("pays a win: HP kept, battle and win counted, coins in the rung's range, and the ladder moves up", () => {
    for (let seed = 1; seed <= 40; seed++) {
      const save = hatched("cragpup", seed);
      const c = save.creature!;
      const b = ended(save, "won", { hp: 17 });
      const rung = b.rung;
      const r = finishFight(save, c, b, DAY)!;
      expect(r.won).toBe(true);
      expect(r.boss).toBe(false);
      expect(c.hp).toBe(17);
      expect(c.counters.battles).toBe(1);
      expect(c.counters.wins).toBe(1);
      expect(r.coins).toBeGreaterThanOrEqual(rung);
      expect(r.coins).toBeLessThanOrEqual(rung + tune.coinsExtra);
      expect(save.coins).toBe(r.coins);
      expect(c.rung).toBe(rung + 1);
    }
  });

  it("pays a boss double, trains double, and starts the ladder again", () => {
    const save = hatched("cragpup");
    const c = save.creature!;
    c.rung = tune.ladder.length;
    const b = ended(save, "won", { used: { attack: 3, guard: 0, special: 0 } });
    expect(b.boss).toBe(true);
    const r = finishFight(save, c, b, DAY)!;
    expect(r.boss).toBe(true);
    expect(r.coins).toBeGreaterThanOrEqual(b.rung * tune.bossFactor);
    expect(r.coins).toBeLessThanOrEqual((b.rung + tune.coinsExtra) * tune.bossFactor);
    expect(r.trained).toEqual({ stat: "str", points: tune.statGain * 2 });
    expect(c.trained?.str).toBe(tune.statGain * 2);
    expect(c.rung).toBe(1);
  });

  it("trains the stat of the action used most, with ties going to attack, then guard, then special", () => {
    const train = (used: Battle["used"]): { stat: CombatStat; points: number } | null => {
      const save = hatched("cragpup");
      return finishFight(save, save.creature!, ended(save, "won", { used }), DAY)!.trained;
    };
    expect(train({ attack: 3, guard: 1, special: 1 })).toEqual({ stat: "str", points: 1 });
    expect(train({ attack: 1, guard: 3, special: 1 })).toEqual({ stat: "def", points: 1 });
    expect(train({ attack: 0, guard: 1, special: 3 })).toEqual({ stat: "spi", points: 1 });
    expect(train({ attack: 2, guard: 2, special: 2 })?.stat).toBe("str");
    expect(train({ attack: 0, guard: 2, special: 2 })?.stat).toBe("def");
    expect(train({ attack: 0, guard: 0, special: 0 })).toBeNull(); // it only sulked
    expect(mostUsed({ attack: 0, guard: 0, special: 0 })).toBeNull();
  });

  it("stops training at the cap, and says no points were added", () => {
    const save = hatched("cragpup");
    const c = save.creature!;
    c.trained = { str: tune.trainedCap.young };
    const r = finishFight(save, c, ended(save, "won", { used: { attack: 3, guard: 0, special: 0 } }), DAY)!;
    expect(r.trained).toEqual({ stat: "str", points: 0 });
    expect(c.trained.str).toBe(tune.trainedCap.young);
  });

  it("sometimes drops a material the creature could also gather, and sometimes none", () => {
    let none = 0;
    let some = 0;
    const open = new Set(["fiber", "herb", "wood", "fish"]); // what a young one may gather (stone is for adults)
    for (let seed = 1; seed <= 80; seed++) {
      const save = hatched("cragpup", seed);
      const r = finishFight(save, save.creature!, ended(save, "won"), DAY)!;
      if (r.material) {
        some++;
        expect(open.has(r.material.id)).toBe(true);
        expect(save.inventory[r.material.id]).toBe(r.material.amount);
      } else {
        none++;
        expect(Object.keys(save.inventory)).toHaveLength(0);
      }
    }
    expect(none).toBeGreaterThan(10);
    expect(some).toBeGreaterThan(10);
  });

  it("makes a loss cost: HP drops to a quarter, energy drops, no coins, no training, and the rung stays", () => {
    const save = hatched("cragpup");
    const c = save.creature!;
    c.rung = 3;
    c.stats.energy = 60;
    const r = finishFight(save, c, ended(save, "lost"), DAY)!;
    expect(r).toEqual({ won: false, boss: false, coins: 0, material: null, trained: null });
    expect(c.hp).toBe(Math.round(maxHp(c) * tune.knockedOut.hpShare));
    expect(c.stats.energy).toBe(60 - tune.energyCost - tune.knockedOut.energy); // the fight cost energy too
    expect(c.rung).toBe(3);
    expect(c.counters.battles).toBe(1);
    expect(c.counters.wins ?? 0).toBe(0);
    expect(save.coins).toBe(0);
    expect(c.trained).toBeUndefined();
  });

  it("never lets energy go below nothing after a loss", () => {
    const save = hatched("cragpup");
    const c = save.creature!;
    c.stats.energy = 3;
    finishFight(save, c, ended(save, "lost"), DAY);
    expect(c.stats.energy).toBe(0);
  });

  it("is put into the save by endFight, which also catches the game up to now", () => {
    const save = hatched("cragpup");
    const r = startFight(save, DAY);
    if (r.status !== "started") throw new Error("could not start");
    r.battle.over = "won";
    r.battle.used = { attack: 1, guard: 0, special: 0 };
    const result = endFight(save, r.battle, DAY + 5 * MINUTE)!;
    expect(result.won).toBe(true);
    expect(save.lastSimulatedAt).toBe(DAY + 5 * MINUTE);
    expect(save.creature!.counters.wins).toBe(1);
  });
});

describe("combat and evolving", () => {
  it("carries half the trained points to the next form (rounded down), keeps the HP share, and starts the ladder and counters again", () => {
    const save = hatched("cragpup");
    const c = save.creature!;
    c.trained = { str: 11, def: 5, spi: 1 };
    c.rung = 4;
    c.counters.battles = 9;
    c.counters.wins = 6;
    setHpPercent(save, 50);
    forceEvolve(save, "gravelhorn", DAY + MINUTE);
    expect(c.formId).toBe("gravelhorn");
    expect(c.trained).toEqual({ str: 5, def: 2, spi: 0 });
    expect(c.rung).toBeUndefined();
    expect(c.counters.battles).toBe(0);
    expect(c.counters.wins).toBe(0);
    expect(c.hp! / maxHp(c)).toBeCloseTo(0.5, 1);
  });

  it("leaves a creature that was never hurt at full HP after it evolves", () => {
    const save = hatched("cragpup");
    forceEvolve(save, "gravelhorn", DAY + MINUTE);
    expect(save.creature!.hp).toBeUndefined();
    expect(currentHp(save.creature!)).toBe(maxHp(save.creature!));
  });
});

describe("dev tools for fights", () => {
  it("puts the creature on any rung of the ladder, and clamps what is typed", () => {
    const save = hatched("pebblin");
    const top = tune.ladder.length;
    setRung(save, 4);
    expect([rungNumber(save), rungOf(save.creature!)]).toEqual([4, 4]);
    setRung(save, 99);
    expect(rungNumber(save)).toBe(top);
    expect(isBossRung(rungNumber(save))).toBe(true);
    setRung(save, -3);
    expect(rungNumber(save)).toBe(1);
    expect(save.creature!.rung).toBeUndefined(); // the first rung is the same as never having fought
    setRung(save, 3.6);
    expect(rungNumber(save)).toBe(4);
    setRung(save, Number.NaN);
    expect(rungNumber(save)).toBe(1);
  });

  it("does nothing with no creature", () => {
    const save = hatched("pebblin");
    save.creature = null;
    setRung(save, 3);
    expect(rungNumber(save)).toBe(1);
    expect(save.creature).toBeNull();
  });
});
