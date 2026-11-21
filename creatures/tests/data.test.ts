// Checks on the content files, so a typo in a creature or egg is caught right away.
import { describe, expect, it } from "vitest";
import { eggPatterns, hatchTable } from "../src/data/eggs";
import { forms } from "../src/data/forms";
import { foods } from "../src/data/foods";

describe("creature forms", () => {
  for (const form of Object.values(forms)) {
    describe(form.id, () => {
      it("has a rectangular sprite that only uses palette letters", () => {
        const width = form.idle[0]!.length;
        for (const row of form.idle) {
          expect(row.length).toBe(width);
          for (const ch of row) {
            if (ch !== ".") expect(form.palette[ch], `letter ${ch}`).toBeDefined();
          }
        }
        expect(form.idle.length).toBe(width); // square, so they all line up in the room
      });

      it("has valid colors", () => {
        for (const color of Object.values(form.palette)) expect(color).toMatch(/^#[0-9a-f]{6}$/i);
      });

      it("only evolves into forms that exist, and always has a fallback", () => {
        for (const evo of form.evolvesTo) expect(forms[evo.to], `evolves to ${evo.to}`).toBeDefined();
        if (form.evolvesTo.length > 0) {
          expect(form.evolvesTo.some((evo) => evo.need === undefined)).toBe(true);
        }
      });
    });
  }

  it("is keyed by its own id", () => {
    for (const [key, form] of Object.entries(forms)) expect(form.id).toBe(key);
  });
});

describe("eggs and foods", () => {
  it("every egg pattern hatches into a form that exists", () => {
    for (const pattern of eggPatterns) {
      expect(hatchTable[pattern].length).toBeGreaterThan(0);
      for (const id of hatchTable[pattern]) expect(forms[id]?.stage).toBe("baby");
    }
  });

  it("every food has sensible numbers", () => {
    for (const food of Object.values(foods)) {
      expect(food.digestMinutes[0]).toBeLessThanOrEqual(food.digestMinutes[1]);
      expect(food.hunger).toBeGreaterThan(0);
    }
  });
});
