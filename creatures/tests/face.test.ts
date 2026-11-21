// Closed eyes, lying down and eating: the shapes behind the sleeping and feeding pictures.
import { describe, expect, it } from "vitest";
import { WIDE_WIDTH, blanketBox, closeEyes, eyeSpots, faceSprite, findEyes, halfEyes, happyEyes, isWide as isWideKind, lieDown, lookUp, openMouth, pickFace } from "../src/art/face";
import { BLINK, MEAL, YAWN, blinking, createView, eyesClosed, foodLeft, poseOffsets, snackCut, startEating, triggerPose, updateView } from "../src/art/idle";
import { ROOM } from "../src/art/layout";
import { makeRng } from "../src/game/rng";
import { forms } from "../src/data/forms";
import { moodOf } from "../src/art/scene";
import { makeCreature } from "../src/game/sim";
import { newSave } from "../src/game/state";

const all = Object.values(forms);
const awake = { asleep: false, sad: false, sick: false };

const filledRows = (rows: string[]): number[] => rows.flatMap((row, y) => (/[^.]/.test(row) ? [y] : []));
const count = (rows: string[], letter: string): number => rows.join("").split(letter).length - 1;

describe("closed eyes", () => {
  for (const form of all) {
    it(`${form.id} has two eyes in the 2 x 2 pattern, and closing them leaves no white behind`, () => {
      const eyes = findEyes(form.idle);
      expect(eyes).toHaveLength(2);
      const closed = closeEyes({ rows: form.idle, palette: form.palette });
      expect(closed.rows).toHaveLength(form.idle.length);
      for (const { x, y } of eyes) {
        expect(closed.rows[y + 1]?.slice(x, x + 2)).toBe("KK"); // the shut eye is a dark line
        expect(closed.rows[y]?.slice(x, x + 2)).not.toContain("W");
      }
      expect(count(closed.rows, "W")).toBe(count(form.idle, "W") - 6); // 3 white pixels gone per eye
    });
  }

  it("a picture with no eyes is left alone", () => {
    const rows = ["....", ".KK.", "...."];
    expect(closeEyes({ rows, palette: {} }).rows).toEqual(rows);
  });
});

describe("lying down", () => {
  for (const form of all) {
    it(`${form.id} gets flatter and wider, keeps its face and its outline, and stays on the floor line`, () => {
      const open = filledRows(form.idle);
      const lie0 = faceSprite(form, "lie0").rows;
      const lie1 = faceSprite(form, "lie1").rows;
      for (const rows of [lie0, lie1]) {
        expect(rows).toHaveLength(form.idle.length);
        for (const row of rows) expect(row).toHaveLength(WIDE_WIDTH);
        const filled = filledRows(rows);
        expect(filled.length).toBeLessThan(open.length); // flatter
        expect(filled[filled.length - 1]).toBe(open[open.length - 1]); // same bottom row
        expect(count(rows, "M")).toBeGreaterThanOrEqual(count(form.idle, "M")); // mouth kept
        expect(count(rows, "W")).toBe(count(form.idle, "W") - 6); // eyes shut
        // top and bottom outline rows are the same row of the picture, only wider
        const topRow = rows[filled[0] as number] as string;
        const sourceTop = form.idle[open[0] as number] as string;
        for (const ch of new Set(topRow)) expect(sourceTop + ".").toContain(ch);
      }
      // widest part is wider than the standing picture, and within the canvas
      const width = (rows: string[]): number => Math.max(...rows.map((r) => r.lastIndexOf("K") - r.indexOf("K") + 1));
      expect(width(lie0)).toBeGreaterThan(width(form.idle));
      // breathing: one extra row in the second picture
      expect(filledRows(lie1).length).toBe(filledRows(lie0).length + 1);
    });
  }

  it("never removes a protected row", () => {
    const rows = ["....", "KKKK", "KMMK", "KWWK", "KKKK", "...."];
    const lying = lieDown({ rows, palette: {} }, [2, 3], [], 0);
    expect(count(lying.rows, "M")).toBeGreaterThanOrEqual(2);
    expect(count(lying.rows, "W")).toBeGreaterThanOrEqual(2);
  });
});

