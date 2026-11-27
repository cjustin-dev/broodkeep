// Stack & Balance, the rules (src/game/stack.ts, src/data/stack.ts, docs/adult-a4-plan.md section 6, edge cases 1 to 16).
// The expected numbers are worked out by hand in the comments or written as literals, not read from the code. `landAt` judges a block whose centre is stated, so a test can name exact positions;
// `dropStack` is the drop at the time the screen shows.
import { describe, expect, it, vi } from "vitest";
import { stackTuning } from "../src/data/stack";
import { trainTuning } from "../src/data/training";
import type { TrainStage } from "../src/data/training";
import { makeRng } from "../src/game/rng";
import { blockX, dropStack, heightOf, landAt, newStack, perfectWindowMs, saidLine, scoreOf, stackBandOf, stepStack } from "../src/game/stack";
import type { StackBlock, StackState } from "../src/game/stack";
import { pause, resume } from "../src/game/training";
import { firstPerfectStep, mash, playDrops, playRun, waitingScore } from "./stackBot";

const k = stackTuning;
const STAGES: TrainStage[] = ["kid", "young", "adult"];

// A state with `top` as the block to land on and `w` as the width of the coming block.
function onTop(stage: TrainStage, top: StackBlock = { x: 500, w: 300 }, w = 300): StackState {
  const s = newStack(stage);
  s.blocks = [{ ...top }];
  s.w = w;
  return s;
}

// Move a run on to `elapsedMs` in frames the cap lets through.
function runTo(s: StackState, elapsedMs: number): void {
  while (s.elapsedMs < elapsedMs && !s.over) stepStack(s, 10);
}

describe("the data (edge case 1)", () => {
  it("has a sensible row for each stage and a base that fits the field", () => {
    for (const stage of STAGES) {
      const row = k.rows[stage];
      expect(row.speed, stage).toBeGreaterThan(0);
      expect(row.perfectU, stage).toBeGreaterThan(0);
      expect(row.perfectU * 2, `${stage}: a Perfect window is under half of the base`).toBeLessThan(k.startW / 2);
      expect(row.silverAt, stage).toBeLessThan(row.goldAt);
      // the window in time, both sides, is shorter than the gap before the next block
      expect((2 * row.perfectU * 1000) / row.speed, stage).toBeLessThan(k.dropGapMs);
    }
    expect(k.lo).toBeLessThan(k.hi);
    expect(k.lo - k.startW / 2).toBeGreaterThanOrEqual(0);
    expect(k.hi + k.startW / 2).toBeLessThanOrEqual(trainTuning.field);
    expect([k.startW % 2, k.growBy % 2, k.baseX % 2, k.minW % 2]).toEqual([0, 0, 0, 0]);
  });

  it("holds the tuning as literals", () => {
    expect([k.lo, k.hi, k.baseX, k.startW, k.wobblePct, k.minW, k.growFrom, k.growBy, k.dropGapMs]).toEqual([150, 850, 500, 300, 35, 20, 2, 30, 400]);
    expect([k.perfectPts, k.goodPts, k.comboPts, k.comboMax, k.standPts]).toEqual([20, 10, 5, 5, 5]);
    expect(STAGES.map((stage) => [k.rows[stage].speed, k.rows[stage].perfectU, k.rows[stage].silverAt, k.rows[stage].goldAt])).toEqual([
      [260, 29, 1000, 1460],
      [320, 36, 1000, 1620],
      [360, 40, 800, 1660],
    ]);
  });

  it("says the Perfect window in milliseconds from the row (112, 113 and 111)", () => {
    expect(STAGES.map(perfectWindowMs)).toEqual([112, 113, 111]);
  });
});

