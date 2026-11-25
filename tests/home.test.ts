// The home's floor plan (src/art/home.ts, src/data/home.ts; docs/home-plan.md slice H1): the numbers are worked out by hand from the layout in data/home.ts.
import { describe, expect, it } from "vitest";
import { COLS, DEAD_TILE, EGG_TILE, PIECES, POOP_TILES, ROWS, STARTER } from "../src/data/home";
import {
  HOME,
  anchorOf,
  anchorPos,
  bedFront,
  bedLying,
  deadCenter,
  deadFeet,
  eggSpot,
  findPath,
  fits,
  foodTile,
  footprintOf,
  isBehind,
  isFloor,
  nearestFree,
  poopSpot,
  roomOf,
  startAnchor,
  wanderPath,
  withLayout,
} from "../src/art/home";

const allFloor = (): Array<{ col: number; row: number }> => {
  const out = [];
  for (let row = 0; row < ROWS; row++) for (let col = 0; col < COLS; col++) if (isFloor(col, row)) out.push({ col, row });
  return out;
};
const adjacent = (a: { col: number; row: number }, b: { col: number; row: number }): boolean => Math.abs(a.col - b.col) + Math.abs(a.row - b.row) === 1;

describe("the grid", () => {
  it("is 43 x 8 tiles at the widest (four rooms), and 768 x 192 game pixels with the three base rooms built", () => {
    expect([COLS, ROWS, HOME.w, HOME.h]).toEqual([43, 8, 768, 192]);
  });

  it("has 162 free floor tiles: 180 in the rooms, 4 in the two doorways, 22 under furniture", () => {
    // by hand: 6 floor rows x 30 room columns = 180; each partition is open in 2 rows = 4; solid pieces on the floor: bed 3, dresser 2, sofa 4, table 4, counter 6, fridge 2, bowl 1 = 22
    expect(allFloor().length).toBe(162);
  });

  it("has no floor in the wall rows, none on a partition outside its doorway, and an open doorway at rows 4 and 5", () => {
    expect([0, 1].some((row) => Array.from({ length: COLS }, (_, col) => isFloor(col, row)).some(Boolean))).toBe(false);
    expect([10, 21].map((c) => [2, 3, 4, 5, 6, 7].map((r) => isFloor(c, r)))).toEqual([
      [false, false, true, true, false, false],
      [false, false, true, true, false, false],
    ]);
  });

  it("takes the floor under every solid piece and none under a rug or a mat", () => {
    expect([isFloor(2, 2), isFloor(7, 2), isFloor(14, 2), isFloor(18, 4), isFloor(25, 2), isFloor(30, 2), isFloor(24, 5)]).toEqual([false, false, false, false, false, false, false]);
    expect([isFloor(14, 5), isFloor(23, 5), isFloor(25, 5)]).toEqual([true, true, true]); // the rug and the mat are not in the way
  });

  it("keeps every piece of furniture inside the home, and the fixed spots on free floor, away from solid pieces", () => {
    for (const p of PIECES) expect([p.col >= 0, p.row >= 0, p.col + p.cols <= COLS, p.row + p.rows <= ROWS]).toEqual([true, true, true, true]);
    for (const t of [EGG_TILE, DEAD_TILE, ...POOP_TILES]) expect(isFloor(t.col, t.row)).toBe(true);
    expect(POOP_TILES.length).toBe(5);
  });
});