describe("saying no", () => {
  it("closes its eyes and sways gently, two pixels at the most, for over a second", () => {
    const view = createView();
    triggerPose(view, "refuse");
    expect(view.poseLength).toBeGreaterThan(1);
    expect(eyesClosed(view)).toBe(true);
    let biggest = 0;
    let swung = 0;
    let last = 0;
    for (let t = 0; t < view.poseLength; t += 0.02) {
      const dx = poseOffsets({ ...view, poseTime: t }).dx;
      biggest = Math.max(biggest, Math.abs(dx));
      if (Math.sign(dx) !== 0 && Math.sign(dx) !== last) swung++;
      if (dx !== 0) last = Math.sign(dx);
    }
    expect(biggest).toBeLessThanOrEqual(2);
    expect(biggest).toBeGreaterThanOrEqual(1);
    expect(swung).toBeGreaterThanOrEqual(4); // side to side, more than once
    expect(swung).toBeLessThanOrEqual(8); // but slowly: a fast shake would swing about 16 times
  });

  it("the egg still gets the quick wiggle", () => {
    const view = createView();
    triggerPose(view, "wobble");
    expect(view.poseLength).toBeLessThan(1);
    expect(eyesClosed(view)).toBe(false);
  });
});

describe("eating", () => {
  it("puts food in front of it, eats it bite by bite, ends happy, and the food is gone", () => {
    const view = createView();
    view.x = 30;
    const rng = makeRng(9);
    startEating(view, "meat");
    expect(view.pose).toBe("eat");
    expect(view.snack?.food).toBe("meat");
    expect(view.snack?.x).toBe(30 + 15); // facing right
    expect(foodLeft(0)).toBe(1);
    expect(foodLeft(MEAL.drop - 0.01)).toBe(1);
    const bites = [0, 1, 2, 3].map((i) => foodLeft(MEAL.drop + i * MEAL.bite + 0.01));
    expect(bites).toEqual([0.75, 0.5, 0.25, 0]);
    expect(eyesClosed({ ...view, poseTime: 0.1 })).toBe(false); // watches the food drop
    expect(eyesClosed({ ...view, poseTime: 1 })).toBe(true); // eyes shut while chewing
    for (let i = 0; i < 30; i++) updateView(view, 0.05, awake, rng.next); // 1.5 s: still eating
    expect(view.pose).toBe("eat");
    expect(view.snack).not.toBeNull();
    for (let i = 0; i < 20; i++) updateView(view, 0.05, awake, rng.next); // past 2.2 s
    expect(view.pose).toBe("happy");
    expect(view.snack).toBeNull();
    expect(view.effects.some((fx) => fx.kind === "heart")).toBe(true);
  });

  it("food goes on the side it is facing, and turns away from a close wall or the bed", () => {
    const left = createView();
    left.x = 40;
    left.facing = -1;
    startEating(left, "fish");
    expect(left.snack?.x).toBe(40 - 7);

    const wall = createView();
    wall.x = ROOM.walkMinX;
    wall.facing = -1;
    startEating(wall, "berry");
    expect(wall.facing).toBe(1);
    expect(wall.snack?.x).toBeGreaterThanOrEqual(0);

    const bed = createView(); // right next to the bed, facing it: the food goes on the other side
    bed.x = ROOM.walkMaxX;
    bed.facing = 1;
    startEating(bed, "meat");
    expect(bed.facing).toBe(-1);
    expect(bed.snack?.x).toBe(ROOM.walkMaxX - 7);
  });

  it("the food always stays inside the room", () => {
    for (const x of [ROOM.walkMinX, 20, 40, ROOM.walkMaxX]) {
      for (const facing of [1, -1] as const) {
        const view = createView();
        view.x = x;
        view.facing = facing;
        startEating(view, "candy");
        expect(view.snack!.x).toBeGreaterThanOrEqual(0);
        expect(view.snack!.x + 8).toBeLessThanOrEqual(ROOM.bedLeft); // never on top of the bed
      }
    }
  });

  it("food lands on a whole pixel even when it was walking", () => {
    const view = createView();
    view.x = 30.4;
    startEating(view, "meat");
    expect(view.snack?.x).toBe(45);
    const left = createView();
    left.x = 40.6;
    left.facing = -1;
    startEating(left, "meat");
    expect(left.snack?.x).toBe(41 - 7);
  });

  it("the part that is left of the food is the part away from the creature", () => {
    expect(snackCut(8, 1, 1)).toEqual({ from: 0, columns: 8, shift: 0 });
    expect(snackCut(8, 0.75, 1)).toEqual({ from: 2, columns: 6, shift: 2 }); // right part stays, drawn where it was
    expect(snackCut(8, 0.5, -1)).toEqual({ from: 0, columns: 4, shift: 0 }); // left part stays
    expect(snackCut(8, 0, 1).columns).toBe(0);
    expect(snackCut(8, 0, -1).columns).toBe(0);
  });

  it("a meal stops, with no food and no heart, if the creature dies halfway", () => {
    const view = createView();
    view.x = 30;
    const rng = makeRng(2);
    startEating(view, "meat");
    for (let i = 0; i < 10; i++) updateView(view, 0.05, awake, rng.next);
    expect(view.snack).not.toBeNull();
    for (let i = 0; i < 60; i++) {
      updateView(view, 0.05, { ...awake, dead: true }, rng.next);
      // checked every frame: the meal must stop at once, not just be over by the end
      expect(view.snack).toBeNull();
      expect(view.pose).not.toBe("eat");
      expect(view.pose).not.toBe("happy");
      expect(view.effects.some((fx) => fx.kind === "heart")).toBe(false);
    }
  });

  it("food disappears if it falls asleep halfway through", () => {
    const view = createView();
    startEating(view, "berry");
    updateView(view, 0.05, { ...awake, asleep: true }, makeRng(1).next);
    triggerPose(view, "idle");
    updateView(view, 0.05, awake, makeRng(1).next);
    expect(view.snack).toBeNull();
  });
});