describe("the moving block (edge cases 2 and 3)", () => {
  const at = (stage: TrainStage, elapsedMs: number): number => blockX({ elapsedMs, stage });

  it("sweeps as a triangle wave: kid literals at whole steps", () => {
    // kid: speed 260, so the period is 2 * 700 * 1000 / 260 = 5384.6 ms and the turn is at 2692.3 ms
    expect([at("kid", 0), at("kid", 1000), at("kid", 2690), at("kid", 2700), at("kid", 5390)]).toEqual([150, 410, 849, 848, 151]);
    let lo = Infinity;
    let hi = -Infinity;
    for (let t = 0; t < 5380; t += 10) {
      lo = Math.min(lo, at("kid", t));
      hi = Math.max(hi, at("kid", t));
    }
    expect([lo, hi]).toEqual([150, 849]);
  });

  it("goes faster at the later stages: one literal each at 1,000 ms", () => {
    expect([at("young", 1000), at("adult", 1000)]).toEqual([470, 510]);
  });

  it("depends on the time and the stage alone", () => {
    const a = newStack("young");
    const b = newStack("young");
    b.blocks.push({ x: 300, w: 100 });
    b.blockPoints = 99;
    b.recovered = true;
    runTo(a, 1730);
    runTo(b, 1730);
    expect([blockX(a), blockX(b)]).toEqual([blockX({ elapsedMs: 1730, stage: "young" }), blockX({ elapsedMs: 1730, stage: "young" })]);
    expect(blockX(a)).toBe(blockX(b));
  });
});

describe("a drop lands on the top block (edge cases 4 to 7)", () => {
  const judge = (stage: TrainStage, x: number, top?: StackBlock, w?: number): string => landAt(onTop(stage, top, w), x).judge;

  it("is Perfect up to each stage's window and Good just past it, on both sides", () => {
    for (const [stage, u] of [["kid", 29], ["young", 36], ["adult", 40]] as const) {
      expect([judge(stage, 500 + u), judge(stage, 500 + u + 1), judge(stage, 500 - u), judge(stage, 500 - u - 1)], stage).toEqual(["perfect", "good", "perfect", "good"]);
    }
  });

  it("keeps the width and snaps to the block below on a Perfect, and does not trim", () => {
    const s = onTop("kid");
    landAt(s, 520);
    expect(s.blocks).toEqual([{ x: 500, w: 300 }, { x: 500, w: 300 }]);
    expect([s.perfects, s.goods, s.badDrops]).toEqual([1, 0, 0]);
  });

  it("puts a wider block on a narrower one (a streak makes the coming block wider): w 300 over a top of 270 at d 20 is a Perfect and overhangs", () => {
    const s = onTop("kid", { x: 500, w: 270 }, 300);
    expect(landAt(s, 520).judge).toBe("perfect");
    expect(s.blocks.at(-1)).toEqual({ x: 500, w: 300 });
  });

  it("makes a Good block the overlap, rounded down to even: 200 wide at 550 for 600, at 450 for 400", () => {
    const right = onTop("kid");
    landAt(right, 600);
    expect(right.blocks.at(-1)).toEqual({ x: 550, w: 200 });
    const left = onTop("kid");
    landAt(left, 400);
    expect(left.blocks.at(-1)).toEqual({ x: 450, w: 200 });
    expect([right.w, right.combo, right.goods, right.badDrops, right.recovered]).toEqual([200, 0, 1, 0, false]);
  });

  it("measures the overlap against the top block's own width: top 270 at 500, coming 300 at 600 gives overlap 185, width 184, centre 542", () => {
    const s = onTop("kid", { x: 500, w: 270 }, 300);
    landAt(s, 600);
    expect(s.blocks.at(-1)).toEqual({ x: 542, w: 184 });
    expect(s.w).toBe(184);
  });

  it("splits Good from Bad at 35 percent of the coming block: 695 (overlap 105) is Good, 696 (overlap 104) is Bad", () => {
    expect([judge("kid", 695), judge("kid", 696), judge("kid", 305), judge("kid", 304)]).toEqual(["good", "wobble", "good", "wobble"]);
  });

  it("splits Good from Bad at minW on its own: a coming block 40 wide, overlap 20 is Good (20 wide at 360), overlap 19 is Bad, no overlap is Bad", () => {
    const edge = onTop("kid", { x: 500, w: 300 }, 40);
    // base spans 350 to 650; the coming block at 350 spans 330 to 370: overlap 20; 35 percent of 40 is 14, so only minW decides
    expect(landAt(edge, 350).judge).toBe("good");
    expect(edge.blocks.at(-1)).toEqual({ x: 360, w: 20 });
    expect(judge("kid", 349, { x: 500, w: 300 }, 40)).toBe("wobble"); // overlap 19
    expect(judge("kid", 330, { x: 500, w: 300 }, 40)).toBe("wobble"); // 310 to 350: touches, overlap 0
    expect(judge("kid", 100, { x: 500, w: 300 }, 40)).toBe("wobble");
  });

  it("holds a needle: w and tw both 20, d 10 and d 0 are Perfect, d 11 is Bad, never Good", () => {
    expect([judge("kid", 510, { x: 500, w: 20 }, 20), judge("kid", 500, { x: 500, w: 20 }, 20), judge("kid", 511, { x: 500, w: 20 }, 20), judge("kid", 490, { x: 500, w: 20 }, 20)]).toEqual([
      "perfect",
      "perfect",
      "wobble",
      "perfect",
    ]);
    for (let d = -40; d <= 40; d++) expect(judge("adult", 500 + d, { x: 500, w: 20 }, 20), `d ${d}`).not.toBe("good");
  });

  it("caps the Perfect window by the narrower of the two blocks: w 300 over tw 20 at d 15 is Bad, not Perfect", () => {
    expect(judge("kid", 515, { x: 500, w: 20 }, 300)).toBe("wobble");
    expect(judge("kid", 510, { x: 500, w: 20 }, 300)).toBe("perfect");
    // and the other way round: w 20 over tw 300
    expect([judge("kid", 515, { x: 500, w: 300 }, 20), judge("kid", 510, { x: 500, w: 300 }, 20)]).toEqual(["good", "perfect"]);
  });

  it("never lets a Perfect miss the block below, at any pair of widths", () => {
    for (const stage of STAGES) {
      for (let w = 20; w <= 300; w += 2) {
        for (let tw = 20; tw <= 300; tw += 2) {
          for (let d = -160; d <= 160; d += 1) {
            const s = onTop(stage, { x: 500, w: tw }, w);
            if (landAt(s, 500 + d).judge !== "perfect") continue;
            const overlap = Math.min(500 + d + w / 2, 500 + tw / 2) - Math.max(500 + d - w / 2, 500 - tw / 2);
            if (overlap <= 0) throw new Error(`${stage} w ${w} tw ${tw} d ${d}: a Perfect with overlap ${overlap}`);
          }
        }
      }
    }
  });
});

