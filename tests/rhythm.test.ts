// Rhythm Grove: the songs and the judging (src/game/rhythm.ts, src/data/rhythm.ts, docs/adult-a4-plan.md section 2, edge cases 1 to 14).
// The expected numbers are worked out by hand in the comments or written as literals, not read from the code.
import { describe, expect, it } from "vitest";
import { rhythmTuning, songs, timingWindows } from "../src/data/rhythm";
import type { TrainStage } from "../src/data/training";
import { maxScore, newRhythm, rhythmBandOf, saidLine, songTimes, stepRhythm, tapRhythm } from "../src/game/rhythm";
import type { RhythmState } from "../src/game/rhythm";
import type { FieldId } from "../src/game/types";
import { mash, percentOf, playRun, playTaps } from "./rhythmBot";

const fields: FieldId[] = ["land", "water", "sky"];
const stages: TrainStage[] = ["kid", "young", "adult"];

// Feed time in frames of `frame` ms (the last shorter) up to `ms` in all.
function feed(s: RhythmState, ms: number, frame = 10): void {
  for (let t = 0; t < ms; t += frame) stepRhythm(s, Math.min(frame, ms - t));
}

// Run a fresh Land kid song until the clock reads `elapsed` (a multiple of 10).
function runTo(elapsed: number, field: FieldId = "land", stage: TrainStage = "kid"): RhythmState {
  const s = newRhythm(field, stage);
  feed(s, elapsed);
  expect(s.elapsedMs).toBe(elapsed);
  return s;
}

// A state with notes written by hand, on the track at `elapsed` (the run's own steps are not needed to judge a tap).
function handmade(times: number[], elapsed: number): RhythmState {
  return { ...newRhythm("land", "kid"), times, next: times.length, notes: times.map((t, id) => ({ id, t })), elapsedMs: elapsed };
}

describe("the songs (edge cases 1 to 4)", () => {
  it("writes each pattern as 16 marks that start with a note, and gives each field its own tempo and pattern", () => {
    for (const id of fields) {
      expect(songs[id].pattern, id).toMatch(/^1[.123]{15}$/);
    }
    expect(new Set(fields.map((id) => songs[id].bpm)).size).toBe(3);
    expect(new Set(fields.map((id) => songs[id].pattern)).size).toBe(3);
    expect(fields.map((id) => songs[id].bpm)).toEqual([96, 84, 108]);
  });

  it("starts every song at 2000 ms, rises strictly in whole milliseconds, and ends by 74,000 ms", () => {
    for (const id of fields) {
      for (const stage of stages) {
        const times = songTimes(songs[id], stage, 75_000);
        expect(times[0], `${id} ${stage}`).toBe(2000);
        expect(times.at(-1)! <= 74_000, `${id} ${stage} last ${times.at(-1)}`).toBe(true);
        for (let i = 1; i < times.length; i++) {
          expect(Number.isInteger(times[i]), `${id} ${stage} ${i}`).toBe(true);
          expect(times[i]! > times[i - 1]!, `${id} ${stage} ${i}`).toBe(true);
        }
      }
    }
  });

  it("keeps the notes at least 550 ms apart for kid and young and 250 ms for adult, and Land's own smallest gaps are 625, 625 and 312", () => {
    const least = { kid: 550, young: 550, adult: 250 };
    for (const id of fields) {
      for (const stage of stages) {
        const times = songTimes(songs[id], stage, 75_000);
        const gaps = times.slice(1).map((time, i) => time - times[i]!);
        expect(Math.min(...gaps) >= least[stage], `${id} ${stage} smallest gap ${Math.min(...gaps)}`).toBe(true);
      }
    }
    // worked out by hand from Land's pattern (an eighth is 312.5 ms): kid and young play eighths 0, 2, 4, 8 and 10, so 625 ms; adult adds eighths 6, 7, 12 and 14, and 4,188 to 4,500 is 312
    for (const [stage, gap] of [["kid", 625], ["young", 625], ["adult", 312]] as const) {
      const times = songTimes(songs.land, stage, 75_000);
      expect(Math.min(...times.slice(1).map((time, i) => time - times[i]!)), `land ${stage}`).toBe(gap);
    }
  });

  it("gives Land's kid song the notes the pattern says: eighths 0, 2, 4, 8 and 10 of each 5,000 ms loop (96 beats a minute: an eighth is 312.5 ms)", () => {
    const kid = songTimes(songs.land, "kid", 75_000);
    // loop 1: 2000 + 0, 625, 1250, 2500, 3125; loop 2 begins at 7000
    expect(kid.slice(0, 7)).toEqual([2000, 2625, 3250, 4500, 5125, 7000, 7625]);
    expect(songTimes(songs.land, "adult", 75_000).at(-1)).toBe(73_875);
  });

  it("counts the notes of every song at every stage (each inside its range, and a higher stage keeps every note of a lower one)", () => {
    const counts = Object.fromEntries(fields.map((id) => [id, stages.map((stage) => songTimes(songs[id], stage, 75_000).length)]));
    expect(counts).toEqual({ land: [73, 102, 144], water: [63, 89, 139], sky: [82, 114, 131] });
    const range = { kid: [55, 85], young: [80, 115], adult: [110, 145] } as const;
    for (const id of fields) {
      stages.forEach((stage, i) => {
        const n = counts[id]![i]!;
        expect(n >= range[stage][0] && n <= range[stage][1], `${id} ${stage} ${n}`).toBe(true);
      });
      const [kid, young, adult] = stages.map((stage) => songTimes(songs[id], stage, 75_000));
      expect(kid!.every((time) => young!.includes(time)), id).toBe(true);
      expect(young!.every((time) => adult!.includes(time)), id).toBe(true);
    }
  });

  it("scores at most 100 a note: Land's kid song is 73 notes, 7,300", () => {
    expect(maxScore(newRhythm("land", "kid"))).toBe(7300);
  });
});

