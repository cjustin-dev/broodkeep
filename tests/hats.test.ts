// The hats (adult track A2.4): the rule that puts a hat on a picture, the four hats' art, what wearing does to the save, and what a save from storage may hold.
// The edge cases are numbered as in docs/adult-a2-plan.md section 12; "edge N" below is that list. Expected values are written out by hand (pictures, positions and
// words), never made by the code under test; the positions of edge 8 come from a Python mock of the rule (scratch), not from `crownRow`.
import { describe, expect, it } from "vitest";
import { blanketBox, faceSprite } from "../src/art/face";
import type { FaceKind } from "../src/art/face";
import { crownRow, hatArt, hatOf, hatSizeOf, withHat } from "../src/art/hat";
import { forms, getForm } from "../src/data/forms";
import { isHatId, isItemId, isWallId, itemIds, items } from "../src/data/shop";
import type { HatId } from "../src/data/shop";
import { dishIds } from "../src/game/dishes";
import { retireCreature, startNewEgg } from "../src/game/actions";
import { killCreature } from "../src/game/dev";
import { evolveTo } from "../src/game/sim";
import { buy, undoBuy, useHat, useWall } from "../src/game/shop";
import { migrateSave, newSave } from "../src/game/state";
import type { Save } from "../src/game/state";
import { isUntouched } from "../src/sync/sync";
import { aliveSave, at } from "./helpers";

const DAY = at(10);
const HATS: HatId[] = ["hat-knit", "hat-acorn", "hat-fisher", "hat-crown"];
const clone = (save: Save): Save => JSON.parse(JSON.stringify(save)) as Save;
const pic = (...rows: string[]) => ({ rows, palette: { B: "#123456" } as Record<string, string> });

// The small Stone Crown, written out (7 wide, 4 tall): the hat the literal pictures below are checked against.
const CROWN_SMALL = [".1.1.1.", "1212121", "1222221", "1345441"];
// A picture with a hat grid laid over it at (top, left), cell by cell, written for the tests (not the code's).
function overlay(rows: string[], grid: string[], top: number, left: number): string[] {
  return rows.map((row, y) => {
    const g = grid[y - top];
    if (g === undefined) return row;
    return row
      .split("")
      .map((cell, x) => (x >= left && x < left + g.length && g[x - left] !== "." ? g[x - left]! : cell))
      .join("");
  });
}
const BLANK = (n: number): string[] => Array.from({ length: n }, () => ".".repeat(15));

describe("the crown row (edges 1, 2)", () => {
  it("edge 1: a one-cell spike on top of a wide head is not the crown; the first wide row is", () => {
    const rows = [...BLANK(5), "......B........", ".....BBB.......", "....BBBBBB.....", "...BBBBBBBB....", "..BBBBBBBBBB..."];
    // The widest row is 10 cells, so a row needs max(3, round(4)) = 4: the spike (1) and the 3-wide row are not it; row 7 (6 wide, columns 4 to 9) is.
    expect(crownRow(rows)).toEqual({ row: 7, centre: 6.5 });
  });

  it("edge 1: a row exactly round(0.4 x the widest) wide is the crown, one cell narrower is not", () => {
    const wide = ".".repeat(5) + "B".repeat(10) + ".".repeat(5); // 10 wide
    const four = ".".repeat(8) + "BBBB" + ".".repeat(8);
    const three = ".".repeat(8) + "BBB" + ".".repeat(9);
    expect(crownRow([four, wide])?.row).toBe(0); // 4 = round(0.4 x 10)
    expect(crownRow([three, wide])?.row).toBe(1); // 3 is one short
    // The rounding itself: 0.4 x 9 = 3.6 rounds up to 4 (a floor would take 3), and 0.4 x 11 = 4.4 rounds down to 4 (a ceiling would ask for 5).
    const nine = ".".repeat(3) + "B".repeat(9) + ".".repeat(3);
    const eleven = ".".repeat(2) + "B".repeat(11) + ".".repeat(2);
    expect(crownRow([three, nine])?.row).toBe(1);
    expect(crownRow([".".repeat(5) + "BBB" + ".".repeat(7), nine].map((r) => r.slice(0, 15)))?.row).toBe(1);
    expect(crownRow([".".repeat(6) + "BBBB" + ".".repeat(5), eleven])?.row).toBe(0);
  });

  it("edge 1: with the widest row 5 wide the floor of 3 matters (3 wide is the crown, 2 wide is not)", () => {
    expect(crownRow([".BBB.", "BBBBB"])?.row).toBe(0);
    expect(crownRow([".BB..", "BBBBB"])?.row).toBe(1);
  });

  it("edge 2: an empty picture has no crown; a picture narrower than 3 everywhere has none", () => {
    expect(crownRow([".....", "....."])).toBeNull();
    expect(crownRow([])).toBeNull();
    expect(crownRow([".BB..", ".BB.."])).toBeNull();
  });
});