describe("a bad drop (edge case 8)", () => {
  it("forgives the first: nothing is added, the width stays, the combo is lost, and the run goes on", () => {
    const s = onTop("kid");
    landAt(s, 500);
    landAt(s, 500); // combo 2
    const blocks = s.blocks.length;
    const w = s.w;
    expect(landAt(s, 100).judge).toBe("wobble");
    expect([s.blocks.length, s.w, s.combo, s.best, s.recovered, s.badDrops, s.toppled, s.over]).toEqual([blocks, w, 0, 2, true, 1, false, false]);
  });

  it("topples on the second, and a drop after the end is refused", () => {
    const s = onTop("kid");
    landAt(s, 100);
    expect(landAt(s, 900).judge).toBe("topple");
    expect([s.toppled, s.over, s.badDrops, s.blocks.length]).toEqual([true, true, 2, 1]);
    const before = JSON.stringify(s);
    expect(dropStack(s)).toBeNull();
    expect(JSON.stringify(s)).toBe(before);
  });

  it("does not forgive a second wobble later in the run, whatever came between", () => {
    const s = onTop("kid");
    landAt(s, 100); // wobble
    landAt(s, 500); // Perfect
    landAt(s, 600); // Good
    expect(s.over).toBe(false);
    expect(landAt(s, 900).judge).toBe("topple");
  });
});

