// A wallpaper for each room (docs/home-plan.md section 14): which wallpaper a room shows, which room a wall tile belongs to, what a saved `walls` may hold, what a purchase that is
// undone takes off the walls, and Decorate mode's wall selection and `setWall` on the game. Rooms are columns 0-9 (bedroom), 11-20 (living room) and 22-31 (kitchen); columns 10 and
// 21 are the partitions, and the wall is rows 0 and 1. Expected values are written out by hand from src/data/home.ts and src/data/shop.ts.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { STARTER, coerceHome, homeOf, ownedWalls, wallOfRoom, wallRoomOf, withoutWall } from "../src/data/home";
import type { HomeSave } from "../src/data/home";
import { lookOf, plainLook } from "../src/art/room";
import { layoutOf } from "../src/art/homeLayout";
import { buy, undoBuy } from "../src/game/shop";
import { migrateSave, newSave } from "../src/game/state";
import type { Save } from "../src/game/state";
import { isUntouched } from "../src/sync/sync";
import { writeSave } from "../src/sync/local";
import { Game } from "../src/ui/game";
import { aliveSave, at } from "./helpers";

vi.mock("../src/sync/local", () => ({ writeSave: vi.fn(() => Promise.resolve()) })); // (the real one needs a browser, as in game-decor.test.ts)

// The nine starter pieces written out (from src/data/home.ts), so a test of what is saved does not take them from `homeOf`.
const STARTER_PIECES = {
  bed: { col: 1, row: 1 },
  dresser: { col: 6, row: 1 },
  sofa: { col: 13, row: 1 },
  rug: { col: 13, row: 4 },
  table: { col: 17, row: 4 },
  counter: { col: 23, row: 1 },
  fridge: { col: 30, row: 1 },
  mat: { col: 23, row: 5 },
  bowl: { col: 24, row: 5 },
};
const home = (walls?: HomeSave["walls"]): HomeSave => ({ pieces: {}, ...(walls ? { walls } : {}) });
const clone = (save: Save): Save => JSON.parse(JSON.stringify(save)) as Save;

describe("wallOfRoom: the wallpaper a room shows", () => {
  it("shows its own entry, and the wall of the whole home when it has none", () => {
    expect(wallOfRoom("wall-dusk", home({ bedroom: "wall-meadow" }), "bedroom")).toBe("wall-meadow");
    expect(wallOfRoom("wall-dusk", home({ bedroom: "wall-meadow" }), "living")).toBe("wall-dusk");
    expect(wallOfRoom("wall-dusk", home({ bedroom: "wall-meadow" }), "kitchen")).toBe("wall-dusk");
  });

  it("an entry of null is the plain wall, even when the whole home has a wallpaper", () => {
    expect(wallOfRoom("wall-dusk", home({ kitchen: null }), "kitchen")).toBeNull();
    expect(wallOfRoom("wall-dusk", home({ kitchen: null }), "living")).toBe("wall-dusk");
  });

  it("follows the whole home's wall when there is no home or no walls", () => {
    expect(wallOfRoom("wall-meadow", undefined, "kitchen")).toBe("wall-meadow");
    expect(wallOfRoom("wall-meadow", home(), "kitchen")).toBe("wall-meadow");
    expect(wallOfRoom(null, home(), "kitchen")).toBeNull();
  });

  it("does not take a room from the prototype chain", () => {
    expect(wallOfRoom("wall-dusk", { pieces: {}, walls: Object.create({ living: "wall-meadow" }) as HomeSave["walls"] }, "living")).toBe("wall-dusk");
  });
});

describe("wallRoomOf: the room a wall tile belongs to", () => {
  it("names the room of every column of the wall rows, a partition going to the room on its left", () => {
    for (const row of [0, 1]) {
      expect(wallRoomOf(0, row)).toBe("bedroom");
      expect(wallRoomOf(9, row)).toBe("bedroom");
      expect(wallRoomOf(10, row)).toBe("bedroom");
      expect(wallRoomOf(11, row)).toBe("living");
      expect(wallRoomOf(20, row)).toBe("living");
      expect(wallRoomOf(21, row)).toBe("living");
      expect(wallRoomOf(22, row)).toBe("kitchen");
      expect(wallRoomOf(31, row)).toBe("kitchen");
    }
  });

  it("is null below the wall, above the home, and beside it", () => {
    expect(wallRoomOf(5, 2)).toBeNull();
    expect(wallRoomOf(5, 7)).toBeNull();
    expect(wallRoomOf(5, -1)).toBeNull();
    expect(wallRoomOf(-1, 0)).toBeNull();
    expect(wallRoomOf(32, 0)).toBeNull();
  });
});

