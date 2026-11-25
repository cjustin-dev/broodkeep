// Decorate mode on the game (ui/game.ts: startDecor, endDecor, select, bringOut, putAway, nudge, setLayout). The mode is screen state and never reaches the save; the layout
// does, through the same save-and-sync path as any other change the player makes. The places are those of the starter layout in src/data/home.ts.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { STARTER, homeOf } from "../src/data/home";
import type { Layout } from "../src/data/home";
import { layoutOf } from "../src/art/homeLayout";
import { writeSave } from "../src/sync/local";
import { Game } from "../src/ui/game";
import { aliveSave, at } from "./helpers";

vi.mock("../src/sync/local", () => ({ writeSave: vi.fn(() => Promise.resolve()) })); // (the real one needs a browser, as in game-save-hook.test.ts)

let game: Game;
let told: boolean[];
let woken: number;

function start(layout?: Layout): void {
  vi.setSystemTime(at(10));
  const save = aliveSave("blip", at(10));
  if (layout) save.home = homeOf(layout);
  game = new Game(save);
  game.view.world = "home"; // (the Stage puts it there on its first frame)
  told = [];
  woken = 0;
  game.onSave = (byPlayer) => told.push(byPlayer);
  game.subscribe(() => woken++);
  vi.mocked(writeSave).mockClear();
}
const without = (...kinds: Array<keyof Layout>): Layout => ({ ...STARTER, ...Object.fromEntries(kinds.map((k) => [k, null])) });
const layout = (): Layout => layoutOf(game.save.home);

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("window", globalThis);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("starting and ending Decorate mode", () => {
  it("starts on the home's picture: nothing selected, the creature told to stand still, the screens woken", () => {
    start();
    expect(game.startDecor()).toBe(true);
    expect(game.decor).toEqual({ selected: null, wall: null });
    expect(game.view.still).toBe(true);
    expect(woken).toBe(1);
  });

  it("is not saved: no write to the device, and nothing counted as the player's change", () => {
    start();
    game.startDecor();
    game.select("sofa");
    game.endDecor();
    vi.advanceTimersByTime(5000);
    expect(writeSave).not.toHaveBeenCalled();
    expect(told).toEqual([]);
    expect(game.save.home).toBeUndefined();
  });

  it("does not start in the one-line room (a field), on another screen, in a scene, or twice", () => {
    start();
    game.view.world = "line";
    expect(game.startDecor()).toBe(false);
    game.view.world = "home";
    game.screen = "habitat";
    expect(game.startDecor()).toBe(false);
    game.screen = "room";
    game.view.moment = { kind: "hatch", t: 0 } as unknown as Game["view"]["moment"];
    expect(game.startDecor()).toBe(false);
    game.view.moment = null;
    expect(game.startDecor()).toBe(true);
    woken = 0;
    expect(game.startDecor()).toBe(false);
    expect(woken).toBe(0);
  });

  it("ends: the creature may move again and the screens are woken, once; ending when off wakes nothing", () => {
    start();
    game.endDecor();
    expect(woken).toBe(0);
    game.startDecor();
    woken = 0;
    game.endDecor();
    expect([game.decor, game.view.still, woken]).toEqual([null, false, 1]);
  });

  it("ends when the player leaves the room screen, and when a game from the account replaces this one", () => {
    start();
    game.startDecor();
    game.setScreen("habitat");
    expect([game.decor, game.view.still]).toEqual([null, false]);
    game.setScreen("room");
    game.startDecor();
    game.replaceSave(aliveSave("blip", at(10)));
    expect([game.decor, game.view.still]).toEqual([null, false]);
  });
});

describe("select and selectedPiece", () => {
  it("selects a piece and lets go of it; the screens are woken only when the selection changes", () => {
    start();
    game.startDecor();
    woken = 0;
    game.select("sofa");
    game.select("sofa");
    expect([game.decor?.selected, game.selectedPiece, woken]).toEqual(["sofa", "sofa", 1]);
    game.select(null);
    expect([game.decor?.selected, game.selectedPiece]).toEqual([null, null]);
  });

  it("selects nothing when Decorate mode is off", () => {
    start();
    game.select("sofa");
    expect([game.decor, game.selectedPiece, woken]).toEqual([null, null, 0]);
  });

  it("does not count a selected piece that is not out in the home any more (it was put away on another device)", () => {
    start();
    game.startDecor();
    game.select("sofa");
    game.save.home = homeOf(without("sofa"));
    expect(game.selectedPiece).toBeNull();
  });
});

