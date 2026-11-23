import { describe, expect, it } from "vitest";
import { makeRng } from "../src/game/rng";

describe("rng", () => {
  it("gives the same sequence for the same seed", () => {
    const a = makeRng(42);
    const b = makeRng(42);
    expect([a.next(), a.next(), a.next()]).toEqual([b.next(), b.next(), b.next()]);
  });

  it("continues the same sequence from a saved state", () => {
    const a = makeRng(7);
    a.next();
    a.next();
    const resumed = makeRng(a.state());
    expect(resumed.next()).toBe(a.next());
  });

  it("stays between 0 and 1, and int includes both ends", () => {
    const r = makeRng(1);
    const seen = new Set<number>();
    for (let i = 0; i < 2000; i++) {
      const x = r.next();
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
      seen.add(r.int(3, 5));
    }
    expect([...seen].sort()).toEqual([3, 4, 5]);
  });

  it("chance(0) is never true and chance(1) is always true", () => {
    const r = makeRng(9);
    for (let i = 0; i < 500; i++) {
      expect(r.chance(0)).toBe(false);
      expect(r.chance(1)).toBe(true);
    }
  });
});
