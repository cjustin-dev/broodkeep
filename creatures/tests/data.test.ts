// Checks on the content files, so a typo in a creature or egg is caught right away.
import { describe, expect, it } from "vitest";
import { findEyes } from "../src/art/face";
import { eggPatterns, hatchTable } from "../src/data/eggs";
import { forms } from "../src/data/forms";
import { foods } from "../src/data/foods";

// How big each stage's picture is: the two babies and the in training forms are small, and each
// later stage grows (see art-direction.md).
const SIZE_OF_STAGE = { baby: 16, training: 16, rookie: 22, champion: 28, ultimate: 32 } as const;

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

      it("is the size of its stage", () => {
        expect(form.idle.length).toBe(SIZE_OF_STAGE[form.stage]);
        expect(form.idle.length % 2, "even, so the creature has a whole pixel middle").toBe(0);
      });

      for (const [name, rows] of [["first", form.idle], ["second", form.idle2]] as const) {
        if (!rows) continue;
        it(`follows the face rules in its ${name} drawing: two eyes, a mouth, an empty last row`, () => {
          const eyes = findEyes(rows);
          expect(eyes).toHaveLength(2);
          expect(rows.join("").split("W").length - 1, "white is only for the eyes").toBe(6);
          expect(rows.join("")).toContain("M"); // the mouth letter, so a yawn has somewhere to open
          expect(rows[rows.length - 1]).toMatch(/^\.+$/); // empty, so the bob can shift it down a pixel
        });
      }

      it("has a second drawing of the same size that differs from the first and keeps the eyes about where they were", () => {
        if (form.stage === "baby") {
          expect(form.idle2, "the two babies are moved by the game's bob, not redrawn").toBeUndefined();
          return;
        }
        const second = form.idle2!;
        expect(second, "every later form has a second drawing").toBeDefined();
        expect(second.length).toBe(form.idle.length);
        for (const row of second) expect(row.length).toBe(form.idle.length);
        for (const row of second) for (const ch of row) if (ch !== ".") expect(form.palette[ch], `letter ${ch}`).toBeDefined();
        expect(second).not.toEqual(form.idle); // otherwise it would not move
        // The eyes stay put sideways, and may move one pixel up or down (a head bob).
        const [a, b] = [findEyes(form.idle), findEyes(second)];
        a.forEach((eye, i) => {
          expect(b[i]?.x).toBe(eye.x);
          expect(Math.abs((b[i]?.y ?? 99) - eye.y)).toBeLessThanOrEqual(1);
        });
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
