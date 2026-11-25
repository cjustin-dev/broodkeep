// Where the furniture may stand and what a saved `home` turns into (src/art/homeLayout.ts, src/data/home.ts; docs/home-plan.md section 12). The numbers are worked out by hand from the
// starter layout: the bed at (1, 1) three tiles wide, the dresser (6, 1), the sofa (13, 1) four wide, the rug (13, 4), the table (17, 4), the counter (23, 1) six wide, the fridge
// (30, 1), the mat (23, 5) and the bowl (24, 5); rooms are columns 0 to 9, 11 to 20 and 22 to 31, the wall is rows 0 and 1, and the doorways are rows 4 and 5 of columns 10 and 21.
import { afterEach, describe, expect, it } from "vitest";
import { BED, KINDS, MEMORIAL, PIECES, STARTER, bedOf, coerceHome, isProtected, piecesOf } from "../src/data/home";
import type { Layout, PieceKind } from "../src/data/home";
import { bedFront, bedLying, fits, isFloor, layoutInForce, nearestFree, useLayout, withLayout } from "../src/art/home";
import { layoutOf, problemWith } from "../src/art/homeLayout";

afterEach(() => useLayout(STARTER));

// The starter layout with one piece put somewhere else (or put away with null).
const moved = (kind: PieceKind, col: number, row: number): Layout => ({ ...STARTER, [kind]: { col, row } });

describe("the starter layout", () => {
  it("breaks none of the six rules, and PIECES is its pieces in drawing order", () => {
    expect(problemWith(STARTER)).toBeNull();
    expect(PIECES.map((p) => p.kind)).toEqual(["bed", "dresser", "sofa", "rug", "table", "counter", "fridge", "mat", "bowl"]);
    expect(PIECES).toEqual(piecesOf(STARTER));
  });

  it("puts the nine pieces where H1 put them", () => {
    expect(STARTER).toEqual({
      bed: { col: 1, row: 1 },
      dresser: { col: 6, row: 1 },
      sofa: { col: 13, row: 1 },
      rug: { col: 13, row: 4 },
      table: { col: 17, row: 4 },
      counter: { col: 23, row: 1 },
      fridge: { col: 30, row: 1 },
      mat: { col: 23, row: 5 },
      bowl: { col: 24, row: 5 },
    });
  });

  it("has the bed at 32, 47 with its front at (2, 3)", () => {
    expect(BED).toEqual({ left: 32, y: 47, front: { col: 2, row: 3 } });
  });

  it("is what a missing home, an empty one and a home with only the starter places mean", () => {
    expect(layoutOf(undefined)).toBe(STARTER);
    expect(layoutOf({ pieces: {} })).toEqual(STARTER);
    expect(layoutOf({ pieces: { sofa: { col: 13, row: 1 }, bed: { col: 1, row: 1 } } })).toEqual(STARTER);
  });
});

describe("rule 1: inside one room, on the right rows", () => {
  it("refuses a piece across a partition, off the right edge, below the home and on a column of a partition", () => {
    expect(problemWith(moved("sofa", 8, 1))).toBe("sofa is not inside one room"); // columns 8 to 11 take partition column 10
    expect(problemWith(moved("counter", 28, 1))).toBe("counter is not inside one room"); // columns 28 to 33
    expect(problemWith(moved("fridge", 30, 7))).toBe("fridge is below the home"); // rows 7 and 8
    expect(problemWith(moved("bowl", 10, 5))).toBe("bowl is not inside one room"); // the partition column itself
    expect(problemWith(moved("table", -1, 4))).toBe("table is not inside one room");
  });

  it("refuses a piece that stands on the wall when it does not stand against it, and lets one that stands against it start at row 1", () => {
    expect(problemWith(moved("table", 17, 1))).toBe("table is on the wall");
    expect(problemWith(moved("rug", 13, 1))).toBe("rug is on the wall");
    expect(problemWith(moved("mat", 23, 1))).toBe("mat is on the wall");
    expect(problemWith(moved("bowl", 24, 1))).toBe("bowl is on the wall");
    expect(problemWith(moved("sofa", 13, 0))).toBe("sofa is on the wall"); // row 0 is wall for everyone
    expect(problemWith(moved("sofa", 14, 1))).toBeNull(); // a piece that stands against the wall may start at row 1
    expect(problemWith(moved("sofa", 13, 2))).toBeNull(); // a wall piece may also stand lower
    expect(problemWith(moved("table", 17, 2))).toBeNull(); // the first floor row is row 2
  });

  it("refuses a piece that is not on a whole tile", () => {
    expect(problemWith(moved("sofa", 13.5, 1))).toBe("sofa is not on a whole tile");
    expect(problemWith(moved("sofa", 13, Number.NaN))).toBe("sofa is not on a whole tile");
  });

  it("lets a four wide piece start on column 6 of the bedroom (columns 6 to 9, with the dresser put away) and not on column 7", () => {
    expect(problemWith({ ...STARTER, dresser: null, sofa: { col: 6, row: 1 } })).toBeNull();
    expect(problemWith({ ...STARTER, dresser: null, sofa: { col: 7, row: 1 } })).toBe("sofa is not inside one room"); // columns 7 to 10: the partition
  });
});