describe("the combo and the best (edge case 9)", () => {
  it("counts Perfects in a row, loses them to a Good and to a Bad, and keeps the best", () => {
    const s = onTop("kid");
    const trail: Array<[number, number]> = [];
    const note = (): void => void trail.push([s.combo, s.best]);
    landAt(s, 500); note(); // 1, 1
    landAt(s, 500); note(); // 2, 2
    landAt(s, 600); note(); // Good: 0, 2
    landAt(s, 550); note(); // Perfect after a Good starts again: 1, 2
    landAt(s, 100); note(); // Bad: 0, 2
    landAt(s, 550); note(); // 1, 2
    expect(trail).toEqual([[1, 1], [2, 2], [0, 2], [1, 2], [0, 2], [1, 2]]);
  });
});

describe("growth after a streak (edge case 10)", () => {
  const widths = (s: StackState, xs: number[]): number[] => xs.map((x) => (landAt(s, x), s.w));

  it("from 240: the 1st Perfect leaves it, the 2nd and 3rd add 30, then it stays at 300", () => {
    const s = onTop("kid", { x: 500, w: 300 }, 240);
    expect(widths(s, [500, 500, 500, 500])).toEqual([240, 270, 300, 300]);
  });

  it("at 300: the 1st and 2nd Perfect leave it at 300, not past startW", () => {
    const s = onTop("kid");
    expect(widths(s, [500, 500, 500])).toEqual([300, 300, 300]);
    expect(Math.max(...s.blocks.map((b) => b.w))).toBe(300);
  });

  it("starts again after a Good: the Good's width is the new width and the next Perfect leaves it", () => {
    const s = onTop("kid", { x: 500, w: 300 }, 240);
    landAt(s, 500); // Perfect: w 240, top 240 at 500
    landAt(s, 600); // Good: overlap of 240 over 240 at 500: 380 to 620 against 480 to 720 = 140
    expect([s.w, s.blocks.at(-1)]).toEqual([140, { x: 550, w: 140 }]);
    landAt(s, 550); // Perfect: leaves it
    expect(s.w).toBe(140);
    landAt(s, 550); // the second in a row: adds
    expect(s.w).toBe(170);
  });

  it("starts again after a Bad drop", () => {
    const s = onTop("kid", { x: 500, w: 300 }, 240);
    landAt(s, 500);
    landAt(s, 500);
    expect(s.w).toBe(270);
    landAt(s, 100);
    landAt(s, 500);
    expect(s.w).toBe(270);
  });

  it("keeps every width even and every place whole through 200 seeded random drops", () => {
    const rng = makeRng(7);
    let s = newStack("adult");
    for (let i = 0; i < 200; i++) {
      const top = s.blocks.at(-1) as StackBlock;
      const near = rng.next() < 0.5;
      const x = near ? top.x + Math.floor(rng.next() * 121) - 60 : 150 + Math.floor(rng.next() * 701);
      landAt(s, x);
      for (const b of s.blocks) {
        expect(Number.isInteger(b.x), `x ${b.x}`).toBe(true);
        expect(b.w % 2, `w ${b.w}`).toBe(0);
        expect(b.w).toBeLessThanOrEqual(300);
        expect(b.w).toBeGreaterThanOrEqual(20);
      }
      expect(s.w % 2).toBe(0);
      expect(s.w).toBeLessThanOrEqual(300);
      if (s.over) s = newStack("adult");
    }
  });
});

describe("the points (edge case 11)", () => {
  it("pays 20, 25, 30, 35, 40, 45 and 45 for seven Perfects in a row, 10 for a Good, 20 for a Perfect after it, nothing for a Bad", () => {
    const s = onTop("kid");
    const gained: number[] = [];
    const drop = (x: number): void => {
      const before = s.blockPoints;
      landAt(s, x);
      gained.push(s.blockPoints - before);
    };
    for (let i = 0; i < 7; i++) drop(500);
    drop(600); // Good
    drop(550); // Perfect after a Good
    drop(100); // Bad
    expect(gained).toEqual([20, 25, 30, 35, 40, 45, 45, 10, 20, 0]);
  });
});