describe("other eye and mouth looks", () => {
  for (const form of all) {
    it(`${form.id}: heavy eyelids, looking up and an open mouth change only what they should`, () => {
      const open = { rows: form.idle, palette: form.palette };
      const eyes = findEyes(form.idle);
      const half = halfEyes(open).rows;
      const up = lookUp(open).rows;
      for (const { x, y } of eyes) {
        expect(half[y]?.slice(x, x + 2)).toBe("KK"); // lid line
        expect(half[y + 1]?.slice(x, x + 2)).toBe("WK"); // the open half is untouched
        expect(up[y]?.slice(x, x + 2)).toBe("WK"); // pupil on top
        expect(up[y + 1]?.slice(x, x + 2)).toBe("WW");
      }
      expect(count(up, "W")).toBe(count(form.idle, "W")); // same number of white and dark pixels
      expect(count(up, "K")).toBe(count(form.idle, "K"));

      const wide = openMouth(open).rows;
      expect(count(wide, "M")).toBeGreaterThan(count(form.idle, "M"));
      expect(count(wide, "K")).toBe(count(form.idle, "K")); // no outline painted over
      expect(filledRows(wide)).toEqual(filledRows(form.idle)); // same silhouette
      form.idle.forEach((row, y) => {
        const first = row.indexOf("M");
        if (first < 0) return;
        const last = row.lastIndexOf("M");
        for (const x of [first - 1, last + 1]) {
          if (row[x] !== "K" && row[x] !== ".") expect(wide[y]?.[x]).toBe("M"); // grows sideways too
        }
        // and into an oval: one row above the mouth, one below (a bit wider), and a second below
        const want = (rowY: number, from: number, to: number): void => {
          for (let x = from; x <= to; x++) {
            const was = form.idle[rowY]?.[x];
            if (was !== undefined && was !== "K" && was !== ".") expect(wide[rowY]?.[x], `row ${rowY} col ${x}`).toBe("M");
          }
        };
        want(y - 1, first, last);
        want(y + 1, first - 1, last + 1);
        want(y + 2, first, last);
      });
      form.idle.forEach((row, y) => {
        for (let x = 0; x < row.length; x++) if (row[x] === ".") expect(wide[y]?.[x]).toBe(".");
      });
    });
  }

  it("a picture with no mouth or eyes is left alone by all of them", () => {
    const sprite = { rows: ["....", ".BB.", "...."], palette: {} };
    for (const make of [closeEyes, halfEyes, lookUp, openMouth]) expect(make(sprite).rows).toEqual(sprite.rows);
  });
});

