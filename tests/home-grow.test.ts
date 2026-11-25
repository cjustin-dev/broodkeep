// The house grows (docs/home-plan.md section 16, slice H3): the Playroom is a fourth room, columns 33 to 42, behind a partition at column 32 (the kitchen is columns 22 to 31), built when
// the Shop's "room-play" is owned. These tests are about what the number of rooms built changes: the width, the floor, the walking, the six rules, the repair of a layout the new room
// breaks, what the Shop's undo gives back, which rooms the Game lets Decorate mode select, and what a saved game may hold. "Edge Gn" is the plan's list. Expected values are written out by
// hand from src/data/home.ts (rooms 0-9, 11-20, 22-31, 33-42; wall rows 0 and 1; the doorways are rows 4 and 5 of the partition columns 10, 21 and 32).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BASE_ROOMS, COLS, PARTITIONS, ROOMS, STARTER, coerceHome, colsOf, isBuilt, roomsBuilt, wallRoomOf, withoutRoom } from "../src/data/home";
import type { HomeSave, Layout } from "../src/data/home";
import { HOME, bedFront, findPath, isFloor, layoutInForce, reachableFrom, roomOf, roomsInForce, startAnchor, useLayout, withLayout } from "../src/art/home";
import { drop, follow, nearestSpot } from "../src/art/homeEdit";
import { layoutOf, layoutOfSave, problemWith } from "../src/art/homeLayout";
import { createView, reseat } from "../src/art/idle";
import { lookOf } from "../src/art/room";
import { isRoomItemId, items } from "../src/data/shop";
import { buy, undoBuy } from "../src/game/shop";
import { migrateSave } from "../src/game/state";
import { writeSave } from "../src/sync/local";
import { Game } from "../src/ui/game";
import { aliveSave, at } from "./helpers";

vi.mock("../src/sync/local", () => ({ writeSave: vi.fn(() => Promise.resolve()) })); // (the real one needs a browser, as in game-decor.test.ts)

afterEach(() => useLayout(STARTER, BASE_ROOMS)); // (the layout and the rooms in force are module state: every test puts the three base rooms back)

describe("how many rooms are built", () => {
  it("is the three base rooms, and the Playroom once its item is owned (once, whatever else is owned)", () => {
    expect(roomsBuilt([])).toBe(3);
    expect(roomsBuilt(["comfy-bed", "hat-knit", "wall-dusk"])).toBe(3);
    expect(roomsBuilt(["room-play"])).toBe(4);
    expect(roomsBuilt(["hat-knit", "room-play", "room-play"])).toBe(4);
    expect(roomsBuilt(["constructor", "__proto__"])).toBe(3);
  });

  it("gives the columns of a home with that many rooms: 32 with three, 43 with four, and never less than three or more than the rooms there are", () => {
    expect([colsOf(3), colsOf(4), colsOf(0), colsOf(2), colsOf(99)]).toEqual([32, 43, 32, 32, 43]);
    expect([COLS, BASE_ROOMS]).toEqual([43, 3]);
  });

  it("says which rooms are built for what a save owns", () => {
    expect(isBuilt("playroom", [])).toBe(false);
    expect(isBuilt("playroom", ["room-play"])).toBe(true);
    expect(["bedroom", "living", "kitchen"].map((id) => isBuilt(id as "bedroom", []))).toEqual([true, true, true]);
  });

  it("lists the rooms and partitions as the plan says, and the Playroom is built by the Shop's one room item", () => {
    expect(ROOMS.map((r) => [r.id, r.from, r.to, r.item ?? null])).toEqual([
      ["bedroom", 0, 9, null],
      ["living", 11, 20, null],
      ["kitchen", 22, 31, null],
      ["playroom", 33, 42, "room-play"],
    ]);
    expect(PARTITIONS).toEqual([10, 21, 32]);
    expect([items["room-play"].kind, items["room-play"].name, isRoomItemId("room-play"), isRoomItemId("hat-knit"), isRoomItemId("constructor")]).toEqual(["room", "Playroom", true, false, false]);
    expect(items["room-play"].effect).toBe("A fourth room, to the right of the kitchen. It starts empty.");
  });
});

