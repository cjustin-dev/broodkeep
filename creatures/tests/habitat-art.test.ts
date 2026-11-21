// The habitat picture: where the spots and the creature go. The drawing itself is checked by eye (see known-issues.md),
// but the placement rules are numbers, so they are tested.
import { describe, expect, it } from "vitest";
import { getForm } from "../src/data/forms";
import { spotIds } from "../src/data/habitat";
import { HOME, SPOT_BOXES, isLocked, workingPlace } from "../src/art/habitat";
import { ROOM } from "../src/art/layout";
import { aliveSave, at } from "./helpers";

const SIZES = [...new Set(["blip", "pip", "fennix", "pyrefang", "solarion"].map((id) => getForm(id).idle.length))].sort((a, b) => a - b);
type Box = { x: number; y: number; w: number; h: number };
const overlap = (a: Box, b: Box): boolean => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

describe("the spot boxes", () => {
  it("has one box per spot, inside the picture", () => {
    expect(Object.keys(SPOT_BOXES).sort()).toEqual([...spotIds].sort());
    for (const id of spotIds) {
      const b = SPOT_BOXES[id];
      expect(b.x, id).toBeGreaterThanOrEqual(0);
      expect(b.y - 4, id).toBeGreaterThanOrEqual(0); // the progress bar sits 4 pixels above
      expect(b.x + b.w, id).toBeLessThanOrEqual(ROOM.w);
      expect(b.y + b.h, id).toBeLessThanOrEqual(ROOM.h);
    }
  });

  it("never lets two spots overlap, progress bar included", () => {
    for (const a of spotIds) {
      for (const b of spotIds) {
        if (a >= b) continue;
        const bar = (box: Box): Box => ({ ...box, y: box.y - 4, h: box.h + 4 });
        expect(overlap(bar(SPOT_BOXES[a]), bar(SPOT_BOXES[b])), `${a} and ${b}`).toBe(false);
      }
    }
  });
});

describe("where the creature stands", () => {
  it("covers no spot at home, whatever its size", () => {
    expect(SIZES).toEqual([16, 22, 28, 32]);
    for (const size of SIZES) {
      const me: Box = { x: HOME.centerX - size / 2, y: HOME.feetY - size, w: size, h: size };
      for (const id of spotIds) expect(overlap(me, SPOT_BOXES[id]), `${size} px at home over ${id}`).toBe(false);
    }
  });

  it("stays inside the picture while working at any spot, whatever its size", () => {
    for (const size of SIZES) {
      for (const id of spotIds) {
        const place = workingPlace(id);
        const left = place.centerX - size / 2;
        const feet = place.feetY;
        expect(left, `${size} px at ${id}`).toBeGreaterThanOrEqual(0);
        expect(left + size, `${size} px at ${id}`).toBeLessThanOrEqual(ROOM.w);
        expect(feet - size, `${size} px at ${id}`).toBeGreaterThanOrEqual(0);
      }
    }
  });
});

describe("the lock", () => {
  it("shows on the spots a creature is too young for, and nowhere else", () => {
    const locked = (formId: string): string[] => {
      const c = aliveSave(formId, at(10)).creature!;
      return spotIds.filter((id) => isLocked(c, id)).sort();
    };
    expect(locked("blip")).toEqual(["pond", "rocks", "trees"]);
    expect(locked("pip")).toEqual(["pond", "rocks", "trees"]);
    expect(locked("fennix")).toEqual(["rocks"]);
    expect(locked("pyrefang")).toEqual([]);
    expect(locked("solarion")).toEqual([]);
  });
});
