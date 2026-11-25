// What Decorate mode does to the layout (src/art/homeEdit.ts): which layouts a move may make, what the tray holds, which piece a finger takes, where a piece from the tray lands,
// and how a lifted piece follows a finger and is put down. The expected places are worked out by hand from src/data/home.ts (the starter layout: bed (1,1) 3x2, dresser (6,1) 2x2,
// sofa (13,1) 4x2, rug (13,4) 4x3, table (17,4) 2x2, counter (23,1) 6x2, fridge (30,1) 2x2, mat (23,5) 3x1, bowl (24,5) 1x1; rooms are columns 0-9, 11-20 and 22-31).
import { describe, expect, it } from "vitest";
import { STARTER, coerceHome, homeOf } from "../src/data/home";
import type { Layout } from "../src/data/home";
import { drop, follow, lift, moved, nearestSpot, pieceAt, tileOf, trayOf } from "../src/art/homeEdit";
import { layoutOf } from "../src/art/homeLayout";

const without = (...kinds: Array<keyof Layout>): Layout => Object.fromEntries(Object.entries(STARTER).map(([k, v]) => [k, kinds.includes(k as keyof Layout) ? null : v])) as unknown as Layout;

describe("moved: a move that keeps the six rules", () => {
  it("puts a piece on a free spot: the dresser at (4,1), beside the bed, and leaves the layout it was given alone", () => {
    const next = moved(STARTER, "dresser", { col: 4, row: 1 });
    expect(next).toEqual({ ...STARTER, dresser: { col: 4, row: 1 } });
    expect(STARTER.dresser).toEqual({ col: 6, row: 1 });
  });

  it("allows a piece to stay where it is (the starter layout is a valid layout)", () => {
    expect(moved(STARTER, "table", { col: 17, row: 4 })).toEqual(STARTER);
  });

  it("lets a rug lie over the egg's tile (5,5) but not a solid piece: the bowl there is refused", () => {
    expect(moved(STARTER, "rug", { col: 3, row: 4 })).not.toBeNull(); // columns 3-6, rows 4-6
    expect(moved(STARTER, "bowl", { col: 5, row: 5 })).toBeNull();
  });

  it("refuses a solid piece on a poop tile (12,6) and on the grave's block: the table at (6,4)", () => {
    expect(moved(STARTER, "bowl", { col: 12, row: 6 })).toBeNull();
    expect(moved(STARTER, "table", { col: 6, row: 4 })).toBeNull();
  });

  it("refuses two solid pieces on the same tiles: the table at (14,2) is on the sofa's row 2", () => {
    expect(moved(STARTER, "table", { col: 14, row: 2 })).toBeNull();
  });

  it("refuses the wall rows for a piece that does not stand against the wall, and row 0 for the rest", () => {
    expect(moved(STARTER, "table", { col: 17, row: 1 })).toBeNull();
    expect(moved(STARTER, "dresser", { col: 6, row: 0 })).toBeNull();
  });

  it("refuses a piece that sticks out of its room or the home: the dresser across the partition (9,1), below the last row (6,7)", () => {
    expect(moved(STARTER, "dresser", { col: 9, row: 1 })).toBeNull();
    expect(moved(STARTER, "dresser", { col: 6, row: 7 })).toBeNull();
    expect(moved(STARTER, "dresser", { col: -1, row: 1 })).toBeNull();
  });

  it("refuses a piece in front of the bed (the bowl on (2,3)) and a bed whose front is off the floor (the bed at row 6)", () => {
    expect(moved(STARTER, "bowl", { col: 2, row: 3 })).toBeNull();
    expect(moved(STARTER, "bed", { col: 1, row: 6 })).toBeNull();
  });

  it("refuses a piece that shuts a room off: the table on (22,4) covers both tiles of the kitchen side of the doorway; the bowl at (9,4) leaves the other row of the bedroom's, so it stays allowed", () => {
    expect(moved(STARTER, "table", { col: 22, row: 4 })).toBeNull(); // (a creature is one tile tall on the floor: the feet line)
    expect(moved(STARTER, "bowl", { col: 9, row: 4 })).not.toBeNull();
  });

  it("puts a piece away, except the bed", () => {
    expect(moved(STARTER, "dresser", null)).toEqual(without("dresser"));
    expect(moved(STARTER, "mat", null)).toEqual(without("mat"));
    expect(moved(STARTER, "bed", null)).toBeNull();
  });
});

