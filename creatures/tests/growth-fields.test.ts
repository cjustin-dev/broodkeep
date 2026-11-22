// The baby rules that only matter with more than one open field (a single field cannot tie or lose). Sky is still locked, so this
// test opens all three on paper: the fields data is replaced by three made-up fields, and it stays valid as the real ones open.
import { describe, expect, it, vi } from "vitest";
import type { FieldId } from "../src/game/types";

const open = vi.hoisted(() => ({ ids: ["land", "water", "sky"] as string[] }));

vi.mock("../src/data/fields", () => {
  const plan = (kid: string) => ({ kid, foods: ["meat", "carrot", "worm"], young: {}, youngOther: "x", adults: {} });
  const plans: Record<string, ReturnType<typeof plan>> = { land: plan("kidL"), water: plan("kidW"), sky: plan("kidS") };
  return {
    fields: {},
    fieldIds: ["land", "water", "sky"],
    get openFieldIds() {
      return open.ids;
    },
    planOf: (id: string) => plans[id]!,
    fieldOfForm: () => null,
  };
});

import { leadingForm, nextForm } from "../src/game/growth";
import { makeCreature } from "../src/game/sim";
import { HOUR, MINUTE } from "../src/game/time";
import type { EggPattern } from "../src/game/types";
import { at } from "./helpers";

const t0 = at(8);
const baby = (minutes: Partial<Record<FieldId, number>>, pattern: EggPattern = "speckled") => {
  const c = makeCreature("blip", t0, pattern);
  c.counters.fieldMinutes = minutes;
  return c;
};

describe("the kid is the field that fills four cells first", () => {
  it("picks the field with four cells, whichever field it is, and waits while none has", () => {
    expect(nextForm(baby({ land: 59, water: 59, sky: 59 }), t0 + MINUTE)).toBeNull();
    expect(nextForm(baby({ land: 59, water: 60 }), t0 + MINUTE)).toBe("kidW");
    expect(nextForm(baby({ sky: 60 }), t0 + MINUTE)).toBe("kidS");
    expect(nextForm(baby({ land: 60 }), t0 + MINUTE)).toBe("kidL");
  });

  it("takes the field with more cells if dev mode fills two, and the first listed on a tie", () => {
    expect(nextForm(baby({ land: 60, water: 90 }), t0 + MINUTE)).toBe("kidW");
    expect(nextForm(baby({ land: 60, water: 60 }), t0 + MINUTE)).toBe("kidL");
  });
});

describe("the safety net after 6 hours", () => {
  const late = t0 + 6 * HOUR;

  it("is not used a minute early", () => {
    expect(nextForm(baby({ land: 30 }), late - MINUTE)).toBeNull();
    expect(nextForm(baby({ land: 30 }), late)).toBe("kidL");
  });

  it("grows into the field with the most cells", () => {
    expect(nextForm(baby({ land: 30, water: 45 }), late)).toBe("kidW");
    expect(nextForm(baby({ sky: 15, land: 14 }), late)).toBe("kidS");
  });

  it("falls back to the field of the egg when no field leads: no cells, or a tie at the top", () => {
    expect(nextForm(baby({}, "speckled"), late)).toBe("kidL");
    expect(nextForm(baby({}, "striped"), late)).toBe("kidW");
    expect(nextForm(baby({}, "swirled"), late)).toBe("kidS");
    expect(nextForm(baby({ land: 30, water: 30 }, "swirled"), late)).toBe("kidS"); // sky has none, but the tie sends it to its egg
    expect(nextForm(baby({ land: 14, water: 14 }, "striped"), late)).toBe("kidW"); // 14 minutes is no cell: nothing leads
  });

  it("uses the first open field when the field of the egg is still locked", () => {
    open.ids = ["land", "water"];
    try {
      expect(nextForm(baby({}, "swirled"), late)).toBe("kidL");
      expect(nextForm(baby({ water: 15 }, "swirled"), late)).toBe("kidW"); // a lead still wins over the egg
    } finally {
      open.ids = ["land", "water", "sky"];
    }
  });

  it("shows the same form to the dev viewer as the one that would grow", () => {
    for (const minutes of [{}, { land: 30 }, { water: 45 }, { land: 30, water: 30 }]) {
      const c = baby(minutes, "striped");
      expect(leadingForm(c), JSON.stringify(minutes)).toBe(nextForm(c, t0 + 6 * HOUR));
    }
  });
});