describe("the floor and the width of the home in force (edges G2, G3, G19)", () => {
  it("with three rooms the home is 768 wide and nothing past column 31 is floor", () => {
    useLayout(STARTER, 3);
    expect([HOME.w, HOME.h, roomsInForce()]).toEqual([768, 192, 3]);
    expect([isFloor(31, 4), isFloor(32, 4), isFloor(33, 4), isFloor(40, 6)]).toEqual([true, false, false, false]);
  });

  it("with four rooms the home is 1032 wide, the partition at column 32 is floor only in its doorway (rows 4 and 5), and the Playroom's floor is rows 2 to 7", () => {
    useLayout(STARTER, 4);
    expect([HOME.w, roomsInForce()]).toEqual([1032, 4]);
    expect([4, 5].map((row) => isFloor(32, row))).toEqual([true, true]);
    expect([2, 3, 6, 7].map((row) => isFloor(32, row))).toEqual([false, false, false, false]);
    expect([isFloor(33, 2), isFloor(33, 1), isFloor(42, 7), isFloor(43, 4), isFloor(34, 0)]).toEqual([true, false, true, false, false]);
  });

  it("the same starter layout at three and then four rooms changes the floor and the width: a profile that never moved anything has no other way to tell (the Stage compares the rooms)", () => {
    expect(layoutOf(undefined, 3)).toBe(layoutOf(undefined, 4)); // (both are the one starter object, which is why `useLayout` must look at the rooms too)
    useLayout(STARTER, 3);
    useLayout(layoutOfSave({ owned: ["room-play"] }), roomsBuilt(["room-play"]));
    expect([HOME.w, isFloor(40, 5), roomsInForce()]).toEqual([1032, true, 4]);
    useLayout(layoutOfSave({ owned: [] }), 3);
    expect([HOME.w, isFloor(40, 5), roomsInForce()]).toEqual([768, false, 3]);
  });

  it("`withLayout` runs on the rooms it is given and puts the layout and the rooms back, also when what it runs throws", () => {
    useLayout(STARTER, 3);
    const inside = withLayout(STARTER, () => [HOME.w, roomsInForce()], 4);
    expect(inside).toEqual([1032, 4]);
    expect(() =>
      withLayout(
        STARTER,
        () => {
          throw new Error("x");
        },
        4,
      ),
    ).toThrow("x");
    expect([HOME.w, roomsInForce(), layoutInForce() === STARTER]).toEqual([768, 3, true]);
    // a trial on fewer rooms than are in force puts the larger home back
    useLayout(STARTER, 4);
    expect(withLayout(STARTER, () => [HOME.w, roomsInForce()], 3)).toEqual([768, 3]);
    expect([HOME.w, roomsInForce()]).toEqual([1032, 4]);
  });

  it("`roomOf` names the Playroom's columns once it is built, and with three rooms a position past the home is the kitchen's", () => {
    expect([800, 1031, 5000].map(roomOf)).toEqual(["kitchen", "kitchen", "kitchen"]); // (columns 33, 42 and the clamp: the last column of three rooms is 31)
    useLayout(STARTER, 4);
    expect([767, 768, 791, 792, 1031, 5000, -5].map(roomOf)).toEqual(["kitchen", "kitchen", "kitchen", "playroom", "playroom", "playroom", "bedroom"]); // (column 32 is the partition: the kitchen's)
  });
});