describe("happy eyes", () => {
  // How well two palette colors show against each other (1 = not at all, 21 = black on white).
  const shade = (hex: string): number => {
    const n = parseInt(hex.slice(1), 16);
    const lin = (v: number): number => ((v / 255) <= 0.03928 ? v / 255 / 12.92 : (((v / 255) + 0.055) / 1.055) ** 2.4);
    return 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
  };
  const contrast = (a: string, b: string): number => (Math.max(shade(a), shade(b)) + 0.05) / (Math.min(shade(a), shade(b)) + 0.05);

  for (const form of all) {
    it(`${form.id}: each eye becomes a small arch that shows against the body, with nothing else touched`, () => {
      const open = { rows: form.idle, palette: form.palette };
      const eyes = findEyes(form.idle);
      const happy = happyEyes(open).rows;
      expect(happy).toHaveLength(form.idle.length);
      for (const { x, y } of eyes) {
        const arch = happy[y]?.[x] ?? "?";
        expect(["K", "W"]).toContain(arch);
        expect(happy[y]?.[x + 1]).toBe(arch); // the top of the arch, two pixels
        const fill = happy[y + 1]?.[x] ?? "?";
        expect(".KWM").not.toContain(fill); // open underneath: a body color, not outline or white
        expect(happy[y + 1]?.[x + 1]).toBe(fill);
        expect(contrast(form.palette[arch]!, form.palette[fill]!), `${form.id} arch against its body`).toBeGreaterThanOrEqual(3);
        for (const foot of [x - 1, x + 2]) {
          const was = form.idle[y + 1]?.[foot] ?? ".";
          expect(happy[y + 1]?.[foot], `foot at ${foot},${y + 1}`).toBe(".KWM".includes(was) ? was : arch);
        }
      }
      expect(findEyes(happy)).toHaveLength(0); // no round eye is left behind
      expect(count(happy, "M")).toBe(count(form.idle, "M")); // the mouth is not touched
      expect(filledRows(happy)).toEqual(filledRows(form.idle)); // same silhouette
      form.idle.forEach((row, y) => {
        for (let x = 0; x < row.length; x++) {
          if (row[x] === ".") expect(happy[y]?.[x]).toBe(".");
          const nearEye = eyes.some((eye) => x >= eye.x - 1 && x <= eye.x + 2 && (y === eye.y || y === eye.y + 1));
          if (!nearEye) expect(happy[y]?.[x], `col ${x} row ${y}`).toBe(row[x]); // changes stay around the eyes
        }
      });
    });
  }

  it("a picture with no eyes is left alone", () => {
    const rows = ["....", ".BB.", "...."];
    expect(happyEyes({ rows, palette: {} }).rows).toEqual(rows);
  });

  it("a foot goes on a body pixel only, never on empty space, a mouth pixel, or off the edge", () => {
    const happy = (row3: string): string[] =>
      happyEyes({ rows: ["KKKKKKKKKK", "KBBBBBBBBK", "KBBWWBBBBK", row3, "KBBBBBBBBK"], palette: {} }).rows;
    expect(happy("KBBWKBBBBK")[3]).toBe("KBKBBKBBBK"); // two body pixels: both feet painted
    expect(happy("KB.WKMBBBK")[3]).toBe("KB.BBMBBBK"); // empty space and a mouth pixel stay
    expect(happy("KBKWKKBBBK")[3]).toBe("KBKBBKBBBK"); // outline already dark: unchanged
    expect(happy("KBBWKBBBBK")[2]).toBe("KBBKKBBBBK"); // the top of the arch
    const edge = happyEyes({ rows: ["BBBB", "WWBB", "WKBB", "BBBB"], palette: {} }).rows; // eye against the left edge
    expect(edge).toEqual(["BBBB", "KKBB", "BBKB", "BBBB"]);
  });

  it("under the arch is the body beside the eye, even when the eye sits right under the outline", () => {
    const rows = ["KKKKKKKK", "KTWWTTTK", "KTWKTTTK", "KTTTTTTK"];
    expect(happyEyes({ rows, palette: {} }).rows).toEqual(["KKKKKKKK", "KTKKTTTK", "KKTTKTTK", "KTTTTTTK"]); // the fill is T, although the pixel above the eye is outline
  });

  it("the arch is dark, but takes the eye color when the body is too dark for dark to show", () => {
    const rows = ["KKKKKKKKKK", "KBBBBBBBBK", "KBBWWBBBBK", "KBBWKBBBBK", "KBBBBBBBBK"];
    const light = happyEyes({ rows, palette: { K: "#1a1020", B: "#e8a86b", W: "#ffffff" } }).rows;
    expect(light[2]).toBe("KBBKKBBBBK");
    expect(light[3]).toBe("KBKBBKBBBK");
    const dark = happyEyes({ rows, palette: { K: "#1a1020", B: "#3a2f4f", W: "#ffe45a" } }).rows;
    expect(dark[2]).toBe("KBBWWBBBBK"); // the glowing eye color
    expect(dark[3]).toBe("KBWBBWBBBK");
    const unknown = happyEyes({ rows, palette: { K: "dark", B: "red", W: "white" } }).rows; // colors that cannot be measured
    expect(unknown[2]).toBe("KBBKKBBBBK");
  });
});