describe("trayOf: the pieces that are put away", () => {
  it("is empty when everything is out, and holds a piece put away", () => {
    expect(trayOf(STARTER, true)).toEqual([]);
    expect(trayOf(without("dresser", "bowl"), true)).toEqual(["dresser", "bowl"]);
  });

  it("holds the Feeding Mat only once it is owned", () => {
    expect(trayOf(without("dresser", "mat"), false)).toEqual(["dresser"]);
    expect(trayOf(without("dresser", "mat"), true)).toEqual(["dresser", "mat"]);
  });
});

describe("tileOf and pieceAt: the piece a finger is on", () => {
  it("names the tile: 24 pixels each, and the one below zero is -1", () => {
    expect(tileOf({ x: 0, y: 0 })).toEqual({ col: 0, row: 0 });
    expect(tileOf({ x: 23.9, y: 24 })).toEqual({ col: 0, row: 1 });
    expect(tileOf({ x: 385, y: 190 })).toEqual({ col: 16, row: 7 });
    expect(tileOf({ x: -1, y: -1 })).toEqual({ col: -1, row: -1 });
  });

  it("finds a piece on each of its tiles and nothing just outside: the sofa is columns 13-16 and rows 1-2", () => {
    for (const [col, row] of [[13, 1], [16, 1], [13, 2], [16, 2]]) expect(pieceAt(STARTER, true, col as number, row as number)).toBe("sofa");
    for (const [col, row] of [[12, 1], [17, 1], [13, 3], [14, 0]]) expect(pieceAt(STARTER, true, col as number, row as number)).toBeNull();
  });

  it("finds the bed from its lower right tile (3,2) and the rug from (16,6)", () => {
    expect(pieceAt(STARTER, true, 3, 2)).toBe("bed");
    expect(pieceAt(STARTER, true, 16, 6)).toBe("rug");
  });

  it("takes a solid piece over a flat one: the bowl over the mat at (24,5), the mat at (23,5)", () => {
    expect(pieceAt(STARTER, true, 24, 5)).toBe("bowl");
    expect(pieceAt(STARTER, true, 23, 5)).toBe("mat");
  });

  it("does not find the Feeding Mat while it is not owned", () => {
    expect(pieceAt(STARTER, false, 23, 5)).toBeNull();
    expect(pieceAt(STARTER, false, 24, 5)).toBe("bowl");
  });

  it("takes the piece drawn later where two overlap (a rug and a mat; two solid pieces cannot, but the order is the drawing order)", () => {
    const both = { ...STARTER, mat: { col: 13, row: 4 } };
    expect(pieceAt(both, true, 14, 4)).toBe("mat");
    const crossed = { ...STARTER, table: { col: 14, row: 2 } };
    expect(pieceAt(crossed, true, 14, 2)).toBe("table");
  });

  it("finds nothing on a put-away piece's old tiles", () => {
    expect(pieceAt(without("sofa"), true, 14, 1)).toBeNull();
  });
});

describe("nearestSpot: where a piece out of the tray lands", () => {
  it("puts it on its own old place when that is the middle of the view: the dresser's middle (7,2) is spot (6,1)", () => {
    expect(nearestSpot(without("dresser"), "dresser", { col: 7, row: 2 })).toEqual({ col: 6, row: 1 });
  });

  it("puts it in the kitchen when the view's middle is there: the table with its middle at (25,4) is spot (24,3)", () => {
    expect(nearestSpot(without("table"), "table", { col: 25, row: 4 })).toEqual({ col: 24, row: 3 });
  });

  it("goes to the nearest allowed spot when the middle is taken, the upper one of two as near: the dresser for the sofa's middle (14,2) is (11,1), not (13,3)", () => {
    expect(nearestSpot(without("dresser"), "dresser", { col: 14, row: 2 })).toEqual({ col: 11, row: 1 });
  });

  it("never picks a spot the rules refuse: the bowl for the egg's tile (5.5, 5.5) is not on it", () => {
    const spot = nearestSpot(without("bowl"), "bowl", { col: 5.5, row: 5.5 });
    expect(spot).not.toBeNull();
    expect(moved(without("bowl"), "bowl", spot)).not.toBeNull();
    expect(spot).not.toEqual({ col: 5, row: 5 });
  });
});

