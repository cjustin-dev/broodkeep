// The creature's movement in the home (src/art/idle.ts: the walk to bed, the walk round the rooms, the meal, the change of world). Looks only, never saved. The expected numbers
// are worked out by hand from src/data/home.ts: the adult (48 pixels, 2 tiles wide) first stands on tile (15, 5), so its picture's left edge is at x 360 and its feet at y 144;
// the bed's front is tile (2, 3), 13 tiles to the left and 2 up, and a sleeping creature walks 20 pixels a second.
import { afterEach, describe, expect, it } from "vitest";
import { STARTER } from "../src/data/home";
import type { Layout } from "../src/data/home";
import { useLayout } from "../src/art/home";
import { addEffect, createView, reseat, startEating, updateView } from "../src/art/idle";
import type { Mood, View } from "../src/art/idle";

const AWAKE: Mood = { asleep: false, sad: false, sick: false };
const ASLEEP: Mood = { asleep: true, sad: false, sick: false };
const never = (): number => 0.99; // "stay and look around": the creature never starts a walk or a hop by itself

afterEach(() => useLayout(STARTER));
const withTable = (col: number, row: number): Layout => ({ ...STARTER, table: { col, row } });
const withBed = (col: number, row: number): Layout => ({ ...STARTER, bed: { col, row } });

// A view in the home with the adult on its first tile.
function homeView(size = 48): View {
  const view = createView();
  updateView(view, 0, AWAKE, never, size, "home");
  return view;
}

// Run `seconds` in steps of 0.1.
function run(view: View, seconds: number, mood: Mood, size = 48): void {
  for (let t = 0; t < seconds - 1e-9; t += 0.1) updateView(view, 0.1, mood, never, size, "home");
}

describe("entering the home", () => {
  it("puts the adult on its first tile: (15, 5) is x 360, feet at y 144", () => {
    const view = homeView();
    expect([view.x, view.y, view.world, view.placed]).toEqual([360, 144, "home", "home"]);
  });

  it("puts a kid (24 pixels, one tile) on tile (15, 5) too: x 360, feet at y 144", () => {
    const view = homeView(24);
    expect([view.x, view.y]).toEqual([360, 144]);
  });

  it("drops the hearts and sparkles of the other world, and calls off a walk", () => {
    const view = createView();
    updateView(view, 0, AWAKE, never, 48, "line");
    addEffect(view, "heart", 60, 70);
    view.pose = "walk";
    updateView(view, 0.1, AWAKE, never, 48, "home");
    expect(view.effects).toEqual([]);
    expect(view.pose).toBe("idle");
  });

  it("stands still for one second when entering the home calls off a walk", () => {
    const view = createView();
    updateView(view, 0, AWAKE, never, 48, "line");
    view.pose = "walk";
    updateView(view, 0.1, AWAKE, never, 48, "home");
    // (without the call-off the walk ends on an empty path and the pause is a random 1 to 3 seconds: 2.98 with this generator)
    expect(view.poseLength).toBe(1);
  });
});

describe("going to bed", () => {
  it("walks to the bed along the floor at 20 pixels a second: 15 tiles is 360 pixels, 18 seconds", () => {
    const view = homeView();
    run(view, 3, ASLEEP);
    expect(view.pose).toBe("walk");
    expect(view.toBed).toBe(true);
    expect(Math.round(Math.hypot(view.x - 360, view.y - 144))).toBe(60); // 3 s x 20 pixels, on whatever way along the path
    run(view, 14.5, ASLEEP); // 17.5 s in all: not there yet
    expect(view.pose).toBe("walk");
    run(view, 1.1, ASLEEP); // 18.6 s
    expect(view.pose).toBe("sleep");
    expect([view.x, view.y]).toEqual([48, 96]); // the bed's front, tile (2, 3): x 2 x 24, feet at 4 x 24
  });

  it("is called off when the creature wakes before it gets there, and the next nap walks on from where it stands", () => {
    const view = homeView();
    run(view, 3, ASLEEP);
    const [x, y] = [view.x, view.y];
    run(view, 0.1, AWAKE); // woken (the lights back on)
    expect(view.toBed).toBe(false);
    expect(view.path).toEqual([]);
    expect(view.pose).toBe("idle");
    run(view, 0.1, ASLEEP); // asleep again: it walks from here
    expect(view.pose).toBe("walk");
    expect(Math.hypot(view.x - x, view.y - y)).toBeLessThan(5); // not at the bed: a tenth of a second is 2 pixels
  });

  it("stands still for one second when it is woken on the way to the bed", () => {
    const view = homeView();
    run(view, 3, ASLEEP);
    run(view, 0.1, AWAKE);
    expect(view.poseLength).toBe(1); // (without the call-off the pause is a random 1 to 3 seconds: 2.98 with this generator)
  });

  it("stands up in front of the bed at the size it has when it wakes, not the size it lay down at (a young at x 54, an adult at x 48)", () => {
    const view = homeView();
    run(view, 19, ASLEEP);
    expect([view.x, view.y]).toEqual([48, 96]); // lying down at 48 pixels: the bed's front tile (2, 3) is x 48
    run(view, 0.1, AWAKE, 36); // woken as a 36 pixel creature: centred on the same two tiles, (48 - 36) / 2 = 6 further right
    expect([view.x, view.y]).toEqual([54, 96]);
  });

  it("stands up in front of the bed when it wakes in it", () => {
    const view = homeView();
    run(view, 19, ASLEEP);
    expect(view.pose).toBe("sleep");
    run(view, 0.1, AWAKE);
    expect(view.pose).toBe("idle");
    expect([view.x, view.y]).toEqual([48, 96]);
    expect(view.toBed).toBe(false);
  });
});