describe("footprints and positions", () => {
  it("is 1 tile wide up to a kid (16, 20, 24 pixels) and 2 for a young (36) and an adult (48)", () => {
    expect([16, 20, 24, 36, 48].map(footprintOf)).toEqual([1, 1, 1, 2, 2]);
  });

  it("centres a picture on its footprint with its feet on the bottom of the row", () => {
    expect(anchorPos({ col: 3, row: 4 }, 20)).toEqual({ x: 74, y: 120 }); // 72 + (24 - 20) / 2
    expect(anchorPos({ col: 3, row: 4 }, 16)).toEqual({ x: 76, y: 120 });
    expect(anchorPos({ col: 3, row: 4 }, 48)).toEqual({ x: 72, y: 120 });
    expect(anchorPos({ col: 3, row: 4 }, 36)).toEqual({ x: 78, y: 120 }); // 72 + (48 - 36) / 2
  });

  it("fits a 2-wide footprint through a doorway column and not against furniture", () => {
    expect([fits(9, 4, 2), fits(10, 4, 2), fits(10, 3, 2), fits(0, 2, 2), fits(30, 3, 2), fits(31, 3, 2)]).toEqual([true, true, false, false, true, false]);
  });

  it("never reads past the last column of the widest home as the next row's first tile: column 43 is not floor, and a creature two tiles wide is refused at the Playroom's last column", () => {
    // by hand: the floor is one array of 43 columns per row, so a read at column 43 of row 3 would land on column 0 of row 4, which is bare floor in the starter layout (the first value)
    withLayout(STARTER, () => {
      expect([isFloor(0, 4), isFloor(42, 3), fits(42, 3, 1), fits(42, 3, 2), isFloor(43, 3)]).toEqual([true, true, true, false, false]);
    }, 4);
  });

  it("reads a position back to the anchor it was made from, for every size", () => {
    for (const size of [16, 20, 24, 36, 48]) {
      const a = { col: 12, row: 6 };
      const p = anchorPos(a, size);
      expect(anchorOf(p.x, p.y, size)).toEqual(a);
    }
  });

  it("moves a position that is on furniture to the nearest free anchor", () => {
    expect(nearestFree(2, 2, 1)).toEqual({ col: 2, row: 3 }); // under the bed: the tile in front of it
    expect(anchorOf(60, 72, 20)).toEqual({ col: 2, row: 3 }); // (60, 72) is the bed's feet
  });

  it("starts from the nearest tile inside the home when the position is off the edge, breaks a tie right, left, below, above, and moves a 2-wide footprint off the last column", () => {
    // by hand: (-3, 5) is left of the home and (40, 5) right of it, (15, 20) below it: each starts from the nearest tile on the grid, which is free floor
    expect([nearestFree(-3, 5, 1), nearestFree(40, 5, 1), nearestFree(15, 20, 1)]).toEqual([{ col: 0, row: 5 }, { col: 31, row: 5 }, { col: 15, row: 7 }]);
    expect(nearestFree(24, 5, 1)).toEqual({ col: 25, row: 5 }); // the bowl (24, 5) is solid; its right and left are free and equally near: the right comes first
    expect(nearestFree(31, 5, 2)).toEqual({ col: 30, row: 5 }); // (31, 5) is floor but a 2-wide footprint there would stand outside the home
  });

  it("starts a creature in the living room, and puts the bed's front where it can walk up to it", () => {
    expect([startAnchor(20), startAnchor(48)]).toEqual([{ col: 15, row: 5 }, { col: 15, row: 5 }]);
    expect([bedFront(20), bedFront(48)]).toEqual([{ col: 2, row: 3 }, { col: 2, row: 3 }]);
  });
});

describe("walking", () => {
  it("finds a way from the bedroom to the kitchen round the table: 22 steps, each to a neighbouring free tile", () => {
    const path = findPath({ col: 5, row: 4 }, { col: 25, row: 4 }, 1);
    expect(path).not.toBeNull();
    const steps = path as Array<{ col: number; row: number }>;
    expect(steps.length).toBe(22); // 20 across and one step up and one down, because the table blocks rows 4 and 5 at columns 17 and 18
    expect(steps[steps.length - 1]).toEqual({ col: 25, row: 4 });
    let prev = { col: 5, row: 4 };
    for (const s of steps) {
      expect(adjacent(prev, s)).toBe(true);
      expect(fits(s.col, s.row, 1)).toBe(true);
      prev = s;
    }
    expect(steps.some((s) => s.col === 10 && [4, 5].includes(s.row))).toBe(true); // through the first doorway
    expect(steps.some((s) => s.col === 21 && [4, 5].includes(s.row))).toBe(true); // and the second
  });

  it("walks a 2-wide creature through the doorways too", () => {
    const path = findPath({ col: 7, row: 4 }, { col: 23, row: 4 }, 2) as Array<{ col: number; row: number }>;
    expect(path).not.toBeNull();
    for (const s of path) expect(fits(s.col, s.row, 2)).toBe(true);
    expect(path[path.length - 1]).toEqual({ col: 23, row: 4 });
  });

  it("answers null for a goal where the footprint does not fit, and [] for a walk to where it stands", () => {
    expect(findPath({ col: 5, row: 4 }, { col: 2, row: 2 }, 1)).toBeNull(); // under the bed
    expect(findPath({ col: 5, row: 4 }, { col: 31, row: 3 }, 2)).toBeNull(); // 2 wide at the right wall
    expect(findPath({ col: 5, row: 4 }, { col: 5, row: 4 }, 1)).toEqual([]);
  });

  it("reaches every free anchor from the start, for a 1-wide and a 2-wide footprint (the home has no cut-off corner)", () => {
    for (const f of [1, 2]) {
      const start = startAnchor(f === 1 ? 20 : 48);
      let anchors = 0;
      for (let row = 0; row < ROWS; row++) {
        for (let col = 0; col < COLS; col++) {
          if (!fits(col, row, f)) continue;
          anchors += 1;
          expect(findPath(start, { col, row }, f), `footprint ${f}, anchor ${col},${row}`).not.toBeNull();
        }
      }
      expect(anchors).toBeGreaterThan(100);
    }
  });

  it("wanders to a random reachable anchor: the first goal for a roll of 0 and the last for 0.999, every step a neighbour", () => {
    const from = { col: 15, row: 5 };
    const first = wanderPath(from, 1, () => 0);
    const last = wanderPath(from, 1, () => 0.999);
    expect(first.length).toBeGreaterThan(0);
    expect(last.length).toBeGreaterThan(0);
    expect(first[first.length - 1]).toEqual({ col: 0, row: 2 }); // the smallest index: the top left floor tile of the bedroom
    expect(last[last.length - 1]).toEqual({ col: 31, row: 7 }); // the largest: the bottom right floor tile of the kitchen
    // In between: the 161 goals (the 162 free floor tiles but the one it stands on) in order of row, then column; a roll picks goal number floor(roll x 161): 40, 80, 120.
    // (Counted with a separate script that lists the free floor tiles from the layout in src/data/home.ts, row by row, not with the code under test.)
    const goalOf = (roll: number) => {
      const path = wanderPath(from, 1, () => roll);
      return path[path.length - 1];
    };
    expect([goalOf(0.25), goalOf(0.5), goalOf(0.75)]).toEqual([
      { col: 29, row: 3 },
      { col: 7, row: 5 },
      { col: 20, row: 6 },
    ]);
    for (const path of [first, last]) {
      let prev = from;
      for (const s of path) {
        expect(adjacent(prev, s)).toBe(true);
        prev = s;
      }
    }
  });
});

