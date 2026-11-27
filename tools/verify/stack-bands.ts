// A4.2 measurement (docs/adult-a4-plan.md section 6, decision 5): the score percentiles of the stand-in player's seeded runs of Stack & Balance for each stage, the best a steady tapper reaches, the
// best a player who drops once and waits reaches, how many of the stand-in's runs end in a topple, and where the lines in data/stack.ts stand against them. The band lines are written from this
// output: Gold is set near the 75th percentile of the stand-in's runs (the spec's target is 20 to 30 percent for an average adult, which only a playtest can check); Silver sits above the best
// steady tapper and the waiting player and below nearly all of the stand-in's runs.
// Not part of the build or the tests. Run (from the repo root): npx esbuild tools/verify/stack-bands.ts --bundle --platform=node --format=esm --outfile=$VERIFY_OUT/stack-bands.mjs && node $VERIFY_OUT/stack-bands.mjs
import { stackTuning } from "../../src/data/stack";
import type { TrainStage } from "../../src/data/training";
import { heightOf, scoreOf } from "../../src/game/stack";
import { mash, playRun, standIn, waitingScore } from "../../tests/stackBot";
import type { Player } from "../../tests/stackBot";

// PLAYER (a JSON object of the stand-in's numbers for every stage, for trying other ones) overrides the committed model: `PLAYER='{"sigmaMs":60}' node ...`
const RUNS = 1000; // per stage
const FROM = 1; // seeds 1 to RUNS: the lines are written from these runs, the test uses other seeds
const STAGES: TrainStage[] = ["kid", "young", "adult"];
const pct = (sorted: number[], p: number): number => sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))] as number;

console.log(`${RUNS} runs a stage from seed ${FROM}; the stand-in's numbers are in tests/stackBot.ts (PLAYER overrides them: ${process.env.PLAYER ?? "none"})`);
for (const stage of STAGES) {
  const player: Player = { ...standIn[stage], ...JSON.parse(process.env.PLAYER ?? "{}") };
  const row = stackTuning.rows[stage];
  const runs = Array.from({ length: RUNS }, (_, i) => playRun(FROM + i, stage, player));
  const scores = runs.map(scoreOf).sort((a, b) => a - b);
  const heights = runs.map(heightOf).sort((a, b) => a - b);
  const topples = runs.filter((r) => r.toppled).length;
  let steady = 0;
  for (let interval = 40; interval <= 700; interval += 10) for (let phase = 0; phase < 20; phase++) steady = Math.max(steady, scoreOf(mash(stage, interval, (interval * phase) / 20)));
  const share = (line: number): string => `${((scores.filter((x) => x >= line).length / scores.length) * 100).toFixed(1)}%`;
  console.log(`${stage}: player ${JSON.stringify(player)}`);
  console.log(
    `${stage}: score p10 ${pct(scores, 10)} p25 ${pct(scores, 25)} median ${pct(scores, 50)} p75 ${pct(scores, 75)} p90 ${pct(scores, 90)}; height p10 ${pct(heights, 10)} median ${pct(heights, 50)} p90 ${pct(heights, 90)}; ended in a topple ${((topples / RUNS) * 100).toFixed(1)}%`,
  );
  console.log(`${stage}: best steady tapper ${steady}; best one drop then waiting ${waitingScore(stage)}; lines now silver ${row.silverAt} (${share(row.silverAt)} reach it) gold ${row.goldAt} (${share(row.goldAt)})`);
}
