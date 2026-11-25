// Tap, pan and pinch told apart (src/ui/gesture.ts; docs/home-plan.md section 3.3 and edge cases 2, 3 and 5). Positions are CSS pixels.
import { describe, expect, it } from "vitest";
import { GestureTracker, SLOP } from "../src/ui/gesture";

describe("one finger", () => {
  it("is a tap when it lifts within 8 pixels of where it landed, even if it wandered a little (6 pixels here; the edge itself is the next test)", () => {
    const g = new GestureTracker();
    expect(g.down(1, { x: 100, y: 100 })).toBe(false);
    expect(g.move(1, { x: 105, y: 104 })).toEqual([]);
    expect(g.up(1, { x: 106, y: 100 })).toEqual({ tap: true, actions: [] });
    expect(g.mode).toBe("none");
  });

  it("is a tap at exactly 8 pixels and not at 9, on a lift as on a move", () => {
    const at8 = new GestureTracker();
    at8.down(1, { x: 100, y: 100 });
    expect(at8.move(1, { x: 108, y: 100 })).toEqual([]); // a move to exactly 8 is not a pan
    expect(at8.up(1, { x: 108, y: 100 })).toEqual({ tap: true, actions: [] });
    const lift9 = new GestureTracker();
    lift9.down(1, { x: 100, y: 100 });
    expect(lift9.up(1, { x: 109, y: 100 })).toEqual({ tap: false, actions: [] }); // lifted 9 away without a move between: not a tap, and nothing was panned, so nothing to settle
    const move9 = new GestureTracker();
    move9.down(1, { x: 100, y: 100 });
    expect(move9.move(1, { x: 109, y: 100 })).toEqual([{ type: "pan", dx: 9, dy: 0 }]);
    expect(move9.up(1, { x: 109, y: 100 }).tap).toBe(false);
  });

  it("is a pan from the moment it goes past the slop, and the first step covers the whole distance from where it landed", () => {
    const g = new GestureTracker();
    g.down(1, { x: 100, y: 100 });
    expect(SLOP).toBe(8);
    expect(g.move(1, { x: 108, y: 100 })).toEqual([]); // exactly 8: still a tap
    expect(g.move(1, { x: 110, y: 100 })).toEqual([{ type: "pan", dx: 10, dy: 0 }]); // 10 from the landing point
    expect(g.move(1, { x: 115, y: 103 })).toEqual([{ type: "pan", dx: 5, dy: 3 }]);
    expect(g.move(1, { x: 115, y: 103 })).toEqual([]); // the same point again: nothing moved, nothing to answer
    expect(g.mode).toBe("pan");
  });

  it("is never a tap once it has panned, even when it comes back to where it landed, and it ends with a settle", () => {
    const g = new GestureTracker();
    g.down(1, { x: 100, y: 100 });
    g.move(1, { x: 150, y: 100 });
    g.move(1, { x: 100, y: 100 });
    expect(g.up(1, { x: 100, y: 100 })).toEqual({ tap: false, actions: [{ type: "end" }] });
  });

  it("answers nothing for a finger it does not know, and a system cancel is never a tap", () => {
    const g = new GestureTracker();
    expect(g.move(9, { x: 1, y: 1 })).toEqual([]);
    expect(g.up(9, { x: 1, y: 1 })).toEqual({ tap: false, actions: [] });
    g.down(1, { x: 100, y: 100 });
    expect(g.cancel(1)).toEqual([]);
    expect(g.mode).toBe("none");
    expect(g.cancel(1)).toEqual([]);
    const other = new GestureTracker(); // a finger it does not know goes while another is down: that one is still a tap
    other.down(1, { x: 100, y: 100 });
    expect(other.cancel(7)).toEqual([]);
    expect(other.mode).toBe("tap");
    expect(other.up(1, { x: 100, y: 100 }).tap).toBe(true);
  });

  it("settles when the system takes a panning finger away, and a pinch goes on as a pan with the finger left", () => {
    const pan = new GestureTracker();
    pan.down(1, { x: 100, y: 100 });
    pan.move(1, { x: 150, y: 100 });
    expect(pan.cancel(1)).toEqual([{ type: "end" }]);
    expect(pan.mode).toBe("none");
    const pinch = new GestureTracker();
    pinch.down(1, { x: 100, y: 100 });
    pinch.down(2, { x: 200, y: 100 });
    expect(pinch.cancel(1)).toEqual([]);
    expect(pinch.mode).toBe("pan");
    expect(pinch.move(2, { x: 205, y: 100 })).toEqual([{ type: "pan", dx: 5, dy: 0 }]); // from where the finger left is, not from where it landed
    expect(pinch.cancel(2)).toEqual([{ type: "end" }]);
  });
});