describe("a note comes onto the track (edge case 13)", () => {
  it("is shown 1600 ms before its time: the first at 400 ms, saying the list changed", () => {
    const s = newRhythm("land", "kid");
    feed(s, 390);
    expect(s.notes).toEqual([]);
    expect(stepRhythm(s, 10), "the step that brings the first note on").toBe(true);
    expect(s.elapsedMs).toBe(400);
    expect(s.notes).toEqual([{ id: 0, t: 2000 }]);
    expect(stepRhythm(s, 10), "nothing changed in the next step").toBe(false);
  });

  it("brings the second note (2,625 ms) on at the first step 1,600 ms or less before it: 1,030 ms", () => {
    const s = newRhythm("land", "kid");
    feed(s, 1020);
    expect(s.notes.map((n) => n.id)).toEqual([0]);
    feed(s, 10);
    expect(s.elapsedMs).toBe(1030);
    expect(s.notes.map((n) => n.id)).toEqual([0, 1]);
  });
});

describe("judging a tap (edge cases 5 to 10)", () => {
  // Notes written by hand so that the distance of the tap from the note is exact: the clock moves in tens, the notes need not.
  const tapped = (noteAt: number, tapAt: number) => {
    const s = handmade([noteAt], tapAt);
    return { tap: tapRhythm(s), s };
  };

  it("calls a tap 80 ms from a note Perfect, early or late, and 81 ms Good", () => {
    expect(tapped(1000, 920).tap).toEqual({ judge: "perfect", deltaMs: -80 });
    expect(tapped(1000, 1080).tap).toEqual({ judge: "perfect", deltaMs: 80 });
    expect(tapped(999, 1080).tap).toEqual({ judge: "good", deltaMs: 81 });
    expect(tapped(1001, 920).tap).toEqual({ judge: "good", deltaMs: -81 });
  });

  it("calls a tap 160 ms from a note Good and 161 ms a stray that leaves the note where it was", () => {
    expect(tapped(1000, 1160).tap).toEqual({ judge: "good", deltaMs: 160 });
    expect(tapped(1000, 840).tap).toEqual({ judge: "good", deltaMs: -160 });
    const late = tapped(999, 1160);
    expect(late.tap).toEqual({ judge: "stray", deltaMs: 0 });
    expect(late.s.notes).toEqual([{ id: 0, t: 999 }]);
    expect(tapped(1001, 840).tap?.judge).toBe("stray");
  });

  it("settles a note nobody tapped as a Miss at the first step more than 160 ms after it: 2,170 ms for the note at 2,000", () => {
    const s = runTo(2160);
    expect(s.notes[0]?.t, "160 ms late is still tappable").toBe(2000);
    expect(s.misses).toBe(0);
    expect(stepRhythm(s, 10), "the miss changed the notes on the track").toBe(true);
    expect(s.misses).toBe(1);
    expect(s.notes.map((n) => n.t)).toEqual([2625, 3250]);
    expect(s.said).toEqual({ n: 1, judge: "miss", deltaMs: 0 });
  });

  it("judges a tap at the exact step a note settles by the clock the screen shows: Good at 160 ms late, a stray at 170", () => {
    const early = runTo(2160);
    expect(tapRhythm(early)).toEqual({ judge: "good", deltaMs: 160 });
    const late = runTo(2170);
    expect(late.misses).toBe(1);
    expect(tapRhythm(late)).toEqual({ judge: "stray", deltaMs: 0 });
  });

  it("breaks the streak, takes 30 points and settles nothing for a stray; a tap on a note already judged is a stray too", () => {
    const s = runTo(2000);
    expect(tapRhythm(s)).toEqual({ judge: "perfect", deltaMs: 0 });
    expect([s.streak, s.score, s.notes.length]).toEqual([1, 100, 2]); // the notes at 2,625 and 3,250 are on the track
    expect(tapRhythm(s)).toEqual({ judge: "stray", deltaMs: 0 }); // a double tap
    expect([s.streak, s.score, s.strays, s.notes.length]).toEqual([0, 70, 1, 2]);
    expect(s.best).toBe(1);
  });

  it("never lets the score fall below 0, whatever the order: strays first, then hits, count the same as hits then strays", () => {
    const strays = runTo(1000);
    for (let i = 0; i < 5; i++) expect(tapRhythm(strays)?.judge).toBe("stray");
    expect(strays.score).toBe(0);
    expect(strays.strays).toBe(5);
    // two Perfects (200) and five strays (150) make 50
    const s = runTo(1000);
    for (let i = 0; i < 5; i++) tapRhythm(s);
    feed(s, 1000); // 2,000
    tapRhythm(s);
    feed(s, 630); // 2,630: the second note is 5 ms late
    tapRhythm(s);
    expect([s.perfects, s.strays, s.score]).toEqual([2, 5, 50]);
    // the same taps with the five strays after the two Perfects: 200 - 150 is 50 as well
    const after = runTo(2000);
    tapRhythm(after);
    feed(after, 630);
    tapRhythm(after);
    for (let i = 0; i < 5; i++) tapRhythm(after);
    expect([after.perfects, after.strays, after.score]).toEqual([2, 5, 50]);
  });

  it("gives the tap to the closest of two notes on the track, and a tie to the earlier one", () => {
    const closer = handmade([1000, 1300], 1160);
    expect(tapRhythm(closer)).toEqual({ judge: "good", deltaMs: -140 });
    expect(closer.notes.map((n) => n.t)).toEqual([1000]);
    const tie = handmade([1000, 1300], 1150);
    expect(tapRhythm(tie)).toEqual({ judge: "good", deltaMs: 150 });
    expect(tie.notes.map((n) => n.t)).toEqual([1300]);
  });

  it("judges the note 155 ms away and leaves the one 158 ms away when two of Land's adult notes share the window (4,030 ms: 3,875 and 4,188)", () => {
    const s = runTo(4030, "land", "adult");
    // (the notes before them were missed: their windows closed at 3,410 ms and earlier)
    expect(s.notes.map((n) => n.t)).toEqual([3875, 4188, 4500, 5125]);
    expect(tapRhythm(s)).toEqual({ judge: "good", deltaMs: 155 });
    expect(s.notes.map((n) => n.t)).toEqual([4188, 4500, 5125]);
  });

  it("settles a judged note: it leaves the track, is not judged again, the streak follows the hits and ends at a Miss, and the best is kept", () => {
    const s = runTo(2000);
    tapRhythm(s);
    expect(s.notes.map((n) => n.id)).toEqual([1, 2]);
    feed(s, 630);
    expect(tapRhythm(s)).toEqual({ judge: "perfect", deltaMs: 5 });
    expect([s.streak, s.best, s.perfects, s.goods, s.score]).toEqual([2, 2, 2, 0, 200]);
    feed(s, 1000); // 3,630: the third note (3,250) was not tapped and its window closed at 3,410
    expect([s.misses, s.streak, s.best]).toEqual([1, 0, 2]);
    feed(s, 870); // 4,500: the next note, tapped on the beat
    expect(tapRhythm(s)).toEqual({ judge: "perfect", deltaMs: 0 });
    expect([s.streak, s.best], "a new streak of 1 does not lower the best").toEqual([1, 2]);
  });

  it("remembers the last thing said and numbers each one: a Perfect, a stray, a Good, a Miss", () => {
    const s = runTo(2000);
    expect(s.said).toBeNull();
    tapRhythm(s);
    expect(s.said).toEqual({ n: 1, judge: "perfect", deltaMs: 0 });
    tapRhythm(s); // nothing else is near
    expect(s.said).toEqual({ n: 2, judge: "stray", deltaMs: 0 });
    feed(s, 760); // 2,760: the note at 2,625 is 135 ms late
    tapRhythm(s);
    expect(s.said).toEqual({ n: 3, judge: "good", deltaMs: 135 });
    feed(s, 660); // 3,420: the note at 3,250 is a Miss
    expect(s.said).toEqual({ n: 4, judge: "miss", deltaMs: 0 });
  });

  it("scores 100 for a Perfect and 60 for a Good", () => {
    const perfect = tapped(1000, 1000).s;
    const good = tapped(1000, 1100).s;
    expect([perfect.score, good.score]).toEqual([100, 60]);
  });

  it("does nothing while paused, and goes on where it was", () => {
    const s = runTo(1000);
    s.paused = true;
    expect(stepRhythm(s, 100)).toBe(false);
    expect(s.elapsedMs).toBe(1000);
    expect(tapRhythm(s)).toBeNull();
    expect(s.strays).toBe(0);
    s.paused = false;
    feed(s, 1000);
    expect(tapRhythm(s)).toEqual({ judge: "perfect", deltaMs: 0 });
  });

  it("counts no tap and no time once over, and a tap before any note is in its window (the first opens at 1,840 ms) is a stray", () => {
    expect(tapRhythm(runTo(1830))?.judge).toBe("stray");
    expect(tapRhythm(runTo(1840))?.judge).toBe("good");
    const done = runTo(1000);
    done.over = true;
    expect(tapRhythm(done)).toBeNull();
    expect(stepRhythm(done, 100)).toBe(false);
    expect(done.elapsedMs).toBe(1000);
  });

  it("ends a run with no tap at 75,000 ms with every note a Miss, nothing left on the track, and the last note settled before the end; the step that ends it says so and a call goes no further", () => {
    const s = newRhythm("land", "adult");
    const total = s.times.length;
    let settledAt = 0;
    let endStep: boolean | null = null;
    while (!s.over) {
      const changed = stepRhythm(s, 10);
      if (s.over) endStep = changed;
      if (s.misses === total && settledAt === 0) settledAt = s.elapsedMs;
    }
    expect([s.misses, s.score, s.notes.length, s.elapsedMs]).toEqual([144, 0, 0, 75_000]);
    expect(settledAt, "the note at 73,875 is a Miss at 74,040").toBe(74_040);
    expect(endStep, "no note changed in the last step: only the end says it").toBe(true);
    const late = runTo(74_950);
    stepRhythm(late, 100); // 100 ms is 10 steps, the 5th reaches the end and the other 50 ms are not counted
    expect([late.over, late.elapsedMs]).toEqual([true, 75_000]);
  });
});