describe("rule 2: solid pieces never overlap, flat ones may lie under anything", () => {
  it("refuses a dresser on the bed and a table on the sofa, by the first of the two in drawing order", () => {
    expect(problemWith(moved("dresser", 2, 1))).toBe("bed overlaps dresser");
    expect(problemWith(moved("table", 15, 2))).toBe("sofa overlaps table"); // columns 15 and 16, rows 2 and 3, over the sofa's last two tiles on row 2
  });

  it("lets two solid pieces touch", () => {
    expect(problemWith(moved("dresser", 4, 1))).toBeNull(); // columns 4 and 5 against the bed's last column 3
    // the bowl (1 x 1) against each side of another piece: the sofa (columns 13 to 16, rows 1 and 2) on its left and on its right, the dresser (columns 6 and 7, rows 1 and 2)
    // below it, the table (columns 17 and 18, rows 4 and 5) above it
    expect(problemWith(moved("bowl", 12, 2))).toBeNull();
    expect(problemWith(moved("bowl", 17, 2))).toBeNull();
    expect(problemWith(moved("bowl", 6, 3))).toBeNull();
    expect(problemWith(moved("bowl", 17, 3))).toBeNull();
  });

  it("lets a rug lie under the sofa and the mat lie on the rug", () => {
    expect(problemWith(moved("rug", 13, 2))).toBeNull();
    expect(problemWith(moved("mat", 14, 4))).toBeNull();
  });
});

describe("rule 3: a solid piece never covers the egg, the poop or the grave", () => {
  it("refuses the egg's tile, a poop tile and the grave's block", () => {
    expect(problemWith(moved("dresser", 4, 5))).toBe("dresser covers a protected tile"); // columns 4 and 5, rows 5 and 6: (5, 5) is the egg
    expect(problemWith(moved("sofa", 12, 5))).toBe("sofa covers a protected tile"); // (12, 6) is a poop tile
    expect(problemWith(moved("table", 7, 4))).toBe("table covers a protected tile"); // the grave's block is columns 6 to 8, rows 4 and 5
    expect(problemWith(moved("bowl", 20, 5))).toBe("bowl covers a protected tile"); // (20, 5) is a poop tile
  });

  it("lets a rug or the mat lie on them", () => {
    expect(problemWith(moved("rug", 6, 4))).toBeNull(); // columns 6 to 9, rows 4 to 6: the grave's block
    expect(problemWith(moved("mat", 12, 6))).toBeNull();
  });

  it("knows exactly the protected tiles: the egg, five poop tiles and 3 x 2 at the grave", () => {
    const tiles: string[] = [];
    for (let col = 0; col < 32; col++) for (let row = 0; row < 8; row++) if (isProtected(col, row)) tiles.push(`${col},${row}`);
    expect(tiles.length).toBe(1 + 5 + MEMORIAL.cols * MEMORIAL.rows);
    expect(tiles).toContain("5,5");
    expect(tiles).toContain("12,6");
    expect(tiles).toContain("20,5");
    expect(tiles).toContain("8,4");
    expect(tiles).not.toContain("9,4");
    expect(tiles).not.toContain("6,3");
  });
});

describe("rule 4: the two tiles in front of the bed are bare floor", () => {
  it("refuses a piece on either of them", () => {
    expect(problemWith(moved("dresser", 2, 3))).toBe("the bed's front is not bare floor"); // columns 2 and 3, rows 3 and 4: both
    expect(problemWith(moved("bowl", 2, 3))).toBe("the bed's front is not bare floor"); // (2, 3) only
    expect(problemWith(moved("bowl", 3, 3))).toBe("the bed's front is not bare floor"); // (3, 3) only
  });

  it("allows a piece one tile away, and refuses a bed whose front would be off the floor", () => {
    expect(problemWith(moved("bowl", 1, 3))).toBeNull(); // beside the front tile (2, 3), not on it
    expect(problemWith(moved("bed", 1, 5))).toBeNull(); // rows 5 and 6, front row 7
    expect(problemWith(moved("bed", 1, 6))).toBe("the bed's front is not bare floor"); // rows 6 and 7, front row 8
  });
});