describe("drooping", () => {
  for (const form of all) {
    it(`${form.id} slumps a little, between standing and lying flat, and keeps both halves of its eyes`, () => {
      const droop = faceSprite(form, "droop").rows;
      const standing = filledRows(form.idle).length;
      const flat = filledRows(faceSprite(form, "lie0").rows).length;
      const slumped = filledRows(droop).length;
      expect(slumped).toBeLessThan(standing);
      expect(slumped).toBeGreaterThan(flat);
      for (const row of droop) expect(row).toHaveLength(WIDE_WIDTH);
      expect(count(droop, "W")).toBe(count(form.idle, "W") - 4); // lid lines cover the top row of each eye
      const spots = eyeSpots(faceSprite(form, "droop"));
      const eyeLook = spots.map((spot) => droop[spot.y]?.slice(spot.x, spot.x + 2));
      expect(eyeLook[0]).toBe(eyeLook[1]); // both eyes the same: no eye column is ever doubled
      expect(count(droop, "M")).toBeGreaterThanOrEqual(count(form.idle, "M"));
      expect(eyeSpots(faceSprite(form, "droop"))).toHaveLength(2); // a tear can start from each eye
    });
  }
});

describe("drooping with shut eyes or a yawn", () => {
  for (const form of all) {
    it(`${form.id} can be slumped with its eyes shut, or yawning, and keeps its face`, () => {
      const standing = filledRows(form.idle).length;
      const flat = filledRows(faceSprite(form, "lie0").rows).length;
      for (const kind of ["droopClosed", "droopYawn"] as const) {
        const rows = faceSprite(form, kind).rows;
        for (const row of rows) expect(row).toHaveLength(WIDE_WIDTH);
        const slumped = filledRows(rows).length;
        expect(slumped, kind).toBeLessThan(standing);
        expect(slumped, kind).toBeGreaterThan(flat);
        expect(count(rows, "W"), kind).toBe(count(form.idle, "W") - 6); // eyes shut
        expect(rows.filter((row) => row.includes("KK")).length, kind).toBeGreaterThanOrEqual(1); // the shut-eye line
      }
      expect(count(faceSprite(form, "droopYawn").rows, "M")).toBeGreaterThan(count(faceSprite(form, "droopClosed").rows, "M"));
    });
  }

  it("never paints over eye whites, even next to a mouth", () => {
    const rows = ["KKKKKK", "KBWWBK", "KBMMBK", "KBBBBK", "KKKKKK"]; // eye whites right above the mouth
    const wide = openMouth({ rows, palette: {} }).rows;
    expect(count(wide, "W")).toBe(count(rows, "W"));
    expect(count(wide, "K")).toBe(count(rows, "K"));
  });
});

describe("drooping and happy", () => {
  for (const form of all) {
    it(`${form.id} can be slumped with happy eyes, and both arches survive whole, feet included`, () => {
      const standing = filledRows(form.idle).length;
      const flat = filledRows(faceSprite(form, "lie0").rows).length;
      const rows = faceSprite(form, "droopHappy").rows;
      for (const row of rows) expect(row).toHaveLength(WIDE_WIDTH);
      const slumped = filledRows(rows).length;
      expect(slumped).toBeLessThan(standing);
      expect(slumped).toBeGreaterThan(flat);

      // Each arch is four columns wide (its two pixels and a foot either side) and two rows tall. Neither a row nor a
      // column of it may be removed or doubled, so the standing arch is found again in the slumped picture, and the
      // columns beside it are the standing neighbours (a doubled foot would show up there as a copy of the foot).
      const happy = faceSprite(form, "happy").rows;
      const eyes = findEyes(form.idle);
      eyes.forEach(({ x, y }, k) => {
        const top = happy[y]?.slice(x - 1, x + 3);
        const bottom = happy[y + 1]?.slice(x - 1, x + 3);
        const hits: Array<{ r: number; i: number }> = [];
        rows.forEach((row, r) => {
          for (let i = 0; i + 4 <= row.length; i++) if (row.slice(i, i + 4) === top && rows[r + 1]?.slice(i, i + 4) === bottom) hits.push({ r, i });
        });
        expect(hits.length, `arch at ${x},${y}`).toBeGreaterThanOrEqual(1);
        const hit = hits.length === eyes.length ? hits[k]! : hits[0]!; // two eyes that look alike: first to first
        for (const [was, now] of [[x - 2, hit.i - 1], [x + 3, hit.i + 4]] as const) {
          if (was < 0 || now < 0 || was >= form.idle[y]!.length || now >= WIDE_WIDTH) continue;
          expect(`${rows[hit.r]?.[now]}${rows[hit.r + 1]?.[now]}`, `beside the arch at ${x},${y}`).toBe(`${happy[y]?.[was]}${happy[y + 1]?.[was]}`);
        }
      });
    });
  }
});