describe("the time the stack stands, and the score (edge case 12)", () => {
  it("is 0 before the first block, then a step a step: a first block at 1,000 ms gives 74,000 ms at the end", () => {
    const s = newStack("kid");
    runTo(s, 1000);
    expect([s.elapsedMs, s.standMs]).toEqual([1000, 0]);
    landAt(s, 500); // Perfect: 20 points
    while (!s.over) stepStack(s, 100);
    expect([s.elapsedMs, s.standMs, scoreOf(s)]).toEqual([75_000, 74_000, 20 + 74 * 5]);
  });

  it("stops at a topple and at the end: more steps change nothing", () => {
    const s = newStack("kid");
    landAt(s, 500);
    runTo(s, 2000);
    landAt(s, 100);
    landAt(s, 900);
    expect(s.over).toBe(true);
    const frozen = JSON.stringify(s);
    for (let i = 0; i < 20; i++) stepStack(s, 100);
    expect(JSON.stringify(s)).toBe(frozen);
    expect(s.standMs).toBe(2000);
  });

  it("scores the blocks plus the whole seconds, floored: 0, 5 and 5 at 999, 1,000 and 1,001 ms", () => {
    const s = newStack("kid");
    expect([999, 1000, 1001].map((standMs) => scoreOf({ blockPoints: 0, standMs }))).toEqual([0, 5, 5]);
    s.blockPoints = 33;
    s.standMs = 2999;
    expect(scoreOf(s)).toBe(33 + 10);
    s.standMs = 3000;
    expect(scoreOf(s)).toBe(33 + 15);
  });

  it("reads the score when asked, whatever order things happened in", () => {
    const a = onTop("kid");
    const b = onTop("kid");
    a.standMs = 5000;
    landAt(a, 500);
    landAt(a, 600);
    landAt(b, 500);
    landAt(b, 600);
    b.standMs = 5000;
    expect(scoreOf(a)).toBe(scoreOf(b));
    expect(scoreOf(a)).toBe(30 + 25);
  });

  it("stays the height: the blocks on the base", () => {
    const s = onTop("kid");
    expect(heightOf(s)).toBe(0);
    landAt(s, 500);
    landAt(s, 500);
    landAt(s, 100);
    expect(heightOf(s)).toBe(2);
  });
});

describe("paused and over (edge case 13)", () => {
  it("does nothing while paused: no time, no drop, then goes on", () => {
    const s = newStack("kid");
    runTo(s, 1240);
    pause(s);
    const before = JSON.stringify(s);
    expect(stepStack(s, 100)).toBe(false);
    expect(dropStack(s)).toBeNull();
    expect(JSON.stringify(s)).toBe(before);
    resume(s);
    stepStack(s, 100);
    expect(s.elapsedMs).toBe(1340);
    expect(dropStack(s)).not.toBeNull();
  });

  it("counts no drop once the run is over, and says it ended in the call that ended it", () => {
    const s = newStack("kid", 50);
    expect(stepStack(s, 40)).toBe(false);
    expect(stepStack(s, 10)).toBe(true);
    expect(s.over).toBe(true);
    expect(dropStack(s)).toBeNull();
    expect([s.perfects, s.goods, s.badDrops]).toEqual([0, 0, 0]);
  });
});

describe("the gap between drops (edge case 13a)", () => {
  it("ignores a drop 10 ms before the next block comes, changes nothing, and judges one on the dot", () => {
    const s = newStack("kid");
    runTo(s, 1240);
    expect(dropStack(s)).toEqual({ judge: "perfect" }); // kid at 1,240 ms: 472, 28 from the base
    expect(s.readyAt).toBe(1640);
    runTo(s, 1630);
    const before = JSON.stringify(s);
    expect(dropStack(s)).toBeNull();
    expect(JSON.stringify(s)).toBe(before);
    runTo(s, 1640);
    expect(dropStack(s)).not.toBeNull();
    expect(s.readyAt).toBe(2040);
  });

  it("gives one Perfect for a tapper who drops every 10 ms through a Perfect window, at every stage", () => {
    for (const [stage, first] of [["kid", 1240], ["young", 980], ["adult", 860]] as const) {
      expect(firstPerfectStep(stage), stage).toBe(first);
      const drops: number[] = [];
      for (let t = first; t < first + 400; t += 10) drops.push(t);
      const s = playDrops(stage, drops);
      expect([heightOf(s), s.perfects, s.blockPoints, s.badDrops, s.toppled], stage).toEqual([1, 1, 20, 0, false]);
    }
  });

  it("starts the gap after a Bad drop too, and a drop in it is neither a stray nor a bad drop", () => {
    const s = newStack("kid");
    expect(dropStack(s)).toEqual({ judge: "wobble" }); // 150 at 0 ms: no overlap with the base
    expect(s.readyAt).toBe(400);
    runTo(s, 10);
    expect(dropStack(s)).toBeNull();
    expect([s.badDrops, s.recovered, s.toppled]).toEqual([1, true, false]);
  });
});

