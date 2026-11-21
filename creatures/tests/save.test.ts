// Reading saves back from storage: the version 1 saves made before the habitat are upgraded, and anything else is refused.
import { describe, expect, it } from "vitest";
import { startJob } from "../src/game/actions";
import { simulateTo } from "../src/game/sim";
import { isSave, migrateSave, newSave } from "../src/game/state";
import type { Save } from "../src/game/state";
import { MINUTE } from "../src/game/time";
import { aliveSave, at } from "./helpers";

// A save as the game wrote it before the habitat: version 1, with no coins, bag or finished jobs.
function oldSave(): Record<string, unknown> {
  const save = JSON.parse(JSON.stringify(aliveSave("fennix", at(10)))) as Record<string, unknown>;
  save.version = 1;
  delete save.coins;
  delete save.inventory;
  delete save.hauls;
  return save;
}

describe("migrating a version 1 save", () => {
  it("gives it an empty purse, an empty bag and no finished jobs, and keeps everything else", () => {
    const before = oldSave();
    const save = migrateSave(before);
    expect(save).not.toBeNull();
    expect(save!.version).toBe(2);
    expect(save!.coins).toBe(0);
    expect(save!.inventory).toEqual({});
    expect(save!.hauls).toEqual([]);
    expect(save!.creature?.formId).toBe("fennix");
    expect(save!.rngState).toBe(before.rngState);
    expect(save!.log).toEqual(before.log);
  });

  it("does not change the object it was given", () => {
    const before = oldSave();
    const copy = JSON.parse(JSON.stringify(before));
    migrateSave(before);
    expect(before).toEqual(copy);
  });

  it("gives a save that plays on: the creature can set off, and come home", () => {
    const save = migrateSave(oldSave())!;
    const t = save.lastSimulatedAt;
    expect(startJob(save, "meadow", t)).toBe("started");
    simulateTo(save, t + 10 * MINUTE);
    expect(save.coins).toBeGreaterThan(0);
  });

  it("works for an egg that has not hatched yet", () => {
    const egg = JSON.parse(JSON.stringify(newSave(at(10), 3))) as Record<string, unknown>;
    egg.version = 1;
    delete egg.coins;
    delete egg.inventory;
    delete egg.hauls;
    expect(migrateSave(egg)?.phase).toBe("egg");
  });
});

describe("reading a current save", () => {
  it("accepts a version 2 save as it is, also after a round trip through JSON", () => {
    const save = aliveSave("blip", at(10));
    startJob(save, "meadow", at(10));
    simulateTo(save, at(10, 10));
    const again = JSON.parse(JSON.stringify(save)) as Save;
    expect(migrateSave(again)).toEqual(save);
    expect(isSave(again)).toBe(true);
  });
});

describe("refusing what is not a save", () => {
  it("refuses other versions, missing pieces and plain wrong data", () => {
    const good = JSON.parse(JSON.stringify(newSave(at(10), 1))) as Record<string, unknown>;
    expect(migrateSave({ ...good, version: 3 })).toBeNull();
    expect(migrateSave({ ...good, version: 0 })).toBeNull();
    expect(migrateSave({ ...good, version: "2" })).toBeNull();
    const noCoins = { ...good };
    delete noCoins.coins;
    expect(migrateSave(noCoins)).toBeNull();
    expect(migrateSave({ ...good, inventory: null })).toBeNull();
    expect(migrateSave({ ...good, hauls: "none" })).toBeNull();
    expect(migrateSave({ ...good, phase: "paused" })).toBeNull();
    for (const junk of [null, undefined, 7, "save", [], {}]) expect(migrateSave(junk)).toBeNull();
  });

  it("refuses a version 1 save that is also missing the old pieces", () => {
    expect(migrateSave({ version: 1 })).toBeNull();
    expect(migrateSave({ ...oldSave(), log: "none" })).toBeNull();
  });
});