describe("withoutWall and ownedWalls", () => {
  it("withoutWall gives the very same home when no room shows that wallpaper", () => {
    const h = home({ bedroom: "wall-dusk", living: null });
    expect(withoutWall(h, "wall-meadow")).toBe(h);
    expect(withoutWall(undefined, "wall-meadow")).toBeUndefined();
    const plain = home();
    expect(withoutWall(plain, "wall-meadow")).toBe(plain);
  });

  it("withoutWall takes the rooms that show it off, keeps the others and the pieces, and drops `walls` when none are left", () => {
    const h: HomeSave = { pieces: { sofa: { col: 14, row: 1 } }, walls: { bedroom: "wall-meadow", living: "wall-meadow", kitchen: null } };
    expect(withoutWall(h, "wall-meadow")).toEqual({ pieces: { sofa: { col: 14, row: 1 } }, walls: { kitchen: null } });
    expect(withoutWall({ pieces: {}, walls: { bedroom: "wall-meadow" } }, "wall-meadow")).toEqual({ pieces: {} });
    expect("walls" in (withoutWall({ pieces: {}, walls: { bedroom: "wall-meadow" } }, "wall-meadow") as HomeSave)).toBe(false);
    expect(h.walls).toEqual({ bedroom: "wall-meadow", living: "wall-meadow", kitchen: null }); // (the home it was given is not changed)
  });

  it("ownedWalls drops a wallpaper that is not owned, keeps the plain wall and the owned ones", () => {
    expect(ownedWalls(home({ bedroom: "wall-meadow", living: "wall-dusk", kitchen: null }), ["wall-dusk"])).toEqual({ pieces: {}, walls: { living: "wall-dusk", kitchen: null } });
    expect(ownedWalls(home({ bedroom: "wall-meadow" }), [])).toEqual({ pieces: {} });
    expect(ownedWalls(home(), ["wall-dusk"])).toEqual({ pieces: {} });
  });
});

describe("homeOf carries the walls, coerceHome reads them", () => {
  it("homeOf writes the walls it is given, as a copy, and none when there are none", () => {
    const walls = { bedroom: "wall-meadow" } as const;
    const written = homeOf(STARTER, walls);
    expect(written.walls).toEqual({ bedroom: "wall-meadow" });
    expect(written.walls).not.toBe(walls);
    expect("walls" in homeOf(STARTER)).toBe(false);
    expect("walls" in homeOf(STARTER, {})).toBe(false);
  });

  it("keeps a well-formed `walls`: room keys, each a wallpaper id or null", () => {
    const read = coerceHome({ pieces: {}, walls: { bedroom: "wall-meadow", living: null, kitchen: "wall-dusk" } });
    expect(read).toEqual({ pieces: {}, walls: { bedroom: "wall-meadow", living: null, kitchen: "wall-dusk" } });
  });

  it("drops a bad `walls` alone, and keeps the pieces (edge 7)", () => {
    const pieces = { sofa: { col: 14, row: 1 } };
    for (const walls of ["x", 3, [], ["wall-dusk"], { garden: "wall-dusk" }, { constructor: null }, { bedroom: "comfy-bed" }, { bedroom: "nope" }, { bedroom: 3 }, { bedroom: undefined }, { bedroom: "wall-dusk", kitchen: {} }, { bedroom: "wall-dusk", garden: "wall-dusk" }, {}]) {
      expect(coerceHome({ pieces, walls }), JSON.stringify(walls)).toEqual({ pieces });
    }
    expect(coerceHome({ pieces, walls: null })).toEqual({ pieces });
  });

  it("still drops the whole home when the pieces are bad, whatever the walls", () => {
    expect(coerceHome({ pieces: { sofa: "x" }, walls: { bedroom: "wall-dusk" } })).toBeUndefined();
  });
});