describe("feeding time (edge case 11)", () => {
  it("reaches the same time and the same notes on the track at any frame length (up to the cap)", () => {
    const seen = [7, 16, 100].map((frame) => {
      const s = newRhythm("land", "kid");
      feed(s, 12_345, frame);
      return [s.elapsedMs, s.notes.map((n) => n.id), s.misses];
    });
    expect(seen[0]).toEqual([12_340, expect.any(Array), expect.any(Number)]);
    expect(seen[1]).toEqual(seen[0]);
    expect(seen[2]).toEqual(seen[0]);
  });

  it("counts at most 100 ms of one call and nothing for a time that is not a finite, positive number", () => {
    const s = newRhythm("land", "kid");
    stepRhythm(s, 5000);
    expect(s.elapsedMs).toBe(100);
    for (const bad of [NaN, Infinity, -Infinity, -50]) {
      stepRhythm(s, bad);
      expect(s.elapsedMs, `after ${bad}`).toBe(100);
    }
    stepRhythm(s, 10); // none of them left a debt or a poisoned carry: the next 10 ms is the next step
    expect(s.elapsedMs).toBe(110);
  });

  it("carries a time shorter than one step to the next call", () => {
    const s = newRhythm("land", "kid");
    stepRhythm(s, 4);
    expect(s.elapsedMs).toBe(0);
    stepRhythm(s, 6);
    expect(s.elapsedMs).toBe(10);
  });
});