describe("lift, follow and drop: a piece held by a finger", () => {
  it("lifts the piece under the finger and remembers where on it the finger is: the sofa at its tile (15,2) is grip (2,1)", () => {
    expect(lift(STARTER, true, 15, 2)).toEqual({ kind: "sofa", from: { col: 13, row: 1 }, at: { col: 13, row: 1 }, grip: { col: 2, row: 1 }, valid: true });
  });

  it("lifts nothing from an empty tile or from the Feeding Mat when it is not owned", () => {
    expect(lift(STARTER, true, 5, 3)).toBeNull();
    expect(lift(STARTER, false, 23, 5)).toBeNull();
  });

  it("follows the finger by tiles, keeping the grip: the finger from (15,2) to (15,3) takes the sofa from (13,1) to (13,2)", () => {
    const held = lift(STARTER, true, 15, 2)!;
    expect(follow(STARTER, held, 15, 3)).toMatchObject({ at: { col: 13, row: 2 }, valid: true });
    expect(follow(STARTER, lift(STARTER, true, 16, 2)!, 20, 2)).toMatchObject({ at: { col: 17, row: 1 }, valid: true }); // grip (3,1)
  });

  it("marks a spot the rules refuse: the sofa lifted into the wall's top row, or onto the dresser", () => {
    const held = lift(STARTER, true, 15, 2)!;
    expect(follow(STARTER, held, 15, 0)).toMatchObject({ at: { col: 13, row: -1 }, valid: false });
    expect(follow(STARTER, held, 8, 2)).toMatchObject({ at: { col: 6, row: 1 }, valid: false });
  });

  it("gives back the same lift when the finger stays on the same tile", () => {
    const held = lift(STARTER, true, 15, 2)!;
    expect(follow(STARTER, held, 15, 2)).toBe(held);
    const moved1 = follow(STARTER, held, 15, 3);
    expect(follow(STARTER, moved1, 15, 3)).toBe(moved1);
  });

  it("puts the piece down where it is held when that is allowed, and sends it back when it is not or when it never left", () => {
    const held = lift(STARTER, true, 15, 2)!;
    expect(drop(STARTER, follow(STARTER, held, 15, 3))).toEqual({ ...STARTER, sofa: { col: 13, row: 2 } });
    expect(drop(STARTER, follow(STARTER, held, 8, 2))).toBeNull();
    expect(drop(STARTER, held)).toBeNull();
    const there = follow(STARTER, follow(STARTER, held, 15, 3), 15, 2); // moved and back
    expect(drop(STARTER, there)).toBeNull();
  });
});

describe("homeOf: the saved form of a layout", () => {
  it("writes every piece, a put-away one as null, and reads back as the very layout", () => {
    const layout = moved(STARTER, "dresser", null)!;
    const home = homeOf(layout);
    expect(Object.keys(home.pieces)).toEqual(["bed", "dresser", "sofa", "rug", "table", "counter", "fridge", "mat", "bowl"]);
    expect(home.pieces.dresser).toBeNull();
    expect(layoutOf(home)).toEqual(layout);
    expect(coerceHome(JSON.parse(JSON.stringify(home)))).toEqual(home);
  });

  it("gives the starter layout back for the starter layout", () => {
    expect(layoutOf(homeOf(STARTER))).toEqual(STARTER);
  });

  it("does not share a placement with the layout it came from", () => {
    const home = homeOf(STARTER);
    (home.pieces.sofa as { col: number }).col = 99;
    expect(STARTER.sofa).toEqual({ col: 13, row: 1 });
  });
});
