// Closed eyes, lying down and eating: the shapes behind the sleeping and feeding pictures.
import { describe, expect, it } from "vitest";
import { LIE_WIDTH, closeEyes, faceSprite, findEyes, lieDown } from "../src/art/face";
import { MEAL, createView, eyesClosed, foodLeft, poseOffsets, snackCut, startEating, triggerPose, updateView } from "../src/art/idle";
import { ROOM } from "../src/art/layout";
import { makeRng } from "../src/game/rng";
import { forms } from "../src/data/forms";

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
        for (const row of rows) expect(row).toHaveLength(LIE_WIDTH);
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
    const lying = lieDown({ rows, palette: {} }, [2, 3], 0);
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