describe("the band (edge case 12)", () => {
  // The lines are whole percents of the most a song scores: Land's kid song is 73 notes, so 7,300.
  it("puts a score one under a line in the band below and on it in the band above, for every stage and both lines", () => {
    for (const stage of stages) {
      const { silverPct, goldPct } = rhythmTuning.rows[stage];
      const s = newRhythm("land", stage);
      const top = s.times.length * 100;
      for (const [pct, below, above] of [
        [silverPct, "bronze", "silver"],
        [goldPct, "silver", "gold"],
      ] as const) {
        const line = (top * pct) / 100; // a whole number: the top is a multiple of 100
        expect(Number.isInteger(line), `${stage} ${pct}`).toBe(true);
        expect(rhythmBandOf({ ...s, score: line - 1 }), `${stage} ${pct} one under`).toBe(below);
        expect(rhythmBandOf({ ...s, score: line }), `${stage} ${pct} on`).toBe(above);
        expect(rhythmBandOf({ ...s, score: line + 1 }), `${stage} ${pct} one over`).toBe(above);
      }
    }
  });

  it("gives Gold to 20 to 30 percent of the stand-in player's runs in every stage (other seeds than the ones the lines were written from)", () => {
    for (const stage of stages) {
      const runs = fields.flatMap((field) => Array.from({ length: 400 }, (_, i) => playRun(10_001 + i, field, stage)));
      const share = runs.filter((run) => rhythmBandOf(run) === "gold").length / runs.length;
      expect(share, `${stage}: ${(share * 100).toFixed(1)}%`).toBeGreaterThanOrEqual(0.2);
      expect(share, `${stage}: ${(share * 100).toFixed(1)}%`).toBeLessThanOrEqual(0.3);
    }
  });
});