describe("rule 5: a creature one tile wide and one two tiles wide can walk everywhere they fit", () => {
  it("refuses to close a doorway", () => {
    expect(problemWith(moved("table", 11, 4))).toBe("a place a creature 1 wide cannot walk to"); // the living side of the first doorway: columns 11 and 12, rows 4 and 5
  });

  it("refuses a passage that a one tile wide creature can use and a two tiles wide one cannot", () => {
    expect(problemWith({ ...STARTER, bowl: { col: 11, row: 4 }, table: { col: 12, row: 4 } })).toBe("a place a creature 2 wide cannot walk to");
  });

  it("refuses the table against the kitchen side of the second doorway", () => {
    expect(problemWith(moved("table", 22, 4))).toBe("a place a creature 1 wide cannot walk to"); // columns 22 and 23, rows 4 and 5: the kitchen is walled off (the living side cannot be: (20, 5) is a poop tile)
  });

  it("refuses a piece that cuts a pocket of one place off, here a two wide one between the bed, the dresser and a bowl", () => {
    expect(problemWith(moved("bowl", 4, 3))).toBe("a place a creature 2 wide cannot walk to"); // columns 4 and 5 of row 2 can only be left through (4, 3)
  });

  it("lets pieces away, and a piece that leaves every way open", () => {
    expect(problemWith({ ...STARTER, sofa: null, table: null })).toBeNull();
    expect(problemWith(moved("table", 15, 4))).toBeNull(); // on the tile the creature starts on: it starts beside it, and rows 3, 6 and 7 stay open
  });
});

describe("rule 6: the bed is placed", () => {
  it("refuses a layout with no bed", () => {
    expect(problemWith({ ...STARTER, bed: null })).toBe("the bed is put away");
  });

  it("lets everything else be put away", () => {
    for (const kind of KINDS.filter((k) => k !== "bed")) expect(problemWith({ ...STARTER, [kind]: null }), kind).toBeNull();
  });
});

describe("what a saved home means (layoutOf)", () => {
  it("puts the saved pieces over the starter layout and keeps the rest where it was", () => {
    const layout = layoutOf({ pieces: { sofa: { col: 13, row: 2 }, table: null } });
    expect(layout.sofa).toEqual({ col: 13, row: 2 });
    expect(layout.table).toBeNull();
    expect(layout.bed).toEqual({ col: 1, row: 1 });
    expect(layout.fridge).toEqual({ col: 30, row: 1 });
  });

  it("gives the very same layout for the same saved home, so a change is one comparison", () => {
    const a = layoutOf({ pieces: { sofa: { col: 14, row: 1 } } });
    const b = layoutOf({ pieces: { sofa: { col: 14, row: 1 } } });
    expect(a).toBe(b);
    expect(layoutOf({ pieces: { sofa: { col: 15, row: 1 } } })).not.toBe(a);
  });

  it("falls back to the whole starter layout when one piece breaks a rule, not to half of it", () => {
    expect(layoutOf({ pieces: { dresser: { col: 2, row: 1 }, sofa: { col: 14, row: 1 } } })).toBe(STARTER); // the dresser is on the bed; the sofa's move is dropped with it
    expect(layoutOf({ pieces: { bed: null } })).toBe(STARTER);
    expect(layoutOf({ pieces: { sofa: { col: -5, row: 1 } } })).toBe(STARTER);
    expect(layoutOf({ pieces: { sofa: { col: 1e9, row: 1 } } })).toBe(STARTER);
  });

  it("does not share a piece with the saved home: editing the saved place later leaves the layout it made as it was", () => {
    const home = { pieces: { sofa: { col: 12, row: 1 } } }; // (a place no other test uses: the same saved home gives the layout an earlier test made, with that test's cell)
    const layout = layoutOf(home);
    expect(layout.sofa).toEqual({ col: 12, row: 1 }); // (the layout is the saved one, not the starter: it passes the rules)
    home.pieces.sofa.col = 15; // the cell edited in place, after the layout was made
    expect(layout.sofa).toEqual({ col: 12, row: 1 });
  });

  it("does not keep a layout it was given a second time with a changed piece under the same object", () => {
    const home = { pieces: { sofa: { col: 14, row: 1 } as { col: number; row: number } | null } };
    expect(layoutOf(home).sofa).toEqual({ col: 14, row: 1 });
    home.pieces.sofa = { col: 15, row: 1 }; // edited in place: it is read again by what it says
    expect(layoutOf(home).sofa).toEqual({ col: 15, row: 1 });
  });
});

