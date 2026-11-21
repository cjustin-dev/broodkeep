// Shared helpers for the tests.
import { forceHatch } from "../src/game/dev";
import { feed, clean, giveMedicine, toggleLights, touch } from "../src/game/actions";
import { simulateTo } from "../src/game/sim";
import { newSave } from "../src/game/state";
import type { Save } from "../src/game/state";
import { MINUTE } from "../src/game/time";

// A moment on the player's own clock (so the tests do not depend on the time zone).
export const at = (hour: number, minute = 0, day = 5): number => new Date(2026, 0, day, hour, minute, 0).getTime();

// A save with a creature that just hatched.
export function aliveSave(formId = "blip", t = at(8), seed = 1234): Save {
  const save = newSave(t, seed);
  forceHatch(save, formId, t);
  return save;
}

// A simple stand-in for a caring player. Every 10 minutes it looks at the creature
// and does the obvious thing. Returns the final game time.
export function careForUntil(save: Save, startMs: number, endMs: number): number {
  let t = startMs;
  while (t < endMs && save.phase === "alive") {
    t += 10 * MINUTE;
    simulateTo(save, t);
    const c = save.creature;
    if (!c || save.phase !== "alive") break;
    if (c.sleep) {
      clean(save, t);
      if (c.sick) giveMedicine(save, t);
      continue;
    }
    if (c.sick) giveMedicine(save, t);
    if (c.poop > 0) clean(save, t);
    if (c.stats.hunger < 50) feed(save, "meat", t);
    if (c.stats.happiness < 60) for (let i = 0; i < 5; i++) touch(save, "pet", t);
    if (c.stats.energy < 20) toggleLights(save, t);
  }
  return t;
}
