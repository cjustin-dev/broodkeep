// Game tells the cloud sync each time it saves, and whether the player did something since the last save (ui/game.ts).
// A save that only carries the clock forward must not count, or a device left open and idle would beat the one in use (sync/sync.ts).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { feed } from "../src/game/actions";
import { MINUTE } from "../src/game/time";
import { writeSave } from "../src/sync/local";
import { Game } from "../src/ui/game";
import { aliveSave, at } from "./helpers";

// The write to the device is replaced by one the test can hold back (the real one needs a browser).
vi.mock("../src/sync/local", () => ({ writeSave: vi.fn(() => Promise.resolve()) }));

let game: Game;
let told: boolean[];

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(at(10));
  vi.stubGlobal("window", globalThis); // the game saves with window.setTimeout
  game = new Game(aliveSave("blip", at(10)));
  told = [];
  game.onSave = (byPlayer) => told.push(byPlayer);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const clockMovesOn = (minutes: number): void => {
  vi.setSystemTime(Date.now() + minutes * MINUTE);
  game.tick();
};

describe("the save hook", () => {
  it("answers saveNow with the write itself, so a caller can wait until the game is on the device", async () => {
    let finish!: () => void;
    vi.mocked(writeSave).mockReturnValueOnce(new Promise<void>((resolve) => (finish = resolve)));
    let answered = false;
    void game.saveNow().then(() => (answered = true));
    await vi.advanceTimersByTimeAsync(0);
    expect(answered).toBe(false); // the write has not finished
    expect(writeSave).toHaveBeenLastCalledWith(game.save, "save"); // the first profile's device key
    finish();
    await vi.advanceTimersByTimeAsync(0);
    expect(answered).toBe(true);
  });

  it("says a save is the player's when the player did something", () => {
    game.act((save, now) => feed(save, "meat", now));
    game.saveNow();
    expect(told).toEqual([true]);
  });

  it("says a save is not the player's when only the clock moved on", () => {
    clockMovesOn(5);
    game.saveNow();
    expect(told).toEqual([false]);
  });

  it("says a game put in from the account is not the player's", () => {
    game.replaceSave(aliveSave("blip", at(9)));
    game.saveNow();
    expect(told).toEqual([false]);
  });

  it("counts a save as the player's when the player acted between clock saves, and starts again afterwards", () => {
    clockMovesOn(5);
    game.act((save, now) => feed(save, "meat", now));
    clockMovesOn(5);
    game.saveNow();
    clockMovesOn(5);
    game.saveNow();
    expect(told).toEqual([true, false]);
  });

  it("saves by itself shortly after a change, and tells the hook then", () => {
    game.act((save, now) => feed(save, "meat", now));
    expect(told).toEqual([]);
    vi.advanceTimersByTime(700);
    expect(told).toEqual([true]);
  });
});