describe("the frames (edge case 14)", () => {
  it("reaches the same time and the same standing time at 7, 16 and 100 ms frames", () => {
    const run = (frame: number, count: number): StackState => {
      const s = newStack("kid");
      s.blocks.push({ x: 500, w: 300 });
      for (let i = 0; i < count; i++) stepStack(s, frame);
      return s;
    };
    for (const s of [run(7, 400), run(16, 175), run(100, 28)]) expect([s.elapsedMs, s.standMs, s.carryMs]).toEqual([2800, 2800, 0]);
  });

  it("cuts a frame at the cap: 99 moves 90 and carries 9, 100 and 101 move 100, a 5 s stall moves 100", () => {
    const moved = (dt: number): number[] => {
      const s = newStack("kid");
      stepStack(s, dt);
      return [s.elapsedMs, s.carryMs];
    };
    expect([99, 100, 101, 110, 5000].map(moved)).toEqual([[90, 9], [100, 0], [100, 0], [100, 0], [100, 0]]);
    const s = newStack("kid");
    stepStack(s, 9);
    expect([s.elapsedMs, s.carryMs]).toEqual([0, 9]);
    stepStack(s, 1);
    expect([s.elapsedMs, s.carryMs]).toEqual([10, 0]);
  });

  it("moves nothing for a negative, NaN or infinite frame", () => {
    for (const dt of [-5, Number.NaN, Infinity, -Infinity]) {
      const s = newStack("kid");
      expect(stepStack(s, dt)).toBe(false);
      expect([s.elapsedMs, s.carryMs], String(dt)).toEqual([0, 0]);
    }
  });

  it("ends the run at lengthMs, 75 seconds by default", () => {
    const s = newStack("kid");
    expect(s.lengthMs).toBe(75_000);
    while (!s.over) stepStack(s, 100);
    expect(s.elapsedMs).toBe(75_000);
  });

  it("stops inside a call that has more time than the run has left: a 50 ms run fed 100 ms ends at 50", () => {
    const s = newStack("kid", 50);
    expect(stepStack(s, 100)).toBe(true);
    expect([s.elapsedMs, s.carryMs]).toEqual([50, 50]);
  });
});