describe("putting a hat on (edges 2 to 6)", () => {
  const dome = [...BLANK(5), "......B........", ".....BBB.......", "....BBBBBB.....", "...BBBBBBBB....", "..BBBBBBBBBB..."];

  it("lays the hat's last row on the crown row, centred on its span, and changes nothing else", () => {
    // Crown row 7, span columns 4 to 9, centre 6.5, a 7 wide hat: left = floor(6.5 - 3.5 + 0.5) = 3; the hat is 4 tall, so top = 7 + 1 - 4 = 4.
    const out = withHat(pic(...dome), "hat-crown", "kid");
    expect(out.rows).toEqual(overlay(dome, CROWN_SMALL, 4, 3));
    expect(out.palette.B).toBe("#123456"); // the picture's own colours stay
    expect(out.palette["2"]).toBe(hatArt["hat-crown"].palette["2"]);
  });

  it("edge 2: an empty picture comes back as the same object; a one-row picture draws only the hat's cells that fall on row 0", () => {
    const empty = pic("...", "...");
    expect(withHat(empty, "hat-knit", "adult")).toBe(empty);
    const one = pic("..BBBBBBBBB..");
    const out = withHat(one, "hat-crown", "kid");
    expect(out.rows).toHaveLength(1);
    expect(out.rows[0]!.length).toBe(13);
    // Crown row 0, span 2 to 10, centre 6: left = floor(6 - 3.5 + 0.5) = 3, top = max(0, 0 + 1 - 4) = 0; only the hat's first row (".1.1.1.") lands on row 0.
    expect(out.rows[0]).toBe("..BB1B1B1BB.."); // columns 4, 6 and 8 take the hat's three 1s
  });

  it("edge 3: when the crown row is row 0 the hat starts at row 0 and nothing is written above it", () => {
    const top = pic("..BBBBBBBBB..", "..BBBBBBBBB..", "..BBBBBBBBB..", "..BBBBBBBBB..", "..BBBBBBBBB..");
    const out = withHat(top, "hat-crown", "kid");
    expect(out.rows).toHaveLength(5);
    expect(out.rows).toEqual(overlay(top.rows, CROWN_SMALL, 0, 3));
    expect(out.rows[4]).toBe("..BBBBBBBBB..");
  });

  it("edge 4: a hat wider than the picture, and a head against the left or right edge, are cut off and never wrap", () => {
    const narrow = pic("BBBBB", "BBBBB", "BBBBB", "BBBBB", "BBBBB");
    const out = withHat(narrow, "hat-crown", "kid"); // 7 wide on 5 wide: centre 2, left = floor(2 - 3.5 + 0.5) = -1
    expect(out.rows.map((r) => r.length)).toEqual([5, 5, 5, 5, 5]);
    expect(out.rows[0]).toBe("1B1B1"); // the hat's row 0 ".1.1.1." from column -1: its 1s fall on columns 0, 2 and 4, the rest keeps the picture
    // A head of 3 at the left edge: centre 1, left = floor(1 - 3.5 + 0.5) = -2, so the 7 wide hat is cut at the left and nothing wraps to the right end.
    const leftHug = pic("BBB.........", "BBB.........", "BBB.........", "BBB.........", "BBB.........");
    const cutLeft = withHat(leftHug, "hat-knit", "kid").rows;
    expect(cutLeft[0]).toBe("111.........");
    for (const row of cutLeft) expect(row.slice(5), row).toBe(".......");
    // A head of 3 at the right edge (columns 9 to 11): centre 10, left = 7, the hat runs to column 13 and is cut at 11.
    const rightHug = pic(".........BBB", ".........BBB", ".........BBB", ".........BBB", ".........BBB");
    const cutRight = withHat(rightHug, "hat-knit", "kid").rows;
    expect(cutRight.map((r) => r.length)).toEqual([12, 12, 12, 12, 12]);
    for (const row of cutRight) expect(row.slice(0, 7), row).toBe(".......");
  });

  it("edge 5: the input is never changed, and the hatless picture of the same form is still hatless after a hatted one was made", () => {
    const input = pic(...dome);
    const rowsBefore = [...input.rows];
    const paletteBefore = { ...input.palette };
    const out = withHat(input, "hat-fisher", "adult");
    expect(input.rows).toEqual(rowsBefore);
    expect(input.palette).toEqual(paletteBefore);
    expect(out.rows).not.toBe(input.rows);
    expect(out.palette).not.toBe(input.palette);

    const form = getForm("gravelhorn");
    const plain = [...faceSprite(form, "open", 0).rows];
    const hatted = faceSprite(form, "open", 0, "hat-knit");
    expect(hatted.rows).not.toEqual(plain);
    expect(faceSprite(form, "open", 0).rows).toEqual(plain); // hatless after hatted
    expect(faceSprite(form, "open", 0, "hat-knit")).toBe(hatted); // and the hatted one is made once
    expect(faceSprite(form, "open", 0, "hat-acorn").rows).not.toEqual(hatted.rows); // each hat has its own picture
  });
});