describe("a saved game with walls (migrateSave)", () => {
  const saved = (owned: string[], walls: unknown): Save => ({ ...clone(aliveSave("blip", at(10))), owned, home: { pieces: {}, walls } }) as unknown as Save;

  it("keeps the walls of owned wallpapers and the plain wall", () => {
    const read = migrateSave(saved(["wall-dusk"], { bedroom: "wall-dusk", kitchen: null })) as Save;
    expect(read.home).toEqual({ pieces: {}, walls: { bedroom: "wall-dusk", kitchen: null } });
  });

  it("drops a wallpaper that is not owned, keeping the others and the pieces", () => {
    const read = migrateSave(saved(["wall-dusk"], { bedroom: "wall-meadow", living: "wall-dusk" })) as Save;
    expect(read.home).toEqual({ pieces: {}, walls: { living: "wall-dusk" } });
    const none = migrateSave(saved([], { bedroom: "wall-meadow" })) as Save;
    expect(none.home).toEqual({ pieces: {} });
  });

  it("an old save with no walls reads as it was (edge 6)", () => {
    const old = { ...clone(aliveSave("blip", at(10))), home: { pieces: { sofa: { col: 14, row: 1 } } } } as unknown as Save;
    expect((migrateSave(old) as Save).home).toEqual({ pieces: { sofa: { col: 14, row: 1 } } });
  });

  it("never throws on a damaged walls", () => {
    for (const walls of [null, "x", 3, [], { bedroom: {} }, Object.create(null)]) expect(() => migrateSave(saved(["wall-dusk"], walls))).not.toThrow();
  });

  it("a wall-only change makes the game worth keeping for cloud sync (edge 10)", () => {
    const save = newSave(at(10), 1);
    expect(isUntouched(save)).toBe(true);
    save.home = homeOf(layoutOf(save.home), { kitchen: null });
    expect(isUntouched(save)).toBe(false);
  });
});

describe("the Shop's undo takes the room walls that named the undone wallpaper off (edge 5)", () => {
  function bought(): Save {
    const save = aliveSave("blip", at(10));
    save.coins = 100;
    save.inventory = { herb: 5 };
    expect(buy(save, "wall-meadow", at(10))).toBe("bought");
    return save;
  }

  it("a room that shows it goes back to following the whole home's wall", () => {
    const save = bought();
    save.home = homeOf(layoutOf(save.home), { bedroom: "wall-meadow", kitchen: null });
    expect(undoBuy(save, at(10))).toBe("undone");
    expect(save.home?.walls).toEqual({ kitchen: null });
    expect(save.owned).not.toContain("wall-meadow");
  });

  it("leaves a save with no home without one", () => {
    const save = bought();
    expect(undoBuy(save, at(10))).toBe("undone");
    expect("home" in save).toBe(false);
  });
});

describe("lookOf: each room's wallpaper", () => {
  it("is the whole home's wall for a room with no entry, the entry for one with, and plain for the plain look", () => {
    const save = aliveSave("blip", at(10));
    save.owned = ["wall-meadow", "wall-dusk"];
    save.wall = "wall-meadow";
    save.home = homeOf(layoutOf(save.home), { kitchen: "wall-dusk", bedroom: null });
    expect(lookOf(save).walls).toEqual({ bedroom: null, living: "wall-meadow", kitchen: "wall-dusk" });
    expect(plainLook.walls).toEqual({ bedroom: null, living: null, kitchen: null });
    save.home = homeOf(layoutOf(save.home), { living: "wall-dusk" });
    expect(lookOf(save).walls).toEqual({ bedroom: "wall-meadow", living: "wall-dusk", kitchen: "wall-meadow" });
  });
});