describe("the numbers the rules are written from", () => {
  it("pins the windows, the points, the stray cost, the times and the lines (the other tests read some of them from the tuning)", () => {
    expect(timingWindows).toEqual({ perfectMs: 80, goodMs: 160 });
    expect(rhythmTuning).toMatchObject({ eighthsPerLoop: 16, leadInMs: 2000, approachMs: 1600, tailMs: 1000, perfectPoints: 100, goodPoints: 60, strayCost: 30 });
    expect(rhythmTuning.rows).toEqual({
      kid: { level: 1, silverPct: 75, goldPct: 93 },
      young: { level: 2, silverPct: 75, goldPct: 89 },
      adult: { level: 3, silverPct: 75, goldPct: 85 },
    });
  });
});

describe("a steady tapper cannot reach Silver (edge case 14)", () => {
  it("scores under the Silver line for every tap interval from 40 to 700 ms (every 10 ms, at eight phases each), on every field and stage", () => {
    for (const field of fields) {
      for (const stage of stages) {
        let most = 0;
        let worst = 0;
        for (let interval = 40; interval <= 700; interval += 10) {
          for (let phase = 0; phase < 8; phase++) {
            const pct = percentOf(mash(field, stage, interval, (interval * phase) / 8));
            if (pct > most) {
              most = pct;
              worst = interval;
            }
          }
        }
        expect(most, `${field} ${stage}: the sweep measured nothing`).toBeGreaterThan(0);
        expect(most < rhythmTuning.rows[stage].silverPct, `${field} ${stage}: ${most.toFixed(1)} percent at an interval of ${worst} ms`).toBe(true);
      }
    }
  });
});

describe("the stand-in player", () => {
  it("is deterministic: the same seed gives the same run", () => {
    expect(playRun(7, "land", "adult").score).toBe(playRun(7, "land", "adult").score);
    expect(playRun(7, "land", "adult").score).not.toBe(playRun(8, "land", "adult").score);
  });

  it("taps every note of the song exactly on the beat for a perfect score", () => {
    const song = newRhythm("sky", "young");
    const exact = playTaps("sky", "young", song.times);
    expect([exact.perfects, exact.score]).toEqual([114, 11_400]);
    expect(rhythmBandOf(exact)).toBe("gold");
  });
});

describe("the words", () => {
  it("says each judgment in words, with the offset", () => {
    expect(saidLine({ n: 1, judge: "perfect", deltaMs: -12 })).toBe("Perfect, 12 ms early");
    expect(saidLine({ n: 1, judge: "good", deltaMs: 95 })).toBe("Good, 95 ms late");
    expect(saidLine({ n: 1, judge: "perfect", deltaMs: 0 })).toBe("Perfect, on the beat");
    expect(saidLine({ n: 1, judge: "miss", deltaMs: 0 })).toBe("Miss");
    expect(saidLine({ n: 1, judge: "stray", deltaMs: 0 })).toBe("No note, -30");
  });
});