describe("every form, every look (edges 6, 7)", () => {
  const kinds: FaceKind[] = ["open", "closed", "half", "up", "happy", "yawn", "droop", "droopSad", "droopClosed", "droopYawn", "droopHappy", "lie0", "lie1"];
  const digits = /[1-5]/;

  it("keeps the size, changes only the hat's cells, shows the hat, and clashes with no form's letter", () => {
    let pictures = 0;
    for (const id of Object.keys(forms)) {
      const form = forms[id]!;
      for (const kind of kinds) {
        for (const frame of [0, 1] as const) {
          const plain = faceSprite(form, kind, frame);
          expect(plain.rows.some((row) => digits.test(row)), `${id} ${kind} has a digit`).toBe(false);
          expect(Object.keys(form.palette).some((letter) => digits.test(letter)), `${id} palette`).toBe(false);
          for (const hat of HATS) {
            const worn = faceSprite(form, kind, frame, hat);
            pictures++;
            expect(worn.rows.length, `${id} ${kind} ${hat} rows`).toBe(plain.rows.length);
            const grid = hatSizeOf(form.stage) === "small" ? hatArt[hat].small : hatArt[hat].large;
            let hatCells = 0;
            let changed = 0; // cells that are not the hat's and are not the picture's (counted, then asserted once: 6760 pictures of up to 56 x 48 cells)
            let badRows = 0;
            worn.rows.forEach((row, y) => {
              if (row.length !== plain.rows[y]!.length) badRows++;
              for (let x = 0; x < row.length; x++) {
                if (digits.test(row[x]!)) hatCells++;
                else if (row[x] !== plain.rows[y]![x]) changed++;
              }
            });
            expect(badRows, `${id} ${kind} ${hat} row lengths`).toBe(0);
            expect(changed, `${id} ${kind} ${hat} cells that are neither the hat's nor the picture's`).toBe(0);
            // The hat's cells that are in the picture are all there: at least a third of the grid (a hat is never lost off the edge), and never more than the grid has.
            const gridCells = grid.join("").replace(/\./g, "").length;
            expect(hatCells, `${id} ${kind} ${hat} cells`).toBeGreaterThanOrEqual(Math.ceil(gridCells / 3));
            expect(hatCells, `${id} ${kind} ${hat} cells`).toBeLessThanOrEqual(gridCells);
          }
        }
      }
    }
    expect(pictures).toBe(65 * 13 * 2 * 4);
  });
});