describe("the bands, and what a mashing or waiting player scores (edge case 15)", () => {
  it("puts Silver and Gold on their lines, one under, on and one over", () => {
    const lines = { kid: [1000, 1460], young: [1000, 1620], adult: [800, 1660] } as const;
    for (const stage of STAGES) {
      const [silver, gold] = lines[stage];
      expect([silver - 1, silver, gold - 1, gold, gold + 1].map((n) => stackBandOf(n, stage)), stage).toEqual(["bronze", "silver", "silver", "gold", "gold"]);
      expect(stackBandOf(0, stage)).toBe("bronze");
    }
  });

  it("keeps the best steady tapper under Silver at every stage (a drop every 40 to 700 ms, 20 phases each)", () => {
    for (const stage of STAGES) {
      let best = 0;
      for (let interval = 40; interval <= 700; interval += 10) for (let phase = 0; phase < 20; phase++) best = Math.max(best, scoreOf(mash(stage, interval, (interval * phase) / 20)));
      expect(best, stage).toBeLessThan(k.rows[stage].silverAt);
      expect(best, `${stage}: a steady tapper stays a long way under Silver`).toBeLessThan(100);
    }
  });

  it("scores a player who drops once and waits 385, 390 and 390 at best, under Silver", () => {
    expect(STAGES.map(waitingScore)).toEqual([385, 390, 390]);
    for (const stage of STAGES) expect(waitingScore(stage)).toBeLessThan(k.rows[stage].silverAt);
  });

  it("makes the first Perfect step the best single drop: no other time beats it", () => {
    for (const stage of STAGES) {
      let best = 0;
      for (let at = 0; at <= 6000; at += 10) best = Math.max(best, scoreOf(playDrops(stage, [at])));
      expect(best, stage).toBe(waitingScore(stage));
    }
  });

  it("reaches Gold in a fair share of the stand-in's runs and Silver in nearly all: the lines are not out of reach or free", () => {
    for (const stage of STAGES) {
      const runs = Array.from({ length: 200 }, (_, i) => scoreOf(playRun(5001 + i, stage)));
      const share = (line: number): number => runs.filter((n) => n >= line).length / runs.length;
      expect(share(k.rows[stage].goldAt), `${stage} Gold`).toBeGreaterThan(0.12);
      expect(share(k.rows[stage].goldAt), `${stage} Gold`).toBeLessThan(0.4);
      expect(share(k.rows[stage].silverAt), `${stage} Silver`).toBeGreaterThan(0.85);
    }
  });
});

describe("the time a drop is judged at (edge case 16)", () => {
  it("judges where the screen shows the block: kid at 1,230 ms (470, Good) and at 1,240 ms (472, Perfect), not a step later", () => {
    const early = newStack("kid");
    runTo(early, 1230);
    expect(blockX(early)).toBe(470);
    expect(dropStack(early)).toEqual({ judge: "good" });
    const on = newStack("kid");
    runTo(on, 1240);
    expect(blockX(on)).toBe(472);
    expect(dropStack(on)).toEqual({ judge: "perfect" });
  });

  it("does not count time fed but not yet a whole step", () => {
    const s = newStack("kid");
    runTo(s, 1230);
    stepStack(s, 9);
    expect([s.elapsedMs, s.carryMs]).toEqual([1230, 9]);
    expect(dropStack(s)).toEqual({ judge: "good" });
  });
});

describe("the words", () => {
  it("says what was last done and counts the drops", () => {
    const s = onTop("kid");
    landAt(s, 500);
    expect(s.said).toEqual({ n: 1, judge: "perfect", combo: 1, trimmedPct: 0 });
    landAt(s, 500);
    expect(saidLine(s.said!)).toBe("Perfect, combo 2");
    landAt(s, 536); // kid: 36 off the block below, overlap 264 of 300: 12 percent trimmed
    expect(s.said).toEqual({ n: 3, judge: "good", combo: 0, trimmedPct: 12 });
    expect(saidLine(s.said!)).toBe("Good, trimmed 12 percent");
    landAt(s, 100);
    expect(saidLine(s.said!)).toBe("Wobble, steadied. One more and it falls");
    landAt(s, 100);
    expect(saidLine(s.said!)).toBe("It fell");
    expect(s.said!.n).toBe(5);
  });

  it("rounds the trimmed share to a whole percent: 200 of 300 is 33, 184 of 300 is 39", () => {
    const a = onTop("kid");
    landAt(a, 600);
    expect(a.said!.trimmedPct).toBe(33);
    const b = onTop("kid", { x: 500, w: 270 }, 300);
    landAt(b, 600);
    expect(b.said!.trimmedPct).toBe(39);
  });
});

describe("no random draw", () => {
  it("draws nothing for a whole run of the engine", () => {
    const random = vi.spyOn(Math, "random").mockImplementation(() => {
      throw new Error("Math.random was called");
    });
    try {
      const s = newStack("adult");
      while (!s.over) {
        stepStack(s, 100);
        dropStack(s);
      }
      expect(s.over).toBe(true);
      expect(random).not.toHaveBeenCalled();
    } finally {
      random.mockRestore();
    }
  });
});