describe("rooms, food and the fixed spots", () => {
  it("names the room of a position, a partition belonging to the room before the first one and after the second one", () => {
    // 255 is column 10 (the first partition, 10.6 tiles: not rounded up to column 11) and 500 is column 20 (20.8 tiles: not rounded up to the second partition's column 21)
    expect([0, 100, 239, 245, 11 * 24, 400, 21 * 24 + 5, 767, -5, 255, 500].map(roomOf)).toEqual(["bedroom", "bedroom", "bedroom", "bedroom", "living", "living", "kitchen", "kitchen", "bedroom", "bedroom", "living"]);
  });

  it("puts food on the side the creature faces, then the other side, then below it, then under it", () => {
    expect(foodTile({ col: 15, row: 5 }, 1, 1)).toEqual({ tile: { col: 16, row: 5 }, own: false });
    expect(foodTile({ col: 15, row: 5 }, 1, -1)).toEqual({ tile: { col: 14, row: 5 }, own: false });
    expect(foodTile({ col: 13, row: 5 }, 2, 1)).toEqual({ tile: { col: 15, row: 5 }, own: false }); // a 2-wide creature: past both its tiles
    expect(foodTile({ col: 15, row: 5 }, 2, 1)).toEqual({ tile: { col: 14, row: 5 }, own: false }); // the table is on the right (columns 17 and 18): the other side
    expect(foodTile({ col: 0, row: 2 }, 1, -1)).toEqual({ tile: { col: 0, row: 3 }, own: false }); // the wall on the left and the bed on the right: below it
    expect(foodTile({ col: 40, row: 0 }, 1, 1)).toEqual({ tile: { col: 40, row: 0 }, own: true }); // nothing free round it: the tile it stands on
  });

  it("draws a piece of furniture behind a creature whose feet are at or below the piece's bottom edge, and in front of one standing above it", () => {
    const piece = (kind: string) => PIECES.find((p) => p.kind === kind)!;
    // by hand: the sofa is rows 1 to 2 (bottom edge 3 x 24 = 72), the table rows 4 to 5 (6 x 24 = 144), the counter rows 1 to 2 (72)
    expect([71, 72, 73].map((feet) => isBehind(piece("sofa"), feet))).toEqual([false, true, true]);
    expect([143, 144, 145].map((feet) => isBehind(piece("table"), feet))).toEqual([false, true, true]);
    expect(PIECES.filter((p) => p.solid).every((p) => isBehind(p, Number.POSITIVE_INFINITY))).toBe(true); // asleep in bed, dead, away: all of it behind
    expect(PIECES.filter((p) => p.solid).some((p) => isBehind(p, 0))).toBe(false); // nothing is behind a creature standing above the whole home
  });

  it("works out the fixed spots in game pixels", () => {
    expect(bedLying(48)).toEqual({ x: 36, y: 15 }); // centred on the bed (32 + 28 = 60), the top of a 48 pixel creature
    expect(bedLying(16)).toEqual({ x: 52, y: 47 });
    expect(eggSpot()).toEqual({ x: 124, y: 128 });
    expect([deadCenter(), deadFeet()]).toEqual([180, 144]);
    expect(poopSpot(0)).toEqual({ x: 296, y: 158 });
    expect(poopSpot(4)).toEqual({ x: 488, y: 134 });
    expect(poopSpot(5)).toBeNull();
  });
});
