// Checks on the art data and the idle movement. No browser is needed for these.
import { describe, expect, it } from "vitest";
import { createView, poseOffsets, triggerPose, updateView } from "../src/art/idle";
import type { Mood } from "../src/art/idle";
import { POOP_SPOTS, ROOM } from "../src/art/layout";
import { allSprites } from "../src/art/sprites";
import { makeRng } from "../src/game/rng";

const awake: Mood = { asleep: false, sad: false, sick: false };

describe("sprites", () => {
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

  it("a dead creature and its tombstone lie clear of the bed", () => {
    const tombstoneRight = ROOM.deadX + 18 + 10; // scene.ts draws the stone 18 px right, about 10 wide
    expect(ROOM.deadX).toBeGreaterThanOrEqual(0);
    expect(tombstoneRight).toBeLessThan(ROOM.bedLeft);
  });
});

describe("idle movement", () => {
  it("wanders about but always stays inside the walking area", () => {
    const view = createView();
    const rng = makeRng(3);
    let walked = false;
    for (let i = 0; i < 20000; i++) {
      updateView(view, 0.05, awake, rng.next);
      expect(view.x).toBeGreaterThanOrEqual(ROOM.walkMinX);
      expect(view.x).toBeLessThanOrEqual(ROOM.walkMaxX);
      if (view.pose === "walk") walked = true;
    }
    expect(walked).toBe(true);
  });

  it("goes to bed and lies down when asleep, and gets up again", () => {
    const view = createView();
    const rng = makeRng(4);
    for (let i = 0; i < 400; i++) updateView(view, 0.05, { ...awake, asleep: true }, rng.next);
    expect(view.pose).toBe("sleep");
    expect(view.x).toBe(ROOM.bedX);
    updateView(view, 0.05, awake, rng.next);
    expect(view.pose).not.toBe("sleep");
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

  it("startle makes it look the other way", () => {
    const view = createView();
    const before = view.facing;
    triggerPose(view, "startle");
    expect(view.facing).toBe(before === 1 ? -1 : 1);
  });
});