describe("a meal in the home", () => {
  it("calls off a walk it was on when the meal starts", () => {
    const view = homeView();
    view.pose = "walk";
    view.path = [{ x: 300, y: 144 }];
    startEating(view, "pellet");
    expect(view.pose).toBe("eat");
    expect(view.path).toEqual([]);
  });

  it("puts the food against the side the creature faces: the adult at (15, 5) facing right has the table at the right, so it turns left (x 360 - 8, on the floor line)", () => {
    const view = homeView();
    view.facing = 1;
    startEating(view, "pellet");
    expect(view.pose).toBe("eat");
    expect(view.facing).toBe(-1);
    expect(view.snack).toEqual({ food: "pellet", x: 352, y: 136 });
  });

  it("puts the food on the tile below when both sides are walls: a kid on (29, 2), between the counter and the fridge", () => {
    const view = homeView(24);
    view.x = 29 * 24;
    view.y = 3 * 24; // feet on the bottom of row 2
    view.facing = 1;
    startEating(view, "pellet");
    // the tile below is (29, 3): its middle is x 29 x 24 + 8 = 704, the food's feet at the bottom of the row, y 4 x 24 - 8 = 88
    expect(view.snack).toEqual({ food: "pellet", x: 704, y: 88 });
  });
});

describe("when the furniture is moved (reseat)", () => {
  it("puts a creature that a piece now covers on the nearest free anchor: an adult goes one tile down, a kid one tile left", () => {
    useLayout(withTable(15, 4)); // columns 15 and 16, rows 4 and 5: both anchors' tiles
    const adult = createView();
    adult.world = "home";
    adult.placed = "home";
    adult.size = 48;
    adult.x = 360;
    adult.y = 144;
    reseat(adult);
    expect([adult.x, adult.y]).toEqual([360, 168]); // anchor (15, 6): the first that fits is below (the order is right, left, below)
    const kid = createView();
    kid.world = "home";
    kid.placed = "home";
    kid.size = 24;
    kid.x = 360;
    kid.y = 144;
    reseat(kid);
    expect([kid.x, kid.y]).toEqual([336, 144]); // anchor (14, 5)
  });

  it("puts a creature that is between two tiles on the tile it is nearest, and leaves one that is in the one-line room alone", () => {
    const view = homeView();
    view.x = 365;
    reseat(view);
    expect([view.x, view.y]).toEqual([360, 144]);
    const line = createView();
    line.x = 50;
    line.path = [{ x: 1, y: 2 }];
    reseat(line);
    expect([line.x, line.path.length]).toEqual([50, 1]);
  });

  it("calls off a walk and a meal, and the food is gone at the next frame", () => {
    const view = homeView();
    view.pose = "walk";
    view.path = [{ x: 300, y: 144 }];
    reseat(view);
    expect([view.pose, view.path.length, view.poseLength]).toEqual(["idle", 0, 1]);
    startEating(view, "pellet");
    expect(view.snack).not.toBeNull();
    reseat(view);
    updateView(view, 0.1, AWAKE, never, 48, "home");
    expect([view.pose, view.snack]).toEqual(["idle", null]);
  });

  it("plans the walk to a bed that has moved again from where the creature stands, and lies down at the new bed", () => {
    const view = homeView();
    run(view, 3, ASLEEP);
    expect(view.toBed).toBe(true);
    useLayout(withBed(3, 2)); // the front is (4, 4): x 96, feet at 120
    reseat(view);
    expect([view.toBed, view.path.length, view.pose]).toEqual([false, 0, "idle"]);
    run(view, 30, ASLEEP);
    expect([view.pose, view.x, view.y]).toEqual(["sleep", 96, 120]);
  });

  it("stands a sleeping creature in front of the bed where it is now", () => {
    const view = homeView();
    run(view, 19, ASLEEP);
    expect([view.pose, view.x, view.y]).toEqual(["sleep", 48, 96]);
    useLayout(withBed(3, 2));
    reseat(view);
    expect([view.pose, view.x, view.y]).toEqual(["sleep", 96, 120]);
    run(view, 0.1, AWAKE); // woken: it stands up in front of the bed that is there now
    expect([view.pose, view.x, view.y]).toEqual(["idle", 96, 120]);
  });
});
