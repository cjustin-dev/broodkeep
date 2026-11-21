// Checks on the art data and the idle movement. No browser is needed for these.
import { describe, expect, it } from "vitest";
import { addHeart, addSparkles, createView, poseOffsets, startEating, triggerPose, updateView } from "../src/art/idle";
import type { Mood } from "../src/art/idle";
import { BED_WIDTH, POOP_SPOTS, ROOM, STONE_WIDTH, bedSpot, deadX, standY, stoneX, walkMaxX, wideWidth } from "../src/art/layout";
import { allSprites } from "../src/art/sprites";
import { forms } from "../src/data/forms";
import { makeRng } from "../src/game/rng";

const awake: Mood = { asleep: false, sad: false, sick: false };
// The pictures a creature can have, from the forms themselves (16 is the egg, which is not a form).
const SIZES = [...new Set([ROOM.sprite, ...Object.values(forms).map((f) => f.idle.length)])].sort((a, b) => a - b);

describe("sprites", () => {
  it("the picture sizes are the egg and one per stage", () => {
    expect(SIZES).toEqual([16, 20, 24, 36, 48]);
  });

  for (const [name, sprite] of Object.entries(allSprites)) {
    it(`${name} is a clean grid that only uses palette letters`, () => {
      const width = sprite.rows[0]!.length;
      for (const row of sprite.rows) {
        expect(row.length).toBe(width);
        for (const ch of row) if (ch !== ".") expect(sprite.palette[ch], `letter ${ch}`).toBeDefined();
      }
      for (const color of Object.values(sprite.palette)) expect(color).toMatch(/^#[0-9a-f]{6}$/i);
    });
  }

  it("the three egg patterns look different from each other", () => {
    const rows = ["egg:speckled", "egg:striped", "egg:swirled"].map((k) => allSprites[k]!.rows.join("|"));
    expect(new Set(rows).size).toBe(3);
  });

  it("every poop spot is on the floor, inside the room", () => {
    for (const [x, y] of POOP_SPOTS) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x + 8).toBeLessThanOrEqual(ROOM.w);
      expect(y).toBeGreaterThanOrEqual(ROOM.floorTop);
      expect(y + 8).toBeLessThanOrEqual(ROOM.h);
    }
  });

  it("no poop spot is on the food bowl", () => {
    const bowl = { x: 9, y: 108, w: 19, h: 10 }; // as drawn in room.ts (the bowl and its foot)
    for (const [x, y] of POOP_SPOTS) {
      const apart = x + 8 <= bowl.x || bowl.x + bowl.w <= x || y + 8 <= bowl.y || bowl.y + bowl.h <= y;
      expect(apart, `spot ${x},${y}`).toBe(true);
    }
  });

  it("a dead creature and its tombstone lie clear of the bed, at every size", () => {
    for (const size of SIZES) {
      const lyingLeft = deadX(size) - (wideWidth(size) - size) / 2;
      expect(lyingLeft, `size ${size}`).toBeGreaterThanOrEqual(0);
      expect(stoneX(size) + STONE_WIDTH, `size ${size}`).toBeLessThan(ROOM.bedLeft);
      expect(stoneX(size), `size ${size}`).toBeLessThan(lyingLeft + wideWidth(size)); // beside it, touching its end
    }
    expect(stoneX(48) + STONE_WIDTH).toBeLessThan(ROOM.bedLeft); // even the widest lying creature leaves its stone clear of the bed
  });

  it("a standing creature fits the room above the floor, at every size and anywhere it walks", () => {
    for (const size of SIZES) {
      expect(standY(size) + size, `size ${size}`).toBe(ROOM.groundY);
      expect(standY(size), `size ${size}`).toBeGreaterThanOrEqual(12); // room for the thought bubble above its head
      expect(walkMaxX(size), `size ${size}`).toBeGreaterThan(ROOM.walkMinX); // some room to walk
      expect(walkMaxX(size) + size, `size ${size}`).toBeLessThanOrEqual(ROOM.w);
    }
    expect([standY(16), walkMaxX(16)]).toEqual([96, 68]); // a 16 pixel picture stands on the ground and stops where food beside it still clears the bed
  });

  it("a sleeping creature lies on the bed at every size, on the line a 16 pixel one rests on", () => {
    for (const size of SIZES) {
      const spot = bedSpot(size);
      expect(spot.y + size, `size ${size}`).toBe(ROOM.bedY + ROOM.sprite);
      const lyingLeft = spot.x - (wideWidth(size) - size) / 2;
      expect(lyingLeft, `size ${size}`).toBeGreaterThanOrEqual(ROOM.bedLeft); // within the bed
      expect(lyingLeft + wideWidth(size), `size ${size}`).toBeLessThanOrEqual(ROOM.bedLeft + BED_WIDTH);
    }
    expect(bedSpot(16).y).toBe(ROOM.bedY); // a 16 pixel picture rests on the bed line itself
  });

  it("the wide pictures are a whole number of pixels wider, so they stay centered", () => {
    for (const size of SIZES) {
      expect(wideWidth(size)).toBeGreaterThanOrEqual(size);
      expect(Number.isInteger((wideWidth(size) - size) / 2)).toBe(true);
    }
    expect(SIZES.map(wideWidth)).toEqual([24, 28, 32, 44, 56]); // 8 wider, never wider than the bed
    expect(Math.max(...SIZES.map(wideWidth))).toBe(BED_WIDTH);
  });
});

