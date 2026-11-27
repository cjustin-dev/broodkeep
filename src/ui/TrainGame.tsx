// The training session over the screen (Bug Catch, docs/adult-a3-plan.md section 10; Rhythm Grove and Stack & Balance, docs/adult-a4-plan.md sections 2 and 6): the start card, the run and the result card. Adult Mode only.
// The rules are game/training.ts, game/rhythm.ts and game/stack.ts. `Game` (ui/game.ts) holds the session and hears only the pick, the start, the finish and the close: pause, resume, every catch, every tap, every miss and
// every frame stay here (the engine's own functions on `game.training.run`, the numbers and the places of the bugs or the notes written into the page through refs), so a session never touches the save and never
// makes the app redraw 60 times a second.
import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import { faceSprite } from "../art/face";
import { goldenBug, icons } from "../art/sprites";
import type { IconName } from "../art/sprites";
import { getForm } from "../data/forms";
import { rhythmTuning, timingWindows } from "../data/rhythm";
import { stackTuning } from "../data/stack";
import { trainGameIds, trainGames, trainTuning } from "../data/training";
import type { TrainGameId, TrainStage } from "../data/training";
import { saidLine, stepRhythm, tapRhythm } from "../game/rhythm";
import type { RhythmState } from "../game/rhythm";
import { blockX, dropStack, heightOf, perfectWindowMs, saidLine as stackSaidLine, scoreOf, stepStack } from "../game/stack";
import type { StackState } from "../game/stack";
import { localDay } from "../game/time";
import { catchBug, missTap, pause, resultLines, resume, startLine, step, trainedToday } from "../game/training";
import type { BugCatchState } from "../game/training";
import type { Game } from "./game";
import { Pic } from "./Icon";

// What each game says on its start card, in plain words (the numbers come from the tuning; Stack & Balance's window depends on the stage).
function blurbOf(game: TrainGameId, stage: TrainStage): string {
  switch (game) {
    case "bug":
      return "Tap the bugs before they go. A golden bug is worth 3 times, and 5 catches in a row score double. A tap that misses costs no points.";
    case "rhythm":
      return `Tap when a note reaches the line, anywhere on the track. Perfect is within ${timingWindows.perfectMs} ms, Good within ${timingWindows.goodMs} ms. A tap with no note near it costs ${rhythmTuning.strayCost} points.`;
    default:
      return `Tap to drop the block onto the stack. Perfect is within ${perfectWindowMs(stage)} ms of lining up (less on a narrow block) and keeps the block wide; two in a row make it wider again. A good drop is trimmed to what overlaps. One bad drop is forgiven; a second makes the stack fall and ends the run. The longer it stands, the more it scores.`;
  }
}

// The picker button's picture for each game.
const pickerIcons: Record<TrainGameId, IconName> = { bug: "bug", rhythm: "note", stack: "stack" };

function StartCard({ game }: { game: Game }) {
  const goRef = useRef<HTMLButtonElement>(null);
  useEffect(() => goRef.current?.focus(), []);
  const c = game.save.creature;
  const picked = game.training?.game ?? "bug";
  const { name, stat, statName } = trainGames[picked];
  const count = c ? trainedToday(c, stat, localDay(game.now())).count : 0;
  return (
    <>
      <header class="panel-head">
        <h2>{name}</h2>
        <button class="btn small" onClick={() => game.closeTraining()}>
          Close
        </button>
      </header>
      <div class="train-picker" role="group" aria-label="Training game">
        {trainGameIds.map((id) => (
          <button key={id} class="btn small" aria-pressed={picked === id} onClick={() => game.pickTrainGame(id)}>
            <Pic sprite={icons[pickerIcons[id]]} id={`icon:${pickerIcons[id]}`} px={24} />
            {trainGames[id].name}
          </button>
        ))}
      </div>
      <p class="hint">
        {blurbOf(picked, game.training?.stage ?? "adult")} It trains {statName}.
      </p>
      <p class="train-reward">{startLine(picked, count)}</p>
      <p class="hint">
        {trainTuning.sessionMs / 1000} seconds. You can always play, with no energy cost: after {trainTuning.full + trainTuning.half} {statName} sessions in a day it pays Bond XP only.
      </p>
      <button class="btn wide" ref={goRef} onClick={() => game.beginTraining()}>
        Go
      </button>
    </>
  );
}