describe("walking in the home that grew (edges G3, G4)", () => {
  it("the Playroom adds 62 anchors a creature one tile wide can reach (10 columns x 6 floor rows, and the doorway's two tiles) and 58 for one two tiles wide", () => {
    useLayout(STARTER, 3);
    const one3 = reachableFrom(startAnchor(24), 1).size;
    const two3 = reachableFrom(startAnchor(48), 2).size;
    useLayout(STARTER, 4);
    expect(reachableFrom(startAnchor(24), 1).size - one3).toBe(62);
    expect(reachableFrom(startAnchor(48), 2).size - two3).toBe(58); // (9 x 6 anchors in the room, and two in the doorway's rows at columns 31 and two at 32)
  });

  it("a sleepy creature in the far corner of the Playroom walks to the bed through all three doorways, rows 4 or 5 of columns 32, 21 and 10", () => {
    useLayout(STARTER, 4);
    const path = findPath({ col: 41, row: 7 }, bedFront(48), 2);
    expect(path).not.toBeNull();
    for (const partition of PARTITIONS) {
      expect(path!.some((a) => (a.row === 4 || a.row === 5) && a.col <= partition && a.col + 1 >= partition), `column ${partition}`).toBe(true);
    }
  });

  it("a creature put in the Playroom and then given the room back is put on the nearest free anchor of the home that is left (`reseat`)", () => {
    useLayout(STARTER, 4);
    const view = createView();
    view.world = "home";
    view.placed = "home";
    view.size = 24;
    view.x = 912; // column 38
    view.y = 144; // the feet line of row 5
    useLayout(STARTER, 3);
    reseat(view);
    expect([view.x, view.y]).toEqual([744, 144]); // anchor (31, 5), the kitchen's last column
  });
});

describe("the six rules with four rooms (edges G3, G5, G6)", () => {
  const piece = (kind: keyof Layout, col: number, row: number): Layout => ({ ...STARTER, [kind]: { col, row } });

  it("the starter layout passes with three rooms and with four", () => {
    expect([problemWith(STARTER, 3), problemWith(STARTER, 4)]).toEqual([null, null]);
  });

  it("rule 1: a piece may stand in the Playroom only when it is built, and never across the partition or past the last column", () => {
    expect(problemWith(piece("sofa", 35, 1), 4)).toBeNull();
    expect(problemWith(piece("sofa", 35, 1), 3)).toBe("sofa is not inside one room");
    expect(problemWith(piece("table", 31, 4), 4)).toBe("table is not inside one room"); // columns 31 and 32
    expect(problemWith(piece("dresser", 41, 1), 4)).toBeNull(); // columns 41 and 42
    expect(problemWith(piece("dresser", 42, 1), 4)).toBe("dresser is not inside one room"); // columns 42 and 43
    expect(problemWith(piece("dresser", 32, 3), 4)).toBe("dresser is not inside one room"); // the partition and the Playroom's first column
  });

  it("the bed may be moved into the Playroom: its front is floor, and a creature walks to it from the bedroom through the three doorways (rows 4 or 5 of columns 10, 21 and 32)", () => {
    const layout = piece("bed", 36, 1);
    expect(problemWith(layout, 4)).toBeNull();
    const path = withLayout(layout, () => findPath({ col: 2, row: 5 }, bedFront(48), 2), 4);
    expect(path).not.toBeNull();
    for (const partition of PARTITIONS) {
      expect(path!.some((a) => (a.row === 4 || a.row === 5) && a.col <= partition && a.col + 1 >= partition), `column ${partition}`).toBe(true);
    }
    expect(path![path!.length - 1]).toEqual({ col: 37, row: 3 }); // the bed's front: (col + 1, row + 2), a 2-wide creature at columns 37 and 38
  });

  it("rule 5: a solid piece that closes the new doorway is refused with four rooms (and allowed with three)", () => {
    expect(problemWith(piece("table", 30, 4), 3)).toBeNull(); // columns 30 and 31, rows 4 and 5: the doorway's two approach tiles
    expect(problemWith(piece("table", 30, 4), 4)).toBe("a place a creature 1 wide cannot walk to");
  });

  it("one tile of the doorway's approach left open is enough: a bowl on (31, 4) leaves (31, 5)", () => {
    expect(problemWith(piece("bowl", 31, 4), 4)).toBeNull();
  });
});

