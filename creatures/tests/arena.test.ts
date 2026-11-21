// The arena: how a round is laid out in time for the picture, where the fighters stand, and how the screen
// holds a fight (start, rounds, running away, ending, and what ends it from outside). The drawing itself is
// checked by eye in a phone browser (see known-issues.md).
import { afterEach, describe, expect, it, vi } from "vitest";
import { ARENA, FX, fighterPlace, playback, shownHp } from "../src/art/arena";
import type { Playback } from "../src/art/arena";
import { ROOM } from "../src/art/layout";
import { combatTuning } from "../src/data/combat";
import { getForm } from "../src/data/forms";
import { newBattle, newFighter, playRound } from "../src/game/combat/battle";
import type { Battle, BattleEvent } from "../src/game/combat/battle";
import { forceEvolve, killCreature } from "../src/game/dev";
import { Game } from "../src/ui/game";
import type { Save } from "../src/game/state";
import type { CombatStat } from "../src/game/types";
import { aliveSave, at } from "./helpers";

vi.mock("../src/sync/local", () => ({ writeSave: vi.fn() }));

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const SIZES = [...new Set(["blip", "pip", "fennix", "pyrefang", "solarion"].map((id) => getForm(id).idle.length))].sort((a, b) => a - b);
const strike = (actor: "me" | "foe", o: Partial<BattleEvent> = {}): BattleEvent => ({ actor, kind: "attack", damage: 5, crit: false, ko: false, ...o });
const guard = (actor: "me" | "foe"): BattleEvent => ({ actor, kind: "guard", damage: 0, crit: false, ko: false });
const sulk = (actor: "me" | "foe"): BattleEvent => ({ actor, kind: "sulk", damage: 0, crit: false, ko: false });

describe("laying a round out in time", () => {
  it("plays guards and sulks together first, then each blow in its own turn, in the order it happened", () => {
    const events = [guard("foe"), sulk("me"), strike("foe", { damage: 3 }), strike("me", { damage: 4 })];
    const play = playback(events, false);
    expect(play.steps.map((s) => s.event)).toEqual([events[0], events[1], events[2], events[3]]);
    expect(play.steps.map((s) => s.start)).toEqual([0, 0, FX.calm, FX.calm + FX.strike]);
    expect(play.steps.map((s) => s.hitAt)).toEqual([null, null, FX.calm + FX.hitAt, FX.calm + FX.strike + FX.hitAt]);
    expect(play.length).toBeCloseTo(FX.calm + 2 * FX.strike, 9);
  });

  it("starts the first blow at once when nobody guarded, and has nothing to play for an empty round", () => {
    const play = playback([strike("me"), strike("foe")], false);
    expect(play.steps.map((s) => s.start)).toEqual([0, FX.strike]);
    expect(play.length).toBeCloseTo(2 * FX.strike, 9);
    expect(playback([], false)).toEqual({ steps: [], length: 0 });
  });

  it("lingers a little longer when the fight ended, so the fall can be seen", () => {
    const events = [strike("me", { ko: true })];
    expect(playback(events, true).length).toBeCloseTo(playback(events, false).length + FX.down, 9);
  });

  it("keeps the lunge inside the time its blow takes", () => {
    expect(FX.hitAt).toBeGreaterThan(0);
    expect(FX.hitAt).toBeLessThan(FX.strike);
    expect(FX.recoil).toBeLessThanOrEqual(FX.strike - FX.hitAt + FX.strike); // a hit is over before the blow after the next one
  });
});

// A real round between two fighters, so the HP in the picture can be checked against what the rules did.
function played(meHp: number, foeHp: number, seed: number): { battle: Battle; play: Playback } {
  const stats = (str: number): Record<CombatStat, number> => ({ vit: 10, str, def: 5, spi: 10, spd: 3, });
  const battle = newBattle(newFighter("fennix", stats(14), 200, meHp), newFighter("shellby", stats(12), 200, foeHp), 2, false, 0, seed);
  playRound(battle, "attack", () => "attack");
  return { battle, play: playback(battle.events, battle.over !== null) };
}