// The numbers shown while the run goes: seconds left, the score and the streak.
const secondsLeft = (run: { lengthMs: number; elapsedMs: number }): number => Math.max(0, Math.ceil((run.lengthMs - run.elapsedMs) / 1000));

function Run({ game, run }: { game: Game; run: BugCatchState }) {
  const [, setVersion] = useState(0);
  const bump = (): void => setVersion((v) => v + 1); // the list of bugs or the pause changed: draw the component again
  const fieldRef = useRef<HTMLDivElement>(null);
  const bugEls = useRef(new Map<number, HTMLButtonElement>());
  const timeEl = useRef<HTMLElement | null>(null);
  const scoreEl = useRef<HTMLElement | null>(null);
  const streakEl = useRef<HTMLElement | null>(null);

  // Write each bug's place and the three numbers into the page. Positions are in the engine's field units; the field is square, so one scale serves both axes.
  const place = (): void => {
    const field = fieldRef.current;
    if (!field) return;
    const scale = field.clientWidth / trainTuning.field;
    for (const b of run.bugs) {
      const el = bugEls.current.get(b.id);
      if (el) el.style.transform = `translate(${b.x * scale}px, ${b.y * scale}px) translate(-50%, -50%)`;
    }
    if (timeEl.current) timeEl.current.textContent = String(secondsLeft(run));
    if (scoreEl.current) scoreEl.current.textContent = String(run.score);
    if (streakEl.current) streakEl.current.textContent = String(run.streak);
  };
  useLayoutEffect(place); // after every draw, so a bug that has just appeared is put in its place before it is painted

  // The frames: the time since the last frame goes to the engine (it counts at most 100 ms of it and moves in whole steps). The run is paid once, when it is over.
  useEffect(() => {
    let raf = 0;
    let last: number | null = null;
    const frame = (now: number): void => {
      const dt = last === null ? 0 : now - last;
      last = now;
      if (step(run, dt)) bump();
      place();
      if (run.over) {
        game.finishTraining();
        return;
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [run]);

  // A page that is hidden stops the run; a tap on the Paused card goes on.
  useEffect(() => {
    const onVisibility = (): void => {
      if (document.visibilityState === "hidden" && !run.over) {
        pause(run);
        bump();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [run]);

  const caught = (id: number): void => {
    if (catchBug(run, id) !== null) {
      bump();
      place();
    }
  };

  // A tap on the field that is not on a bug is a miss (the bug's own handler stops its tap here, and this ignores a bug target all the same).
  const onField = (e: PointerEvent): void => {
    if ((e.target as Element).closest("[data-bug]")) return;
    if (missTap(run)) place();
  };

  return (
    <div class="train-play">
      <div class="train-side">
        <p class="train-stats">
          <span>
            Time <b ref={timeEl}>{secondsLeft(run)}</b>
          </span>
          <span>
            Score <b ref={scoreEl}>{run.score}</b>
          </span>
          <span>
            Streak <b ref={streakEl}>{run.streak}</b>
          </span>
        </p>
        <div class="train-buttons">
          <button
            class="btn small"
            onClick={() => {
              pause(run);
              bump();
            }}
          >
            Pause
          </button>
          <button class="btn small" onClick={() => game.closeTraining()}>
            Quit
          </button>
        </div>
      </div>
      <div class="train-field" ref={fieldRef} onPointerDown={onField}>
        {run.bugs.map((b) => (
          <button
            key={b.id}
            class="bug"
            data-bug
            data-kind={b.golden ? "golden" : "bug"}
            aria-label={b.golden ? "Golden bug" : "Bug"}
            ref={(el) => {
              if (el) bugEls.current.set(b.id, el);
              else bugEls.current.delete(b.id);
            }}
            onPointerDown={(e) => {
              e.stopPropagation(); // a catch is not also a miss on the field behind it
              caught(b.id);
            }}
            onClick={(e) => {
              if (e.detail === 0) caught(b.id); // Enter or Space on a focused bug (a pointer's catch happened on the press)
            }}
          >
            <Pic sprite={b.golden ? goldenBug : icons.bug} id={b.golden ? "bug:golden" : "icon:bug"} px={48} class="bug-pic" />
          </button>
        ))}
        {run.paused && (
          <button
            class="train-paused"
            onClick={() => {
              resume(run);
              bump();
            }}
          >
            Paused. Tap to go on.
          </button>
        )}
      </div>
    </div>
  );
}

// Where a note is on the track, as a share of the track's height: it enters at the top `approachMs` before its time and is on the line at its time (the line is `LINE` of the way down).
const LINE = 0.74;

// Rhythm Grove's run: the notes come down the track and a tap anywhere on it is a tap on the beat. The notes' places, the three numbers, the word over the line and the creature's hop are written
// from the frame loop through refs; the component draws again only when the list of notes changes or the run is paused or goes on.
function RhythmRun({ game, run }: { game: Game; run: RhythmState }) {
  const [, setVersion] = useState(0);
  const bump = (): void => setVersion((v) => v + 1);
  const [hops, setHops] = useState(0); // counts the hits: a new key on the face starts its hop again
  const trackRef = useRef<HTMLDivElement>(null);
  const noteEls = useRef(new Map<number, HTMLSpanElement>());
  const timeEl = useRef<HTMLElement | null>(null);
  const scoreEl = useRef<HTMLElement | null>(null);
  const streakEl = useRef<HTMLElement | null>(null);
  const saidEl = useRef<HTMLParagraphElement>(null);
  const shown = useRef(run.said?.n ?? 0); // the last thing said that the page has written
  const c = game.save.creature;

  const place = (): void => {
    const track = trackRef.current;
    if (!track) return;
    const height = track.clientHeight;
    for (const n of run.notes) {
      const el = noteEls.current.get(n.id);
      if (el) el.style.transform = `translate(-50%, ${(1 - (n.t - run.elapsedMs) / rhythmTuning.approachMs) * LINE * height}px) translateY(-50%)`;
    }
    if (timeEl.current) timeEl.current.textContent = String(secondsLeft(run));
    if (scoreEl.current) scoreEl.current.textContent = String(run.score);
    if (streakEl.current) streakEl.current.textContent = String(run.streak);
    const said = run.said;
    if (said && said.n !== shown.current && saidEl.current) {
      shown.current = said.n;
      saidEl.current.textContent = saidLine(said);
      saidEl.current.dataset.judge = said.judge;
      saidEl.current.dataset.delta = String(said.deltaMs);
      if (said.judge === "perfect" || said.judge === "good") setHops((h) => h + 1);
    }
  };
  useLayoutEffect(place);

  useEffect(() => {
    let raf = 0;
    let last: number | null = null;
    const frame = (now: number): void => {
      const dt = last === null ? 0 : now - last;
      last = now;
      if (stepRhythm(run, dt)) bump();
      place();
      if (run.over) {
        game.finishTraining();
        return;
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [run]);

  useEffect(() => {
    const onVisibility = (): void => {
      if (document.visibilityState === "hidden" && !run.over) {
        pause(run);
        bump();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [run]);

  // A tap (the press, not the release: the lowest delay). Pressing Enter or Space on the focused pad is a tap too (a pointer's tap happened on the press).
  const tapped = (): void => {
    const tap = tapRhythm(run);
    if (tap && tap.judge !== "stray") bump(); // a judged note has left the track
    place();
  };

  const face = c ? faceSprite(getForm(c.formId), "open") : null;

  return (
    <div class="train-play">
      <div class="train-side">
        <p class="train-stats">
          <span>
            Time <b ref={timeEl}>{secondsLeft(run)}</b>
          </span>
          <span>
            Score <b ref={scoreEl}>{run.score}</b>
          </span>
          <span>
            Streak <b ref={streakEl}>{run.streak}</b>
          </span>
        </p>
        <div class="train-buttons">
          <button
            class="btn small"
            onClick={() => {
              pause(run);
              bump();
            }}
          >
            Pause
          </button>
          <button class="btn small" onClick={() => game.closeTraining()}>
            Quit
          </button>
        </div>
      </div>
      <div class="train-field rhythm-track" data-field={run.field} ref={trackRef}>
        <div class="rhythm-lane" aria-hidden="true" />
        <div class="rhythm-line" aria-hidden="true" style={{ top: `${LINE * 100}%` }} />
        {run.notes.map((n) => (
          <span
            key={n.id}
            class="rhythm-note"
            data-note
            ref={(el) => {
              if (el) noteEls.current.set(n.id, el);
              else noteEls.current.delete(n.id);
            }}
          >
            <Pic sprite={icons.note} id="icon:note" px={40} class="rhythm-note-pic" />
          </span>
        ))}
        <p class="rhythm-said" ref={saidEl} style={{ top: `${LINE * 100 - 14}%` }} />
        {face && (
          <span class="rhythm-face" key={hops} data-hop={hops > 0 ? "yes" : undefined} aria-hidden="true">
            <Pic sprite={face} id={`face:open:${c!.formId}`} px={Math.round(face.rows.length * 1.5)} />
          </span>
        )}
        <button
          class="rhythm-pad"
          aria-label="Tap on the beat"
          onPointerDown={() => tapped()}
          onClick={(e) => {
            if (e.detail === 0) tapped();
          }}
        />
        {run.paused && (
          <button
            class="train-paused"
            onClick={() => {
              resume(run);
              bump();
            }}
          >
            Paused. Tap to go on.
          </button>
        )}
      </div>
    </div>
  );
}

// Stack & Balance's run: the block slides across above the stack and a tap anywhere on the field drops it. The stack's blocks are drawn from the state's list (the page draws again when a block is
// placed or the run is paused or goes on); the moving block, the three numbers and the word over the field are written from the frame loop through refs. The stack sits on the floor until it is
// tall enough, then the top block stays where it is and the rest scroll down and out of the field.
const pct = (units: number): string => `${(units / trainTuning.field) * 100}%`;
const ROOM = Math.floor((trainTuning.field - stackTuning.laneTop) / stackTuning.blockH); // how many blocks the field has room to show

function StackRun({ game, run }: { game: Game; run: StackState }) {
  const [, setVersion] = useState(0);
  const bump = (): void => setVersion((v) => v + 1);
  const moverEl = useRef<HTMLSpanElement>(null);
  const timeEl = useRef<HTMLElement | null>(null);
  const scoreEl = useRef<HTMLElement | null>(null);
  const heightEl = useRef<HTMLElement | null>(null);
  const saidEl = useRef<HTMLParagraphElement>(null);
  const shown = useRef(run.said?.n ?? 0); // the last thing said that the page has written

  const place = (): void => {
    const mover = moverEl.current;
    if (mover) {
      mover.style.visibility = run.elapsedMs >= run.readyAt && !run.over ? "visible" : "hidden"; // the next block has not come yet
      mover.style.left = pct(blockX(run) - run.w / 2);
      mover.style.width = pct(run.w);
    }
    if (timeEl.current) timeEl.current.textContent = String(secondsLeft(run));
    if (scoreEl.current) scoreEl.current.textContent = String(scoreOf(run));
    if (heightEl.current) heightEl.current.textContent = String(heightOf(run));
    const said = run.said;
    if (said && said.n !== shown.current && saidEl.current) {
      shown.current = said.n;
      saidEl.current.textContent = stackSaidLine(said);
      saidEl.current.dataset.judge = said.judge;
    }
  };
  useLayoutEffect(place);

  useEffect(() => {
    let raf = 0;
    let last: number | null = null;
    const frame = (now: number): void => {
      const dt = last === null ? 0 : now - last;
      last = now;
      stepStack(run, dt);
      place();
      if (run.over) {
        game.finishTraining();
        return;
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [run]);

  useEffect(() => {
    const onVisibility = (): void => {
      if (document.visibilityState === "hidden" && !run.over) {
        pause(run);
        bump();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [run]);

  // A tap (the press, not the release: the lowest delay). Pressing Enter or Space on the focused pad is a drop too (a pointer's drop happened on the press).
  const dropped = (): void => {
    if (dropStack(run)) bump(); // a block was placed, lost or the stack fell: draw the list again
    place();
  };

  const top = Math.max(stackTuning.laneTop, trainTuning.field - stackTuning.blockH * run.blocks.length); // where the top block's upper edge is
  const drawn = run.blocks.slice(-ROOM).reverse(); // the top block first

  return (
    <div class="train-play">
      <div class="train-side">
        <p class="train-stats">
          <span>
            Time <b ref={timeEl}>{secondsLeft(run)}</b>
          </span>
          <span>
            Score <b ref={scoreEl}>{scoreOf(run)}</b>
          </span>
          <span>
            Height <b ref={heightEl}>{heightOf(run)}</b>
          </span>
        </p>
        <div class="train-buttons">
          <button
            class="btn small"
            onClick={() => {
              pause(run);
              bump();
            }}
          >
            Pause
          </button>
          <button class="btn small" onClick={() => game.closeTraining()}>
            Quit
          </button>
        </div>
      </div>
      <div class="train-field stack-field">
        {drawn.map((b, i) => {
          const index = run.blocks.length - 1 - i;
          return (
            <span
              key={index}
              class="stack-block"
              data-base={index === 0 ? "yes" : undefined}
              aria-hidden="true"
              style={{ left: pct(b.x - b.w / 2), width: pct(b.w), top: pct(top + i * stackTuning.blockH), height: pct(stackTuning.blockH) }}
            />
          );
        })}
        <span class="stack-mover" ref={moverEl} aria-hidden="true" />
        <p class="stack-said" ref={saidEl} />
        <button
          class="stack-pad"
          aria-label="Drop the block"
          onPointerDown={() => dropped()}
          onClick={(e) => {
            if (e.detail === 0) dropped();
          }}
        />
        {run.paused && (
          <button
            class="train-paused"
            onClick={() => {
              resume(run);
              bump();
            }}
          >
            Paused. Tap to go on.
          </button>
        )}
      </div>
    </div>
  );
}

function ResultCard({ game }: { game: Game }) {
  const doneRef = useRef<HTMLButtonElement>(null);
  useEffect(() => doneRef.current?.focus(), []);
  const result = game.training?.result;
  return (
    <>
      <header class="panel-head">
        <h2>{trainGames[game.training?.game ?? "bug"].name}</h2>
      </header>
      <ul class="train-lines">{result && resultLines(result).map((line) => <li key={line}>{line}</li>)}</ul>
      <button class="btn wide" ref={doneRef} onClick={() => game.closeTraining()}>
        Done
      </button>
    </>
  );
}

export function TrainGame({ game }: { game: Game }) {
  const t = game.training;
  if (!t) return null;
  return (
    <section class="panel" role="dialog" aria-modal="true" aria-label={trainGames[t.game].name}>
      <div class="panel-body train">
        {t.phase === "ready" && <StartCard game={game} />}
        {t.phase === "playing" && t.run && t.game === "bug" && <Run game={game} run={t.run as BugCatchState} />}
        {t.phase === "playing" && t.run && t.game === "rhythm" && <RhythmRun game={game} run={t.run as RhythmState} />}
        {t.phase === "playing" && t.run && t.game === "stack" && <StackRun game={game} run={t.run as StackState} />}
        {t.phase === "done" && <ResultCard game={game} />}
      </div>
    </section>
  );
}