describe("Decorate mode: selecting a wall and giving it a wallpaper", () => {
  let game: Game;
  let woken: number;

  function start(save = aliveSave("blip", at(10))): void {
    vi.setSystemTime(at(10));
    save.owned = ["wall-meadow", "wall-dusk"];
    game = new Game(save);
    game.view.world = "home";
    woken = 0;
    game.subscribe(() => woken++);
    vi.mocked(writeSave).mockClear();
  }

  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("window", globalThis);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("selects a room's wall and lets go of it; the screens are woken only when the selection changes", () => {
    start();
    game.startDecor();
    woken = 0;
    game.selectWall("kitchen");
    game.selectWall("kitchen");
    expect([game.selectedWall, woken]).toEqual(["kitchen", 1]);
    game.select(null);
    expect([game.selectedWall, game.decor, woken]).toEqual([null, { selected: null, wall: null }, 2]);
    game.select(null); // (nothing is selected: nobody is woken)
    expect(woken).toBe(2);
  });

  it("a piece and a wall are never selected together (edge 11)", () => {
    start();
    game.startDecor();
    game.select("sofa");
    game.selectWall("living");
    expect(game.decor).toEqual({ selected: null, wall: "living" });
    expect(game.selectedPiece).toBeNull();
    game.select("table");
    expect(game.decor).toEqual({ selected: "table", wall: null });
  });

  it("selects nothing when Decorate mode is off, and ending the mode lets go of the wall (edge 12)", () => {
    start();
    game.selectWall("living");
    expect(game.selectedWall).toBeNull();
    game.startDecor();
    game.selectWall("living");
    game.endDecor();
    expect(game.selectedWall).toBeNull();
    game.startDecor();
    expect(game.decor).toEqual({ selected: null, wall: null });
  });

  it("gives a room an owned wallpaper: saved as the player's change, with the starter pieces written whole, and the other rooms untouched", () => {
    start();
    game.startDecor();
    expect(game.setWall("bedroom", "wall-meadow")).toBe(true);
    expect(game.save.home).toEqual({ pieces: STARTER_PIECES, walls: { bedroom: "wall-meadow" } });
    vi.advanceTimersByTime(1000);
    expect(writeSave).toHaveBeenCalledTimes(1);
    expect(lookOf(game.save).walls).toEqual({ bedroom: "wall-meadow", living: null, kitchen: null });
  });

  it("gives a room the plain wall while the rest of the home has a wallpaper", () => {
    const save = aliveSave("blip", at(10));
    save.wall = "wall-dusk";
    start(save);
    game.save.wall = "wall-dusk";
    game.startDecor();
    expect(game.setWall("kitchen", null)).toBe(true);
    expect(game.save.home?.walls).toEqual({ kitchen: null });
    expect(lookOf(game.save).walls).toEqual({ bedroom: "wall-dusk", living: "wall-dusk", kitchen: null });
  });

  it("refuses what is not owned, what is not a wallpaper, and what the room already shows; nothing is saved", () => {
    start();
    game.save.owned = ["wall-dusk", "comfy-bed"];
    game.startDecor();
    expect(game.setWall("bedroom", "wall-meadow")).toBe(false); // (not owned)
    expect(game.setWall("bedroom", "comfy-bed")).toBe(false); // (owned, but not a wallpaper)
    expect(game.setWall("bedroom", "constructor")).toBe(false);
    expect(game.setWall("bedroom", null)).toBe(false); // (it is plain already)
    expect(game.save.home).toBeUndefined();
    game.setWall("bedroom", "wall-dusk");
    expect(game.setWall("bedroom", "wall-dusk")).toBe(false);
    vi.advanceTimersByTime(1000);
    expect(writeSave).toHaveBeenCalledTimes(1);
  });

  it("refuses the wallpaper a room already shows by following the whole home's wall; the plain wall is then a change", () => {
    start();
    game.save.wall = "wall-dusk";
    game.startDecor();
    expect(game.setWall("living", "wall-dusk")).toBe(false);
    expect(game.save.home).toBeUndefined();
    expect(game.setWall("living", null)).toBe(true);
    expect(game.save.home?.walls).toEqual({ living: null });
  });

  it("does nothing when Decorate mode is off", () => {
    start();
    expect(game.setWall("bedroom", "wall-dusk")).toBe(false);
    expect(game.save.home).toBeUndefined();
  });

  it("moving a piece keeps the walls, and a wall keeps the pieces (edge 8)", () => {
    start();
    game.startDecor();
    game.select("sofa");
    game.nudge(0, 1);
    game.setWall("living", "wall-dusk");
    expect(game.save.home).toEqual({ pieces: { ...STARTER_PIECES, sofa: { col: 13, row: 2 } }, walls: { living: "wall-dusk" } });
    game.select("table");
    game.nudge(0, 1);
    expect(game.save.home?.walls).toEqual({ living: "wall-dusk" });
    game.setWall("kitchen", "wall-meadow");
    expect(game.save.home?.walls).toEqual({ living: "wall-dusk", kitchen: "wall-meadow" });
    expect(layoutOf(game.save.home).sofa).toEqual({ col: 13, row: 2 });
  });

  it("the Shop's hang follows only the rooms with no wallpaper of their own (edge 9)", () => {
    start();
    game.startDecor();
    game.setWall("bedroom", "wall-meadow");
    game.save.wall = "wall-dusk";
    expect(lookOf(game.save).walls).toEqual({ bedroom: "wall-meadow", living: "wall-dusk", kitchen: "wall-dusk" });
  });
});
