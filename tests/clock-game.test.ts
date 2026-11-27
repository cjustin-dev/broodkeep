// The sped-up dev clock on the Game's tick (src/ui/game.ts `tick`, game/dev.ts `advanceClock`): bedtime stays the real clock's however fast the game clock runs
// (docs/decisions.md, "The real clock and the dev clock offset"). Time here is the real clock under fake timers: one `run(1)` is one `tick()` a second later.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Game } from "../src/ui/game";
import { writeSave } from "../src/sync/local";
import { at, careState, stageForm } from "./helpers";

// The write to the device is replaced (the real one needs a browser), as in tappables-game.test.ts.
vi.mock("../src/sync/local", () => ({ writeSave: vi.fn(() => Promise.resolve()) }));

function start(t: number): Game {
  vi.setSystemTime(t);
  const game = new Game(careState(stageForm("adult"), {}, t)); // an awake adult at home; sleeping hours 20 to 7
  vi.mocked(writeSave).mockClear();
  return game;
}

function run(game: Game, seconds: number, each?: () => void): void {
  for (let k = 0; k < seconds; k++) {
    vi.advanceTimersByTime(1000);
    game.tick();
    each?.();
  }
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("window", globalThis); // the game uses window.setTimeout
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("a sped-up clock", () => {
  it("keeps the creature awake in the real afternoon while the game clock runs on into the night", () => {
    const game = start(at(14, 0));
    game.devSpeed = 1000; // each real second is 1000 game seconds: 30 ticks run the game clock from 14:00 to about 22:20
    run(game, 30, () => expect(game.save.creature?.sleep).toBeNull());
    expect(game.save.clockOffsetMs).toBeGreaterThan(8 * 3_600_000); // the game clock really did pass its 20:00
    expect(game.now() - Date.now()).toBe(game.save.clockOffsetMs);
    expect(game.save.log.some((e) => e.text === "Fell asleep for the night")).toBe(false);
  });

  it("puts the creature to bed at the real bedtime, in the tick that crosses it", () => {
    const game = start(at(19, 59) + 59_500); // 19:59:59.5 on the real clock
    game.devSpeed = 1000;
    run(game, 1); // 20:00:00.5: this tick runs 16 game minutes, every one of them at the real clock's 20:00
    expect(game.save.creature?.sleep).toBe("night");
  });
});

describe("a normal-speed clock", () => {
  it("lives each real night of a long absence: one tick across 14 hours sleeps at 8 pm and wakes at 7 am", () => {
    const game = start(at(19, 0));
    vi.setSystemTime(at(9, 0, 6)); // 14 hours later with no timer fired, so the next tick covers all of it at once (devSpeed is 1)
    game.tick();
    expect(game.save.creature?.sleep).toBeNull();
    expect(game.save.log.find((e) => e.text === "Fell asleep for the night")?.at).toBe(at(20, 0));
    expect(game.save.log.find((e) => e.text === "Woke up")?.at).toBe(at(7, 0, 6));
  });
});