describe("the blanket", () => {
  for (const form of all) {
    it(`${form.id}'s blanket starts at the mouth, so the eyes show, and is a little wider than the body`, () => {
      const lying = faceSprite(form, "lie0");
      const box = blanketBox(lying)!;
      const mouth = lying.rows.findIndex((row) => row.includes("M"));
      const filled = filledRows(lying.rows);
      expect(box.top).toBe(mouth);
      expect(box.top).toBeGreaterThan(filled[0] as number);
      expect(box.bottom).toBe(filled[filled.length - 1]);
      let first = Infinity;
      let last = -1;
      for (const row of lying.rows) {
        const start = row.search(/[^.]/);
        if (start >= 0) {
          first = Math.min(first, start);
          last = Math.max(last, row.search(/[^.]\.*$/));
        }
      }
      expect(box.left).toBe(first - 1); // one pixel wider each side
      expect(box.right).toBe(last + 1);
      expect(box.left).toBeGreaterThanOrEqual(0);
      expect(box.right).toBeLessThan(WIDE_WIDTH);
    });
  }

  it("a picture with no mouth still gets a blanket over its lower half", () => {
    const rows = ["....", "KKKK", "KBBK", "KBBK", "KBBK", "KKKK", "...."];
    const box = blanketBox({ rows, palette: {} })!;
    expect(box.top).toBeGreaterThan(1);
    expect(box.top).toBeLessThanOrEqual(5);
    expect(blanketBox({ rows: ["..", ".."], palette: {} })).toBeNull();
  });
});

describe("blinking", () => {
  it("blinks every few seconds for a moment, and never for longer than a blink", () => {
    const view = createView();
    const rng = makeRng(11);
    let blinks = 0;
    let wasBlinking = false;
    let longest = 0;
    let run = 0;
    let gapStart = 0;
    const gaps: number[] = [];
    for (let i = 0; i < 2400; i++) {
      updateView(view, 0.05, awake, rng.next);
      const now = blinking(view);
      if (now && !wasBlinking) {
        blinks++;
        gaps.push(view.clock - gapStart);
        run = 0;
      }
      if (now) run += 0.05;
      else if (wasBlinking) gapStart = view.clock;
      longest = Math.max(longest, run);
      wasBlinking = now;
    }
    expect(blinks).toBeGreaterThanOrEqual(20); // 120 s, a blink every 2.5 to 5.5 s plus its own length
    expect(blinks).toBeLessThanOrEqual(48);
    expect(longest).toBeLessThanOrEqual(BLINK.length + 0.06);
    for (const gap of gaps.slice(1)) expect(gap).toBeGreaterThanOrEqual(BLINK.gapMin - 0.1);
  });

  it("an open-eyed creature shows closed eyes only during a blink", () => {
    const view = createView();
    view.nextBlink = 10;
    view.clock = 9;
    expect(pickFace(view, false, false)).toBe("open");
    view.clock = 10.05;
    expect(pickFace(view, false, false)).toBe("closed");
    view.clock = 10.2;
    expect(pickFace(view, false, false)).toBe("open");
  });

  it("a sad or sick creature stays slumped while yawning, chewing or saying no", () => {
    const sad = createView();
    sad.nextBlink = 1000;
    sad.mood = { ...awake, sad: true, sleepy: true };
    triggerPose(sad, "yawn");
    expect(pickFace(sad, false, false)).toBe("droopClosed");
    sad.poseTime = (YAWN.open + YAWN.close) / 2;
    expect(pickFace(sad, false, false)).toBe("droopYawn");
    sad.poseTime = YAWN.close + 0.1;
    expect(pickFace(sad, false, false)).toBe("droopClosed");

    const sick = createView();
    sick.nextBlink = 1000;
    sick.mood = { ...awake, sick: true };
    triggerPose(sick, "refuse");
    expect(pickFace(sick, false, false)).toBe("droopClosed");
    startEating(sick, "berry");
    expect(pickFace(sick, false, false)).toBe("droop"); // watching the food fall
    sick.poseTime = MEAL.drop + 0.1;
    expect(pickFace(sick, false, false)).toBe("droopClosed"); // chewing
    expect(isWideKind("droopYawn")).toBe(true);
  });

  it("a slumped creature does not pop upright for a blink", () => {
    const view = createView();
    view.mood = { ...awake, sad: true };
    view.nextBlink = 10;
    view.clock = 10.05;
    expect(blinking(view)).toBe(true);
    expect(pickFace(view, false, false)).toBe("droop");
  });
});

