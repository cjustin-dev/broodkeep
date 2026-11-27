// Rhythm Grove: every number and every song (docs/adult-a4-plan.md section 2). All are starting values, tuned like the rest of tuning.ts.
// The band lines are not guessed: tools/verify/rhythm-bands.ts prints the score percentiles of the stand-in player's runs (tests/rhythmBot.ts), and the lines below are written from them.

import type { FieldId } from "../game/types";
import type { TrainStage } from "./training";

// The two windows around a note's time. Perfect and Good are the words timed combat reuses (docs/adult-expansion-spec.md, Spec 4 and Spec 7), so they live here and not in the engine.
export const timingWindows = { perfectMs: 80, goodMs: 160 };

// A song is a loop of 16 eighth notes (two bars of four beats) at a tempo. In the pattern a `.` is a rest, and a digit is the lowest stage that plays that note:
// 1 every stage, 2 young and adult, 3 adult only. Each pattern starts with a 1.
export interface Song {
  bpm: number;
  pattern: string;
}

export const songs: Record<FieldId, Song> = {
  land: { bpm: 96, pattern: "1.1.1.231.1.2.33" },
  water: { bpm: 84, pattern: "1.231.132.131..3" },
  sky: { bpm: 108, pattern: "1.13..1.2.1.1.2." },
};

export interface RhythmRow {
  level: number; // the digit of the highest note this stage plays
  silverPct: number; // the share of the most a song can score (in whole percent) where Silver starts
  goldPct: number;
}

export const rhythmTuning = {
  eighthsPerLoop: 16,
  leadInMs: 2000, // the first note
  approachMs: 1600, // a note is on the track this long before its time
  tailMs: 1000, // the last note is at least this long before the end of the session
  perfectPoints: 100,
  goodPoints: 60,
  strayCost: 30, // a tap with no note near it; the score never goes below 0 (docs/adult-a4-plan.md section 2, decision 8: without a cost a steady tapper reaches Silver)

  rows: {
    kid: { level: 1, silverPct: 75, goldPct: 93 },
    young: { level: 2, silverPct: 75, goldPct: 89 },
    adult: { level: 3, silverPct: 75, goldPct: 85 },
  } as Record<TrainStage, RhythmRow>,
};