describe("where the hat lands (edge 8)", () => {
  // The top row and left column of the hat's cells, from a Python mock of the rule over the same pictures (scratch), for a baby, a kid, a young and an adult standing,
  // and an adult lying and one drooping (the two that sit well below the top of the picture).
  const cases: Array<[string, FaceKind, HatId, number, number]> = [
    ["blip", "open", "hat-knit", 0, 6],
    ["pebblin", "open", "hat-knit", 0, 8],
    ["cragpup", "open", "hat-knit", 0, 11],
    ["gravelhorn", "open", "hat-knit", 0, 17],
    ["tuskmole", "lie0", "hat-knit", 19, 21],
    ["tuskmole", "lie0", "hat-crown", 22, 21],
    ["mudlop", "droop", "hat-knit", 9, 21],
    ["mudlop", "droop", "hat-crown", 12, 21],
  ];
  it.each(cases)("%s %s with %s: top row %i, left column %i", (id, kind, hat, top, left) => {
    const rows = faceSprite(getForm(id), kind, 0, hat).rows;
    const hatRows = rows.flatMap((row, y) => (/[1-5]/.test(row) ? [y] : []));
    const cols = rows.flatMap((row) => (/[1-5]/.test(row) ? [row.search(/[1-5]/)] : []));
    expect({ top: Math.min(...hatRows), left: Math.min(...cols) }).toEqual({ top, left });
  });
});

describe("the hats' art (edge 9)", () => {
  it("each hat has a small 7 wide grid and a large 13 wide one, rectangular, in its own letters 1 to 5, and the right size follows the stage", () => {
    for (const hat of HATS) {
      const art = hatArt[hat];
      expect(Object.keys(art.palette).sort(), hat).toEqual(["1", "2", "3", "4", "5"]);
      for (const [size, width] of [["small", 7], ["large", 13]] as const) {
        const grid = art[size];
        expect(grid.length, `${hat} ${size} tall`).toBeGreaterThanOrEqual(4);
        for (const row of grid) {
          expect(row.length, `${hat} ${size}`).toBe(width);
          expect(row, `${hat} ${size}`).toMatch(/^[.1-5]+$/);
        }
      }
    }
    expect(["baby", "kid", "young", "adult"].map((s) => hatSizeOf(s as "baby"))).toEqual(["small", "small", "large", "large"]);
    // The small hat is on a baby and a kid, the large on a young and an adult: the same hat is 7 wide on one and 13 on the other.
    const width = (id: string): number => {
      const rows = faceSprite(getForm(id), "open", 0, "hat-fisher").rows;
      const cols = rows.flatMap((row) => (/[1-5]/.test(row) ? [row.search(/[1-5]/), row.search(/[1-5][^1-5]*$/)] : []));
      return Math.max(...cols) - Math.min(...cols) + 1;
    };
    expect([width("blip"), width("pebblin"), width("cragpup"), width("gravelhorn")]).toEqual([7, 7, 13, 13]);
  });
});

describe("the blanket (edge 22)", () => {
  // The scene fits the blanket to the HATLESS lying picture (scene.ts: drawBlanket(ctx, faceSprite(form, kind, frame), ...)). This pins why: a hat can move the blanket's box,
  // so a blanket fitted to the hatted picture would sit two rows higher on a Scorchlet in a Knit Cap. The wiring itself is checked in a browser (shop-browser, "hat-bed").
  it("a hat moves blanketBox for some lying pictures (a Scorchlet's top is 26 plain, 24 in a Knit Cap, in both lying pictures)", () => {
    const scorchlet = forms.scorchlet!;
    expect(blanketBox(faceSprite(scorchlet, "lie0", 0))).toEqual({ left: -1, right: 44, top: 26, bottom: 35 });
    expect(blanketBox(faceSprite(scorchlet, "lie0", 0, "hat-knit"))).toEqual({ left: -1, right: 44, top: 24, bottom: 35 });
    // The sleeper alternates the two lying pictures (a breath every 1.4 s), and the hat moves the box in both.
    expect(blanketBox(faceSprite(scorchlet, "lie1", 0))).toEqual({ left: -1, right: 44, top: 26, bottom: 35 });
    expect(blanketBox(faceSprite(scorchlet, "lie1", 0, "hat-knit"))).toEqual({ left: -1, right: 44, top: 24, bottom: 35 });
  });
});