describe("feelings", () => {
  const face = (mood: Partial<typeof awake> & { hungry?: boolean; sleepy?: boolean }, pose: string | null = null) => {
    const view = createView();
    view.nextBlink = 1000;
    view.mood = { ...awake, ...mood };
    if (pose) triggerPose(view, pose as "yawn");
    return pickFace(view, false, false);
  };

  it("picks the look that matches how it feels", () => {
    expect(face({})).toBe("open");
    expect(face({ sad: true })).toBe("droop");
    expect(face({ sick: true })).toBe("droop");
    expect(face({ sad: true, sick: true })).toBe("droop");
    expect(face({ sleepy: true })).toBe("half");
    expect(face({ hungry: true })).toBe("open"); // hunger shows as a growling tummy and a bubble
  });

  it("shows happy eyes during the happy hop, and goes back to normal after it", () => {
    expect(face({}, "happy")).toBe("happy");
    expect(face({ sleepy: true }, "happy")).toBe("happy"); // beats heavy lids
    expect(face({ hungry: true }, "happy")).toBe("happy");
    expect(face({ sad: true }, "happy")).toBe("droopHappy"); // a slumped creature stays slumped
    expect(face({ sick: true }, "happy")).toBe("droopHappy");
    expect(isWideKind("droopHappy")).toBe(true);
    expect(isWideKind("happy")).toBe(false);

    const view = createView();
    view.nextBlink = 1000;
    triggerPose(view, "happy");
    expect(pickFace(view, false, false)).toBe("happy");
    view.nextBlink = view.clock; // a blink is due right now: the happy eyes still win
    expect(blinking(view)).toBe(true);
    expect(pickFace(view, false, false)).toBe("happy");
    view.nextBlink = 1000;
    const rng = makeRng(3);
    for (let i = 0; i < 20; i++) updateView(view, 0.05, awake, rng.next); // past the 0.8 s hop
    expect(view.pose).not.toBe("happy");
    expect(pickFace(view, false, false)).toBe("open");
  });

  it("sleep and death still beat happy eyes", () => {
    const view = createView();
    view.nextBlink = 1000;
    triggerPose(view, "happy");
    expect(pickFace(view, true, false)).toMatch(/^lie/);
    expect(pickFace(view, false, true)).toBe("lie0");
  });

  it("a meal ends with happy eyes and the heart", () => {
    const view = createView();
    view.nextBlink = 1000;
    const rng = makeRng(5);
    startEating(view, "berry");
    for (let i = 0; i < 50; i++) updateView(view, 0.05, awake, rng.next); // 2.5 s: the meal is over, the hop has begun
    expect(view.pose).toBe("happy");
    expect(pickFace(view, false, false)).toBe("happy");
    expect(view.effects.some((fx) => fx.kind === "heart")).toBe(true);
  });

  it("lying wins over everything, and a dead creature does not breathe", () => {
    const view = createView();
    view.mood = { ...awake, sad: true };
    view.clock = 0;
    expect(pickFace(view, true, false)).toBe("lie0");
    view.clock = 1.5;
    expect(pickFace(view, true, false)).toBe("lie1");
    expect(pickFace(view, false, true)).toBe("lie0");
  });

  it("watches the food fall with its eyes up, then looks down at it", () => {
    const view = createView();
    view.nextBlink = 1000;
    startEating(view, "berry");
    expect(pickFace(view, false, false)).toBe("up");
    view.poseTime = MEAL.drop * 0.9;
    expect(pickFace(view, false, false)).toBe("open");
    view.poseTime = MEAL.drop + 0.1;
    expect(pickFace(view, false, false)).toBe("closed"); // chewing
  });

  it("a yawn opens the mouth in the middle and has its eyes shut throughout", () => {
    const view = createView();
    view.nextBlink = 1000;
    triggerPose(view, "yawn");
    expect(eyesClosed(view)).toBe(true);
    expect(pickFace(view, false, false)).toBe("closed");
    view.poseTime = (YAWN.open + YAWN.close) / 2;
    expect(pickFace(view, false, false)).toBe("yawn");
    expect(poseOffsets(view).dy).toBe(-1);
    view.poseTime = YAWN.close + 0.1;
    expect(pickFace(view, false, false)).toBe("closed");
    expect(poseOffsets(view).dy).toBe(0);
  });

  it("a hungry creature growls now and then and never hops; a tired one yawns", () => {
    for (const [mood, pose] of [[{ hungry: true }, "rumble"], [{ sleepy: true }, "yawn"]] as const) {
      const view = createView();
      const rng = makeRng(13);
      let seen = 0;
      for (let i = 0; i < 20000; i++) {
        updateView(view, 0.05, { ...awake, ...mood }, rng.next);
        expect(view.pose).not.toBe("hop");
        expect(view.pose).not.toBe("happy");
        if (view.pose === pose && view.poseTime < 0.06) seen++;
      }
      expect(seen).toBeGreaterThan(10);
    }
    // a hungry-only or tired-only creature still wanders now and then, like a sad one
    for (const mood of [{ hungry: true }, { sleepy: true }, { sad: true }]) {
      const walker = createView();
      const dice = makeRng(21);
      let walks = 0;
      for (let i = 0; i < 20000; i++) {
        updateView(walker, 0.05, { ...awake, ...mood }, dice.next);
        if (walker.pose === "walk" && walker.poseTime < 0.06) walks++;
      }
      expect(walks, JSON.stringify(mood)).toBeGreaterThan(10);
    }
    // a creature that is neither never growls or yawns
    const view = createView();
    const rng = makeRng(13);
    for (let i = 0; i < 20000; i++) {
      updateView(view, 0.05, awake, rng.next);
      expect(["rumble", "yawn"]).not.toContain(view.pose);
    }
  });

  it("the tummy trembles one pixel, and the whole thing ends by itself", () => {
    const view = createView();
    triggerPose(view, "rumble");
    const dys = new Set<number>();
    for (let t = 0; t < view.poseLength; t += 0.01) dys.add(poseOffsets({ ...view, poseTime: t }).dy);
    expect([...dys].sort()).toEqual([0, 1]);
    const rng = makeRng(1);
    for (let i = 0; i < 30; i++) updateView(view, 0.05, awake, rng.next);
    expect(view.pose).not.toBe("rumble");
  });

  it("a sick creature sways a pixel each way and a healthy one stands still", () => {
    const sick = createView();
    sick.mood = { ...awake, sick: true };
    const dxs = new Set<number>();
    for (let t = 0; t < 10; t += 0.05) dxs.add(poseOffsets({ ...sick, clock: t }).dx);
    expect([...dxs].sort()).toEqual([-1, 0, 1]);
    const well = createView();
    for (let t = 0; t < 10; t += 0.05) expect(poseOffsets({ ...well, clock: t }).dx).toBe(0);
  });

  it("works out feelings from the save", () => {
    const save = newSave(Date.UTC(2026, 10, 21, 10), 1);
    expect(moodOf(save)).toMatchObject({ asleep: false, dead: false });
    const alive = { ...newSave(Date.UTC(2026, 10, 21, 10), 1) };
    alive.phase = "alive";
    const creature = makeCreature("blip", 0);
    creature.stats = { hunger: 24, happiness: 29, energy: 24, hygiene: 80, wellness: 80, discipline: 50 };
    creature.sick = true;
    alive.creature = creature;
    expect(moodOf(alive)).toEqual({ asleep: false, sad: true, sick: true, dead: false, hungry: true, sleepy: true });
    creature.stats.hunger = 25;
    creature.stats.energy = 25;
    creature.stats.happiness = 30;
    expect(moodOf(alive)).toMatchObject({ sad: false, hungry: false, sleepy: false });
    alive.phase = "dead";
    expect(moodOf(alive).dead).toBe(true);
  });
});
