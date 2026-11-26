// A3.1 measurement (plan edge 19): how fast a young creature earns its five "happy cells" (game/growth.ts countCareCells: a touch that takes happiness from under 100 to 100, young stage only)
// under the old rule (Kid Mode: 15 happiness an hour) and the Adult taper, for the same four kinds of player. Prints one line per kind and mode. All times are CLOCK hours from 8:00 on the
// game clock: the creature sleeps from 20:00 to 07:00 and a touch pays nothing then, so about 11 of every 24 are night. A player acts only at the times the policy names (not while asleep).
// Not part of the build or the tests. Run (from the repo root): npx esbuild tools/verify/growth-bond.ts --bundle --platform=node --format=esm --outfile=$VERIFY_OUT/growth-bond.mjs && node $VERIFY_OUT/growth-bond.mjs
import { clean, feed, giveMedicine, toggleLights, touch } from "../../src/game/actions";
import { simulateTo } from "../../src/game/sim";
import { MINUTE } from "../../src/game/time";
import { getForm } from "../../src/data/forms";
import { aliveSave, at, stageForm } from "../../tests/helpers";
import type { Save } from "../../src/game/state";

type Policy = "one pet an hour" | "a 5-minute hold an hour" | "5 pets whenever happiness is under 60" | "one pet a minute";
const POLICIES: Policy[] = ["one pet an hour", "a 5-minute hold an hour", "5 pets whenever happiness is under 60", "one pet a minute"];
const LIMIT_HOURS = 72;

function maintain(save: Save, t: number): void {
  // what a caring player does besides petting (the same stand-in as tests/helpers.ts careForUntil, minus its petting)
  const c = save.creature!;
  if (c.sleep) {
    clean(save, t);
    if (c.sick) giveMedicine(save, t);
    return;
  }
  if (c.sick) giveMedicine(save, t);
  if (c.poop > 0) clean(save, t);
  if (c.stats.hunger < 50) feed(save, "pellet", t);
  if (c.stats.energy < 20) toggleLights(save, t);
}

function run(policy: Policy, adult: boolean): string {
  const start = at(8);
  const save = aliveSave(stageForm("young"), start);
  save.settings.adultMode = adult;
  let t = start;
  let petted = 0; // happiness points the policy gained in all
  let reachedAt: number | null = null;
  let cells = 0; // the most happy cells the creature held while young (its counters start again at the next stage)
  while (save.phase === "alive" && t < start + LIMIT_HOURS * 60 * MINUTE) {
    t += MINUTE; // one clock minute at a time; the care stand-in acts every tenth
    simulateTo(save, t);
    const c = save.creature;
    if (!c || save.phase !== "alive" || getForm(c.formId).stage !== "young") break;
    const onTheTenth = (t - start) % (10 * MINUTE) === 0;
    if (onTheTenth) maintain(save, t);
    const onTheHour = (t - start) % (60 * MINUTE) === 0;
    if (policy === "one pet a minute") petted += touch(save, "pet", t).gained;
    if (policy === "one pet an hour" && onTheHour) petted += touch(save, "pet", t).gained;
    if (policy === "a 5-minute hold an hour" && onTheHour) {
      for (let i = 0; i < 375; i++) petted += touch(save, "pet", t + i * 800).gained; // 300 s of a held finger, one pet per 800 ms
    }
    if (policy === "5 pets whenever happiness is under 60" && onTheTenth && !c.sleep && c.stats.happiness < 60) {
      for (let i = 0; i < 5; i++) petted += touch(save, "pet", t).gained;
    }
    cells = Math.max(cells, c.counters.happyCells);
    if (reachedAt === null && c.counters.happyCells >= 5) reachedAt = t;
  }
  const c = save.creature;
  const hours = ((t - start) / (60 * MINUTE)).toFixed(1);
  const form = c ? getForm(c.formId) : null;
  return `${adult ? "Adult" : "Kid  "} | ${policy.padEnd(40)} | happy cells at most ${cells} of 5 | five reached ${reachedAt === null ? "never" : "after " + ((reachedAt - start) / (60 * MINUTE)).toFixed(1) + " clock h"} | stage at the end ${form?.stage} | ran ${hours} clock h | happiness gained by petting ${petted.toFixed(0)}`;
}

for (const policy of POLICIES) for (const adult of [false, true]) console.log(run(policy, adult));