describe("the hat position across looks and frames (edge 29)", () => {
  const top = (rows: string[]): number => rows.findIndex((row) => /[1-5]/.test(row));
  const left = (rows: string[]): number => Math.min(...rows.filter((row) => /[1-5]/.test(row)).map((row) => row.search(/[1-5]/)));

  it("the hat does not move between the six standing looks of one frame (only the face changes)", () => {
    const looks: FaceKind[] = ["open", "closed", "half", "up", "happy", "yawn"];
    for (const id of Object.keys(forms)) {
      for (const frame of [0, 1] as const) {
        const spots = looks.map((kind) => {
          const rows = faceSprite(forms[id]!, kind, frame, "hat-knit").rows;
          return `${top(rows)},${left(rows)}`;
        });
        expect(new Set(spots).size, `${id} frame ${frame}: ${spots.join(" ")}`).toBe(1);
      }
    }
  });

  it("between the two drawings it moves at most 2 rows and 2 columns (the rule holds the second drawing within 2 of the first; one form lifts a claw 10 rows higher in its second drawing), and between lie0 and lie1 at most 1 row and 2 columns (the breath, measured)", () => {
    for (const id of Object.keys(forms)) {
      const a = faceSprite(forms[id]!, "open", 0, "hat-knit").rows;
      const b = faceSprite(forms[id]!, "open", 1, "hat-knit").rows;
      expect(Math.abs(top(a) - top(b)), `${id} frames`).toBeLessThanOrEqual(2);
      expect(Math.abs(left(a) - left(b)), `${id} frames`).toBeLessThanOrEqual(2);
      const l0 = faceSprite(forms[id]!, "lie0", 0, "hat-knit").rows;
      const l1 = faceSprite(forms[id]!, "lie1", 0, "hat-knit").rows;
      expect(Math.abs(top(l0) - top(l1)), `${id} lie`).toBeLessThanOrEqual(1);
      expect(Math.abs(left(l0) - left(l1)), `${id} lie`).toBeLessThanOrEqual(2);
    }
  });
});

describe("the catalogue's hats (edges 18, 27, 30)", () => {
  it("edge 27: isHatId is true for the four hats and nothing else", () => {
    for (const hat of HATS) expect(isHatId(hat), hat).toBe(true);
    for (const other of ["comfy-bed", "wall-meadow", "stew", "constructor", "toString", "__proto__", "", 3, null, undefined, {}, ["hat-knit"]]) {
      expect(isHatId(other), String(other)).toBe(false);
    }
  });

  it("edge 18: the hats are items 10 to 13, 12 coins and 2 of one material each, with no dish, and are not wallpaper", () => {
    expect(itemIds.slice(9)).toEqual(HATS);
    expect(HATS.map((id) => items[id].price)).toEqual([
      { coins: 12, materials: { fiber: 2 } },
      { coins: 12, materials: { wood: 2 } },
      { coins: 12, materials: { fish: 2 } },
      { coins: 12, materials: { stone: 2 } },
    ]);
    for (const hat of HATS) {
      expect(items[hat].dish, hat).toBeUndefined();
      expect(isWallId(hat), hat).toBe(false);
      expect(isItemId(hat)).toBe(true);
    }
    expect(dishIds).toEqual(["hearty-bowl", "green-bowl", "sweet-bowl", "stew", "garden-mix"]);
  });

  it("edge 30: the cards' words", () => {
    expect(HATS.map((id) => [items[id].name, items[id].effect])).toEqual([
      ["Knit Cap", "A red knit cap with a pom-pom. For looks only."],
      ["Acorn Cap", "A brown acorn cap. For looks only."],
      ["Fisher Hat", "A yellow fisher's hat with a brim. For looks only."],
      ["Stone Crown", "A grey crown with three points. For looks only."],
    ]);
  });
});

// A living creature that owns the given items.
function owner(...ids: string[]): Save {
  const save = aliveSave("gravelhorn", DAY);
  save.owned = [...ids];
  return save;
}

