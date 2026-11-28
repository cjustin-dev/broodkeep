// A4.3 (docs/adult-a4-plan.md section 10, edge case 2): writes tests/fixtures/combat-golden.json from the combat engine as it stands in the
// working tree. Run it ONCE, on a tree where src/game/combat, src/data/combat.ts and src/game/actions.ts are as on origin/main 6408759 (before A4.3:
// a clean `git archive 6408759` copy with this script and tests/combatGolden.ts copied in), and commit the file. It refuses to overwrite an existing
// fixture, because a rerun on the changed engine would make the test agree with whatever the code does. Not part of the build or `npm test`;
// tests/combat-golden.test.ts compares the code with the file.
// Run (from the root of that copy): VERIFY_OUT=$(mktemp -d) && npx esbuild tools/verify/combat-golden.ts --bundle --platform=node --format=esm --outfile=$VERIFY_OUT/combat-golden.mjs && node $VERIFY_OUT/combat-golden.mjs
import { existsSync, writeFileSync } from "node:fs";
import { goldenFights, goldenPayouts, goldenRoster, goldenStarts, goldenThresholds } from "../../tests/combatGolden";

// The path is relative to the working directory (the root of the copy): the bundle runs from a temp folder, so import.meta.url would point there.
const out = "tests/fixtures/combat-golden.json";
if (existsSync(out)) {
  console.error(`${out} already exists: it is recorded once, on the engine before A4.3. Delete it by hand only if you mean to record it again.`);
  process.exit(1);
}
const record = { roster: goldenRoster(), fights: goldenFights(), starts: goldenStarts(), payouts: goldenPayouts(), thresholds: goldenThresholds() };
writeFileSync(out, JSON.stringify(record, null, 1) + "\n");
console.log(`wrote ${out}`);
