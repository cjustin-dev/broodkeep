// The hatch and evolve scenes: when they start and stop, and the flash. The drawing itself is
// looks only and is checked in the browser.
import { afterEach, describe, expect, it, vi } from "vitest";
import { createView } from "../src/art/idle";
import { ROOM, walkMaxX } from "../src/art/layout";
import { EVOLVE, HATCH, flashAlpha, shownOf, stepMoment } from "../src/art/moment";
import { forceEvolve, forceHatch, killCreature, spawnEgg } from "../src/game/dev";
import { newSave } from "../src/game/state";
import { Game } from "../src/ui/game";
import { HOUR } from "../src/game/time";
import { aliveSave, at } from "./helpers";

vi.mock("../src/sync/local", () => ({ writeSave: vi.fn() }));

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const FRAME = 1 / 60;

// Run the scene for this many seconds in frames.
function run(view: ReturnType<typeof createView>, save: Parameters<typeof stepMoment>[1], seconds: number): void {
  for (let t = 0; t < seconds; t += FRAME) stepMoment(view, save, FRAME);
}

describe("when a scene starts", () => {
  it("does nothing the first time it sees a save, even a creature that is already grown", () => {
    const view = createView();
    stepMoment(view, aliveSave("gravelhorn", at(8)), FRAME);
    expect(view.moment).toBeNull();
    expect(view.shown).toEqual({ phase: "alive", formId: "gravelhorn" });
  });

  it("hatching plays a scene, with the egg that broke and the baby where the egg was", () => {
    const t0 = at(8);
    const save = newSave(t0, 7);
    save.egg!.pattern = "striped";
    const view = createView();
    stepMoment(view, save, FRAME);
    expect(view.moment).toBeNull();
    forceHatch(save, "blip", t0);
    view.x = 10; // it was somewhere else
    stepMoment(view, save, FRAME);
    expect(view.moment?.kind).toBe("hatch");
    expect(view.moment?.pattern).toBe("striped");
    expect(view.x).toBe(ROOM.eggX);
  });

  it("evolving plays a scene that remembers the old form", () => {
    const t0 = at(8);
    const save = aliveSave("cragpup", t0);
    const view = createView();
    stepMoment(view, save, FRAME);
    forceEvolve(save, "gravelhorn", t0 + 1000);
    stepMoment(view, save, FRAME);
    expect(view.moment?.kind).toBe("evolve");
    expect(view.moment?.from).toBe("cragpup");
  });

  it("a creature that stays the same form, dies, or goes back to an egg plays nothing", () => {
    const t0 = at(8);
    const save = aliveSave("cragpup", t0);
    const view = createView();
    stepMoment(view, save, FRAME);
    stepMoment(view, save, FRAME);
    expect(view.moment).toBeNull();
    killCreature(save, t0 + 1000);
    stepMoment(view, save, FRAME);
    expect(view.moment).toBeNull();
    spawnEgg(save, t0 + 2000);
    stepMoment(view, save, FRAME);
    expect(view.moment).toBeNull();
  });

  it("a creature that evolves in its sleep gets no scene", () => {
    const t0 = at(8);
    const save = aliveSave("blip", t0);
    const view = createView();
    stepMoment(view, save, FRAME);
    save.creature!.sleep = "night";
    forceEvolve(save, "pebblin", t0 + 1000);
    stepMoment(view, save, FRAME);
    expect(view.moment).toBeNull();
    expect(view.shown).toEqual({ phase: "alive", formId: "pebblin" });
  });

  it("a scene stops when the creature dies or is replaced by an egg", () => {
    const t0 = at(8);
    for (const end of [killCreature, spawnEgg]) {
      const save = aliveSave("cragpup", t0);
      const view = createView();
      stepMoment(view, save, FRAME);
      forceEvolve(save, "gravelhorn", t0 + 1000);
      run(view, save, 0.5);
      expect(view.moment?.kind).toBe("evolve");
      end(save, t0 + 2000);
      stepMoment(view, save, FRAME);
      expect(view.moment).toBeNull();
    }
  });

  it("a change seen against the form the screen remembered (as after a catch-up) starts a scene", () => {
    // The game remembers what was on screen before the catch-up (see Game's constructor).
    const save = aliveSave("blip", at(8));
    const view = createView();
    view.shown = shownOf(save);
    forceEvolve(save, "pebblin", at(8) + 1000);
    stepMoment(view, save, FRAME);
    expect(view.moment?.kind).toBe("evolve");
  });
});

describe("how a scene runs", () => {
  it("a hatch lasts its length, then ends; at the pop the baby hops and sparkles appear", () => {
    const t0 = at(8);
    const save = newSave(t0, 7);
    const view = createView();
    stepMoment(view, save, FRAME);
    forceHatch(save, "blip", t0);
    run(view, save, HATCH.pop - 0.1);
    expect(view.pose).not.toBe("happy");
    expect(view.effects).toHaveLength(0);
    run(view, save, 0.2);
    expect(view.pose).toBe("happy");
    expect(view.effects).toHaveLength(7); // one burst, not one every frame
    run(view, save, HATCH.length);
    expect(view.moment).toBeNull();
  });

  it("an evolve stands still while the old form flickers, then hops when the new form shows", () => {
    const t0 = at(8);
    const save = aliveSave("cragpup", t0);
    const view = createView();
    stepMoment(view, save, FRAME);
    view.pose = "walk"; // it was walking about
    forceEvolve(save, "gravelhorn", t0 + 1000);
    run(view, save, EVOLVE.swap - 0.1);
    expect(view.pose).toBe("idle");
    expect(view.effects).toHaveLength(0);
    run(view, save, 0.2);
    expect(view.pose).toBe("happy");
    expect(view.effects).toHaveLength(7);
    run(view, save, EVOLVE.length);
    expect(view.moment).toBeNull();
  });
});

