// A4.1 measurement (docs/adult-a4-plan.md section 2, decision 8): the score percentiles (in percent of the most a song can score) of the stand-in player's seeded runs of Rhythm Grove, for each field
// and stage, the best a steady tapper reaches, and where the lines in data/rhythm.ts stand against them. The band lines are written from this output: Gold is set near the 75th percentile of the
// stand-in's runs (a line in whole percent that about a quarter of them reach; the spec's target is 20 to 30 percent for an average adult, which only a playtest can check), Silver sits above the best steady tapper.
// Not part of the build or the tests. Run (from the repo root): npx esbuild tools/verify/rhythm-bands.ts --bundle --platform=node --format=esm --outfile=$VERIFY_OUT/rhythm-bands.mjs && node $VERIFY_OUT/rhythm-bands.mjs
import { rhythmTuning } from "../../src/data/rhythm";
import type { TrainStage } from "../../src/data/training";
import type { FieldId } from "../../src/game/types";
import { mash, percentOf, playRun, standIn } from "../../tests/rhythmBot";
import type { Player } from "../../tests/rhythmBot";

// PLAYER (a JSON object of the stand-in's numbers for every stage, for trying other ones) overrides the committed model: `PLAYER='{"sigmaMs":60}' node ...`
const RUNS = 1000; // per field and stage
const FROM = 1; // seeds 1 to RUNS: the lines are written from these runs, the test uses other seeds

const FIELDS: FieldId[] = ["land", "water", "sky"];
const STAGES: TrainStage[] = ["kid", "young", "adult"];
const pct = (sorted: number[], p: number): number => sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))] as number;

console.log(`${RUNS} runs a field and stage from seed ${FROM}; the stand-in's numbers are in tests/rhythmBot.ts (PLAYER overrides them: ${process.env.PLAYER ?? "none"})`);
for (const stage of STAGES) {
  const player: Player = { ...standIn[stage], ...JSON.parse(process.env.PLAYER ?? "{}") };
  const row = rhythmTuning.rows[stage];
  console.log(`${stage}: player ${JSON.stringify(player)}`);
  const all: number[] = [];
  for (const field of FIELDS) {
    const scores = Array.from({ length: RUNS }, (_, i) => percentOf(playRun(FROM + i, field, stage, player))).sort((a, b) => a - b);
    all.push(...scores);
    let steady = 0;
    for (let interval = 40; interval <= 700; interval += 10) for (let phase = 0; phase < 8; phase++) steady = Math.max(steady, percentOf(mash(field, stage, interval, (interval * phase) / 8)));
    console.log(
      `${stage} ${field}: p10 ${pct(scores, 10).toFixed(1)} p25 ${pct(scores, 25).toFixed(1)} median ${pct(scores, 50).toFixed(1)} p75 ${pct(scores, 75).toFixed(1)} p90 ${pct(scores, 90).toFixed(1)}; best steady tapper ${steady.toFixed(1)}`,
    );
  }
  all.sort((a, b) => a - b);
  const share = (line: number): string => `${((all.filter((x) => x >= line).length / all.length) * 100).toFixed(1)}%`;
  console.log(`${stage} all fields: median ${pct(all, 50).toFixed(1)} p75 ${pct(all, 75).toFixed(1)}; lines now silver ${row.silverPct} (${share(row.silverPct)} reach it) gold ${row.goldPct} (${share(row.goldPct)})`);
}
