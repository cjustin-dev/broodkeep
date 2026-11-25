// Reading saves back from storage. Only version 3 (the Paradise growth rules) is read: the old forms are gone, so an older
// save has no creature that could carry on. The loader keeps an unreadable save under another name (sync/local.ts).
import { describe, expect, it } from "vitest";
import { goTo, startJob } from "../src/game/actions";
import { simulateTo } from "../src/game/sim";
import { isSave, migrateSave, newSave } from "../src/game/state";
import type { Save } from "../src/game/state";
import { MINUTE } from "../src/game/time";
import { aliveSave, at } from "./helpers";

// A save as the game wrote it before the Paradise rules: version 2, with the old counters and a creature of an old form.
function oldSave(version: number): Record<string, unknown> {
  const save = JSON.parse(JSON.stringify(aliveSave("blip", at(10)))) as Record<string, unknown>;
  save.version = version;
  return save;
}

describe("reading a current save", () => {
  it("accepts a version 3 save as it is, also after a round trip through JSON", () => {
    const save = aliveSave("blip", at(10));
    goTo(save, "land", at(10));
    startJob(save, "meadow", at(10));
    simulateTo(save, at(10, 10));
    const again = JSON.parse(JSON.stringify(save)) as Save;
    expect(migrateSave(again)).toEqual(save);
    expect(isSave(again)).toBe(true);
    expect(again.version).toBe(3);
  });

  it("starts new games at version 3, with the egg and the creature remembering their pattern and place", () => {
    const egg = newSave(at(10), 1);
    expect(egg.version).toBe(3);
    const save = aliveSave("blip", at(10));
    expect(save.creature).toMatchObject({ place: "home", counters: { fieldMinutes: {}, servings: {}, hungerCells: 0, happyCells: 0 } });
    expect(["speckled", "striped", "swirled"]).toContain(save.creature!.eggPattern);
    simulateTo(save, at(10) + 5 * MINUTE);
    expect(save.phase).toBe("alive");
  });
});

describe("refusing what is not a save", () => {
  it("refuses older and other versions, missing pieces and plain wrong data", () => {
    const good = JSON.parse(JSON.stringify(newSave(at(10), 1))) as Record<string, unknown>;
    for (const version of [0, 1, 2, 4]) expect(migrateSave({ ...good, version }), `version ${version}`).toBeNull();
    expect(migrateSave({ ...good, version: "3" })).toBeNull();
    const noCoins = { ...good };
    delete noCoins.coins;
    expect(migrateSave(noCoins)).toBeNull();
    expect(migrateSave({ ...good, inventory: null })).toBeNull();
    expect(migrateSave({ ...good, hauls: "none" })).toBeNull();
    expect(migrateSave({ ...good, phase: "paused" })).toBeNull();
    for (const junk of [null, undefined, 7, "save", [], {}]) expect(migrateSave(junk)).toBeNull();
  });

  it("refuses a save from before the Paradise rules, so the loader keeps it aside and starts a new egg", () => {
    expect(migrateSave(oldSave(2))).toBeNull();
    expect(migrateSave(oldSave(1))).toBeNull();
    expect(migrateSave({ ...oldSave(2), log: "none" })).toBeNull();
  });
});

describe("where the furniture stands (Save.home)", () => {
  const withHome = (home: unknown): Save => ({ ...JSON.parse(JSON.stringify(aliveSave("blip", at(10)))), home }) as Save;

  it("is not in a new game or in a save from before Decorate mode, and one with it keeps it through a round trip", () => {
    expect("home" in newSave(at(10), 1)).toBe(false);
    const old = JSON.parse(JSON.stringify(aliveSave("blip", at(10)))) as Record<string, unknown>;
    expect("home" in (migrateSave(old) as Save)).toBe(false);
    const kept = migrateSave(withHome({ pieces: { sofa: { col: 13, row: 2 }, table: null } })) as Save;
    expect(kept.home).toEqual({ pieces: { sofa: { col: 13, row: 2 }, table: null } });
    expect(migrateSave(JSON.parse(JSON.stringify(kept)))).toEqual(kept);
  });

  it("drops a home that is not well formed, leaves the rest of the save alone, and never throws", () => {
    for (const home of [null, "x", 3, [], {}, { pieces: null }, { pieces: { sofa: { col: 1.5, row: 1 } } }, { pieces: { sofa: "x" } }, Object.create(null)]) {
      const read = migrateSave(withHome(home)) as Save;
      expect("home" in read, JSON.stringify(home)).toBe(false);
      expect(read.phase).toBe("alive");
    }
    expect((migrateSave(withHome({ pieces: Object.create(null) })) as Save).home).toEqual({ pieces: {} }); // an empty one is whole
  });
});
