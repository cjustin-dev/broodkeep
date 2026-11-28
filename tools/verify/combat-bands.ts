// A4.3 measurement (docs/adult-a4-plan.md section 10, 10.5): how often the stand-in player (tests/combatBot.ts) wins at each rung, for trained points 0, 10, 20, 30 and 40 in each
// of the five stats and three qualities of play, with the three adult forms of tests/combatBot.ts. The first block is the old rules (not timed, the Kid ladder) for the same creatures,
// which measures what the spec says about "98 to 100 percent on every rung". Then the Adult rules (timed, `adultLadder`), and the checks of 10.5: the gate (at least one win and one
// loss in every boss cell), the three bands (widened by 5 points), the pair test at rung 3 and the "barely beats" test. The Adult ladder and the grade numbers are written from this output.
// Not part of the build or the tests; no assertions: it prints, and says PASS or MISS for each check. FIGHTS (default 2000) fights a cell, battle seeds 1 up to FIGHTS.
// Every cell is played at discipline 70 (cellSave's default), where the sulk chance is 0: no creature in the tables sulks (a timed fight allows one sulk at most, and the table does not measure it).
// The pair test scans seeds 1 to 2000 for the ten lost ones; the plan (docs/adult-a4-plan.md, 10.5) says 1 to 400, so this is a wider scan than the plan's.
// Other numbers can be tried without editing src: LADDER='[0.9,1.2,1.6,2.2,3]' GRADE='{"perfect":1.5,"good":1.2}' GUARDGOOD=0.35 PARRY=1 node ...
// Run (from the repo root): npx esbuild tools/verify/combat-bands.ts --bundle --platform=node --format=esm --outfile=$VERIFY_OUT/combat-bands.mjs && node $VERIFY_OUT/combat-bands.mjs
import { combatTuning } from "../../src/data/combat";
import { ADULTS, QUALITIES, cellSave, playFight, wins } from "../../tests/combatBot";
import type { Quality } from "../../tests/combatBot";

const FIGHTS = Number(process.env.FIGHTS ?? 2000);
const LEVELS = [0, 10, 20, 30, 40];
if (process.env.LADDER) combatTuning.adultLadder.splice(0, 5, ...(JSON.parse(process.env.LADDER) as number[]));
if (process.env.GRADE) Object.assign(combatTuning.timed.grade, JSON.parse(process.env.GRADE));
if (process.env.GUARDGOOD) combatTuning.timed.guardGood = Number(process.env.GUARDGOOD);
if (process.env.PARRY) combatTuning.timed.parryMeter = Number(process.env.PARRY);

const pct = (n: number): string => `${((100 * n) / FIGHTS).toFixed(1)}`.padStart(5);
console.log(`discipline 70 (no sulks); fights a cell: ${FIGHTS}; forms: ${ADULTS.join(", ")}; adult ladder ${JSON.stringify(combatTuning.adultLadder)}; grades ${JSON.stringify(combatTuning.timed.grade)}, good guard ${combatTuning.timed.guardGood}, parry meter ${combatTuning.timed.parryMeter}`);

// Win counts: [form][level][quality][rung]
const table = (adult: boolean, qualities: Quality[]) =>
  ADULTS.map((form) => LEVELS.map((level) => qualities.map((q) => [1, 2, 3, 4, 5].map((rung) => wins(form, level, rung, q, FIGHTS, adult)))));

function print(title: string, t: number[][][][], qualities: Quality[]): void {
  console.log(`\n${title}: win percent, averaged over the three forms (rows: trained points; columns: rung 1 to 5 for each quality)`);
  console.log(`            ${qualities.map((q) => q.padEnd(31)).join("")}`);
  LEVELS.forEach((level, li) => {
    const cells = qualities.map((_q, qi) =>
      [0, 1, 2, 3, 4].map((ri) => pct(t.reduce((sum, form) => sum + form[li]![qi]![ri]!, 0) / ADULTS.length * 1)).join(" "),
    );
    console.log(`  ${String(level).padStart(2)} points  ${cells.join("  |  ")}`);
  });
}

const old = table(false, ["passive"]);
print("OLD RULES (not timed, Kid ladder), passive", old, ["passive"]);
const adult = table(true, QUALITIES);
print("ADULT RULES (timed, adultLadder)", adult, QUALITIES);