describe("bringOut: a piece from the tray", () => {
  it("lands on the nearest allowed spot to the middle of the view, is selected, and is saved as the player's change", () => {
    start(without("dresser"));
    game.startDecor();
    expect(game.bringOut("dresser", { col: 7, row: 2 })).toBe(true);
    expect(layout()).toEqual(STARTER); // the dresser is back at (6,1)
    expect(game.selectedPiece).toBe("dresser");
    vi.advanceTimersByTime(1000);
    expect(writeSave).toHaveBeenCalledTimes(1);
    expect(vi.mocked(writeSave).mock.calls[0]?.[0].home).toEqual(homeOf(STARTER));
    expect(told).toEqual([true]);
  });

  it("goes near the middle, not to the old place: the table with the view's middle at (25,4) lands at (24,3)", () => {
    start(without("table"));
    game.startDecor();
    game.bringOut("table", { col: 25, row: 4 });
    expect(layout().table).toEqual({ col: 24, row: 3 });
  });

  it("brings out nothing that is already out, nothing when Decorate mode is off, and the Feeding Mat only once it is owned", () => {
    start(without("mat", "dresser"));
    expect(game.bringOut("dresser", { col: 7, row: 2 })).toBe(false); // (off: with the mode on the dresser would come out at (6,1))
    expect(layout().dresser).toBeNull();
    game.startDecor();
    expect(game.bringOut("sofa", { col: 25, row: 4 })).toBe(false); // (already out)
    expect(game.bringOut("mat", { col: 25, row: 4 })).toBe(false); // (not owned)
    expect(layout().mat).toBeNull();
    game.save.owned.push("feeding-mat");
    expect(game.bringOut("mat", { col: 25, row: 4 })).toBe(true);
    expect(layout().mat).not.toBeNull();
  });
});

describe("putAway: the selected piece into the tray", () => {
  it("puts the selected piece away and lets go of it; the layout is saved", () => {
    start();
    game.startDecor();
    game.select("dresser");
    expect(game.putAway()).toBe(true);
    expect(layout()).toEqual(without("dresser"));
    expect(game.decor?.selected).toBeNull();
    vi.advanceTimersByTime(1000);
    expect(writeSave).toHaveBeenCalledTimes(1);
  });

  it("does nothing with nothing selected, and never puts the bed away", () => {
    start();
    game.startDecor();
    expect(game.putAway()).toBe(false);
    game.select("bed");
    expect(game.putAway()).toBe(false);
    expect(layout()).toEqual(STARTER);
    expect(game.save.home).toBeUndefined();
    expect(game.selectedPiece).toBe("bed");
  });
});

describe("nudge: the arrow keys", () => {
  it("moves the selected piece one tile: the sofa down from (13,1) to (13,2), and keeps it selected", () => {
    start();
    game.startDecor();
    game.select("sofa");
    expect(game.nudge(0, 1)).toBe(true);
    expect(layout().sofa).toEqual({ col: 13, row: 2 });
    expect(game.selectedPiece).toBe("sofa");
  });

  it("does not move it where the rules refuse (up into the wall's top row, left onto the partition) and changes nothing", () => {
    start();
    game.startDecor();
    game.select("sofa");
    expect(game.nudge(0, -1)).toBe(false);
    expect(game.nudge(-3, 0)).toBe(false); // columns 10-13: over the partition
    expect(game.save.home).toBeUndefined();
    vi.advanceTimersByTime(1000);
    expect(writeSave).not.toHaveBeenCalled();
  });

  it("does nothing with nothing selected", () => {
    start();
    game.startDecor();
    expect(game.nudge(1, 0)).toBe(false);
  });
});