describe("the HP bars while a round plays", () => {
  it("shows the HP from before the round until each blow lands, then takes its damage off", () => {
    const { battle, play } = played(150, 150, 7);
    const hits = play.steps.filter((s) => s.hitAt !== null);
    expect(hits).toHaveLength(2);
    expect(shownHp(battle, play, 0, "me")).toBe(150);
    expect(shownHp(battle, play, 0, "foe")).toBe(150);
    let me = 150;
    let foe = 150;
    for (const step of hits) {
      const side = step.event.actor === "me" ? "foe" : "me";
      if (side === "me") me -= step.event.damage;
      else foe -= step.event.damage;
      expect(shownHp(battle, play, step.hitAt! - 0.001, side)).toBe(side === "me" ? me + step.event.damage : foe + step.event.damage);
      expect(shownHp(battle, play, step.hitAt!, side)).toBe(side === "me" ? me : foe);
    }
    expect([shownHp(battle, play, play.length, "me"), shownHp(battle, play, play.length, "foe")]).toEqual([battle.me.hp, battle.foe.hp]);
  });

  it("never shows less than nothing when a blow is bigger than the HP that was left", () => {
    const { battle, play } = played(150, 1, 7);
    expect(battle.over).toBe("won");
    expect(shownHp(battle, play, play.length, "foe")).toBe(0);
    expect(shownHp(battle, play, 100, "foe")).toBe(0);
  });

  it("shows the real HP when no round is playing", () => {
    const { battle } = played(150, 150, 7);
    expect(shownHp(battle, null, 0, "me")).toBe(battle.me.hp);
    expect(shownHp(battle, null, 0, "foe")).toBe(battle.foe.hp);
  });
});

describe("where the fighters stand", () => {
  it("puts them side by side, feet on the ground line, without touching, whatever their size", () => {
    expect(SIZES).toEqual([16, 22, 28, 32]);
    for (const size of SIZES) {
      const me = fighterPlace("me", size, null, 0);
      const foe = fighterPlace("foe", size, null, 0);
      expect(me.y + size, `${size} px`).toBe(ARENA.feetY);
      expect(foe.y + size, `${size} px`).toBe(ARENA.feetY);
      expect(me.x + size, `${size} px`).toBeLessThan(foe.x);
      expect(me.x).toBeGreaterThanOrEqual(0);
      expect(foe.x + size).toBeLessThanOrEqual(ROOM.w);
    }
  });

  it("stays inside the picture and never overlaps the other fighter, in any blow, crit or not", () => {
    for (const size of SIZES) {
      for (const crit of [false, true]) {
        for (const actor of ["me", "foe"] as const) {
          const play = playback([guard(actor), strike(actor, { crit }), strike(actor === "me" ? "foe" : "me", { crit })], false);
          for (let t = 0; t <= play.length + 0.5; t += 0.01) {
            const me = fighterPlace("me", size, play, t);
            const foe = fighterPlace("foe", size, play, t);
            const when = `${size}px, crit ${crit}, ${actor} first, at ${t.toFixed(2)}`;
            expect(me.x, when).toBeGreaterThanOrEqual(0);
            expect(foe.x + size, when).toBeLessThanOrEqual(ROOM.w);
            expect(me.x + size, when).toBeLessThanOrEqual(foe.x);
            expect(me.y, when).toBe(ARENA.feetY - size);
            expect(foe.y, when).toBe(ARENA.feetY - size);
          }
        }
      }
    }
  });

  it("lunges at the other fighter when it strikes, and is back where it started when the blow is over", () => {
    const play = playback([strike("me")], false);
    const home = fighterPlace("me", 16, null, 0).x;
    expect(fighterPlace("me", 16, play, 0).x).toBe(home);
    expect(fighterPlace("me", 16, play, FX.hitAt).x).toBe(home + ARENA.lunge);
    expect(fighterPlace("me", 16, play, FX.strike + 0.01).x).toBe(home);
    const foeHome = fighterPlace("foe", 16, null, 0).x;
    const foePlay = playback([strike("foe")], false);
    expect(fighterPlace("foe", 16, foePlay, FX.hitAt).x).toBe(foeHome - ARENA.lunge);
  });

  it("is pushed back by a blow it takes, and more by a crit, then settles", () => {
    const home = fighterPlace("foe", 16, null, 0).x;
    const plain = playback([strike("me")], false);
    const crit = playback([strike("me", { crit: true })], false);
    const at0 = (p: Playback): number => fighterPlace("foe", 16, p, FX.hitAt).x - home;
    expect(at0(plain)).toBeGreaterThan(0); // away from the attacker, who is on the left
    expect(at0(crit)).toBeGreaterThan(at0(plain));
    expect(fighterPlace("foe", 16, plain, FX.hitAt + FX.recoil + 0.01).x).toBe(home);
    // Settled for good: a second blow of the same fighter lands later, and the one before it is long over by then.
    const two = playback([strike("me"), strike("me")], false);
    for (let t = FX.hitAt + FX.recoil + 0.01; t < FX.strike + FX.hitAt - 0.01; t += 0.01) {
      expect(fighterPlace("foe", 16, two, t).x, `at ${t.toFixed(2)}`).toBe(home);
    }
  });
});

// ---------- the screen holding a fight ----------

const T0 = at(10);

// A game with a creature old enough to fight, on a fake clock the test can move.
function gameWith(formId: string): Game {
  vi.useFakeTimers();
  vi.setSystemTime(T0 + 1000);
  vi.stubGlobal("window", { setTimeout, clearTimeout });
  const game = new Game(aliveSave(formId, T0));
  game.setScreen("arena");
  return game;
}
const wait = (seconds: number): void => void vi.advanceTimersByTime(seconds * 1000);