// The boss rung per form.
const q = (name: Quality): number => QUALITIES.indexOf(name);
console.log("\nBOSS cells per form (win percent; the gate is at least 1 win and 1 loss in every cell)");
let gateMisses = 0;
ADULTS.forEach((form, fi) => {
  LEVELS.forEach((level, li) => {
    const row = QUALITIES.map((name) => adult[fi]![li]![q(name)]![4]!);
    const bad = row.filter((n) => n < 1 || n > FIGHTS - 1).length;
    gateMisses += bad;
    console.log(`  ${form.padEnd(11)} ${String(level).padStart(2)} pts  ${QUALITIES.map((name, i) => `${name} ${pct(row[i]!)}`).join("   ")}${bad ? "   <- GATE MISS" : ""}`);
  });
});
console.log(`gate (at least 1 win and 1 loss in each of ${ADULTS.length * LEVELS.length * 3} boss cells): ${gateMisses === 0 ? "PASS" : `MISS in ${gateMisses} cells`}`);

// The three bands, on the mean of the forms at the boss.
const mean = (level: number, name: Quality, rung = 5): number => {
  const li = LEVELS.indexOf(level);
  return adult.reduce((s, form) => s + form[li]![q(name)]![rung - 1]!, 0) / ADULTS.length / FIGHTS * 100;
};
const bands: [string, number, Quality, number, number][] = [
  ["mid-trained (20), perfect play", 20, "perfect", 10, 30],
  ["max-trained (40), good play", 40, "good", 55, 80],
  ["max-trained (40), passive play", 40, "passive", 25, 45],
];
for (const [label, level, name, lo, hi] of bands) {
  const v = mean(level, name);
  console.log(`band ${label}: ${v.toFixed(1)} percent, wanted ${lo} to ${hi} (the spec's range widened by 5): ${v >= lo && v <= hi ? "PASS" : "MISS"}`);
}

// (b) the pair: rung 3, 20 points, the first ten seeds (of 1 to 2000) where passive loses, and perfect must win at least 8 of them.
for (const form of ADULTS) {
  const sp = cellSave(form, 20, 3, true);
  const sf = cellSave(form, 20, 3, true);
  const lost: number[] = [];
  for (let seed = 1; seed <= 2000 && lost.length < 10; seed++) if (playFight(sp, seed, "passive").result === "lost") lost.push(seed);
  const won = lost.filter((seed) => playFight(sf, seed, "perfect").result === "won").length;
  console.log(`pair ${form}: passive lost the first ${lost.length} seeds ${lost.length < 10 ? "(fewer than 10 found)" : ""}; perfect won ${won} of them: ${lost.length === 10 && won >= 8 ? "PASS" : "MISS"}`);
}

// (c) "barely beats": the hardest rung a max-trained passive creature wins at least half the time, and the mid-trained perfect win rate there (must be at least 50).
for (let fi = 0; fi < ADULTS.length; fi++) {
  const li40 = LEVELS.indexOf(40);
  const li20 = LEVELS.indexOf(20);
  let rung = 0;
  for (let r = 1; r <= 5; r++) if (adult[fi]![li40]![q("passive")]![r - 1]! >= FIGHTS / 2) rung = r;
  if (rung === 0) {
    console.log(`barely-beats ${ADULTS[fi]}: a max-trained passive creature wins no rung half the time: MISS`);
    continue;
  }
  const v = (100 * adult[fi]![li20]![q("perfect")]![rung - 1]!) / FIGHTS;
  console.log(`barely-beats ${ADULTS[fi]}: hardest rung max-trained passive wins half the time: ${rung} (${pct(adult[fi]![li40]![q("passive")]![rung - 1]!)} percent); mid-trained perfect wins there ${v.toFixed(1)} percent: ${v >= 50 ? "PASS" : "MISS"}`);
}

// A creature that sulks (discipline 0), max-trained, passive and perfect, on the boss.
console.log(`\ndiscipline 0 (sulk chance 0.3, at most once a fight), max-trained, boss: passive ${pct(wins(ADULTS[0]!, 40, 5, "passive", FIGHTS, true, 0))}, perfect ${pct(wins(ADULTS[0]!, 40, 5, "perfect", FIGHTS, true, 0))} percent (${ADULTS[0]})`);
