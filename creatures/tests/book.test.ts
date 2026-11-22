// The Creature Book: what it lists, what a creature has been through to be what it is, when a form goes into the book, how an older
// save gets a book, what a missing creature says about itself, and the dark shape shown for it.
import { describe, expect, it } from "vitest";
import { faceSprite } from "../src/art/face";
import { silhouette } from "../src/art/silhouette";
import { bookIds, bookPages, bookTotal, hintFor, lineageOf } from "../src/data/book";
import { fieldOfForm, fields, openFieldIds, planOf } from "../src/data/fields";
import { foods } from "../src/data/foods";
import { forms, getForm } from "../src/data/forms";
import { specialId } from "../src/data/special";
import { startNewEgg } from "../src/game/actions";
import { discover } from "../src/game/book";
import { forceEvolve, forceHatch, killCreature } from "../src/game/dev";
import { makeRng } from "../src/game/rng";
import { evolveTo, hatchIfReady } from "../src/game/sim";
import { migrateSave, newSave } from "../src/game/state";
import { MINUTE } from "../src/game/time";
import { tuning } from "../src/data/tuning";
import { aliveSave, at } from "./helpers";

const t0 = at(8);
const stagesInOrder = ["baby", "kid", "young", "adult"];

describe("the pages of the book", () => {
  it("list every creature in the game exactly once", () => {
    expect([...bookIds()].sort()).toEqual(Object.keys(forms).sort());
    expect(new Set(bookIds()).size).toBe(bookIds().length);
    expect(bookTotal()).toBe(Object.keys(forms).length);
  });

  it("are the baby, then one page for each open field (the kid, the four young, and under each young its four adults from tier 1 down), then the special", () => {
    expect(bookPages().map((page) => page.title)).toEqual(["Baby", ...openFieldIds.map((id) => fields[id].name), "Special"]);
    expect(bookPages().at(-1)!.rows).toEqual([[specialId]]);
    expect(bookPages()[0]!.rows).toEqual([["blip"]]);
    openFieldIds.forEach((id, i) => {
      const plan = planOf(id);
      const rows = bookPages()[i + 1]!.rows;
      expect(rows.map((row) => row.length)).toEqual([1, 4, 4, 4, 4, 4]); // the kid, the young, and four tiers of adults
      expect(rows[0]).toEqual([plan.kid]);
      for (const [column, young] of rows[1]!.entries()) {
        expect(forms[young]?.stage, young).toBe("young");
        expect(rows.slice(2).map((row) => row[column]), young).toEqual(plan.adults[young]);
      }
    });
  });
});

describe("lineageOf", () => {
  it("gives a baby on its own, and nothing for a form that does not exist", () => {
    expect(lineageOf("blip")).toEqual(["blip"]);
    expect(lineageOf("nobody")).toEqual([]);
  });

  it("gives the special its baby and itself, whether it came from a baby or a kid", () => {
    expect(lineageOf(specialId)).toEqual(["blip", specialId]);
  });

  it("gives every other creature its baby, kid, young and adult in that order, cut at itself", () => {
    for (const form of Object.values(forms)) {
      if (form.stage === "baby" || form.id === specialId) continue;
      const line = lineageOf(form.id);
      const depth = stagesInOrder.indexOf(form.stage);
      expect(line, form.id).toHaveLength(depth + 1);
      expect(line.at(-1), form.id).toBe(form.id);
      expect(line.map((id) => forms[id]?.stage), form.id).toEqual(stagesInOrder.slice(0, depth + 1));
      if (depth >= 1) expect(line[1], form.id).toBe(planOf(fieldOfForm(form.id)!).kid);
    }
  });

  it("names the young that an adult grows from, which lists that adult", () => {
    for (const id of openFieldIds) {
      for (const [young, adults] of Object.entries(planOf(id).adults)) {
        for (const adult of adults) expect(lineageOf(adult)[2], adult).toBe(young);
      }
    }
  });
});

describe("raising a creature puts its form in the book", () => {
  it("starts empty, and the egg hatching puts the baby in, once", () => {
    const save = newSave(t0, 1);
    expect(save.book).toEqual([]);
    expect(hatchIfReady(save, makeRng(1), t0 + tuning.egg.minutes * MINUTE)).toBe(true);
    expect(save.book).toEqual(["blip"]);
  });

  it("takes each new form as the creature grows into it, and not the same one twice", () => {
    const save = aliveSave("blip", t0);
    evolveTo(save, "pebblin", t0 + 60 * MINUTE);
    expect(save.book).toEqual(["blip", "pebblin"]);
    expect(save.log.at(-1)?.text).toBe(`New in the Creature Book: Pebblin (2 of ${bookTotal()})`);
    const logged = save.log.length;
    evolveTo(save, "pebblin", t0 + 61 * MINUTE);
    expect(save.book).toEqual(["blip", "pebblin"]);
    expect(save.log.slice(logged).map((entry) => entry.text).join("|")).not.toContain("Creature Book");
  });

  it("answers whether the form was new", () => {
    const save = aliveSave("blip", t0);
    expect(discover(save, "murkfang", t0)).toBe(true);
    expect(discover(save, "murkfang", t0)).toBe(false);
    expect(save.book).toEqual(["blip", "murkfang"]);
  });

  it("is filled by dev mode too: a form hatched or grown on purpose is in the book", () => {
    const save = aliveSave("blip", t0);
    forceHatch(save, "ashwing", t0);
    expect(save.book).toEqual(["blip", "ashwing"]);
    forceEvolve(save, "galecrown", t0);
    expect(save.book).toEqual(["blip", "ashwing", "galecrown"]);
  });

  it("stays when the creature dies and a new egg hatches", () => {
    const save = aliveSave("blip", t0);
    evolveTo(save, "drizzle", t0 + 60 * MINUTE);
    killCreature(save, t0 + 2 * 60 * MINUTE);
    expect(startNewEgg(save, t0 + 3 * 60 * MINUTE)).toBe(true);
    expect(save.book).toEqual(["blip", "drizzle"]);
    expect(hatchIfReady(save, makeRng(2), t0 + 3 * 60 * MINUTE + tuning.egg.minutes * MINUTE)).toBe(true);
    expect(save.book).toEqual(["blip", "drizzle"]); // Blip was already in it
  });
});