describe("a layout the new room breaks is mended, not thrown away (edge G5)", () => {
  const home = (pieces: HomeSave["pieces"]): HomeSave => ({ pieces });

  it("with three rooms the table at (30, 4) is where it was put; with four, it is put away and every other piece stays", () => {
    const saved = home({ table: { col: 30, row: 4 } });
    expect(layoutOf(saved, 3)).toEqual({ ...STARTER, table: { col: 30, row: 4 } });
    expect(layoutOf(saved, 4)).toEqual({ ...STARTER, table: null });
  });

  it("keeps the player's other moves", () => {
    const saved = home({ table: { col: 30, row: 4 }, sofa: { col: 13, row: 2 } });
    expect(layoutOf(saved, 4)).toEqual({ ...STARTER, sofa: { col: 13, row: 2 }, table: null });
  });

  it("puts away the piece nearest the doorway first and stops as soon as the rules pass: the fridge beside it stays", () => {
    // the table (columns 30 and 31, rows 4 and 5) is 1.5 tiles from the doorway's middle, the fridge (rows 1 and 2) 3.35: the table goes, the fridge stays
    const result = layoutOf(home({ table: { col: 30, row: 4 } }), 4);
    expect(result.fridge).toEqual({ col: 30, row: 1 });
    expect(result.table).toBeNull();
  });

  it("never puts the bed away: a bed that closes the doorway cannot be mended, and the starter layout comes back whole", () => {
    const saved = home({ bed: { col: 29, row: 4 } }); // columns 29 to 31, rows 4 and 5
    expect(layoutOf(saved, 3)).toEqual({ ...STARTER, bed: { col: 29, row: 4 } });
    expect(layoutOf(saved, 4)).toBe(STARTER);
  });

  it("breaks a tie between two pieces the same distance from the doorway by the pieces' own order, not by where they stand: the dresser goes before the table either way", () => {
    // the dresser and the table are 2 x 2 at (30, 3) and (30, 5): their middles (31, 4) and (31, 6) are both 1.8 tiles from the doorway's middle (32.5, 5), and each leaves the other an approach tile
    expect(layoutOf({ pieces: { dresser: { col: 30, row: 3 }, table: { col: 30, row: 5 } } }, 4)).toEqual({ ...STARTER, dresser: null, table: { col: 30, row: 5 } });
    expect(layoutOf({ pieces: { table: { col: 30, row: 3 }, dresser: { col: 30, row: 5 } } }, 4)).toEqual({ ...STARTER, table: { col: 30, row: 3 }, dresser: null });
  });

  it("never puts the bed away even when it is the nearest piece to the doorway: the pieces that cut the room off go instead", () => {
    // the bed at (28, 5) has its middle 3.2 tiles from the doorway's middle, nearer than the fridge (3.4) and the counter at (25, 3) (4.6), which are what is left to put away
    expect(layoutOf({ pieces: { bed: { col: 28, row: 5 }, counter: { col: 25, row: 3 } } }, 4)).toEqual({ ...STARTER, bed: { col: 28, row: 5 }, counter: null, fridge: null });
  });

  it("is the same layout object each time for the same home and rooms, and a different one for different rooms", () => {
    const saved = home({ table: { col: 30, row: 4 } });
    expect(layoutOf(saved, 4)).toBe(layoutOf(saved, 4));
    expect(layoutOf(saved, 3)).toBe(layoutOf(saved, 3));
    expect(layoutOf(saved, 3)).not.toBe(layoutOf(saved, 4));
  });

  it("a piece in the Playroom while it is not built is a layout that breaks a rule with three rooms: the starter layout (a damaged save, or one read by a build that lost the room)", () => {
    const saved = home({ sofa: { col: 35, row: 1 } });
    expect(layoutOf(saved, 3)).toBe(STARTER);
    expect(layoutOf(saved, 4)).toEqual({ ...STARTER, sofa: { col: 35, row: 1 } });
  });

  it("a piece far outside the home is the starter layout at any number of rooms, and nothing throws", () => {
    for (const col of [43, 99, 1e9, -1]) for (const rooms of [3, 4]) expect(layoutOf(home({ sofa: { col, row: 1 } }), rooms), `${col} ${rooms}`).toBe(STARTER);
  });
});

