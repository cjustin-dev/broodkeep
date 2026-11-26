// A3.2 measurement (plan section 10, decision 8): the score percentiles of the stand-in player's seeded runs of Bug Catch, for each stage that can train, and where the lines in data/training.ts
// stand against them. The band lines are written from this output: Silver is the median and Gold the 75th percentile (Gold is then a quarter of the stand-in's runs; the spec's target is 20 to 30 percent).
// Not part of the build or the tests. Run (from the repo root): npx esbuild tools/verify/train-bands.ts --bundle --platform=node --format=esm --outfile=$VERIFY_OUT/train-bands.mjs && node $VERIFY_OUT/train-bands.mjs
import { trainTuning } from "../../src/data/training";
import type { TrainStage } from "../../src/data/training";
import { playRun, standIn } from "../../tests/trainBot";
import type { Model } from "../../tests/trainBot";

// MODEL (a JSON object of the stand-in's numbers, for trying other ones) overrides the committed model: `MODEL='{"thumbGapMs":500}' node ...`
const model: Model = { ...standIn, ...JSON.parse(process.env.MODEL ?? "{}") };
const RUNS = 2000; // per stage (400 runs left the Gold share 3 to 6 points off on other seeds)
const FROM = 1; // seeds 1 to RUNS: the lines are written from these runs, the test uses other seeds

const STAGES: TrainStage[] = ["kid", "young", "adult"];
const pct = (sorted: number[], p: number): number => sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))] as number;

console.log(`stand-in: ${JSON.stringify(model)}; ${RUNS} runs a stage from seed ${FROM}`);
for (const stage of STAGES) {
  const runs = Array.from({ length: RUNS }, (_, i) => playRun(FROM + i, stage, model));
  const caughtShare = runs.reduce((n, r) => n + r.catches, 0) / runs.reduce((n, r) => n + (r.nextId - 1), 0);
  const scores = runs.map((r) => r.score).sort((a, b) => a - b);
  const row = trainTuning.rows[stage];
  const share = (line: number): string => `${((scores.filter((x) => x >= line).length / scores.length) * 100).toFixed(1)}%`;
  const one = runs[0] as (typeof runs)[number];
  console.log(
    `${stage}: caught ${(caughtShare * 100).toFixed(0)}% of the bugs; min ${scores[0]} p10 ${pct(scores, 10)} p25 ${pct(scores, 25)} median ${pct(scores, 50)} p75 ${pct(scores, 75)} p90 ${pct(scores, 90)} max ${scores[scores.length - 1]} | ` +
      `lines now silver ${row.silverAt} (${share(row.silverAt)} reach it) gold ${row.goldAt} (${share(row.goldAt)}) | seed ${FROM}: ${one.catches} caught of ${one.nextId - 1} spawned, ${one.misses} misses, ${one.goldens} golden`,
  );
}