describe("a save from before the book", () => {
  // What an older version 3 save looked like: the same, with no `book`.
  const oldSave = (formId: string | null) => {
    const save = formId ? aliveSave("blip", t0) : newSave(t0, 1); // with no creature a save is an egg waiting to hatch
    if (formId) forceEvolve(save, formId, t0);
    const { book, ...without } = save;
    expect(book).toBeDefined();
    return JSON.parse(JSON.stringify(without)) as unknown;
  };

  it("gets the forms its living creature must have been through", () => {
    expect(migrateSave(oldSave("tatterwing"))?.book).toEqual(["blip", "cinderling", "nectlet", "tatterwing"]);
    expect(migrateSave(oldSave("drizzle"))?.book).toEqual(["blip", "drizzle"]);
    expect(migrateSave(oldSave(specialId))?.book).toEqual(["blip", specialId]);
  });

  it("gets an empty book when there is no creature", () => {
    expect(migrateSave(oldSave(null))?.book).toEqual([]);
  });

  it("keeps the book it has, and replaces one that is not a list", () => {
    const save = aliveSave("blip", t0);
    save.book = ["blip", "pebblin", "cragpup"];
    expect(migrateSave(JSON.parse(JSON.stringify(save)))?.book).toEqual(["blip", "pebblin", "cragpup"]);
    expect(migrateSave({ ...JSON.parse(JSON.stringify(save)), book: "all of them" })?.book).toEqual(["blip"]);
  });
});

describe("what a missing creature says", () => {
  const all = Object.values(forms);

  it("is nothing for a baby, and nothing until the creature it grows from has been raised", () => {
    expect(hintFor("blip", new Set())).toBeNull();
    for (const form of all) {
      if (form.stage !== "baby") expect(hintFor(form.id, new Set()), form.id).toBeNull();
    }
    expect(hintFor("cinderling", new Set(["scorchlet"]))).toBeNull(); // a creature that is not its parent does not count
  });

  it("tells a baby or kid's keeper how to find the special, once a baby has been raised", () => {
    expect(hintFor(specialId, new Set())).toBeNull();
    expect(hintFor(specialId, new Set(["blip"]))).toBe("Leave a baby or kid alone for hours");
  });

  it("sends a baby to the field of its kid", () => {
    for (const id of openFieldIds) expect(hintFor(planOf(id).kid, new Set(["blip"]))).toBe(`Take a baby to the ${fields[id].name}`);
  });

  it("tells a kid which food makes each young, and that the fourth young comes from pellets only or an even mix", () => {
    for (const id of openFieldIds) {
      const plan = planOf(id);
      for (const food of plan.foods) expect(hintFor(plan.young[food]!, new Set([plan.kid]))).toBe(`Feed it lots of ${foods[food].name.toLowerCase()}`);
      expect(hintFor(plan.youngOther, new Set([plan.kid]))).toBe("Pellets only, or an even mix");
    }
  });

  it("tells a young the care each of its four adults needs, one hint for each tier", () => {
    for (const id of openFieldIds) {
      for (const [young, adults] of Object.entries(planOf(id).adults)) {
        const hints = adults.map((adult) => hintFor(adult, new Set([young])));
        expect(hints.every((hint) => typeof hint === "string" && hint.length > 0), young).toBe(true);
        expect(new Set(hints).size, young).toBe(4);
        expect(hints[0]).toBe("Perfect care");
        expect(hints[3]).toBe("Neglect it");
      }
    }
  });
});

describe("the dark shape of a creature that has not been raised", () => {
  it("keeps the shape of the picture and gives every colour one value, leaving the picture itself alone", () => {
    const picture = faceSprite(getForm("ashwing"), "open");
    const palette = { ...picture.palette };
    const dark = silhouette(picture);
    expect(dark.rows).toEqual(picture.rows);
    expect(Object.keys(dark.palette).sort()).toEqual(Object.keys(picture.palette).sort());
    expect(new Set(Object.values(dark.palette)).size).toBe(1);
    expect(picture.palette).toEqual(palette);
  });
});
