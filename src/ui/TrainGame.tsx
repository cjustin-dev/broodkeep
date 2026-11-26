// The training session over the screen (Bug Catch, docs/adult-a3-plan.md section 10): the start card, the run and the result card. Adult Mode only.
// The rules are game/training.ts. `Game` (ui/game.ts) holds the session and hears only the start, the finish and the close: pause, resume, every catch, every miss and every frame stay here
// (the engine's own functions on `game.training.run`, the numbers and the bugs' places written into the page through refs), so a session never touches the save and never makes the app redraw 60 times a second.
import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import { goldenBug, icons } from "../art/sprites";
import { trainTuning } from "../data/training";
import { localDay } from "../game/time";
import { catchBug, missTap, pause, resultLines, resume, startLine, step, trainedToday } from "../game/training";
import type { BugCatchState } from "../game/training";
import type { Game } from "./game";
import { Pic } from "./Icon";

function StartCard({ game }: { game: Game }) {
  const goRef = useRef<HTMLButtonElement>(null);
  useEffect(() => goRef.current?.focus(), []);
  const c = game.save.creature;
  const count = c ? trainedToday(c, "spd", localDay(game.now())).count : 0;
  return (
    <>
      <header class="panel-head">
        <h2>Bug Catch</h2>
        <button class="btn small" onClick={() => game.closeTraining()}>
          Close
        </button>
      </header>
      <p class="hint">
        Tap the bugs before they go. A golden bug is worth 3 times, and 5 catches in a row score double. A tap that misses costs no points. It trains Speed.
      </p>
      <p class="train-reward">{startLine(count)}</p>
      <p class="hint">{trainTuning.sessionMs / 1000} seconds. You can always play, with no energy cost: after 6 Speed sessions in a day it pays Bond XP only.</p>
      <button class="btn wide" ref={goRef} onClick={() => game.beginTraining()}>
        Go
      </button>
    </>
  );
}

// The numbers shown while the run goes: seconds left, the score and the streak.
const secondsLeft = (run: BugCatchState): number => Math.max(0, Math.ceil((run.lengthMs - run.elapsedMs) / 1000));

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

function ResultCard({ game }: { game: Game }) {
  const doneRef = useRef<HTMLButtonElement>(null);
  useEffect(() => doneRef.current?.focus(), []);
  const result = game.training?.result;
  return (
    <>
      <header class="panel-head">
        <h2>Bug Catch</h2>
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
    <section class="panel" role="dialog" aria-modal="true" aria-label="Bug Catch">
      <div class="panel-body train">
        {t.phase === "ready" && <StartCard game={game} />}
        {t.phase === "playing" && t.run && <Run game={game} run={t.run} />}
        {t.phase === "done" && <ResultCard game={game} />}
      </div>
    </section>
  );
}
