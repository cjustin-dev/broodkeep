// Rhythm Grove: the song and the judging (docs/adult-a4-plan.md section 2). Adult Mode only, like the other training games.
// This file is the rules and nothing else, with no screen code and no clock of its own: a song is a function of the field and the stage (no random draw at all), and a run is a function of
// the time it is fed and the taps it is given, so a whole run is a loop in a test. `payRhythm` (game/training.ts) is what the end of a run changes in the save.

import { rhythmTuning, songs, timingWindows } from "../data/rhythm";
import type { Song } from "../data/rhythm";
import { trainTuning } from "../data/training";
import type { Band, TrainStage } from "../data/training";
import type { FieldId } from "./types";

const t = trainTuning;
const r = rhythmTuning;
const w = timingWindows;

// ---- the song ----

// The time of every note of `song` that `stage` plays, in milliseconds from the start of the run, rising. The loop repeats from the lead-in; a note is kept while it is early enough to be
// settled before the end (at most `lengthMs - tailMs`). Each time is rounded to a whole millisecond.
export function songTimes(song: Song, stage: TrainStage, lengthMs: number): number[] {
  const level = r.rows[stage].level;
  const eighthMs = 30000 / song.bpm;
  const loopMs = r.eighthsPerLoop * eighthMs;
  const last = lengthMs - r.tailMs;
  const times: number[] = [];
  for (let loop = 0; r.leadInMs + loop * loopMs <= last; loop++) {
    for (let i = 0; i < r.eighthsPerLoop; i++) {
      const mark = song.pattern[i] as string;
      if (mark === "." || Number(mark) > level) continue;
      const time = Math.round(r.leadInMs + loop * loopMs + i * eighthMs);
      if (time <= last) times.push(time);
    }
  }
  return times;
}

// ---- the engine ----

export type RhythmJudge = "perfect" | "good" | "stray";

export interface RhythmNote {
  id: number; // its place in the song
  t: number; // when it is due, in milliseconds from the start of the run
}

// What was last said about a tap or a missed note, for the screen's one line. `n` counts them, so the screen can tell a new one from the one it has already shown.
export interface RhythmSaid {
  n: number;
  judge: RhythmJudge | "miss";
  deltaMs: number; // the tap's time minus the note's (negative: early); 0 for a stray and for a miss
}

export interface RhythmState {
  field: FieldId;
  stage: TrainStage;
  lengthMs: number;
  elapsedMs: number; // whole steps only
  carryMs: number; // time fed but not yet a whole step
  times: number[]; // every note's time, rising (plain data, so a state can be copied and a test can write its own)
  next: number; // the index in `times` of the next note to put on the track
  notes: RhythmNote[]; // on the track: shown, not yet judged or missed, in time order
  score: number; // 100 for a Perfect, 60 for a Good, minus the stray cost; never below 0
  perfects: number;
  goods: number;
  misses: number;
  strays: number;
  streak: number; // notes hit since the last miss or stray
  best: number; // the longest streak
  said: RhythmSaid | null;
  paused: boolean;
  over: boolean;
}

// A run of the song of `field` for `stage`. `lengthMs` is the session's length.
export function newRhythm(field: FieldId, stage: TrainStage, lengthMs: number = t.sessionMs): RhythmState {
  return {
    field,
    stage,
    lengthMs,
    elapsedMs: 0,
    carryMs: 0,
    times: songTimes(songs[field], stage, lengthMs),
    next: 0,
    notes: [],
    score: 0,
    perfects: 0,
    goods: 0,
    misses: 0,
    strays: 0,
    streak: 0,
    best: 0,
    said: null,
    paused: false,
    over: false,
  };
}

const say = (s: RhythmState, judge: RhythmSaid["judge"], deltaMs: number): void => {
  s.said = { n: (s.said?.n ?? 0) + 1, judge, deltaMs };
};

const rescore = (s: RhythmState): void => {
  s.score = Math.max(0, r.perfectPoints * s.perfects + r.goodPoints * s.goods - r.strayCost * s.strays);
};