describe("editing with four rooms (edge G8)", () => {
  const held = { kind: "sofa" as const, from: { col: 13, row: 1 }, at: { col: 13, row: 1 }, grip: { col: 0, row: 0 }, valid: true };

  it("a piece out of the tray lands in the Playroom when the view is there, and in the kitchen when the room is not built", () => {
    const tray: Layout = { ...STARTER, dresser: null };
    expect(nearestSpot(tray, "dresser", { col: 38, row: 4 }, 4)).toEqual({ col: 37, row: 3 }); // its middle (38, 4) is the spot asked for
    const three = nearestSpot(tray, "dresser", { col: 38, row: 4 }, 3);
    expect(three).not.toBeNull();
    expect(three!.col).toBeLessThanOrEqual(30); // columns 30 and 31: the last two of the kitchen
  });

  it("a piece dragged into the Playroom is green there with four rooms and red with three, and is dropped there only with four", () => {
    const at4 = follow(STARTER, held, 35, 1, 4);
    const at3 = follow(STARTER, held, 35, 1, 3);
    expect([at4.valid, at3.valid]).toEqual([true, false]);
    expect(drop(STARTER, at4, 4)).toEqual({ ...STARTER, sofa: { col: 35, row: 1 } });
    expect(drop(STARTER, at3, 3)).toBeNull();
  });

  it("a piece dropped half in the kitchen and half in the Playroom, or on the partition, goes back", () => {
    expect(follow(STARTER, held, 31, 1, 4).valid).toBe(false); // columns 31 to 34
    expect(follow(STARTER, held, 30, 1, 4).valid).toBe(false); // columns 30 to 33
    expect(follow(STARTER, held, 32, 1, 4).valid).toBe(false); // columns 32 to 35
  });
});

describe("which wall a tap can select (edges G8, G11)", () => {
  it("the Playroom's wall is columns 33 to 42 of rows 0 and 1 once it is built, and column 32 is the kitchen's", () => {
    expect([wallRoomOf(40, 0, 4), wallRoomOf(33, 1, 4), wallRoomOf(32, 0, 4), wallRoomOf(32, 1, 4)]).toEqual(["playroom", "playroom", "kitchen", "kitchen"]);
    expect([wallRoomOf(40, 2, 4), wallRoomOf(43, 0, 4), wallRoomOf(-1, 0, 4)]).toEqual([null, null, null]);
  });

  it("a tap in the void past a three-room home selects no wall: columns 32 and up are nothing until the room is built", () => {
    expect([wallRoomOf(32, 0, 3), wallRoomOf(40, 0, 3), wallRoomOf(40, 0), wallRoomOf(31, 0, 3)]).toEqual([null, null, null, "kitchen"]);
  });
});