describe("two fingers", () => {
  it("make a pinch the moment the second lands, and tell the Stage to end the first finger's hold", () => {
    const g = new GestureTracker();
    expect(g.down(1, { x: 100, y: 100 })).toBe(false);
    expect(g.down(2, { x: 200, y: 100 })).toBe(true);
    expect(g.mode).toBe("pinch");
    expect(g.pointers).toBe(2);
  });

  it("scale the picture by the change of distance around the middle, and move with the middle", () => {
    const g = new GestureTracker();
    g.down(1, { x: 100, y: 100 });
    g.down(2, { x: 200, y: 100 });
    // the first finger moves 25 left (100 apart to 125, the middle to 137.5), then the second 25 right (to 150 apart, the middle back at 150)
    expect(g.move(1, { x: 75, y: 100 })).toEqual([{ type: "pinch", scale: 125 / 100, center: { x: 137.5, y: 100 }, dx: -12.5, dy: 0 }]);
    expect(g.move(2, { x: 225, y: 100 })).toEqual([{ type: "pinch", scale: 150 / 125, center: { x: 150, y: 100 }, dx: 12.5, dy: 0 }]);
  });

  it("never tap, even when both lift on the spot", () => {
    const g = new GestureTracker();
    g.down(1, { x: 100, y: 100 });
    g.down(2, { x: 200, y: 100 });
    expect(g.up(2, { x: 200, y: 100 }).tap).toBe(false);
    expect(g.up(1, { x: 100, y: 100 })).toEqual({ tap: false, actions: [{ type: "end" }] });
  });

  it("go on as a pan with the finger left, from where it is, with no jump", () => {
    const g = new GestureTracker();
    g.down(1, { x: 100, y: 100 });
    g.down(2, { x: 200, y: 100 });
    g.move(1, { x: 120, y: 130 });
    expect(g.up(2, { x: 200, y: 100 }).actions).toEqual([]); // the pinch is over, a pan begins
    expect(g.mode).toBe("pan");
    expect(g.move(1, { x: 125, y: 130 })).toEqual([{ type: "pan", dx: 5, dy: 0 }]); // measured from (120, 130), not from where it landed
    expect(g.up(1, { x: 125, y: 130 })).toEqual({ tap: false, actions: [{ type: "end" }] });
  });

  it("are a pinch even when the first finger had already panned, and a finger that lands after a pan restarts the baseline", () => {
    const g = new GestureTracker();
    g.down(1, { x: 100, y: 100 });
    expect(g.move(1, { x: 140, y: 100 })).toEqual([{ type: "pan", dx: 40, dy: 0 }]);
    expect(g.down(2, { x: 240, y: 100 })).toBe(true);
    expect(g.move(2, { x: 340, y: 100 })).toEqual([{ type: "pinch", scale: 2, center: { x: 240, y: 100 }, dx: 50, dy: 0 }]); // 100 apart to 200; the middle from (190,100) to (240,100)
  });

  it("ignore a third finger", () => {
    const g = new GestureTracker();
    g.down(1, { x: 100, y: 100 });
    g.down(2, { x: 200, y: 100 });
    expect(g.down(3, { x: 300, y: 300 })).toBe(false);
    expect(g.mode).toBe("pinch");
    expect(g.move(3, { x: 320, y: 320 })).toEqual([]); // the third finger moving changes nothing: the pinch is the first two
  });

  it("start a new pinch from the two that are left when one of the first two lifts with a third down", () => {
    const g = new GestureTracker();
    g.down(1, { x: 100, y: 100 });
    g.down(2, { x: 200, y: 100 });
    g.down(3, { x: 300, y: 100 });
    expect(g.up(1, { x: 100, y: 100 })).toEqual({ tap: false, actions: [] });
    expect(g.mode).toBe("pinch");
    expect(g.move(2, { x: 200, y: 100 })).toEqual([]); // fingers 2 and 3 are 100 apart with their middle at (250, 100): no jump from the first pair's distance and middle
    expect(g.move(3, { x: 350, y: 100 })).toEqual([{ type: "pinch", scale: 1.5, center: { x: 275, y: 100 }, dx: 25, dy: 0 }]);
  });

  it("do not divide by zero when the two fingers land on the same point", () => {
    const g = new GestureTracker();
    g.down(1, { x: 100, y: 100 });
    g.down(2, { x: 100, y: 100 });
    expect(g.move(2, { x: 150, y: 100 })).toEqual([{ type: "pinch", scale: 1, center: { x: 125, y: 100 }, dx: 25, dy: 0 }]); // no distance to scale from yet: scale 1, the middle still moves
    expect(g.move(2, { x: 200, y: 100 })).toEqual([{ type: "pinch", scale: 2, center: { x: 150, y: 100 }, dx: 25, dy: 0 }]); // 50 apart to 100
  });

  it("answer nothing when nothing changed", () => {
    const g = new GestureTracker();
    g.down(1, { x: 100, y: 100 });
    g.down(2, { x: 200, y: 100 });
    expect(g.move(1, { x: 100, y: 100 })).toEqual([]);
  });
});