// Feed the engine the time since the last call. Each call counts at most `frameCapMs` (a page that stalled for seconds does not jump the song) and the engine moves in whole steps of `stepMs`
// (the same taps at the same times give the same run at any frame rate). Nothing moves while paused or over. In each step a note whose window has closed is a Miss and a note that is now
// `approachMs` away comes onto the track. Says whether the notes on the track changed or the run ended, so the screen knows to redraw its list.
export function stepRhythm(s: RhythmState, dtMs: number): boolean {
  if (s.over || s.paused) return false;
  s.carryMs += Number.isFinite(dtMs) ? Math.min(Math.max(dtMs, 0), t.frameCapMs) : 0;
  if (s.carryMs < t.stepMs) return false;
  let changed = false;
  while (s.carryMs >= t.stepMs && !s.over) {
    s.carryMs -= t.stepMs;
    s.elapsedMs += t.stepMs;
    const before = s.notes.length;
    s.notes = s.notes.filter((n) => {
      if (s.elapsedMs - n.t <= w.goodMs) return true;
      s.misses += 1;
      s.streak = 0;
      say(s, "miss", 0);
      return false;
    });
    if (s.notes.length !== before) changed = true;
    while (s.next < s.times.length && (s.times[s.next] as number) - s.elapsedMs <= r.approachMs) {
      s.notes.push({ id: s.next, t: s.times[s.next] as number });
      s.next += 1;
      changed = true;
    }
    if (s.elapsedMs >= s.lengthMs) s.over = true;
  }
  return changed || s.over;
}

export interface RhythmTap {
  judge: RhythmJudge;
  deltaMs: number;
}

// The player tapped, at the time the screen shows (`elapsedMs`). The closest note on the track within `goodMs` is judged (a tie goes to the earlier one): within `perfectMs` it is a Perfect,
// otherwise a Good, and either way it is settled and leaves the track. A tap with no note that near is a stray: it breaks the streak and costs `strayCost`. Null when paused or over.
export function tapRhythm(s: RhythmState): RhythmTap | null {
  if (s.over || s.paused) return null;
  let at = -1;
  let nearest = Infinity;
  s.notes.forEach((n, i) => {
    const gap = Math.abs(s.elapsedMs - n.t);
    if (gap <= w.goodMs && gap < nearest) {
      nearest = gap;
      at = i;
    }
  });
  if (at < 0) {
    s.strays += 1;
    s.streak = 0;
    rescore(s);
    say(s, "stray", 0);
    return { judge: "stray", deltaMs: 0 };
  }
  const note = s.notes[at] as RhythmNote;
  const deltaMs = s.elapsedMs - note.t;
  s.notes.splice(at, 1);
  const judge: RhythmJudge = nearest <= w.perfectMs ? "perfect" : "good";
  if (judge === "perfect") s.perfects += 1;
  else s.goods += 1;
  s.streak += 1;
  s.best = Math.max(s.best, s.streak);
  rescore(s);
  say(s, judge, deltaMs);
  return { judge, deltaMs };
}

// ---- the band ----

// The most a song can score: every note a Perfect.
export const maxScore = (s: RhythmState): number => r.perfectPoints * s.times.length;

// Gold and Silver are whole percents of `maxScore`, written per stage in `data/rhythm.ts`.
export function rhythmBandOf(s: RhythmState): Band {
  const row = r.rows[s.stage];
  const top = maxScore(s);
  return s.score * 100 >= top * row.goldPct ? "gold" : s.score * 100 >= top * row.silverPct ? "silver" : "bronze";
}

// ---- words ----

// The one line over the track, in words: "Perfect, 12 ms early", "Good, 95 ms late", "Miss", "No note, -30".
export function saidLine(said: RhythmSaid): string {
  if (said.judge === "miss") return "Miss";
  if (said.judge === "stray") return `No note, -${r.strayCost}`;
  const word = said.judge === "perfect" ? "Perfect" : "Good";
  if (said.deltaMs === 0) return `${word}, on the beat`;
  return `${word}, ${Math.abs(said.deltaMs)} ms ${said.deltaMs < 0 ? "early" : "late"}`;
}