describe("holding a fight", () => {
  it("refuses a baby, and starts nothing", () => {
    const game = gameWith("blip");
    const energy = game.save.creature!.stats.energy;
    expect(game.fight()).toBe("too-young");
    expect(game.arena).toBeNull();
    expect(game.save.creature!.stats.energy).toBe(energy);
  });

  it("starts a fight for a creature that can, spends the energy, and holds the player in the arena", () => {
    const game = gameWith("nubbin");
    const energy = game.save.creature!.stats.energy;
    expect(game.fight()).toBe("started");
    expect(game.fighting).toBe(true);
    expect(game.save.creature!.stats.energy).toBe(energy - combatTuning.energyCost);
    game.setScreen("room");
    game.setScreen("habitat");
    expect(game.screen).toBe("arena");
    expect(game.atArena).toBe(true);
  });

  it("lets one round play out before the next, and the buttons wake when it is done", () => {
    const game = gameWith("nubbin");
    game.fight();
    expect(game.playing).toBe(false);
    game.round("guard");
    expect(game.arena!.battle.round).toBe(1);
    expect(game.playing).toBe(true);
    game.round("attack"); // too soon: ignored
    expect(game.arena!.battle.round).toBe(1);
    const length = game.arena!.play!.length;
    wait(length / 2);
    expect(game.playing).toBe(true);
    wait(length / 2 + 0.01);
    expect(game.playing).toBe(false);
    game.round("attack");
    expect(game.arena!.battle.round).toBe(2);
  });

  it("tells the screens when the round has finished playing", () => {
    const game = gameWith("nubbin");
    game.fight();
    let heard = 0;
    game.subscribe(() => heard++);
    game.round("guard");
    const afterRound = heard;
    wait(game.arena!.play!.length + 0.1);
    expect(heard).toBeGreaterThan(afterRound);
  });

  it("plays a fight to its end: it pays out once, and the card goes when the screen does", () => {
    const game = gameWith("nubbin");
    game.fight();
    const arena = game.arena!;
    for (let i = 0; i < 60 && !arena.battle.over; i++) {
      game.round("attack");
      wait(arena.play!.length + 0.1);
    }
    expect(arena.battle.over).not.toBeNull();
    expect(game.fighting).toBe(false);
    expect(arena.result).not.toBeNull();
    expect(arena.result!.won).toBe(arena.battle.over === "won");
    expect(game.save.creature!.counters.battles).toBe(1);
    const rounds = arena.battle.round;
    game.round("attack"); // a finished fight takes no more rounds
    expect(arena.battle.round).toBe(rounds);
    expect(game.save.creature!.counters.battles).toBe(1);
    game.setScreen("room");
    expect(game.screen).toBe("room");
    expect(game.arena).toBeNull();
  });

  it("lets the player run away: the energy stays spent and nothing else changes", () => {
    const game = gameWith("nubbin");
    const energy = game.save.creature!.stats.energy;
    game.fight();
    game.round("attack");
    wait(game.arena!.play!.length + 0.1);
    game.leaveFight();
    expect(game.arena).toBeNull();
    expect(game.fighting).toBe(false);
    expect(game.save.creature!.stats.energy).toBe(energy - combatTuning.energyCost);
    expect(game.save.creature!.counters.battles ?? 0).toBe(0);
    expect(game.save.coins).toBe(0);
    game.setScreen("room");
    expect(game.screen).toBe("room");
  });

  it("drops the fight when the creature dies in the middle of it, and goes back to the room", () => {
    const game = gameWith("nubbin");
    game.fight();
    killCreature(game.save, game.now());
    game.changed();
    expect(game.arena).toBeNull();
    expect(game.screen).toBe("room");
    expect(game.fighting).toBe(false);
  });

  it("drops the fight when the creature evolves in the middle of it, and stays on the arena", () => {
    const game = gameWith("nubbin");
    game.fight();
    forceEvolve(game.save, "fennix", game.now());
    game.changed();
    expect(game.arena).toBeNull();
    expect(game.screen).toBe("arena");
    expect(game.fight()).toBe("started"); // and the new form can fight at once
    expect(game.arena!.battle.me.formId).toBe("fennix");
  });

  it("forgets a fight when the whole game is replaced", () => {
    const game = gameWith("nubbin");
    game.fight();
    const fresh: Save = aliveSave("nubbin", T0 + 5000); // the same form, so only replacing the game can end the fight
    game.replaceSave(fresh);
    expect(game.arena).toBeNull();
    expect(game.screen).toBe("room");
  });

  it("an egg or a death sends any screen back to the room, and the arena does not show for them even before that", () => {
    const game = gameWith("nubbin");
    killCreature(game.save, game.now());
    expect(game.atArena).toBe(false); // the screen has not been told yet
    game.changed();
    expect(game.screen).toBe("room");
    expect(game.atArena).toBe(false);
  });
});