describe("wearing a hat (edges 11, 12, 13)", () => {
  it("edge 11: an owned hat goes on (true); the one already on changes nothing (false); null takes it off (true); null with none on is false", () => {
    const save = owner("hat-knit", "hat-crown");
    expect(useHat(save, "hat-knit")).toBe(true);
    expect(save.hat).toBe("hat-knit");
    expect(useHat(save, "hat-knit")).toBe(false);
    expect(useHat(save, "hat-crown")).toBe(true); // another hat replaces it
    expect(save.hat).toBe("hat-crown");
    expect(useHat(save, null)).toBe(true);
    expect(save.hat).toBeNull();
    expect(useHat(save, null)).toBe(false);
  });

  it("edge 11: a hat not owned, a wallpaper, a food, a prototype name, an empty string and a number change nothing", () => {
    const save = owner("hat-knit", "wall-meadow", "stew");
    save.hat = "hat-knit";
    const before = JSON.stringify(save);
    for (const id of ["hat-acorn", "wall-meadow", "stew", "comfy-bed", "constructor", "toString", "", "nope", 3 as unknown as string]) {
      expect(useHat(save, id), String(id)).toBe(false);
      expect(JSON.stringify(save), String(id)).toBe(before);
    }
    const bare = aliveSave("gravelhorn", DAY);
    expect(useHat(bare, "hat-knit")).toBe(false); // owned nothing
    expect(bare.hat).toBeNull();
  });

  it("edge 12: buying a hat takes the price in one step and does not put it on; the wallpaper still goes on the wall at once", () => {
    const save = aliveSave("gravelhorn", DAY);
    save.coins = 12;
    save.inventory = { fiber: 2 };
    expect(buy(save, "hat-knit", DAY)).toBe("bought");
    expect(save.coins).toBe(0);
    expect(save.inventory.fiber).toBe(0);
    expect(save.owned).toEqual(["hat-knit"]);
    expect(save.hat).toBeNull();
    expect(buy(save, "hat-knit", DAY)).toBe("owned");
    expect(save.coins).toBe(0);
    const poor = aliveSave("gravelhorn", DAY);
    poor.coins = 11;
    poor.inventory = { wood: 2 };
    const before = JSON.stringify(poor);
    expect(buy(poor, "hat-acorn", DAY)).toBe("poor");
    expect(JSON.stringify(poor)).toBe(before);
    expect(buy(poor, "hat-nope", DAY)).toBe("unknown");

    const wall = aliveSave("gravelhorn", DAY);
    wall.coins = 12;
    wall.inventory = { herb: 2 };
    buy(wall, "wall-meadow", DAY);
    expect(wall.wall).toBe("wall-meadow");
    expect(wall.hat).toBeNull();
  });

  it("edge 13: undoing a worn hat takes it off, with the exact refund; a hat that is not worn, or another worn hat, is left alone", () => {
    const worn = aliveSave("gravelhorn", DAY);
    worn.coins = 12;
    worn.inventory = { stone: 2 };
    buy(worn, "hat-crown", DAY);
    useHat(worn, "hat-crown");
    expect(undoBuy(worn, DAY + 3000)).toBe("undone");
    expect(worn.hat).toBeNull();
    expect(worn.owned).toEqual([]);
    expect(worn.coins).toBe(12);
    expect(worn.inventory.stone).toBe(2);

    const notWorn = aliveSave("gravelhorn", DAY);
    notWorn.coins = 12;
    notWorn.inventory = { fish: 2 };
    notWorn.owned = ["hat-knit"];
    notWorn.hat = "hat-knit";
    buy(notWorn, "hat-fisher", DAY);
    expect(undoBuy(notWorn, DAY + 3000)).toBe("undone");
    expect(notWorn.hat).toBe("hat-knit"); // the other hat stays on
    expect(notWorn.owned).toEqual(["hat-knit"]);
  });
});