describe("the shape check of a home read from storage (coerceHome)", () => {
  const bad: unknown[] = [
    undefined,
    null,
    "x",
    3,
    [],
    Object.assign([], { pieces: {} }), // (an array that carries a `pieces`: a home is a plain object)
    {},
    { pieces: null },
    { pieces: [] },
    { pieces: "s" },
    { pieces: { sofa: { col: 3.5, row: 1 } } },
    { pieces: { sofa: { col: Number.NaN, row: 1 } } },
    { pieces: { sofa: { col: "3", row: 1 } } },
    { pieces: { sofa: "x" } },
    { pieces: { sofa: undefined } },
    { pieces: { sofa: [] } },
    { pieces: { sofa: { col: 3 } } },
  ];

  it("gives nothing for anything that is not a home, and for a home with one bad entry", () => {
    bad.forEach((value, i) => expect(coerceHome(value), `bad[${i}] ${JSON.stringify(value)}`).toBeUndefined()); // (an array with a pieces key and {} print alike: the index tells them apart)
  });

  it("keeps whole numbers and null, drops kinds it does not know and anything but col and row, and ignores inherited keys", () => {
    expect(coerceHome({ pieces: {} })).toEqual({ pieces: {} });
    expect(coerceHome({ pieces: { sofa: { col: 13, row: 2, extra: 1 }, table: null, piano: { col: 1, row: 1 } } })).toEqual({ pieces: { sofa: { col: 13, row: 2 }, table: null } });
    expect(coerceHome({ pieces: Object.create({ sofa: { col: 1, row: 1 } }) })).toEqual({ pieces: {} });
    expect(coerceHome({ pieces: { sofa: { col: -5, row: 1e9 } } })).toEqual({ pieces: { sofa: { col: -5, row: 1e9 } } }); // (where a piece may be is layoutOf's rule)
  });
});

describe("the bed follows its piece", () => {
  it("derives its left edge, the top of a lying creature and the front tile from the bed's tile", () => {
    expect(bedOf({ col: 3, row: 2 })).toEqual({ left: 80, y: 71, front: { col: 4, row: 4 } });
    expect(bedOf({ col: 1, row: 1 })).toEqual(BED);
  });

  it("puts a lying creature, and the tile it stands on before it lies down, at the moved bed", () => {
    const layout = moved("bed", 3, 2);
    expect(problemWith(layout)).toBeNull();
    useLayout(layout);
    expect(bedLying(48)).toEqual({ x: 84, y: 39 }); // 80 + 56 / 2 - 24, 71 + 16 - 48
    expect(bedFront(48)).toEqual({ col: 4, row: 4 });
    expect(bedFront(24)).toEqual({ col: 4, row: 4 });
  });

  it("starts on the starter bed", () => {
    expect(bedLying(48)).toEqual({ x: 32 + 28 - 24, y: 47 + 16 - 48 });
    expect(bedFront(48)).toEqual({ col: 2, row: 3 });
  });
});

describe("the floor in force", () => {
  it("makes the tiles under a moved solid piece walls and the tiles it left free", () => {
    expect([isFloor(17, 4), isFloor(14, 4)]).toEqual([false, true]);
    useLayout(moved("table", 14, 4));
    expect([isFloor(17, 4), isFloor(14, 4), isFloor(15, 5)]).toEqual([true, false, false]);
    expect(fits(15, 5, 1)).toBe(false);
    expect(nearestFree(15, 5, 1)).toEqual({ col: 16, row: 5 });
  });

  it("is the starter layout until told otherwise, and a flat piece does not change it", () => {
    expect(layoutInForce()).toBe(STARTER);
    useLayout(moved("rug", 13, 2));
    expect([isFloor(13, 2), isFloor(14, 5)]).toEqual([false, true]); // (13, 2) is under the sofa; the rug is flat
  });

  it("tries a layout out and puts the old one back, also when the trial throws", () => {
    const trial = moved("table", 14, 4);
    expect(withLayout(trial, () => [layoutInForce() === trial, isFloor(15, 5)])).toEqual([true, false]);
    expect(layoutInForce()).toBe(STARTER);
    expect(() =>
      withLayout(trial, () => {
        throw new Error("x");
      }),
    ).toThrow("x");
    expect(layoutInForce()).toBe(STARTER);
  });
});