describe("what is saved about a room (edges G7, G12)", () => {
  it("`withoutRoom` puts away every piece the save has inside the room (null, never a deleted key) and drops the room's wallpaper, and leaves the rest", () => {
    const home: HomeSave = { pieces: { sofa: { col: 35, row: 1 }, bowl: { col: 33, row: 5 }, table: { col: 14, row: 4 } }, walls: { playroom: "wall-dusk", bedroom: "wall-meadow" } };
    const out = withoutRoom(home, "playroom") as HomeSave;
    expect(out).toEqual({ pieces: { sofa: null, bowl: null, table: { col: 14, row: 4 } }, walls: { bedroom: "wall-meadow" } });
    expect("sofa" in out.pieces).toBe(true);
    expect(home.pieces.sofa).toEqual({ col: 35, row: 1 }); // (the home it was given is not changed)
  });

  it("gives the very same home when nothing is in the room, and no `walls` key when the Playroom's was the only wallpaper", () => {
    const plain: HomeSave = { pieces: { table: { col: 14, row: 4 } }, walls: { bedroom: "wall-meadow" } };
    expect(withoutRoom(plain, "playroom")).toBe(plain);
    expect(withoutRoom(undefined, "playroom")).toBeUndefined();
    expect(withoutRoom({ pieces: {}, walls: { playroom: "wall-dusk" } }, "playroom")).toEqual({ pieces: {} });
    expect("walls" in (withoutRoom({ pieces: {}, walls: { playroom: "wall-dusk" } }, "playroom") as HomeSave)).toBe(false);
  });

  it("the Shop's undo of the Playroom gives back its price and puts away what stood in it, and leaves a home with nothing saved alone", () => {
    const save = aliveSave("gravelhorn", at(10));
    save.coins = 36;
    save.inventory = { wood: 4, stone: 4 };
    expect(buy(save, "room-play", at(10))).toBe("bought");
    expect([save.coins, save.inventory.wood, save.inventory.stone, save.owned]).toEqual([0, 0, 0, ["room-play"]]);
    save.home = { pieces: { sofa: { col: 35, row: 1 }, table: { col: 14, row: 4 } }, walls: { playroom: "wall-dusk", bedroom: "wall-meadow" } };
    expect(undoBuy(save, at(10) + 5000)).toBe("undone");
    expect([save.coins, save.inventory.wood, save.inventory.stone, save.owned]).toEqual([36, 4, 4, []]);
    expect(save.home).toEqual({ pieces: { sofa: null, table: { col: 14, row: 4 } }, walls: { bedroom: "wall-meadow" } });
    const bare = aliveSave("gravelhorn", at(10));
    bare.coins = 36;
    bare.inventory = { wood: 4, stone: 4 };
    buy(bare, "room-play", at(10));
    undoBuy(bare, at(10) + 5000);
    expect(bare.home).toBeUndefined();
  });

  it("the bed cannot be put away: a bed saved inside the room goes back to its starter place, and the player's other moves stay (a layout without a bed is thrown away whole)", () => {
    const home: HomeSave = { pieces: { bed: { col: 36, row: 1 }, sofa: { col: 13, row: 2 }, dresser: { col: 40, row: 1 } } };
    const out = withoutRoom(home, "playroom") as HomeSave;
    expect(out).toEqual({ pieces: { sofa: { col: 13, row: 2 }, dresser: null } });
    expect("bed" in out.pieces).toBe(false);
    expect(layoutOf(out, 3)).toEqual({ ...STARTER, sofa: { col: 13, row: 2 }, dresser: null }); // (the layout the page reads: valid, not the starter layout)
  });

  it("undoing something that is not a room leaves the home as it is", () => {
    const save = aliveSave("gravelhorn", at(10));
    save.coins = 12;
    save.inventory = { fiber: 2 };
    buy(save, "hat-knit", at(10));
    save.home = { pieces: { sofa: { col: 35, row: 1 } } };
    undoBuy(save, at(10) + 5000);
    expect(save.home).toEqual({ pieces: { sofa: { col: 35, row: 1 } } });
  });

  it("a saved game keeps the Playroom once, a wallpaper entry for it, and whatever the layout says, and never throws on a piece outside the home", () => {
    const raw = JSON.parse(JSON.stringify(aliveSave("gravelhorn", at(10)))) as Record<string, unknown>;
    raw.owned = ["room-play", "room-play", "wall-dusk", "nope"];
    raw.home = { pieces: { sofa: { col: 99, row: 1 }, dresser: { col: 41, row: 1 } }, walls: { playroom: "wall-dusk" } };
    const read = migrateSave(raw)!;
    expect(read.owned).toEqual(["room-play", "wall-dusk"]);
    expect(read.home).toEqual({ pieces: { sofa: { col: 99, row: 1 }, dresser: { col: 41, row: 1 } }, walls: { playroom: "wall-dusk" } });
    expect(layoutOfSave(read)).toBe(STARTER); // (the sofa is outside the home: the layout is the starter one)
    expect(coerceHome({ pieces: {}, walls: { playroom: "wall-dusk" } })).toEqual({ pieces: {}, walls: { playroom: "wall-dusk" } });
    expect(coerceHome({ pieces: { sofa: { col: Number.NaN, row: 1 } } })).toBeUndefined();
    expect(coerceHome({ pieces: { sofa: { col: "35", row: 1 } } })).toBeUndefined();
  });

  it("a look has the rooms built and the Playroom's wall (the whole home's unless it has its own)", () => {
    const save = aliveSave("gravelhorn", at(10));
    save.owned = ["wall-dusk"];
    save.wall = "wall-dusk";
    expect([lookOf(save).rooms, lookOf(save).walls.playroom]).toEqual([3, "wall-dusk"]);
    save.owned = ["wall-dusk", "room-play"];
    save.home = { pieces: {}, walls: { playroom: null } };
    expect([lookOf(save).rooms, lookOf(save).walls.playroom, lookOf(save).walls.living]).toEqual([4, null, "wall-dusk"]);
    save.home = { pieces: { table: { col: 30, row: 4 } } };
    expect(lookOf(save).layout.table).toBeNull(); // (the table closes the Playroom's doorway: it is drawn put away, as the walking reads it)
    save.owned = ["wall-dusk"];
    expect(lookOf(save).layout.table).toEqual({ col: 30, row: 4 });
  });
});