describe("a saved hat (edges 14, 15, 16, 17, 28)", () => {
  const withHatField = (hat: unknown, owned: unknown = ["hat-knit"]): unknown => ({ ...clone(aliveSave("gravelhorn", DAY)), owned, hat });

  it("edge 14: a save with no hat field reads as none; an owned hat is kept", () => {
    const old = clone(aliveSave("gravelhorn", DAY)) as unknown as Record<string, unknown>;
    delete old.hat;
    expect(migrateSave(old)?.hat).toBeNull();
    expect(migrateSave(withHatField("hat-knit"))?.hat).toBe("hat-knit");
  });

  it("edge 14: a hat that is not owned, a wallpaper, an unknown id, a prototype name, a number and an object all read as none", () => {
    expect(migrateSave(withHatField("hat-crown"))?.hat).toBeNull(); // not owned
    expect(migrateSave(withHatField("wall-meadow", ["wall-meadow"]))?.hat).toBeNull();
    for (const bad of ["hat-gone", "constructor", "toString", "", 3, {}, [], true, null]) {
      expect(migrateSave(withHatField(bad, ["hat-knit", "hat-gone"]))?.hat, JSON.stringify(bad)).toBeNull();
    }
    expect(migrateSave(withHatField("hat-knit", null))?.hat).toBeNull(); // owned is not a list, so nothing is owned
  });

  it("edge 15: a fresh save wears none, and a save that owns a hat is not untouched", () => {
    expect(newSave(DAY, 1).hat).toBeNull();
    const save = newSave(DAY, 1);
    expect(isUntouched(save)).toBe(true);
    save.owned = ["hat-knit"];
    expect(isUntouched(save)).toBe(false);
  });

  it("edge 16: a retire and a new egg leave the hat and what is owned as they were", () => {
    const save = aliveSave("hollowbloom", DAY);
    save.owned = ["hat-knit", "wall-meadow"];
    save.hat = "hat-knit";
    save.wall = "wall-meadow";
    const dead = clone(save);
    expect(retireCreature(save, DAY)).toBe("retired");
    expect(save.phase).toBe("egg");
    expect([save.hat, save.owned, save.wall]).toEqual(["hat-knit", ["hat-knit", "wall-meadow"], "wall-meadow"]);
    expect(hatOf(save)).toBe("hat-knit");
    killCreature(dead, DAY);
    expect(startNewEgg(dead, DAY)).toBe(true);
    expect(dead.phase).toBe("egg");
    expect([dead.hat, dead.owned, dead.wall]).toEqual(["hat-knit", ["hat-knit", "wall-meadow"], "wall-meadow"]);
  });

  it("edge 17: the hat, the purchase and the coins it cost are fields of the one saved document, so a stored save carries all three or none (which save wins is the sync's own rule, tests/cloud-sync.test.ts)", () => {
    const older = clone(aliveSave("gravelhorn", DAY));
    older.coins = 12;
    older.inventory = { fiber: 2 };
    const newer = clone(older);
    buy(newer, "hat-knit", DAY + 1000);
    useHat(newer, "hat-knit");
    // What is stored and read back is the document as it was written: the newer one has the hat, the cap in `owned` and the 12 coins gone; the older one has none of the three.
    const storedNewer = migrateSave(clone(newer))!;
    const storedOlder = migrateSave(clone(older))!;
    expect([storedNewer.hat, storedNewer.owned, storedNewer.coins, storedNewer.inventory.fiber]).toEqual(["hat-knit", ["hat-knit"], 0, 0]);
    expect([storedOlder.hat, storedOlder.owned, storedOlder.coins, storedOlder.inventory.fiber]).toEqual([null, [], 12, 2]);
  });

  it("edge 28: evolving while wearing a hat keeps it, and the size follows the new form's stage (kid small, young large)", () => {
    const save = aliveSave("pebblin", DAY);
    save.owned = ["hat-knit"];
    save.hat = "hat-knit";
    const kid = getForm("pebblin");
    const before = faceSprite(kid, "open", 0, "hat-knit").rows.map((row) => row.replace(/[^1-5]/g, "").length);
    const bigger = Object.values(forms).find((f) => f.stage === "young")!;
    evolveTo(save, bigger.id, DAY + 1000);
    expect(save.hat).toBe("hat-knit");
    const after = faceSprite(getForm(save.creature!.formId), "open", 0, hatOf(save)).rows.map((row) => row.replace(/[^1-5]/g, "").length);
    expect(Math.max(...before)).toBe(7); // the Knit Cap's widest row, small
    expect(Math.max(...after)).toBe(13); // and large
  });
});

describe("a wallpaper and a hat do not mix (edge 11)", () => {
  it("useWall refuses a hat and useHat refuses a wallpaper", () => {
    const save = owner("hat-knit", "wall-meadow");
    expect(useWall(save, "hat-knit")).toBe(false);
    expect(save.wall).toBeNull();
    expect(useHat(save, "wall-meadow")).toBe(false);
    expect(save.hat).toBeNull();
  });
});