describe("evolving into a different size", () => {
  // A creature of one form standing at x, seen by the screen, then evolving into another form.
  function evolveAt(from: string, to: string, x: number) {
    const t0 = at(8);
    const save = aliveSave(from, t0);
    const view = createView();
    stepMoment(view, save, FRAME);
    view.x = x;
    forceEvolve(save, to, t0 + 1000);
    stepMoment(view, save, FRAME);
    return { view, save };
  }

  it("keeps the middle of the creature where it was, and takes the new size", () => {
    const { view } = evolveAt("pebblin", "cragpup", 30); // 24 wide, middle at 42, becomes 36 wide
    expect(view.size).toBe(36);
    expect(view.x).toBe(42 - 18);
    const small = evolveAt("blip", "pebblin", 30); // 20 wide, middle at 40, becomes 24 wide
    expect(small.view.size).toBe(24);
    expect(small.view.x).toBe(40 - 12);
  });

  it("stays inside the walking area when it was at either edge", () => {
    const right = evolveAt("pebblin", "cragpup", walkMaxX(24)).view;
    expect(right.x).toBe(walkMaxX(36)); // pushed back from the wall
    const left = evolveAt("pebblin", "cragpup", ROOM.walkMinX).view;
    expect(left.x).toBe(ROOM.walkMinX);
  });

  it("every sparkle of the burst lands inside the room, whatever the size", () => {
    for (const [from, to] of [["blip", "pebblin"], ["pebblin", "cragpup"], ["cragpup", "gravelhorn"]] as const) {
      for (const x of [ROOM.walkMinX, 30, 80]) {
        const { view, save } = evolveAt(from, to, x);
        run(view, save, EVOLVE.swap + 0.1);
        expect(view.effects, `${from} to ${to}`).toHaveLength(7);
        const spread = Math.max(...view.effects.map((fx) => fx.x)) - Math.min(...view.effects.map((fx) => fx.x));
        expect(spread, `${from} to ${to}: spread out to the size of the new form`).toBeGreaterThanOrEqual(view.size);
        for (const fx of view.effects) {
          expect(fx.x).toBeGreaterThanOrEqual(0);
          expect(fx.x).toBeLessThanOrEqual(ROOM.w);
          expect(fx.y).toBeGreaterThanOrEqual(0);
          expect(fx.y).toBeLessThanOrEqual(ROOM.groundY);
        }
      }
    }
  });
});

describe("the flash", () => {
  for (const kind of ["hatch", "evolve"] as const) {
    it(`${kind}: dark at first, brightest at the change, fading to nothing, never fully white`, () => {
      const spec = kind === "hatch" ? HATCH : EVOLVE;
      const turn = kind === "hatch" ? HATCH.pop : EVOLVE.swap;
      expect(flashAlpha({ kind, time: 0 })).toBe(0);
      expect(flashAlpha({ kind, time: turn - spec.flashIn - 0.01 })).toBe(0);
      const rising = [0.25, 0.5, 0.75].map((f) => flashAlpha({ kind, time: turn - spec.flashIn * (1 - f) }));
      expect(rising[0]).toBeLessThan(rising[1]!);
      expect(rising[1]).toBeLessThan(rising[2]!);
      const peak = flashAlpha({ kind, time: turn });
      expect(peak).toBeGreaterThan(0.5);
      expect(peak).toBeLessThan(1);
      expect(flashAlpha({ kind, time: turn + spec.flashOut / 2 })).toBeLessThan(peak);
      expect(flashAlpha({ kind, time: turn + spec.flashOut + 0.01 })).toBe(0);
    });
  }
});

describe("replacing the game", () => {
  it("erasing everything during a scene drops the scene", () => {
    const t0 = at(8);
    const save = aliveSave("cragpup", t0);
    vi.useFakeTimers();
    vi.setSystemTime(t0 + 1000);
    vi.stubGlobal("window", { setTimeout, clearTimeout });
    const game = new Game(save);
    forceEvolve(game.save, "gravelhorn", t0 + 1000);
    stepMoment(game.view, game.save, FRAME);
    expect(game.view.moment?.kind).toBe("evolve");
    game.replaceSave(newSave(t0 + 2000, 3));
    expect(game.view.moment).toBeNull();
    expect(game.view.shown).toEqual(shownOf(game.save));
  });
});

describe("opening the game", () => {
  it("an evolution that happens during the catch-up still plays its scene", () => {
    const t0 = at(8);
    const save = aliveSave("blip", t0); // hatched at t0, so the baby stage ends at t0 + 6 h
    vi.useFakeTimers();
    vi.setSystemTime(t0 + 7 * HOUR); // the app was closed for 7 hours
    vi.stubGlobal("window", { setTimeout, clearTimeout });
    const game = new Game(save);
    expect(game.save.creature?.formId).not.toBe("blip"); // it grew up while we were away
    expect(game.view.moment).toBeNull();
    stepMoment(game.view, game.save, FRAME);
    expect(game.view.moment?.kind).toBe("evolve");
    expect(game.view.moment?.from).toBe("blip");
  });
});