describe("Decorate mode and the rooms built (edges G7, G8)", () => {
  let game: Game;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("window", globalThis); // (the Game wakes its listeners through `window`, as in home-walls.test.ts)
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  function start(owned: string[]): void {
    vi.setSystemTime(at(10));
    const save = aliveSave("blip", at(10));
    save.owned = owned;
    game = new Game(save);
    game.view.world = "home";
    vi.mocked(writeSave).mockClear();
  }

  it("a room that is not built cannot be selected or given a wallpaper, and nothing is saved for it", () => {
    start(["wall-dusk"]);
    game.startDecor();
    game.selectWall("playroom");
    expect([game.selectedWall, game.decor]).toEqual([null, { selected: null, wall: null }]);
    expect(game.setWall("playroom", "wall-dusk")).toBe(false);
    expect(game.save.home).toBeUndefined();
  });

  it("a built room can: its wall is selected and a wallpaper is saved for it alone", () => {
    start(["wall-dusk", "room-play"]);
    game.startDecor();
    game.selectWall("playroom");
    expect(game.selectedWall).toBe("playroom");
    expect(game.setWall("playroom", "wall-dusk")).toBe(true);
    expect(game.save.home?.walls).toEqual({ playroom: "wall-dusk" });
  });

  it("a selected wall whose room is given back is let go: the selection reads as nothing", () => {
    start(["wall-dusk", "room-play"]);
    game.startDecor();
    game.selectWall("playroom");
    game.save.owned = ["wall-dusk"]; // (the Shop's undo)
    expect(game.selectedWall).toBeNull();
  });

  it("a piece brought out of the tray lands in the Playroom when the view is there, and the arrow keys do not take it across the partition or off the end", () => {
    start(["room-play"]);
    game.save.home = { pieces: { dresser: null } };
    game.startDecor();
    expect(game.bringOut("dresser", { col: 38, row: 4 })).toBe(true);
    expect(game.save.home?.pieces.dresser).toEqual({ col: 37, row: 3 });
    game.save.home = { pieces: { dresser: { col: 41, row: 3 } } };
    expect(game.nudge(1, 0)).toBe(false); // columns 42 and 43
    game.save.home = { pieces: { dresser: { col: 33, row: 3 } } };
    expect(game.nudge(-1, 0)).toBe(false); // columns 32 and 33: the partition
    expect(game.nudge(1, 0)).toBe(true);
    expect(game.save.home?.pieces.dresser).toEqual({ col: 34, row: 3 });
  });

  it("a piece is put away, and nudged, while another stands in the Playroom (the rules are read with the rooms built)", () => {
    start(["room-play"]);
    game.save.home = { pieces: { dresser: { col: 36, row: 3 } } };
    game.startDecor();
    game.select("sofa");
    expect(game.putAway()).toBe(true);
    expect([game.save.home?.pieces.sofa, game.save.home?.pieces.dresser]).toEqual([null, { col: 36, row: 3 }]);
    game.select("dresser");
    expect(game.nudge(1, 0)).toBe(true);
    expect(game.save.home?.pieces.dresser).toEqual({ col: 37, row: 3 });
  });

  it("with the room not built the same tray piece lands in the kitchen or earlier, never past column 31", () => {
    start([]);
    game.save.home = { pieces: { dresser: null } };
    game.startDecor();
    expect(game.bringOut("dresser", { col: 38, row: 4 })).toBe(true);
    expect(game.save.home!.pieces.dresser!.col).toBeLessThanOrEqual(30);
  });
});