describe("idle movement", () => {
  it("wanders about but always stays inside the walking area, at every size", () => {
    for (const size of SIZES) {
      const view = createView();
      const rng = makeRng(3);
      let walked = false;
      for (let i = 0; i < 20000; i++) {
        updateView(view, 0.05, awake, rng.next, size);
        expect(view.x).toBeGreaterThanOrEqual(ROOM.walkMinX);
        expect(view.x).toBeLessThanOrEqual(walkMaxX(size));
        if (view.pose === "walk") {
          walked = true;
          // a walk heads for a spot it can reach, or it would keep pushing at the wall and never stop
          expect(view.targetX).toBeGreaterThanOrEqual(ROOM.walkMinX);
          expect(view.targetX).toBeLessThanOrEqual(walkMaxX(size));
        }
      }
      expect(walked, `size ${size}`).toBe(true);
    }
  });

  it("goes to bed and lies down when asleep, and gets up again, at every size", () => {
    for (const size of SIZES) {
      const view = createView();
      const rng = makeRng(4);
      for (let i = 0; i < 400; i++) updateView(view, 0.05, { ...awake, asleep: true }, rng.next, size);
      expect(view.pose, `size ${size}`).toBe("sleep");
      expect(view.x, `size ${size}`).toBe(bedSpot(size).x);
      updateView(view, 0.05, awake, rng.next, size);
      expect(view.pose, `size ${size}`).not.toBe("sleep");
    }
  });

  it("remembers the size it was last given, and the walking area follows it", () => {
    const view = createView();
    expect(view.size).toBe(ROOM.sprite);
    view.x = walkMaxX(16); // far right as a small creature
    updateView(view, 0.05, awake, makeRng(1).next, 48);
    expect(view.size).toBe(48);
    expect(view.x).toBe(walkMaxX(48)); // pulled back in, so the big one does not stand in the wall
    updateView(view, 0.05, awake, makeRng(1).next); // no size given: keeps the last one
    expect(view.size).toBe(48);
  });

  it("a sad creature never hops around by itself", () => {
    const view = createView();
    const rng = makeRng(5);
    for (let i = 0; i < 20000; i++) {
      updateView(view, 0.05, { ...awake, sad: true }, rng.next);
      expect(view.pose).not.toBe("hop");
    }
  });

  it("reactions play for a moment and then end", () => {
    const view = createView();
    const rng = makeRng(6);
    triggerPose(view, "happy");
    expect(view.pose).toBe("happy");
    expect(poseOffsets({ ...view, poseTime: 0.2 }).dy).toBeLessThan(0);
    for (let i = 0; i < 30; i++) updateView(view, 0.05, awake, rng.next);
    expect(view.pose).not.toBe("happy");
  });

  it("eats beside itself at every size and never over the bed, the wall or off the room", () => {
    for (const size of SIZES) {
      for (let x = ROOM.walkMinX; x <= walkMaxX(size); x++) {
        for (const facing of [1, -1] as const) {
          const view = createView();
          view.size = size;
          view.x = x;
          view.facing = facing;
          startEating(view, "meat");
          const food = view.snack!;
          expect(food.x, `size ${size} at ${x}`).toBeGreaterThanOrEqual(0);
          expect(food.x + 8, `size ${size} at ${x}`).toBeLessThanOrEqual(ROOM.bedLeft);
          expect(food.y + 8).toBe(ROOM.groundY); // on the floor line, whatever the size
          // right beside the body, touching it but never drawn over it (a big creature's picture reaches its edge column)
          const gap = view.facing === 1 ? food.x - (x + size) : x - (food.x + 8);
          expect(gap, `size ${size} at ${x}`).toBe(0);
        }
      }
    }
  });

  it("hearts and sparkles show up over the creature, whatever its size", () => {
    for (const size of SIZES) {
      const view = createView();
      view.size = size;
      view.x = 20;
      addHeart(view);
      addSparkles(view, 50, makeRng(size).next);
      expect(view.effects).toHaveLength(51);
      const [heart, ...sparkles] = view.effects;
      expect(heart!.x).toBeGreaterThanOrEqual(20);
      expect(heart!.x).toBeLessThan(20 + size / 2); // left of the middle
      expect(heart!.y).toBe(standY(size) - 2); // just above the head
      for (const fx of sparkles) {
        expect(fx.x).toBeGreaterThanOrEqual(20 + 2);
        expect(fx.x).toBeLessThanOrEqual(20 + size - 2);
        expect(fx.y).toBeGreaterThanOrEqual(standY(size) + 2);
        expect(fx.y).toBeLessThanOrEqual(standY(size) + size); // on the body, not floating above it
      }
      // and they reach across the whole body, not just a 16 pixel corner of it
      expect(Math.max(...sparkles.map((fx) => fx.x))).toBeGreaterThan(20 + size - 6);
      expect(Math.max(...sparkles.map((fx) => fx.y))).toBeGreaterThan(standY(size) + size * 0.5);
    }
  });

  it("startle makes it look the other way", () => {
    const view = createView();
    const before = view.facing;
    triggerPose(view, "startle");
    expect(view.facing).toBe(before === 1 ? -1 : 1);
  });
});
